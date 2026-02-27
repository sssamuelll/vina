/**
 * Tests for Action Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  getAllActionSchemas,
  getActionSchemasByCategory,
  getActionSchema,
  generateActionsPromptSection,
  generateCompactActionsReference,
} from '../actionSchemas';

describe('getAllActionSchemas', () => {
  it('should return all action schemas', () => {
    const schemas = getAllActionSchemas();

    expect(schemas.length).toBeGreaterThan(20);
    expect(schemas.every(s => s.action && s.description)).toBe(true);
  });

  it('should include required fields for all schemas', () => {
    const schemas = getAllActionSchemas();

    for (const schema of schemas) {
      expect(schema.action).toBeDefined();
      expect(schema.description).toBeDefined();
      expect(schema.category).toBeDefined();
      expect(schema.parameters).toBeDefined();
      expect(schema.examples).toBeDefined();
    }
  });

  it('should have unique action names', () => {
    const schemas = getAllActionSchemas();
    const names = schemas.map(s => s.action);
    const uniqueNames = new Set(names);

    expect(names.length).toBe(uniqueNames.size);
  });
});

describe('getActionSchemasByCategory', () => {
  it('should filter by selection category', () => {
    const schemas = getActionSchemasByCategory('selection');

    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.every(s => s.category === 'selection')).toBe(true);
    expect(schemas.some(s => s.action === 'select_piece')).toBe(true);
  });

  it('should filter by piece category', () => {
    const schemas = getActionSchemasByCategory('piece');

    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.some(s => s.action === 'create_piece')).toBe(true);
    expect(schemas.some(s => s.action === 'delete_piece')).toBe(true);
  });

  it('should filter by simulation category', () => {
    const schemas = getActionSchemasByCategory('simulation');

    expect(schemas.some(s => s.action === 'start_simulation')).toBe(true);
    expect(schemas.some(s => s.action === 'stop_simulation')).toBe(true);
  });
});

describe('getActionSchema', () => {
  it('should return schema for known action', () => {
    const schema = getActionSchema('select_piece');

    expect(schema).toBeDefined();
    expect(schema!.action).toBe('select_piece');
    expect(schema!.parameters.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown action', () => {
    const schema = getActionSchema('nonexistent_action');

    expect(schema).toBeUndefined();
  });

  it('should include parameter details', () => {
    const schema = getActionSchema('create_piece');

    expect(schema).toBeDefined();
    const shapeParam = schema!.parameters.find(p => p.name === 'shape');
    expect(shapeParam).toBeDefined();
    expect(shapeParam!.required).toBe(true);
    expect(shapeParam!.enum).toBeDefined();
  });

  it('should mark dangerous actions', () => {
    const schema = getActionSchema('delete_piece');

    expect(schema).toBeDefined();
    expect(schema!.dangerous).toBe(true);
  });

  it('should mark read-only actions', () => {
    const schema = getActionSchema('measure_edge');

    expect(schema).toBeDefined();
    expect(schema!.readOnly).toBe(true);
  });
});

describe('generateActionsPromptSection', () => {
  it('should generate non-empty prompt section', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include JSON format example', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('actions');
    expect(prompt).toContain('json');
  });

  it('should include category headers', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('Selection');
    expect(prompt).toContain('Piece');
    expect(prompt).toContain('Simulation');
  });

  it('should include action descriptions', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('select_piece');
    expect(prompt).toContain('create_piece');
    expect(prompt).toContain('start_simulation');
  });

  it('should mark dangerous actions', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('destructive');
  });

  it('should mark read-only actions', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('read-only');
  });

  it('should include parameter details', () => {
    const prompt = generateActionsPromptSection();

    expect(prompt).toContain('pieceId');
    expect(prompt).toContain('required');
  });
});

describe('generateCompactActionsReference', () => {
  it('should generate compact format', () => {
    const compact = generateCompactActionsReference();
    const full = generateActionsPromptSection();

    expect(compact.length).toBeLessThan(full.length);
  });

  it('should list all actions', () => {
    const compact = generateCompactActionsReference();

    expect(compact).toContain('select_piece');
    expect(compact).toContain('create_piece');
    expect(compact).toContain('start_simulation');
  });

  it('should include required parameters', () => {
    const compact = generateCompactActionsReference();

    expect(compact).toContain('pieceId');
  });

  it('should include descriptions', () => {
    const compact = generateCompactActionsReference();

    expect(compact).toContain('Select');
    expect(compact).toContain('Create');
  });
});
