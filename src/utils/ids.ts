/**
 * Canonical ID generator for opaque entity identifiers.
 *
 * Returns a v4 UUID via `crypto.randomUUID()`. Use this for any entity that
 * needs a unique identifier where the format is not significant for correctness
 * or external interoperability — pieces, seams, internal lines, trims,
 * construction points, copilot-emitted UI ephemera, suggestions, log entries,
 * darts, grainlines, etc.
 *
 * Do NOT use this for:
 *
 * - **Composite IDs that encode state** (e.g., `pin_${vertexIndex}`,
 *   `ann_${text}`, `${parentId}-clone-${...}`, `auto-seam-${rankIndex}`).
 *   Those are a separate concern (B10-state — source-of-truth review).
 *   Leave them as inline templates with a `// state-encoded ID — see B10-state`
 *   comment until B10-state's RFC reviews them.
 *
 * - **IDs with format contracts** asserted by tests or external specs:
 *     - `planTypes.genPlanId` / `genStepId` — `planTypes.test.ts` asserts
 *       `^plan-\d+-\d+$` and `^step-\d+-\d+$`.
 *     - `bomExtractor.nextId` — has explicit counter reset; deterministic
 *       re-extraction is the contract.
 *     - `exportAAMA.nextHandle` — DXF AAMA/ASTM format requires hex strings.
 *     - `ollama.ts` inline IDs — `ollama.test.ts:128` asserts `^ollama-/`.
 *   These were preserved during the B11-state migration with the same
 *   `// format-asserted by test — see B10-state` comment style.
 *
 * Background: B11-state (drift audit axis B11-state) — replaces 13 historical
 * ID-generator helpers and ~30 inline `Date.now()`-based patterns with a
 * single canonical that eliminates same-millisecond collisions and removes
 * the cognitive overhead of multiple ID-generation conventions.
 */
export function newId(): string {
  return crypto.randomUUID();
}
