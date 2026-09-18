// @vitest-environment jsdom
/**
 * La puerta de Tab al lado de la pieza (#1167, spec 2026-09-18 § 3.1).
 *
 * «el editable de largos me gustaría que apareciera solo cuando uno clica Tab»
 * — María, firma D2 del 13-09.
 *
 * Qué se fija aquí: que la puerta NO decida por su cuenta, que elija el lado
 * que dice la spec, y que suelte el lado cuando deja de existir. Quién puede
 * abrir y quién se queda el Escape lo decide `admiteLado` y se mide en
 * `cotas/__tests__/sujeto.lado.test.ts`; el criterio geométrico, en
 * `cotas/__tests__/lado.test.ts`.
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

interface Props {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  cursorPattern: { current: Point2D | null };
  puedeAbrir: { current: boolean };
  esElSujeto: { current: boolean };
}

function montar(over: {
  pieces?: PatternPiece[]; selectedPieceIds?: string[]; cursor?: Point2D | null;
  puedeAbrir?: boolean; esElSujeto?: boolean;
} = {}) {
  const puedeAbrir = { current: over.puedeAbrir ?? true };
  const esElSujeto = { current: over.esElSujeto ?? true };
  const props: Props = {
    pieces: over.pieces ?? [pieza('a')],
    selectedPieceIds: over.selectedPieceIds ?? ['a'],
    cursorPattern: { current: over.cursor ?? null },
    puedeAbrir,
    esElSujeto,
  };
  const hook = renderHook((p: Props) => usePuertaDeLado(p), { initialProps: props });
  /** Re-renderiza con la misma forma, cambiando solo lo que se pase. */
  const otra = (cambios: Partial<Props>) => hook.rerender({ ...props, ...cambios });
  return { hook, puedeAbrir, esElSujeto, otra };
}

describe('usePuertaDeLado — Tab abre el largo de un lado', () => {
  it('elige el lado más cercano a la última posición del ratón sobre el lienzo', () => {
    const { hook } = montar({ cursor: { x: 100, y: 105 } }); // pegado al lado de abajo
    let abrio = false;
    act(() => { abrio = hook.result.current.teclas.enfocar(); });
    expect(abrio).toBe(true);
    expect(hook.result.current.lado).toMatchObject({ pieceId: 'a', commandIndex: 3 });
  });

  it('sin ratón, el primer lado del contorno — pero abre igual', () => {
    const { hook } = montar({ cursor: null });
    act(() => { hook.result.current.teclas.enfocar(); });
    expect(hook.result.current.lado).toMatchObject({ pieceId: 'a', commandIndex: 1 });
  });

  it('el ratón llega en coordenadas de PATRÓN: la pieza desplazada elige bien', () => {
    // Si el hook olvidara convertir a local, (1100, 605) caería fuera del
    // contorno y elegiría el lado equivocado.
    const { hook } = montar({
      pieces: [pieza('a', { position: { x: 1000, y: 500 } })],
      cursor: { x: 1100, y: 605 },
    });
    act(() => { hook.result.current.teclas.enfocar(); });
    expect(hook.result.current.lado).toMatchObject({ pieceId: 'a', commandIndex: 3 });
  });

  it('la secuencia sube en cada Tab, aunque el lado sea el mismo', () => {
    // Sin esto, pulsar Tab otra vez tras Escape no reabriría el chip: el efecto
    // que lo abre saldría temprano al ver el mismo lado. Tecla muerta — el
    // mismo fallo que ya cazó la revisión adversarial del 06-09 en la Pluma.
    const { hook } = montar({ cursor: { x: 100, y: 105 } });
    act(() => { hook.result.current.teclas.enfocar(); });
    const primera = hook.result.current.seq;
    act(() => { hook.result.current.teclas.enfocar(); });
    expect(hook.result.current.seq).toBeGreaterThan(primera);
  });

  it('los verbos del router sobreviven al re-render: el gancho se re-suscribe en cada uno', () => {
    // La lección está escrita en `useEditorInteractions`: un verbo que vive en
    // el cierre queda viejo entre el commit y el flush, y bajo carga contesta
    // con los datos de un render anterior.
    const { hook, otra } = montar({ cursor: { x: 100, y: 105 } });
    const antes = hook.result.current.teclas;
    otra({ pieces: [pieza('a'), pieza('b')] });
    expect(hook.result.current.teclas).toBe(antes);
  });

  it('y aun así ven los datos frescos, no los del render en que nacieron', () => {
    const { hook, otra } = montar({ cursor: null });
    const teclas = hook.result.current.teclas;
    otra({ pieces: [pieza('b')], selectedPieceIds: ['b'] });
    act(() => { teclas.enfocar(); });
    expect(hook.result.current.lado?.pieceId).toBe('b');
  });

  describe('no decide por su cuenta: pregunta por el sujeto que hay en pantalla', () => {
    it('si el sujeto no admite un lado, no abre y NO se traga la tecla', () => {
      // Tragarse Tab y no abrir nada es peor que no hacer nada: el
      // `preventDefault` del router deja además muerto el Tab nativo. Quién
      // admite un lado lo decide `admiteLado`, no una lista aquí — tenerla dos
      // veces fue el fallo de fondo de la primera versión, y las dos copias ya
      // se contradecían en el commit que las escribió.
      const { hook } = montar({ puedeAbrir: false, cursor: { x: 100, y: 105 } });
      let abrio = true;
      act(() => { abrio = hook.result.current.teclas.enfocar(); });
      expect(abrio).toBe(false);
      expect(hook.result.current.lado).toBe(null);
    });

    it('sin pieza seleccionada tampoco', () => {
      const { hook } = montar({ selectedPieceIds: [] });
      let abrio = true;
      act(() => { abrio = hook.result.current.teclas.enfocar(); });
      expect(abrio).toBe(false);
    });

    it('con DOS piezas seleccionadas tampoco: no hay un sujeto que valga', () => {
      const { hook } = montar({ pieces: [pieza('a'), pieza('b')], selectedPieceIds: ['a', 'b'] });
      let abrio = true;
      act(() => { abrio = hook.result.current.teclas.enfocar(); });
      expect(abrio).toBe(false);
    });

    it('una pieza sin ningún lado recto no abre: su largo es de solo lectura', () => {
      const { hook } = montar({ pieces: [pieza('a', { outline: SOLO_CURVAS })] });
      let abrio = true;
      act(() => { abrio = hook.result.current.teclas.enfocar(); });
      expect(abrio).toBe(false);
      expect(hook.result.current.lado).toBe(null);
    });
  });

  describe('el Escape solo se consume si el lado está A LA VISTA', () => {
    it('con el lado visible, soltar lo suelta y dice que consumió', () => {
      const { hook } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      let consumio = false;
      act(() => { consumio = hook.result.current.teclas.soltar(); });
      expect(consumio).toBe(true);
      expect(hook.result.current.lado).toBe(null);
    });

    it('sin lado no consume: la escalera sigue bajando', () => {
      const { hook } = montar();
      let consumio = true;
      act(() => { consumio = hook.result.current.teclas.soltar(); });
      expect(consumio).toBe(false);
    });

    it('con el lado enganchado pero TAPADO —menú contextual abierto— no consume', () => {
      // Este gancho corre en CAPTURA y con `stopPropagation`: un «sí» de más
      // mata la tecla para todo lo que venga después, y el Escape del menú
      // contextual está en burbuja. Es la regresión que `useEditorInteractions`
      // documenta haber pagado una vez (#1115), y la primera versión de esta
      // puerta la reintrodujo: Z → Tab → clic derecho → Escape, y el menú no
      // se cerraba.
      const { hook, esElSujeto } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      esElSujeto.current = false;
      let consumio = true;
      act(() => { consumio = hook.result.current.teclas.soltar(); });
      expect(consumio).toBe(false);
    });
  });

  describe('el lado no sobrevive a su dueño ni a sí mismo', () => {
    it('cambiar de pieza lo suelta', () => {
      const { hook, otra } = montar({ pieces: [pieza('a'), pieza('b')], cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      expect(hook.result.current.lado).not.toBe(null);
      otra({ selectedPieceIds: ['b'] });
      expect(hook.result.current.lado).toBe(null);
    });

    it('borrar la pieza lo suelta', () => {
      const { hook, otra } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      otra({ pieces: [] });
      expect(hook.result.current.lado).toBe(null);
    });

    it('insertar un punto lo suelta: los índices se corren y el número denota otro lado', () => {
      // La misma ley que `resyncStateToPiece` aplica en `useEditPattern`: «a
      // surviving index would silently denote different geometry».
      const { hook, otra } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      otra({ pieces: [pieza('a', { outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 100] }, { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
      ] })] });
      expect(hook.result.current.lado).toBe(null);
    });

    it('convertir ESE lado en curva lo suelta, aunque el contorno mida lo mismo', () => {
      // `toManualBezier` cambia la `L` por una `C` SIN cambiar el número de
      // comandos: un guardián que solo mirara la longitud del contorno no lo ve.
      const { hook, otra } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      expect(hook.result.current.lado).toMatchObject({ pieceId: 'a', commandIndex: 3 });
      otra({ pieces: [pieza('a', { outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 100] }, { type: 'C', values: [150, 130, 50, 130, 0, 100] },
        { type: 'Z', values: [] },
      ] })] });
      expect(hook.result.current.lado).toBe(null);
    });

    it('MOVER un nodo no lo suelta: escribir el largo re-renderiza y se soltaría solo', () => {
      const { hook, otra } = montar({ cursor: { x: 100, y: 105 } });
      act(() => { hook.result.current.teclas.enfocar(); });
      otra({ pieces: [pieza('a', { outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 100] }, { type: 'L', values: [-50, 100] },
        { type: 'Z', values: [] },
      ] })] });
      expect(hook.result.current.lado).not.toBe(null);
    });
  });
});
