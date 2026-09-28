// @vitest-environment jsdom
/**
 * #1205, los hermanos — arreglar `nearestSegment` para que respete los
 * subcaminos vuelve ALCANZABLE lo que ya estaba mal más abajo.
 *
 * Antes, el hit-test de un contorno con agujero nunca devolvía la `Z` del
 * segundo anillo: siempre la primera. Así que los dos consumidores que
 * traducen ese índice a su `M` podían clavar la traducción a `0` y nadie lo
 * notaba — el issue lo dice con estas palabras: «ese `0` no es el fallo, es
 * *consistente* con lo que `nearestSegment` produce hoy».
 *
 * Con el productor arreglado deja de serlo, y cada uno falla a su manera:
 *
 *   - `useEditPattern`: arrastrar el cierre del agujero mueve la esquina del
 *     anillo EXTERIOR, porque `startPositions` se sembró con el nodo 0.
 *   - `EditPatternOverlay`: elegir el cierre del agujero no pinta nada, y el
 *     realce del cierre exterior se dibuja sobre la cuerda fantasma.
 *
 * Es el patrón «quitar una guardia vuelve alcanzable lo latente»: el camino
 * recién abierto nunca había corrido.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import EditPatternOverlay from '../renderers/overlays/EditPatternOverlay';
import { extractNodes } from '../nodeEditorUtils';
import { setup, mouseAt } from './editPatternHarness';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

/** Marco de 200×100 con un agujero de 100×40. `M0 L1 L2 L3 Z4 M5 L6 L7 L8 Z9`. */
const CON_AGUJERO = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
  { type: 'M', values: [50, 30] },
  { type: 'L', values: [150, 30] },
  { type: 'L', values: [150, 70] },
  { type: 'L', values: [50, 70] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const Z_EXTERIOR = 4;
const Z_AGUJERO = 9;

const pieza = (): PatternPiece => ({
  id: 'p', name: 'Marco', outline: structuredClone(CON_AGUJERO),
  internals: [], position: { x: 0, y: 0 }, rotation: 0,
  mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
});

describe('#1205 — arrastrar el cierre de un subcamino mueve SU anillo', () => {
  it('el cierre del agujero no arrastra la esquina del anillo exterior', () => {
    const { store, ref } = setup(pieza());
    const outline = () => store.getState().project.pieces[0].outline;

    // Clic sobre el lado izquierdo del AGUJERO, de (50,70) a (50,30): el
    // tramo que dibuja la `Z` del segundo subcamino.
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 50, y: 50 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 60, y: 50 })); });
    act(() => { ref.current!.handleMouseUp(); });

    const despues = outline();
    // El anillo exterior no se toca. Con la traducción clavada a `0`, el nodo
    // sembrado era la `M` del marco y la esquina (0,0) se iba con el ratón.
    expect(despues[0].values, 'la esquina del marco no participa en este gesto').toEqual([0, 0]);
    expect(despues[1].values).toEqual([200, 0]);
    expect(despues[2].values).toEqual([200, 100]);
    expect(despues[3].values).toEqual([0, 100]);
    // Y el lado que sí se arrastró se movió: sus dos extremos, +10 en x.
    expect(despues[5].values, 'el arranque del agujero es el extremo que mueve su cierre').toEqual([60, 30]);
    expect(despues[8].values).toEqual([60, 70]);
  });
});

describe('#1205 — el realce del cierre se pinta por subcamino', () => {
  function pintar(seleccionados: Set<number>) {
    const p = pieza();
    return render(
      <svg>
        <EditPatternOverlay
          zoom2D={1}
          pieces={[p]}
          editingPieceId="p"
          hoveredPieceId={null}
          nodes={extractNodes(p)}
          selectedNodes={new Set()}
          selectedSegments={seleccionados}
          hoveredNode={null}
          hoveredSegment={null}
          addPointPreview={null}
          marquee={null}
        />
      </svg>,
    ).container;
  }
  const realce = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('path')).map(n => n.getAttribute('d')).filter((d): d is string => !!d);

  // Se afirma la lista ENTERA, no un `.some`. Con `.some` el test seguiría
  // verde si el componente pintara ADEMÁS la cuerda fantasma, que es
  // exactamente el fallo que vigila. (`AnchorGlyph` emite `polygon`, `rect` y
  // `circle`, nunca `path`, así que el selector solo recoge realces — pero
  // eso es un accidente del componente, y el conteo no depende de él.)
  it('elegir el cierre del AGUJERO pinta su lado, y solo el suyo', () => {
    expect(realce(pintar(new Set([Z_AGUJERO])))).toEqual(['M 50 70 L 50 30']);
  });

  it('elegir el cierre EXTERIOR pinta su lado, no la cuerda que cruza la pieza', () => {
    // El código viejo pintaba literalmente 'M 50 70 L 0 0'.
    expect(realce(pintar(new Set([Z_EXTERIOR])))).toEqual(['M 0 100 L 0 0']);
  });

  it('el HOVER sobre un cierre pinta lo mismo y se marca con su propio índice', () => {
    // El realce del cierre salía de una rama propia con
    // `data-tramo-hover={zIndex}`; ahora sale del bucle compartido con `={i}`.
    // El valor coincide, pero nada lo fijaba — y el hover es la superficie que
    // María ve ANTES de clicar.
    const p = pieza();
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1}
          pieces={[p]}
          editingPieceId="p"
          hoveredPieceId={null}
          nodes={extractNodes(p)}
          selectedNodes={new Set()}
          selectedSegments={new Set()}
          hoveredNode={null}
          hoveredSegment={Z_AGUJERO}
          addPointPreview={null}
          marquee={null}
        />
      </svg>,
    );
    const trazos = Array.from(container.querySelectorAll('path'));
    expect(trazos.map(n => n.getAttribute('d'))).toEqual(['M 50 70 L 50 30']);
    expect(trazos[0].getAttribute('data-tramo-hover')).toBe(String(Z_AGUJERO));
  });
});

/**
 * Un anillo cerrado más un segundo trazo en la misma pieza.
 *
 * Aquí se midió algo que cambia el veredicto sobre el cierre FANTASMA: el
 * validador (`OUTLINE_MISSING_Z`) le añade una `Z` a todo contorno que no la
 * traiga, y lo hace al cargar el proyecto. Así que por la puerta del estado
 * persistido un subcamino abierto NO llega al hook: el trazo de abajo entra
 * cerrado, con su `Z`, y su cierre es un lado de verdad.
 *
 * Consecuencia honesta: la guarda de `M` que añadí en los tres sitios que no
 * la tenían es defensa en profundidad, alineada con los otros tres que ya la
 * traían, no el arreglo de un fallo que la usuaria pueda ver hoy. Queda dicho
 * para que nadie la lea como lo segundo.
 *
 * Lo que este caso SÍ fija es la propiedad de #1205 sobre un segundo anillo
 * que no es un agujero: arrastrar su cierre mueve sus nodos y solo los suyos.
 */
const DOS_TRAZOS = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
  { type: 'M', values: [300, 0] },
  { type: 'L', values: [400, 0] },
  { type: 'L', values: [400, 100] },
] as PatternPiece['outline'];

describe('#1205 — el cierre del segundo trazo mueve solo su propio anillo', () => {
  it('el validador cierra el trazo, y arrastrar ese cierre no toca el cuadrado', () => {
    const { store, ref } = setup({
      id: 'p', name: 'Dos trazos', outline: structuredClone(DOS_TRAZOS),
      internals: [], position: { x: 0, y: 0 }, rotation: 0,
      mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
    });
    const cargado = store.getState().project.pieces[0].outline;
    expect(
      cargado.map(c => c.type).join(''),
      'el validador añade la Z que falta: por aquí no entra un subcamino abierto',
    ).toBe('MLLLZMLLZ');

    // (350,50) cae sobre el cierre del segundo trazo, de (400,100) a (300,0).
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 350, y: 50 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 360, y: 50 })); });
    act(() => { ref.current!.handleMouseUp(); });

    const despues = store.getState().project.pieces[0].outline;
    // El cuadrado, intacto. Antes del arreglo, la traducción clavada a `0`
    // sembraba su `M` y la esquina (0,0) se iba con el ratón.
    expect(despues[0].values, 'la esquina del cuadrado no participa').toEqual([0, 0]);
    expect(despues[3].values).toEqual([0, 100]);
    // Y el cierre arrastrado movió sus dos extremos.
    expect(despues[5].values).toEqual([310, 0]);
    expect(despues[7].values).toEqual([410, 100]);
  });
});

describe('#1205 — la otra puerta de entrada a la edición', () => {
  it('enterEditActuando arma el gesto sobre el cierre del agujero, no sobre el marco', () => {
    // `handleMouseDown` tiene DOS sitios que traducen el índice del cierre a
    // su nodo, y el arnés solo pasa por uno: `setup` llama `enterEdit`, así
    // que el press entra por el bloque de «ya estoy editando». El otro sitio
    // es este, el de entrar actuando, y también estaba clavado a `0`.
    const { store, ref } = setup(pieza());
    act(() => { ref.current!.exitEdit(); });
    act(() => { ref.current!.enterEditActuando('p', mouseAt({ x: 50, y: 50 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 60, y: 50 })); });
    act(() => { ref.current!.handleMouseUp(); });

    const despues = store.getState().project.pieces[0].outline;
    expect(despues[0].values, 'la esquina del marco no participa').toEqual([0, 0]);
    expect(despues[5].values, 'el cierre del agujero movió su propio arranque').toEqual([60, 30]);
    expect(despues[8].values).toEqual([60, 70]);
  });
});
