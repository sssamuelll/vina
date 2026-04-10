import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import TopBar from './TopBar';

export default function AppShell() {
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);

  return (
    <div className="app-shell">
      <TopBar />
      <div className={`canvas-area canvas-area--${viewMode}`}>
        <div className="canvas-area__2d">
          {/* PatternEditor mounted in Task 6 */}
        </div>
        {viewMode === 'split' && <div className="canvas-area__divider" />}
        <div className="canvas-area__3d">
          {/* Viewport3D mounted in Task 6 */}
        </div>
      </div>
      <div className="unified-bar-slot">
        {/* UnifiedBar added in Task 3 */}
      </div>
    </div>
  );
}
