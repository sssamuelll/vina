import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectMemory, listProjectMemories } from '../memory';

// Mock localStorage
const store: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('ProjectMemory', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should create a new empty memory', () => {
    const memory = new ProjectMemory('project-1');
    expect(memory.projectId).toBe('project-1');
    expect(memory.messages).toEqual([]);
    expect(memory.decisions).toEqual([]);
    expect(memory.summary).toBe('');
  });

  it('should add messages', () => {
    const memory = new ProjectMemory('project-1');
    memory.addMessage({ role: 'user', content: 'Create a bodice', timestamp: 1000 });
    memory.addMessage({ role: 'assistant', content: 'Done!', timestamp: 1001, toolsCalled: ['createPiece'] });

    expect(memory.messages.length).toBe(2);
    expect(memory.messages[0].content).toBe('Create a bodice');
    expect(memory.messages[1].toolsCalled).toEqual(['createPiece']);
  });

  it('should add decisions', () => {
    const memory = new ProjectMemory('project-1');
    memory.addDecision('Used 10mm SA for all pieces');
    memory.addDecision('Selected EU 40 measurements');

    expect(memory.decisions.length).toBe(2);
    expect(memory.decisions[0]).toBe('Used 10mm SA for all pieces');
  });

  it('should save and load from localStorage', () => {
    const memory = new ProjectMemory('project-1');
    memory.addMessage({ role: 'user', content: 'Hello', timestamp: 1000 });
    memory.addDecision('Test decision');
    memory.save();

    // Create a new instance — should load from storage
    const loaded = new ProjectMemory('project-1');
    expect(loaded.messages.length).toBe(1);
    expect(loaded.messages[0].content).toBe('Hello');
    expect(loaded.decisions).toEqual(['Test decision']);
  });

  it('should isolate per project', () => {
    const memory1 = new ProjectMemory('project-1');
    memory1.addMessage({ role: 'user', content: 'For project 1', timestamp: 1000 });
    memory1.save();

    const memory2 = new ProjectMemory('project-2');
    memory2.addMessage({ role: 'user', content: 'For project 2', timestamp: 2000 });
    memory2.save();

    const loaded1 = new ProjectMemory('project-1');
    const loaded2 = new ProjectMemory('project-2');

    expect(loaded1.messages[0].content).toBe('For project 1');
    expect(loaded2.messages[0].content).toBe('For project 2');
  });

  it('should trim messages when exceeding max (50)', () => {
    const memory = new ProjectMemory('project-1');

    // Add 55 messages
    for (let i = 0; i < 55; i++) {
      memory.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: i * 1000,
        toolsCalled: i % 2 === 1 ? ['someTool'] : undefined,
      });
    }

    expect(memory.messages.length).toBeLessThanOrEqual(50);
    expect(memory.summary.length).toBeGreaterThan(0);
  });

  it('should generate summary from trimmed messages', () => {
    const memory = new ProjectMemory('project-1');

    // Fill to trigger trim
    for (let i = 0; i < 55; i++) {
      memory.addMessage({
        role: 'user',
        content: `Question about pattern ${i}`,
        timestamp: i * 1000,
      });
    }

    expect(memory.summary).toContain('User asked about');
  });

  it('should get recent messages', () => {
    const memory = new ProjectMemory('project-1');
    for (let i = 0; i < 30; i++) {
      memory.addMessage({ role: 'user', content: `Msg ${i}`, timestamp: i * 1000 });
    }

    const recent = memory.getRecent(5);
    expect(recent.length).toBe(5);
    expect(recent[0].content).toBe('Msg 25');
    expect(recent[4].content).toBe('Msg 29');
  });

  it('should clear messages and decisions', () => {
    const memory = new ProjectMemory('project-1');
    memory.addMessage({ role: 'user', content: 'Hello', timestamp: 1000 });
    memory.addDecision('Decision 1');
    memory.clear();

    expect(memory.messages).toEqual([]);
    expect(memory.decisions).toEqual([]);
    expect(memory.summary).toBe('');
  });

  it('should delete from localStorage', () => {
    const memory = new ProjectMemory('project-1');
    memory.addMessage({ role: 'user', content: 'Hello', timestamp: 1000 });
    memory.save();

    expect(localStorageMock.getItem('openclo_memory_project-1')).not.toBeNull();

    memory.delete();
    expect(localStorageMock.getItem('openclo_memory_project-1')).toBeNull();
  });

  it('should limit decisions to 20', () => {
    const memory = new ProjectMemory('project-1');
    for (let i = 0; i < 25; i++) {
      memory.addDecision(`Decision ${i}`);
    }
    expect(memory.decisions.length).toBeLessThanOrEqual(20);
    expect(memory.decisions[memory.decisions.length - 1]).toBe('Decision 24');
  });

  it('should serialize to JSON', () => {
    const memory = new ProjectMemory('project-1');
    memory.addMessage({ role: 'user', content: 'Test', timestamp: 1000 });
    const json = memory.toJSON();

    expect(json.projectId).toBe('project-1');
    expect(json.messages.length).toBe(1);
  });

  it('should build context string', () => {
    const memory = new ProjectMemory('project-1');
    memory.addDecision('Used cotton-poplin fabric');

    const context = memory.toContextString();
    expect(context).toContain('Used cotton-poplin fabric');
  });

  it('should build empty context string when no data', () => {
    const memory = new ProjectMemory('project-1');
    expect(memory.toContextString()).toBe('');
  });
});

describe('listProjectMemories', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should list project IDs with saved memory', () => {
    const m1 = new ProjectMemory('proj-a');
    m1.save();
    const m2 = new ProjectMemory('proj-b');
    m2.save();

    const ids = listProjectMemories();
    expect(ids).toContain('proj-a');
    expect(ids).toContain('proj-b');
  });

  it('should return empty array when no memories exist', () => {
    expect(listProjectMemories()).toEqual([]);
  });
});
