import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import './StatusBar.css';

export default function StatusBar() {
  const editor = useSelector((s: RootState) => s.editor);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const toolLabels: Record<string, string> = {
    select: 'Select (V)',
    pen: 'Pen (P)',
    line: 'Line (L)',
    rectangle: 'Rectangle (R)',
    seam: 'Seam (S)',
    notch: 'Notch (N)',
    grainline: 'Grainline (G)',
    measure: 'Measure (M)',
    hand: 'Hand (H)',
  };

  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const saValue = selectedPiece ? selectedPiece.seamAllowance : '—';
  const zoomPercent = Math.round(editor.zoom2D * 100);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-item">Ready</span>
        <span className="status-separator" />
        <span className="status-item">Pieces: {pieces.length}</span>
        <span className="status-separator" />
        <span className="status-item">{toolLabels[editor.activeTool] || editor.activeTool}</span>
      </div>
      <div className="status-bar-right">
        <span className="status-item" title="Shift+S to toggle">SA: {editor.showSeamAllowance ? `${saValue}mm` : 'Off'}</span>
        <span className="status-separator" />
        <span className="status-item">mm</span>
        <span className="status-separator" />
        <span className="status-item">Zoom: {zoomPercent}%</span>
        <span className="status-separator" />
        <span className="status-item">Grid: {editor.snapToGrid ? 'On' : 'Off'}</span>
      </div>
    </div>
  );
}
