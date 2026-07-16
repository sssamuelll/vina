/**
 * Shortcuts para humanos según plataforma: los glifos mac (⌘⇧⌥) se muestran
 * como Ctrl+/Shift+/Alt+ fuera de mac. Solo DISPLAY — los handlers reales
 * (useKeyboardShortcuts) ya escuchan ctrlKey/metaKey en ambas plataformas.
 */

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function displayShortcut(shortcut: string, isMac: boolean = IS_MAC): string {
  if (isMac) return shortcut;
  return shortcut
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌥/g, 'Alt+');
}
