// @vitest-environment jsdom
/**
 * #1061 — soltar a más de 12 px del borde no daba el tramo marcado: daba el
 * BORDE ENTERO. En coser, la costura del lado completo; en piquete, el rango
 * completo y el modal abierto como si nunca se hubiera arrastrado.
 *
 * El fallo no se ve como fallo: produce un resultado válido y plausible, solo
 * que distinto del pedido. Se aprende como maña ("mejor suelto pegadito").
 *
 * La causa es que el press y el release hacían la MISMA pregunta. El press
 * pregunta *qué agarro*, y ahí el radio de `EDGE_HIT_PX` es correcto. El
 * release solo pregunta *hasta dónde*, sobre un borde que el gesto ya fijó y
 * no re-apunta nunca (spec § 4.1). Un radio ahí no puede elegir mejor objeto:
 * solo puede negar el valor.
 *
 * La pieza de estos tests NO es un rectángulo sintético a propósito: tiene el
 * borde de arriba partido en dos comandos y un costado curvo. Un rectángulo
 * dibujado a mano trae un comando por borde, y esta familia de fallos se
 * esconde justo ahí.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md
 * § 3.4 (soltar fuera — cinco filas, y ninguna dice "cae a clic").
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import { snapToEdge } from '../useSegmentSewingTool';
import { useFreeSewingTool } from '../useFreeSewingTool';
import { useNotchTool } from '../useNotchTool';
import type { InternalLine, PatternPiece, SemanticEdge } from '../../../types/types';

/**
 * Borde de arriba en DOS comandos (largo 100), costado derecho CURVO, y el
 * resto rectas. Es la forma en la que llega un patrón de verdad.
 */
const PIEZA: PatternPiece = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [30, 0] },              // 1 ─┐ el mismo borde de arriba,
    { type: 'L', values: [100, 0] },             // 2 ─┘ partido en dos comandos
    { type: 'C', values: [130, 60, 120, 140, 100, 200] }, // 3: costado curvo
    { type: 'L', values: [0, 200] },             // 4: abajo
    { type: 'Z', values: [] },                   // 5: izquierda
  ],
  edges: [
    { id: 'e-arriba', name: 'arriba', segmentRange: [1, 3] },
    { id: 'e-derecha', name: 'derecha', segmentRange: [3, 4] },
    { id: 'e-abajo', name: 'abajo', segmentRange: [4, 5] },
  ] as SemanticEdge[],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

/** Segunda pieza, para que coser pueda cerrar la costura. */
const PIEZA_B: PatternPiece = { ...PIEZA, id: 'p2', position: { x: 300, y: 0 } };

/** Con zoom 1, pan (0,0) y el lienzo en el origen, pantalla y patrón coinciden. */
const ev = (x: number, y: number) =>
  ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600,
        right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
      }),
    },
    preventDefault: vi.fn(),
  }) as unknown as React.MouseEvent<SVGSVGElement>;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(Provider, {
    store: configureStore({ reducer: { tools: toolReducer } }),
    children,
  });

// ─── La unidad: el radio deja de ser obligatorio ───────────────────────

describe('snapToEdge — proyectar sin radio, para el release', () => {
  it('sin radio proyecta un punto lejísimos sobre el borde fijado', () => {
    // (75, 300) está a 300 de un borde que vive en y=0. Con radio, nada.
    const snap = snapToEdge({ x: 75, y: 300 }, PIEZA, 1, [1, 3], true);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(75, 0);
    expect(snap!.point.y).toBeCloseTo(0, 0);
    expect(snap!.edgeIndex).toBe(2); // el segundo comando del mismo borde
  });

  it('sin radio sigue clampeando al borde: no se pasa a la esquina de al lado', () => {
    // Más allá del extremo del borde (x=100). El spec § 3.4 pide clamp, no
    // salto: aunque el costado derecho esté más cerca, el objeto ya está fijado.
    const snap = snapToEdge({ x: 400, y: 150 }, PIEZA, 1, [1, 3], true);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(100, 0);
    expect(snap!.point.y).toBeCloseTo(0, 0);
  });

  it('el radio SIGUE mandando por defecto — el press no cambia', () => {
    expect(snapToEdge({ x: 75, y: 300 }, PIEZA, 1, [1, 3])).toBeNull();
    expect(snapToEdge({ x: 170, y: 195 }, PIEZA, 1)).toBeNull();
  });
});

// ─── Coser ─────────────────────────────────────────────────────────────

describe('coser — soltar lejos marca el tramo, no el borde entero', () => {
  const setup = () => {
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useFreeSewingTool(1, { x: 0, y: 0 }, [PIEZA, PIEZA_B], onComplete),
      { wrapper },
    );
    return { result, onComplete };
  };

  it('arrastrar del 25% al 75% y soltar a 200 px del borde deja el tramo', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(25, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(75, 200)); });
    act(() => { h.result.current.handleMouseUp(ev(75, 200)); });

    // Hasta ahora esto daba startT 0 / endT 1: el lado completo.
    expect(h.result.current.segmentA).not.toBeNull();
    expect(h.result.current.segmentA!.startT).toBeCloseTo(0.25, 2);
    expect(h.result.current.segmentA!.endT).toBeCloseTo(0.75, 2);
  });

  it('funciona cruzando comandos del mismo borde', () => {
    const h = setup();
    // El press cae en el comando 2, el release proyecta sobre el comando 1.
    act(() => { h.result.current.handleMouseDown(ev(60, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(10, 300)); });
    act(() => { h.result.current.handleMouseUp(ev(10, 300)); });

    expect(h.result.current.segmentA!.startT).toBeCloseTo(0.10, 2);
    expect(h.result.current.segmentA!.endT).toBeCloseTo(0.60, 2);
  });

  it('soltar más allá del extremo clampea a 1, sin saltar al borde vecino', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(50, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(400, 150)); });
    act(() => { h.result.current.handleMouseUp(ev(400, 150)); });

    expect(h.result.current.segmentA!.edgeRange).toEqual([1, 3]);
    expect(h.result.current.segmentA!.startT).toBeCloseTo(0.5, 2);
    expect(h.result.current.segmentA!.endT).toBeCloseTo(1, 2);
  });

  it('un clic pelado SIGUE siendo el borde entero', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(50, 0)); });
    act(() => { h.result.current.handleMouseUp(ev(50, 0)); });

    expect(h.result.current.segmentA!.startT).toBe(0);
    expect(h.result.current.segmentA!.endT).toBe(1);
  });
});

// ─── Piquete ───────────────────────────────────────────────────────────

describe('piquete — soltar lejos marca la distancia, no cae a clic', () => {
  const setup = () => {
    // Como Redux: lo que se añade está en el render siguiente. La cota del
    // piquete se mide sobre la línea viva (P3b).
    let piezas = [PIEZA];
    const onAddNotch = vi.fn();
    onAddNotch.mockImplementation((_pieceId: string, line: InternalLine) => {
      piezas = [{ ...PIEZA, internals: [...piezas[0].internals, line] }];
    });
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, piezas, onAddNotch),
      { wrapper },
    );
    return { result, onAddNotch };
  };

  it('soltar a 250 px del borde deja el piquete donde se soltó', () => {
    // Press en (50,0) y release en (80,250). El press no tiene nada nombrable
    // a tiro —el vértice de los dos comandos está en x=30, a 20 mm— así que la
    // referencia cae al extremo del borde, (0,0), y el valor lo manda el
    // release: 80 mm.
    //
    // El número importa. Cayendo a clic el ancla TAMBIÉN sale con una
    // distancia plausible (50 mm, la del press), así que un test que solo
    // pidiera "hay ancla" pasaría con el fallo dentro.
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(50, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(80, 250)); });
    act(() => { h.result.current.handleMouseUp(ev(80, 250)); });

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    const linea = h.onAddNotch.mock.calls[0][1];
    expect(linea.notchAnchor).toBeDefined();
    expect(linea.notchAnchor.refPoint.x).toBeCloseTo(0, 1);
    expect(linea.notchAnchor.distanceMm).toBeCloseTo(80, 0);
    expect(linea.path[0].values[0]).toBeCloseTo(80, 0);
  });

  it('el piquete cae donde se suelta aunque la referencia sea otra', () => {
    // Press justo sobre el vértice que parte el borde de arriba (x=30): ahí sí
    // hay una esquina nombrable a tiro, y el ancla se mide desde ella. La
    // distancia sale 30 —de (30,0) a (60,0)— y no 60. Lo que se comprueba aquí
    // es lo que ve la usuaria: el piquete entra donde soltó, no donde apretó.
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(30, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(60, 250)); });
    act(() => { h.result.current.handleMouseUp(ev(60, 250)); });

    const linea = h.onAddNotch.mock.calls[0][1];
    expect(linea.notchAnchor.refPoint.x).toBeCloseTo(30, 1);
    expect(linea.path[0].values[0]).toBeCloseTo(60, 0);
  });

  it('soltar pasada la esquina clampea al borde del press', () => {
    // Spec § 3.4: el borde no se cruza. Release muy más allá del extremo y
    // encima del costado curvo — el piquete se queda en la esquina (100,0).
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(50, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(400, 150)); });
    act(() => { h.result.current.handleMouseUp(ev(400, 150)); });

    const linea = h.onAddNotch.mock.calls[0][1];
    expect(linea.path[0].values[0]).toBeCloseTo(100, 0);
    expect(linea.path[0].values[1]).toBeCloseTo(0, 0);
  });

  it('y no abre el modal: ella ya dijo la cantidad con la mano', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(30, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(60, 250)); });
    act(() => { h.result.current.handleMouseUp(ev(60, 250)); });

    // Hasta ahora el gesto caía a clic y el modal se abría igual, borrando
    // del todo la distancia que ella acababa de arrastrar.
    expect(h.result.current.refining).toBeNull();
  });

  /**
   * Consecuencia de quitar el radio, y hay que decirla entera.
   *
   * `firstDragT` guarda la primera proyección válida tras cruzar el umbral,
   * porque el sentido lo fija el arranque de la mano y no el final (el cursor
   * puede haberse devuelto antes de soltar). Con radio, un arranque
   * PERPENDICULAR —bajar alejándose del borde— no proyectaba nada y el sentido
   * acababa saliendo del release. Sin radio proyecta siempre, y esa primera
   * proyección cae encima del press: no dice ningún sentido, pero el signo la
   * leía igual y salía 'cw' por el `>= 0`.
   *
   * Medido: press en 62 junto a la referencia de 60, bajar, ir a 40 y soltar
   * ponía el piquete en 80 — el espejo exacto de donde se soltó.
   */
  it('arrancar perpendicular no inventa un sentido: manda hacia dónde se fue', () => {
    const conPiquete: PatternPiece = {
      ...PIEZA,
      internals: [{
        id: 'n60', type: 'notch',
        path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
      }],
    };
    const onAddNotch = vi.fn();
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, [conPiquete], onAddNotch),
      { wrapper },
    );

    act(() => { result.current.handleMouseDown(ev(62, 0)); });
    act(() => { result.current.handleMouseMove(ev(62, 60)); });  // perpendicular
    act(() => { result.current.handleMouseMove(ev(40, 60)); });  // y a la izquierda
    act(() => { result.current.handleMouseUp(ev(40, 60)); });

    const linea = onAddNotch.mock.calls[0][1];
    expect(linea.notchAnchor.refPoint.x).toBeCloseTo(60, 1);
    expect(linea.notchAnchor.direction).toBe('ccw');
    expect(linea.path[0].values[0]).toBeCloseTo(40, 0);
  });

  it('y el sentido lo sigue fijando el arranque cuando de verdad hubo uno', () => {
    // Contrato existente: arrancar a la derecha y devolverse antes de soltar
    // conserva el sentido del arranque. Eso no puede cambiar.
    const conPiquete: PatternPiece = {
      ...PIEZA,
      internals: [{
        id: 'n60', type: 'notch',
        path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
      }],
    };
    const onAddNotch = vi.fn();
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, [conPiquete], onAddNotch),
      { wrapper },
    );

    act(() => { result.current.handleMouseDown(ev(62, 0)); });
    act(() => { result.current.handleMouseMove(ev(85, 0)); });  // arranca a la derecha
    act(() => { result.current.handleMouseUp(ev(80, 0)); });

    expect(onAddNotch.mock.calls[0][1].notchAnchor.direction).toBe('cw');
  });

  it('un clic pelado SIGUE poniendo el piquete y abriendo su cota', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(30, 0)); });
    act(() => { h.result.current.handleMouseUp(ev(30, 0)); });

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    expect(h.result.current.refining).not.toBeNull();
  });
});
