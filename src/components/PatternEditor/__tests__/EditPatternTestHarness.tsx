/**
 * EditPatternTestHarness.tsx — the render-tree component used by
 * editPatternHarness.ts's `setup()`. Split into its own file (nothing but
 * this component is exported here) so `editPatternHarness.ts` — which mixes
 * a component import with plain helper exports (`setup`, `mouseAt`) — does
 * not trip `react-refresh/only-export-components`.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { useSelector } from 'react-redux';
import type projectReducer from '../../../store/projectSlice';
import { useEditPattern } from '../useEditPattern';
import EditPatternOverlay from '../renderers/overlays/EditPatternOverlay';

export type EditorApi = ReturnType<typeof useEditPattern>;
type TestState = { project: ReturnType<typeof projectReducer> };

const EditPatternTestHarness = forwardRef<EditorApi>(function EditPatternTestHarness(_, ref) {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  const pieces = useSelector((state: TestState) => state.project.pieces);
  useImperativeHandle(ref, () => editor, [editor]);
  return (
    <svg>
      {editor.isEditing && editor.editingPieceId && (
        <EditPatternOverlay
          zoom2D={1} pieces={pieces} editingPieceId={editor.editingPieceId}
          hoveredPieceId={editor.hoveredPieceId}
          nodes={editor.nodes} selectedNodes={editor.selectedNodes}
          selectedSegments={editor.selectedSegments} hoveredNode={editor.hoveredNode}
          hoveredSegment={editor.hoveredSegment} addPointPreview={editor.addPointPreview}
          marquee={editor.marquee}
          internas={editor.internas} enganche={editor.enganche}
        />
      )}
    </svg>
  );
});

export default EditPatternTestHarness;
