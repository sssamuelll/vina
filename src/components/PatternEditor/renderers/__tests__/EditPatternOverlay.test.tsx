// @vitest-environment jsdom
/**
 * EditPatternOverlay — geometric corners and smooth samples use the shared
 * semantic anchor grammar.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EditPatternOverlay from '../overlays/EditPatternOverlay';
import { extractNodes, extractNodesFromPath } from '../../nodeEditorUtils';
import type { PatternPiece } from '../../../../types/types';
import type { EdicionDeInterna } from '../../estadoDeQ';

afterEach(cleanup);

const outline = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [120, 20, 120, 80, 100, 100] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const piece = {
  id: 'p', name: 'P', outline, position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, active: true, seamAllowance: 0, internals: [], edges: [],
} as unknown as PatternPiece;

function renderOverlay() {
  return render(
    <svg>
      <EditPatternOverlay
        zoom2D={1}
        pieces={[piece]}
        editingPieceId="p"
        hoveredPieceId={null}
        nodes={extractNodes(piece)}
        selectedNodes={new Set()}
        selectedSegments={new Set()}
        hoveredNode={null}
        hoveredSegment={null}
        addPointPreview={null}
        marquee={null}
      />
    </svg>,
  );
}

describe('EditPatternOverlay rotation (nota de María #170)', () => {
  it('rotates the anchor group with the piece so dots track the rotated outline', () => {
    const rotated = { ...piece, rotation: 90 } as unknown as PatternPiece;
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1}
          pieces={[rotated]}
          editingPieceId="p"
          hoveredPieceId={null}
          nodes={extractNodes(rotated)}
          selectedNodes={new Set()}
          selectedSegments={new Set()}
          hoveredNode={null}
          hoveredSegment={null}
          addPointPreview={null}
          marquee={null}
        />
      </svg>,
    );
    const g = Array.from(container.querySelectorAll('g')).find(el =>
      /rotate\(\s*90/.test(el.getAttribute('transform') ?? ''),
    );
    expect(g).toBeTruthy();
  });

  it('emits no rotate transform for an un-rotated piece', () => {
    const { container } = renderOverlay();
    const anyRotate = Array.from(container.querySelectorAll('g')).some(el =>
      /rotate\(/.test(el.getAttribute('transform') ?? ''),
    );
    expect(anyRotate).toBe(false);
  });
});

describe('EditPatternOverlay anchor marks', () => {
  it('renders geometric corners differently from smooth polyline samples', () => {
    const densePiece = {
      ...piece,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [50, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1} pieces={[densePiece]} editingPieceId="p" hoveredPieceId={null}
          nodes={extractNodes(densePiece)} selectedNodes={new Set()}
          selectedSegments={new Set()} hoveredNode={null}
          hoveredSegment={null} addPointPreview={null} marquee={null}
        />
      </svg>,
    );
    expect(container.querySelectorAll('[data-anchor-role="corner"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-anchor-role="smoothSample"]')).toHaveLength(1);
    expect(container.querySelector('[data-anchor-role="corner"] rect')).toBeTruthy();
    expect(container.querySelector('[data-anchor-role="smoothSample"] circle')).toBeTruthy();
  });
});

describe('EditPatternOverlay con internas (spec 2026-09-24 § 3.3)', () => {
  const rect = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] },
      { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [],
  } as unknown as PatternPiece;
  const path = [
    { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    { type: 'C', values: [120, 130, 110, 140, 100, 140] },
  ] as PatternPiece['outline'];
  const interna = (extra: Partial<EdicionDeInterna> = {}): EdicionDeInterna => ({
    lineId: 'L', path, nodes: extractNodesFromPath(path, 'p'),
    selectedNodes: new Set(), selectedSegments: new Set(), hoveredNode: null, hoveredSegment: null, addPointPreview: null,
    ...extra,
  });
  const pintar = (props: { editando: boolean; internas: EdicionDeInterna[]; enganche?: { x: number; y: number } | null }) => render(
    <svg>
      <EditPatternOverlay
        zoom2D={1} pieces={[rect]} editingPieceId={props.editando ? 'p' : null} hoveredPieceId={props.editando ? null : 'p'}
        nodes={[]} selectedNodes={new Set()} selectedSegments={new Set()} hoveredNode={null}
        hoveredSegment={null} addPointPreview={null} marquee={null}
        internas={props.internas} enganche={props.enganche ?? null}
      />
    </svg>,
  );

  it('editando, pinta todos los puntos de la interna', () => {
    const { container } = pintar({ editando: true, internas: [interna()] });
    expect(container.querySelectorAll('[data-interna="L"] [data-anchor-role]')).toHaveLength(4);
  });

  it('antes de entrar, solo sus extremos: como el contorno (#1103)', () => {
    const { container } = pintar({ editando: false, internas: [interna()] });
    const roles = [...container.querySelectorAll('[data-interna="L"] [data-anchor-role]')].map(n => n.getAttribute('data-anchor-role'));
    expect(roles).not.toContain('bezierAnchor');
    expect(roles).toContain('openEndpoint');
  });

  it('resalta el tramo de interna bajo el ratón', () => {
    const { container } = pintar({ editando: true, internas: [interna({ hoveredSegment: 1 })] });
    expect(container.querySelector('[data-interna="L"] [data-tramo-hover="1"]')).toBeTruthy();
  });

  it('pinta el anillo del enganche con el token de enganche', () => {
    const { container } = pintar({ editando: true, internas: [interna()], enganche: { x: 0, y: 0 } });
    const anillo = container.querySelector('circle.snap-ring');
    expect(anillo?.getAttribute('stroke')).toBe('var(--snap-2d)');
  });

  it('sin pieza en edición ni bajo el ratón, no pinta ninguna interna', () => {
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1} pieces={[rect]} editingPieceId={null} hoveredPieceId={null}
          nodes={[]} selectedNodes={new Set()} selectedSegments={new Set()} hoveredNode={null}
          hoveredSegment={null} addPointPreview={null} marquee={null}
          internas={[interna()]} enganche={null}
        />
      </svg>,
    );
    expect(container.querySelectorAll('[data-interna]')).toHaveLength(0);
  });
});
