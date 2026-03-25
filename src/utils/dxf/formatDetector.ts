import type { DXFDocument, DetectionResult, LayerRole } from './types';
import { FORMAT_PROFILES } from './formatProfiles';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function collectLayerNames(doc: DXFDocument): Set<string> {
  const names = new Set<string>();
  for (const layer of doc.layers) {
    names.add(layer.name.toUpperCase());
  }
  for (const e of doc.entities) {
    if (e.layer) names.add(e.layer.toUpperCase());
  }
  for (const [, block] of doc.blocks) {
    for (const e of block.entities) {
      if (e.layer) names.add(e.layer.toUpperCase());
    }
  }
  return names;
}

/**
 * For each profile, score how well the document's layers match it.
 *
 * Roles are deduplicated so that alias entries (e.g., '1' and 'CUT' both
 * mapping to 'cut') count as one unit of evidence. A role is considered
 * matched if ANY of its keys or patterns are present in the document.
 *
 * Denominator = min(totalRolesInProfile, totalLayersInDoc) so that a
 * document composed entirely of profile-recognised layers scores 100%,
 * while documents with many unrecognised layers are not penalised beyond
 * what is actually measurable from the provided evidence.
 */
function scoreProfile(
  layerNames: Set<string>,
  layerMap: Record<string, LayerRole>,
  layerPatterns: Array<{ pattern: RegExp; role: LayerRole }>,
): number {
  // Build per-role key buckets
  const roleKeys = new Map<LayerRole, string[]>();
  for (const [key, role] of Object.entries(layerMap)) {
    const bucket = roleKeys.get(role) ?? [];
    bucket.push(key.toUpperCase());
    roleKeys.set(role, bucket);
  }

  // Build per-role pattern buckets
  const rolePatterns = new Map<LayerRole, RegExp[]>();
  for (const { pattern, role } of layerPatterns) {
    const bucket = rolePatterns.get(role) ?? [];
    bucket.push(pattern);
    rolePatterns.set(role, bucket);
  }

  const allRoles = new Set<LayerRole>([...roleKeys.keys(), ...rolePatterns.keys()]);
  if (allRoles.size === 0) return 0;

  let matchedRoles = 0;
  for (const role of allRoles) {
    const keys = roleKeys.get(role) ?? [];
    const keyMatched = keys.some(k => layerNames.has(k));

    const patterns = rolePatterns.get(role) ?? [];
    const patternMatched = patterns.some(p => {
      for (const name of layerNames) {
        if (p.test(name)) return true;
      }
      return false;
    });

    if (keyMatched || patternMatched) matchedRoles++;
  }

  // Denominator uses the profile's total roles (recall-based) to prevent
  // inflated confidence when a DXF has very few layers. A 2-layer file
  // matching 2 of 10 expected roles should not score 100%.
  const baseScore = (matchedRoles / allRoles.size) * 100;

  // Bonus: if ALL document layers are recognised by this profile (high
  // precision), boost score — but cap at 80% when less than half the
  // profile's roles are matched (weak evidence).
  const precision = layerNames.size > 0 ? matchedRoles / layerNames.size : 0;
  const precisionBonus = precision >= 1.0 ? 15 : 0;
  const cappedScore = matchedRoles < allRoles.size / 2
    ? Math.min(baseScore + precisionBonus, 80)
    : baseScore + precisionBonus;

  return cappedScore;
}

export function detectDXFFormat(doc: DXFDocument): DetectionResult[] {
  const layerNames = collectLayerNames(doc);
  const results: DetectionResult[] = [];

  for (const profile of Object.values(FORMAT_PROFILES)) {
    if (profile.id === 'standard') continue;

    const baseScore = scoreProfile(layerNames, profile.layerMap, profile.layerPatterns);

    let hookBonus = 0;
    if (profile.detectHook) {
      try {
        const raw = profile.detectHook(doc);
        hookBonus = (typeof raw === 'number' && !isNaN(raw)) ? clamp(raw, -50, 50) : 0;
      } catch {
        hookBonus = 0;
      }
    }

    const confidence = clamp(Math.round(baseScore + hookBonus), 0, 100);
    if (confidence > 0) {
      results.push({ profileId: profile.id, name: profile.name, confidence });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);

  if (results.length === 0) {
    return [{ profileId: 'standard', name: 'Standard DXF', confidence: 10 }];
  }

  return results;
}
