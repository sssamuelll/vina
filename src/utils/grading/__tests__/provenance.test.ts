import { describe, it, expect } from 'vitest';
import type { PatternPiece, PointGradeRule, InternalLine } from '../../../types/types';
import { summarizeGradingProvenance } from '../provenance';

type Base = Pick<PatternPiece, 'gradeRules' | 'internals'>;

const uniform: Base = { gradeRules: undefined, internals: [] };
const perPoint: Base = { gradeRules: [{} as PointGradeRule], internals: [] };
const perPointWithInternals: Base = {
  gradeRules: [{} as PointGradeRule],
  internals: [{} as InternalLine],
};

describe('summarizeGradingProvenance', () => {
  it('sin reglas → método uniforme (mismo condicional que gradePieceToSize)', () => {
    expect(summarizeGradingProvenance([uniform])).toEqual({
      method: 'uniform',
      frozenInternalsPieces: 0,
    });
  });

  it('con reglas por punto → método per-point', () => {
    expect(summarizeGradingProvenance([perPoint]).method).toBe('per-point');
  });

  it('per-point con internos → los cuenta como congelados (no se gradan por punto)', () => {
    expect(summarizeGradingProvenance([perPointWithInternals])).toEqual({
      method: 'per-point',
      frozenInternalsPieces: 1,
    });
  });

  it('per-point sin internos → 0 congelados', () => {
    expect(summarizeGradingProvenance([perPoint]).frozenInternalsPieces).toBe(0);
  });

  it('mezcla de piezas con y sin reglas → mixto', () => {
    expect(summarizeGradingProvenance([uniform, perPoint]).method).toBe('mixed');
  });

  it('una pieza uniforme con internos no cuenta como congelada (el uniforme sí los escala)', () => {
    const uniformWithInternals: Base = { gradeRules: undefined, internals: [{} as InternalLine] };
    expect(summarizeGradingProvenance([uniformWithInternals]).frozenInternalsPieces).toBe(0);
  });

  it('lista vacía → uniforme, 0 (no-op seguro)', () => {
    expect(summarizeGradingProvenance([])).toEqual({ method: 'uniform', frozenInternalsPieces: 0 });
  });
});
