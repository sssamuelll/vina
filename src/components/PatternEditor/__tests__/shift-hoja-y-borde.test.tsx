// @vitest-environment jsdom
/**
 * Shift dos veces endereza al BORDE (spec 2026-09-23): la referencia de la
 * píldora. Shift una vez sigue siendo la hoja (firma B del 23-09), y lo prueba
 * `shift-endereza-a-la-hoja.test.tsx`, que no se toca.
 *
 * María, en su nota de la firma: «idealmente cuando uno hace SHIFT podrían
 * salir guías para las dos opciones contemplando que el usuario pueda elegir
 * la que quiera».
 *
 * Escena: el delantero de la firma, con el costado inclinado 1:3. Zoom 1 y
 * paneo 0: pantalla = patrón.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePenTool } from '../usePenTool';
import { polarOf } from '../polyPenGeometry';
import { relativeAngle, type AngleReference } from '../angleReference';

afterEach(cleanup);

const DELANTERO = {
  id: 'delantero', name: 'Delantero', internals: [], position: { x: 200, y: 150 }, rotation: 0, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
  ] as PathCommand[],
} as unknown as PatternPiece;

/** Punto medio del costado: local (230,90) → patrón (430,240). */
const COSTADO = { x: 430, y: 240 };
/** El rumbo de las capturas de la firma: 86,1° al borde a pulso. */
const RUMBO = { x: 291, y: 276 };
/** El costado recorrido en el sentido corregido, el que deja la pieza a +90°. */
const BORDE: AngleReference = { kind: 'border', baseDeg: polarOf({ x: 0, y: 0 }, { x: -60, y: -180 }).angleDeg };

const ev = (x: number, y: number, shiftKey = false, detail = 1) => ({
  button: 0, clientX: x, clientY: y, shiftKey, detail,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

const tecla = (type: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', shiftKey: type === 'keydown' })); });
/** Un toque y la segunda pulsación, mantenida: en el mismo milisegundo, dentro de los plazos. */
const dosVeces = () => { tecla('keydown'); tecla('keyup'); tecla('keydown'); };

describe('Pluma — Shift dos veces endereza al borde', () => {
  function setup(pieces: PatternPiece[] = [DELANTERO]) {
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, vi.fn(), pieces));
    const tool = () => hook.result.current;
    const click = (p: { x: number; y: number }, conShift = false) => act(() => {
      tool().handleMouseDown(ev(p.x, p.y, conShift));
      tool().handleMouseUp();
    });
    const move = (p: { x: number; y: number }, conShift = false) =>
      act(() => tool().handleMouseMove(ev(p.x, p.y, conShift)));
    return { tool, click, move };
  }

  it('desde el costado, la píldora lee 90,0° al borde', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    const l = tool().lastPointDistance!;
    expect(l.reference.kind).toBe('border');
    expect(relativeAngle(l.angleDeg, l.reference)).toBeCloseTo(90, 9);
    expect(tool().modoShift).toBe('borde');
  });

  it('las dos guías: con una vez manda la hoja; con dos, el borde', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    tecla('keydown');
    expect(tool().guias!.activa!.angleDeg).toBe(180);
    const borde = tool().guias!.tenue!.angleDeg;
    expect(relativeAngle(borde, BORDE)).toBeCloseTo(90, 9);
    tecla('keyup');
    tecla('keydown');
    expect(tool().guias!.activa!.angleDeg).toBeCloseTo(borde, 9);
    expect(tool().guias!.tenue!.angleDeg).toBe(180);
  });

  it('el clic con el borde activo coloca el nodo sobre la perpendicular', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    const [a, b] = tool().nodes.map(n => n.anchor);
    expect(relativeAngle(polarOf(a, b).angleDeg, BORDE)).toBeCloseTo(90, 9);
  });

  it('el segundo tramo con el borde sale a escuadra con el primero', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    move({ x: 300, y: 400 }, true);
    const l = tool().lastPointDistance!;
    expect(l.reference.kind).toBe('segment');
    // El primer tramo fue por la perpendicular al costado (con la hoja habría
    // salido horizontal, y un segundo tramo vertical también sería escuadra)…
    expect(relativeAngle(l.reference.baseDeg, BORDE)).toBeCloseTo(90, 9);
    // …y el segundo, a escuadra con él.
    expect(Math.abs(relativeAngle(l.angleDeg, l.reference))).toBeCloseTo(90, 9);
  });

  it('soltar Shift devuelve la goma al ratón y apaga las guías', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    tecla('keyup');
    expect(tool().lastPointDistance!.position).toEqual(RUMBO);
    expect(tool().guias).toBeNull();
    expect(tool().modoShift).toBe('suelto');
  });

  it('primer tramo libre: dos veces da lo mismo que una, y una sola guía', () => {
    const { tool, click, move } = setup([]);
    click({ x: 100, y: 100 });
    move({ x: 200, y: 108 });
    tecla('keydown');
    const hoja = tool().lastPointDistance!.position;
    tecla('keyup');
    tecla('keydown');
    expect(tool().modoShift).toBe('borde');
    expect(tool().lastPointDistance!.position).toEqual(hoja);
    expect(tool().guias!.tenue).toBeNull();
  });

  it('arrastrando un manejador no hay guías', () => {
    const { tool, move } = setup();
    act(() => tool().handleMouseDown(ev(COSTADO.x, COSTADO.y)));
    dosVeces();
    move({ x: COSTADO.x + 40, y: COSTADO.y + 40 }, true);
    expect(tool().isDragging).toBe(true);
    expect(tool().guias).toBeNull();
  });

  it('Tab con el borde congela la dirección enderezada', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    act(() => tool().openNextPoint());
    const np = tool().nextPoint!;
    expect(np.reference?.kind).toBe('border');
    expect(relativeAngle(np.angleDeg, np.reference!)).toBeCloseTo(90, 9);
    // Con la pareja congelada la goma no va por ninguna guía.
    expect(tool().guias).toBeNull();
  });
});
