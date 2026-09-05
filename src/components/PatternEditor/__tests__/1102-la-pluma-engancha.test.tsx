// @vitest-environment jsdom
/**
 * #1102 — la pluma no engancha ni resalta al empezar una línea desde un punto
 * existente.
 *
 * María, audio del 30-08 [11:23]:
 *
 *   «si yo ahora quiero crear una línea nueva que empiece desde aquí, no se
 *    está iluminando… para mí estas líneas ahora deberían tener como puntos.»
 *
 * La línea interna engancha desde el 29-08 (vértice → extremo de otra interna →
 * contorno, un solo radio `EDGE_HIT_PX`). La pluma no miraba las piezas: ni
 * siquiera las recibía. Su único enganche era sobre su PROPIO primer nodo, para
 * cerrar.
 *
 * ENMIENDA A UN CONTRATO ESCRITO. El spec de la línea interna
 * (`2026-08-29-linea-interna-y-medidas-design.md`) decidió lo contrario:
 * «La pluma **no** gana enganche ni curva por puntos: crea piezas desde la
 * nada». Era defendible entonces y María lo refutó con la herramienta en la
 * mano. La enmienda está escrita en ese spec, no rodeada aquí — pero el motivo
 * de que este archivo exista es ese, y conviene que se lea junto.
 *
 * El oráculo de este archivo es la PARIDAD: los mismos clics que
 * `usePolyPenTool.test.tsx` usa para su enganche, con la misma pieza y las
 * mismas coordenadas. Si las dos herramientas enganchan igual, el resolutor es
 * uno solo de verdad; si divergen, hay dos y uno miente.
 *
 * Zoom 1 y paneo 0: pantalla = patrón.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePenTool } from '../usePenTool';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { EDGE_HIT_PX } from '../gestureConstants';

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
];

function pieza(id: string, x: number, y: number, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline: RECT, internals: [], position: { x, y }, rotation: 0,
    mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    ...extra,
  } as PatternPiece;
}

/** Las mismas dos piezas que el test de la línea interna, a propósito. */
const A = pieza('A', 100, 100, {
  internals: [{ id: 'il1', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }] }],
});
const B = pieza('B', 100, 300, { rotation: 90 });

const ev = (x: number, y: number, button = 0) => ({
  button, clientX: x, clientY: y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

function setup(pieces: PatternPiece[] = [A, B]) {
  const onComplete = vi.fn();
  const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete, pieces));
  const tool = () => hook.result.current;
  const click = (x: number, y: number) => act(() => {
    tool().handleMouseDown(ev(x, y));
    tool().handleMouseUp();
  });
  const move = (x: number, y: number) => act(() => tool().handleMouseMove(ev(x, y)));
  return { tool, click, move, onComplete };
}

describe('la pluma engancha igual que la línea interna', () => {
  it('a 5 px de un vértice de A el PRIMER nodo cae exacto — la queja literal', () => {
    // «quiero crear una línea nueva que empiece desde aquí». El primero es el
    // que importa: es el que ella nombró.
    const { tool, click } = setup();
    click(104, 103);
    expect(tool().nodes[0].anchor).toEqual({ x: 100, y: 100 });
  });

  it('y lo anuncia antes de clicar: el hover trae el objetivo para el anillo', () => {
    // «no se está iluminando». Sin esto el enganche existe y es invisible, que
    // es la mitad de la queja.
    const { tool, move } = setup();
    move(104, 103);
    expect(tool().hover?.kind).toBe('vertex');
    expect(tool().hover?.point).toEqual({ x: 100, y: 100 });
  });

  it('sobre la pieza GIRADA el nodo coincide con el vértice de verdad', () => {
    // El vértice girado es donde se rompen los enganches escritos contra la
    // sombra sin girar (#1068).
    const { tool, click } = setup();
    const v = pieceLocalToPattern({ x: 0, y: 0 }, B);
    click(v.x + 4, v.y + 3);
    expect(tool().nodes[0].anchor.x).toBeCloseTo(v.x, 6);
    expect(tool().nodes[0].anchor.y).toBeCloseTo(v.y, 6);
  });

  it('a 6 px del borde de arriba de A el nodo cae SOBRE el borde', () => {
    const { tool, click } = setup();
    click(150, 106);
    expect(tool().nodes[0].anchor.x).toBeCloseTo(150, 6);
    expect(tool().nodes[0].anchor.y).toBeCloseTo(100, 6);
  });

  it('el extremo de una línea interna existente engancha exacto', () => {
    const { tool, click } = setup();
    click(183, 123);
    expect(tool().nodes[0].anchor).toEqual({ x: 180, y: 120 });
  });

  it('una pieza de capa oculta no es objetivo', () => {
    const { tool, click } = setup([A]);
    const v = pieceLocalToPattern({ x: 0, y: 0 }, B);
    click(v.x + 4, v.y + 3);
    expect(tool().nodes[0].anchor).toEqual({ x: v.x + 4, y: v.y + 3 });
  });

  it('lejos de todo el nodo cae donde ella clicó, sin inventarse un imán', () => {
    // La pluma sigue creando piezas desde la nada: enganchar donde no hay nada
    // que enganchar sería peor que no enganchar.
    const { tool, click } = setup();
    click(700, 700);
    expect(tool().nodes[0].anchor).toEqual({ x: 700, y: 700 });
  });

  it('sin piezas la pluma sigue funcionando igual que antes', () => {
    const { tool, click } = setup([]);
    click(300, 300);
    click(400, 300);
    expect(tool().nodes).toHaveLength(2);
    expect(tool().nodes[0].anchor).toEqual({ x: 300, y: 300 });
  });
});

describe('el cierre de la pluma, con la deuda del spec saldada', () => {
  it('sigue cerrando sobre su primer nodo, y el trazo sale cerrado', () => {
    const { click, onComplete } = setup([]);
    click(300, 300);
    click(400, 300);
    click(400, 400);
    click(303, 302);                       // dentro del radio del primero
    expect(onComplete).toHaveBeenCalledTimes(1);
    const cmds = onComplete.mock.calls[0][0].outline as PathCommand[];
    expect(cmds[cmds.length - 1].type).toBe('Z');
  });

  it('justo fuera del radio NO cierra: añade un nodo más', () => {
    // Este par —cierra a 3 px del primero, no cierra a EDGE_HIT_PX+3— es lo que
    // de verdad fija el radio. El spec de la línea interna ya había prometido
    // que el cierre pasaba a `EDGE_HIT_PX` y se quedó sin hacer: aquí seguía un
    // 12 literal. Escrito contra la constante, mover el radio mueve los dos.
    const { tool, click, onComplete } = setup([]);
    click(300, 300);
    click(400, 300);
    click(400, 400);
    click(300 + EDGE_HIT_PX + 3, 300);
    expect(onComplete).not.toHaveBeenCalled();
    expect(tool().nodes).toHaveLength(4);
  });

  it('el cierre gana al enganche: con una pieza debajo, el primer nodo manda', () => {
    // Si el enganche a una pieza se resolviera antes que el cierre, el trazo no
    // se podría cerrar encima de una pieza — que es donde más se dibuja.
    const { tool, click, onComplete } = setup([A]);
    click(140, 140);
    click(180, 140);
    click(180, 180);
    click(142, 141);
    expect(onComplete, 'no cerró estando encima de una pieza').toHaveBeenCalledTimes(1);
    expect(tool().nodes).toEqual([]);
  });
});
