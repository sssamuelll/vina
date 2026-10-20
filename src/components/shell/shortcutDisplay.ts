import type { KeyCombo } from '../../shortcuts/ShortcutRegistry';
import { DEFAULT_SHORTCUTS } from '../../shortcuts/defaults';
import { t } from '../../i18n';

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

  const { ctrl, shift, alt } = t().keys;
  return glyphShortcut
    .replace(/⌘/g, `${ctrl}+`)
    .replace(/⇧/g, `${shift}+`)
    .replace(/⌥/g, `${alt}+`);
}

/**
 * El nombre de una tecla modificadora SOLA, para frases como «Shift dos
 * veces»: `displayShortcut('⇧')` da «Shift+», que es para combinar.
 */
export function displayModifierKey(glyph: '⇧' | '⌘' | '⌥', isMac: boolean = IS_MAC): string {
  return isMac ? glyph : displayShortcut(glyph, false).replace(/\+$/, '');
}

// Se lee del catálogo al llamar, no al cargar el módulo: sigue al idioma activo.
function keyLabel(key: string): string | undefined {
  const k = t().keys;
  return ({ ' ': k.space, Backspace: k.backspace, Delete: k.delete, Escape: k.escape } as Record<string, string>)[key];
}

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
  const key = keyLabel(binding.key) ?? (
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
  );

  return displayShortcut(`${modifiers}${key}`, isMac);
}
