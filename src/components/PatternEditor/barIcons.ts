/**
 * barIcons — mapa de íconos MONOCROMO de la barra flotante (Surface A), keyed por
 * `ActionId`. Propio de la barra: el menú de clic-derecho conserva `ACTIONS[id].icon`
 * (emoji, status quo) — este mapa NO lo toca. Los emoji renderizan en color en la
 * mayoría de plataformas; la barra necesita glifos single-weight monocromo, así que
 * usa `lucide-react` (stroke `currentColor`).
 *
 * Cubre todo `ActionId` alcanzable por una fila `bar` de `BAR_ENABLED_KINDS`
 * (piece + multiPiece). El test `barIcons.test.ts` ata este mapa a `CURATION` →
 * agregar un id a una fila `bar` enabled sin ícono aquí rompe el gate.
 */
import {
  RotateCw, Copy, FlipHorizontal2, SlidersHorizontal, Lock, Group, Link, Link2,
  type LucideIcon,
} from 'lucide-react';
import type { ActionId } from './actionCuration';

export const BAR_ICONS: Partial<Record<ActionId, LucideIcon>> = {
  // fila `piece`
  rotate90: RotateCw,
  duplicate: Copy,
  flipH: FlipHorizontal2,
  properties: SlidersHorizontal,
  lockToggle: Lock,                 // glifo único; el estado (bloq/desbloq) lo dice el tooltip
  // fila `multiPiece`
  duplicateAll: Copy,               // mismo verbo-familia que `duplicate`
  groupCreate: Group,
  linkSymmetry: Link2,
  linkInstance: Link,
};
