// @vitest-environment jsdom
// Pins the fix on main that replaces the rebinding of i18n spec § 5.6: a symbol shortcut that does
// not declare Shift matches with Shift held, so `;` and Ctrl+/ work on German and Spanish layouts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../defaults';
import { ShortcutRegistry } from '../ShortcutRegistry';

const isSymbol = (key: string) => key.length === 1 && !/[\p{L}\p{N}\s]/u.test(key);

describe('layout-neutral symbol shortcuts', () => {
  it('no default symbol shortcut requires Shift', () => {
    const shifted = DEFAULT_SHORTCUTS.filter((d) => isSymbol(d.key) && d.shift).map((d) => d.id);
    expect(shifted).toEqual([]);
  });

  it('; with Shift held (German and Spanish layouts) still picks the topstitch tool', () => {
    const registry = new ShortcutRegistry(DEFAULT_SHORTCUTS);
    const e = new KeyboardEvent('keydown', { key: ';', shiftKey: true });
    expect(registry.matchEvent(e, ['2d'])).toBe('tool.topstitchSeamline');
  });

  it('Ctrl+/ with Shift held (Shift+7 on German and Spanish layouts) still focuses the chat', () => {
    const registry = new ShortcutRegistry(DEFAULT_SHORTCUTS);
    const e = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, shiftKey: true });
    expect(registry.matchEvent(e, ['global'])).toBe('copilot.focusChat');
  });
});
