import { helpers } from '../format';
import type { Locale } from '../locale';

/** What a catalog function's parameter carries: text, a measured number, or the count handed to `plural`. */
export type ParamKind = 'string' | 'number' | 'count';

const NUMBER_SENTINEL = 12.3456;
const COUNT_SENTINEL = 5;
// Letters only: a digit in a marker would read as a number or count token.
const marker = (i: number) => `⟦p${String.fromCharCode(97 + i)}⟧`;

function callWith(fn: (...args: never[]) => unknown, args: unknown[]): unknown {
  return (fn as (...a: unknown[]) => unknown)(...args);
}

/**
 * Calls a catalog function entry with sentinel arguments and returns what is wrong with its output
 * (spec § 8.2, catalog parameter test): every string parameter must appear verbatim; every number
 * parameter must appear as a whole numeric token equal to this locale's `num()` at 0 to 3 decimals,
 * and never as the raw `String(x)`; a count must appear as digits for 5 and still return text for 1 and 0.
 * It cannot tell two same-typed parameters apart: that stays with the reviewer.
 */
export function checkEntryParams(
  fn: (...args: never[]) => unknown,
  locale: Locale,
  kinds: readonly ParamKind[],
): string[] {
  const args = kinds.map((kind, i) => (kind === 'string' ? marker(i) : kind === 'number' ? NUMBER_SENTINEL : COUNT_SENTINEL));
  const out = callWith(fn, args);
  if (typeof out !== 'string') return [`returned ${typeof out}, not text`];
  const tokens: string[] = out.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const { num } = helpers(locale);
  const numberForms = [0, 1, 2, 3].map((d) => num(NUMBER_SENTINEL, d));
  const problems: string[] = [];
  kinds.forEach((kind, i) => {
    if (kind === 'string' && !out.includes(marker(i))) problems.push(`parameter ${i} (text) is missing from "${out}"`);
    if (kind === 'number') {
      if (out.includes(String(NUMBER_SENTINEL))) problems.push(`parameter ${i} is printed raw in "${out}"; use num()`);
      else if (!tokens.some((tok) => numberForms.includes(tok))) {
        problems.push(`parameter ${i} (number) is missing from "${out}", or not formatted for ${locale}`);
      }
    }
    if (kind === 'count') {
      if (!tokens.includes(String(COUNT_SENTINEL))) problems.push(`parameter ${i} (count) is missing from "${out}"`);
      for (const n of [1, 0]) {
        const other = callWith(fn, args.map((a, j) => (j === i ? n : a)));
        if (typeof other !== 'string') problems.push(`parameter ${i} = ${n} returned ${typeof other}, not text`);
      }
    }
  });
  return problems;
}
