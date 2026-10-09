import type { RootState } from '../../store';
import type { PatternPiece } from '../../types/types';
import { batchUndo, hayLoteAbierto, withAgentHistorySource } from '../../store/undoMiddleware';
import { undo } from '../../store/editorSlice';
import { revisionDelProyecto } from '../../store/revisionDelProyecto';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import type { ContextoDeVerbo, Recibo } from './tipos';

type Proyecto = RootState['project'];

/** El margen con que una medida confirma lo pedido (spec § 5.3, regla 1). */
export const MARGEN_MM = 0.5;

const NADA: Recibo['changed'] = { created: [], modified: [], deleted: [] };

/**
 * Lo que dice un verbo que escribe mientras María está a mitad de un gesto. No
 * es un «no» del patrón: en un momento se puede volver a probar.
 */
export const OCUPADA = 'the user is in the middle of an edit; try again in a moment';

/**
 * Qué cambió entre dos estados del proyecto, por id: piezas, costuras e
 * internas. El estado es inmutable: otra referencia es otro valor.
 */
export function cambiosEntre(antes: Proyecto, despues: Proyecto): Recibo['changed'] {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const comparar = <T extends { id: string }>(a: readonly T[], b: readonly T[]) => {
    const previos = new Map(a.map(x => [x.id, x]));
    const ids = new Set<string>();
    for (const x of b) {
      ids.add(x.id);
      const previo = previos.get(x.id);
      if (!previo) created.push(x.id);
      else if (previo !== x) modified.push(x.id);
    }
    for (const id of previos.keys()) if (!ids.has(id)) deleted.push(id);
  };
  comparar(antes.pieces, despues.pieces);
  comparar(antes.seams, despues.seams);
  comparar(antes.pieces.flatMap(p => p.internals), despues.pieces.flatMap(p => p.internals));
  return { created, modified, deleted };
}

export interface Escritura {
  antes: Proyecto;
  despues: Proyecto;
  changed: Recibo['changed'];
  revision: Recibo['revision'];
}

/**
 * El paso único de todo verbo que escribe (spec § 5.4): un lote de deshacer
 * con su nombre («IA: coser Delantero con Espalda»), marcado como del agente
 * para que `undo` sepa de quién es. Nada cambia a medias (§ 5.3, regla 3): si
 * `escribir` falla después de despachar algo, se deshace y el error sale. Con
 * un gesto de María a medias no escribe: lo dice (`OCUPADA`).
 */
export function actuar(ctx: ContextoDeVerbo, verbo: string, etiqueta: string, escribir: () => void): Escritura {
  // Con un gesto de María abierto, lo escrito entraría en SU paso de deshacer.
  if (hayLoteAbierto()) throw new Error(OCUPADA);
  const antes = ctx.getState().project;
  const before = revisionDelProyecto();
  const fallo: { hubo: boolean; error?: unknown } = { hubo: false };
  withAgentHistorySource(verbo, () => {
    batchUndo(ctx.dispatch, `IA: ${etiqueta}`, () => {
      try {
        escribir();
      } catch (error) {
        fallo.hubo = true;
        fallo.error = error;
      }
    });
    if (fallo.hubo && ctx.getState().project !== antes) ctx.dispatch(undo());
  });
  if (fallo.hubo) throw fallo.error;
  const despues = ctx.getState().project;
  return { antes, despues, changed: cambiosEntre(antes, despues), revision: { before, after: revisionDelProyecto() } };
}

/**
 * El recibo de un verbo que ya escribió. Si la medida de después no confirma
 * lo pedido, el cambio no se queda (§ 5.3, reglas 1 y 3). Ese deshacer deja el
 * paso en «Rehacer».
 */
export function cerrar(
  ctx: ContextoDeVerbo,
  verbo: string,
  e: Escritura,
  r: { done: boolean; measure: Recibo['measure']; warnings: string[] },
): Recibo {
  if (r.done || e.despues === e.antes) {
    return { done: r.done, changed: e.changed, measure: r.measure, warnings: r.warnings, revision: e.revision };
  }
  withAgentHistorySource(verbo, () => { ctx.dispatch(undo()); });
  return {
    done: false,
    changed: NADA,
    measure: r.measure,
    warnings: [...r.warnings, 'the change was undone'],
    revision: { before: e.revision.before, after: revisionDelProyecto() },
  };
}

/** Lo que el patrón no permite: nada cambia, y el recibo dice por qué. */
export function rehusar(warning: string, measure: Recibo['measure'] = {}): Recibo {
  const r = revisionDelProyecto();
  return { done: false, changed: NADA, measure, warnings: [warning], revision: { before: r, after: r } };
}

export function piezaDe(ctx: ContextoDeVerbo, id: string): PatternPiece {
  const piece = ctx.getState().project.pieces.find(p => p.id === id);
  if (!piece) throw new Error(`no piece with id ${id}`);
  return piece;
}

/** Una pieza bloqueada no se toca (§ 5.3, regla 4): pesa el candado de la pieza y el de su capa. */
export function estaBloqueada(ctx: ContextoDeVerbo, piece: PatternPiece): boolean {
  return piezaBloqueada(piece, ctx.getState().project.layerLocked);
}
