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
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
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

  return (
    <div className="properties-panel">
      <div className="panel-content">
        {!selectedPiece ? (
          <div style={{ padding: 16, color: '#888', fontSize: 12, textAlign: 'center' }}>
            Select a piece to edit
          </div>
        ) : (
          <>
            <PieceProperties piece={selectedPiece} collapsed={!!collapsedSections.piece} onToggle={toggleSection} />

            {/* Selected seam properties */}
            {editor.selectedSeamId && (() => {
              const seam = seams.find(s => s.id === editor.selectedSeamId);
              if (!seam) return null;
              const pA = pieces.find(p => p.id === seam.pieceA.pieceId);
              const pB = pieces.find(p => p.id === seam.pieceB.pieceId);
              return (
                <SeamPropertiesPanel
                  seam={seam}
                  pieceAName={pA?.name || '?'}
                  pieceBName={pB?.name || '?'}
                  collapsed={!!collapsedSections['seam-props']}
                  onToggle={toggleSection}
                />
              );
            })()}

            <PropertySection id="material" title="MATERIAL" collapsed={!!collapsedSections.material} onToggle={toggleSection}>
              <MaterialTab />
            </PropertySection>

            {seams.length > 0 && (
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
                        onClick={(e) => { e.stopPropagation(); dispatch(removeSeam(seam.id)); }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </PropertySection>
            )}
          </>
        )}
      </div>
    </div>
  );
}
