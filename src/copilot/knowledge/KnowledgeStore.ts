import type { KnowledgeChunk, KnowledgeIndex, KnowledgeSearchResult } from './types';
import { cosineSimilarity } from './cosineSimilarity';

/**
 * Client-side knowledge store for RAG retrieval.
 *
 * Lazy-loads the static knowledge index on first search.
 * Provides text-based keyword fallback search when embeddings
 * are not yet computed (v1).
 */
export class KnowledgeStore {
  private index: KnowledgeIndex | null = null;
  private loading: Promise<void> | null = null;

  /** Load the knowledge index from the static JSON asset */
  async load(): Promise<void> {
    if (this.index) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const resp = await fetch('/knowledge/knowledge-index.json');
        if (!resp.ok) throw new Error(`Failed to load knowledge index: ${resp.status}`);
        this.index = await resp.json();
      } catch (err) {
        console.warn('[KnowledgeStore] Failed to load index:', err);
        this.index = { version: 0, model: '', dimensions: 0, chunks: [], createdAt: '' };
      }
    })();
    return this.loading;
  }

  /** Get all chunks (loads index if needed) */
  async getChunks(): Promise<KnowledgeChunk[]> {
    await this.load();
    return this.index?.chunks ?? [];
  }

  /**
   * Search by embedding vector — cosine similarity against all chunks.
   * Returns top-k results sorted by score descending.
   */
  async searchByEmbedding(queryEmbedding: number[], k: number = 5): Promise<KnowledgeSearchResult[]> {
    await this.load();
    const chunks = this.index?.chunks ?? [];

    const scored: KnowledgeSearchResult[] = [];
    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      scored.push({ chunk, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Keyword-based fallback search — matches query terms against chunk
   * content, tags, and category. Used when embeddings are not available.
   */
  async searchByKeyword(query: string, k: number = 5): Promise<KnowledgeSearchResult[]> {
    await this.load();
    const chunks = this.index?.chunks ?? [];
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return [];

    const scored: KnowledgeSearchResult[] = [];
    for (const chunk of chunks) {
      const text = (
        chunk.content + ' ' +
        chunk.metadata.tags.join(' ') + ' ' +
        chunk.metadata.category + ' ' +
        (chunk.metadata.garmentTypes?.join(' ') ?? '')
      ).toLowerCase();

      let hits = 0;
      for (const term of terms) {
        if (text.includes(term)) hits++;
      }
      if (hits === 0) continue;

      // Score: fraction of query terms matched, weighted by content matches
      const contentMatches = terms.filter(t => chunk.content.toLowerCase().includes(t)).length;
      const score = (hits / terms.length) * 0.5 + (contentMatches / terms.length) * 0.5;
      scored.push({ chunk, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Search using embeddings if available, falling back to keyword search.
   */
  async search(query: string, queryEmbedding?: number[], k: number = 5): Promise<KnowledgeSearchResult[]> {
    if (queryEmbedding && queryEmbedding.length > 0) {
      const results = await this.searchByEmbedding(queryEmbedding, k);
      if (results.length > 0) return results;
    }
    // Fallback to keyword search
    return this.searchByKeyword(query, k);
  }

  /** Number of chunks loaded */
  get size(): number {
    return this.index?.chunks.length ?? 0;
  }

  /** Whether the index has been loaded */
  get loaded(): boolean {
    return this.index !== null;
  }
}

/** Singleton instance */
let _store: KnowledgeStore | null = null;

export function getKnowledgeStore(): KnowledgeStore {
  if (!_store) _store = new KnowledgeStore();
  return _store;
}

/** Reset for testing */
export function resetKnowledgeStore(): void {
  _store = null;
}
