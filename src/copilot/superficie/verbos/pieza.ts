import { z } from 'zod';
import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addPiece } from '../../../store/projectSlice';
import { newId } from '../../../utils/ids';
import { draftedPieceDefaults } from '../../../utils/defaults';
import { computeArea } from '../../../utils/nesting/nestingEngine';
import { computeBoundingBox } from '../../../utils/geometry/transform';
import { actuar, cerrar } from '../actuar';
import { unDecimal } from '../costuras';
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

export const VERBOS_DE_PIEZA: readonly Verbo[] = [createPiece];
