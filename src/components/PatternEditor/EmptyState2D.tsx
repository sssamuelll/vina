import { useDispatch } from 'react-redux';
import { activate2DTool } from '../../store/toolActivation';
import type { Tool2D } from '../../types/types';
import './EmptyState2D.css';

/**
 * Whether the 2D canvas should show the onboarding empty-state. Shown only on
 * the idle Select tool with no pieces — picking any drawing tool (pen / rect /
 * polyPen / …) clears the canvas for that tool instead of keeping the overlay.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowEmptyState(pieceCount: number, activeTool: Tool2D): boolean {
  return pieceCount === 0 && activeTool === 'select';
}

interface EmptyState2DProps {
  /** Opens the DXF file picker. AppShell owns the hidden <input type="file">. */
  onImportDXF?: () => void;
}

export default function EmptyState2D({ onImportDXF }: EmptyState2DProps) {
  const dispatch = useDispatch();

  return (
    <div className="empty-state-2d" data-testid="empty-state-2d">
      <div className="empty-state-2d__inner">
        <h2 className="empty-state-2d__heading">Trae tu patrón</h2>

        <button
          type="button"
          className="empty-state-2d__primary"
          onClick={onImportDXF}
          disabled={!onImportDXF}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Importar DXF
        </button>

        <p className="empty-state-2d__drop-hint">o suelta tu .dxf aquí</p>

        <button
          type="button"
          className="empty-state-2d__secondary"
          onClick={() => activate2DTool(dispatch, 'pen')}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Dibujar desde cero <span className="empty-state-2d__kbd">(P)</span>
        </button>

        <button
          type="button"
          className="empty-state-2d__ai-hint"
          onClick={() => window.dispatchEvent(new CustomEvent('vina:focusChat'))}
          aria-label="Describe tu patrón a la IA"
        >
          o descríbelo a la <span className="empty-state-2d__ai-word">IA</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
