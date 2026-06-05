// src/copilot/knowledge/types.ts

/** Categories of pattern-making knowledge */
export type KnowledgeCategory =
  | 'drafting-method'       // how to draft a specific block/pattern
  | 'construction-step'     // a step in construction (dart manipulation, etc.)
  | 'grading-rule'          // grading increments, size tables
  | 'ease-standard'         // ease allowances for different fits
  | 'fabric-property'       // fabric characteristics and handling
  | 'measurement-guide'     // how to take measurements, body landmarks
  | 'seam-technique'        // seam types, allowances, finishes
  | 'design-principle'      // proportions, balance, fit theory
  | 'garment-anatomy'       // terminology, piece names, body regions
  | 'production-standard'   // industry standards, tolerances
  | 'size-table';           // size system measurements

/**
 * Source of the knowledge.
 *
 * 'seamly2d' is retained as a DEAD union member after the Seamly removal
 * (2026-06-05): the index is a plain static asset with no zod boundary, so
 * keeping the literal costs nothing and lets any stale/cached index from a
 * previous deploy type-check on read instead of widening to `string`. No new
 * chunks may use it (knowledgeIndexContent.test.ts enforces 0 in the built
 * index).
 */
export type KnowledgeSource = 'textbook' | 'seamly2d' | 'house-rules' | 'user' | 'community';

/** Metadata attached to each knowledge chunk */
export interface ChunkMetadata {
  source: KnowledgeSource;
  sourceRef: string;          // "Aldrich p.47" or "skill:bodice"
  category: KnowledgeCategory;
  tags: string[];
  garmentTypes?: string[];    // ['bodice', 'sleeve', 'skirt', etc.]
  difficulty?: 'basic' | 'intermediate' | 'advanced';
  language?: 'en' | 'es' | 'bilingual';
}

/** A single knowledge chunk — the atomic unit of the RAG index */
export interface KnowledgeChunk {
  id: string;
  content: string;              // the knowledge text (300-500 tokens target)
  embedding?: number[];         // vector (1536D for text-embedding-3-small)
  metadata: ChunkMetadata;
}

/** The complete knowledge index shipped as a static asset */
export interface KnowledgeIndex {
  version: number;
  model: string;                // embedding model identifier
  dimensions: number;           // embedding vector dimensions
  chunks: KnowledgeChunk[];
  createdAt: string;            // ISO timestamp
}

/** Search result from the knowledge store */
export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;                // cosine similarity (0-1)
}
