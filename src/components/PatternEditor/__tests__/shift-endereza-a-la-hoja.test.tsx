// @vitest-environment jsdom
/**
 * Shift endereza la línea respecto a la HOJA (firma de María del 23-09, opción B).
 *
 * María, 10-09 [07:35]: «quiero hacer una línea perpendicular, entonces le
 * estaba dando al shift, pero no me hace nada el shift». Y [02:01], moviendo un
 * punto en Editar patrón: «si le doy a shift tampoco me deja controlar el
 * ángulo».
 *
 * La regla (contrato 2026-09-08 § 3.4): Shift restringe a múltiplos de 45° solo
 * mientras se mantiene, y está por ENCIMA del enganche — con Shift, un vértice
 * cercano no le roba el punto a la guía. Lo escrito con Tab sigue mandando
 * sobre Shift.
 *
 * Zoom 1 y paneo 0: pantalla = patrón. Mismas piezas que el test de #1102.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup, fireEvent, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import { useEditPattern } from '../useEditPattern';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePenTool } from '../usePenTool';
import { usePolyPenTool } from '../usePolyPenTool';
import { useGrainlineTool } from '../useGrainlineTool';
import { polarOf } from '../polyPenGeometry';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(cleanup);

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
];

/** 200×100 en (100,100): vértices del mundo en (100,100), (300,100), (300,200), (100,200). */
const A = {
  id: 'A', name: 'A', outline: RECT, internals: [], position: { x: 100, y: 100 }, rotation: 0,
  mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
} as unknown as PatternPiece;

/** `detail` es el número de clic: el segundo press de un doble clic trae 2. */
const ev = (x: number, y: number, shiftKey = false, detail = 1) => ({
  button: 0, clientX: x, clientY: y, shiftKey, detail,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

const shift = (type: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', shiftKey: type === 'keydown' })); });

describe('Pluma — Shift endereza respecto a la hoja', () => {
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete, [A]));
    const tool = () => hook.result.current;
    const click = (x: number, y: number, conShift = false) => act(() => {
      tool().handleMouseDown(ev(x, y, conShift));
      tool().handleMouseUp();
    });
    const move = (x: number, y: number, conShift = false) => act(() => tool().handleMouseMove(ev(x, y, conShift)));
    return { tool, click, move };
  }

  it('con Shift, la goma queda horizontal y la píldora lee 0° al eje', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(250, 153, true);
    const lectura = tool().lastPointDistance!;
    expect(lectura.position).toEqual({ x: 250, y: 150 });
    expect(lectura.angleDeg).toBe(0);
    expect(tool().guidePath).toBe('M150,150 L250,150');
  });

  it('sin Shift, la misma goma sigue al ratón', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(250, 153);
    expect(tool().lastPointDistance!.position).toEqual({ x: 250, y: 153 });
  });

  it('el clic con Shift coloca el nodo sobre la guía', () => {
    const { tool, click } = setup();
    click(150, 150);
    click(153, 60, true);
    expect(tool().nodes[1].anchor).toEqual({ x: 150, y: 60 });
  });

  it('Shift gana al enganche: el vértice cercano no se lleva el punto', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    // Sin Shift, (298,103) engancha el vértice (300,100).
    move(298, 103);
    expect(tool().hover?.point).toEqual({ x: 300, y: 100 });
    // Con Shift el rumbo es ~17° → horizontal, y el anillo de enganche se apaga.
    move(298, 103, true);
    expect(tool().hover).toBeNull();
    expect(tool().lastPointDistance!.position).toEqual({ x: 298, y: 150 });
    click(298, 103, true);
    expect(tool().nodes[1].anchor).toEqual({ x: 298, y: 150 });
  });

  it('pulsar y soltar Shift con el ratón quieto endereza y suelta la goma', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(250, 153);
    shift('keydown');
    expect(tool().lastPointDistance!.position).toEqual({ x: 250, y: 150 });
    shift('keyup');
    expect(tool().lastPointDistance!.position).toEqual({ x: 250, y: 153 });
  });

  it('Tab con Shift congela la dirección enderezada', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(153, 60, true);
    act(() => tool().openNextPoint());
    expect(tool().nextPoint!.angleDeg).toBe(90);
    expect(tool().nextPoint!.lengthMm).toBeCloseTo(90, 9);
  });

  it('el primer clic no tiene de dónde enderezar: engancha como siempre', () => {
    const { tool, click } = setup();
    click(298, 103, true);
    expect(tool().nodes[0].anchor).toEqual({ x: 300, y: 100 });
  });

  it('cerca del primer nodo cerrar gana a Shift: la goma va al primer nodo, que es donde acaba el clic', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    click(400, 150);
    click(400, 300);
    // Desde (400,300) el rumbo a (155,158) es ~150°: con Shift la guía iría a
    // 135°, a ~57 mm del primer nodo. Pero el clic ahí CIERRA la pieza, y el
    // tramo de cierre acaba en el primer nodo.
    move(155, 158, true);
    expect(tool().willClose).toBe(true);
    expect(tool().guidePath).toBe('M400,300 L150,150');
  });

  it('Tab con el cierre armado congela el tramo hacia el primer nodo, como la goma', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    click(400, 150);
    click(400, 300);
    move(155, 158, true);
    act(() => tool().openNextPoint());
    const haciaElPrimero = polarOf({ x: 400, y: 300 }, { x: 150, y: 150 });
    expect(tool().nextPoint!.angleDeg).toBeCloseTo(haciaElPrimero.angleDeg, 9);
    expect(tool().nextPoint!.lengthMm).toBeCloseTo(haciaElPrimero.lengthMm, 9);
  });

  it('con Shift, la guía que llega al primer nodo cierra la pieza en vez de duplicarlo', () => {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const tool = () => hook.result.current;
    const clic = (x: number, y: number, s = false) => act(() => {
      tool().handleMouseDown(ev(x, y, s));
      tool().handleMouseUp();
    });
    clic(100, 100);
    clic(300, 103, true);
    clic(302, 300, true);
    clic(100, 303, true);
    // El ratón queda a 15 px del primer nodo, fuera del radio de cierre, pero
    // la guía vertical cae justo encima de él.
    act(() => tool().handleMouseMove(ev(115, 100, true)));
    expect(tool().willClose).toBe(true);
    expect(tool().guidePath).toBe('M100,300 L100,100');
    clic(115, 100, true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [resultado] = onComplete.mock.calls[0];
    expect(resultado.kind).toBe('pieza');
    expect(resultado.piece.outline.filter((c: PathCommand) => c.type !== 'Z')).toHaveLength(4);
  });

  it('Shift+doble clic termina el trazo de dos nodos: el segundo press no es un nodo más', () => {
    // El primer press cae en la guía; el segundo, en el mismo sitio del
    // ratón, se enderezaba desde el nodo recién puesto y nacía 30 mm más allá:
    // el doble clic ya no lo reconocía como duplicado y cerraba un triángulo.
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const tool = () => hook.result.current;
    act(() => { tool().handleMouseDown(ev(150, 150)); tool().handleMouseUp(); });
    act(() => { tool().handleMouseDown(ev(250, 180, true, 1)); tool().handleMouseUp(); });
    act(() => { tool().handleMouseDown(ev(250, 180, true, 2)); tool().handleMouseUp(); });
    act(() => tool().handleDoubleClick());
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toEqual({
      kind: 'trazo',
      path: [{ type: 'M', values: [150, 150] }, { type: 'L', values: [250, 150] }],
    });
  });

  it('arrastrar manejadores con Shift: la goma y la píldora enseñan el manejador real', () => {
    const { tool, click } = setup();
    click(150, 150);
    act(() => tool().handleMouseDown(ev(250, 150, true)));
    act(() => tool().handleMouseMove(ev(290, 162, true)));
    expect(tool().isDragging).toBe(true);
    expect(tool().lastPointDistance!.position).toEqual({ x: 290, y: 162 });
    expect(tool().guidePath).toBe('M250,150 C290,162 290,162 290,162');
  });

  it('un Shift que el ratón trajo en el press, soltado con la mano quieta, devuelve el enganche', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(296, 153);
    expect(tool().lastPointDistance!.position).toEqual({ x: 300, y: 153 });
    // Shift llega solo con el press (se pulsó con la ventana sin foco): nadie
    // vio el keydown. Soltarlo tiene que devolver el enganche igual.
    act(() => { tool().handleMouseDown(ev(296, 153, true)); tool().handleMouseUp(); });
    shift('keyup');
    expect(tool().lastPointDistance!.position).toEqual({ x: 300, y: 153 });
  });

  it('Shift escrito en un campo no toca la Pluma: ni re-render ni goma', () => {
    let renders = 0;
    const hook = renderHook(() => { renders += 1; return usePenTool(1, { x: 0, y: 0 }, vi.fn(), [A]); });
    act(() => { hook.result.current.handleMouseDown(ev(150, 150)); hook.result.current.handleMouseUp(); });
    act(() => hook.result.current.handleMouseMove(ev(250, 153)));
    const antes = renders;
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    act(() => { campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true })); });
    expect(renders).toBe(antes);
    expect(hook.result.current.lastPointDistance!.position).toEqual({ x: 250, y: 153 });
    campo.remove();
  });

  it('soltar una de las dos Shift con la otra pulsada no suelta la guía', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(250, 153, true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: true })); });
    expect(tool().lastPointDistance!.position).toEqual({ x: 250, y: 150 });
    shift('keyup');
    expect(tool().lastPointDistance!.position).toEqual({ x: 250, y: 153 });
  });

  it('Shift sin trazo en curso no toca el estado: escribir mayúsculas en el chat no re-renderiza el editor', () => {
    let renders = 0;
    renderHook(() => { renders += 1; return usePenTool(1, { x: 0, y: 0 }, vi.fn(), [A]); });
    const antes = renders;
    shift('keydown');
    shift('keyup');
    expect(renders).toBe(antes);
  });

  it('la bitácora dice que el clic fue con Shift', () => {
    clearJournal();
    const { click } = setup();
    click(150, 150);
    click(250, 153, true);
    const presses = getJournal().events.filter(e => e.name === 'pen:press').map(e => e.data);
    expect(presses[1]).toMatchObject({ nodes: 2, snap: null, shift: true });
    expect(presses[0]).not.toHaveProperty('shift');
  });
});

describe('Línea interna — Shift endereza respecto a la hoja', () => {
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePolyPenTool(1, { x: 0, y: 0 }, { nodeType: 'straight', pieces: [A], onComplete }));
    const tool = () => hook.result.current;
    const click = (x: number, y: number, conShift = false) => act(() => {
      tool().handleMouseDown(ev(x, y, conShift));
      tool().handleMouseUp(ev(x, y, conShift));
    });
    const move = (x: number, y: number, conShift = false) => act(() => tool().handleMouseMove(ev(x, y, conShift)));
    return { tool, click, move, onComplete };
  }

  it('con Shift, la goma queda vertical', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(152, 190, true);
    expect(tool().previewPoint).toEqual({ x: 150, y: 190 });
  });

  it('el clic con Shift coloca el nodo sobre la guía, sin enganchar el borde cercano', () => {
    const { tool, click } = setup();
    click(150, 150);
    // (296,153) está a 4 mm del borde derecho (x=300): sin Shift enganchaba.
    click(296, 153, true);
    expect(tool().nodes[1].point).toEqual({ x: 296, y: 150 });
  });

  it('pulsar Shift con el ratón quieto endereza la goma y apaga el anillo', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(296, 153);
    expect(tool().hover).not.toBeNull();
    shift('keydown');
    expect(tool().hover).toBeNull();
    expect(tool().previewPoint).toEqual({ x: 296, y: 150 });
    shift('keyup');
    expect(tool().previewPoint).toEqual({ x: 296, y: 153 });
  });

  it('tras cerrar con el puntero, el segundo par del doble clic cae en la zona muerta — con o sin Shift', () => {
    // Regresión de esta misma rama: la zona muerta leía el punto enderezado
    // antes de declararlo, y el press siguiente a un cierre reventaba.
    const { tool, click, onComplete } = setup();
    click(150, 150);
    click(250, 150);
    click(250, 180);
    click(150, 150);
    expect(onComplete).toHaveBeenCalledTimes(1);
    click(150, 150, true);
    expect(tool().nodes).toEqual([]);
  });

  it('Shift+doble clic termina la línea: el segundo press no deja un nodo de más', () => {
    const { tool, onComplete } = setup();
    const press = (x: number, y: number, s = false, detail = 1) => act(() => {
      tool().handleMouseDown(ev(x, y, s, detail));
      tool().handleMouseUp(ev(x, y, s, detail));
    });
    press(150, 150);
    press(250, 180, true, 1);
    press(250, 180, true, 2);
    act(() => tool().handleDoubleClick());
    expect(onComplete).toHaveBeenCalledWith('A', [
      { type: 'M', values: [150, 150] }, { type: 'L', values: [250, 150] },
    ], false);
  });

  it('con Shift, la guía que llega al primer nodo cierra la línea', () => {
    const { tool, click, move, onComplete } = setup();
    click(120, 120);
    click(280, 123, true);
    click(283, 180, true);
    click(120, 183, true);
    // A 15 px del primer nodo con el ratón; la guía vertical cae encima.
    move(135, 120, true);
    expect(tool().closeArmed).toBe(true);
    click(135, 120, true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [, cmds, cerrada] = onComplete.mock.calls[0];
    expect(cerrada).toBe(true);
    expect(cmds.filter((c: PathCommand) => c.type !== 'Z')).toHaveLength(4);
  });

  it('Tab con el cierre armado congela el tramo hacia el primer nodo, como la goma', () => {
    const { tool, click, move } = setup();
    click(120, 120);
    click(280, 120);
    click(280, 180);
    move(126, 126, true);
    expect(tool().closeArmed).toBe(true);
    act(() => tool().openNextPoint());
    const haciaElPrimero = polarOf({ x: 280, y: 180 }, { x: 120, y: 120 });
    expect(tool().nextPoint!.angleDeg).toBeCloseTo(haciaElPrimero.angleDeg, 9);
    expect(tool().nextPoint!.lengthMm).toBeCloseTo(haciaElPrimero.lengthMm, 9);
  });

  it('Shift que solo conoce el ratón (se pulsó sin foco) se suelta con la mano quieta', () => {
    // Sin `keydown`: el ratón trae `shiftKey` y el teclado no se enteró. El
    // `keyup` tiene que soltar la goma igual; si teclado y ratón llevaran cada
    // uno su Shift, quedaría enderezada hasta el siguiente movimiento.
    const { tool, click, move } = setup();
    click(150, 150);
    move(250, 153, true);
    expect(tool().previewPoint).toEqual({ x: 250, y: 150 });
    shift('keyup');
    expect(tool().previewPoint).toEqual({ x: 250, y: 153 });
  });

  it('Shift sin trazo en curso no re-renderiza', () => {
    let renders = 0;
    renderHook(() => { renders += 1; return usePolyPenTool(1, { x: 0, y: 0 }, { nodeType: 'straight', pieces: [A], onComplete: vi.fn() }); });
    const antes = renders;
    shift('keydown');
    shift('keyup');
    expect(renders).toBe(antes);
  });

  it('Tab con Shift congela la dirección enderezada', () => {
    const { tool, click, move } = setup();
    click(150, 150);
    move(190, 112, true);
    act(() => tool().openNextPoint());
    expect(tool().nextPoint!.angleDeg).toBeCloseTo(45, 9);
  });
});

// ─── Editar patrón (Q): mover un punto ───────────────────────────────────────
//
// «Cuánto lo quieres mover en esa dirección» (#1112): en Q la dirección es la
// del desplazamiento desde donde estaba el punto, y Shift la endereza respecto
// a la hoja. Con la pieza girada también: la hoja no gira con la pieza.

function cuadrado(rotation: number): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 10, y: 20 }, rotation,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
    ],
    internals: [], mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

function Editor() {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  return (
    <svg data-testid="q" onMouseDown={editor.handleMouseDown} onMouseMove={editor.handleMouseMove} onMouseUp={editor.handleMouseUp}>
      <rect data-testid="entrar" onClick={() => editor.enterEdit('p')} />
      <text data-testid="sel">{[...editor.selectedNodes].sort().join(',')}</text>
    </svg>
  );
}

function montarQ(pieza: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [pieza] }));
  const vista = render(<Provider store={store}><Editor /></Provider>);
  fireEvent.click(vista.getByTestId('entrar'));
  const svg = vista.getByTestId('q');
  const pieza0 = () => store.getState().project.pieces[0];
  /** Dónde se ve el nodo 1 en la hoja (patrón), con la rotación aplicada. */
  const nodo1 = () => {
    const [x, y] = pieza0().outline[1].values;
    return pieceLocalToPattern({ x, y }, pieza0());
  };
  const seleccion = () => vista.getByTestId('sel').textContent;
  return { svg, nodo1, seleccion, store };
}

describe('Editar patrón — Shift endereza el desplazamiento respecto a la hoja', () => {
  it('arrastrar con Shift mueve el punto en horizontal exacto', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24, shiftKey: true });
    expect(nodo1().x).toBeCloseTo(250, 9);
    expect(nodo1().y).toBeCloseTo(20, 9);
    fireEvent.mouseUp(svg, { button: 0 });
  });

  it('y en vertical exacto', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 213, clientY: 80, shiftKey: true });
    expect(nodo1().x).toBeCloseTo(210, 9);
    expect(nodo1().y).toBeCloseTo(80, 9);
  });

  it('sin Shift el punto sigue al ratón', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24 });
    expect(nodo1().x).toBeCloseTo(250, 9);
    expect(nodo1().y).toBeCloseTo(24, 9);
  });

  it('con la pieza girada 90°, Shift endereza respecto a la hoja, no a la pieza', () => {
    const { svg, nodo1 } = montarQ(cuadrado(90));
    const antes = nodo1();
    fireEvent.mouseDown(svg, { button: 0, clientX: antes.x, clientY: antes.y });
    fireEvent.mouseMove(svg, { clientX: antes.x + 40, clientY: antes.y + 3, shiftKey: true });
    // El pivote de giro se recalcula con la caja (useEditPattern.rotation):
    // lo que se promete es la DIRECCIÓN del desplazamiento en la hoja.
    const despues = nodo1();
    expect(Math.abs(despues.y - antes.y)).toBeLessThan(1e-6);
    expect(despues.x - antes.x).toBeGreaterThan(30);
  });

  it('con el punto ya seleccionado, pulsar Shift ANTES de agarrarlo lo arrastra enderezado — no lo suelta', () => {
    // El gesto que la pista invita a hacer: Shift primero, arrastrar después.
    // Deseleccionar en el press (el toggle de Shift+clic) dejaba el arrastre
    // sin sujeto: el punto no se movía.
    const { svg, nodo1, seleccion } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 20 });
    expect(seleccion()).toBe('1');
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20, shiftKey: true });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, clientX: 250, clientY: 24, shiftKey: true });
    expect(nodo1().x).toBeCloseTo(250, 9);
    expect(nodo1().y).toBeCloseTo(20, 9);
    expect(seleccion()).toBe('1');
  });

  it('Shift+clic SIN arrastrar sobre un punto seleccionado lo sigue quitando de la selección', () => {
    const { svg, seleccion } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 20, shiftKey: true });
    expect(seleccion()).toBe('');
  });

  it('Shift+clic sobre otro punto lo sigue añadiendo', () => {
    const { svg, seleccion } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 220, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 220, shiftKey: true });
    expect(seleccion()).toBe('1,2');
  });

  it('un arrastre con Shift que pasa justo por encima de otra esquina no se la lleva', () => {
    // Shift fija un eje: a zoom 1 y con geometría entera, pasar EXACTAMENTE
    // por encima de otra esquina deja de ser raro. Reagrupar las anclas
    // coincidentes en cada frame la capturaba y colapsaba el lado.
    const { svg, store } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 10, clientY: 20 });
    for (const x of [110, 210, 260]) fireEvent.mouseMove(svg, { clientX: x, clientY: 23, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0 });
    const outline = store.getState().project.pieces[0].outline;
    expect(outline[0].values).toEqual([250, 0]);
    expect(outline[1].values).toEqual([200, 0]);
  });

  it('Shift+clic con temblor de la mano sobre un punto seleccionado lo sigue quitando, sin moverlo', () => {
    const { svg, nodo1, seleccion } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20, shiftKey: true });
    fireEvent.mouseMove(svg, { clientX: 211, clientY: 20, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, clientX: 211, clientY: 20, shiftKey: true });
    expect(seleccion()).toBe('');
    expect(nodo1()).toEqual({ x: 210, y: 20 });
  });

  it('Shift+arrastrar con otro punto ya seleccionado mueve los dos: Shift+press sigue sumando a la selección', () => {
    // Decidido a propósito, como en Illustrator: lo seleccionado se mueve
    // junto. Es además la única forma de arrastrar varios puntos en Q.
    const { svg, store } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 220 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 210, clientY: 220 });
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20, shiftKey: true });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, clientX: 250, clientY: 24, shiftKey: true });
    const outline = store.getState().project.pieces[0].outline;
    expect(outline[1].values).toEqual([240, 0]);
    expect(outline[2].values).toEqual([240, 200]);
  });

  it('perder el foco a mitad de un arrastre con Shift no lo reaplica sin la guía', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 27, shiftKey: true });
    expect(nodo1()).toEqual({ x: 250, y: 20 });
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(nodo1()).toEqual({ x: 250, y: 20 });
  });

  it('mover la mano en perpendicular a la guía no reescribe el contorno', () => {
    const { svg, store } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24, shiftKey: true });
    let escrituras = 0;
    const soltar = store.subscribe(() => { escrituras += 1; });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 26, shiftKey: true });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 28, shiftKey: true });
    soltar();
    expect(escrituras).toBe(0);
  });

  it('Shift que solo conoce el ratón se suelta a mitad del arrastre con la mano quieta', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24, shiftKey: true });
    expect(nodo1().y).toBeCloseTo(20, 9);
    shift('keyup');
    expect(nodo1().y).toBeCloseTo(24, 9);
  });

  it('pulsar Shift a mitad del arrastre, con el ratón quieto, endereza; soltarlo lo devuelve', () => {
    const { svg, nodo1 } = montarQ(cuadrado(0));
    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 24 });
    shift('keydown');
    expect(nodo1().y).toBeCloseTo(20, 9);
    shift('keyup');
    expect(nodo1().y).toBeCloseTo(24, 9);
  });
});

describe('Hilo — el mismo Shift que las demás herramientas', () => {
  it('endereza con la misma regla: vertical exacta, a la distancia proyectada', () => {
    // El Hilo tenía su propio Shift (redondear el ángulo y conservar la
    // distancia) detrás de la misma pista: dos reglas para la misma tecla, y
    // una vertical que salía a x+1e-14.
    const onSet = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(1, { x: 0, y: 0 }, [A], onSet));
    act(() => result.current.handleMouseDown(ev(150, 120)));
    act(() => result.current.handleMouseMove(ev(153, 190, true)));
    act(() => result.current.handleMouseUp(ev(153, 190, true)));
    const [, hilo] = onSet.mock.calls[0];
    const [x0, y0] = hilo.path[0].values;
    const [x1, y1] = hilo.path[1].values;
    expect(x1).toBe(x0);
    expect(y1 - y0).toBeCloseTo(70, 9);
  });
});
