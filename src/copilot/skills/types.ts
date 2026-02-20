/**
 * Skill System Types — interfaces for the pattern-making skill layer.
 *
 * Skills encode real pattern-drafting knowledge (formulas, construction steps,
 * grading rules) that get injected into the agent's system prompt when relevant
 * triggers are detected in the user's message.
 *
 * @module skills/types
 */

/**
 * A formula used in pattern drafting.
 * The expression uses measurement names from BodyMeasurements
 * (e.g. "chest", "waist", "hips", "armscyeDepth").
 */
export interface Formula {
  /** Human-readable name (bilingual) */
  name: string;
  /** Mathematical expression using measurement variable names */
  expression: string;
  /** Description of what this formula calculates */
  description: string;
  /** Measurement names this formula depends on */
  variables: string[];
  /** Unit of the result (mm or cm) */
  unit: 'mm' | 'cm';
}

/**
 * A drafting method — a specific school/author's approach to pattern construction.
 */
export interface DraftingMethod {
  /** Method name (e.g. "Aldrich", "Müller") */
  name: string;
  /** Country of origin code */
  origin: string;
  /** Description of this method's approach */
  description: string;
  /** Named formulas using measurement variable names */
  formulas: Record<string, string>;
}

/**
 * A single construction step in the drafting process.
 */
export interface ConstructionStep {
  /** Step order (1-based) */
  order: number;
  /** Bilingual instruction text */
  instruction: string;
  /** Which agent tools to use for this step */
  toolCalls: string[];
  /** What to validate after this step completes */
  validation?: string;
}

/**
 * A grading rule for a specific pattern point.
 * Defines how a point shifts per size increment.
 */
export interface SkillGradeRule {
  /** Which pattern point this rule applies to */
  point: string;
  /** Measurement that drives this shift */
  measurement: string;
  /** X displacement per cm of measurement change */
  deltaX: number;
  /** Y displacement per cm of measurement change */
  deltaY: number;
}

/**
 * A complete pattern-making skill — encodes everything the agent needs
 * to draft a specific garment type from body measurements.
 */
export interface PatternSkill {
  /** Unique skill name */
  name: string;
  /** Trigger phrases that activate this skill (ES + EN) */
  triggers: string[];
  /** Description of what this skill covers */
  description: string;
  /** Available drafting methods (first is default) */
  methods: DraftingMethod[];
  /** Named formulas for this garment type */
  formulas: Record<string, Formula>;
  /** Ease values by fabric type — fabric → measurement → ease in cm */
  easeTable: Record<string, Record<string, number>>;
  /** Ordered construction steps */
  constructionSteps: ConstructionStep[];
  /** Grading rules specific to this garment type */
  gradeRules?: SkillGradeRule[];
}
