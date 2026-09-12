/**
 * borradoDeSeleccion — quién se borra cuando se pulsa Supr.
 *
 * Revisión adversarial de UI del 2026-09-04, hallazgo F-Supr (issue #1115).
 * Hay seis campos de selección en `editor` y el borrado miraba dos, así que
 * borraba lo que no se estaba mirando:
 *
 *   A) Con una línea interna elegida, Supr se llevaba LA PIEZA ENTERA
 *      (`selectInternalLine` deja además `selectedPieceIds = [pieceId]`).
 *   B) Una pieza bloqueada se borraba igual: `removePieces` no mira `locked`.
 *   C) El menú Edición ▸ Eliminar reimplementaba la decisión sin la regla de
 *      costuras de #1094 ni el candado.
 *
 * La regla, en una sola función: **lo que se ve es lo que se borra.** Decide
 * el sujeto y no despacha nada — las dos puertas (el atajo y el menú) la
 * llaman y despachan ellas. Una decisión, un sitio.
 *
 * El orden va de lo fino a lo grueso: la pieza es el último recurso, nunca el
 * primero. Con el menú de costuras activo manda la costura y nada más (ese es
 * el arreglo de #1094 y aquí no se pierde).
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 4.
 */

import { SEWING_TOOL_IDS } from './toolActivation';
import type { TrazoSelection } from '../types/types';

export interface EstadoParaBorrado {
  activeTool: string;
  selectedPieceIds: string[];
  selectedSeamId: string | null;
  selectedPOMId: string | null;
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  /** Tramo de trazo seleccionado (spec 2026-09-12 § 5.4). */
  selectedTrazo?: TrazoSelection | null;
  /** Ids de piezas con el candado puesto (`locked === true`). */
  piezasBloqueadas: Set<string>;
}

export type SujetoBorrable =
  | { kind: 'seam'; id: string }
  | { kind: 'internalLine'; pieceId: string; lineId: string }
  | { kind: 'trazo'; trazoId: string; segmentIndex: number }
  | { kind: 'pom'; id: string }
  | { kind: 'pieces'; ids: string[] }
  | { kind: 'nada'; motivo?: 'bloqueada' };

export function resolverBorrado(e: EstadoParaBorrado): SujetoBorrable {
  // Menú de costuras: el sujeto es la costura o no hay sujeto (#1094).
  if (SEWING_TOOL_IDS.has(e.activeTool)) {
    return e.selectedSeamId ? { kind: 'seam', id: e.selectedSeamId } : { kind: 'nada' };
  }

  // El trazo es papel suelto: un tramo elegido es lo más fino que hay en el
  // lienzo, y su selección es excluyente con todo lo demás (spec § 5.2).
  if (e.selectedTrazo) {
    return { kind: 'trazo', ...e.selectedTrazo };
  }

  if (e.selectedInternalLine) {
    return { kind: 'internalLine', ...e.selectedInternalLine };
  }

  if (e.selectedPOMId) {
    return { kind: 'pom', id: e.selectedPOMId };
  }

  if (e.selectedPieceIds.length > 0) {
    // El candado protege de borrar, igual que de editar. De una selección
    // mixta se van las libres: "no borres nunca" también dejaría pasar el
    // caso B y rompería el trabajo normal.
    const libres = e.selectedPieceIds.filter((id) => !e.piezasBloqueadas.has(id));
    return libres.length > 0
      ? { kind: 'pieces', ids: libres }
      : { kind: 'nada', motivo: 'bloqueada' };
  }

  if (e.selectedSeamId) {
    return { kind: 'seam', id: e.selectedSeamId };
  }

  return { kind: 'nada' };
}
