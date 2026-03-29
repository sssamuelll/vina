/**
 * Knowledge Index Assembler
 *
 * Combines all chunk JSON files from scripts/knowledge/output/ into a single
 * KnowledgeIndex and writes it to public/knowledge/knowledge-index.json.
 *
 * Run: npx tsx scripts/knowledge/build-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { KnowledgeChunk, KnowledgeIndex } from '../../src/copilot/knowledge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public', 'knowledge');

// Read all chunk files
const chunkFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('-chunks.json'));

const allChunks: KnowledgeChunk[] = [];
for (const file of chunkFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8')) as KnowledgeChunk[];
  allChunks.push(...data);
  console.log(`  ${file}: ${data.length} chunks`);
}

// Deduplicate by ID (in case of re-runs)
const seen = new Set<string>();
const deduped = allChunks.filter(c => {
  if (seen.has(c.id)) return false;
  seen.add(c.id);
  return true;
});

// Build index
const index: KnowledgeIndex = {
  version: 1,
  model: 'text-embedding-3-small',
  dimensions: 1536,
  chunks: deduped,
  createdAt: new Date().toISOString(),
};

// Write
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
const outputPath = path.join(PUBLIC_DIR, 'knowledge-index.json');
fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

console.log(`\nKnowledge index built:`);
console.log(`  Total chunks: ${deduped.length}`);
console.log(`  Output: ${outputPath}`);
console.log(`  Size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
console.log(`  Note: Embeddings not yet computed — run embed.ts to add vectors`);
