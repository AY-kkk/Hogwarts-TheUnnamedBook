import { fetchEventSource } from '@microsoft/fetch-event-source';
import { db } from '../lib/db';
import { getActiveTimelineLogs } from './pensieveResume';
import { apiUrl } from '../config/api';
import { requirePrivacyConsent } from './privacy';

const API_URL = apiUrl('/api/chat');
const CHAPTER_TITLE_URL = apiUrl('/api/chapter/title');

export async function generateChapterTitle(userInput: string, contextSummary: string, signal?: AbortSignal) {
  await requirePrivacyConsent();
  const resp = await fetch(CHAPTER_TITLE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ user_input: userInput, context_summary: contextSummary })
  });
  if (!resp.ok) {
    throw new Error(`Title Error: ${resp.statusText}`);
  }
  const data = (await resp.json()) as { title?: string };
  return data.title || '';
}

export async function sendChatRequest(
  userInput: string, 
  characterUuid: string,
  onMessage: (chunk: string) => void,
  onComplete: () => void,
  onError: (err: unknown) => void,
  options?: { signal?: AbortSignal }
) {
  try {
    await requirePrivacyConsent();

    // 1. Assemble Context
    const character = await db.character.where('uuid').equals(characterUuid).first();
    if (!character) throw new Error('找不到当前角色，已停止发送以避免混用其他存档');

    const recentLogs = (await getActiveTimelineLogs(characterUuid)).slice(-10);
    const worldLog = await db.world_log
      .where('characterUuid')
      .equals(characterUuid)
      .sortBy('timestamp');

    const context = {
      summary: character?.summary || "New Game",
      status_snapshot: character?.status || {},
      recent_logs: recentLogs.reverse().map(l => ({ role: l.type, content: l.content })),
      world_log: worldLog.map(w => w.event_name)
    };

    // 2. Send Request (SSE)
    await fetchEventSource(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: options?.signal,
      body: JSON.stringify({
        user_input: userInput,
        context: context,
        api_key: "demo-key"
      }),
      async onopen(response) {
        if (response.ok) {
          return; // everything's good
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          // client-side errors are usually non-retriable:
          throw new Error(`Client Error: ${response.statusText}`);
        } else {
          throw new Error(`Server Error: ${response.statusText}`);
        }
      },
      onmessage(msg) {
        // if the server emits an error message, throw an exception
        // so it gets handled by the onerror callback below:
        if (msg.event === 'status') {
          return;
        }
        if (msg.event === 'error') {
          throw new Error(msg.data || 'Server Error');
        }
        if (msg.event === 'FatalError') {
          throw new Error(msg.data);
        }
        if (msg.data) {
           onMessage(msg.data);
        }
      },
      onclose() {
        onComplete();
      },
      onerror(err) {
        // fetch-event-source retries by default if we don't throw
        // We want to stop retrying on fatal errors
        throw err; 
      }
    });
  } catch (err) {
    onError(err);
  }
}
