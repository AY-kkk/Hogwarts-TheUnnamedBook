import { fetchEventSource } from '@microsoft/fetch-event-source';
import { db } from '../lib/db';
import { getActiveTimelineLogs } from './pensieveResume';
import { apiUrl } from '../config/api';
import { requirePrivacyConsent } from './privacy';
import { apiFetch, getApiErrorMessage, getSessionToken } from './session';
import type { GenerationMetadata } from '../lib/db';
import { requireAgeAcknowledgement } from './safety';

const API_URL = apiUrl('/api/chat');

export async function generateChapterTitle(
  userInput: string,
  contextSummary: string,
  characterUuid: string,
  signal?: AbortSignal
) {
  await requireAgeAcknowledgement();
  await requirePrivacyConsent();
  const resp = await apiFetch('/api/chapter/title', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Character-ID': characterUuid,
    },
    signal,
    body: JSON.stringify({ user_input: userInput, context_summary: contextSummary })
  });
  if (!resp.ok) {
    throw new Error(await getApiErrorMessage(resp, `章节标题生成失败（${resp.status}）`));
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
  options?: {
    signal?: AbortSignal;
    onMetadata?: (metadata: GenerationMetadata) => void | Promise<void>;
  }
) {
  try {
    await requireAgeAcknowledgement();
    await requirePrivacyConsent();
    const sessionToken = await getSessionToken();

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
        'Authorization': `Bearer ${sessionToken}`,
        'X-Character-ID': characterUuid,
      },
      signal: options?.signal,
      body: JSON.stringify({
        user_input: userInput,
        context: context
      }),
      async onopen(response) {
        if (response.ok) {
          return; // everything's good
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(await getApiErrorMessage(response, `请求被拒绝（${response.status}）`));
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
        if (msg.event === 'metadata') {
          try {
            const result = options?.onMetadata?.(JSON.parse(msg.data) as GenerationMetadata);
            void Promise.resolve(result).catch((error) => {
              console.error('Could not save generation metadata', error);
            });
          } catch (error) {
            console.error('Invalid generation metadata', error);
          }
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
