import type { KeyCombo } from '../../shortcuts/ShortcutRegistry';
import { DEFAULT_SHORTCUTS } from '../../shortcuts/defaults';

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

/**
 * El rótulo de un atajo, a partir del ID de su acción — nunca de una cadena
 * escrita a mano (#1170).
 *
 * Las tres superficies que anuncian atajos (el menú Vina, la paleta de
 * comandos y el menú del clic derecho del lienzo) llevaban la notación como
 * texto libre, y el censo del 2026-09-14 encontró **quince anuncios mal**: unos
 * sin respaldo y otros nombrando una tecla que hace OTRA cosa. Nombrando la
 * acción, las dos fuentes no pueden separarse, y una fila sin atajo de verdad
 * simplemente no declara ninguno.
 *
 * Devuelve `null` si el id no existe: una fila que apunta a la nada no pinta
 * un rótulo falso, y el trinquete lo caza.
 */
export function shortcutLabelFor(id: string | undefined): string | null {
  if (!id) return null;
  const def = DEFAULT_SHORTCUTS.find(d => d.id === id);
  return def ? displayShortcutBinding(def) : null;
}

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
