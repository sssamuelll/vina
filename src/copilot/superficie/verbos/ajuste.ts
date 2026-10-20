import { z } from 'zod';
import { definirVerbo, type ContextoDeVerbo, type Verbo } from '../tipos';
import { aristasDeLaTela, getClothGeometry, latidosDeEstaTela, tierDeEstaTela } from '../../../utils/cloth/solverRuntimeTracker';
import { DEFAULT_FIT_MAP_CONFIG, DEFAULT_FIT_PARAMS, fabricToFitParams } from '../../../utils/cloth/fitMaps';
import { getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { unDecimal } from '../costuras';

/**
 * Las aristas más cortas que esto son astillas del mallado junto a costuras y
 * esquinas: medidas el 10-10 en la camisa de María, las de menos de 0,5 mm
 * daban entre 240 y 890 % y eran el «máximo» del mapa. No son tela. El corte
 * en 1 mm deja margen sobre esas.
 */
const ASTILLA_M = 0.001;

/** `null`: la pieza no tiene tela que medir (solo astillas); no es un ajuste perfecto. */
interface Medida { strain_p50_pct: number | null; strain_p95_pct: number | null; tight_pct: number | null; cant_wear_pct: number | null }

export type Ajuste =
  | { available: false; reason: string }
  | {
    available: true;
    tier: string;
    /** Fuera de WebGPU: las cifras salen altas, allí no hay repasos del estiramiento. */
    note?: string;
    /** Cuadros que avanzó esta tela desde que se montó. */
    frames: number;
    fabric: { id: string; max_stretch_pct: number };
    garment: Medida;
    pieces: Array<{ piece_id: string; name: string } & Medida>;
  };

/** Lo acumulado de un tramo de tela: estiramientos de sus aristas y su largo, entero, ajustado y roto. */
interface Cuenta { e: number[]; largo: number; justas: number; rotas: number }
const cuentaNueva = (): Cuenta => ({ e: [], largo: 0, justas: 0, rotas: 0 });

function medida(c: Cuenta): Medida {
  if (c.e.length === 0 || c.largo === 0) return { strain_p50_pct: null, strain_p95_pct: null, tight_pct: null, cant_wear_pct: null };
  const o = Float64Array.from(c.e).sort();
  const q = (f: number) => o[Math.min(o.length - 1, Math.floor(f * o.length))];
  return {
    strain_p50_pct: unDecimal(q(0.5) * 100),
    strain_p95_pct: unDecimal(q(0.95) * 100),
    tight_pct: unDecimal((c.justas / c.largo) * 100),
    cant_wear_pct: unDecimal((c.rotas / c.largo) * 100),
  };
}

/**
 * El ajuste por pieza, medido ahora sobre la tela que la app dibuja, con la
 * tela de la simulación. Cuenta por aristas y por largo de tela, no por
 * vértice: el mapa en pantalla toma en cada vértice el máximo de sus aristas,
 * y con eso un 4 % de aristas estiradas pintaba de rojo casi toda la pieza
 * (IA 1b-2, «Física primero»). Cada pieza es su tramo de vértices en el
 * manifiesto de la malla. Sin el cuerpo: cuenta la pieza entera.
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

  const p = pos.array as Float32Array;
  const deLaPieza = new Int32Array(pos.count).fill(-1);
  tela.manifest.forEach((m, k) => deLaPieza.fill(k, m.vertexOffset, Math.min(m.vertexOffset + m.vertexCount, pos.count)));
  const porPieza = tela.manifest.map(cuentaNueva);
  const prenda = cuentaNueva();
  for (let i = 0; i < aristas.stretchingLengths.length; i++) {
    const reposo = aristas.stretchingLengths[i];
    if (reposo < ASTILLA_M) continue;
    const a = aristas.stretchingIds[2 * i];
    const b = aristas.stretchingIds[2 * i + 1];
    const largo = Math.hypot(p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]);
    // Un NaN (o una arista que apunta fuera de la tela) no es «le queda bien»: no hay mapa.
    if (!Number.isFinite(largo)) {
      return { available: false, reason: 'the cloth has invalid positions (the simulation is unstable); stop it and simulate again' };
    }
    const e = Math.max(0, largo / reposo - 1);
    const fit = e / aguanta;
    for (const c of [porPieza[deLaPieza[a]], prenda]) {
      if (!c) continue;
      c.e.push(e);
      c.largo += reposo;
      if (fit > noSePone) c.rotas += reposo;
      else if (fit > ajustada) c.justas += reposo;
    }
  }
  const nombre = new Map(project.pieces.map(x => [x.id, x.name]));
  // El tier que movió ESTA tela: con la simulación parada el activo ya es 'none'.
  const tier = tierDeEstaTela();
  return {
    available: true,
    tier,
    // Los repasos del estiramiento son del tier GPU (`nodosDelSubpaso.ts`): WASM y
    // CPU conservan el residuo de antes (la camisa holgada de María: 17,9 % de
    // aristas sobre el 8 %), así que ahí la tela se lee más estirada de lo que es.
    ...(tier === 'webgpu' ? {} : {
      note: `on the ${tier} tier the simulation leaves more stretch than real fabric would (the extra stretch passes run only on WebGPU), so these numbers read high`,
    }),
    frames,
    fabric: { id: simulation.defaultFabricId, max_stretch_pct: unDecimal(aguanta * 100) },
    garment: medida(prenda),
    pieces: tela.manifest.map((m, k) => ({ piece_id: m.pieceId, name: nombre.get(m.pieceId) ?? m.pieceId, ...medida(porPieza[k]) })),
  };
}

const fitMap = definirVerbo({
  name: 'fit_map',
  description:
    "How the simulated garment fits, piece by piece, measured now on the cloth: how much the fabric is stretched along the mesh (median and 95th percentile, in %), and the share of each piece's cloth, by length, that is tight or can't be worn (stretched past 80% or 100% of what its fabric takes before breaking). Mesh slivers under 1 mm are left out, and contact with the body is not measured. On WebGPU a garment that fits still reads a few percent (the simulation leaves some local stretch); on other tiers the numbers read high, and the result says so. Needs a simulation (simulate).",
  args: z.object({}),
  run: (_args, ctx) => ({ revision: revisionDelProyecto(), ...ajusteDeLaTela(ctx) }),
});

export const VERBOS_DE_AJUSTE: readonly Verbo[] = [fitMap];
