import { db } from '../lib/db';
import { STATE_SCHEMA_VERSION } from '../lib/stateSchema';
import { applyStateUpdate } from './stateManager';

const STATE_TAG = /<state_update>([\s\S]*?)<\/state_update>/g;

async function recordStateError(characterUuid: string, error: unknown): Promise<void> {
  const timestamp = Date.now();
  const message = error instanceof Error ? error.message : 'unknown state update error';
  console.error('State update rejected', error);
  await db.settings.put({
    key: `stateError:${characterUuid}:${timestamp}`,
    value: { timestamp, message, schemaVersion: STATE_SCHEMA_VERSION },
  });
}

/**
 * Applies one final state package atomically. Invalid packages remain visible in
 * the narrative for diagnosis, while the last valid game state is preserved.
 */
export async function parseAndApplyState(fullText: string, characterUuid: string): Promise<string> {
  const matches = [...fullText.matchAll(STATE_TAG)];
  if (matches.length === 0) return fullText;

  try {
    if (matches.length !== 1) throw new Error('response must contain exactly one state_update tag');
    const match = matches[0];
    const tagStart = match.index ?? 0;
    const tagEnd = tagStart + match[0].length;
    if (fullText.slice(tagEnd).trim()) {
      throw new Error('state_update must be the final response block');
    }
    const rawUpdate = JSON.parse(match[1]);
    await applyStateUpdate(characterUuid, rawUpdate);
    return fullText.slice(0, tagStart).trim();
  } catch (error) {
    await recordStateError(characterUuid, error);
    return fullText;
  }
}
