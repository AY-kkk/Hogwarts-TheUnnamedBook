import Dexie, { type Table } from 'dexie';

// Define the interface for the Character table
export interface Character {
  id?: number;
  uuid?: string; // For sync and multi-character
  lastPlayed?: number; // Timestamp
  synced?: number; // 0 or 1
  isDeleted?: number; // 0 or 1
  
  name: string;
  gender?: string; // Added
  blood_status?: string; // Added
  era?: string; // Added
  initial_trait?: string; // Added
  patronus?: string; // Added
  self_description?: string; // Added
  
  house: string;
  status: {
    hp: number;
    mp: number;
    gold: number;
    level: number;
    exp: number;
    attributes: {
      knowledge: number;
      courage: number;
      stamina: number;
      charm?: number;
      mental?: number;
    };
    inventory: string[];
    location: string;
    current_year?: number;
  };
  wand?: {
    wood: string;
    core: string;
    length: number;
    flexibility: string;
  };
  wand_description?: string; // Added to store the raw input
  spells?: Record<string, { level: number; desc: string }>;
  relationships?: Record<string, { level: number; tag: string; desc: string }>;
  chapter_progress?: string;
  summary: string;
}

export interface Memory {
  id?: number;
  characterUuid: string;
  content: string;
  role: 'user' | 'ai' | 'system';
  timestamp: number;
  size?: number; // Size in bytes
}

// Define the interface for the Logs table
export interface Log {
  id?: number;
  characterUuid?: string; // Added for multi-character support
  turn_id: number;
  content: string;
  type: 'user' | 'ai' | 'system';
  timestamp: number;
}

// Define the interface for the WorldLog table
export interface WorldLog {
  id?: number;
  event_name: string;
  timestamp: number;
  description: string;
}

// Define the interface for Settings
export interface Setting {
  key: string;
  value: unknown;
}

export class HogwartsDB extends Dexie {
  character!: Table<Character>;
  logs!: Table<Log>;
  memories!: Table<Memory>;
  world_log!: Table<WorldLog>;
  settings!: Table<Setting>;

  constructor() {
    super('HogwartsDB');
    this.version(4).stores({
      settings: 'key',
      character: '++id, uuid, name, lastPlayed, synced',
      logs: '++id, characterUuid, turn_id, type, timestamp',
      memories: '++id, characterUuid, timestamp',
      world_log: '++id, event_name, timestamp'
    });
    // Keep version 2 for backward compatibility reference if needed, but Dexie handles upgrades
  }
}

export const db = new HogwartsDB();

// Helper to save a log
export async function addLog(turnId: number, content: string, type: 'user' | 'ai' | 'system', characterUuid?: string) {
  return await db.logs.add({
    turn_id: turnId,
    content,
    type,
    characterUuid,
    timestamp: Date.now()
  });
}

// Helper to get recent logs
export async function getRecentLogs(limit = 20) {
  return await db.logs.orderBy('turn_id').reverse().limit(limit).toArray();
}
