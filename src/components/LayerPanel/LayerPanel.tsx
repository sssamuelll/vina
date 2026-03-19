import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { selectPiece } from '../../store/editorSlice';
import './LayerPanel.css';

export default function LayerPanel() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  // Group pieces by layer
  const layerMap = new Map<number, typeof pieces>();
  for (const piece of pieces) {
    const layer = piece.layer ?? 1;
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(piece);
  }

  // Sort layers descending (outermost first)
  const sortedLayers = [...layerMap.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="layer-panel">
      {sortedLayers.length === 0 && (
        <div className="layer-panel-empty">No pieces in project</div>
      )}
      {sortedLayers.map(([layerNum, layerPieces]) => (
        <div key={layerNum} className="layer-group">
          <div className="layer-group-header">
            <span className="layer-group-title">Layer {layerNum}</span>
            <span className="layer-group-count">{layerPieces.length} piece{layerPieces.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="layer-group-pieces">
            {layerPieces
              .sort((a, b) => (b.sublayer ?? 0) - (a.sublayer ?? 0))
              .map(piece => (
                <div
                  key={piece.id}
                  className={`layer-piece-row ${selectedIds.includes(piece.id) ? 'selected' : ''}`}
                  onClick={() => dispatch(selectPiece(piece.id))}
                >
                  <span className="layer-piece-name">{piece.name}</span>
                  {piece.fabricId && (
                    <span className="layer-piece-fabric">{piece.fabricId}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
