# Authoring Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to export their parametric project as a `.oskill` file via a professional SkillBuilder class and ExportSkillModal UI.

**Architecture:** SkillBuilder class extracts construction state, generates NL instructions, and builds CommunitySkill. ExportSkillModal provides editable metadata UI. Integrates via FileExplorerView "Export" section.

**Tech Stack:** TypeScript, React, Zustand/Redux (construction state), existing CommunitySkill format

---

## Task 1: Create SkillBuilder Core Class

**Files:**
- Create: `src/copilot/skills/SkillBuilder.ts`
- Test: `src/copilot/skills/__tests__/SkillBuilder.test.ts`

### Step 1: Write the failing test

```typescript
// src/copilot/skills/__tests__/SkillBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { SkillBuilder } from '../SkillBuilder';
import type { ConstructionState } from '../../../types/construction';

const MOCK_CONSTRUCTION: ConstructionState = {
  points: [
    {
      id: 'p1',
      label: 'A',
      x: 0,
      y: 0,
      definition: { type: 'absolute', x: 0, y: 0 },
      visible: true,
    },
    {
      id: 'p2',
      label: 'B',
      x: 100,
      y: 0,
      definition: { type: 'endLine', basePoint: 'p1', angle: 0, length: 100 },
      visible: true,
    },
  ],
  lines: [
    { id: 'l1', label: 'AB', from: 'p1', to: 'p2', style: 'solid', visible: true },
  ],
  curves: [],
  pieces: [
    {
      id: 'piece1',
      name: 'Front',
      nodes: [
        { pointId: 'p1', connection: 'line' },
        { pointId: 'p2', connection: 'line' },
      ],
      seamAllowance: 10,
      closed: false,
    },
  ],
  variables: { ease: 2, 'chest_quarter': 'chest/4' },
  selectedEntity: null,
  showConstruction: true,
  pieceIdentityMap: {},
};

describe('SkillBuilder', () => {
  describe('fromConstruction', () => {
    it('extracts points from construction state', () => {
      const builder = new SkillBuilder().fromConstruction(MOCK_CONSTRUCTION);
      const preview = builder.getPreview();

      expect(preview.stepCount).toBe(3); // 2 points + 1 line
      expect(preview.pieceCount).toBe(1);
    });
  });

  describe('withMetadata', () => {
    it('sets skill metadata', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test Skill', author: 'Tester' });

      const skill = builder.build();

      expect(skill.metadata.name).toBe('Test Skill');
      expect(skill.metadata.author).toBe('Tester');
    });
  });

  describe('build', () => {
    it('auto-generates triggers from name if not set', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Bodice Block', author: 'Test' });

      const skill = builder.build();

      expect(skill.skill.triggers).toContain('bodice block');
    });

    it('returns valid CommunitySkill', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({
          name: 'Test Skill',
          author: 'Tester',
          description: 'A test skill',
        });

      const skill = builder.build();

      expect(skill.schemaVersion).toBe('1.0.0');
      expect(skill.skill.constructionSteps.length).toBeGreaterThan(0);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/SkillBuilder.test.ts`
Expected: FAIL with "Cannot find module '../SkillBuilder'"

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/SkillBuilder.ts
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
import type { ConstructionState, CPoint, CLine, CCurve } from '../../types/construction';
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

function getToolCall(entity: CPoint | CLine | CCurve): string[] {
  if ('definition' in entity && 'label' in entity) {
    if ('x' in entity) return ['createPoint'];
    if ('from' in entity && 'to' in entity && 'style' in entity) return ['createLine'];
    return ['createCurve'];
  }
  return [];
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
      if (typeof value === 'string' && value.includes('/')) {
        // It's a formula
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
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/SkillBuilder.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/SkillBuilder.ts src/copilot/skills/__tests__/SkillBuilder.test.ts
git commit -m "feat(skills): add SkillBuilder class for exporting projects

Part of #178

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add SkillBuilder Validation Tests

**Files:**
- Modify: `src/copilot/skills/__tests__/SkillBuilder.test.ts`

### Step 1: Add validation tests

```typescript
// Add to existing test file

describe('validate', () => {
  it('returns error if name is missing', () => {
    const builder = new SkillBuilder()
      .fromConstruction(MOCK_CONSTRUCTION)
      .withMetadata({ author: 'Test' });

    const validation = builder.validate();

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Name is required');
  });

  it('returns error if author is missing', () => {
    const builder = new SkillBuilder()
      .fromConstruction(MOCK_CONSTRUCTION)
      .withMetadata({ name: 'Test' });

    const validation = builder.validate();

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Author is required');
  });

  it('returns warning if no formulas', () => {
    const emptyConstruction: ConstructionState = {
      ...MOCK_CONSTRUCTION,
      variables: {},
    };

    const builder = new SkillBuilder()
      .fromConstruction(emptyConstruction)
      .withMetadata({ name: 'Test', author: 'Tester' });

    const validation = builder.validate();

    expect(validation.warnings).toContain('No formulas found - skill may be limited');
  });

  it('returns valid for complete builder', () => {
    const builder = new SkillBuilder()
      .fromConstruction(MOCK_CONSTRUCTION)
      .withMetadata({ name: 'Test', author: 'Tester' });

    const validation = builder.validate();

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe('generateTriggers', () => {
  it('generates bilingual triggers', () => {
    const builder = new SkillBuilder()
      .fromConstruction(MOCK_CONSTRUCTION)
      .withMetadata({ name: 'Bodice Block', author: 'Test' })
      .generateTriggers('bodice block');

    const skill = builder.build();

    expect(skill.skill.triggers).toContain('bodice block');
    expect(skill.skill.triggers.some(t => t.includes('corpiño'))).toBe(true);
  });
});
```

### Step 2: Run tests

Run: `npm test -- --run src/copilot/skills/__tests__/SkillBuilder.test.ts`
Expected: PASS

### Step 3: Commit

```bash
git add src/copilot/skills/__tests__/SkillBuilder.test.ts
git commit -m "test(skills): add validation and trigger tests for SkillBuilder

Part of #178

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Export SkillBuilder from Index

**Files:**
- Modify: `src/copilot/skills/index.ts`

### Step 1: Add export

```typescript
// Add to src/copilot/skills/index.ts

// SkillBuilder (authoring tool)
export { SkillBuilder } from './SkillBuilder';
export type { SkillBuilderPreview, SkillBuilderValidation } from './SkillBuilder';
```

### Step 2: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 3: Commit

```bash
git add src/copilot/skills/index.ts
git commit -m "feat(skills): export SkillBuilder from index

Part of #178

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create ExportSkillModal Component

**Files:**
- Create: `src/components/ExportSkillModal/ExportSkillModal.tsx`
- Create: `src/components/ExportSkillModal/ExportSkillModal.css`

### Step 1: Create the modal component

```typescript
// src/components/ExportSkillModal/ExportSkillModal.tsx
/**
 * ExportSkillModal — UI for exporting project as .oskill file.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { X, Download, Check, AlertTriangle } from 'lucide-react';
import type { RootState } from '../../store';
import { SkillBuilder } from '../../copilot/skills/SkillBuilder';
import { SkillRegistry } from '../../copilot/skills/skillRegistry';
import './ExportSkillModal.css';

interface ExportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportState = 'editing' | 'exporting' | 'success' | 'error';

const LICENSE_OPTIONS = ['MIT', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Apache-2.0', 'GPL-3.0'];

export default function ExportSkillModal({ isOpen, onClose }: ExportSkillModalProps) {
  const construction = useSelector((s: RootState) => s.construction);
  const projectName = useSelector((s: RootState) => s.project.name);

  const [state, setState] = useState<ExportState>('editing');
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [registerLocally, setRegisterLocally] = useState(true);

  // Initialize from project
  useEffect(() => {
    if (isOpen && projectName) {
      setName(projectName);
      setDescription(`Parametric pattern: ${projectName}`);
    }
  }, [isOpen, projectName]);

  // Build preview
  const builder = useMemo(() => {
    if (!construction) return null;
    return new SkillBuilder()
      .fromConstruction(construction)
      .withMetadata({ name, author, description, version, license, tags })
      .generateTriggers(name);
  }, [construction, name, author, description, version, license, tags]);

  const preview = builder?.getPreview();
  const validation = builder?.validate();

  // Auto-generate triggers when name changes
  useEffect(() => {
    if (name && triggers.length === 0) {
      const generated = builder?.build().skill.triggers ?? [];
      setTriggers(generated);
    }
  }, [name]);

  const handleClose = useCallback(() => {
    setState('editing');
    setError(null);
    onClose();
  }, [onClose]);

  const handleExport = useCallback(async () => {
    if (!builder || !validation?.valid) return;

    setState('exporting');

    try {
      // Update builder with final values
      const finalBuilder = new SkillBuilder()
        .fromConstruction(construction)
        .withMetadata({ name, author, description, version, license, tags });

      // Set custom triggers if edited
      if (triggers.length > 0) {
        finalBuilder.generateTriggers(name);
      }

      const skill = finalBuilder.build();
      skill.skill.triggers = triggers.filter(t => t.trim() !== '');

      // Download file
      const json = JSON.stringify(skill, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.oskill`;
      a.click();
      URL.revokeObjectURL(url);

      // Register locally if checked
      if (registerLocally) {
        const registry = SkillRegistry.getInstance();
        await registry.register(skill, 'local');
      }

      setState('success');
      setTimeout(handleClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setState('error');
    }
  }, [builder, validation, construction, name, author, description, version, license, tags, triggers, registerLocally, handleClose]);

  const addTrigger = useCallback(() => {
    setTriggers([...triggers, '']);
  }, [triggers]);

  const updateTrigger = useCallback((index: number, value: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = value;
    setTriggers(newTriggers);
  }, [triggers]);

  const removeTrigger = useCallback((index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  }, [triggers]);

  const addTag = useCallback(() => {
    setTags([...tags, '']);
  }, [tags]);

  const updateTag = useCallback((index: number, value: string) => {
    const newTags = [...tags];
    newTags[index] = value;
    setTags(newTags);
  }, [tags]);

  const removeTag = useCallback((index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  }, [tags]);

  if (!isOpen) return null;

  const canExport = validation?.valid && name.trim() && author.trim();

  return (
    <div className="export-modal-overlay" onClick={handleClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal__header">
          <h2>Export as Skill</h2>
          <button className="export-modal__close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="export-modal__content">
          {state === 'error' && error && (
            <div className="export-modal__error">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {state === 'success' ? (
            <div className="export-modal__success">
              <Check size={24} />
              <span>Skill exported successfully!</span>
            </div>
          ) : (
            <>
              <div className="export-modal__form">
                <label>
                  Name *
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={state === 'exporting'}
                    placeholder="e.g., Bodice Block"
                  />
                </label>

                <label>
                  Author *
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={state === 'exporting'}
                    placeholder="Your name"
                  />
                </label>

                <div className="export-modal__row">
                  <label>
                    Version
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      disabled={state === 'exporting'}
                    />
                  </label>

                  <label>
                    License
                    <select
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                      disabled={state === 'exporting'}
                    >
                      {LICENSE_OPTIONS.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={state === 'exporting'}
                    rows={2}
                    placeholder="Describe this pattern skill..."
                  />
                </label>

                <label>
                  Triggers (how users will ask for this)
                  <div className="export-modal__list">
                    {triggers.map((t, i) => (
                      <div key={i} className="export-modal__list-item">
                        <input
                          type="text"
                          value={t}
                          onChange={(e) => updateTrigger(i, e.target.value)}
                          disabled={state === 'exporting'}
                        />
                        <button onClick={() => removeTrigger(i)} disabled={state === 'exporting'} type="button">×</button>
                      </div>
                    ))}
                    <button className="export-modal__add-btn" onClick={addTrigger} disabled={state === 'exporting'} type="button">
                      + Add trigger
                    </button>
                  </div>
                </label>

                <label>
                  Tags
                  <div className="export-modal__list">
                    {tags.map((tag, i) => (
                      <div key={i} className="export-modal__list-item">
                        <input
                          type="text"
                          value={tag}
                          onChange={(e) => updateTag(i, e.target.value)}
                          disabled={state === 'exporting'}
                        />
                        <button onClick={() => removeTag(i)} disabled={state === 'exporting'} type="button">×</button>
                      </div>
                    ))}
                    <button className="export-modal__add-btn" onClick={addTag} disabled={state === 'exporting'} type="button">
                      + Add tag
                    </button>
                  </div>
                </label>
              </div>

              {preview && (
                <div className="export-modal__preview">
                  <strong>Preview</strong>
                  <ul>
                    <li>{preview.stepCount} construction steps</li>
                    <li>{preview.formulaCount} formulas</li>
                    <li>{preview.pieceCount} pieces</li>
                  </ul>
                  {validation?.warnings.map((w, i) => (
                    <p key={i} className="export-modal__warning">{w}</p>
                  ))}
                </div>
              )}

              <label className="export-modal__checkbox">
                <input
                  type="checkbox"
                  checked={registerLocally}
                  onChange={(e) => setRegisterLocally(e.target.checked)}
                  disabled={state === 'exporting'}
                />
                Also register to local SkillRegistry
              </label>
            </>
          )}
        </div>

        <div className="export-modal__footer">
          <button className="export-modal__cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="export-modal__export"
            onClick={handleExport}
            disabled={!canExport || state === 'exporting'}
          >
            <Download size={14} />
            {state === 'exporting' ? 'Exporting...' : 'Export .oskill'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Create the CSS

```css
/* src/components/ExportSkillModal/ExportSkillModal.css */

.export-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.export-modal {
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.export-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #333);
}

.export-modal__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #ccc);
}

.export-modal__close {
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 4px;
  display: flex;
}

.export-modal__close:hover {
  color: var(--text-primary, #ccc);
}

.export-modal__content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.export-modal__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-modal__form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.export-modal__form input,
.export-modal__form select,
.export-modal__form textarea {
  padding: 8px 10px;
  background: var(--input-bg, #2d2d2d);
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-primary, #ccc);
  font-size: 13px;
  font-family: inherit;
}

.export-modal__form input:focus,
.export-modal__form select:focus,
.export-modal__form textarea:focus {
  outline: none;
  border-color: var(--accent-color, #0e639c);
}

.export-modal__form input:disabled,
.export-modal__form select:disabled,
.export-modal__form textarea:disabled {
  opacity: 0.6;
}

.export-modal__row {
  display: flex;
  gap: 12px;
}

.export-modal__row label {
  flex: 1;
}

.export-modal__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.export-modal__list-item {
  display: flex;
  gap: 6px;
}

.export-modal__list-item input {
  flex: 1;
}

.export-modal__list-item button {
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-secondary, #888);
  cursor: pointer;
}

.export-modal__list-item button:hover {
  color: var(--error-fg, #f48771);
  border-color: var(--error-fg, #f48771);
}

.export-modal__add-btn {
  align-self: flex-start;
  padding: 4px 10px;
  background: transparent;
  border: 1px dashed var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
}

.export-modal__add-btn:hover {
  border-color: var(--accent-color, #0e639c);
  color: var(--accent-color, #0e639c);
}

.export-modal__preview {
  margin-top: 16px;
  padding: 12px;
  background: var(--card-bg, #252526);
  border-radius: 6px;
  font-size: 12px;
}

.export-modal__preview strong {
  color: var(--text-primary, #ccc);
}

.export-modal__preview ul {
  margin: 8px 0 0;
  padding-left: 20px;
  color: var(--text-secondary, #888);
}

.export-modal__preview li {
  margin: 2px 0;
}

.export-modal__warning {
  margin: 8px 0 0;
  color: var(--warning-fg, #cca700);
}

.export-modal__checkbox {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  cursor: pointer;
}

.export-modal__checkbox input {
  width: auto;
  margin: 0;
}

.export-modal__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: rgba(244, 135, 113, 0.1);
  border-radius: 6px;
  color: var(--error-fg, #f48771);
  font-size: 13px;
}

.export-modal__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--success-fg, #89d185);
  font-size: 14px;
}

.export-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #333);
}

.export-modal__cancel {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-primary, #ccc);
  font-size: 13px;
  cursor: pointer;
}

.export-modal__cancel:hover {
  background: var(--card-bg, #252526);
}

.export-modal__export {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--button-bg, #0e639c);
  border: none;
  border-radius: 4px;
  color: var(--button-fg, #fff);
  font-size: 13px;
  cursor: pointer;
}

.export-modal__export:hover:not(:disabled) {
  background: var(--button-hover-bg, #1177bb);
}

.export-modal__export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Step 3: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 4: Commit

```bash
git add src/components/ExportSkillModal/ExportSkillModal.tsx src/components/ExportSkillModal/ExportSkillModal.css
git commit -m "feat(ui): add ExportSkillModal component

Part of #178

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add Export Button to FileExplorerView

**Files:**
- Modify: `src/components/views/FileExplorerView.tsx`

### Step 1: Add import and state

```typescript
// Add to imports at top of FileExplorerView.tsx
import ExportSkillModal from '../ExportSkillModal/ExportSkillModal';

// Add state inside component
const [showExportSkillModal, setShowExportSkillModal] = useState(false);

// Check if export is possible (has construction)
const construction = useSelector((s: RootState) => s.construction);
const hasConstruction = construction?.points?.length > 0;
```

### Step 2: Add button in Export section

Find the Export section and add:

```tsx
{/* Add after other export buttons, inside the Export section */}
<button
  className="sidebar-action-btn"
  onClick={() => setShowExportSkillModal(true)}
  disabled={!hasConstruction}
  title={hasConstruction ? 'Export as .oskill' : 'No construction to export'}
>
  Export as Skill (.oskill)
</button>
```

### Step 3: Add modal at end of component

```tsx
{/* Add before closing div of the component */}
<ExportSkillModal
  isOpen={showExportSkillModal}
  onClose={() => setShowExportSkillModal(false)}
/>
```

### Step 4: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 5: Commit

```bash
git add src/components/views/FileExplorerView.tsx
git commit -m "feat(ui): add Export as Skill button to FileExplorerView

Part of #178

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update GitHub Issue and Run Final Tests

### Step 1: Run all tests

Run: `npm test -- --run`
Expected: All tests pass

### Step 2: Run build

Run: `npm run build`
Expected: Build succeeds

### Step 3: Push and close issue

```bash
git push origin main

gh issue close 178 --reason completed -c "Implementation complete:
- SkillBuilder class with Builder pattern
- ExportSkillModal UI with metadata editing
- Export as Skill button in FileExplorerView
- Auto-generates bilingual triggers (ES/EN)
- Optional local SkillRegistry registration

All tests pass."
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create SkillBuilder core class with tests |
| 2 | Add validation and trigger tests |
| 3 | Export SkillBuilder from index |
| 4 | Create ExportSkillModal component |
| 5 | Add Export button to FileExplorerView |
| 6 | Run final tests and close issue |
