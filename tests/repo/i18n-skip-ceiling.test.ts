import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `data-i18n-skip` hides a subtree from the pseudo sweep (spec § 8.3). Each one is a hole in the
 * sweep, so their count has a ceiling that only goes down.
 */
const CEILING = 0;

describe('data-i18n-skip ceiling', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(tsx?|css|html)$/.test(f) && !/__tests__|\.test\./.test(f));
  const count = files.reduce((n, f) => n + (readFileSync(f, 'utf8').match(/data-i18n-skip/g)?.length ?? 0), 0);

  it('does not rise', () => {
    expect(count).toBeLessThanOrEqual(CEILING);
  });

  it('is lowered when the count falls', () => {
    expect(count, 'lower CEILING in tests/repo/i18n-skip-ceiling.test.ts').toBe(CEILING);
  });
});
