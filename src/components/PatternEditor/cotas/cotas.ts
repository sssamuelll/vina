import type {
  InternalLine,
  PathCommand,
  PatternPiece,
  Point2D,
  Trazo,
} from '../../../types/types';
import { buildRing, projectToRing } from '../../../utils/geometry/outlineRing';
import { patternToPieceLocal, pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { computeBoundingBox, bboxPivot, rotatePoint } from '../../../utils/geometry/transform';
import { detectCorners } from '../../../utils/notchAnchor';
import { getAnchor } from '../nodeEditorUtils';
import { resizePieceTo } from '../pieceResize';
import type { TransformUpdate } from '../pieceResize';
import { polarOf, polarPoint } from '../polyPenGeometry';
import { edgeDistances, type EdgeDistance } from './edgeDistances';
import { segmentPolar } from './segmentPolar';
import { ABSOLUTE_REFERENCE, absoluteAngle, angleReferenceLabel, borderReference, referenceBefore, relativeAngle, type AngleReference } from '../angleReference';
import { buildSnapIndex, type SnapIndex } from '../snapIndex';

export type CotaUpdate =
  | ({ kind: 'piece' } & TransformUpdate)
  | { kind: 'internal'; pieceId: string; lineId: string; path: PathCommand[] }
  | {
      kind: 'margen';
      pieceId: string;
      edgeId: string;
      fuente: 'tramo' | 'borde' | 'pieza';
      spanIndex?: number;
      width: number;
    }
  /**
   * El tramo que se está dibujando (#1129). NO es una mutación de proyecto:
   * todavía no hay objeto que mutar. La resuelve `PatternEditor` contra el hook
   * de la herramienta viva —`placePolar` si se confirmó con Enter, actualizar
   * los valores pendientes si fue con Tab—, que es la única forma de que un
   * chip escriba en un gesto en vez de en Redux.
   */
  | { kind: 'tramoEnCurso'; largoMm: number; anguloDeg: number }
  /**
   * Mover un nodo del contorno a un punto exacto (#1112). Tampoco escribe el
   * store: lo aplica `useEditPattern`, que es quien ya lo hace en el arrastre,
   * con su compensación de pivote, su re-anclado de piquetes y su lote de
   * deshacer. Un segundo escritor del mismo hecho es el fallo con nombre propio
   * del repo.
   */
  | { kind: 'nodo'; pieceId: string; commandIndex: number; destino: Point2D }
  /**
   * Un tramo de trazo (spec 2026-09-12 § 5.3). Un trazo no tiene anfitriona:
   * su `path` ya está en patrón, así que el update lleva el trazo entero y no
   * un par pieza/línea.
   */
  | { kind: 'trazo'; trazoId: string; path: PathCommand[] };

/**
 * Una cota viva (spec 2026-08-30 § 3, § 5): la medida que el objeto enseña
 * sobre el lienzo y que se edita ahí mismo. `a`→`b` es el segmento de la
 * línea de cota en coordenadas de PATRÓN, sin desplazar; `outward` es el
 * vector unitario hacia fuera de la pieza (la capa lo usa para separar la
 * línea y el chip en px de pantalla). `apply` devuelve la mutación de la
 * pieza — o `null` si el valor no es representable.
 */
export interface Cota {
  id: string;
  /**
   * Las magnitudes de un mismo tramo conservan sus operaciones independientes,
   * pero comparten esta identidad para presentarse en una sola caja (§ 14).
   * No se agrupan por cercanía: dos tramos superpuestos siguen siendo distintos.
   */
  grupo?: string;
  kind: 'ancho' | 'alto' | 'tramo-largo' | 'tramo-angulo' | 'borde' | 'margen';
  /** Nombre accesible, en español: "Ancho de la pieza". */
  label: string;
  /** Visible beside the angle, including while editing the numeric field. */
  referenceLabel?: string;
  valueMm: number;
  unit: 'mm' | 'deg';
  min: number;
  max: number;
  /** Relleno (mando principal) o hueco (verificación) — § 3.4. */
  primary: boolean;
  /**
   * Confirmar con Enter vale aunque el valor no haya cambiado (#1129).
   *
   * Para la cota de un objeto, «no cambió → no despacho» es correcto: evita
   * escribir en el store por nada. Para el tramo en curso NO lo es, porque ahí
   * confirmar no es una mutación: es la orden de COLOCAR el punto. Sin esto,
   * María congela el tramo, ve `80 mm / −90°` —que es justo lo que quiere—,
   * pulsa Enter y no pasa nada: el caso más simple del encadenado, muerto.
   */
  confirmaSinCambio?: boolean;
  /** Procedencia visible del número cuando hace falta decirla. */
  rotulo?: string;
  /** Ausente conserva el scrub; `false` deja el chip solo para teclado. */
  scrub?: boolean;
  a: Point2D;
  b: Point2D;
  outward: Point2D;
  apply(valueMm: number): CotaUpdate | null;
}

/** Lo que `computeBoundingBox` y `scaleOutline` entienden. `H`, `V` y `A` son válidos en el esquema
 *  pero ninguno de los dos los recorre: una cota sobre ese contorno mediría mal y escribiría peor. */
const COMANDOS_SOPORTADOS: ReadonlySet<string> = new Set(['M', 'L', 'C', 'Q', 'Z']);

/** El mismo rango que declara `rectangle.tsx` para Ancho y Alto. */
const MEDIDA_MIN = 1;
const MEDIDA_MAX = 3000;

/** Gira un vector (no un punto) en la convención del render: `rotate()` del SVG, Y hacia abajo. */
function giraVector(v: Point2D, rad: number): Point2D {
  if (!rad) return v;
  const r = rotatePoint(v, { x: 0, y: 0 }, rad);
  return { x: Math.abs(r.x) < 1e-12 ? 0 : r.x, y: Math.abs(r.y) < 1e-12 ? 0 : r.y };
}

/**
 * Las dos cotas de una pieza: Ancho sobre el lado superior de su caja y Alto
 * sobre el lado derecho, en el marco girado de la caja — `computeBoundingBox`
 * devuelve la caja SIN girar más `rotation`/`pivot`, y los tiradores hacen la
 * misma conversión (`computeHandlePositions`). Escribirlas es `resizePieceTo`:
 * la esquina superior izquierda queda plantada, "como si arrastraras el
 * manejador inferior derecho" (maria-198).
 */
export function cotasDePieza(piece: PatternPiece): Cota[] {
  if (piece.outline.some(c => !COMANDOS_SOPORTADOS.has(c.type))) return [];
  const bbox = computeBoundingBox([piece], [piece.id]);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return [];
  const rad = ((bbox.rotation ?? 0) * Math.PI) / 180;
  const pivot = bboxPivot(bbox);
  const R = (p: Point2D) => (rad ? rotatePoint(p, pivot, rad) : p);
  const nw = R({ x: bbox.x, y: bbox.y });
  const ne = R({ x: bbox.x + bbox.width, y: bbox.y });
  const se = R({ x: bbox.x + bbox.width, y: bbox.y + bbox.height });
  return [
    {
      id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: bbox.width, unit: 'mm',
      min: MEDIDA_MIN, max: MEDIDA_MAX, primary: true,
      a: nw, b: ne, outward: giraVector({ x: 0, y: -1 }, rad),
      apply: (w) => {
        const update = resizePieceTo(piece, w, bbox.height);
        return update ? { kind: 'piece', ...update } : null;
      },
    },
    {
      id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: bbox.height, unit: 'mm',
      min: MEDIDA_MIN, max: MEDIDA_MAX, primary: true,
      a: ne, b: se, outward: giraVector({ x: 1, y: 0 }, rad),
      apply: (h) => {
        const update = resizePieceTo(piece, bbox.width, h);
        return update ? { kind: 'piece', ...update } : null;
      },
    },
  ];
}

export function normalHaciaFuera(a: Point2D, b: Point2D, centro: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-9) return { x: 0, y: 1 };
  const normal = { x: -dy / largo, y: dx / largo };
  const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const haciaCentro = (medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y;
  return haciaCentro < 0 ? { x: -normal.x, y: -normal.y } : normal;
}

function copiaConNodoFinal(
  path: PathCommand[],
  commandIndex: number,
  point: Point2D,
): PathCommand[] | null {
  const copy = path.map(command => ({ ...command, values: [...command.values] }));
  const command = copy[commandIndex];
  if (!command || command.values.length < 2) return null;
  const offset = command.values.length - 2;
  command.values[offset] = point.x;
  command.values[offset + 1] = point.y;
  return copy;
}

/**
 * Replica la semántica del arrastre manual de extremos. En C/Q no basta con
 * mover el ancla: el control que llega a ella viaja por el mismo delta para
 * que editar una cota de borde no cambie también, de rebote, la tangente con
 * la que la curva alcanzaba ese extremo.
 */
function copiaConExtremo(
  path: PathCommand[],
  endpointIndex: 0 | 1,
  point: Point2D,
): PathCommand[] | null {
  const copy = path.map(command => ({ ...command, values: [...command.values] }));
  if (endpointIndex === 0) {
    const first = copy[0];
    if (!first || first.values.length < 2) return null;
    const dx = point.x - first.values[0];
    const dy = point.y - first.values[1];
    first.values[0] = point.x;
    first.values[1] = point.y;
    // Simétrico al extremo final: si lo que sale de M es una curva, su
    // control de salida viaja con el mismo delta para no torcer la tangente.
    const next = copy[1];
    if (next && (next.type === 'C' || next.type === 'Q') && next.values.length >= 2) {
      next.values[0] += dx;
      next.values[1] += dy;
    }
    return copy;
  }

  const last = copy[copy.length - 1];
  if (!last) return null;
  if (last.type === 'L') {
    last.values[0] = point.x;
    last.values[1] = point.y;
    return copy;
  }
  if (last.type === 'C') {
    const dx = point.x - last.values[4];
    const dy = point.y - last.values[5];
    last.values[4] = point.x;
    last.values[5] = point.y;
    last.values[2] += dx;
    last.values[3] += dy;
    return copy;
  }
  if (last.type === 'Q') {
    const dx = point.x - last.values[2];
    const dy = point.y - last.values[3];
    last.values[2] = point.x;
    last.values[3] = point.y;
    last.values[0] += dx;
    last.values[1] += dy;
    return copy;
  }
  return null;
}

function nombreCorto(point: Point2D): string {
  const x = Math.abs(point.x) < 1e-9 ? 0 : Math.round(point.x * 10) / 10;
  const y = Math.abs(point.y) < 1e-9 ? 0 : Math.round(point.y * 10) / 10;
  return `(${x}, ${y})`;
}

/**
 * `edgeDistances` decide la esquina sobre el punto YA proyectado al anillo.
 * Repetir la comparación contra el extremo crudo abre una grieta de 0,5 mm:
 * un punto apenas fuera del contorno puede engancharse a una esquina y, aun
 * así, recibir el máximo de dos lados y saltársela al escribir.
 */
function coincideConEsquinaProyectada(
  outline: PathCommand[],
  endpoint: Point2D,
  corners: Point2D[],
): boolean {
  const built = buildRing(outline, 2);
  if (!built.ok) return false;
  const ring = built.value;
  const endpointMm = projectToRing(ring, endpoint).distanceMm;
  return corners.some((corner) => {
    const cornerMm = projectToRing(ring, corner).distanceMm;
    const direct = Math.abs(endpointMm - cornerMm);
    return Math.min(direct, ring.totalMm - direct) <= 1e-7;
  });
}

/**
 * Las dos cotas (largo · ángulo) de cada tramo `L` de un path. `aPatron` y
 * `aLocal` convierten entre el marco del path y el de pantalla: para una
 * interna son las de la pieza; para un trazo, la identidad (ya está en mundo).
 */
function cotasDeTramos(opts: {
  path: PathCommand[];
  idBase: string;
  centro: Point2D;
  aPatron: (p: Point2D) => Point2D;
  aLocal: (p: Point2D) => Point2D;
  escribir: (path: PathCommand[]) => CotaUpdate | null;
  segmentIndex?: number;
  firstReferenceAt?: (world: Point2D) => AngleReference;
}): Cota[] {
  const { path, idBase, centro, aPatron, aLocal, escribir, segmentIndex, firstReferenceAt } = opts;
  const cotas: Cota[] = [];
  for (const segment of segmentPolar(path)) {
    // La selección precisa conserva el índice del comando de llegada: filtrar
    // aquí reutiliza la escritura que ya deja fijo el origen y mueve solo ese
    // nodo. Un índice desaparecido no debe mostrar las cotas de sus hermanos.
    if (segmentIndex !== undefined && segment.toCommandIndex !== segmentIndex) continue;
    const from = aPatron(segment.from);
    const to = aPatron(segment.to);
    const outward = normalHaciaFuera(from, to, centro);
    // Dirección y referencia se llevan juntas a patrón antes de restarlas.
    // Así el ángulo relativo y su escritura conservan el marco al girar la pieza.
    const previous = referenceBefore(path, segment.toCommandIndex);
    const reference = previous.kind === 'segment'
      ? { ...previous, baseDeg: polarOf(from, aPatron(polarPoint(segment.from, 1, previous.baseDeg))).angleDeg }
      : firstReferenceAt?.(from) ?? ABSOLUTE_REFERENCE;
    const anguloPatron = polarOf(from, to).angleDeg;
    const grupo = `${idBase}-tramo-${segment.toCommandIndex}`;
    cotas.push({
      id: `${grupo}-largo`,
      grupo,
      kind: 'tramo-largo',
      label: 'Largo',
      valueMm: segment.lengthMm,
      unit: 'mm',
      min: 0.1,
      max: 99999,
      primary: true,
      a: from,
      b: to,
      outward,
      apply: (mm) => {
        const nuevo = copiaConNodoFinal(path, segment.toCommandIndex, segment.writeLength(mm));
        return nuevo ? escribir(nuevo) : null;
      },
    });
    cotas.push({
      id: `${grupo}-angulo`,
      grupo,
      kind: 'tramo-angulo',
      label: 'Ángulo',
      referenceLabel: angleReferenceLabel(reference),
      valueMm: relativeAngle(anguloPatron, reference),
      unit: 'deg',
      min: -360,
      max: 360,
      primary: true,
      a: from,
      b: to,
      outward,
      apply: (deg) => {
        const nuevo = copiaConNodoFinal(
          path,
          segment.toCommandIndex,
          aLocal(polarPoint(from, segment.lengthMm, absoluteAngle(deg, reference))),
        );
        return nuevo ? escribir(nuevo) : null;
      },
    });
  }
  return cotas;
}

/**
 * `buildSnapIndex` aplana nodos, extremos y anillos de TODAS las piezas
 * visibles — caro, y ya documentado como memoizable "por identidad de
 * `pieces`" en `snapIndex.ts`. `cotasDeTrazo`/`cotasDeLineaInterna` lo
 * reconstruían en cada llamada de todos modos: una caché por identidad evita
 * rehacerlo cuando la pieza (o el array de piezas visibles) no cambió entre
 * dos llamadas — el caso común en la ruta de render, donde `sujeto.ts` llama
 * esto en cada tick con la misma selección.
 */
const snapIndexPorPieza = new WeakMap<PatternPiece, SnapIndex>();
const snapIndexPorPiezas = new WeakMap<PatternPiece[], SnapIndex>();

function snapIndexDePieza(piece: PatternPiece): SnapIndex {
  let index = snapIndexPorPieza.get(piece);
  if (!index) {
    index = buildSnapIndex([piece]);
    snapIndexPorPieza.set(piece, index);
  }
  return index;
}

function snapIndexDePiezas(pieces: PatternPiece[]): SnapIndex {
  let index = snapIndexPorPiezas.get(pieces);
  if (!index) {
    index = buildSnapIndex(pieces);
    snapIndexPorPiezas.set(pieces, index);
  }
  return index;
}

/** Las cotas de un tramo de trazo (spec 2026-09-12 § 5.3): el path ya está en patrón. */
export function cotasDeTrazo(trazo: Trazo, segmentIndex: number, pieces: PatternPiece[] = []): Cota[] {
  const anclas = trazo.path.map(getAnchor).filter((a): a is Point2D => a !== null);
  if (anclas.length < 2) return [];
  const centro = {
    x: anclas.reduce((s, a) => s + a.x, 0) / anclas.length,
    y: anclas.reduce((s, a) => s + a.y, 0) / anclas.length,
  };
  const identidad = (p: Point2D) => p;
  const index = snapIndexDePiezas(pieces);
  return cotasDeTramos({
    path: trazo.path,
    idBase: `trazo-${trazo.id}`,
    centro,
    aPatron: identidad,
    aLocal: identidad,
    firstReferenceAt: (world) => borderReference(index, world),
    escribir: (path) => ({ kind: 'trazo', trazoId: trazo.id, path }),
    segmentIndex,
  });
}

/** Cotas de tramo y de borde de una sola línea interna seleccionada. */
export function cotasDeLineaInterna(piece: PatternPiece, line: InternalLine, segmentIndex?: number): Cota[] {
  // Un piquete conserva una segunda verdad paramétrica (`notchAnchor`) y una
  // pinza tiene su propia entidad rica: mover solo el path desde este editor
  // genérico abriría dos dueños del mismo dato. Sus chips quedan para la tanda
  // que migre también esas representaciones, como fija la spec § 11.
  if (line.type === 'notch' || line.type === 'dart') return [];

  const bbox = computeBoundingBox([piece], [piece.id]);
  const centro = bbox
    ? bboxPivot(bbox)
    : pieceLocalToPattern({ x: 0, y: 0 }, piece);
  const idBase = `${piece.id}-${line.id}`;
  const index = snapIndexDePieza(piece);
  const cotas = cotasDeTramos({
    path: line.path,
    idBase,
    centro,
    aPatron: (p) => pieceLocalToPattern(p, piece),
    aLocal: (p) => patternToPieceLocal(p, piece),
    firstReferenceAt: (world) => borderReference(index, world, piece.id),
    escribir: (path) => ({ kind: 'internal', pieceId: piece.id, lineId: line.id, path }),
    segmentIndex,
  });

  // Las referencias al contorno pertenecen a la interna completa. Seleccionar
  // un tramo ofrece únicamente su caja de largo y ángulo; los productores sin
  // índice conservan también las cotas de borde que ya podían editar.
  if (segmentIndex !== undefined || line.path.length < 2 || line.path.filter(command => command.type === 'M').length > 1) {
    return cotas;
  }

  const first = getAnchor(line.path[0]);
  const last = getAnchor(line.path[line.path.length - 1]);
  const outlineCorners = detectCorners(piece.outline);
  const endpoints: Array<{ index: 0 | 1; local: Point2D | null }> = [
    { index: 0, local: first },
    { index: 1, local: last },
  ];

  for (const endpoint of endpoints) {
    if (!endpoint.local) continue;
    const distances = edgeDistances(piece.outline, endpoint.local);
    if (!distances) continue;
    const endpointPattern = pieceLocalToPattern(endpoint.local, piece);
    const coincidesConEsquina = coincideConEsquinaProyectada(
      piece.outline,
      endpoint.local,
      outlineCorners,
    );
    const sideLength = distances.cw.mm + distances.ccw.mm;
    const entries: Array<{ direction: 'ccw' | 'cw'; distance: EdgeDistance }> = [
      { direction: 'ccw', distance: distances.ccw },
      { direction: 'cw', distance: distances.cw },
    ];

    for (const { direction, distance } of entries) {
      const cornerPattern = pieceLocalToPattern(distance.corner, piece);
      const outward = normalHaciaFuera(cornerPattern, endpointPattern, centro);
      cotas.push({
        id: `${idBase}-borde-${endpoint.index}-${direction}`,
        kind: 'borde',
        label: `Borde · ${nombreCorto(distance.corner)}`,
        valueMm: distance.mm,
        unit: 'mm',
        min: 0.001,
        max: coincidesConEsquina ? distance.mm : sideLength,
        primary: false,
        a: cornerPattern,
        b: endpointPattern,
        outward,
        apply: (mm) => {
          const path = copiaConExtremo(line.path, endpoint.index, distance.write(mm));
          return path
            ? { kind: 'internal', pieceId: piece.id, lineId: line.id, path }
            : null;
        },
      });
    }
  }

  return cotas;
}
