/**
 * Which side a contextual panel opens on, by its domain. The side is intrinsic
 * to the panel (not the opener), so a panel lands in the same place whether it
 * was triggered from a dock, the LogoMenu, or ⌘K. 2D-domain panels open left
 * (near the 2D dock); everything else opens right (today's default).
 *
 * Reclassifying a panel is a one-line edit: add its name to LEFT_PANELS.
 */
const LEFT_PANELS = new Set<string>(['Grading']);

export function getPanelSide(name: string): 'left' | 'right' {
  return LEFT_PANELS.has(name) ? 'left' : 'right';
}
