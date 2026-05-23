/**
 * Unit tests for the localized measurement-name translator.
 *
 * Locks the French / Russian → canonical English mappings used by the
 * jacket family and the representative French pattern (zigzag). The
 * mappings include several best-guess entries; tests below freeze the
 * decisions so changes are conscious.
 */
import { describe, it, expect } from 'vitest';
import { translateMeasurementName, MEASUREMENT_NAME_TRANSLATIONS } from '../measurementNameTranslation';
import { evaluateFormula, type FormulaContext } from '../formulaEvaluator';

describe('translateMeasurementName', () => {
  it('translates French Lignetailledos → neck_back_to_waist_b', () => {
    expect(translateMeasurementName('Lignetailledos')).toBe('neck_back_to_waist_b');
  });

  it('translates French Longueurépaule → shoulder_length', () => {
    expect(translateMeasurementName('Longueurépaule')).toBe('shoulder_length');
  });

  it('translates French Tourdepoitrine → bust_circ', () => {
    expect(translateMeasurementName('Tourdepoitrine')).toBe('bust_circ');
  });

  it('translates Russian Сг → bust_arc_f', () => {
    expect(translateMeasurementName('Сг')).toBe('bust_arc_f');
  });

  it('translates Russian Др → arm_shoulder_tip_to_wrist', () => {
    expect(translateMeasurementName('Др')).toBe('arm_shoulder_tip_to_wrist');
  });

  it('passes through unrecognized names unchanged (graceful degradation)', () => {
    expect(translateMeasurementName('bust_circ')).toBe('bust_circ');
    expect(translateMeasurementName('totally_unknown')).toBe('totally_unknown');
    expect(translateMeasurementName('Aisancebassin')).toBe('Aisancebassin'); // ease, intentionally untranslated
  });

  it('covers the FR names cited in the v8 plan diagnostic for jacket geometry', () => {
    // The plan listed these by name; they have to be in the table.
    expect(MEASUREMENT_NAME_TRANSLATIONS).toHaveProperty('Lignetailledos');
    expect(MEASUREMENT_NAME_TRANSLATIONS).toHaveProperty('Hauteurcarrure');
    expect(MEASUREMENT_NAME_TRANSLATIONS).toHaveProperty('Longueurépaule');
  });
});

describe('formulaEvaluator + measurement-name translation integration', () => {
  it('resolves @LignetailledosO to the underlying neck_back_to_waist_b value', () => {
    const ctx: FormulaContext = {
      measurements: { neck_back_to_waist_b: 42 },
      variables: {},
    };
    expect(evaluateFormula('@Lignetailledos + 3', ctx)).toBe(45);
  });

  it('prefers a literal @-named measurement over the translation', () => {
    // If someone explicitly populates @Lignetailledos in measurements, use it
    // verbatim — translation is a fallback, not a coercion.
    const ctx: FormulaContext = {
      measurements: { Lignetailledos: 99, neck_back_to_waist_b: 42 },
      variables: {},
    };
    expect(evaluateFormula('@Lignetailledos', ctx)).toBe(99);
  });

  it('falls back to 0 with a warning when neither the literal nor the translation resolves', () => {
    const ctx: FormulaContext = { measurements: {}, variables: {} };
    // Aisance* (ease) names are intentionally not translated and not derived
    // — they should silently default to 0 (existing behavior).
    expect(evaluateFormula('@Aisancebassin', ctx)).toBe(0);
  });

  it('resolves @Сг to bust_arc_f for the Russian-locale jacket pattern', () => {
    const ctx: FormulaContext = {
      measurements: { bust_arc_f: 46 },
      variables: {},
    };
    expect(evaluateFormula('@Сг * 2', ctx)).toBe(92);
  });
});
