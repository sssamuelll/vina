/**
 * Anti-stale guard for the built knowledge index (Seamly nuke, 2026-06-05).
 *
 * The index at public/knowledge/knowledge-index.json is a BUILD ARTIFACT of
 * `npx tsx scripts/knowledge/build-index.ts` — nothing regenerates it
 * automatically. When the Seamly chunks were removed (65 → 42), the only
 * safeguard against a stale index silently re-serving Seamly knowledge to
 * the agent was a manual grep. This test makes that drift a red suite
 * instead: if anyone re-adds a seamly chunk file (or forgets to re-run
 * build-index after removing one), this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INDEX_PATH = join(__dirname, '../../../../public/knowledge/knowledge-index.json');

describe('knowledge-index.json (built artifact)', () => {
  const raw = readFileSync(INDEX_PATH, 'utf-8');
  const index = JSON.parse(raw) as { chunks: Array<{ source?: string }> };

  it('serves no seamly2d chunks (removed 2026-06-05 — patterns come from María\'s DXF only)', () => {
    expect(raw.toLowerCase()).not.toContain('seamly');
  });

  it('still serves the surviving knowledge (fabric + house rules ≈ 42 chunks)', () => {
    // Loose lower bound: protects against an over-zealous regeneration that
    // wipes the index entirely, without pinning the exact count.
    expect(index.chunks.length).toBeGreaterThanOrEqual(30);
  });
});
