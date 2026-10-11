import { z } from 'zod';
import type { PatternPiece } from '../../../types/types';
import { definirVerbo, type ContextoDeVerbo, type Recibo, type Verbo } from '../tipos';
import { setViewMode } from '../../../store/editorSlice';
import { pauseSimulation, resetSimulation, setViewMode3D, startSimulation } from '../../../store/simulationSlice';
import { computeEffectiveRegions, rawRegions } from '../../../utils/cloth/garmentPlacement';
import { porQueNoSeSimula } from '../../../utils/cloth/piezasEnLaSimulacion';
import {
  currentCascadeGeneration, getActiveSolverTier, getClothGeometry, getSolverEvents, latidosDeLaSimulacion,
} from '../../../utils/cloth/solverRuntimeTracker';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { rehusar } from '../actuar';
import { unDecimal } from '../costuras';
import { CUADROS_POR_LECTURA, estaAsentada, mismaTela, movimientoP95, UMBRAL_MM_POR_CUADRO } from '../asentamiento';
import { ajusteDeLaTela } from './ajuste';

/** Un objeto nuevo cada vez: un recibo no comparte su `changed` con otro. */
export const sinCambios = (): Recibo['changed'] => ({ created: [], modified: [], deleted: [] });

/** El vestido y la simulación se ven en 3D: desde 2D la vista pasa a Split, como el panel de render (`renderSettingsThunk.ts`). */
export function verElTres(ctx: ContextoDeVerbo): boolean {
  if (ctx.getState().editor.viewMode !== '2d') return false;
  ctx.dispatch(setViewMode('split'));
  return true;
}

/**
 * Las piezas que la app coloca y viste, y las que deja fuera con su razón
 * (apagada, oculta en 3D, capa oculta): el filtro de GarmentSimulation
 * (`piezasEnLaSimulacion.ts`). Mirar solo `active` daba otra prenda que la que
 * se simula (revisión final IA 1b-2).
 */
export function piezasQueSeVisten(ctx: ContextoDeVerbo) {
  const { project, simulation } = ctx.getState();
  const vestibles: PatternPiece[] = [];
  const fuera: Array<{ piece_id: string; name: string; reason: string }> = [];
  for (const p of project.pieces) {
    const razon = porQueNoSeSimula(p, simulation.hiddenPieceIds, simulation.hiddenLayerIds);
    if (razon === null) vestibles.push(p);
    else fuera.push({ piece_id: p.id, name: p.name, reason: razon });
  }
  return { vestibles, fuera };
}

/** Lo que dice un verbo sin piezas que vestir: cuáles hay y por qué no entran. */
function nadaQue(verbo: 'dress' | 'simulate', fuera: Array<{ name: string; reason: string }>): string {
  const cuales = fuera.map(p => `${p.name} (${p.reason})`).join(', ');
  return cuales ? `there are no pieces to ${verbo}: ${cuales}` : `there are no pieces to ${verbo}`;
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
    const { vestibles: activas, fuera } = piezasQueSeVisten(ctx);
    if (activas.length === 0) return rehusar(nadaQue('dress', fuera));
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
        left_out: fuera,
        seams: { active: project.seams.filter(s => s.active).length, inactive: project.seams.filter(s => !s.active).length },
        view: ctx.getState().editor.viewMode,
        view_changed,
      },
      warnings,
      revision: { before: r, after: r },
    } satisfies Recibo;
  },
});

const PAUSA_MS = 250;
/** La pestaña oculta tanto tiempo: el navegador no dibuja, y la tela no avanza. */
const OCULTA_MS = 2_000;
/** Sin un cuadro nuevo tanto tiempo, con la pestaña a la vista: el WASM da uno cada 1-2 s. */
const SIN_CUADROS_MS = 10_000;
/** El primer cuadro: la cascada de tiers tarda hasta 12-15 s por tier en arrancar. */
const ARRANQUE_MS = 30_000;

const dormir = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });
const oculta = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const OCULTA =
  'Vina is hidden (its tab is in the background, or the window is minimized or covered), so the browser does not draw it and the simulation does not advance. Ask the user to bring Vina to the front, then call simulate again.';

/**
 * Lo último que dijo el solver al fallar en esta corrida (las cascadas
 * abiertas después de `desde`), si dijo algo. Un fallo de una corrida vieja no
 * es la causa de esta (revisión final IA 1b-2).
 */
function loQueDijoElSolver(desde: number): string | null {
  const e = [...getSolverEvents()].reverse().find(x =>
    x.generation > desde && (x.kind === 'start:failed' || x.kind === 'tier:failed' || x.kind === 'device:lost'));
  return e ? `${e.kind}: ${JSON.stringify(e.data)}` : null;
}

interface Espera { settled: boolean; warnings: string[]; frames: number; seconds: number; speed: number | null }

/**
 * Espera a que la tela se quede quieta mirando el latido (`latidosDeLaSimulacion`)
 * y la malla que la app dibuja. No espera de balde: si Vina no se ve, si la
 * tela deja de llegar o si nunca arrancó, lo dice (decisión 2 del plan 1b-2).
 */
async function esperarQuieta(ctx: ContextoDeVerbo, plazoS: number, generacion: number): Promise<Espera> {
  const t0 = Date.now();
  const desde = latidosDeLaSimulacion();
  const movimientos: number[] = [];
  let previa: { latidos: number; pos: Float32Array } | null = null;
  let ultimo = desde;
  let ultimoCambio = t0;
  let ocultaDesde: number | null = null;
  for (;;) {
    await dormir(PAUSA_MS);
    const ahora = Date.now();
    const latidos = latidosDeLaSimulacion();
    const frames = latidos - desde;
    const seconds = unDecimal((ahora - t0) / 1000);
    const speed = movimientos.length ? Math.round(movimientos[movimientos.length - 1] * 1e4) / 1e4 : null;
    const fin = (settled: boolean, warnings: string[] = []): Espera => ({ settled, warnings, frames, seconds, speed });

    if (ctx.getState().simulation.simulationState !== 'running') return fin(false, ['the simulation was stopped while waiting']);
    if (latidos !== ultimo) { ultimo = latidos; ultimoCambio = ahora; }
    ocultaDesde = oculta() ? (ocultaDesde ?? ahora) : null;
    if (ocultaDesde !== null && ahora - ocultaDesde >= OCULTA_MS) return fin(false, [OCULTA]);
    if (frames === 0 && ahora - t0 >= ARRANQUE_MS) {
      return fin(false, [`the simulation did not start within ${ARRANQUE_MS / 1000} s (${loQueDijoElSolver(generacion) ?? 'no solver reported an error'})`]);
    }
    if (frames > 0 && ahora - ultimoCambio >= SIN_CUADROS_MS) {
      const solver = loQueDijoElSolver(generacion);
      return fin(false, [`the simulation stopped advancing: no new frame of cloth in ${SIN_CUADROS_MS / 1000} s. ${solver ? `The solver said ${solver}.` : 'Vina may be hidden or covered by another window: ask the user to bring it to the front, then call simulate again.'}`]);
    }

    const malla = getClothGeometry()?.geometry.getAttribute('position');
    if (malla && (!previa || latidos - previa.latidos >= CUADROS_POR_LECTURA)) {
      const pos = (malla.array as Float32Array).slice();
      if (!previa || previa.pos.length !== pos.length) {
        previa = { latidos, pos };
      } else if (!mismaTela(previa.pos, pos)) {
        movimientos.push(movimientoP95(previa.pos, pos, latidos - previa.latidos));
        previa = { latidos, pos };
      }
      // La misma tela que la lectura anterior no es tela quieta: en TSL la malla se
      // relee del GPU cada 15 cuadros, y sin readback entre dos lecturas no hay
      // dato nuevo (revisión final IA 1b-2). Se mide contra la siguiente que cambie.
    }
    if (estaAsentada(movimientos, frames)) return fin(true);
    if ((ahora - t0) / 1000 >= plazoS) {
      const porSegundo = unDecimal(frames / Math.max((ahora - t0) / 1000, 0.001));
      const ultima = movimientos.length ? Math.round(movimientos[movimientos.length - 1] * 1e4) / 1e4 : null;
      const aun = ultima === null ? 'how much it still moves is not measured yet' : `the cloth still moves ${ultima} mm per frame`;
      return fin(false, [
        `did not settle within ${plazoS} s: ${frames} frames on the ${getActiveSolverTier()} tier (${porSegundo} frames per second); ${aun} (it counts as settled under ${UMBRAL_MM_POR_CUADRO})`,
      ]);
    }
  }
}

const simulate = definirVerbo({
  name: 'simulate',
  description:
    "Start or stop the cloth simulation on the avatar, in the 3D view (from 2D the view switches to Split). start drapes from the dressed pose; stop pauses it and the cloth stays where it is. With wait (default), it answers when the cloth settles, with the fit map, or after wait_seconds with done: false and why. The simulation runs in the user's browser and only advances while Vina is visible on screen.",
  args: z.object({
    action: z.enum(['start', 'stop']),
    wait: z.boolean().default(true),
    wait_seconds: z.number().int().min(1).max(110).default(60).describe('how long to wait for the cloth to settle; default 60'),
  }),
  run: async ({ action, wait, wait_seconds }, ctx) => {
    const before = revisionDelProyecto();
    const recibo = (done: boolean, measure: Recibo['measure'], warnings: string[] = []): Recibo => ({
      done, changed: sinCambios(), measure, warnings, revision: { before, after: revisionDelProyecto() },
    });
    const { simulation } = ctx.getState();
    if (action === 'stop') {
      if (simulation.simulationState === 'running') ctx.dispatch(pauseSimulation());
      const state = ctx.getState().simulation.simulationState;
      return recibo(state !== 'running', { state });
    }
    const { vestibles, fuera } = piezasQueSeVisten(ctx);
    if (vestibles.length === 0) return rehusar(nadaQue('simulate', fuera));
    if (!simulation.showGarment) return rehusar('the garment is hidden in the 3D view; the user can show it again there');
    const view_changed = verElTres(ctx);
    ctx.dispatch(setViewMode3D('simulate'));
    // Los fallos de esta corrida son los de las cascadas que se abran desde aquí.
    const generacion = currentCascadeGeneration();
    if (simulation.simulationState !== 'running') ctx.dispatch(startSimulation());
    if (!wait) {
      return recibo(ctx.getState().simulation.simulationState === 'running', { state: 'running', tier: getActiveSolverTier(), view_changed });
    }
    const e = await esperarQuieta(ctx, wait_seconds, generacion);
    return recibo(e.settled, {
      state: ctx.getState().simulation.simulationState,
      tier: getActiveSolverTier(),
      settled: e.settled,
      seconds: e.seconds,
      frames: e.frames,
      speed_mm_per_frame: e.speed,
      view_changed,
      ...(e.settled ? { fit: ajusteDeLaTela(ctx) } : {}),
    }, e.warnings);
  },
});

export const VERBOS_DE_VESTIR: readonly Verbo[] = [dress, simulate];
