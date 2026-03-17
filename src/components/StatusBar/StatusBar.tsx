import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import './StatusBar.css';

export default function StatusBar() {
  const editor = useSelector((s: RootState) => s.editor);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const simulation = useSelector((s: RootState) => s.simulation);

  const toolLabels: Record<string, string> = {
    // CLO3D 2D Tools
    select: 'Edit Pattern (Z)',
    transform: 'Transform (A)',
    editCurve: 'Edit Curve (V)',
    editConstrain: 'Edit Curvature (C)',
    pen: 'Polygon (H)',
    rectangle: 'Rectangle (S)',
    circle: 'Ellipse (E)',
    scissors: 'Split (X)',
    internalShape: 'Internal Shape (G)',
    trace: 'Trace (I)',
    dart: 'Dart (D)',
    // Sewing
    seam: 'Edit Sewing (B)',
    freesewing: 'Free Sewing (F)',
    // Displaced (Shift+Key)
    measure: 'Measure (Shift+M)',
    notch: 'Notch (Shift+N)',
    grainline: 'Grainline (Shift+G)',
    line: 'Line (Shift+L)',
    // 3D
    camera: 'Camera (Q)',
    pin: 'Pin (W)',
    // Navigation (no shortcut)
    hand: 'Hand',
    zoom: 'Zoom',
  };

  // Solver tier display labels
  const solverLabels: Record<string, string> = {
    webgpu: 'GPU',
    wasm: 'Wasm',
    'cpu-worker': 'CPU',
    'neural-drape': 'Neural',
  };

  // Format particle count: 1234 → "1.2k"
  const formatCount = (n: number): string =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  // Determine frame time health class
  const getFrameHealth = (ms: number): string => {
    if (ms > 100) return 'critical';
    if (ms > 33) return 'warning';
    return 'healthy';
  };

  // Simulation status
  const isSimulating = simulation.simulationState === 'running';
  const solverLabel = solverLabels[simulation.solverTier] || null;

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
        {/* Simulation metrics */}
        {solverLabel && (
          <>
            <span className="status-item-with-dot" title={`Solver: ${simulation.solverTier}`}>
              <span className={`status-dot ${isSimulating ? 'healthy' : 'inactive'}`} />
              {solverLabel}
            </span>
            <span className="status-separator" />
          </>
        )}
        {simulation.particleCount > 0 && (
          <>
            <span className="status-item" title={`${simulation.particleCount} particles`}>
              {formatCount(simulation.particleCount)}
            </span>
            <span className="status-separator" />
          </>
        )}
        {isSimulating && simulation.frameTimeMs > 0 && (
          <>
            <span className="status-item-with-dot" title="Frame time (target: <16.7ms for 60fps)">
              <span className={`status-dot ${getFrameHealth(simulation.frameTimeMs)}`} />
              {simulation.frameTimeMs.toFixed(1)}ms
            </span>
            <span className="status-separator" />
          </>
        )}
        {simulation.bodyCollision && (
          <>
            <span className="status-item" title="Body collision enabled">
              Collision ✓
            </span>
            <span className="status-separator" />
          </>
        )}
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
