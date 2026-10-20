import { afterEach, describe, expect, it } from 'vitest';
import { __resetLocaleForTests, type Locale } from '../../../i18n/locale';
import { displayModifierKey, displayShortcut, displayShortcutBinding } from '../shortcutDisplay';

const inLocale = (locale: Locale) => __resetLocaleForTests(locale);

afterEach(() => {
  __resetLocaleForTests('es');
});

describe('key and modifier names follow the locale off macOS (i18n spec § 5.6)', () => {
  it('es keeps today’s names', () => {
    inLocale('es');
    expect(displayShortcutBinding({ key: 'z', ctrl: true, shift: true }, false)).toBe('Ctrl+Shift+Z');
    expect(displayShortcutBinding({ key: 'a', alt: true }, false)).toBe('Alt+A');
    expect(displayShortcutBinding({ key: 'Delete' }, false)).toBe('Supr');
    expect(displayShortcutBinding({ key: ' ' }, false)).toBe('Espacio');
    expect(displayShortcutBinding({ key: 'Backspace' }, false)).toBe('Retroceso');
    expect(displayShortcutBinding({ key: 'Escape' }, false)).toBe('Esc');
    expect(displayModifierKey('⇧', false)).toBe('Shift');
  });

  it('de names the German keycaps', () => {
    inLocale('de');
    expect(displayShortcutBinding({ key: 'z', ctrl: true, shift: true }, false)).toBe('Strg+Umschalt+Z');
    expect(displayShortcutBinding({ key: 'a', alt: true }, false)).toBe('Alt+A');
    expect(displayShortcutBinding({ key: 'Delete' }, false)).toBe('Entf');
    expect(displayShortcutBinding({ key: ' ' }, false)).toBe('Leertaste');
    expect(displayShortcutBinding({ key: 'Backspace' }, false)).toBe('Rücktaste');
    expect(displayModifierKey('⇧', false)).toBe('Umschalt');
    expect(displayModifierKey('⌘', false)).toBe('Strg');
    expect(displayShortcut('Ctrl+Shift+S', false)).toBe('Strg+Umschalt+S');
  });

  it('en names the English keycaps', () => {
    inLocale('en');
    expect(displayShortcutBinding({ key: ' ' }, false)).toBe('Space');
    expect(displayShortcutBinding({ key: 'Delete' }, false)).toBe('Delete');
    expect(displayShortcutBinding({ key: 'z', ctrl: true, shift: true }, false)).toBe('Ctrl+Shift+Z');
  });

  it.each(['en', 'es', 'de'] as const)('macOS glyphs do not change in %s', (locale) => {
    inLocale(locale);
    expect(displayShortcutBinding({ key: 'z', ctrl: true, shift: true }, true)).toBe('⌘⇧Z');
    expect(displayModifierKey('⇧', true)).toBe('⇧');
  });
});
