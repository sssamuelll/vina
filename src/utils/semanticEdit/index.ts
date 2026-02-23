/**
 * Semantic Edit Engine — translates garment-level concepts into parametric variable changes.
 *
 * Maps human-understandable terms ("tighter waist", "shorter sleeves") to
 * concrete variable overrides on the PatternTemplateEngine.
 *
 * @module semanticEdit
 */

import type { VariableDefinition } from '../seamly2d/formulaEvaluator';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FitRegion = 'bust' | 'waist' | 'hip' | 'shoulder' | 'neck' | 'armhole';
export type FitDirection = 'tighter' | 'looser';

export type LengthRegion = 'hem' | 'sleeve' | 'torso' | 'skirt' | 'inseam' | 'total';
export type LengthDirection = 'shorter' | 'longer';

export type SleeveProperty = 'length' | 'width' | 'cap_height' | 'ease';

export type ProportionRatio = 'shoulder_to_waist' | 'waist_to_hip' | 'front_to_back' | 'bodice_to_skirt';

export interface SemanticAdjustment {
  variableKey: string;
  oldValue: number;
  newValue: number;
  description: string;
}

// ─── Variable Classification ────────────────────────────────────────────────

/** Keywords that indicate a variable controls a specific region/property. */
const FIT_KEYWORDS: Record<FitRegion, string[]> = {
  bust: ['bust', 'chest', 'brust'],
  waist: ['waist', 'cintura', 'taille'],
  hip: ['hip', 'cadera', 'hüfte'],
  shoulder: ['shoulder', 'hombro', 'schulter'],
  neck: ['neck', 'cuello', 'hals'],
  armhole: ['armhole', 'armscye', 'sisa', 'armloch'],
};

const LENGTH_KEYWORDS: Record<LengthRegion, string[]> = {
  hem: ['hem', 'dobladillo', 'saum', 'hemline'],
  sleeve: ['sleeve', 'manga', 'ärmel', 'arm'],
  torso: ['torso', 'bodice', 'cuerpo', 'body', 'rumpf'],
  skirt: ['skirt', 'falda', 'rock'],
  inseam: ['inseam', 'entrepierna', 'schrittlänge', 'crotch'],
  total: ['height', 'total', 'length', 'largo', 'länge', 'altura'],
};

const SLEEVE_KEYWORDS: Record<SleeveProperty, string[]> = {
  length: ['length', 'largo', 'länge'],
  width: ['width', 'ancho', 'weite', 'bicep'],
  cap_height: ['cap', 'cabeza', 'kugel'],
  ease: ['ease', 'holgura', 'zugabe'],
};

const EASE_KEYWORDS = ['ease', 'holgura', 'zugabe', 'allowance', 'tolerance'];
const WIDTH_KEYWORDS = ['width', 'circumf', 'circ', 'ancho', 'weite', 'intake', 'contorno'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function matchesKeywords(key: string, desc: string, keywords: string[]): boolean {
  const k = key.toLowerCase();
  const d = desc.toLowerCase();
  return keywords.some(kw => k.includes(kw) || d.includes(kw));
}

/**
 * Find variables that control a specific fit region.
 */
export function findFitVariables(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  region: FitRegion,
): Array<{ key: string; value: number; isEase: boolean }> {
  const results: Array<{ key: string; value: number; isEase: boolean }> = [];
  const regionKw = FIT_KEYWORDS[region];

  for (const [key, def] of Object.entries(variables)) {
    const desc = def.description || '';
    if (!matchesKeywords(key, desc, regionKw)) continue;

    // Check if it's a width/circumference variable or an ease variable
    const isEase = matchesKeywords(key, desc, EASE_KEYWORDS);
    const isWidth = matchesKeywords(key, desc, WIDTH_KEYWORDS);

    if (isEase || isWidth) {
      results.push({ key, value: resolved[key] ?? 0, isEase });
    }
  }

  return results;
}

/**
 * Find variables that control a specific length region.
 */
export function findLengthVariables(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  region: LengthRegion,
): Array<{ key: string; value: number }> {
  const results: Array<{ key: string; value: number }> = [];
  const regionKw = LENGTH_KEYWORDS[region];

  for (const [key, def] of Object.entries(variables)) {
    const desc = def.description || '';
    if (!matchesKeywords(key, desc, regionKw)) continue;

    // Exclude ease, width, and cap variables — we want length/height ones
    const isEase = matchesKeywords(key, desc, EASE_KEYWORDS);
    const isWidth = matchesKeywords(key, desc, ['width', 'ancho', 'weite', 'circumf', 'circ', 'contorno']);
    const isCap = matchesKeywords(key, desc, ['cap', 'cabeza', 'kugel']);
    if (isEase || isWidth || isCap) continue;

    results.push({ key, value: resolved[key] ?? 0 });
  }

  return results;
}

/**
 * Find sleeve-specific variables.
 */
export function findSleeveVariables(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  property: SleeveProperty,
): Array<{ key: string; value: number }> {
  const results: Array<{ key: string; value: number }> = [];
  const sleeveKw = ['sleeve', 'manga', 'ärmel', 'arm'];
  const propKw = SLEEVE_KEYWORDS[property];

  for (const [key, def] of Object.entries(variables)) {
    const desc = def.description || '';
    // Must match both sleeve AND the specific property
    const isSleeve = matchesKeywords(key, desc, sleeveKw);
    const isProp = matchesKeywords(key, desc, propKw);

    if (isSleeve && isProp) {
      results.push({ key, value: resolved[key] ?? 0 });
    }
  }

  // Fallback: if no specific sleeve+property match, try just sleeve for length
  if (results.length === 0 && property === 'length') {
    for (const [key, def] of Object.entries(variables)) {
      const desc = def.description || '';
      if (matchesKeywords(key, desc, sleeveKw) && matchesKeywords(key, desc, ['length', 'largo', 'länge'])) {
        results.push({ key, value: resolved[key] ?? 0 });
      }
    }
  }

  return results;
}

// ─── Adjustment Calculators ─────────────────────────────────────────────────

/**
 * Calculate fit adjustments — distributes change across matching variables.
 * Positive amount = looser, negative = tighter.
 */
export function calculateFitAdjustment(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  region: FitRegion,
  direction: FitDirection,
  amount: number,
  unit: 'mm' | '%' = 'mm',
): SemanticAdjustment[] {
  const matches = findFitVariables(variables, resolved, region);
  if (matches.length === 0) return [];

  const sign = direction === 'looser' ? 1 : -1;

  // Prefer ease variables — they're designed for this
  const easeVars = matches.filter(m => m.isEase);
  const targets = easeVars.length > 0 ? easeVars : matches;

  // Distribute adjustment evenly across matching variables
  const perVar = amount / targets.length;

  return targets.map(({ key, value }) => {
    const delta = unit === '%' ? (value * perVar / 100) : perVar;
    return {
      variableKey: key,
      oldValue: value,
      newValue: Math.max(0, value + sign * delta),
      description: `${direction} ${region}: ${sign > 0 ? '+' : ''}${(sign * delta).toFixed(1)}${unit === '%' ? '%' : 'mm'} on ${key}`,
    };
  });
}

/**
 * Calculate length adjustments.
 */
export function calculateLengthAdjustment(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  region: LengthRegion,
  direction: LengthDirection,
  amount: number,
  unit: 'mm' | '%' = 'mm',
): SemanticAdjustment[] {
  const matches = findLengthVariables(variables, resolved, region);
  if (matches.length === 0) return [];

  const sign = direction === 'longer' ? 1 : -1;
  const perVar = amount / matches.length;

  return matches.map(({ key, value }) => {
    const delta = unit === '%' ? (value * perVar / 100) : perVar;
    return {
      variableKey: key,
      oldValue: value,
      newValue: Math.max(0, value + sign * delta),
      description: `${direction} ${region}: ${sign > 0 ? '+' : ''}${(sign * delta).toFixed(1)}${unit === '%' ? '%' : 'mm'} on ${key}`,
    };
  });
}

/**
 * Calculate sleeve adjustments.
 */
export function calculateSleeveAdjustment(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  property: SleeveProperty,
  amount: number,
  unit: 'mm' | '%' = 'mm',
): SemanticAdjustment[] {
  const matches = findSleeveVariables(variables, resolved, property);
  if (matches.length === 0) return [];

  const perVar = amount / matches.length;

  return matches.map(({ key, value }) => {
    const delta = unit === '%' ? (value * perVar / 100) : perVar;
    return {
      variableKey: key,
      oldValue: value,
      newValue: Math.max(0, value + delta),
      description: `sleeve ${property}: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${unit === '%' ? '%' : 'mm'} on ${key}`,
    };
  });
}

/**
 * Calculate proportion adjustments — shifts balance between regions.
 */
export function calculateProportionAdjustment(
  variables: Record<string, VariableDefinition>,
  resolved: Record<string, number>,
  ratio: ProportionRatio,
  shift: number, // positive = more of first region, negative = more of second
  unit: 'mm' | '%' = 'mm',
): SemanticAdjustment[] {
  const adjustments: SemanticAdjustment[] = [];

  const regionMap: Record<ProportionRatio, [FitRegion | LengthRegion, FitRegion | LengthRegion]> = {
    shoulder_to_waist: ['shoulder', 'waist'],
    waist_to_hip: ['waist', 'hip'],
    front_to_back: ['bust', 'hip'], // front generally affects bust, back affects hip
    bodice_to_skirt: ['torso', 'skirt'],
  };

  const [regionA, regionB] = regionMap[ratio];

  // Region A gets +shift, Region B gets -shift
  const fitRegions: FitRegion[] = ['bust', 'waist', 'hip', 'shoulder', 'neck', 'armhole'];
  const lengthRegions: LengthRegion[] = ['hem', 'sleeve', 'torso', 'skirt', 'inseam', 'total'];

  if (fitRegions.includes(regionA as FitRegion)) {
    adjustments.push(
      ...calculateFitAdjustment(variables, resolved, regionA as FitRegion, shift > 0 ? 'looser' : 'tighter', Math.abs(shift), unit),
    );
  } else if (lengthRegions.includes(regionA as LengthRegion)) {
    adjustments.push(
      ...calculateLengthAdjustment(variables, resolved, regionA as LengthRegion, shift > 0 ? 'longer' : 'shorter', Math.abs(shift), unit),
    );
  }

  if (fitRegions.includes(regionB as FitRegion)) {
    adjustments.push(
      ...calculateFitAdjustment(variables, resolved, regionB as FitRegion, shift > 0 ? 'tighter' : 'looser', Math.abs(shift), unit),
    );
  } else if (lengthRegions.includes(regionB as LengthRegion)) {
    adjustments.push(
      ...calculateLengthAdjustment(variables, resolved, regionB as LengthRegion, shift > 0 ? 'shorter' : 'longer', Math.abs(shift), unit),
    );
  }

  return adjustments;
}
