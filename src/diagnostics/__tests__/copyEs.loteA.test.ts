import { describe, expect, it, vi } from 'vitest';
import { analyzeInspection } from '../agentAnalyzer';
import { evaluateRules } from '../ruleEngine';
import type { Diagnostic, InspectionData } from '../types';

const DATA = {
  target: { type: 'piece', pieceId: 'p1' },
  timestamp: 0,
  piece: {
    id: 'p1',
    name: 'Delantero',
    position: { x: 0, y: 0 },
    rotation: 0,
    seamAllowance: 10,
    area: 2500,
  },
  fabric: undefined,
  edge: { name: 'costado', type: 'straight', length: 100 },
  seams: [],
  internals: [],
  poms: [],
} as InspectionData;

describe('copy del Inspector', () => {
  it('emite diagnósticos deterministas en español', () => {
    const diagnostics = evaluateRules(DATA);

    expect(diagnostics.some(({ message }) => message === 'Sin tela asignada')).toBe(true);
    expect(diagnostics.some(({ message }) => message === 'No hay dirección de hilo')).toBe(true);
    expect(diagnostics.some(({ message }) => message === 'No hay conexiones de costura')).toBe(true);
  });

  it('resume y sugiere acciones en español', async () => {
    const diagnostics: Diagnostic[] = [{
      severity: 'error',
      category: 'fabric',
      message: 'Sin tela asignada',
    }];

    const result = await analyzeInspection(DATA, diagnostics, vi.fn());

    expect(result.summary).toBe('Delantero tiene 1 problema crítico que requiere atención.');
    expect(result.suggestions[0]).toMatchObject({
      description: 'Asignar una tela a esta pieza',
      impact: 'Necesaria para simular y producir con precisión',
    });
  });
});
