import { describe, it, expect } from 'vitest';
import {
  computeBoundingBox,
  computeHandlePositions,
  computeScaleFromDrag,
  computeRotationFromDrag,
  scaleAnchorForHandle,
  rotatePoint,
  outlineBBoxCenter,
  type BBox,
} from '../../../utils/geometry/transform';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * La caja de transformación tiene que saber que las piezas tienen orientación.
 *
 * Medido antes de este cambio (#1033): con `piece.rotation = 45`, 1 de los 6
 * vértices de la pieza caía dentro del marco dibujado, y el marco era idéntico
 * para 0/45/90. Los fixtures de `transformUtils.test.ts` son rectángulos a 0°,
 * la única familia de forma para la que el defecto es invisible.
 *
 * Todo lo de acá usa una pieza MUTADA — en L, asimétrica en los dos ejes.
 */

const L_SHAPE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [60, 0] },
  { type: 'L', values: [60, 20] },
  { type: 'L', values: [20, 20] },
  { type: 'L', values: [20, 80] },
  { type: 'L', values: [0, 80] },
  { type: 'Z', values: [] },
];

function piece(rotation: number, position = { x: 100, y: 100 }, id = 'p1'): PatternPiece {
  return {
    id, name: 'L', outline: L_SHAPE, internals: [],
    position, rotation, mirrored: false, seamAllowance: 0,
  } as unknown as PatternPiece;
}

/** Dónde caen de verdad los vértices, replicando `PieceRenderer.tsx:130`:
 *  `translate(position) rotate(piece.rotation, cx, cy)`. */
function verticesEnPantalla(p: PatternPiece): { x: number; y: number }[] {
  const c = outlineBBoxCenter(p.outline);
  const rad = ((p.rotation ?? 0) * Math.PI) / 180;
  const out: { x: number; y: number }[] = [];
  for (const cmd of p.outline) {
    for (let i = 0; i + 1 < cmd.values.length; i += 2) {
      const r = rotatePoint({ x: cmd.values[i], y: cmd.values[i + 1] }, c, rad);
      out.push({ x: r.x + p.position.x, y: r.y + p.position.y });
    }
  }
  return out;
}

/** Un punto de pantalla, des-girado al marco propio de la caja, ¿cae dentro? */
function caeDentro(pt: { x: number; y: number }, box: BBox): boolean {
  const rad = ((box.rotation ?? 0) * Math.PI) / 180;
  const pivot = box.pivot ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const local = rotatePoint(pt, pivot, -rad);
  const eps = 1e-6;
  return local.x >= box.x - eps && local.x <= box.x + box.width + eps
      && local.y >= box.y - eps && local.y <= box.y + box.height + eps;
}

describe('computeBoundingBox — la caja sigue la orientación de la pieza', () => {
  it('encierra los 6 vértices de una pieza girada 45° (antes caía 1)', () => {
    const p = piece(45);
    const box = computeBoundingBox([p], ['p1'])!;
    const dentro = verticesEnPantalla(p).filter(v => caeDentro(v, box)).length;
    expect(dentro).toBe(6);
  });

  it('declara la orientación de la pieza, no 0', () => {
    expect(computeBoundingBox([piece(45)], ['p1'])!.rotation).toBeCloseTo(45);
    expect(computeBoundingBox([piece(90)], ['p1'])!.rotation).toBeCloseTo(90);
  });

  it('gira sobre el mismo pivote que usa el renderizador', () => {
    const p = piece(30);
    const box = computeBoundingBox([p], ['p1'])!;
    const c = outlineBBoxCenter(L_SHAPE); // (30,40) local
    expect(box.pivot!.x).toBeCloseTo(p.position.x + c.x);
    expect(box.pivot!.y).toBeCloseTo(p.position.y + c.y);
  });

  it('a 0° se comporta exactamente como antes — eje-alineada sobre el contorno crudo', () => {
    const box = computeBoundingBox([piece(0)], ['p1'])!;
    expect(box).toMatchObject({ x: 100, y: 100, width: 60, height: 80 });
    expect(box.rotation ?? 0).toBe(0);
  });

  it('con varias piezas de giros distintos NO inventa una orientación', () => {
    // Cada pieza gira sobre su propio centro: no existe una caja orientada
    // honesta para el grupo. Se devuelve la eje-alineada de la geometría YA
    // girada, que hoy tampoco es correcta.
    const a = piece(0, { x: 0, y: 0 }, 'a');
    const b = piece(90, { x: 200, y: 0 }, 'b');
    const box = computeBoundingBox([a, b], ['a', 'b'])!;
    expect(box.rotation ?? 0).toBe(0);
    for (const v of [...verticesEnPantalla(a), ...verticesEnPantalla(b)]) {
      expect(caeDentro(v, box)).toBe(true);
    }
  });
});

describe('computeHandlePositions — los tiradores viajan con la caja', () => {
  it('pone la esquina noroeste donde la lleva el giro', () => {
    const box = computeBoundingBox([piece(45)], ['p1'])!;
    const nw = computeHandlePositions(box, 1).find(h => h.id === 'nw')!;
    const esperado = rotatePoint({ x: box.x, y: box.y }, box.pivot!, (45 * Math.PI) / 180);
    expect(nw.pos.x).toBeCloseTo(esperado.x);
    expect(nw.pos.y).toBeCloseTo(esperado.y);
  });

  it('saca el tirador de giro del mismo lado que el norte de la pieza', () => {
    // Antes se quedaba clavado en el mismo punto para 0/45/90.
    const h0 = computeHandlePositions(computeBoundingBox([piece(0)], ['p1'])!, 1)
      .find(h => h.id === 'rotate')!;
    const h90 = computeHandlePositions(computeBoundingBox([piece(90)], ['p1'])!, 1)
      .find(h => h.id === 'rotate')!;
    expect(Math.hypot(h90.pos.x - h0.pos.x, h90.pos.y - h0.pos.y)).toBeGreaterThan(1);
  });
});

describe('estirar en el marco propio de la pieza', () => {
  it('el ancla se queda en el marco propio de la caja, sin girar', () => {
    // El contorno vive en espacio local: el ancla tiene que llegarle en ese
    // marco. Lo que se des-gira es el ARRASTRE, no el ancla. Girarla aquí
    // haría que `scaleOutline` escalara sobre un punto que no existe en el
    // espacio del contorno.
    const box = computeBoundingBox([piece(90)], ['p1'])!;
    expect(scaleAnchorForHandle('e', box)).toEqual({
      x: box.x, y: box.y + box.height / 2,
    });
  });

  it('arrastrar a lo largo del eje propio de la pieza estira en ese eje, no en el otro', () => {
    // Caja girada 90°: el eje X propio de la pieza apunta al +Y del mundo.
    // Arrastrar el tirador 'e' hacia abajo tiene que ser crecer a lo ancho.
    const box = computeBoundingBox([piece(90)], ['p1'])!;
    const { scaleX, scaleY } = computeScaleFromDrag(
      'e', box, { x: 0, y: 0 }, { x: 0, y: 30 }, false,
    );
    expect(scaleX).toBeGreaterThan(1);
    expect(scaleY).toBeCloseTo(1);
  });

  it('a 0° el arrastre se calcula igual que antes', () => {
    const box = computeBoundingBox([piece(0)], ['p1'])!;
    const { scaleX, scaleY } = computeScaleFromDrag(
      'e', box, { x: 0, y: 0 }, { x: 30, y: 0 }, false,
    );
    expect(scaleX).toBeCloseTo(1 + 30 / 60);
    expect(scaleY).toBeCloseTo(1);
  });
});

describe('computeRotationFromDrag — pivota donde pivota el renderizador', () => {
  it('mide el ángulo alrededor del pivote de la caja, no de su centro geométrico', () => {
    const box: BBox = {
      x: 0, y: 0, width: 100, height: 100,
      rotation: 0, pivot: { x: 0, y: 0 },
    };
    // Desde (10,0) hasta (0,10) alrededor de (0,0) son +90°.
    const a = computeRotationFromDrag(box, { x: 10, y: 0 }, { x: 0, y: 10 }, false);
    expect((a * 180) / Math.PI).toBeCloseTo(90);
  });
});
