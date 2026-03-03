import type { AgenticRecord } from './types';

const STORAGE_KEY = 'openclo-debug-records';
const MAX_RECORDS = 100;

export class DebugStore {
  private records: AgenticRecord[] = [];
  private loaded = false;

  private ensureLoaded(): void {
    if (this.loaded) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.records = raw ? JSON.parse(raw) : [];
    } catch {
      this.records = [];
    }
    this.loaded = true;
  }

  private persist(): void {
    try {
      if (this.records.length > MAX_RECORDS) {
        this.records = this.records.slice(-MAX_RECORDS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // localStorage may be full or unavailable
    }
  }

  save(record: AgenticRecord): void {
    this.ensureLoaded();
    this.records.push(record);
    this.persist();
  }

  getById(id: string): AgenticRecord | null {
    this.ensureLoaded();
    return this.records.find(r => r.id === id) ?? null;
  }

  getAll(): AgenticRecord[] {
    this.ensureLoaded();
    return [...this.records];
  }

  getRecent(limit: number): AgenticRecord[] {
    this.ensureLoaded();
    return this.records.slice(-limit);
  }

  getFailures(): AgenticRecord[] {
    this.ensureLoaded();
    return this.records.filter(r => !r.success);
  }

  clear(): void {
    this.records = [];
    this.loaded = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  pruneOlderThan(days: number): void {
    this.ensureLoaded();
    const cutoff = Date.now() - days * 86400000;
    this.records = this.records.filter(r => r.timestamp >= cutoff);
    this.persist();
  }

  exportAsJSON(): string {
    this.ensureLoaded();
    return JSON.stringify(this.records, null, 2);
  }
}
