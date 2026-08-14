import type { KeyCombo } from '../../shortcuts/ShortcutRegistry';

/**
 * Notación visible canónica: `Ctrl+Shift+Z` fuera de macOS y `⌘⇧Z` en macOS.
 * Conserva la convención nativa de cada plataforma para que se reconozca de un vistazo;
 * este helper es la única frontera de formato, no altera los handlers de teclado.
 */

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function displayShortcut(shortcut: string, isMac: boolean = IS_MAC): string {
  const glyphShortcut = shortcut
    .replace(/(?:Ctrl|Control|Cmd|Command)\+/gi, '⌘')
    .replace(/Shift\+/gi, '⇧')
    .replace(/Alt\+/gi, '⌥');

  if (isMac) return glyphShortcut;

  return glyphShortcut
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌥/g, 'Alt+');
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Espacio',
  Backspace: 'Retroceso',
  Delete: 'Supr',
  Escape: 'Esc',
};

export function displayShortcutBinding(
  binding: KeyCombo,
  isMac: boolean = IS_MAC,
): string {
  const modifiers = [
    binding.ctrl ? '⌘' : '',
    binding.shift ? '⇧' : '',
    binding.alt ? '⌥' : '',
  ].join('');
  const key = KEY_LABELS[binding.key] ?? (
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
  );

  return displayShortcut(`${modifiers}${key}`, isMac);
}
