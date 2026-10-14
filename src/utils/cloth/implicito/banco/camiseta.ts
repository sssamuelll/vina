/**
 * La camiseta de María para el banco (spec 2026-10-13 §4.4.2): el DXF importado y clasificado como al importarlo en la
 * app, cosido con autoSew más refineSeamsInWorld, mallado como lo malla el simulador y armado como prenda del motor
 * implícito, con sus puntos de costura (E1), sus bisagras de costura (E2) y la franja del margen. Cada pieza toma la
 * urdimbre de su línea de grano. La colocación la da quien llama: la de la referencia privada (colocacion.ts, E5 del
 * plan de la parte 2) o cualquier otra.
 */
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import { autoSew } from '../../../autoSew';
import { refineSeamsInWorld } from '../../../autoSew/worldRefine';
import { grainlineEndpoints } from '../../../grainLine';
import { meshPiece } from '../../../mesh';
import { resolveArrangementWithFrames } from '../../arrangement/arrangementBinding';
import { seamInitDataToPairs, type PieceWithOutline } from '../../seamPairs';
import { seamsToInitData } from '../../../../components/Viewport3D/costurasDeLaSimulacion';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../../types/types';
import { buildLinearBVH } from '../../gpu/bvh';
import type { BisagraDeCostura, PuntoDeCostura } from '../costuras';
import { CuerpoRigido } from '../cuerpo';
import type { MallaDeTela } from '../malla';
import { armarPrenda, bisagrasDePrenda, costurasDePrenda, franjaDePrenda, type LadosDeCostura, type Prenda } from '../prenda';
import type { TelaFisica } from '../tela';
import { colocarDesdeObj } from './colocacion';
import type { Escena } from './escenas';
import { aplastados, distanciaAlCuerpo, distanciaASuperficie, estiramiento, pliegues, separacionDeCosturas } from './medidas';
import { cuerpoDeObj, leerObj, mallaDeObj } from './obj';

/** Las medidas con que la app refina las costuras de María en el mundo (las de seamCoverage.maria.test.ts). */
export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

/** Las piezas del DXF, clasificadas y con sus bordes semánticos, como al importarlas en la app. */
export function piezasDeMaria(dxf: string): PatternPiece[] {
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id);
    if (c && c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return piezas;
}

/** Las costuras de autoSew, refinadas en el mundo como en la app. */
export function costurasDeMaria(piezas: PatternPiece[]): Seam[] {
  return refineSeamsInWorld(
    autoSew(piezas, { minConfidence: 0.3 }).seams.map((s) => s.seam),
    piezas,
    resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined),
  );
}

export type PiezaMallada = PieceWithOutline & { vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array };

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export function mallarPiezas(piezas: PatternPiece[], aristaMm: number): PiezaMallada[] {
  return piezas.map((p) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}

/** El dibujo de una pieza mallada (m): el mallador la acuesta en y = 0 con (x, z) = (x, y) del dibujo, centrada. */
export function patronDe(m: PiezaMallada): Float64Array {
  const n = m.vertices.length / 3, uv = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    uv[2 * i] = m.vertices[3 * i];
    uv[2 * i + 1] = m.vertices[3 * i + 2];
  }
  return uv;
}

/** La urdimbre de la pieza: la dirección de su línea de grano en el dibujo; sin línea, el motor la pone vertical (§4.1.2). */
export function hiloDe(p: PatternPiece): readonly [number, number] | undefined {
  const linea = p.internals?.find((l) => l.type === 'grainline');
  const puntas = linea ? grainlineEndpoints(linea.path) : null;
  if (!puntas) return undefined;
  const dx = puntas[1].x - puntas[0].x, dy = puntas[1].y - puntas[0].y;
  return Math.hypot(dx, dy) > 0 ? [dx, dy] : undefined;
}

/** Las posiciones iniciales (m) de cada pieza, 3 por vértice de su malla. */
export type Colocacion = (piezas: readonly PatternPiece[], mallas: readonly PiezaMallada[]) => Float64Array[];

export interface Camiseta {
  piezas: PatternPiece[];
  mallas: PiezaMallada[];
  prenda: Prenda;
  costuras: { puntos: PuntoDeCostura[]; bisagras: BisagraDeCostura[] };
  lados: LadosDeCostura[];
  franja: Uint8Array;
}

export function camisetaDeMaria(dxf: string, aristaMm: number, tela: TelaFisica, colocar: Colocacion): Camiseta {
  const piezas = piezasDeMaria(dxf);
  const mallas = mallarPiezas(piezas, aristaMm);
  const pares = seamInitDataToPairs(seamsToInitData(costurasDeMaria(piezas)), mallas);
  const x = colocar(piezas, mallas);
  const prenda = armarPrenda(piezas.map((p, k) => ({
    id: p.id, x: x[k], patron: patronDe(mallas[k]), tris: mallas[k].triIds, hilo: hiloDe(p), margenMm: p.seamAllowance,
  })));
  const { puntos, lados } = costurasDePrenda(prenda, pares);
  return { piezas, mallas, prenda, costuras: { puntos, bisagras: bisagrasDePrenda(prenda, lados, tela) }, lados, franja: franjaDePrenda(prenda, lados) };
}

/** `$VINA_REFERENCIAS/camiseta.json`: dónde están los archivos de la referencia y cómo se leen. Privado. */
export interface ConfigCamiseta {
  /** el OBJ con la colocación inicial; cada grupo es una pieza */
  colocacion: string;
  /** el nombre de la pieza de Vina de cada grupo de la colocación, en orden */
  piezasEnOrden: string[];
  /** el OBJ del avatar y los grupos que son su piel */
  cuerpo: string;
  gruposDelCuerpo: string[];
  /** la camiseta asentada de la referencia, por malla (mm) */
  asentada: Record<string, string>;
  /** el espejo entre el dibujo de Vina y el patrón del OBJ (colocacion.ts): fijo, para que una manga cruzada se note */
  espejo?: [number, number];
}

/** Los textos de los archivos, leídos del disco (banco en Node) o pedidos al servidor (la prueba con GPU). */
export interface ArchivosDeLaCamiseta {
  dxf: string;
  config: ConfigCamiseta;
  colocacion: string;
  cuerpo: string;
  /** la asentada de la referencia con esta malla, si hay */
  asentada?: string;
}

export interface CamisetaContraLaReferencia {
  escena: Escena;
  camiseta: Camiseta;
  cuerpo: CuerpoRigido;
  /** la asentada de la referencia, medible como una malla de tela, y su superficie para medir distancias */
  referencia: { malla: MallaDeTela; superficie: CuerpoRigido } | null;
  /** por pieza, la mayor distancia (mm de patrón) de un vértice de Vina a la malla de la colocación */
  errorDeColocacion: number[];
}

/** La camiseta sobre el avatar de la referencia y desde su colocación inicial (E5). Las posiciones de los OBJ van en mm. */
export function camisetaContraLaReferencia(a: ArchivosDeLaCamiseta, aristaMm: number, tela: TelaFisica): CamisetaContraLaReferencia {
  const colocacion = leerObj(a.colocacion);
  let mmPorVt = 1, errorDeColocacion: number[] = [];
  const camiseta = camisetaDeMaria(a.dxf, aristaMm, tela, (piezas, mallas) => {
    const grupos = piezas.map((p) => {
      const g = a.config.piezasEnOrden.indexOf(p.name);
      if (g < 0) throw new Error(`camiseta.json no dice qué grupo de la colocación es ${p.name}`);
      return g;
    });
    const r = colocarDesdeObj(mallas.map((m) => ({ patron: patronDe(m), tris: m.triIds })), colocacion, grupos, a.config.espejo);
    mmPorVt = r.mmPorVt;
    errorDeColocacion = r.error;
    return r.x;
  });
  const cuerpo = new CuerpoRigido(buildLinearBVH(cuerpoDeObj(leerObj(a.cuerpo), a.config.gruposDelCuerpo, 0.001)));
  let referencia: CamisetaContraLaReferencia['referencia'] = null;
  if (a.asentada) {
    const obj = leerObj(a.asentada);
    referencia = { malla: mallaDeObj(obj, 0.001, mmPorVt), superficie: new CuerpoRigido(buildLinearBVH(cuerpoDeObj(obj, null, 0.001))) };
  }
  const escena: Escena = { malla: camiseta.prenda.malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }], costuras: camiseta.costuras, franja: camiseta.franja };
  return { escena, camiseta, cuerpo, referencia, errorDeColocacion };
}

export interface MedidasDeCamiseta {
  vertices: number;
  aplastados: number;
  estiramiento: ReturnType<typeof estiramiento>;
  costuras: ReturnType<typeof separacionDeCosturas>;
  pliegues: ReturnType<typeof pliegues>;
  alCuerpo: ReturnType<typeof distanciaAlCuerpo>;
  /** la distancia de cada vértice de Vina a la asentada de la referencia */
  contraLaReferencia: ReturnType<typeof distanciaASuperficie> | null;
  /** lo mismo medido sobre la asentada de la referencia (sin costuras: el OBJ no las trae) */
  referencia: Omit<MedidasDeCamiseta, 'costuras' | 'contraLaReferencia' | 'referencia'> | null;
}

export function medirCamiseta(x: ArrayLike<number>, c: CamisetaContraLaReferencia): MedidasDeCamiseta {
  const { malla } = c.escena, ref = c.referencia;
  return {
    vertices: x.length / 3,
    aplastados: aplastados(x, malla),
    estiramiento: estiramiento(x, malla),
    costuras: separacionDeCosturas(x, c.camiseta.costuras.puntos),
    pliegues: pliegues(x, malla),
    alCuerpo: distanciaAlCuerpo(x, c.cuerpo),
    contraLaReferencia: ref ? distanciaASuperficie(x, ref.superficie) : null,
    referencia: ref
      ? {
          vertices: ref.malla.x.length / 3,
          aplastados: aplastados(ref.malla.x, ref.malla),
          estiramiento: estiramiento(ref.malla.x, ref.malla),
          pliegues: pliegues(ref.malla.x, ref.malla),
          alCuerpo: distanciaAlCuerpo(ref.malla.x, c.cuerpo),
        }
      : null,
  };
}
