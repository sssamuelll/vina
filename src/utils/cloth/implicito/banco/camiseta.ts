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
import type { TramoDelBorde } from '../../../mesh/cdtMesher';
import { resolveArrangementWithFrames } from '../../arrangement/arrangementBinding';
import { seamInitDataToPairs, type PieceWithOutline } from '../../seamPairs';
import { seamsToInitData } from '../../../../components/Viewport3D/costurasDeLaSimulacion';
import type { BodyMeasurements, InternalLineType, PatternPiece, Seam } from '../../../../types/types';
import { buildLinearBVH } from '../../gpu/bvh';
import { puntosDeCostura, type BisagraDeCostura, type PuntoDeCostura } from '../costuras';
import { ladosSoldados, soldadura, type ParDeCostura } from '../soldadura';
import { CuerpoRigido } from '../cuerpo';
import type { MallaDeTela } from '../malla';
import { armarPrenda, bisagrasDePrenda, costurasDePrenda, franjaDePrenda, type LadosDeCostura, type Prenda } from '../prenda';
import { separacion, telaSI, type TelaFisica } from '../tela';
import { anillarTira, type TiraEnAnillo } from './cuello';
import { colocarDesdeObj } from './colocacion';
import type { Escena } from './escenas';
import { aplastados, distanciaAlCuerpo, distanciaASuperficie, estiramiento, pliegues, separacionDeCosturas } from './medidas';
import { cuerpoDeObj, leerObj, mallaDeObj } from './obj';

/** Las medidas con que la app refina las costuras de María en el mundo (las de seamCoverage.maria.test.ts). */
export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

/**
 * Las piezas del DXF, clasificadas y con sus bordes semánticos, como al importarlas en la app. Con ids fijos: autoSew
 * orienta algunas costuras según los ids, y con los de la importación (al azar) la camiseta del banco no se repetía.
 */
export function piezasDeMaria(dxf: string): PatternPiece[] {
  // state-encoded ID: el orden de la pieza en el DXF
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces.map((p, k) => ({ ...p, id: `maria-${k}` }));
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
export function mallarPiezas(piezas: PatternPiece[], aristaMm: number, tramos?: readonly TramoDelBorde[][]): PiezaMallada[] {
  return piezas.map((p, k) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 }, undefined, tramos?.[k]);
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}

/**
 * Las líneas internas que son tela. Las de dibujo (grano, piquetes, referencia, pespunte) no lo son, y el mallador, que
 * las toma como restricción, siembra alrededor astillas, copias de un mismo punto y puntos fuera de la pieza: en la
 * camiseta de María, triángulos con una flexión 1e16 veces la de los demás, que traban el paso entero.
 */
const LINEAS_DE_TELA: ReadonlySet<InternalLineType> = new Set<InternalLineType>(['dart', 'fold', 'pleat', 'seam']);

/**
 * Las piezas malladas para el motor implícito: como mallarPiezas, pero sin las líneas internas de dibujo, y con los
 * tramos de cada pieza (la costura soldada, E17) si llegan.
 */
export function mallarParaElMotor(piezas: PatternPiece[], aristaMm: number, tramos?: readonly TramoDelBorde[][]): PiezaMallada[] {
  return mallarPiezas(piezas.map((p) => ({ ...p, internals: (p.internals ?? []).filter((l) => LINEAS_DE_TELA.has(l.type)) })), aristaMm, tramos);
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
  // E17: las costuras soldadas, con los mismos vértices en sus dos lados; la que no se suelda se cose con E1
  const init = seamsToInitData(costurasDeMaria(piezas)), sold = soldadura(piezas, init, aristaMm);
  const mallas = mallarParaElMotor(piezas, aristaMm, sold.tramos);
  const soldados = ladosSoldados(sold, piezas, mallas), porCostura = new Map(soldados.pares.map((p) => [p.costura, p]));
  const pares = init.flatMap((s, j): ParDeCostura[] => {
    const p = porCostura.get(j);
    return p ? [p] : seamInitDataToPairs([s], mallas);
  });
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
  /** la tira del cuello en anillo (E11), si la camiseta la tiene y se pidió */
  anillo: TiraEnAnillo | null;
}

/**
 * La camiseta sobre el avatar de la referencia y desde su colocación inicial (E5), con la tira del cuello en anillo
 * alrededor del cuello (E11, salvo `anillo: false`). Las posiciones de los OBJ van en mm.
 */
export function camisetaContraLaReferencia(a: ArchivosDeLaCamiseta, aristaMm: number, tela: TelaFisica, op: { anillo?: boolean } = {}): CamisetaContraLaReferencia {
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
  const tira = camiseta.piezas.findIndex((p) => p.category === 'collar');
  const { malla } = camiseta.prenda;
  const anillo = op.anillo !== false && tira >= 0
    ? anillarTira(malla.x, malla.patron, camiseta.prenda.piezas[tira], camiseta.costuras.puntos, cuerpo, separacion(telaSI(tela)))
    : null;
  let referencia: CamisetaContraLaReferencia['referencia'] = null;
  if (a.asentada) {
    const obj = leerObj(a.asentada);
    referencia = { malla: mallaDeObj(obj, 0.001, mmPorVt), superficie: new CuerpoRigido(buildLinearBVH(cuerpoDeObj(obj, null, 0.001))) };
  }
  const escena: Escena = { malla: camiseta.prenda.malla, obstaculos: [{ tipo: 'cuerpo', cuerpo }], costuras: camiseta.costuras, franja: camiseta.franja };
  return { escena, camiseta, cuerpo, referencia, errorDeColocacion, anillo };
}

export interface MedidasDeCamiseta {
  vertices: number;
  aplastados: number;
  estiramiento: ReturnType<typeof estiramiento>;
  costuras: ReturnType<typeof separacionDeCosturas>;
  /** por costura, de la más abierta a la más cerrada: sus dos piezas, cuántos puntos, el largo de cada lado en el patrón (m) y la separación (m) */
  porCostura: Array<{ piezas: [string, string]; puntos: number; largos: [number, number]; mediana: number; maxima: number }>;
  /** por pieza, el porcentaje de sus triángulos con menos de la mitad del área de su patrón */
  porPieza: Array<{ pieza: string; aplastados: number; estiramiento95: number }>;
  pliegues: ReturnType<typeof pliegues>;
  alCuerpo: ReturnType<typeof distanciaAlCuerpo>;
  /** la distancia de cada vértice de Vina a la asentada de la referencia */
  contraLaReferencia: ReturnType<typeof distanciaASuperficie> | null;
  /** lo mismo medido sobre la asentada de la referencia (sin costuras: el OBJ no las trae) */
  referencia: Omit<MedidasDeCamiseta, 'costuras' | 'porCostura' | 'porPieza' | 'contraLaReferencia' | 'referencia'> | null;
}

export function medirCamiseta(x: ArrayLike<number>, c: CamisetaContraLaReferencia): MedidasDeCamiseta {
  const { malla } = c.escena, ref = c.referencia, { piezas, prenda, lados } = c.camiseta;
  const nombre = (k: number) => `${piezas[k].name} (${piezas[k].category ?? 'sin clase'})`;
  const piezaDe = (v: number) => prenda.piezas.findIndex((p) => v >= p.v0 && v < p.v0 + p.nv);
  const largo = (lado: readonly number[]) => {
    let L = 0;
    for (let k = 1; k < lado.length; k++) {
      L += Math.hypot(malla.patron[2 * lado[k]] - malla.patron[2 * lado[k - 1]], malla.patron[2 * lado[k] + 1] - malla.patron[2 * lado[k - 1] + 1]);
    }
    return L;
  };
  return {
    vertices: x.length / 3,
    aplastados: aplastados(x, malla),
    estiramiento: estiramiento(x, malla),
    costuras: separacionDeCosturas(x, c.camiseta.costuras.puntos),
    porCostura: lados
      .filter((l) => l.a.length > 0 && l.b.length > 0)
      .map((l) => {
        const puntos = puntosDeCostura(malla.patron, l.a, l.b, l.ta, l.tb, l.vecinosA, l.vecinosB);
        return {
          piezas: [nombre(piezaDe(l.a[0])), nombre(piezaDe(l.b[0]))] as [string, string],
          puntos: puntos.length,
          largos: [largo(l.a), largo(l.b)] as [number, number],
          ...separacionDeCosturas(x, puntos),
        };
      })
      .sort((p, q) => q.maxima - p.maxima),
    porPieza: prenda.piezas.map((p, k) => ({
      pieza: nombre(k),
      aplastados: aplastados(x, malla, p.t0, p.nt),
      estiramiento95: estiramiento(x, malla, p.t0, p.nt).p95,
    })),
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
