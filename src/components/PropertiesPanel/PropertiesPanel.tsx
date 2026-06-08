/**
 * PropertiesPanel — piece / seam / material editor, hosted in the ContextPanel
 * (AppShell renderPanelContent('Properties')). Re-homed 2026-06-07 after two
 * orphan levels (CopilotSidePanel → CopilotPanel, both deleted with the
 * VS-Code shell in `1c6e4238`); this is the only seam editor in the codebase.
 *
 * Selection model: editorSlice makes piece and seam selection mutually
 * exclusive (selectSeam clears selectedPieceIds), so the panel renders for
 * EITHER — gating everything on a selected piece (the old shell's behavior)
 * made the seam editor unreachable in practice.
 */
import { X } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { removeSeam } from '../../store/projectSlice';
import { selectSeam } from '../../store/editorSlice';
import PropertySection from './PropertySection';
import PieceProperties from './PieceProperties';
import SeamPropertiesPanel from './SeamPropertiesPanel';
import MaterialTab from './MaterialTab';
import EdgePropertiesSection from './EdgePropertiesSection';
import VertexPropertiesSection from './VertexPropertiesSection';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const selectedSeam = editor.selectedSeamId
    ? seams.find(s => s.id === editor.selectedSeamId)
    : undefined;
  // Per-edge SA selection (seamAllowance tool) — properties for the focused
  // edge/vertex live here, bound to the typed selection.
  const selectedEdge = editor.selectedEdge && pieces.some(p => p.id === editor.selectedEdge!.pieceId)
    ? editor.selectedEdge : null;
  const selectedVertex = editor.selectedVertex && pieces.some(p => p.id === editor.selectedVertex!.pieceId)
    ? editor.selectedVertex : null;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    piece: false,
    material: false,
    seams: false,
  });

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const seamsList = seams.length > 0 && (
    <PropertySection id="seams" title={`SEAMS (${seams.length})`} collapsed={!!collapsedSections.seams} onToggle={toggleSection}>
      {seams.map(seam => {
        const pA = pieces.find(p => p.id === seam.pieceA.pieceId);
        const pB = pieces.find(p => p.id === seam.pieceB.pieceId);
        const isSelected = editor.selectedSeamId === seam.id;
        return (
          <div
            key={seam.id}
            className={`seam-item ${isSelected ? 'selected' : ''}`}
            onClick={() => dispatch(selectSeam(seam.id))}
          >
            <span className="seam-label">
              {pA?.name || '?'} ↔ {pB?.name || '?'}
            </span>
            <span className="seam-type">{seam.type}</span>
            <button
              className="seam-delete"
              aria-label="Delete seam"
              onClick={(e) => { e.stopPropagation(); dispatch(removeSeam(seam.id)); }}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </PropertySection>
  );

  return (
    <div className="properties-panel">
      {!selectedPiece && !selectedSeam && !selectedEdge && !selectedVertex ? (
        <>
          <div className="panel-empty">Select a piece, seam or edge to edit</div>
          {seamsList}
        </>
      ) : (
        <>
          {selectedEdge && (
            // key per edge: remount so the width field reflects the newly
            // selected edge's value (its local input state re-initializes).
            <EdgePropertiesSection key={selectedEdge.edgeId} pieceId={selectedEdge.pieceId} edgeId={selectedEdge.edgeId} />
          )}
          {selectedVertex && (
            <VertexPropertiesSection pieceId={selectedVertex.pieceId} vertexIndex={selectedVertex.vertexIndex} />
          )}
          {selectedPiece && (
            <PieceProperties piece={selectedPiece} collapsed={!!collapsedSections.piece} onToggle={toggleSection} />
          )}

          {selectedSeam && (
            <SeamPropertiesPanel
              seam={selectedSeam}
              pieceAName={pieces.find(p => p.id === selectedSeam.pieceA.pieceId)?.name || '?'}
              pieceBName={pieces.find(p => p.id === selectedSeam.pieceB.pieceId)?.name || '?'}
              collapsed={!!collapsedSections['seam-props']}
              onToggle={toggleSection}
            />
          )}

          {selectedPiece && (
            <PropertySection id="material" title="MATERIAL" collapsed={!!collapsedSections.material} onToggle={toggleSection}>
              <MaterialTab />
            </PropertySection>
          )}

          {seamsList}
        </>
      )}
    </div>
  );
}
