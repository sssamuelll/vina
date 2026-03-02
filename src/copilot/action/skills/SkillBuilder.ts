/**
 * SkillBuilder — Builder pattern for constructing CommunitySkill from project state.
 *
 * Provides a fluent API for extracting construction data, generating NL instructions,
 * and building a complete CommunitySkill ready for export.
 *
 * @module skills/SkillBuilder
 */
import type { CommunitySkill, CommunitySkillMetadata } from './communityFormat';
import type { ConstructionStep, DraftingMethod, Formula, PatternSkill } from './types';
import type { ConstructionState, CPoint, CLine, CCurve } from '../../../types/construction';
import { generateTriggers, inferTags } from './seamlyToSkill';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillBuilderPreview {
  stepCount: number;
  formulaCount: number;
  pieceCount: number;
  measurements: string[];
}

export interface SkillBuilderValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Instruction Templates ───────────────────────────────────────────────────

function pointToInstruction(point: CPoint): string {
  const def = point.definition;
  switch (def.type) {
    case 'absolute':
      return `Mark point ${point.label} at coordinates (${def.x}, ${def.y})`;
    case 'endLine':
      return `From point ${def.basePoint}, draw a line at ${def.angle}° with length ${def.length} to create point ${point.label}`;
    case 'alongLine':
      return `Along the line from ${def.from} to ${def.to}, measure ${def.length} to mark point ${point.label}`;
    case 'normal':
      return `From line ${def.from}-${def.to}, draw a perpendicular at ${def.angle}° with length ${def.length} to create point ${point.label}`;
    case 'intersection':
      return `Find intersection of line ${def.line1Start}-${def.line1End} and line ${def.line2Start}-${def.line2End} to create point ${point.label}`;
    case 'intersectionXY':
      return `Find point ${point.label} at X from ${def.xFrom} and Y from ${def.yFrom}`;
    case 'midpoint':
      return `Find midpoint between ${def.from} and ${def.to} to create point ${point.label}`;
    case 'manual':
      return `Place point ${point.label} at (${def.x}, ${def.y})`;
    default:
      return `Create point ${point.label}`;
  }
}

function lineToInstruction(line: CLine): string {
  return `Draw a ${line.style} line from ${line.from} to ${line.to}`;
}

function curveToInstruction(curve: CCurve): string {
  const def = curve.definition;
  switch (def.type) {
    case 'spline':
      return `Draw a curve from ${def.from} to ${def.to} with angles ${def.angle1}° and ${def.angle2}°`;
    case 'cubicBezier':
      return `Draw a cubic bezier from ${def.from} to ${def.to}`;
    case 'arc':
      return `Draw an arc centered at ${def.center} with radius ${def.radius} from ${def.startAngle}° to ${def.endAngle}°`;
    default:
      return `Draw curve ${curve.label}`;
  }
}

// ─── Builder Class ───────────────────────────────────────────────────────────

export class SkillBuilder {
  private constructionSteps: ConstructionStep[] = [];
  private formulas: Record<string, Formula> = {};
  private metadata: Partial<CommunitySkillMetadata> = {};
  private triggers: string[] = [];
  private pieceCount = 0;
  private measurements: string[] = [];

  /**
   * Extract construction data from ConstructionState.
   */
  fromConstruction(state: ConstructionState): this {
    let order = 1;

    // Convert points to steps
    for (const point of state.points) {
      this.constructionSteps.push({
        order: order++,
        instruction: pointToInstruction(point),
        toolCalls: ['createPoint'],
      });
    }

    // Convert lines to steps
    for (const line of state.lines) {
      this.constructionSteps.push({
        order: order++,
        instruction: lineToInstruction(line),
        toolCalls: ['createLine'],
      });
    }

    // Convert curves to steps
    for (const curve of state.curves) {
      this.constructionSteps.push({
        order: order++,
        instruction: curveToInstruction(curve),
        toolCalls: ['createCurve'],
      });
    }

    // Extract formulas from variables
    for (const [name, value] of Object.entries(state.variables)) {
      if (typeof value === 'string') {
        // It's a formula expression
        this.formulas[name] = {
          name: name.replace(/_/g, ' '),
          expression: value,
          description: `Variable ${name}`,
          variables: this.extractVariableNames(value),
          unit: 'cm',
        };
      }
    }

    this.pieceCount = state.pieces.length;

    return this;
  }

  /**
   * Add formulas from variables.
   */
  withFormulas(variables: Record<string, string | number>): this {
    for (const [name, value] of Object.entries(variables)) {
      const expression = String(value);
      this.formulas[name] = {
        name: name.replace(/_/g, ' '),
        expression,
        description: `Variable ${name}`,
        variables: this.extractVariableNames(expression),
        unit: 'cm',
      };
    }
    return this;
  }

  /**
   * Set skill metadata.
   */
  withMetadata(meta: Partial<CommunitySkillMetadata>): this {
    this.metadata = { ...this.metadata, ...meta };
    return this;
  }

  /**
   * Generate bilingual triggers from a base name.
   */
  generateTriggers(baseName: string): this {
    this.triggers = generateTriggers(baseName);
    return this;
  }

  /**
   * Generate NL instructions (already done in fromConstruction).
   */
  generateInstructions(): this {
    // Instructions are generated during fromConstruction
    return this;
  }

  /**
   * Get preview statistics for the UI.
   */
  getPreview(): SkillBuilderPreview {
    return {
      stepCount: this.constructionSteps.length,
      formulaCount: Object.keys(this.formulas).length,
      pieceCount: this.pieceCount,
      measurements: this.measurements,
    };
  }

  /**
   * Validate the skill before building.
   */
  validate(): SkillBuilderValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.metadata.name) {
      errors.push('Name is required');
    }
    if (!this.metadata.author) {
      errors.push('Author is required');
    }
    if (this.constructionSteps.length === 0) {
      errors.push('No construction steps found');
    }
    if (Object.keys(this.formulas).length === 0) {
      warnings.push('No formulas found - skill may be limited');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Build the final CommunitySkill.
   */
  build(): CommunitySkill {
    // Auto-generate triggers if not set
    if (this.triggers.length === 0 && this.metadata.name) {
      this.triggers = generateTriggers(this.metadata.name);
    }

    // Auto-generate tags if not set
    const tags = this.metadata.tags ?? inferTags(this.metadata.name ?? '');

    const metadata: CommunitySkillMetadata = {
      id: `local:${this.slugify(this.metadata.name ?? 'unnamed')}`,
      name: this.metadata.name ?? 'Unnamed Skill',
      version: this.metadata.version ?? '1.0.0',
      author: this.metadata.author ?? 'unknown',
      description: this.metadata.description ?? `Exported pattern skill`,
      tags,
      license: this.metadata.license ?? 'MIT',
    };

    const method: DraftingMethod = {
      name: 'OpenClo Export',
      origin: 'exported',
      description: `Exported from OpenClo project`,
      formulas: {},
    };

    const skill: PatternSkill = {
      name: metadata.name,
      triggers: this.triggers,
      description: metadata.description,
      methods: [method],
      formulas: this.formulas,
      easeTable: {},
      constructionSteps: this.constructionSteps,
    };

    return {
      schemaVersion: '1.0.0',
      metadata,
      skill,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private slugify(str: string): string {
    return str
      .toLowerCase()
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private extractVariableNames(expression: string): string[] {
    const matches = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
    return matches ? [...new Set(matches)] : [];
  }
}
