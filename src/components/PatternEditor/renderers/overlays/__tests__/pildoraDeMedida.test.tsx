// @vitest-environment jsdom
/**
 * La píldora de medida tiene que caberle a su texto.
 *
 * Samuel, 2026-09-10, con la herramienta V: "el chip en el caso de la
 * herramienta V hace ilegible la informacion". La píldora tenía 80 px de ancho
 * escritos a mano y la lectura era "x: 489.1 mm, y: 411.0 mm" — se salía por
 * los dos lados y la mitad del número caía sobre la cuadrícula clara.
 *
 * El oráculo no puede ser "el ancho es 80" ni "el ancho es tal número": eso
 * congela el bug con otro valor. Lo que se mide es la RELACIÓN — el ancho de la
 * píldora contra el ancho que el texto necesita— y se mide sobre las dos
 * píldoras que existen, no solo sobre la que él vio (jsdom no calcula layout,
 * así que el ancho del texto se estima con el mismo avance monoespaciado que
 * usa el helper).
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../../types/types';
import { extractNodes } from '../../../nodeEditorUtils';
import NodeEditorOverlay from '../NodeEditorOverlay';
import PolyPenToolOverlay from '../PolyPenToolOverlay';
import { READOUT_FONT_PX, pildoraDeMedida } from '../pildoraDeMedida';

afterEach(cleanup);

/** Lo que el texto ocupa de verdad, con el avance de una monoespaciada de 0,6 em. */
const anchoDelTexto = (texto: string, fontSize: number) => texto.length * fontSize * 0.6;

describe('pildoraDeMedida', () => {
  it('le cabe el texto, con aire, a cualquier largo', () => {
    for (const texto of [
      '0 mm',
      'x: 489.1 mm, y: 411.0 mm',
      'x: -1489.15 mm, y: -1411.05 mm',
      '1200.0 mm · -135.0°',
    ]) {
      const { width } = pildoraDeMedida(texto, 11);
      expect(width, `no le cabe "${texto}"`).toBeGreaterThan(anchoDelTexto(texto, 11));
    }
  });

  it('crece con el texto, no con un número fijo', () => {
    const corta = pildoraDeMedida('0 mm', 11).width;
    const larga = pildoraDeMedida('x: -1489.15 mm, y: -1411.05 mm', 11).width;
    expect(larga).toBeGreaterThan(corta * 2);
  });

  it('queda centrada en el origen de su grupo', () => {
    const p = pildoraDeMedida('x: 489.1 mm, y: 411.0 mm', 11);
    expect(p.x).toBeCloseTo(-p.width / 2, 6);
    expect(p.y).toBeCloseTo(-p.height / 2, 6);
    expect(p.rx, 'los extremos son semicírculos: es una píldora').toBeCloseTo(p.height / 2, 6);
  });

  it('escala con el zoom sin deformarse', () => {
    const aUno = pildoraDeMedida('x: 489.1 mm', 11);
    const aLaMitad = pildoraDeMedida('x: 489.1 mm', 11 / 2);
    expect(aLaMitad.width).toBeCloseTo(aUno.width / 2, 6);
    expect(aLaMitad.height).toBeCloseTo(aUno.height / 2, 6);
  });
});

const piezaConNodo = (): PatternPiece => ({
  id: 'p', name: 'p',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [489.1, 0] },
    { type: 'L', values: [489.1, 411] },
    { type: 'Z', values: [] },
  ],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
} as unknown as PatternPiece);

/** El `<rect>` y el `<text>` de la píldora, leídos del DOM ya renderizado. */
function pildoraRenderizada(container: HTMLElement) {
  const textos = [...container.querySelectorAll('text')];
  const texto = textos.find(t => /mm/.test(t.textContent ?? ''));
  expect(texto, 'no se pintó ninguna lectura').toBeTruthy();
  const rect = texto!.parentElement!.querySelector('rect');
  expect(rect, 'la lectura no tiene píldora detrás').toBeTruthy();
  return {
    contenido: texto!.textContent ?? '',
    fontSize: Number(texto!.getAttribute('font-size')),
    ancho: Number(rect!.getAttribute('width')),
    fuente: texto!.getAttribute('style') ?? '',
  };
}

describe('las dos píldoras del lienzo caben y se leen', () => {
  it('Editar curva: la lectura de coordenadas del nodo elegido', () => {
    const piece = piezaConNodo();
    const nodes = extractNodes(piece);
    const { container } = render(
      <svg>
        <NodeEditorOverlay
          zoom2D={1} units="mm" pieces={[piece]}
          nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
          selectedNode={nodes[2].ref} hoveredNode={null}
        />
      </svg>,
    );

    const p = pildoraRenderizada(container);
    expect(p.contenido, 'este caso solo vale con la lectura larga que él fotografió').toContain('489.1');
    expect(p.ancho, 'la píldora no le cabe al texto').toBeGreaterThan(anchoDelTexto(p.contenido, p.fontSize));
    expect(p.fontSize, 'el piso ratificado de 11 px').toBeGreaterThanOrEqual(READOUT_FONT_PX);
    expect(p.fuente, 'el ancho se estima por caracteres: la fuente TIENE que ser monoespaciada')
      .toContain('--font-mono-2d');
  });

  it('Línea interna: la lectura del tramo en curso', () => {
    // La píldora la calcula el propio overlay: necesita un nodo puesto, un
    // punto de previsualización, y los tres latches en falso. El tramo va
    // largo a propósito — es el caso que rompía los 96 px escritos a mano.
    const { container } = render(
      <svg>
        <PolyPenToolOverlay
          nodes={[{ point: { x: 0, y: 0 }, type: 'straight' }]}
          previewPoint={{ x: 1234.5, y: -1234.5 }}
          pressPoint={null} isDragging={false} dragHandle={null}
          hover={null} nodeType="straight" closeArmed={false}
          zoom2D={1} units="mm"
        />
      </svg>,
    );

    const p = pildoraRenderizada(container);
    expect(p.ancho, 'la píldora hermana no le cabe al texto').toBeGreaterThan(anchoDelTexto(p.contenido, p.fontSize));
    expect(p.fontSize).toBeGreaterThanOrEqual(READOUT_FONT_PX);
    expect(p.fuente).toContain('--font-mono-2d');
  });
});
