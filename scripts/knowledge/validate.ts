/**
 * Knowledge Index Validator
 *
 * Checks the assembled knowledge index for quality issues:
 * - Empty or too-short content
 * - Missing required metadata
 * - Duplicate IDs
 * - Oversized chunks
 *
 * Run: npx tsx scripts/knowledge/validate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { KnowledgeIndex } from '../../src/copilot/knowledge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.join(__dirname, '..', '..', 'public', 'knowledge', 'knowledge-index.json');
const index: KnowledgeIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as KnowledgeIndex;

let errors = 0;
let warnings = 0;

// Check for empty content
for (const chunk of index.chunks) {
  if (!chunk.content || chunk.content.trim().length < 20) {
    console.error(`ERROR: Chunk ${chunk.id} has empty or too-short content`);
    errors++;
  }
  if (!chunk.metadata.category) {
    console.error(`ERROR: Chunk ${chunk.id} missing category`);
    errors++;
  }
  if (!chunk.metadata.tags || chunk.metadata.tags.length === 0) {
    console.warn(`WARN: Chunk ${chunk.id} has no tags`);
    warnings++;
  }
  if (chunk.content.length > 3000) {
    console.warn(`WARN: Chunk ${chunk.id} is very long (${chunk.content.length} chars) — consider splitting`);
    warnings++;
  }
}

// Check for duplicate IDs
const ids = new Set<string>();
for (const chunk of index.chunks) {
  if (ids.has(chunk.id)) {
    console.error(`ERROR: Duplicate chunk ID: ${chunk.id}`);
    errors++;
  }
  ids.add(chunk.id);
}

// Category distribution
const categories = new Map<string, number>();
for (const chunk of index.chunks) {
  categories.set(chunk.metadata.category, (categories.get(chunk.metadata.category) ?? 0) + 1);
}

console.log('\nCategory distribution:');
for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

// Source distribution
const sources = new Map<string, number>();
for (const chunk of index.chunks) {
  sources.set(chunk.metadata.source, (sources.get(chunk.metadata.source) ?? 0) + 1);
}

console.log('\nSource distribution:');
for (const [src, count] of [...sources.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${src}: ${count}`);
}

console.log(`\nTotal: ${index.chunks.length} chunks, ${errors} errors, ${warnings} warnings`);
if (errors > 0) process.exit(1);
