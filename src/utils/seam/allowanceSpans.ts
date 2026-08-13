import type { SeamAllowanceSpan } from '../../types/types';

// Comparte el mínimo perceptible del gesto sin acoplar la geometría del
// dominio a un módulo de React.
const MIN_SPAN_T = 0.01;

function hasUsefulLength(span: SeamAllowanceSpan): boolean {
  return span.tEnd - span.tStart >= MIN_SPAN_T;
}

/**
 * La escritura más reciente manda porque cada arrastre expresa la última
 * intención del usuario; los restos anteriores se conservan donde no chocan.
 */
export function normalizeSpans(
  spans: readonly SeamAllowanceSpan[],
): SeamAllowanceSpan[] {
  let normalized: SeamAllowanceSpan[] = [];

  for (const candidate of spans) {
    if (!hasUsefulLength(candidate)) continue;

    const survivors: SeamAllowanceSpan[] = [];
    for (const existing of normalized) {
      if (existing.tEnd <= candidate.tStart || existing.tStart >= candidate.tEnd) {
        survivors.push(existing);
        continue;
      }

      const left = { ...existing, tEnd: candidate.tStart };
      const right = { ...existing, tStart: candidate.tEnd };
      if (hasUsefulLength(left)) survivors.push(left);
      if (hasUsefulLength(right)) survivors.push(right);
    }

    survivors.push({ ...candidate });
    normalized = survivors;
  }

  return normalized.sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
}
