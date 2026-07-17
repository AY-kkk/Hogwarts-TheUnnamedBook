import { db, type Character, type GenerationMetadata } from '../lib/db';
import { STATE_SCHEMA_VERSION } from '../lib/stateSchema';

export const MAX_CHARACTER_SLOTS = 3;

export class CharacterSlotLimitError extends Error {
  constructor() {
    super(`角色槽位已满（最多 ${MAX_CHARACTER_SLOTS} 个）`);
    this.name = 'CharacterSlotLimitError';
  }
}

export async function assertCharacterSlotAvailable(): Promise<void> {
  if ((await db.character.count()) >= MAX_CHARACTER_SLOTS) {
    throw new CharacterSlotLimitError();
  }
}

export async function createCharacterWithOpeningLog(
  character: Character,
  openingNarrative: string,
  generation?: GenerationMetadata
): Promise<{ characterId: number; logId: number }> {
  if (!character.uuid) throw new Error('新角色缺少本地 UUID');

  return db.transaction('rw', [db.character, db.logs, db.settings], async () => {
    if ((await db.character.count()) >= MAX_CHARACTER_SLOTS) {
      throw new CharacterSlotLimitError();
    }

    const now = Date.now();
    const characterId = await db.character.add({
      ...character,
      lastPlayed: now,
    });
    const logId = await db.logs.add({
      characterUuid: character.uuid,
      turn_id: now,
      content: openingNarrative,
      type: 'ai',
      timestamp: now,
      generation,
    });
    await db.settings.put({ key: 'stateSchemaVersion', value: STATE_SCHEMA_VERSION });
    return { characterId, logId };
  });
}

export async function deleteCharacterData(characterId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.character, db.logs, db.memories, db.world_log, db.settings],
    async () => {
      const character = await db.character.get(characterId);
      if (!character) return;
      if (!character.uuid) {
        throw new Error('无法安全删除：该旧角色缺少 UUID，请重新加载后再试');
      }

      const characterUuid = character.uuid;
      await Promise.all([
        db.logs.where('characterUuid').equals(characterUuid).delete(),
        db.memories.where('characterUuid').equals(characterUuid).delete(),
        db.world_log.where('characterUuid').equals(characterUuid).delete(),
        db.settings
          .filter((setting) =>
            setting.key === `pensieveResume:${characterUuid}`
            || setting.key.startsWith(`stateEvent:${characterUuid}:`)
            || setting.key.startsWith(`stateError:${characterUuid}:`)
          )
          .delete(),
      ]);
      await db.character.delete(characterId);
    }
  );
}

export async function touchCharacter(characterId: number): Promise<void> {
  const updated = await db.character.update(characterId, { lastPlayed: Date.now() });
  if (updated === 0) throw new Error('无法更新最近游玩时间：角色不存在');
}
