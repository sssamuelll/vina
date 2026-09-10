// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider, useSelector } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import type { PatternPiece } from '../../../types/types';
import { rotatePoint } from '../../../utils/geometry/transform';
import EditPatternOverlay from '../renderers/overlays/EditPatternOverlay';
import { useEditPattern } from '../useEditPattern';

afterEach(cleanup);

function squarePiece(rotation: number): PatternPiece {
  return {
    id: 'p',
    name: 'P',
    position: { x: 10, y: 20 },
    rotation,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    mirrored: false,
    seamAllowance: 0,
    active: true,
  } as unknown as PatternPiece;
}

function InteractiveEditor() {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  const pieces = useSelector(
    (state: { project: { pieces: PatternPiece[] } }) => state.project.pieces,
  );

  return (
    <>
      <button type="button" onClick={() => editor.enterEdit('p')}>Edit</button>
      <svg
        data-testid="editor"
        onMouseDown={editor.handleMouseDown}
        onMouseMove={editor.handleMouseMove}
        onMouseUp={editor.handleMouseUp}
      >
        {editor.editingPieceId && (
          <EditPatternOverlay
            zoom2D={1}
            pieces={pieces}
            editingPieceId={editor.editingPieceId}
            hoveredPieceId={editor.hoveredPieceId}
            nodes={editor.nodes}
            selectedNodes={editor.selectedNodes}
            selectedSegments={editor.selectedSegments}
            hoveredNode={editor.hoveredNode}
            hoveredSegment={editor.hoveredSegment}
            addPointPreview={editor.addPointPreview}
            marquee={editor.marquee}
          />
        )}
      </svg>
    </>
  );
}

function renderInteractive(piece: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece] }));
  render(
    <Provider store={store}>
      <InteractiveEditor />
    </Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  return screen.getByTestId('editor');
}

function renderedAnchorPosition(commandIndex: number): { x: number; y: number } {
  const glyph = document.querySelector<SVGGElement>(
    `[data-command-index="${commandIndex}"] [data-anchor-role]`,
  );
  expect(glyph).not.toBeNull();
  const glyphMatch = (glyph!.getAttribute('transform') ?? '').match(
    /^translate\(([-\d.]+) ([-\d.]+)\)$/,
  );
  expect(glyphMatch).not.toBeNull();

  const anchorGroup = glyph!.parentElement?.parentElement;
  const groupMatch = (anchorGroup?.getAttribute('transform') ?? '').match(
    /^translate\(([-\d.]+), ([-\d.]+)\)(?: rotate\(([-\d.]+), ([-\d.]+), ([-\d.]+)\))?$/,
  );
  expect(groupMatch).not.toBeNull();

  const [, tx, ty, angle, cx, cy] = groupMatch!;
  const local = { x: Number(glyphMatch![1]), y: Number(glyphMatch![2]) };
  const visible = angle
    ? rotatePoint(
        local,
        { x: Number(cx), y: Number(cy) },
        Number(angle) * Math.PI / 180,
      )
    : local;
  return { x: visible.x + Number(tx), y: visible.y + Number(ty) };
}

describe('useEditPattern dynamic rotation pivot', () => {
  it('keeps a rotated anchor glyph under the cursor when the drag changes the bbox', () => {
    const svg = renderInteractive(squarePiece(90));

    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 220 });
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 220 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 220, clientY: 220 });

    const rendered = renderedAnchorPosition(1);
    expect(rendered.x).toBeCloseTo(220);
    expect(rendered.y).toBeCloseTo(220);
  });

  it('preserves the unrotated anchor position as a control', () => {
    const svg = renderInteractive(squarePiece(0));

    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 20 });
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 20 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 220, clientY: 20 });

    const rendered = renderedAnchorPosition(1);
    expect(rendered.x).toBeCloseTo(220);
    expect(rendered.y).toBeCloseTo(20);
  });
});
