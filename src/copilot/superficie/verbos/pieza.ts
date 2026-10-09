import { z } from 'zod';
import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addPiece, updatePiece } from '../../../store/projectSlice';
import { newId } from '../../../utils/ids';
import { draftedPieceDefaults } from '../../../utils/defaults';
import { computeArea } from '../../../utils/nesting/nestingEngine';
import { computeBoundingBox } from '../../../utils/geometry/transform';
import { patternToPieceLocal, pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { applyNodeMove } from '../../../components/PatternEditor/nodeEditorUtils';
import { CLAVE_CONTORNO, conPaths } from '../../../components/PatternEditor/lineaEditable';
import { cotasDelLado } from '../../../components/PatternEditor/cotas/cotas';
import { segmentPolar } from '../../../components/PatternEditor/cotas/segmentPolar';
import { resizePieceTo } from '../../../components/PatternEditor/pieceResize';
import { actuar, cerrar, estaBloqueada, MARGEN_MM, piezaDe, rehusar, type Escritura } from '../actuar';
import { medirCostura, unDecimal } from '../costuras';
import { bordesDe, cajaDe } from './leer';

const punto = z.object({ x: z.number(), y: z.number() });

/** Donde nace una pieza sin sitio pedido: a la derecha de todo, con 50 mm de aire. */
function sitioLibre(pieces: readonly PatternPiece[]): Point2D {
  const caja = pieces.length > 0 ? computeBoundingBox([...pieces], pieces.map(p => p.id)) : null;
  return caja ? { x: caja.x + caja.width + 50, y: caja.y } : { x: 0, y: 0 };
}

const createPiece = definirVerbo({
  name: 'create_piece',
  description:
    'Create a piece: a rectangle from its width and height (x, y is its top-left corner; default: to the right of every piece), or a polygon from its corners in order. Pattern space, mm. The piece is born net (seam allowance 0) and its edges are detected. Returns its id, width, height, area and every edge measured.',
  args: z.object({
    name: z.string().min(1).optional().describe('default "Pieza N"'),
    rectangle: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      x: z.number().optional(),
      y: z.number().optional(),
    }).optional(),
    points: z.array(punto).min(3).optional().describe('the corners in order, pattern space, mm'),
  }).refine(a => (a.rectangle ? 1 : 0) + (a.points ? 1 : 0) === 1, { message: 'give rectangle or points, one of them' }),
  run: (args, ctx) => {
    const { pieces } = ctx.getState().project;
    const name = args.name ?? `Pieza ${pieces.length + 1}`;
    let outline: PathCommand[];
    if (args.rectangle) {
      const { width: w, height: h } = args.rectangle;
      const libre = sitioLibre(pieces);
      const x = args.rectangle.x ?? libre.x;
      const y = args.rectangle.y ?? libre.y;
      // El mismo contorno que la herramienta Rectángulo (`useRectangleTool`).
      outline = [
        { type: 'M', values: [x, y] },
        { type: 'L', values: [x + w, y] },
        { type: 'L', values: [x + w, y + h] },
        { type: 'L', values: [x, y + h] },
        { type: 'Z', values: [] },
      ];
    } else {
      const [primero, ...resto] = args.points!;
      outline = [
        { type: 'M', values: [primero.x, primero.y] },
        ...resto.map(p => ({ type: 'L' as const, values: [p.x, p.y] })),
        { type: 'Z', values: [] },
      ];
      if (computeArea(outline) < 1) throw new Error('the points do not enclose an area');
    }
    const ahora = Date.now();
    const piece: PatternPiece = { id: newId(), name, outline, ...draftedPieceDefaults(), createdAt: ahora, updatedAt: ahora };
    const e = actuar(ctx, 'create_piece', `crear ${name}`, () => { ctx.dispatch(addPiece(piece)); });
    const creada = e.despues.pieces.find(p => p.id === piece.id);
    const area = creada ? computeArea(creada.outline) : 0;
    return cerrar(ctx, 'create_piece', e, {
      done: area > 0,
      measure: creada
        ? { piece_id: creada.id, name: creada.name, ...cajaDe(creada), area: unDecimal(area), edges: bordesDe(creada) }
        : {},
      warnings: creada?.edges?.length ? [] : ['the piece has no detected edges'],
    });
  },
});

/**
 * La pieza con un nodo del contorno en otro sitio: el mismo escritor que el
 * arrastre y la cota de un lado (`useEditPattern.moveNodeTo`), con su
 * compensación de pivote y el re-anclado de los piquetes. `destino` es local.
 */
function conNodoEn(piece: PatternPiece, commandIndex: number, destino: Point2D): PatternPiece {
  return conPaths(piece, new Map([[CLAVE_CONTORNO, applyNodeMove(piece.outline, commandIndex, 'anchor', destino)]]));
}

/** El tramo recto que ES un borde: el índice de su cota «Largo», o por qué no lo hay. */
function ladoRecto(piece: PatternPiece, edge: string): number | string {
  const borde = piece.edges?.find(e => e.name === edge);
  if (!borde) throw new Error(`piece ${piece.id} has no edge named ${edge}`);
  const [d0, d1] = rangoMedibleDeBorde(piece.outline, borde.segmentRange);
  const tramos = segmentPolar(piece.outline).filter(s => s.drawCommandIndex >= d0 && s.drawCommandIndex < d1);
  const largo = computeRangeLengthMM(piece.outline, borde.segmentRange);
  if (tramos.length !== 1 || Math.abs(tramos[0].lengthMm - largo) > 0.01) {
    return `edge ${edge} has ${tramos.length} segments; set_length changes an edge of one straight segment: move its end point with move_point`;
  }
  return tramos[0].toCommandIndex;
}

/** Dónde queda el nodo `index` de una pieza, en espacio de patrón. */
function nodoEnPatron(piece: PatternPiece, index: number): Point2D | null {
  const v = piece.outline[index]?.values;
  return v && v.length >= 2 ? pieceLocalToPattern({ x: v[v.length - 2], y: v[v.length - 1] }, piece) : null;
}

// El esquema va aparte: `medidaDelContorno` necesita su tipo, y sacarlo del
// verbo ya declarado sería una referencia circular.
const argsDeContorno = z.object({
  piece_id: z.string().describe('a piece id from read_pattern'),
  mode: z.enum(['move_point', 'set_length', 'set_size']),
  point_index: z.number().int().min(0).optional().describe('move_point: an outline point index from read_piece'),
  to: punto.optional().describe('move_point: where the point goes, pattern space, mm'),
  edge: z.string().optional().describe('set_length: an edge name from read_pattern'),
  length: z.number().positive().optional().describe('set_length: the new length, mm'),
  width: z.number().positive().optional().describe('set_size: the new width, mm'),
  height: z.number().positive().optional().describe('set_size: the new height, mm'),
}).superRefine((a, issues) => {
  const falta = (m: string) => issues.addIssue({ code: 'custom', message: m });
  if (a.mode === 'move_point' && (a.point_index == null || !a.to)) falta('move_point needs point_index and to');
  if (a.mode === 'set_length' && (!a.edge || a.length == null)) falta('set_length needs edge and length');
  if (a.mode === 'set_size' && a.width == null && a.height == null) falta('set_size needs width or height');
});
type ArgsDeContorno = z.output<typeof argsDeContorno>;

const editOutline = definirVerbo({
  name: 'edit_outline',
  description:
    'Change the outline of a piece, the way its handles and dimensions do in the editor. Modes: move_point (an outline point by its index from read_piece, to a point in pattern space); set_length (an edge made of one straight segment gets a new length, keeping its start and its direction); set_size (the width and/or height of the piece, scaling it). Returns the edges that changed, with their lengths before and after, and every seam that uses them, measured again.',
  args: argsDeContorno,
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    let nueva: PatternPiece;
    let etiqueta: string;
    if (args.mode === 'move_point') {
      const cmd = piece.outline[args.point_index!];
      if (!cmd || cmd.values.length < 2) throw new Error(`point ${args.point_index} is not an outline point of piece ${piece.id}`);
      nueva = conNodoEn(piece, args.point_index!, patternToPieceLocal(args.to!, piece));
      etiqueta = `mover un punto de ${piece.name}`;
    } else if (args.mode === 'set_length') {
      const lado = ladoRecto(piece, args.edge!);
      if (typeof lado === 'string') return rehusar(lado);
      const update = cotasDelLado(piece, lado).find(c => c.kind === 'tramo-largo')?.apply(args.length!);
      if (!update || update.kind !== 'nodo') return rehusar(`edge ${args.edge} cannot take a length of ${args.length} mm`);
      nueva = conNodoEn(piece, update.commandIndex, update.destino);
      etiqueta = `cambiar el largo de un borde de ${piece.name}`;
    } else {
      const caja = computeBoundingBox([piece], [piece.id]);
      const update = caja ? resizePieceTo(piece, args.width ?? caja.width, args.height ?? caja.height) : null;
      if (!update) return rehusar('the piece has no size to change');
      nueva = { ...piece, outline: update.outline, position: update.position, rotation: update.rotation, internals: update.internals, updatedAt: Date.now() };
      etiqueta = `cambiar el tamaño de ${piece.name}`;
    }

    // Se decide antes de escribir; el recibo se mide después (spec § 5.3).
    const previa = medidaDelContorno(args, nueva);
    if (!previa.done) return rehusar(previa.warning);
    const e = actuar(ctx, 'edit_outline', etiqueta, () => { ctx.dispatch(updatePiece(nueva)); });
    const despues = e.despues.pieces.find(p => p.id === piece.id)!;
    const final = medidaDelContorno(args, despues);
    return cerrar(ctx, 'edit_outline', e, {
      done: final.done,
      measure: { piece_id: piece.id, ...final.measure, ...cambiosDeBordes(piece, despues, e) },
      warnings: final.done ? [] : [final.warning],
    });
  },
});

/** Lo que cada modo pidió, medido sobre una pieza: ¿lo cumple? */
function medidaDelContorno(args: ArgsDeContorno, piece: PatternPiece): { done: boolean; measure: Record<string, unknown>; warning: string } {
  if (args.mode === 'move_point') {
    const p = nodoEnPatron(piece, args.point_index!);
    const lejos = p ? Math.hypot(p.x - args.to!.x, p.y - args.to!.y) : Infinity;
    return {
      done: lejos <= MARGEN_MM,
      measure: { point: p ? { x: unDecimal(p.x), y: unDecimal(p.y) } : null },
      warning: `point ${args.point_index} lands ${unDecimal(lejos)} mm from where it was asked`,
    };
  }
  if (args.mode === 'set_length') {
    const borde = piece.edges?.find(e => e.name === args.edge);
    const largo = borde ? computeRangeLengthMM(piece.outline, borde.segmentRange) : NaN;
    return {
      done: Math.abs(largo - args.length!) <= MARGEN_MM,
      measure: { edge: args.edge, length: unDecimal(largo) },
      warning: `edge ${args.edge} measures ${unDecimal(largo)} mm, asked ${args.length} mm`,
    };
  }
  const caja = computeBoundingBox([piece], [piece.id]);
  const w = caja?.width ?? NaN;
  const h = caja?.height ?? NaN;
  const ok = (pedido: number | undefined, medido: number) => pedido == null || Math.abs(medido - pedido) <= MARGEN_MM;
  return {
    done: ok(args.width, w) && ok(args.height, h),
    measure: { width: unDecimal(w), height: unDecimal(h) },
    warning: `the piece measures ${unDecimal(w)} × ${unDecimal(h)} mm`,
  };
}

/** Los bordes que cambiaron de largo, y cada costura que los usa, medida otra vez. */
function cambiosDeBordes(antes: PatternPiece, despues: PatternPiece, e: Escritura) {
  const previos = new Map(bordesDe(antes).map(b => [b.name, b.length]));
  const tocados = bordesDe(despues).filter(b => previos.get(b.name) !== b.length);
  const nombres = new Set(tocados.map(b => b.name));
  const usa = (lado: { pieceId: string; edgeName: string }) => lado.pieceId === despues.id && nombres.has(lado.edgeName);
  return {
    edges_changed: tocados.map(b => ({ name: b.name, before: previos.get(b.name) ?? null, after: b.length })),
    seams: e.despues.seams.filter(s => usa(s.pieceA) || usa(s.pieceB)).map(s => medirCostura(s, e.despues.pieces)),
  };
}

export const VERBOS_DE_PIEZA: readonly Verbo[] = [createPiece, editOutline];
