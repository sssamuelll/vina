/**
 * Which side a contextual panel opens on, by its domain. The side is intrinsic
 * to the panel (not the opener), so a panel lands in the same place whether it
 * was triggered from a dock, the LogoMenu, or ⌘K. 2D-domain panels open left
 * (near the 2D dock); everything else opens right (today's default).
 *
 * Reclassifying a panel is a one-line edit: add its name to LEFT_PANELS.
 */
// `ReferenceImages` va a la DERECHA aunque su dominio sea el lienzo 2D, y eso
// es deliberado: `usePanelHost` tiene UNA ranura por lado, y `PatternEditor`
// abre `Properties` en la izquierda por su cuenta desde tres sitios sin que
// María lo pida (vértice de margen, barra flotante, menú contextual). Un panel
// para calcar sobre una foto tiene que quedarse abierto mientras ella dibuja;
// puesto a la izquierda desaparecía en cuanto tocaba un vértice, y había que
// volver a caminar Vina ▸ Archivo cada vez. La derecha solo se abre a petición
// (Capas, Avío, Avatar).
const LEFT_PANELS = new Set<string>(['Grading', 'Properties']);

export function getPanelSide(name: string): 'left' | 'right' {
  return LEFT_PANELS.has(name) ? 'left' : 'right';
}
