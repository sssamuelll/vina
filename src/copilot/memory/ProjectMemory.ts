/**
 * #81 — Copilot Memory: Project Context Persistence
 *
 * Class-based API (ProjectMemory) for session-level message history + decisions.
 * Stored in localStorage for synchronous access from CopilotPanel.
 *
 * Functional API (loadMemory/saveMemory) for IndexedDB-backed long-term memory
 * with preferences, notes, and cross-session recall via copilot tools.
 */

import { storageGet, storageSet } from '../../utils/storage';
import { safeGetItem, safeSetItem, safeRemoveItem, safeStorageLength, safeKey } from '../../utils/safeStorage';

// ─── Message types ───────────────────────────────────────────────────────────

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolsCalled?: string[];
}

// ─── Class-based API (localStorage, synchronous) ─────────────────────────────

const STORAGE_PREFIX = 'openclo_memory_';
const MAX_MESSAGES = 50;
const MAX_DECISIONS = 20;

export class ProjectMemory {
  projectId: string;
  messages: CopilotMessage[];
  decisions: string[];
  summary: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.messages = [];
    this.decisions = [];
    this.summary = '';
    this._load();
  }

  private _load(): void {
    try {
      const raw = safeGetItem(`${STORAGE_PREFIX}${this.projectId}`);
      if (raw) {
        const data = JSON.parse(raw);
        this.messages = data.messages || [];
        this.decisions = data.decisions || [];
        this.summary = data.summary || '';
      }
    } catch {
      // ignore parse errors
    }
  }

  addMessage(msg: CopilotMessage): void {
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this._trim();
    }
  }

  addDecision(decision: string): void {
    this.decisions.push(decision);
    if (this.decisions.length > MAX_DECISIONS) {
      this.decisions = this.decisions.slice(-MAX_DECISIONS);
    }
  }

  private _trim(): void {
    const removed = this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    // Generate summary from removed messages
    const userMsgs = removed.filter(m => m.role === 'user');
    if (userMsgs.length > 0) {
      const topics = userMsgs.map(m => m.content.slice(0, 50)).join(', ');
      this.summary = `User asked about: ${topics}`;
    }
  }

  getRecent(count: number): CopilotMessage[] {
    return this.messages.slice(-count);
  }

  save(): void {
    safeSetItem(
      `${STORAGE_PREFIX}${this.projectId}`,
      JSON.stringify({ messages: this.messages, decisions: this.decisions, summary: this.summary })
    );
  }

  clear(): void {
    this.messages = [];
    this.decisions = [];
    this.summary = '';
  }

  delete(): void {
    this.clear();
    safeRemoveItem(`${STORAGE_PREFIX}${this.projectId}`);
  }

  toJSON() {
    return {
      projectId: this.projectId,
      messages: this.messages,
      decisions: this.decisions,
      summary: this.summary,
    };
  }

  toContextString(): string {
    const parts: string[] = [];
    if (this.summary) parts.push(`Previous context: ${this.summary}`);
    if (this.decisions.length > 0) {
      parts.push('Decisions made:');
      for (const d of this.decisions) parts.push(`- ${d}`);
    }
    return parts.join('\n');
  }
}

export function listProjectMemories(): string[] {
  const ids: string[] = [];
  const len = safeStorageLength();
  for (let i = 0; i < len; i++) {
    const key = safeKey(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      ids.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return ids;
}

// ─── IndexedDB-backed long-term memory (async) ──────────────────────────────

export interface CopilotDecision {
  timestamp: number;
  decision: string;
  context: string;
}

export interface CopilotLongTermMemory {
  projectId: string;
  decisions: CopilotDecision[];
  preferences: Record<string, string>;
  notes: string[];
  lastAccessed: number;
}

const IDB_MEMORY_PREFIX = 'copilot-memory-';

function idbKey(projectId: string): string {
  return `${IDB_MEMORY_PREFIX}${projectId}`;
}

function emptyLongTermMemory(projectId: string): CopilotLongTermMemory {
  return { projectId, decisions: [], preferences: {}, notes: [], lastAccessed: Date.now() };
}

export async function loadLongTermMemory(projectId: string): Promise<CopilotLongTermMemory> {
  if (!projectId) return emptyLongTermMemory('default');
  try {
    const mem = await storageGet<CopilotLongTermMemory>('settings', idbKey(projectId));
    if (mem) { mem.lastAccessed = Date.now(); return mem; }
  } catch { /* ignore */ }
  return emptyLongTermMemory(projectId);
}

export async function saveLongTermMemory(memory: CopilotLongTermMemory): Promise<void> {
  memory.lastAccessed = Date.now();
  await storageSet('settings', idbKey(memory.projectId), memory);
}

export async function addLongTermDecision(projectId: string, decision: string, context: string): Promise<CopilotLongTermMemory> {
  const mem = await loadLongTermMemory(projectId);
  mem.decisions.push({ timestamp: Date.now(), decision, context });
  if (mem.decisions.length > 100) mem.decisions = mem.decisions.slice(-100);
  await saveLongTermMemory(mem);
  return mem;
}

export async function setLongTermPreference(projectId: string, key: string, value: string): Promise<CopilotLongTermMemory> {
  const mem = await loadLongTermMemory(projectId);
  mem.preferences[key] = value;
  await saveLongTermMemory(mem);
  return mem;
}

export async function addLongTermNote(projectId: string, note: string): Promise<CopilotLongTermMemory> {
  const mem = await loadLongTermMemory(projectId);
  mem.notes.push(note);
  if (mem.notes.length > 50) mem.notes = mem.notes.slice(-50);
  await saveLongTermMemory(mem);
  return mem;
}

export async function clearLongTermMemory(projectId: string): Promise<void> {
  await storageSet('settings', idbKey(projectId), emptyLongTermMemory(projectId));
}

export function longTermMemoryToContext(memory: CopilotLongTermMemory): string {
  const parts: string[] = [];
  if (Object.keys(memory.preferences).length > 0) {
    parts.push('## User Preferences');
    for (const [k, v] of Object.entries(memory.preferences)) parts.push(`- ${k}: ${v}`);
  }
  if (memory.decisions.length > 0) {
    const recent = memory.decisions.slice(-10);
    parts.push('## Recent Decisions');
    for (const d of recent) {
      const date = new Date(d.timestamp).toLocaleDateString();
      parts.push(`- [${date}] ${d.decision}${d.context ? ` (${d.context})` : ''}`);
    }
  }
  if (memory.notes.length > 0) {
    parts.push('## Notes');
    for (const n of memory.notes.slice(-5)) parts.push(`- ${n}`);
  }
  return parts.join('\n');
}
