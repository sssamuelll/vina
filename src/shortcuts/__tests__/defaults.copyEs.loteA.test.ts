import { describe, expect, it } from 'vitest';
import { ATAJOS_2D_SIN_GESTO, DEFAULT_SHORTCUTS } from '../defaults';

/**
 * Actualizado el 2026-09-04 (hallazgo F7 de la revisión adversarial de UI):
 * siete atajos 2D salieron de `DEFAULT_SHORTCUTS` a `ATAJOS_2D_SIN_GESTO`
 * porque activaban una herramienta que el despachador no sabe conducir. Sus
 * etiquetas siguen escritas y volverán a ser visibles cuando la herramienta
 * exista, así que la regla de idioma se les sigue aplicando: este test mira
 * las DOS listas, no solo la viva. Bajarlo a mirar una sola habría sido
 * perder cobertura, no adaptarla.
 */
const TODAS_LAS_ETIQUETAS = [...DEFAULT_SHORTCUTS, ...ATAJOS_2D_SIN_GESTO];

const ENGLISH_UI_WORDS = /\b(?:save|undo|redo|copy|paste|delete|select|toggle|tool|view|map|pattern|sewing|help|snapshot|brush|points|command|simulation|measure|seam|notch|line|grainline|camera|focus|clear|reset|edit|circle|rectangle|ellipse|internal|trace|dart|scissors|pin|merge|topstitch|outline|extend|trim|poly|front|back|right|left|top|bottom|stress|strain|fit|pressure)\b/i;

describe('copy del registro de atajos', () => {
  it('mantiene en español todas las etiquetas visibles', () => {
    const labelsInEnglish = TODAS_LAS_ETIQUETAS
      .map(({ id, label }) => ({ id, label }))
      .filter(({ label }) => ENGLISH_UI_WORDS.test(label));

    expect(labelsInEnglish).toEqual([]);
  });

  it('usa los términos del glosario en las acciones principales', () => {
    const labels = Object.fromEntries(TODAS_LAS_ETIQUETAS.map(({ id, label }) => [id, label]));

    expect(labels['tool.notch']).toBe('Piquete');
    expect(labels['tool.seamAllowance']).toBe('Margen de costura');
    expect(labels['view.helpOverlay']).toBe('Ayuda de atajos');
    expect(labels['tool.pomMeasure']).toBe('Medir POM');
  });

  it('las dos listas no comparten ningún atajo', () => {
    // Si un id vive en las dos, el atajo se registra igual y el arreglo de F7
    // sería decorativo.
    const vivos = new Set(DEFAULT_SHORTCUTS.map((s) => s.id));
    expect(ATAJOS_2D_SIN_GESTO.filter((s) => vivos.has(s.id)).map((s) => s.id)).toEqual([]);
  });
});
