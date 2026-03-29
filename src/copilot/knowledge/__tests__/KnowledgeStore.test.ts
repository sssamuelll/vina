import { describe, it, expect } from 'vitest';
import { KnowledgeStore } from '../KnowledgeStore';
import type { KnowledgeIndex } from '../types';

// Create a store with mock data (bypass fetch)
function createTestStore(): KnowledgeStore {
  const store = new KnowledgeStore();
  const mockIndex: KnowledgeIndex = {
    version: 1,
    model: 'test',
    dimensions: 3,
    chunks: [
      {
        id: 'c1',
        content: 'Bodice drafting starts with chest measurement and ease allowance',
        embedding: [1, 0, 0],
        metadata: { source: 'house-rules', sourceRef: 'skill:bodice', category: 'drafting-method', tags: ['bodice', 'chest', 'ease'] },
      },
      {
        id: 'c2',
        content: 'Sleeve cap height is calculated from armhole depth divided by three',
        embedding: [0, 1, 0],
        metadata: { source: 'house-rules', sourceRef: 'skill:sleeve', category: 'construction-step', tags: ['sleeve', 'cap', 'armhole'] },
      },
      {
        id: 'c3',
        content: 'Cotton poplin is a plain weave fabric with 120 GSM weight',
        embedding: [0, 0, 1],
        metadata: { source: 'house-rules', sourceRef: 'fabric:cotton-poplin', category: 'fabric-property', tags: ['cotton', 'poplin', 'woven'] },
      },
    ],
    createdAt: '2026-01-01',
  };
  // Inject mock index directly (bypass fetch for testing)
  Object.assign(store, { index: mockIndex });
  return store;
}

describe('KnowledgeStore', () => {
  describe('searchByKeyword', () => {
    it('finds chunks matching query terms', async () => {
      const store = createTestStore();
      const results = await store.searchByKeyword('bodice chest ease');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.id).toBe('c1');
    });

    it('returns empty for no matches', async () => {
      const store = createTestStore();
      const results = await store.searchByKeyword('zipper metal');
      expect(results).toHaveLength(0);
    });

    it('ranks by match count', async () => {
      const store = createTestStore();
      const results = await store.searchByKeyword('sleeve armhole cap');
      expect(results[0].chunk.id).toBe('c2');
    });

    it('returns top-k results', async () => {
      const store = createTestStore();
      const results = await store.searchByKeyword('fabric cotton', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('searchByEmbedding', () => {
    it('finds most similar chunk', async () => {
      const store = createTestStore();
      const results = await store.searchByEmbedding([1, 0.1, 0], 1);
      expect(results[0].chunk.id).toBe('c1');
    });

    it('returns top-k sorted by score', async () => {
      const store = createTestStore();
      const results = await store.searchByEmbedding([0.5, 0.5, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });
  });

  describe('search (unified)', () => {
    it('uses embedding when provided', async () => {
      const store = createTestStore();
      const results = await store.search('anything', [0, 0, 1], 1);
      expect(results[0].chunk.id).toBe('c3');
    });

    it('falls back to keyword when no embedding', async () => {
      const store = createTestStore();
      const results = await store.search('bodice chest', undefined, 1);
      expect(results[0].chunk.id).toBe('c1');
    });
  });

  it('reports size correctly', () => {
    const store = createTestStore();
    expect(store.size).toBe(3);
  });
});
