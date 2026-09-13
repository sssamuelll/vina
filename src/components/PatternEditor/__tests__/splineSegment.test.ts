import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import {
  convertSegmentToSpline, isSplineManaged, resmoothAfterMove, splineRunAt, runAnchors,
  toManualBezier,
} from '../splineSegment';
import { convertToCurve } from '../nodeEditorUtils';

/** Rectángulo tal cual lo emite useRectangleTool. El lado superior es el índice 1. */
const rect = (): PathCommand[] => [
  { type: 'M', values: [0, 200] },
  { type: 'L', values: [300, 200] },
  { type: 'L', values: [300, 0] },
  { type: 'L', values: [0, 0] },
  { type: 'Z', values: [] },
];

const anchorsOf = (cmds: PathCommand[]): Point2D[] =>
  cmds.filter(c => c.type !== 'Z').map(c => ({ x: c.values[c.values.length - 2], y: c.values[c.values.length - 1] }));

/** Mueve el ancla del comando `i` y devuelve [antes, después]. */
function moveAnchor(cmds: PathCommand[], i: number, dx: number, dy: number): [PathCommand[], PathCommand[]] {
  const after = cmds.map(c => ({ ...c, values: [...c.values] }));
  const v = after[i].values;
  v[v.length - 2] += dx;
  v[v.length - 1] += dy;
  return [cmds, after];
}

function bezierAt(p1: Point2D, c1: Point2D, c2: Point2D, p2: Point2D, t: number): Point2D {
  const u = 1 - t;
  return {
    x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
    y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
  };
}

describe('convertSegmentToSpline (nota de María #197)', () => {
  it('parte el lado en tramos y deja puntos nuevos que agarrar', () => {
    const out = convertSegmentToSpline(rect(), 1, 4);
    // 1 L pasa a 4 C: tres puntos nuevos sobre el lado (4 anclas → 7).
    expect(out.filter(c => c.type === 'C')).toHaveLength(4);
    expect(anchorsOf(out)).toHaveLength(7);
    // Los tres nuevos caen repartidos sobre el lado original.
    for (const x of [75, 150, 225]) {
      expect(out.some(c => c.type === 'C' && Math.abs(c.values[4] - x) < 1e-9 && Math.abs(c.values[5] - 200) < 1e-9)).toBe(true);
    }
  });

  it('convertir NO deforma el patrón: la curva sigue dibujando la recta', () => {
    // Lo que ve María justo después de convertir. Si aquí apareciera panza,
    // convertir movería el patrón por su cuenta, que es inadmisible.
    const out = convertSegmentToSpline(rect(), 1, 4);
    for (let i = 1; i <= 4; i++) {
      const v = out[i].values;
      const from = i === 1 ? { x: 0, y: 200 } : { x: out[i - 1].values[4], y: out[i - 1].values[5] };
      const to = { x: v[4], y: v[5] };
      for (const t of [0.25, 0.5, 0.75]) {
        const p = bezierAt(from, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }, to, t);
        expect(p.y, `panza en el tramo ${i} a t=${t}`).toBeCloseTo(200, 9);
      }
    }
  });

  it('el último punto es el vértice original exacto, no una reconstrucción', () => {
    // Si se recalculara como from + (to-from)·k/n quedaría a un ulp del vértice,
    // y un piquete anclado ahí se desprendería (misma familia que la nota #171).
    const out = convertSegmentToSpline(rect(), 1, 7);
    const last = out.find((c, i) => c.type === 'C' && out[i + 1]?.type === 'L')!;
    expect(last.values[4]).toBe(300);
    expect(last.values[5]).toBe(200);
  });

  it('las esquinas del rectángulo siguen en punta', () => {
    // La cadena es abierta a propósito. Si fuera cerrada, convertir un lado
    // redondearía las dos esquinas vecinas y rompería la pieza.
    const out = convertSegmentToSpline(rect(), 1, 4);
    // El vecino sigue siendo recto y arranca en la esquina sin manejador.
    expect(out[5].type).toBe('L');
    expect(out[5].values).toEqual([300, 0]);
    // Y el primer tramo sale horizontal desde la esquina de origen.
    expect(out[1].values[1]).toBeCloseTo(200, 9);
  });

  it('no toca lo que no es un lado recto', () => {
    const curved = convertToCurve(rect(), 1);
    expect(convertSegmentToSpline(curved, 1, 4)).toEqual(curved);
    expect(convertSegmentToSpline(rect(), 0, 4)).toEqual(rect());   // la M
    expect(convertSegmentToSpline(rect(), 1, 1)).toEqual(rect());   // sin tramos
  });

  it('el cierre SÍ es un lado recto: la Z dibuja el cuarto lado (#1092)', () => {
    // Este assert vivía arriba con el comentario "// la Z", ratificando como
    // correcto el no-op que María notó: "estoy clicando en la V y no pasa
    // nada… esta línea se comporta siempre rara y distinta a las demás".
    // El índice 4 es exactamente lo que devuelve `nearestSegment` al clicar el
    // cuarto lado del rectángulo real, y ese lado se curva como los otros tres
    // — insertando los tramos ANTES del Z, que sigue cerrando el contorno.
    const out = convertSegmentToSpline(rect(), 4, 4);
    expect(out).not.toEqual(rect());
    expect(out.filter(c => c.type === 'C')).toHaveLength(4);
    expect(out[out.length - 1].type).toBe('Z');
  });
});

describe('los datos son su propia marca', () => {
  it('lo recién convertido se reconoce como curva por puntos', () => {
    const out = convertSegmentToSpline(rect(), 1, 4);
    const run = splineRunAt(out, 2)!;
    expect(run).toEqual({ start: 1, end: 4 });
    expect(isSplineManaged(out, run)).toBe(true);
  });

  it('un bezier movido a mano deja de reconocerse', () => {
    const out = convertSegmentToSpline(rect(), 1, 4);
    const tampered = out.map(c => ({ ...c, values: [...c.values] }));
    tampered[2].values[0] += 5; // alguien arrastró el manejador en "Editar curva"
    expect(isSplineManaged(tampered, { start: 1, end: 4 })).toBe(false);
  });

  it('la tolerancia es de bit, no de vista: 0.001 mm ya no coincide', () => {
    const out = convertSegmentToSpline(rect(), 1, 4);
    const nudged = out.map(c => ({ ...c, values: [...c.values] }));
    nudged[3].values[2] += 0.001;
    expect(isSplineManaged(nudged, { start: 1, end: 4 })).toBe(false);
  });

  it('runAnchors incluye el ancla que precede al tramo', () => {
    const out = convertSegmentToSpline(rect(), 1, 4);
    const points = runAnchors(out, { start: 1, end: 4 })!;
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 0, y: 200 });
    expect(points[4]).toEqual({ x: 300, y: 200 });
  });

  it('la salida explícita marca cada C sin alterar una sola coordenada', () => {
    const managed = convertSegmentToSpline(rect(), 1, 4);
    const coordinates = managed.map(command => [...command.values]);
    const manual = toManualBezier(managed, 2)!;

    expect(manual.map(command => command.values)).toEqual(coordinates);
    expect(manual.slice(1, 5).every(command => command.manualBezier === true)).toBe(true);
    expect(isSplineManaged(manual, { start: 1, end: 4 })).toBe(false);
  });

  it('no convierte una recta ni una cadena que ya es Bézier libre', () => {
    expect(toManualBezier(rect(), 1)).toBeNull();
    const managed = convertSegmentToSpline(rect(), 1, 4);
    const manual = toManualBezier(managed, 2)!;
    expect(toManualBezier(manual, 2)).toBeNull();
  });
});

describe('resmoothAfterMove', () => {
  it('mover un punto dobla la curva y la deja suave', () => {
    const spline = convertSegmentToSpline(rect(), 1, 4);
    const [before, after] = moveAnchor(spline, 2, 0, 40); // sube el primer punto nuevo
    const out = resmoothAfterMove(before, after, 2);

    // Sigue siendo curva por puntos, luego el próximo arrastre también re-suaviza.
    expect(isSplineManaged(out, { start: 1, end: 4 })).toBe(true);

    // Y ya no dibuja la recta: el tramo movido se separa de y=200.
    const v = out[2].values;
    const p = bezierAt({ x: 75, y: 200 }, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }, { x: v[4], y: v[5] }, 0.5);
    expect(Math.abs(p.y - 200)).toBeGreaterThan(1);
  });

  it('los manejadores de los VECINOS también se rehacen — si no, sale un pico', () => {
    const spline = convertSegmentToSpline(rect(), 1, 4);
    const [before, after] = moveAnchor(spline, 2, 0, 40);

    // Sin re-suavizado, el tramo anterior conserva su manejador viejo y la
    // curva llega al punto movido con un quiebre.
    const naive = after[1].values;
    const fixed = resmoothAfterMove(before, after, 2)[1].values;
    expect(fixed).not.toEqual(naive);
  });

  it('un bezier afinado a mano se queda como su dueño lo dejó', () => {
    const spline = convertSegmentToSpline(rect(), 1, 4);
    const tampered = spline.map(c => ({ ...c, values: [...c.values] }));
    tampered[2].values[0] += 5;

    const [before, after] = moveAnchor(tampered, 2, 0, 40);
    expect(resmoothAfterMove(before, after, 2)).toEqual(after);
  });

  it('mover un vértice de una pieza sin curvas no cambia nada', () => {
    const [before, after] = moveAnchor(rect(), 1, 10, 10);
    expect(resmoothAfterMove(before, after, 1)).toEqual(after);
  });

  it('mover la esquina que precede al tramo también lo re-suaviza', () => {
    // La esquina no es un `C`, pero es el ancla de contexto de la cadena: si no
    // se rehace, el primer tramo se queda apuntando a donde estaba la esquina.
    const spline = convertSegmentToSpline(rect(), 1, 4);
    const [before, after] = moveAnchor(spline, 0, 0, 60);
    const out = resmoothAfterMove(before, after, 0);
    expect(out[1].values.slice(0, 4)).not.toEqual(after[1].values.slice(0, 4));
    expect(isSplineManaged(out, { start: 1, end: 4 })).toBe(true);
  });

  it('al reescribir handles conserva los metadatos del comando', () => {
    const spline = convertSegmentToSpline(rect(), 1, 4);
    spline[2] = { ...spline[2], authoredAnchor: true };
    const [before, after] = moveAnchor(spline, 2, 0, 40);
    const out = resmoothAfterMove(before, after, 2);
    expect(out[2].authoredAnchor).toBe(true);
  });
});
