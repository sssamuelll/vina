import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../defaults';

const ENGLISH_UI_WORDS = /\b(?:save|undo|redo|copy|paste|delete|select|toggle|tool|view|map|pattern|sewing|help|snapshot|brush|points|command|simulation|measure|seam|notch|line|grainline|camera|focus|clear|reset|edit|circle|rectangle|ellipse|internal|trace|dart|scissors|pin|merge|topstitch|outline|extend|trim|poly|front|back|right|left|top|bottom|stress|strain|fit|pressure)\b/i;

describe('copy del registro de atajos', () => {
  it('mantiene en español todas las etiquetas visibles', () => {
    const labelsInEnglish = DEFAULT_SHORTCUTS
      .map(({ id, label }) => ({ id, label }))
      .filter(({ label }) => ENGLISH_UI_WORDS.test(label));

    expect(labelsInEnglish).toEqual([]);
  });

  it('usa los términos del glosario en las acciones principales', () => {
    const labels = Object.fromEntries(DEFAULT_SHORTCUTS.map(({ id, label }) => [id, label]));

    expect(labels['tool.notch']).toBe('Piquete');
    expect(labels['tool.seamAllowance']).toBe('Margen de costura');
    expect(labels['view.helpOverlay']).toBe('Ayuda de atajos');
    expect(labels['tool.pomMeasure']).toBe('Medir POM');
  });
});
