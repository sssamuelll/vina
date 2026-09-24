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
import { renderHook, act, cleanup, render, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePenTool } from '../usePenTool';
import { usePolyPenTool } from '../usePolyPenTool';
import { useEditPattern } from '../useEditPattern';
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
    // El marco también sale suelto, para la pista del pie (la píldora se apaga al cerrar).
    expect(tool().angleReference).toEqual(l.reference);
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

describe('Línea interna — Shift dos veces endereza al borde', () => {
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePolyPenTool(1, { x: 0, y: 0 }, { nodeType: 'straight', pieces: [DELANTERO], onComplete }));
    const tool = () => hook.result.current;
    const click = (p: { x: number; y: number }, conShift = false) => act(() => {
      tool().handleMouseDown(ev(p.x, p.y, conShift));
      tool().handleMouseUp(ev(p.x, p.y, conShift));
    });
    const move = (p: { x: number; y: number }, conShift = false) =>
      act(() => tool().handleMouseMove(ev(p.x, p.y, conShift)));
    return { tool, click, move, onComplete };
  }

  it('la goma va por la perpendicular al costado, con la hoja como guía tenue', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    expect(relativeAngle(polarOf(COSTADO, tool().previewPoint!).angleDeg, tool().angleReference)).toBeCloseTo(90, 9);
    expect(tool().guias!.tenue!.angleDeg).toBe(180);
    expect(tool().modoShift).toBe('borde');
  });

  it('el nodo cae sobre la perpendicular y la línea termina con dos nodos', () => {
    const { tool, click, move, onComplete } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    tecla('keyup');
    act(() => { tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })); });
    const [, comandos] = onComplete.mock.calls[0];
    const [m, l] = comandos as PathCommand[];
    expect(comandos).toHaveLength(2);
    const a = { x: m.values[0], y: m.values[1] };
    const b = { x: l.values[0], y: l.values[1] };
    expect(relativeAngle(polarOf(a, b).angleDeg, BORDE)).toBeCloseTo(90, 9);
  });

  it('una vez es la hoja, como hoy', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    tecla('keydown');
    expect(tool().previewPoint!.y).toBe(COSTADO.y);
    expect(tool().guias!.activa!.angleDeg).toBe(180);
    expect(tool().modoShift).toBe('hoja');
  });

  it('sin Shift no hay guías', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    expect(tool().guias).toBeNull();
    expect(tool().previewPoint).toEqual(RUMBO);
  });
});

// ─── Editar patrón (Q) ────────────────────────────────────────────────────────
//
// El marco del borde es el lado que LLEGA al punto agarrado (o el propio lado,
// si se agarra un lado), congelado al empezar el arrastre (spec § 3.4).

type Pt = { x: number; y: number };
let editorQ: ReturnType<typeof useEditPattern> | null = null;

function EditorQ() {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  editorQ = editor;
  return (
    <svg data-testid="q" onMouseDown={editor.handleMouseDown} onMouseMove={editor.handleMouseMove} onMouseUp={editor.handleMouseUp}>
      <rect data-testid="entrar" onClick={() => editor.enterEdit('delantero')} />
    </svg>
  );
}

function setupQ(pieza: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [pieza] }));
  const vista = render(<Provider store={store}><EditorQ /></Provider>);
  fireEvent.click(vista.getByTestId('entrar'));
  const svg = vista.getByTestId('q');
  return {
    store,
    tool: () => editorQ!,
    down: (p: Pt, shiftKey = false) => fireEvent.mouseDown(svg, { button: 0, clientX: p.x, clientY: p.y, shiftKey }),
    move: (p: Pt, shiftKey = false) => fireEvent.mouseMove(svg, { clientX: p.x, clientY: p.y, shiftKey }),
    up: () => fireEvent.mouseUp(svg, { button: 0 }),
    /** El ancla `i` del contorno, en coordenadas locales de la pieza. */
    ancla: (i: number): Pt => {
      const v = store.getState().project.pieces[0].outline[i].values;
      return { x: v[v.length - 2], y: v[v.length - 1] };
    },
  };
}

/** El costado en local: de (200,0) a (260,180), dirección (60,180). */
const cruzConCostado = (desde: Pt, p: Pt) => (p.x - desde.x) * 180 - (p.y - desde.y) * 60;

describe('Editar patrón — Shift dos veces endereza respecto al lado', () => {
  it('arrastrar el final del costado lo alarga sin cambiar su inclinación', () => {
    const { down, move, up, ancla } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 480, y: 380 }, true);
    up();
    const p = ancla(2);
    expect(cruzConCostado({ x: 200, y: 0 }, p)).toBeCloseTo(0, 6);
    expect(p.y).toBeGreaterThan(180);
  });

  it('el marco se congela: dos pasos en perpendicular quedan sobre la misma recta', () => {
    const { down, move, ancla } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    // Perpendicular a la dirección ORIGINAL (60,180): el producto escalar con
    // ella, desde donde estaba el punto, se queda en cero. Un marco vivo
    // giraría con el lado en el segundo paso.
    const escalar = (p: Pt) => (p.x - 260) * 60 + (p.y - 180) * 180;
    move({ x: 520, y: 312 }, true);
    const p1 = ancla(2);
    move({ x: 580, y: 294 }, true);
    const p2 = ancla(2);
    expect(escalar(p1)).toBeCloseTo(0, 6);
    expect(escalar(p2)).toBeCloseTo(0, 6);
    expect(p2.x).toBeGreaterThan(p1.x);
  });

  it('arrastrar el costado a 90° lo desplaza en perpendicular a sí mismo', () => {
    const { down, move, up, ancla } = setupQ(DELANTERO);
    down({ x: 430, y: 240 });
    dosVeces();
    move({ x: 480, y: 230 }, true);
    up();
    // Un lado arrastrado siempre queda paralelo; lo que da el borde es que se
    // mueva en perpendicular a él, no en horizontal (la hoja).
    const a = ancla(1);
    expect((a.x - 200) * 60 + a.y * 180).toBeCloseTo(0, 6);
    expect(a.x).toBeGreaterThan(200);
    expect(cruzConCostado(a, ancla(2))).toBeCloseTo(0, 6);
  });

  it('cambiar a dos veces a mitad del arrastre, con la mano quieta, cambia de marco', () => {
    const { down, move, ancla } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    tecla('keydown');
    move({ x: 480, y: 380 }, true);
    expect(ancla(2).x).toBeCloseTo(260, 6); // la hoja: vertical
    tecla('keyup');
    tecla('keydown');
    const p = ancla(2);
    expect(cruzConCostado({ x: 200, y: 0 }, p)).toBeCloseTo(0, 6);
    expect(p.y).toBeGreaterThan(180);
  });

  it('expone las guías mientras dura el arrastre, desde la posición inicial del punto', () => {
    const { tool, down, move, up } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 480, y: 380 }, true);
    expect(tool().guias!.activa!.desde).toEqual({ x: 460, y: 330 });
    expect(tool().guias!.tenue).not.toBeNull();
    expect(tool().modoShift).toBe('borde');
    up();
    expect(tool().guias).toBeNull();
  });

  it('en una pieza con arcos, dos veces endereza a la hoja sin romper', () => {
    const conArco = {
      ...DELANTERO,
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'A', values: [120, 120, 0, 0, 1, 200, 0] },
        { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
      ],
    } as unknown as PatternPiece;
    const { tool, down, move, ancla } = setupQ(conArco);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 470, y: 400 }, true);
    // Sin lado que medir, el marco del borde es el eje: una sola guía, y la
    // vertical de la hoja.
    expect(tool().modoShift).toBe('borde');
    expect(tool().guias!.tenue).toBeNull();
    expect(ancla(2).x).toBeCloseTo(260, 6);
    expect(ancla(2).y).toBeGreaterThan(180);
  });
});
