import { db, type Character } from '../lib/db';
import {
  GAME_MODES,
  HOUSES,
  STATE_SCHEMA_VERSION,
  type CharacterAttributes,
  type GameStatus,
  type House,
  type RelationshipState,
  type SpellState,
} from '../lib/stateSchema';

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateValidationError';
  }
}

interface InventoryEvent {
  op: 'add' | 'remove';
  item: string;
  desc?: string;
}

interface StatusPatch extends Partial<Omit<GameStatus, 'attributes' | 'inventory'>> {
  attributes?: Partial<CharacterAttributes>;
}

export type TurnKind = 'prologue' | 'weekly' | 'event_start' | 'event_continue' | 'event_resolve';

export interface TurnSettlement {
  kind: TurnKind;
  ap_cost: number;
  target_prologue_turn?: number;
}

export interface StateUpdate {
  event_id: string;
  turn: TurnSettlement;
  status?: StatusPatch;
  house?: House;
  inventory_events?: InventoryEvent[];
  spells?: Record<string, SpellState>;
  relationships?: Record<string, RelationshipState>;
  world_log_add?: string;
}

const UPDATE_KEYS = new Set([
  'event_id', 'turn', 'status', 'house', 'inventory_events', 'spells', 'relationships', 'world_log_add',
]);
const STATUS_KEYS = new Set([
  'hp', 'mp', 'max_mp', 'gold', 'ap', 'max_ap', 'level', 'exp', 'attributes', 'location',
  'current_year', 'current_month', 'current_week', 'current_weekday', 'game_mode',
  'prologue_turn', 'chapter',
]);
const ATTRIBUTE_KEYS = new Set(['knowledge', 'athletics', 'charm', 'morality', 'mental']);
const TURN_KINDS = ['prologue', 'weekly', 'event_start', 'event_continue', 'event_resolve'] as const;

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StateValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new StateValidationError(`${label} has unknown fields: ${unknown.join(', ')}`);
}

function numberInRange(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new StateValidationError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function stringInRange(value: unknown, minimum: number, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
    throw new StateValidationError(`${label} must contain ${minimum}-${maximum} characters`);
  }
  return value.trim();
}

function validateStatusPatch(value: unknown): StatusPatch {
  const input = asObject(value, 'status');
  assertKnownKeys(input, STATUS_KEYS, 'status');
  const patch: StatusPatch = {};
  const ranges: Record<string, [number, number]> = {
    hp: [0, 100], mp: [0, 200], max_mp: [1, 200], gold: [0, 1_000_000],
    ap: [0, 10], max_ap: [0, 10], level: [1, 7], exp: [0, 1_000_000],
    current_year: [900, 2200], current_month: [1, 12], current_week: [1, 4],
    current_weekday: [1, 7], prologue_turn: [1, 9],
  };
  for (const [key, range] of Object.entries(ranges)) {
    if (key in input) {
      (patch as Record<string, unknown>)[key] = numberInRange(input[key], range[0], range[1], `status.${key}`);
    }
  }
  if ('location' in input) patch.location = stringInRange(input.location, 1, 100, 'status.location');
  if ('chapter' in input) patch.chapter = stringInRange(input.chapter, 1, 100, 'status.chapter');
  if ('game_mode' in input) {
    if (!GAME_MODES.includes(input.game_mode as GameStatus['game_mode'])) {
      throw new StateValidationError(`status.game_mode must be one of ${GAME_MODES.join(', ')}`);
    }
    patch.game_mode = input.game_mode as GameStatus['game_mode'];
  }
  if ('attributes' in input) {
    const attributes = asObject(input.attributes, 'status.attributes');
    assertKnownKeys(attributes, ATTRIBUTE_KEYS, 'status.attributes');
    if (Object.keys(attributes).length === 0) {
      throw new StateValidationError('status.attributes must contain at least one change');
    }
    const attributeRanges: Record<string, [number, number]> = {
      knowledge: [1, 200], athletics: [1, 100], charm: [1, 100], morality: [1, 100], mental: [1, 200],
    };
    patch.attributes = {};
    for (const [key, range] of Object.entries(attributeRanges)) {
      if (key in attributes) {
        (patch.attributes as Record<string, unknown>)[key] = numberInRange(
          attributes[key], range[0], range[1], `status.attributes.${key}`
        );
      }
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new StateValidationError('status must contain at least one change');
  }
  return patch;
}

function validateNamedRecords<T>(
  value: unknown,
  label: string,
  validate: (entry: Record<string, unknown>, entryLabel: string) => T
): Record<string, T> {
  const input = asObject(value, label);
  if (Object.keys(input).length === 0) throw new StateValidationError(`${label} cannot be empty`);
  if (Object.keys(input).length > 50) throw new StateValidationError(`${label} contains too many entries`);
  return Object.fromEntries(Object.entries(input).map(([name, entry]) => {
    if (['__proto__', 'prototype', 'constructor'].includes(name)) {
      throw new StateValidationError(`${label} contains a reserved name`);
    }
    return [
      stringInRange(name, 1, 100, `${label} name`),
      validate(asObject(entry, `${label}.${name}`), `${label}.${name}`),
    ];
  }));
}

export function validateStateUpdate(value: unknown): StateUpdate {
  const input = asObject(value, 'state_update');
  assertKnownKeys(input, UPDATE_KEYS, 'state_update');
  const eventId = stringInRange(input.event_id, 8, 64, 'event_id');
  if (!/^[A-Za-z0-9._:-]+$/.test(eventId)) {
    throw new StateValidationError('event_id contains unsupported characters');
  }

  const turnInput = asObject(input.turn, 'turn');
  assertKnownKeys(turnInput, new Set(['kind', 'ap_cost', 'target_prologue_turn']), 'turn');
  if (!TURN_KINDS.includes(turnInput.kind as TurnKind)) {
    throw new StateValidationError(`turn.kind must be one of ${TURN_KINDS.join(', ')}`);
  }
  const turn: TurnSettlement = {
    kind: turnInput.kind as TurnKind,
    ap_cost: numberInRange(turnInput.ap_cost, 0, 10, 'turn.ap_cost'),
  };
  if ('target_prologue_turn' in turnInput) {
    turn.target_prologue_turn = numberInRange(
      turnInput.target_prologue_turn, 1, 9, 'turn.target_prologue_turn'
    );
  }
  if (turn.kind === 'prologue' && turn.target_prologue_turn === undefined) {
    throw new StateValidationError('turn.target_prologue_turn is required for prologue');
  }
  if (turn.kind !== 'prologue' && turn.target_prologue_turn !== undefined) {
    throw new StateValidationError('turn.target_prologue_turn is only valid for prologue');
  }

  const update: StateUpdate = { event_id: eventId, turn };
  if ('status' in input) update.status = validateStatusPatch(input.status);
  if ('house' in input) {
    if (!HOUSES.includes(input.house as House)) {
      throw new StateValidationError(`house must be one of ${HOUSES.join(', ')}`);
    }
    update.house = input.house as House;
  }
  if ('inventory_events' in input) {
    if (!Array.isArray(input.inventory_events) || input.inventory_events.length < 1 || input.inventory_events.length > 20) {
      throw new StateValidationError('inventory_events must contain 1-20 entries');
    }
    update.inventory_events = input.inventory_events.map((rawEvent, index) => {
      const event = asObject(rawEvent, `inventory_events[${index}]`);
      assertKnownKeys(event, new Set(['op', 'item', 'desc']), `inventory_events[${index}]`);
      if (event.op !== 'add' && event.op !== 'remove') {
        throw new StateValidationError(`inventory_events[${index}].op must be add or remove`);
      }
      return {
        op: event.op,
        item: stringInRange(event.item, 1, 100, `inventory_events[${index}].item`),
        ...(event.desc === undefined
          ? {}
          : { desc: stringInRange(event.desc, 1, 300, `inventory_events[${index}].desc`) }),
      };
    });
  }
  if ('spells' in input) {
    update.spells = validateNamedRecords(input.spells, 'spells', (entry, label) => {
      assertKnownKeys(entry, new Set(['level', 'desc']), label);
      return {
        level: numberInRange(entry.level, 0, 5, `${label}.level`),
        desc: stringInRange(entry.desc, 1, 300, `${label}.desc`),
      };
    });
  }
  if ('relationships' in input) {
    update.relationships = validateNamedRecords(input.relationships, 'relationships', (entry, label) => {
      assertKnownKeys(entry, new Set(['level', 'tag', 'desc']), label);
      return {
        level: numberInRange(entry.level, 0, 5, `${label}.level`),
        tag: stringInRange(entry.tag, 1, 50, `${label}.tag`),
        desc: stringInRange(entry.desc, 1, 300, `${label}.desc`),
      };
    });
  }
  if ('world_log_add' in input) {
    update.world_log_add = stringInRange(input.world_log_add, 1, 500, 'world_log_add');
  }
  if (Object.keys(update).length === 2) {
    throw new StateValidationError('state_update must contain at least one change');
  }
  return update;
}

function mergeStatus(current: GameStatus, patch: StatusPatch | undefined): GameStatus {
  if (!patch) return current;
  const next = {
    ...current,
    ...patch,
    attributes: { ...current.attributes, ...patch.attributes },
    inventory: current.inventory,
  };
  if (next.mp > next.max_mp) throw new StateValidationError('status.mp cannot exceed status.max_mp');
  if (next.ap > next.max_ap) throw new StateValidationError('status.ap cannot exceed status.max_ap');
  return next;
}

const PROLOGUE_CALENDAR: Record<number, { month: number; week: number }> = {
  1: { month: 7, week: 4 },
  2: { month: 8, week: 1 },
  3: { month: 8, week: 2 },
  4: { month: 8, week: 2 },
  5: { month: 8, week: 4 },
  6: { month: 9, week: 1 },
  7: { month: 9, week: 1 },
  8: { month: 9, week: 1 },
  9: { month: 9, week: 1 },
};

function sameCalendar(left: GameStatus, right: GameStatus): boolean {
  return left.current_year === right.current_year
    && left.current_month === right.current_month
    && left.current_week === right.current_week;
}

function expectedNextWeek(current: GameStatus): Pick<GameStatus, 'current_year' | 'current_month' | 'current_week'> {
  if (current.current_week < 4) {
    return { ...current, current_week: current.current_week + 1 };
  }
  if (current.current_month < 12) {
    return { ...current, current_month: current.current_month + 1, current_week: 1 };
  }
  return { ...current, current_year: current.current_year + 1, current_month: 1, current_week: 1 };
}

function assertCalendar(
  next: GameStatus,
  expected: Pick<GameStatus, 'current_year' | 'current_month' | 'current_week'>,
  label: string
): void {
  if (next.current_year !== expected.current_year
    || next.current_month !== expected.current_month
    || next.current_week !== expected.current_week) {
    throw new StateValidationError(`${label} calendar transition is invalid`);
  }
}

export function validateStatusTransition(
  current: GameStatus,
  next: GameStatus,
  turn: TurnSettlement
): void {
  if (current.game_mode === 'prologue') {
    if (turn.kind !== 'prologue' || turn.ap_cost !== 0) {
      throw new StateValidationError('prologue updates require a zero-AP prologue settlement');
    }
    const currentTurn = current.prologue_turn;
    const target = turn.target_prologue_turn as number;
    if (target !== currentTurn && target !== currentTurn + 1) {
      throw new StateValidationError('prologue can only stay on the current turn or advance by one');
    }
    if (next.prologue_turn !== target) {
      throw new StateValidationError('status.prologue_turn must match turn.target_prologue_turn');
    }
    const expected = PROLOGUE_CALENDAR[target];
    if (next.current_month !== expected.month || next.current_week !== expected.week) {
      throw new StateValidationError('prologue calendar does not match the target turn');
    }
    const targetMode = target === 9 ? 'weekly' : 'prologue';
    if (next.game_mode !== targetMode) {
      throw new StateValidationError(`Turn ${target} must use ${targetMode} mode`);
    }
    if (target === 9 && (next.ap !== 7 || next.max_ap !== 7)) {
      throw new StateValidationError('weekly mode must start with 7 AP');
    }
    return;
  }

  if (current.game_mode === 'weekly') {
    if (turn.kind === 'event_start') {
      if (turn.ap_cost !== 0 || next.game_mode !== 'event' || !sameCalendar(current, next)) {
        throw new StateValidationError('event start must freeze calendar and consume zero AP');
      }
      if (next.ap !== current.ap || next.max_ap !== current.max_ap) {
        throw new StateValidationError('event start must preserve AP');
      }
      return;
    }
    if (turn.kind !== 'weekly' || next.game_mode !== 'weekly') {
      throw new StateValidationError('weekly mode requires a weekly settlement or event start');
    }
    if (turn.ap_cost > current.ap + 3) {
      throw new StateValidationError('weekly AP cost exceeds the three-point overdraft limit');
    }
    assertCalendar(next, expectedNextWeek(current), 'weekly');
    const overdraft = Math.max(0, turn.ap_cost - current.ap);
    const nextLimit = 7 - overdraft;
    if (next.max_ap !== nextLimit || next.ap !== nextLimit) {
      throw new StateValidationError('next-week AP does not match the declared AP cost');
    }
    return;
  }

  if (turn.kind !== 'event_continue' && turn.kind !== 'event_resolve') {
    throw new StateValidationError('event mode requires continue or resolve settlement');
  }
  if (turn.ap_cost !== 0 || !sameCalendar(current, next)) {
    throw new StateValidationError('event mode must freeze calendar and consume zero AP');
  }
  if (next.ap !== current.ap || next.max_ap !== current.max_ap) {
    throw new StateValidationError('event mode must preserve AP');
  }
  const expectedMode = turn.kind === 'event_resolve' ? 'weekly' : 'event';
  if (next.game_mode !== expectedMode) {
    throw new StateValidationError(`${turn.kind} must transition to ${expectedMode}`);
  }
}

export async function applyStateUpdate(
  characterUuid: string,
  rawUpdate: unknown
): Promise<'applied' | 'duplicate'> {
  const update = validateStateUpdate(rawUpdate);
  const idempotencyKey = `stateEvent:${characterUuid}:${update.event_id}`;

  return db.transaction('rw', [db.character, db.world_log, db.settings], async () => {
    if (await db.settings.get(idempotencyKey)) return 'duplicate';
    const character = await db.character.where('uuid').equals(characterUuid).first();
    if (!character?.id) throw new StateValidationError('找不到待更新的角色');

    const status = mergeStatus(character.status, update.status);
    validateStatusTransition(character.status, status, update.turn);
    const inventory = [...status.inventory];
    for (const event of update.inventory_events ?? []) {
      if (event.op === 'add' && !inventory.includes(event.item)) inventory.push(event.item);
      if (event.op === 'remove') {
        const index = inventory.indexOf(event.item);
        if (index >= 0) inventory.splice(index, 1);
      }
    }

    const changes: Partial<Character> = {
      status: { ...status, inventory },
      lastPlayed: Date.now(),
    };
    if (update.house) changes.house = update.house;
    if (update.spells) changes.spells = { ...(character.spells ?? {}), ...update.spells };
    if (update.relationships) {
      changes.relationships = { ...(character.relationships ?? {}), ...update.relationships };
    }

    if (update.world_log_add) {
      await db.world_log.add({
        characterUuid,
        event_name: update.world_log_add,
        description: update.world_log_add,
        timestamp: Date.now(),
      });
    }
    await db.character.update(character.id, changes);
    await db.settings.put({
      key: idempotencyKey,
      value: { appliedAt: Date.now(), schemaVersion: STATE_SCHEMA_VERSION },
    });
    return 'applied';
  });
}
