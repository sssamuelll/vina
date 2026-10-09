import { z } from 'zod';
import type { PatternPiece } from '../../../types/types';
import { definirVerbo, type ContextoDeVerbo, type Recibo, type Verbo } from '../tipos';
import { setViewMode } from '../../../store/editorSlice';
import { resetSimulation, setViewMode3D } from '../../../store/simulationSlice';
import { computeEffectiveRegions, rawRegions } from '../../../utils/cloth/garmentPlacement';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { rehusar } from '../actuar';

/** Un objeto nuevo cada vez: un recibo no comparte su `changed` con otro. */
export const sinCambios = (): Recibo['changed'] => ({ created: [], modified: [], deleted: [] });

/** El vestido y la simulación se ven en 3D: desde 2D la vista pasa a Split, como el panel de render (`renderSettingsThunk.ts`). */
export function verElTres(ctx: ContextoDeVerbo): boolean {
  if (ctx.getState().editor.viewMode !== '2d') return false;
  ctx.dispatch(setViewMode('split'));
  return true;
}

/** Qué decidió la región: la categoría, el nombre, o nada (la región cruda, antes de alternar). */
function decididaPor(p: PatternPiece, cruda: string): 'category' | 'name' | 'none' {
  if (cruda === 'unknown') return 'none';
  return p.category && p.category !== 'other' ? 'category' : 'name';
}

const dress = definirVerbo({
  name: 'dress',
  description:
    'Place the pieces on the avatar, in the 3D view (arrange mode; from 2D the view switches to Split), ready to simulate. It changes nothing in the pattern, and stops the simulation if it runs. Returns where each active piece goes and what decided it (its category and side, or its name), the pieces left out and why, and how many seams are active. A piece Vina cannot place drapes on the front torso: classify it.',
  args: z.object({}),
  run: (_args, ctx) => {
    const { project, simulation } = ctx.getState();
    const activas = project.pieces.filter(p => p.active);
    if (activas.length === 0) return rehusar('there are no active pieces to dress');
    // Las regiones que se usan, y las crudas: sin clasificar ninguna, Vina las
    // alterna delante/detrás (`garmentPlacement.ts`, computeEffectiveRegions) y eso no es saber.
    const regiones = computeEffectiveRegions(activas);
    const crudas = rawRegions(activas);
    const todasSinClase = crudas.every(r => r === 'unknown');
    const view_changed = verElTres(ctx);
    if (simulation.simulationState !== 'idle') ctx.dispatch(resetSimulation());
    ctx.dispatch(setViewMode3D('arrange'));
    const piezas = activas.map((p, i) => ({
      piece_id: p.id,
      name: p.name,
      region: regiones[i] === 'unknown' ? null : regiones[i],
      decided_by: decididaPor(p, crudas[i]),
      ...(project.arrangementOverrides[p.id] ? { moved_by_hand: true } : {}),
    }));
    const warnings = todasSinClase
      ? ['no piece is classified: Vina alternates them between the front and the back torso. Classify them.']
      : piezas.filter(p => p.region === null).map(p =>
        `piece ${p.name} (${p.piece_id}) has no category and its name does not say where it goes: it would drape on the front torso. Classify it.`);
    const r = revisionDelProyecto();
    return {
      done: warnings.length === 0,
      changed: sinCambios(),
      measure: {
        pieces: piezas,
        inactive: project.pieces.filter(p => !p.active).map(p => ({ piece_id: p.id, name: p.name })),
        seams: { active: project.seams.filter(s => s.active).length, inactive: project.seams.filter(s => !s.active).length },
        view: ctx.getState().editor.viewMode,
        view_changed,
      },
      warnings,
      revision: { before: r, after: r },
    } satisfies Recibo;
  },
});

export const VERBOS_DE_VESTIR: readonly Verbo[] = [dress];
