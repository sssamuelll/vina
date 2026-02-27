/**
 * Pattern Knowledge Base — Domain expertise for pattern making.
 *
 * Contains:
 * - Standard ease amounts
 * - Seam allowance standards
 * - Grading rules
 * - Construction techniques
 * - Fabric properties
 * - Industry standards
 *
 * @module patternKnowledge
 */

// ============================================================================
// Ease Standards
// ============================================================================

/**
 * Standard ease amounts by garment type and fit.
 * All values in cm.
 */
export const EASE_STANDARDS = {
  /** Ease for different body areas */
  body: {
    bust: {
      tight: 2.5,      // Fitted/body-hugging
      fitted: 5.0,     // Close-fitting
      standard: 7.5,   // Comfortable
      relaxed: 10.0,   // Loose
      oversized: 15.0, // Very loose
    },
    waist: {
      tight: 1.0,
      fitted: 2.5,
      standard: 4.0,
      relaxed: 6.0,
      oversized: 10.0,
    },
    hip: {
      tight: 2.0,
      fitted: 5.0,
      standard: 7.5,
      relaxed: 10.0,
      oversized: 15.0,
    },
    armhole: {
      tight: 2.5,
      fitted: 4.0,
      standard: 5.0,
      relaxed: 6.5,
      oversized: 8.0,
    },
    sleeve: {
      tight: 3.0,
      fitted: 5.0,
      standard: 7.5,
      relaxed: 10.0,
      oversized: 12.5,
    },
  },

  /** Ease by garment type */
  garment: {
    tshirt: { bust: 7.5, waist: 7.5, hip: 7.5 },
    blouse: { bust: 7.5, waist: 5.0, hip: 7.5 },
    dress_fitted: { bust: 5.0, waist: 2.5, hip: 5.0 },
    dress_loose: { bust: 10.0, waist: 10.0, hip: 10.0 },
    jacket: { bust: 10.0, waist: 10.0, hip: 10.0 },
    coat: { bust: 12.5, waist: 12.5, hip: 12.5 },
    pants_fitted: { waist: 1.0, hip: 2.5 },
    pants_relaxed: { waist: 2.5, hip: 5.0 },
    skirt: { waist: 1.0, hip: 5.0 },
  },
} as const;

/**
 * Get recommended ease for a measurement.
 */
export function getRecommendedEase(
  area: keyof typeof EASE_STANDARDS.body,
  fit: 'tight' | 'fitted' | 'standard' | 'relaxed' | 'oversized' = 'standard'
): number {
  return EASE_STANDARDS.body[area]?.[fit] ?? 5.0;
}

// ============================================================================
// Seam Allowance Standards
// ============================================================================

/**
 * Standard seam allowances by application.
 * All values in mm.
 */
export const SEAM_ALLOWANCES = {
  /** Standard seam allowances */
  standard: {
    general: 10,       // Most seams
    armhole: 10,       // Armhole
    neckline: 6,       // Neckline (smaller for curves)
    hem: 25,           // Hem allowance
    facing: 6,         // Facings
    zipper: 15,        // Zipper seams
    buttonhole: 20,    // Button/buttonhole areas
  },

  /** By seam type */
  byType: {
    plain: 10,
    french: 12,        // French seam needs more
    flat_felled: 15,   // Flat-felled needs more
    overlock: 10,
    bound: 6,          // Bound edges need less
    rolled: 4,         // Rolled hems
  },

  /** Industrial standards */
  industrial: {
    ready_to_wear: 10,
    haute_couture: 15,
    bridal: 15,
    sportswear: 8,
    lingerie: 6,
  },
} as const;

/**
 * Get recommended seam allowance.
 */
export function getRecommendedSeamAllowance(
  application: keyof typeof SEAM_ALLOWANCES.standard = 'general'
): number {
  return SEAM_ALLOWANCES.standard[application] ?? 10;
}

// ============================================================================
// Grading Rules
// ============================================================================

/**
 * Standard grading increments between sizes.
 * All values in cm.
 */
export const GRADING_RULES = {
  /** Size increments (difference between adjacent sizes) */
  increments: {
    bust: 4.0,
    waist: 4.0,
    hip: 4.0,
    shoulder: 1.0,
    armhole_depth: 0.5,
    sleeve_length: 1.0,
    back_length: 0.5,
    neckline: 0.3,
  },

  /** Distribution of grade (how increments are split across pattern) */
  distribution: {
    bust: { center_front: 0.25, side: 0.5, center_back: 0.25 },
    waist: { center_front: 0.25, side: 0.5, center_back: 0.25 },
    hip: { center_front: 0.25, side: 0.5, center_back: 0.25 },
    shoulder: { neck: 0.33, armhole: 0.67 },
  },

  /** Size range names */
  sizeRanges: {
    us: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    eu: ['32', '34', '36', '38', '40', '42', '44', '46', '48'],
    uk: ['4', '6', '8', '10', '12', '14', '16', '18', '20'],
  },
} as const;

/**
 * Calculate graded measurement.
 */
export function calculateGradedMeasurement(
  baseMeasurement: number,
  baseSize: number,
  targetSize: number,
  measurement: keyof typeof GRADING_RULES.increments
): number {
  const increment = GRADING_RULES.increments[measurement] ?? 4.0;
  const sizeDiff = targetSize - baseSize;
  return baseMeasurement + (increment * sizeDiff);
}

// ============================================================================
// Fabric Properties
// ============================================================================

/**
 * Fabric behavior properties.
 */
export const FABRIC_PROPERTIES = {
  /** Stretch categories */
  stretch: {
    none: { stretchPercent: 0, ease_reduction: 0 },
    low: { stretchPercent: 5, ease_reduction: 1.0 },
    medium: { stretchPercent: 15, ease_reduction: 2.5 },
    high: { stretchPercent: 25, ease_reduction: 5.0 },
    four_way: { stretchPercent: 50, ease_reduction: 7.5 },
  },

  /** Weight categories (gsm) */
  weight: {
    sheer: { minGsm: 0, maxGsm: 60, drape: 'high', support: 'low' },
    light: { minGsm: 60, maxGsm: 135, drape: 'medium-high', support: 'low' },
    medium: { minGsm: 135, maxGsm: 200, drape: 'medium', support: 'medium' },
    heavy: { minGsm: 200, maxGsm: 350, drape: 'low', support: 'high' },
    very_heavy: { minGsm: 350, maxGsm: 1000, drape: 'minimal', support: 'high' },
  },

  /** Common fabric types */
  types: {
    cotton_woven: { stretch: 'none', weight: 'medium', grain: true },
    cotton_jersey: { stretch: 'medium', weight: 'light', grain: true },
    silk: { stretch: 'none', weight: 'light', grain: true },
    wool: { stretch: 'low', weight: 'medium', grain: true },
    denim: { stretch: 'low', weight: 'heavy', grain: true },
    stretch_denim: { stretch: 'medium', weight: 'heavy', grain: true },
    lycra: { stretch: 'four_way', weight: 'light', grain: false },
    linen: { stretch: 'none', weight: 'medium', grain: true },
    chiffon: { stretch: 'none', weight: 'sheer', grain: true },
    velvet: { stretch: 'none', weight: 'medium', grain: true, nap: true },
  },
} as const;

/**
 * Get fabric ease adjustment.
 */
export function getFabricEaseAdjustment(
  stretchLevel: keyof typeof FABRIC_PROPERTIES.stretch
): number {
  return FABRIC_PROPERTIES.stretch[stretchLevel]?.ease_reduction ?? 0;
}

// ============================================================================
// Construction Techniques
// ============================================================================

/**
 * Common construction techniques and their requirements.
 */
export const CONSTRUCTION_TECHNIQUES = {
  /** Dart types */
  darts: {
    bust: { typical_intake: 25, typical_length: 100, placement: 'apex' },
    waist: { typical_intake: 15, typical_length: 80, placement: 'waistline' },
    shoulder: { typical_intake: 10, typical_length: 70, placement: 'shoulder' },
    elbow: { typical_intake: 20, typical_length: 60, placement: 'elbow' },
  },

  /** Seam types and their uses */
  seams: {
    plain: { use: ['most seams'], bulk: 'medium', finish_required: true },
    french: { use: ['sheer fabrics', 'lingerie'], bulk: 'low', finish_required: false },
    flat_felled: { use: ['jeans', 'sportswear'], bulk: 'low', finish_required: false },
    overlock: { use: ['knits', 'general'], bulk: 'low', finish_required: false },
    bound: { use: ['unlined jackets', 'couture'], bulk: 'low', finish_required: false },
  },

  /** Closure types */
  closures: {
    zipper_invisible: { overlap: 0, seam_allowance: 15 },
    zipper_centered: { overlap: 0, seam_allowance: 15 },
    zipper_lapped: { overlap: 3, seam_allowance: 20 },
    buttons: { overlap: 15, spacing: 75 },
    hooks_eyes: { overlap: 10 },
    snaps: { overlap: 10, spacing: 50 },
  },

  /** Hem types */
  hems: {
    turned: { depth: 25, folds: 2 },
    blind: { depth: 40, folds: 1 },
    rolled: { depth: 5, folds: 3 },
    faced: { depth: 50, folds: 1 },
    bound: { depth: 0, folds: 0 },
  },
} as const;

// ============================================================================
// Industry Standards
// ============================================================================

/**
 * Industry standard measurements and conventions.
 */
export const INDUSTRY_STANDARDS = {
  /** Notch types */
  notches: {
    single: 'front',
    double: 'back',
    triangle: 'center',
  },

  /** Grain line orientation */
  grainline: {
    bodice_front: 'vertical_center',
    bodice_back: 'vertical_center',
    sleeve: 'vertical_center',
    skirt: 'vertical_center',
    collar: 'horizontal_fold',
    cuff: 'horizontal_fold',
  },

  /** Standard measurements base (cm) - Size 8/36/M */
  base_measurements: {
    bust: 88,
    waist: 70,
    hip: 94,
    shoulder: 40,
    back_length: 41,
    front_length: 43,
    arm_length: 58,
    wrist: 16,
    neck: 36,
    armhole_depth: 21,
    inseam: 78,
    outseam: 106,
  },

  /** Pattern marking symbols */
  symbols: {
    grainline: 'arrow',
    fold: 'brackets',
    notch: 'triangle_or_line',
    button: 'x',
    buttonhole: 'rectangle',
    dart: 'lines_to_point',
    pleat: 'arrows',
    gather: 'wavy_line',
  },
} as const;

// ============================================================================
// Knowledge Query Functions
// ============================================================================

/**
 * Query the knowledge base for information.
 */
export interface KnowledgeQuery {
  topic: 'ease' | 'seam_allowance' | 'grading' | 'fabric' | 'construction' | 'standards';
  context?: string;
  garmentType?: string;
  fabricType?: string;
}

/**
 * Get knowledge about a specific topic.
 */
export function queryKnowledge(query: KnowledgeQuery): string {
  switch (query.topic) {
    case 'ease':
      return formatEaseKnowledge(query.garmentType, query.context);
    case 'seam_allowance':
      return formatSeamAllowanceKnowledge(query.context);
    case 'grading':
      return formatGradingKnowledge();
    case 'fabric':
      return formatFabricKnowledge(query.fabricType);
    case 'construction':
      return formatConstructionKnowledge(query.context);
    case 'standards':
      return formatStandardsKnowledge();
    default:
      return 'No knowledge available for this topic.';
  }
}

function formatEaseKnowledge(garmentType?: string, area?: string): string {
  const lines: string[] = ['## Ease Standards\n'];

  if (garmentType && garmentType in EASE_STANDARDS.garment) {
    const ease = EASE_STANDARDS.garment[garmentType as keyof typeof EASE_STANDARDS.garment];
    lines.push(`**${garmentType}:**`);
    for (const [key, value] of Object.entries(ease)) {
      lines.push(`- ${key}: ${value}cm`);
    }
  } else {
    lines.push('**By fit level (bust):**');
    for (const [fit, value] of Object.entries(EASE_STANDARDS.body.bust)) {
      lines.push(`- ${fit}: ${value}cm`);
    }
  }

  return lines.join('\n');
}

function formatSeamAllowanceKnowledge(context?: string): string {
  const lines: string[] = ['## Seam Allowances\n'];
  lines.push('**Standard allowances:**');
  for (const [type, value] of Object.entries(SEAM_ALLOWANCES.standard)) {
    lines.push(`- ${type}: ${value}mm`);
  }
  return lines.join('\n');
}

function formatGradingKnowledge(): string {
  const lines: string[] = ['## Grading Rules\n'];
  lines.push('**Size increments:**');
  for (const [area, value] of Object.entries(GRADING_RULES.increments)) {
    lines.push(`- ${area}: ${value}cm per size`);
  }
  return lines.join('\n');
}

function formatFabricKnowledge(fabricType?: string): string {
  const lines: string[] = ['## Fabric Properties\n'];
  if (fabricType && fabricType in FABRIC_PROPERTIES.types) {
    const props = FABRIC_PROPERTIES.types[fabricType as keyof typeof FABRIC_PROPERTIES.types];
    lines.push(`**${fabricType}:**`);
    lines.push(`- Stretch: ${props.stretch}`);
    lines.push(`- Weight: ${props.weight}`);
    lines.push(`- Has grain: ${props.grain}`);
  } else {
    lines.push('**Available fabric types:**');
    for (const type of Object.keys(FABRIC_PROPERTIES.types)) {
      lines.push(`- ${type.replace(/_/g, ' ')}`);
    }
  }
  return lines.join('\n');
}

function formatConstructionKnowledge(context?: string): string {
  const lines: string[] = ['## Construction Techniques\n'];
  lines.push('**Seam types:**');
  for (const [type, info] of Object.entries(CONSTRUCTION_TECHNIQUES.seams)) {
    lines.push(`- ${type}: ${info.use.join(', ')}`);
  }
  return lines.join('\n');
}

function formatStandardsKnowledge(): string {
  const lines: string[] = ['## Industry Standards\n'];
  lines.push('**Base measurements (Size M/36/8):**');
  for (const [area, value] of Object.entries(INDUSTRY_STANDARDS.base_measurements)) {
    lines.push(`- ${area.replace(/_/g, ' ')}: ${value}cm`);
  }
  return lines.join('\n');
}
