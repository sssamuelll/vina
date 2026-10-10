import { z } from 'zod';
import { definirVerbo, type ContextoDeVerbo, type Verbo } from '../tipos';
import { aristasDeLaTela, getActiveSolverTier, getClothGeometry, latidosDeEstaTela } from '../../../utils/cloth/solverRuntimeTracker';
import {
  computePerVertexStrain, DEFAULT_FIT_MAP_CONFIG, DEFAULT_FIT_PARAMS, fabricToFitParams,
} from '../../../utils/cloth/fitMaps';
import { getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { unDecimal } from '../costuras';

interface Medida { strain_max_pct: number; strain_mean_pct: number; tight_pct: number; cant_wear_pct: number }

export type Ajuste =
  | { available: false; reason: string }
  | {
    available: true;
    tier: string;
    /** Cuadros que avanzó esta tela desde que se montó. */
    frames: number;
    fabric: { id: string; max_stretch_pct: number };
    garment: Medida;
    pieces: Array<{ piece_id: string; name: string } & Medida>;
  };

/**
 * El mapa de ajuste por pieza, medido ahora sobre la tela que la app dibuja:
 * las mismas fórmulas que el mapa en pantalla (`fitMaps.ts`) y la misma tela
 * de la simulación. Cada pieza es su tramo de vértices en el manifiesto de la
 * malla. Sin el cuerpo, como hoy la app: cuenta la pieza entera.
 */
export function ajusteDeLaTela(ctx: ContextoDeVerbo): Ajuste {
  const { simulation, project } = ctx.getState();
  if (simulation.simulationState === 'idle') return { available: false, reason: 'there is no simulation: call simulate first' };
  const tela = getClothGeometry();
  const pos = tela?.geometry.getAttribute('position');
  if (!tela || !pos) return { available: false, reason: 'the cloth is not built yet; try again when the simulation has started' };
  // Una tela recién montada está en su pose de partida: medirla daría un ajuste perfecto que no es.
  const frames = latidosDeEstaTela();
  if (frames === 0) return { available: false, reason: 'the cloth has not moved yet; simulate, or try again in a moment' };
  const aristas = aristasDeLaTela();
  if (!aristas || aristas.stretchingIds.length === 0) {
    return { available: false, reason: 'the solver has not sent its edge data yet; try again in a moment' };
  }
  const fabric = getPhysicalFabric(simulation.defaultFabricId);
  const params = fabric ? fabricToFitParams(fabric) : DEFAULT_FIT_PARAMS;
  const aguanta = Math.max(params.maxStretchRatio, 0.001);
  const [ajustada, noSePone] = DEFAULT_FIT_MAP_CONFIG.fitThresholds;
  const estirado = computePerVertexStrain(pos.array as Float32Array, pos.count, aristas);
  const medir = (desde: number, cuantos: number): Medida => {
    let max = 1, suma = 0, justas = 0, rotas = 0;
    const hasta = Math.min(desde + cuantos, estirado.length);
    for (let i = desde; i < hasta; i++) {
      const s = estirado[i];
      if (s > max) max = s;
      suma += s;
      const fit = Math.max(0, s - 1) / aguanta;
      if (fit > noSePone) rotas++;
      else if (fit > ajustada) justas++;
    }
    const n = Math.max(hasta - desde, 1);
    return {
      strain_max_pct: unDecimal((max - 1) * 100),
      strain_mean_pct: unDecimal((suma / n - 1) * 100),
      tight_pct: unDecimal((justas / n) * 100),
      cant_wear_pct: unDecimal((rotas / n) * 100),
    };
  };
  const nombre = new Map(project.pieces.map(p => [p.id, p.name]));
  return {
    available: true,
    tier: getActiveSolverTier(),
    frames,
    fabric: { id: simulation.defaultFabricId, max_stretch_pct: unDecimal(aguanta * 100) },
    garment: medir(0, pos.count),
    pieces: tela.manifest.map(m => ({ piece_id: m.pieceId, name: nombre.get(m.pieceId) ?? m.pieceId, ...medir(m.vertexOffset, m.vertexCount) })),
  };
}

const fitMap = definirVerbo({
  name: 'fit_map',
  description:
    "How the simulated garment fits, piece by piece, measured now on the cloth: strain (how much the fabric is stretched, in %), and the share of each piece that is tight or can't be worn (stretched past 80% or 100% of what its fabric takes before breaking). It counts the whole piece; contact with the body is not measured. Needs a simulation (simulate).",
  args: z.object({}),
  run: (_args, ctx) => ({ revision: revisionDelProyecto(), ...ajusteDeLaTela(ctx) }),
});

export const VERBOS_DE_AJUSTE: readonly Verbo[] = [fitMap];
