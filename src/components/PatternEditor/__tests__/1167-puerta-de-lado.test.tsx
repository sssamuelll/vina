// @vitest-environment jsdom
/**
 * La puerta de Tab al lado de la pieza (#1167, spec 2026-09-18 § 3.1).
 *
 * «el editable de largos me gustaría que apareciera solo cuando uno clica Tab»
 * — María, firma D2 del 13-09.
 *
 * Qué se fija aquí: cuándo la puerta abre, qué lado elige, y cuándo se suelta
 * sola. El criterio geométrico («el recto más cercano al puntero») está medido
 * aparte, en `cotas/__tests__/lado.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { usePuertaDeLado } from '../usePuertaDeLado';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(200, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);

const SOLO_CURVAS: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'C', values: [60, -40, 140, -40, 200, 0] },
  { type: 'C', values: [140, 60, 60, 60, 0, 0] },
  { type: 'Z', values: [] },
];

function montar(over: {
  pieces?: PatternPiece[]; selectedPieceIds?: string[]; cursor?: Point2D | null;
  hiddenLayerIds?: number[]; layerLocked?: Record<number, boolean>; caliente?: boolean;
} = {}) {
  const cursor = { current: over.cursor ?? null };
  const props = {
    pieces: over.pieces ?? [pieza('a')],
    selectedPieceIds: over.selectedPieceIds ?? ['a'],
    cursorPattern: cursor,
    hiddenLayerIds: over.hiddenLayerIds ?? [],
    layerLocked: over.layerLocked ?? {},
    caliente: over.caliente ?? false,
  };
  const hook = renderHook(
    (p: typeof props) => usePuertaDeLado(p),
    { initialProps: props },
  );
  return { hook, cursor };
}

describe('usePuertaDeLado — Tab abre el largo de un lado', () => {
  it('con una pieza seleccionada, Tab elige el lado más cercano al puntero', () => {
    const { hook } = montar({ cursor: { x: 100, y: 105 } }); // pegado al lado de abajo
    let abrio = false;
    act(() => { abrio = hook.result.current.enfocar(); });
    expect(abrio).toBe(true);
    expect(hook.result.current.lado).toEqual({ pieceId: 'a', commandIndex: 3 });
  });

  it('sin puntero, el primer lado del contorno — pero abre igual', () => {
    const { hook } = montar({ cursor: null });
    act(() => { hook.result.current.enfocar(); });
    expect(hook.result.current.lado).toEqual({ pieceId: 'a', commandIndex: 1 });
  });

  it('la secuencia sube en cada Tab, aunque el lado sea el mismo', () => {
    // Sin esto, pulsar Tab otra vez tras Escape no reabriría el chip: el efecto
    // que lo abre saldría temprano al ver el mismo lado. Tecla muerta — el
    // mismo fallo que ya cazó la revisión adversarial del 06-09 en la Pluma.
    const { hook } = montar({ cursor: { x: 100, y: 105 } });
    act(() => { hook.result.current.enfocar(); });
    const primera = hook.result.current.seq;
    act(() => { hook.result.current.enfocar(); });
    expect(hook.result.current.seq).toBeGreaterThan(primera);
  });

  it('sin pieza seleccionada la puerta no abre: Tab sigue su camino de siempre', () => {
    const { hook } = montar({ selectedPieceIds: [] });
    let abrio = true;
    act(() => { abrio = hook.result.current.enfocar(); });
    expect(abrio).toBe(false);
    expect(hook.result.current.lado).toBe(null);
  });

  it('con DOS piezas seleccionadas tampoco: no hay un sujeto que valga', () => {
    const { hook } = montar({ pieces: [pieza('a'), pieza('b')], selectedPieceIds: ['a', 'b'] });
    let abrio = true;
    act(() => { abrio = hook.result.current.enfocar(); });
    expect(abrio).toBe(false);
  });

  it('una pieza sin ningún lado recto no abre: su largo es de solo lectura', () => {
    const { hook } = montar({ pieces: [pieza('a', { outline: SOLO_CURVAS })] });
    let abrio = true;
    act(() => { abrio = hook.result.current.enfocar(); });
    expect(abrio).toBe(false);
    expect(hook.result.current.lado).toBe(null);
  });

  it('soltar devuelve el sujeto a la pieza, y dice que consumió el Escape', () => {
    const { hook } = montar({ cursor: { x: 100, y: 105 } });
    act(() => { hook.result.current.enfocar(); });
    let consumio = false;
    act(() => { consumio = hook.result.current.soltar(); });
    expect(consumio).toBe(true);
    expect(hook.result.current.lado).toBe(null);
  });

  it('soltar sin lado no consume el Escape: la escalera sigue bajando', () => {
    const { hook } = montar();
    let consumio = true;
    act(() => { consumio = hook.result.current.soltar(); });
    expect(consumio).toBe(false);
  });

  it('cambiar de pieza suelta el lado: el sujeto no sobrevive a su dueño', () => {
    const { hook } = montar({ pieces: [pieza('a'), pieza('b')], cursor: { x: 100, y: 105 } });
    act(() => { hook.result.current.enfocar(); });
    expect(hook.result.current.lado).not.toBe(null);
    hook.rerender({ pieces: [pieza('a'), pieza('b')], selectedPieceIds: ['b'], cursorPattern: { current: null }, hiddenLayerIds: [], layerLocked: {}, caliente: false });
    expect(hook.result.current.lado).toBe(null);
  });

  it('borrar la pieza suelta el lado', () => {
    const { hook } = montar({ cursor: { x: 100, y: 105 } });
    act(() => { hook.result.current.enfocar(); });
    hook.rerender({ pieces: [], selectedPieceIds: ['a'], cursorPattern: { current: null }, hiddenLayerIds: [], layerLocked: {}, caliente: false });
    expect(hook.result.current.lado).toBe(null);
  });

  it('el puntero llega en coordenadas de PATRÓN: la pieza desplazada elige bien', () => {
    // Si el hook olvidara convertir a local, (1100, 605) caería fuera del
    // contorno y elegiría el lado equivocado.
    const { hook } = montar({
      pieces: [pieza('a', { position: { x: 1000, y: 500 } })],
      cursor: { x: 1100, y: 605 },
    });
    act(() => { hook.result.current.enfocar(); });
    expect(hook.result.current.lado).toEqual({ pieceId: 'a', commandIndex: 3 });
  });

  /**
   * Tragarse Tab y no abrir nada es peor que no hacer nada: la tecla nativa
   * tampoco navega, porque el router ya hizo `preventDefault`. La puerta tiene
   * que refusar ANTES, con las mismas compuertas que usa la escalera del
   * sujeto — si no, las dos se contradicen en silencio.
   */
  describe('no se traga Tab cuando la caja no podría abrirse', () => {
    it('pieza bloqueada: el chip nacería apagado, así que la puerta no abre', () => {
      const { hook } = montar({ pieces: [pieza('a', { locked: true })] });
      let abrio = true;
      act(() => { abrio = hook.result.current.enfocar(); });
      expect(abrio).toBe(false);
      expect(hook.result.current.lado).toBe(null);
    });

    it('capa bloqueada: el mismo candado que el de pieza', () => {
      const { hook } = montar({ pieces: [pieza('a', { layer: 2 })], layerLocked: { 2: true } });
      let abrio = true;
      act(() => { abrio = hook.result.current.enfocar(); });
      expect(abrio).toBe(false);
    });

    it('capa oculta: una pieza que no se ve no tiene caja', () => {
      const { hook } = montar({ pieces: [pieza('a', { layer: 2 })], hiddenLayerIds: [2] });
      let abrio = true;
      act(() => { abrio = hook.result.current.enfocar(); });
      expect(abrio).toBe(false);
    });

    it('ocultar la capa con el lado ya abierto lo suelta', () => {
      const { hook } = montar({ pieces: [pieza('a', { layer: 2 })], cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.enfocar(); });
      expect(hook.result.current.lado).not.toBe(null);
      hook.rerender({
        pieces: [pieza('a', { layer: 2 })], selectedPieceIds: ['a'],
        cursorPattern: { current: null }, hiddenLayerIds: [2], layerLocked: {}, caliente: false,
      });
      expect(hook.result.current.lado).toBe(null);
    });

    it('la pieza RECIÉN creada conserva Ancho y Alto: es la medida que acaba de dibujar', () => {
      // La distinción la hizo ella: «al SALIR de crear y volver a clicar la
      // pieza». Mientras el rectángulo sigue caliente, Tab abre su Ancho — que
      // es la promesa de #223/#225 y el mando correcto para lo recién dibujado.
      const { hook } = montar({ caliente: true, cursor: { x: 100, y: 105 } });
      let abrio = true;
      act(() => { abrio = hook.result.current.enfocar(); });
      expect(abrio).toBe(false);
      expect(hook.result.current.lado).toBe(null);
    });
  });
});
