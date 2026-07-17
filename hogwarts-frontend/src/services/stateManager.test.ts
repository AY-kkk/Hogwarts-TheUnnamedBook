import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type Character } from '../lib/db';
import { createInitialGameStatus } from '../lib/stateSchema';
import { parseAndApplyState } from './tagParser';
import { applyStateUpdate, StateValidationError } from './stateManager';

function characterFixture(): Character {
  return {
    uuid: 'character-state-test',
    name: 'State Tester',
    era: '救世主时代',
    house: 'Unsorted',
    status: createInitialGameStatus('救世主时代'),
    summary: 'test',
  };
}

describe('atomic State Manager', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.character.add(characterFixture());
  });

  afterAll(() => db.close());

  it('applies a complete incremental update in one transaction', async () => {
    const result = await applyStateUpdate('character-state-test', {
      event_id: 'turn-001-update',
      status: {
        hp: 90,
        attributes: { knowledge: 16 },
        current_week: 1,
      },
      house: 'Ravenclaw',
      inventory_events: [{ op: 'add', item: 'Wand' }],
      spells: { Lumos: { level: 1, desc: 'A steady light' } },
      relationships: { Rowan: { level: 2, tag: 'Friend', desc: 'Shared a compartment' } },
      world_log_add: 'The letter arrived one day early',
    });

    const character = await db.character.where('uuid').equals('character-state-test').first();
    expect(result).toBe('applied');
    expect(character?.status.hp).toBe(90);
    expect(character?.status.attributes.knowledge).toBe(16);
    expect(character?.status.inventory).toEqual(['Wand']);
    expect(character?.house).toBe('Ravenclaw');
    expect(character?.spells?.Lumos.level).toBe(1);
    expect(character?.relationships?.Rowan.level).toBe(2);
    expect(await db.world_log.where('characterUuid').equals('character-state-test').count()).toBe(1);
  });

  it('rejects unknown fields without changing any game data', async () => {
    const before = await db.character.where('uuid').equals('character-state-test').first();

    await expect(applyStateUpdate('character-state-test', {
      event_id: 'turn-002-update',
      status: { hp: 1, god_mode: true },
    })).rejects.toBeInstanceOf(StateValidationError);

    const after = await db.character.where('uuid').equals('character-state-test').first();
    expect(after).toEqual(before);
    expect(await db.settings.get('stateEvent:character-state-test:turn-002-update')).toBeUndefined();
  });

  it('rejects cross-field limit violations atomically', async () => {
    await expect(applyStateUpdate('character-state-test', {
      event_id: 'turn-003-update',
      status: { mp: 100, max_mp: 20 },
      world_log_add: 'This must not be written',
    })).rejects.toThrow('cannot exceed');

    expect(await db.world_log.count()).toBe(0);
    expect((await db.character.where('uuid').equals('character-state-test').first())?.status.mp).toBe(20);
  });

  it('uses event_id to prevent duplicate settlement', async () => {
    const update = {
      event_id: 'turn-004-update',
      inventory_events: [{ op: 'add' as const, item: 'Chocolate Frog' }],
      world_log_add: 'Bought a Chocolate Frog',
    };

    expect(await applyStateUpdate('character-state-test', update)).toBe('applied');
    expect(await applyStateUpdate('character-state-test', update)).toBe('duplicate');

    const character = await db.character.where('uuid').equals('character-state-test').first();
    expect(character?.status.inventory).toEqual(['Chocolate Frog']);
    expect(await db.world_log.count()).toBe(1);
  });

  it('keeps invalid tagged content visible and records a redacted error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const narrative = 'Story\n<state_update>{"event_id":"bad","status":{"hp":-1}}</state_update>';

    expect(await parseAndApplyState(narrative, 'character-state-test')).toBe(narrative);
    expect((await db.character.where('uuid').equals('character-state-test').first())?.status.hp).toBe(100);
    const errorRows = await db.settings.filter((row) => row.key.startsWith('stateError:')).toArray();
    expect(errorRows).toHaveLength(1);
    expect(JSON.stringify(errorRows[0].value)).not.toContain('"hp":-1');
    consoleError.mockRestore();
  });
});
