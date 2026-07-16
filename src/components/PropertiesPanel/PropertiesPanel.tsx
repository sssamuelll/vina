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
import { removeSeam, removePiece } from '../../store/projectSlice';
import { selectSeam, clearSelection } from '../../store/editorSlice';
import PropertySection from './PropertySection';
import PieceProperties from './PieceProperties';
import SeamPropertiesPanel from './SeamPropertiesPanel';
import MaterialTab from './MaterialTab';
import EdgePropertiesSection from './EdgePropertiesSection';
import VertexPropertiesSection from './VertexPropertiesSection';
import SeamAllowanceDefaultSection from './SeamAllowanceDefaultSection';
import NotchPropertiesSection from './NotchPropertiesSection';
import './PropertiesPanel.css';

// Etiquetas ES para el badge de tipo de costura (los valores son keys de datos).
const SEAM_TYPE_LABELS: Record<string, string> = {
  standard: 'estándar',
  french: 'francesa',
  'flat-felled': 'sobrecargada',
  overlock: 'overlock',
};

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const selectedSeam = editor.selectedSeamId
    ? seams.find(s => s.id === editor.selectedSeamId)
    : undefined;
  // SA-tool selection (one OR many edges, or a single vertex) — properties for
  // the set live here, bound to the typed discriminated selection. Filter to
  // items whose piece still exists (addMatcher clears on removal; guard anyway).
  const saSelection = editor.saSelection;
  const saEdgeItems = saSelection?.kind === 'edge'
    ? saSelection.items.filter(it => pieces.some(p => p.id === it.pieceId)) : [];
  const saVertexItems = saSelection?.kind === 'vertex'
    ? saSelection.items.filter(it => pieces.some(p => p.id === it.pieceId)) : [];
  const hasSa = saEdgeItems.length > 0 || saVertexItems.length > 0;
  // Notch mirror (F3): a selected internal line that resolves to a notch opens
  // the mirror control. selectedInternalLine is set by the select tool.
  const selectedNotch = editor.selectedInternalLine
    ? pieces.find(p => p.id === editor.selectedInternalLine!.pieceId)
        ?.internals.find(i => i.id === editor.selectedInternalLine!.lineId && i.type === 'notch') ?? null
    : null;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    piece: false,
    material: false,
    seams: false,
    // Progressive disclosure (Fase 3): los parámetros del solver arrancan plegados.
    sim: true,
  });

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const seamsList = seams.length > 0 && (
    <PropertySection id="seams" title={`COSTURAS (${seams.length})`} collapsed={!!collapsedSections.seams} onToggle={toggleSection}>
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
            <span className="seam-type">{SEAM_TYPE_LABELS[seam.type] ?? seam.type}</span>
            <button
              className="seam-delete"
              aria-label="Eliminar costura"
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
      {!selectedPiece && !selectedSeam && !hasSa && !selectedNotch ? (
        <>
          {/* Tool-scoped: the SA default lives here so the body-click / drag-to-all
              applies an editable width (CLO3D parity), not a hardcoded constant. */}
          {editor.activeTool === 'seamAllowance' && <SeamAllowanceDefaultSection />}
          <div className="panel-empty">Selecciona una pieza, costura o borde para editar</div>
          {seamsList}
        </>
      ) : (
        <>
          {saEdgeItems.length > 0 && (
            // The set drives the displayed value (multi-select); the buffer
            // re-seeds on selection change — no per-edge remount key needed.
            <EdgePropertiesSection items={saEdgeItems} />
          )}
          {saVertexItems.length > 0 && (
            <VertexPropertiesSection pieceId={saVertexItems[0].pieceId} vertexIndex={saVertexItems[0].vertexIndex} />
          )}
          {selectedNotch && <NotchPropertiesSection />}
          {selectedPiece && (
            <PieceProperties piece={selectedPiece} collapsed={!!collapsedSections.piece} simCollapsed={!!collapsedSections.sim} onToggle={toggleSection} />
          )}

          {selectedSeam && (
            <SeamPropertiesPanel
              seam={selectedSeam}
              pieceAName={pieces.find(p => p.id === selectedSeam.pieceA.pieceId)?.name || '?'}
              pieceBName={pieces.find(p => p.id === selectedSeam.pieceB.pieceId)?.name || '?'}
              edgeALengthMm={pieces.find(p => p.id === selectedSeam.pieceA.pieceId)?.edges?.find(e => e.name === selectedSeam.pieceA.edgeName)?.length}
              edgeBLengthMm={pieces.find(p => p.id === selectedSeam.pieceB.pieceId)?.edges?.find(e => e.name === selectedSeam.pieceB.edgeName)?.length}
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

          {/* Acción destructiva al FINAL del panel, nunca en mitad del
              formulario (Fase 3 — hallazgo de prevención de errores). */}
          {selectedPiece && (
            <button
              className="panel-delete"
              onClick={() => { dispatch(removePiece(selectedPiece.id)); dispatch(clearSelection()); }}
            >
              Eliminar pieza
            </button>
          )}
        </>
      )}
    </div>
  );
}
