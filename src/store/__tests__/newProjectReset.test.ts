/**
 * Validates that every Redux slice handles (or explicitly opts out of)
 * the NEW_PROJECT action. Prevents state leakage between projects.
 *
 * If this test fails, you added a new slice without registering it in
 * src/store/newProjectRegistry.ts. Add it to SLICES_THAT_RESET (with
 * an extraReducers handler) or SLICES_THAT_SURVIVE (with a reason).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_REGISTERED_SLICES,
  SLICES_THAT_RESET,
  SLICES_THAT_SURVIVE,
} from '../newProjectRegistry';

const STORE_DIR = path.resolve(__dirname, '..');

/** Get all *Slice.ts filenames (without extension) in src/store/ */
function discoverSliceFiles(): string[] {
  return fs
    .readdirSync(STORE_DIR)
    .filter(f => f.endsWith('Slice.ts') && !f.endsWith('.test.ts'))
    .map(f => f.replace('.ts', ''));
}

describe('NEW_PROJECT reset completeness', () => {
  const sliceFiles = discoverSliceFiles();

  it('discovers at least the known slice count', () => {
    // Sanity check — if this fails, the test setup is broken
    expect(sliceFiles.length).toBeGreaterThanOrEqual(17);
  });

  it('every slice file is registered in the newProjectRegistry', () => {
    const unregistered = sliceFiles.filter(
      name => !ALL_REGISTERED_SLICES.includes(name),
    );
    expect(
      unregistered,
      `Unregistered slices found: ${unregistered.join(', ')}. ` +
        'Add to SLICES_THAT_RESET or SLICES_THAT_SURVIVE in src/store/newProjectRegistry.ts',
    ).toEqual([]);
  });

  it('registry contains no stale entries (no registered slices without a file)', () => {
    const stale = ALL_REGISTERED_SLICES.filter(
      name => !sliceFiles.includes(name),
    );
    expect(
      stale,
      `Registry references non-existent slices: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('no slice appears in both reset and survive lists', () => {
    const surviveNames = SLICES_THAT_SURVIVE.map(s => s.slice);
    const duplicates = SLICES_THAT_RESET.filter(s => surviveNames.includes(s));
    expect(duplicates).toEqual([]);
  });

  it('every survivor has a documented reason', () => {
    for (const entry of SLICES_THAT_SURVIVE) {
      expect(entry.reason.length, `${entry.slice} is missing a reason`).toBeGreaterThan(0);
    }
  });

  describe('slices that must reset actually import NEW_PROJECT', () => {
    for (const sliceName of SLICES_THAT_RESET) {
      it(`${sliceName} references NEW_PROJECT in its source`, () => {
        const filePath = path.join(STORE_DIR, `${sliceName}.ts`);
        const source = fs.readFileSync(filePath, 'utf-8');
        expect(
          source.includes('NEW_PROJECT'),
          `${sliceName}.ts does not reference NEW_PROJECT. ` +
            'Add an extraReducers handler: builder.addCase(NEW_PROJECT, () => initialState)',
        ).toBe(true);
      });
    }
  });

  describe('slices that survive do NOT handle NEW_PROJECT (sanity check)', () => {
    for (const { slice: sliceName } of SLICES_THAT_SURVIVE) {
      it(`${sliceName} does not reference NEW_PROJECT`, () => {
        const filePath = path.join(STORE_DIR, `${sliceName}.ts`);
        const source = fs.readFileSync(filePath, 'utf-8');
        expect(
          source.includes('NEW_PROJECT'),
          `${sliceName}.ts references NEW_PROJECT but is listed as a survivor. ` +
            'Move it to SLICES_THAT_RESET or remove the NEW_PROJECT handler.',
        ).toBe(false);
      });
    }
  });
});
