import { z } from 'zod';
import type { InternalLine } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { removeInternalLine, removePiece } from '../../../store/projectSlice';
import { getHistory, withAgentHistorySource } from '../../../store/undoMiddleware';
import { undo } from '../../../store/editorSlice';
import { showUndoToast } from '../../../store/copilotUISlice';
import { DESHACER_DEL_AGENTE } from '../../../store/actions';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { actuar, cambiosEntre, cerrar, estaBloqueada, piezaDe, rehusar } from '../actuar';

/** Lo que hay dentro de una pieza, como lo lee María (glosario; aprobado el 2026-10-09). */
const QUE_ES: Record<InternalLine['type'], string> = {
  notch: 'un piquete',
  dart: 'una pinza',
  grainline: 'el hilo',
  fold: 'una línea de doblez',
  pleat: 'un pliegue',
  topstitch: 'un pespunte',
  reference: 'una línea de referencia',
  seam: 'una línea de costura',
};

const remove = definirVerbo({
  name: 'remove',
  description:
    'Remove a piece (with its seams), or one internal of it: a notch, dart, grainline or line, by internal_id from read_piece. The user sees a notice with Undo. Returns what was removed.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    internal_id: z.string().optional().describe('remove only this internal of the piece'),
  }),
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    const interna = args.internal_id ? piece.internals.find(l => l.id === args.internal_id) : undefined;
    if (args.internal_id && !interna) throw new Error(`piece ${piece.id} has no internal with id ${args.internal_id}`);
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    const loQue = interna ? `${QUE_ES[interna.type]} de ${piece.name}` : piece.name;
    const e = actuar(ctx, 'remove', `borrar ${loQue}`, () => {
      if (interna) ctx.dispatch(removeInternalLine({ pieceId: piece.id, lineId: interna.id }));
      // El diálogo de confirmación es para los borrados de María: borrar actúa y ofrece deshacer.
      else ctx.dispatch({ ...removePiece(piece.id), meta: { skipConfirmation: true } });
    });
    const sigue = interna
      ? e.despues.pieces.find(p => p.id === piece.id)?.internals.some(l => l.id === interna.id) === true
      : e.despues.pieces.some(p => p.id === piece.id);
    const r = cerrar(ctx, 'remove', e, {
      done: !sigue,
      measure: {
        removed: interna ? { kind: interna.type, id: interna.id, piece_id: piece.id } : { kind: 'piece', id: piece.id, name: piece.name },
        seams_removed: e.changed.deleted.filter(id => e.antes.seams.some(s => s.id === id)),
      },
      warnings: [],
    });
    // Borrar actúa y ofrece deshacer (spec § 5.4): el aviso deshace solo este paso.
    const paso = getHistory().past.at(-1);
    if (r.done && paso) {
      ctx.dispatch(showUndoToast(`La IA borró ${loQue}`, DESHACER_DEL_AGENTE({
        etiqueta: paso.label, instante: paso.timestamp, pieza: piece.id, ...(interna ? { interna: interna.id } : {}),
      })));
    }
    return r;
  },
});

const undoVerb = definirVerbo({
  name: 'undo',
  description:
    'Undo the last step of the history, only if an agent made it. If the last step was made by the user, nothing is undone: done is false and the warning says so. Returns which step was undone.',
  args: z.object({}),
  run: (_args, ctx) => {
    const ultimo = getHistory().past.at(-1);
    if (!ultimo) return rehusar('nothing to undo');
    if (!ultimo.agent) return rehusar(`the last step was made by the user ("${ultimo.label}"); it is not undone`);
    const antes = ctx.getState().project;
    const before = revisionDelProyecto();
    withAgentHistorySource('undo', () => { ctx.dispatch(undo()); });
    const despues = ctx.getState().project;
    return {
      done: despues !== antes,
      changed: cambiosEntre(antes, despues),
      measure: { undone: ultimo.label, by: ultimo.agent.toolName },
      warnings: [],
      revision: { before, after: revisionDelProyecto() },
    };
  },
});

export const VERBOS_DE_BORRAR: readonly Verbo[] = [remove, undoVerb];
