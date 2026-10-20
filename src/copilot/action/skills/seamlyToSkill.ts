/**
 * Seamly2D to Skill Converter — transforms .sm2d patterns into CommunitySkill format.
 *
 * Converts Seamly2D pattern files into the CommunitySkill format that the
 * Copilot can use to help users draft garments. Includes:
 * - Natural language instruction generation
 * - Bilingual trigger generation (ES/EN)
 * - Tag inference from pattern names
 * - Formula extraction from variables
 *
 * @module skills/seamlyToSkill
 */
import type { CommunitySkill, CommunitySkillMetadata } from './communityFormat';
import type { ConstructionStep, DraftingMethod, Formula, PatternSkill } from './types';
import { parseSeamlyXML, type SeamlyPattern } from './seamlyParser';
import { generateInstruction, getToolCalls } from './instructionGenerator';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalSteps: number;
    convertedSteps: number;
    pieces: number;
    measurements: string[];
  };
}

export interface ConversionResult {
  skill: CommunitySkill;
  validation: ImportValidation;
}

// ─── String Utilities ────────────────────────────────────────────────────────

/** Slugify a string for use as ID */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Humanize a snake_case or kebab-case string */
function humanize(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Tag Inference ───────────────────────────────────────────────────────────

/** Known tags for pattern types */
const KNOWN_TAGS = [
  'bodice',
  'sleeve',
  'skirt',
  'pants',
  'trousers',
  'jacket',
  'coat',
  'shirt',
  'blouse',
  'dress',
  'collar',
  'cuff',
  'basic',
  'block',
  'fitted',
  'loose',
];

/**
 * Infer tags from pattern name.
 *
 * Extracts known garment-related keywords from the pattern name.
 *
 * @param name - Pattern name to analyze
 * @returns Array of matching tags
 */
export function inferTags(name: string): string[] {
  const words = name.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/);
  return words.filter((w) => KNOWN_TAGS.includes(w));
}

// ─── Trigger Generation ──────────────────────────────────────────────────────

/** Spanish translations for common pattern terms */
const TRANSLATIONS: Record<string, string> = {
  bodice: 'corpiño',
  sleeve: 'manga',
  skirt: 'falda',
  pants: 'pantalón',
  trousers: 'pantalón',
  jacket: 'chaqueta',
  coat: 'abrigo',
  shirt: 'camisa',
  blouse: 'blusa',
  dress: 'vestido',
  block: 'base',
  basic: 'básico',
  fitted: 'ajustado',
  loose: 'holgado',
};

/**
 * Generate bilingual triggers from pattern name.
 *
 * Creates trigger phrases in both English and Spanish based on
 * the pattern name and known translations.
 *
 * @param name - Pattern name to use as base
 * @returns Array of unique trigger phrases
 */
export function generateTriggers(name: string): string[] {
  const base = name.toLowerCase().replace(/[-_]/g, ' ').trim();
  const triggers = [base];

  // Add word reversal (e.g., "bodice block" → "block bodice")
  const words = base.split(' ');
  if (words.length > 1) {
    triggers.push([...words].reverse().join(' '));
  }

  // Add Spanish translations
  for (const [en, es] of Object.entries(TRANSLATIONS)) {
    if (base.includes(en)) {
      triggers.push(base.replace(en, es));
    }
  }

  return [...new Set(triggers)];
}

// ─── Formula Extraction ──────────────────────────────────────────────────────

/**
 * Extract formulas from Seamly2D variables.
 *
 * @param variables - Variable definitions from SeamlyPattern
 * @returns Record of Formula objects
 */
function extractFormulas(
  variables: Record<string, { formula: string; description: string }>,
): Record<string, Formula> {
  const formulas: Record<string, Formula> = {};

  for (const [name, def] of Object.entries(variables)) {
    const cleanName = name.replace(/^#/, '');
    formulas[cleanName] = {
      name: humanize(cleanName),
      expression: def.formula,
      description: def.description || `Variable ${cleanName}`,
      variables: [], // Would need to parse formula to extract
      unit: 'cm',
    };
  }

  return formulas;
}

// ─── Main Converter ──────────────────────────────────────────────────────────

/**
 * Convert a SeamlyPattern to CommunitySkill format.
 *
 * @param pattern - Parsed SeamlyPattern
 * @param patternName - Name to use for the skill
 * @returns Conversion result with skill and validation info
 */
function convertPattern(
  pattern: SeamlyPattern,
  patternName: string,
): ConversionResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let convertedSteps = 0;

  // Generate metadata
  const metadata: CommunitySkillMetadata = {
    id: `local:${slugify(patternName)}`,
    name: humanize(patternName),
    version: '1.0.0',
    author: 'imported',
    description: `Pattern imported from Seamly2D: ${humanize(patternName)}`,
    tags: inferTags(patternName),
    // SPDX "no assertion": an imported pattern keeps its author's license, which the file doesn't state.
    license: 'NOASSERTION',
  };

  // Generate triggers
  const triggers = generateTriggers(patternName);

  // Convert construction steps
  const constructionSteps: ConstructionStep[] = [];
  for (let i = 0; i < pattern.construction.length; i++) {
    const step = pattern.construction[i];
    const instruction = generateInstruction(step);
    const toolCalls = getToolCalls(step.type);

    // Check if fallback instruction was used (unknown type)
    if (instruction.startsWith('Execute ')) {
      warnings.push(
        `Step ${i + 1}: Unknown type "${step.type}", using fallback instruction`,
      );
    } else {
      convertedSteps++;
    }

    constructionSteps.push({
      order: i + 1,
      instruction,
      toolCalls,
    });
  }

  // Extract formulas from variables
  const formulas = extractFormulas(pattern.variables);

  // Create drafting method
  const method: DraftingMethod = {
    name: 'Seamly2D Import',
    origin: 'imported',
    description: `Imported from Seamly2D pattern file: ${patternName}`,
    formulas: {},
  };

  // Build PatternSkill
  const skill: PatternSkill = {
    name: metadata.name,
    triggers,
    description: metadata.description,
    methods: [method],
    formulas,
    easeTable: {},
    constructionSteps,
  };

  // Build CommunitySkill
  const communitySkill: CommunitySkill = {
    schemaVersion: '1.0.0',
    metadata,
    skill,
  };

  // Build validation result
  const validation: ImportValidation = {
    valid: errors.length === 0,
    warnings,
    errors,
    stats: {
      totalSteps: pattern.construction.length,
      convertedSteps,
      pieces: pattern.pieces.length,
      measurements: pattern.measurements.required,
    },
  };

  return { skill: communitySkill, validation };
}

/**
 * Convert Seamly2D XML content to a CommunitySkill.
 *
 * Main entry point for the converter. Parses the XML and generates
 * a complete CommunitySkill with metadata, triggers, and construction steps.
 *
 * @param xmlContent - Raw XML content from .sm2d file
 * @param patternName - Name to use for the skill (usually filename without extension)
 * @returns Conversion result containing the skill and validation info
 * @throws Error if XML parsing fails
 */
export function convertSeamlyToSkill(
  xmlContent: string,
  patternName: string,
): ConversionResult {
  const pattern = parseSeamlyXML(xmlContent);
  return convertPattern(pattern, patternName);
}
