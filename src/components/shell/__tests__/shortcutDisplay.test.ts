/**
 * displayShortcut — glifos mac (⌘⇧⌥) mostrados como Ctrl+/Shift+/Alt+ fuera
 * de mac (Fase 2: el hint "⌘K" en Windows era el patron "no lo probaron
 * aqui" — assessment Nielsen P2).
 */
import { describe, it, expect } from 'vitest';
import { displayShortcut } from '../shortcutDisplay';

describe('displayShortcut', () => {
  it('maps mac glyphs to Windows/Linux modifiers when not on mac', () => {
    expect(displayShortcut('⌘K', false)).toBe('Ctrl+K');
    expect(displayShortcut('⌘⇧Z', false)).toBe('Ctrl+Shift+Z');
    expect(displayShortcut('⌥6', false)).toBe('Alt+6');
    expect(displayShortcut('⇧S', false)).toBe('Shift+S');
  });

  it('leaves glyph-free shortcuts untouched', () => {
    expect(displayShortcut('G', false)).toBe('G');
    expect(displayShortcut('Space', false)).toBe('Space');
  });

  it('keeps mac glyphs on mac', () => {
    expect(displayShortcut('⌘K', true)).toBe('⌘K');
    expect(displayShortcut('⌘⇧Z', true)).toBe('⌘⇧Z');
  });
});
