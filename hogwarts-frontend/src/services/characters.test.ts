import Dexie from 'dexie';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, type Character } from '../lib/db';
import {
  assertCharacterSlotAvailable,
  CharacterSlotLimitError,
  deleteCharacterData,
} from './characters';
import { getActiveTimelineLogs } from './pensieveResume';

function buildCharacter(name: string, uuid: string): Character {
  return {
    uuid,
    name,
    house: 'Unsorted',
    status: {
      hp: 100,
      mp: 50,
      gold: 10,
      level: 1,
      exp: 0,
      attributes: { knowledge: 10, courage: 10, stamina: 10 },
      inventory: [],
      location: 'Prologue',
    },
    summary: `${name} summary`,
  };
}

describe('character data isolation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => db.close());

  it('blocks creation when all three character slots are occupied', async () => {
    await db.character.bulkAdd([
      buildCharacter('A', 'uuid-a'),
      buildCharacter('B', 'uuid-b'),
      buildCharacter('C', 'uuid-c'),
    ]);

    await expect(assertCharacterSlotAvailable()).rejects.toBeInstanceOf(CharacterSlotLimitError);
  });

  it('deletes only the selected character and its related records', async () => {
    const targetId = await db.character.add(buildCharacter('Target', 'uuid-target'));
    const survivorId = await db.character.add(buildCharacter('Survivor', 'uuid-survivor'));

    await db.logs.bulkAdd([
      { characterUuid: 'uuid-target', turn_id: 1, content: 'target log', type: 'user', timestamp: 1 },
      { characterUuid: 'uuid-survivor', turn_id: 2, content: 'survivor log', type: 'user', timestamp: 2 },
    ]);
    await db.memories.bulkAdd([
      { characterUuid: 'uuid-target', content: 'target memory', role: 'user', timestamp: 1 },
      { characterUuid: 'uuid-survivor', content: 'survivor memory', role: 'user', timestamp: 2 },
    ]);
    await db.world_log.bulkAdd([
      { characterUuid: 'uuid-target', event_name: 'target event', description: '', timestamp: 1 },
      { characterUuid: 'uuid-survivor', event_name: 'survivor event', description: '', timestamp: 2 },
    ]);
    await db.settings.bulkPut([
      { key: 'pensieveResume:uuid-target', value: { baseLogId: 1 } },
      { key: 'pensieveResume:uuid-survivor', value: { baseLogId: 2 } },
    ]);

    await deleteCharacterData(targetId);

    expect(await db.character.get(targetId)).toBeUndefined();
    expect(await db.character.get(survivorId)).toMatchObject({ uuid: 'uuid-survivor' });
    expect(await db.logs.where('characterUuid').equals('uuid-target').count()).toBe(0);
    expect(await db.memories.where('characterUuid').equals('uuid-target').count()).toBe(0);
    expect(await db.world_log.where('characterUuid').equals('uuid-target').count()).toBe(0);
    expect(await db.settings.get('pensieveResume:uuid-target')).toBeUndefined();
    expect(await db.logs.where('characterUuid').equals('uuid-survivor').count()).toBe(1);
    expect(await db.memories.where('characterUuid').equals('uuid-survivor').count()).toBe(1);
    expect(await db.world_log.where('characterUuid').equals('uuid-survivor').count()).toBe(1);
    expect(await db.settings.get('pensieveResume:uuid-survivor')).toBeDefined();
  });

  it('returns only the active character timeline', async () => {
    await db.logs.bulkAdd([
      { characterUuid: 'uuid-a', turn_id: 1, content: 'A only', type: 'user', timestamp: 1 },
      { characterUuid: 'uuid-b', turn_id: 2, content: 'B only', type: 'user', timestamp: 2 },
      { turn_id: 3, content: 'legacy orphan', type: 'system', timestamp: 3 },
    ]);

    const logs = await getActiveTimelineLogs('uuid-a');

    expect(logs.map((log) => log.content)).toEqual(['A only']);
  });
});

describe('IndexedDB v5 migration', () => {
  beforeEach(async () => {
    await db.delete();
  });

  afterAll(() => db.close());

  async function seedLegacyDatabase(characterNames: string[]): Promise<void> {
    const legacy = new Dexie('HogwartsDB');
    legacy.version(4).stores({
      settings: 'key',
      character: '++id, uuid, name, lastPlayed, synced',
      logs: '++id, characterUuid, turn_id, type, timestamp',
      memories: '++id, characterUuid, timestamp',
      world_log: '++id, event_name, timestamp',
    });
    await legacy.open();
    await legacy.table('character').bulkAdd(
      characterNames.map((name) => {
        const character = buildCharacter(name, '');
        delete character.uuid;
        return character;
      })
    );
    await legacy.table('logs').add({ turn_id: 1, content: 'legacy log', type: 'user', timestamp: 1 });
    await legacy.table('memories').add({ content: 'legacy memory', role: 'user', timestamp: 1 });
    await legacy.table('world_log').add({ event_name: 'legacy event', description: '', timestamp: 1 });
    legacy.close();
  }

  it('assigns unscoped legacy data when there is exactly one possible owner', async () => {
    await seedLegacyDatabase(['Legacy']);
    await db.open();

    const character = await db.character.toCollection().first();
    expect(character?.uuid).toBeTruthy();
    expect((await db.logs.toCollection().first())?.characterUuid).toBe(character?.uuid);
    expect((await db.memories.toCollection().first())?.characterUuid).toBe(character?.uuid);
    expect((await db.world_log.toCollection().first())?.characterUuid).toBe(character?.uuid);
  });

  it('preserves ambiguous legacy records as unscoped orphans', async () => {
    await seedLegacyDatabase(['Legacy A', 'Legacy B']);
    await db.open();

    const characters = await db.character.toArray();
    expect(characters).toHaveLength(2);
    expect(characters.every((character) => Boolean(character.uuid))).toBe(true);
    expect((await db.logs.toCollection().first())?.characterUuid).toBeUndefined();
    expect((await db.memories.toCollection().first())?.characterUuid).toBeUndefined();
    expect((await db.world_log.toCollection().first())?.characterUuid).toBeUndefined();
  });
});
