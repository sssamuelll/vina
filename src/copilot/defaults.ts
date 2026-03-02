/**
 * Smart Defaults — sensible default values for pattern pieces created by the agent.
 *
 * When the agent creates pieces, these defaults provide standard industry values
 * for seam allowances, grainline placement, notch positions, and piece naming.
 *
 * @module defaults
 */

import type { AgentLanguage } from './perception/languageDetection';
import { getLocalizedPieceName } from './perception/languageDetection';

// ─── Seam Allowance Defaults ────────────────────────────────────────────────

/** Standard seam allowance values in mm by edge type */
export interface SeamAllowanceDefaults {
  /** Standard seam SA (side seams, shoulder seams, etc.) */
  seam: number;
  /** Hem allowance (bottom of skirts, sleeves) */
  hem: number;
  /** Armhole / armscye SA (smaller for smooth curve) */
  armhole: number;
  /** Neckline SA */
  neckline: number;
  /** Waistband SA */
  waistband: number;
}

/**
 * Default seam allowance values per edge type.
 * Based on standard industrial pattern-making practice.
 */
export const SA_DEFAULTS: Readonly<SeamAllowanceDefaults> = {
  seam: 10,       // 10mm = 1cm standard seam
  hem: 15,        // 15mm for hems (some prefer 30-40 for skirts)
  armhole: 7,     // 7mm for armholes — tighter curve needs less
  neckline: 7,    // 7mm for necklines
  waistband: 10,  // 10mm for waistband attachment
};

/**
 * Get the recommended seam allowance for a piece based on its template type.
 *
 * @param templateId - The template identifier (e.g. 'bodice-front', 'sleeve')
 * @returns Recommended SA in mm (uses the standard seam value as default)
 */
export function getDefaultSA(templateId: string): number {
  // Most pieces use standard seam SA
  // Collar pieces might use a smaller SA
  if (templateId === 'collar') return SA_DEFAULTS.neckline;
  return SA_DEFAULTS.seam;
}

// ─── Grainline Defaults ─────────────────────────────────────────────────────

/** Grainline direction specification */
export type GrainlineDirection = 'vertical' | 'horizontal' | 'bias-45';

/**
 * Default grainline directions by piece template.
 * - Bodice/skirt: vertical (parallel to center front/back)
 * - Sleeve: vertical (parallel to center of sleeve)
 * - Collar: horizontal (along the fold)
 */
const GRAINLINE_DEFAULTS: Record<string, GrainlineDirection> = {
  'bodice-front': 'vertical',
  'bodice-back':  'vertical',
  'sleeve':       'vertical',
  'skirt-front':  'vertical',
  'skirt-back':   'vertical',
  'pants-front':  'vertical',
  'pants-back':   'vertical',
  'collar':       'horizontal',
};

/**
 * Get the default grainline direction for a piece template.
 *
 * @param templateId - Template identifier
 * @returns Default grainline direction
 */
export function getDefaultGrainline(templateId: string): GrainlineDirection {
  return GRAINLINE_DEFAULTS[templateId] ?? 'vertical';
}

// ─── Notch Defaults ─────────────────────────────────────────────────────────

/**
 * Standard notch position for a piece, expressed as edge fractions (0–1).
 *
 * These represent the standard positions where notches are typically placed
 * on each piece type to aid garment assembly.
 */
export interface NotchPosition {
  /** Position along the outline (0–1 fraction of perimeter) */
  edgePosition: number;
  /** Label describing this notch position */
  label: string;
  /** Number of notch marks: 1=front, 2=back */
  count: 1 | 2 | 3;
}

/**
 * Default notch positions by piece template.
 * Based on standard industrial practice:
 * - Single notch: front pieces
 * - Double notch: back pieces
 */
const NOTCH_DEFAULTS: Record<string, NotchPosition[]> = {
  'bodice-front': [
    { edgePosition: 0.25, label: 'side-seam', count: 1 },
    { edgePosition: 0.50, label: 'shoulder', count: 1 },
  ],
  'bodice-back': [
    { edgePosition: 0.25, label: 'side-seam', count: 2 },
    { edgePosition: 0.50, label: 'shoulder', count: 2 },
  ],
  'sleeve': [
    { edgePosition: 0.25, label: 'front-notch', count: 1 },
    { edgePosition: 0.50, label: 'sleeve-head', count: 1 },
    { edgePosition: 0.75, label: 'back-notch', count: 2 },
  ],
  'skirt-front': [
    { edgePosition: 0.20, label: 'side-seam', count: 1 },
  ],
  'skirt-back': [
    { edgePosition: 0.20, label: 'side-seam', count: 2 },
  ],
  'pants-front': [
    { edgePosition: 0.15, label: 'side-seam', count: 1 },
    { edgePosition: 0.45, label: 'knee', count: 1 },
  ],
  'pants-back': [
    { edgePosition: 0.15, label: 'side-seam', count: 2 },
    { edgePosition: 0.45, label: 'knee', count: 2 },
  ],
};

/**
 * Get default notch positions for a piece template.
 *
 * @param templateId - Template identifier
 * @returns Array of default notch positions, or empty array if none defined
 */
export function getDefaultNotches(templateId: string): NotchPosition[] {
  return NOTCH_DEFAULTS[templateId] ?? [];
}

// ─── Piece Positioning ──────────────────────────────────────────────────────

/**
 * Default positioning offsets for arranging pieces on the canvas.
 * When generating multiple pieces, they should be laid out logically.
 */
export interface PieceLayout {
  /** X offset from origin in mm */
  x: number;
  /** Y offset from origin in mm */
  y: number;
}

/**
 * Get default canvas positions for a set of template IDs.
 * Places pieces in a logical layout: front left, back right, etc.
 *
 * @param templateIds - Array of template identifiers to position
 * @returns Map of templateId → position
 */
export function getDefaultPositions(templateIds: string[]): Record<string, PieceLayout> {
  const positions: Record<string, PieceLayout> = {};
  const spacing = 350; // mm gap between pieces
  let col = 0;

  // Group by category: front pieces first, then back, then accessories
  const frontPieces = templateIds.filter(t => t.includes('front'));
  const backPieces = templateIds.filter(t => t.includes('back'));
  const other = templateIds.filter(t => !t.includes('front') && !t.includes('back'));

  for (const id of frontPieces) {
    positions[id] = { x: 50 + col * spacing, y: 50 };
    col++;
  }
  for (const id of backPieces) {
    positions[id] = { x: 50 + col * spacing, y: 50 };
    col++;
  }
  for (const id of other) {
    positions[id] = { x: 50 + col * spacing, y: 50 };
    col++;
  }

  return positions;
}

// ─── Full Defaults Bundle ───────────────────────────────────────────────────

/**
 * Complete set of defaults for a piece being created.
 */
export interface PieceDefaults {
  name: string;
  seamAllowance: number;
  grainlineDirection: GrainlineDirection;
  notches: NotchPosition[];
  position: PieceLayout;
}

/**
 * Get all defaults for a piece given its template and the generation context.
 *
 * @param templateId - Template identifier
 * @param language - User's language preference
 * @param allTemplates - All templates being generated (for positioning)
 * @returns Complete defaults for the piece
 */
export function getPieceDefaults(
  templateId: string,
  language: AgentLanguage,
  allTemplates: string[],
): PieceDefaults {
  const positions = getDefaultPositions(allTemplates);

  return {
    name: getLocalizedPieceName(templateId, language),
    seamAllowance: getDefaultSA(templateId),
    grainlineDirection: getDefaultGrainline(templateId),
    notches: getDefaultNotches(templateId),
    position: positions[templateId] ?? { x: 50, y: 50 },
  };
}
