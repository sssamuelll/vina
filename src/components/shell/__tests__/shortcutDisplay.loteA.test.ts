import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../../../shortcuts/defaults';
import { displayShortcut, displayShortcutBinding } from '../shortcutDisplay';

describe('notación visible canónica de atajos', () => {
  it('normaliza modificadores escritos con palabras según la plataforma', () => {
    expect(displayShortcut('Ctrl+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(displayShortcut('Ctrl+Shift+Z', true)).toBe('⌘⇧Z');
    expect(displayShortcut('Alt+6', true)).toBe('⌥6');
  });

  it('formatea el binding estructurado del registro sin exponer su forma interna', () => {
    const notch = DEFAULT_SHORTCUTS.find((item) => item.id === 'tool.notch');
    expect(notch).toBeDefined();
    expect(displayShortcutBinding(notch!, false)).toBe('Shift+N');
    expect(displayShortcutBinding(notch!, true)).toBe('⇧N');
  });
});
