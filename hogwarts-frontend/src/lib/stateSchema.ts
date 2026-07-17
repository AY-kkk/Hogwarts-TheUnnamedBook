export const STATE_SCHEMA_VERSION = 'state-2026.07.17.2';

export const HOUSES = ['Unsorted', 'Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff'] as const;
export const GAME_MODES = ['prologue', 'weekly', 'event'] as const;

export type House = (typeof HOUSES)[number];
export type GameMode = (typeof GAME_MODES)[number];

export interface CharacterAttributes {
  knowledge: number;
  athletics: number;
  charm: number;
  morality: number;
  mental: number;
}

export interface GameStatus {
  hp: number;
  mp: number;
  max_mp: number;
  gold: number;
  ap: number;
  max_ap: number;
  level: number;
  exp: number;
  attributes: CharacterAttributes;
  inventory: string[];
  location: string;
  current_year: number;
  current_month: number;
  current_week: number;
  current_weekday: number;
  game_mode: GameMode;
  prologue_turn: number;
  chapter: string;
}

export interface SpellState {
  level: number;
  desc: string;
}

export interface RelationshipState {
  level: number;
  tag: string;
  desc: string;
}

const ERA_START_YEAR: Record<string, number> = {
  '创始人时代': 990,
  '格林德沃时代': 1938,
  '掠夺者时代': 1971,
  '救世主时代': 1991,
};

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

export function createInitialGameStatus(era: string): GameStatus {
  return {
    hp: 100,
    mp: 20,
    max_mp: 20,
    gold: 0,
    ap: 0,
    max_ap: 7,
    level: 1,
    exp: 0,
    attributes: {
      knowledge: 15,
      athletics: 40,
      charm: 40,
      morality: 50,
      mental: 40,
    },
    inventory: [],
    location: 'Home',
    current_year: ERA_START_YEAR[era] ?? 1991,
    current_month: 7,
    current_week: 4,
    current_weekday: 1,
    game_mode: 'prologue',
    prologue_turn: 1,
    chapter: 'Prologue',
  };
}

export function normalizeLegacyStatus(value: unknown, era = ''): GameStatus {
  const fallback = createInitialGameStatus(era);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const legacy = value as Record<string, unknown>;
  const attributes = legacy.attributes && typeof legacy.attributes === 'object'
    ? legacy.attributes as Record<string, unknown>
    : {};
  const mp = clamp(legacy.mp, 0, 200, fallback.mp);
  const maxMp = Math.max(mp, clamp(legacy.max_mp, 1, 200, Math.max(mp, fallback.max_mp)));
  const maxAp = clamp(legacy.max_ap, 0, 10, fallback.max_ap);
  const ap = Math.min(maxAp, clamp(legacy.ap, 0, 10, fallback.ap));
  const rawYear = typeof legacy.current_year === 'number'
    && legacy.current_year >= 900
    && legacy.current_year <= 2200
    ? legacy.current_year
    : fallback.current_year;

  return {
    hp: clamp(legacy.hp, 0, 100, fallback.hp),
    mp,
    max_mp: maxMp,
    gold: clamp(legacy.gold, 0, 1_000_000, fallback.gold),
    ap,
    max_ap: maxAp,
    level: clamp(legacy.level, 1, 7, fallback.level),
    exp: clamp(legacy.exp, 0, 1_000_000, fallback.exp),
    attributes: {
      knowledge: clamp(attributes.knowledge, 1, 200, fallback.attributes.knowledge),
      athletics: clamp(attributes.athletics ?? attributes.stamina, 1, 100, fallback.attributes.athletics),
      charm: clamp(attributes.charm, 1, 100, fallback.attributes.charm),
      morality: clamp(attributes.morality ?? attributes.courage, 1, 100, fallback.attributes.morality),
      mental: clamp(attributes.mental, 1, 200, fallback.attributes.mental),
    },
    inventory: Array.isArray(legacy.inventory)
      ? legacy.inventory.filter((item): item is string => typeof item === 'string').slice(0, 200)
      : fallback.inventory,
    location: typeof legacy.location === 'string' && legacy.location.trim()
      ? legacy.location.slice(0, 100)
      : fallback.location,
    current_year: rawYear,
    current_month: clamp(legacy.current_month, 1, 12, fallback.current_month),
    current_week: clamp(legacy.current_week, 1, 4, fallback.current_week),
    current_weekday: clamp(legacy.current_weekday, 1, 7, fallback.current_weekday),
    game_mode: GAME_MODES.includes(legacy.game_mode as GameMode)
      ? legacy.game_mode as GameMode
      : fallback.game_mode,
    prologue_turn: clamp(legacy.prologue_turn, 1, 9, fallback.prologue_turn),
    chapter: typeof legacy.chapter === 'string' && legacy.chapter.trim()
      ? legacy.chapter.slice(0, 100)
      : fallback.chapter,
  };
}
