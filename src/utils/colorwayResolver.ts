import type { Colorway } from '../types/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedPieceMaterial {
  color: string;
  fabricId: string;
  textureUrl?: string;
  isOverridden: boolean;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolves the final material for a pattern piece given the active colorway.
 *
 * Resolution order:
 *   1. Determine fabricCode (piece.fabricCode ?? 'SELF')
 *   2. Look up base material from baseFabrics; fall back to grey/cotton-poplin defaults
 *   3. If no activeColorwayId → return base
 *   4. If colorway not found → return base
 *   5. If no override entry (or entry is null) → return base
 *   6. Apply override fields (invalid fabricId is silently ignored)
 *   7. Return with isOverridden: true
 */
export function resolveColorway(
  piece: { fabricCode?: string; fabricId?: string },
  colorways: Colorway[],
  activeColorwayId: string | null,
  baseFabrics: Record<string, { color: string; fabricId: string; textureUrl?: string }>,
  fabricLibraryIds: Set<string>,
): ResolvedPieceMaterial {
  // Step 1: Resolve fabricCode
  const fabricCode = piece.fabricCode ?? 'SELF';

  // Step 2: Look up base material, with fallback
  const baseEntry = baseFabrics[fabricCode];
  const base: ResolvedPieceMaterial = baseEntry
    ? {
        color: baseEntry.color,
        fabricId: baseEntry.fabricId,
        textureUrl: baseEntry.textureUrl,
        isOverridden: false,
      }
    : {
        color: '#cccccc',
        fabricId: piece.fabricId ?? 'cotton-poplin',
        textureUrl: undefined,
        isOverridden: false,
      };

  // Step 3: No active colorway → return base
  if (activeColorwayId === null) {
    return base;
  }

  // Step 4: Find active colorway
  const colorway = colorways.find((cw) => cw.id === activeColorwayId);
  if (!colorway) {
    return base;
  }

  // Step 5: Look up override for this fabricCode
  const override = colorway.overrides[fabricCode];
  if (override == null) {
    // Both undefined (not found) and null (deleted) → return base
    return base;
  }

  // Step 6: Apply override fields
  const resolved: ResolvedPieceMaterial = {
    color: base.color,
    fabricId: base.fabricId,
    textureUrl: base.textureUrl,
    isOverridden: true,
  };

  if (override.color !== undefined) {
    resolved.color = override.color;
  }

  if (override.fabricId !== undefined && fabricLibraryIds.has(override.fabricId)) {
    resolved.fabricId = override.fabricId;
  }

  if (override.textureUrl !== undefined) {
    resolved.textureUrl = override.textureUrl;
  }

  // Step 7: Return with isOverridden: true
  return resolved;
}
