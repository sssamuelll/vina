import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode } from '../../store/editorSlice';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D from '../Viewport3D/Viewport3D';
import Toolbar2D from '../Toolbar2D/Toolbar2D';
import PropertiesPanel from '../PropertiesPanel/PropertiesPanel';
import './Workspace.css';

export default function Workspace() {
  const dispatch = useDispatch();
  const { viewMode } = useSelector((s: RootState) => s.editor);

  return (
    <div className="workspace">
      {/* Top toolbar */}
      <header className="workspace-toolbar">
        <div className="workspace-logo">OpenClo</div>
        <div className="view-toggle">
          <button
            className={viewMode === '2d' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('2d'))}
          >
            2D
          </button>
          <button
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('split'))}
          >
            Split
          </button>
          <button
            className={viewMode === '3d' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('3d'))}
          >
            3D
          </button>
        </div>
      </header>

      <div className="workspace-body">
        {/* Left: 2D tools */}
        {viewMode !== '3d' && <Toolbar2D />}

        {/* Viewports */}
        <div className="viewports">
          {(viewMode === '2d' || viewMode === 'split') && (
            <div className={`viewport viewport-2d ${viewMode === 'split' ? 'half' : 'full'}`}>
              <div className="viewport-label">PATTERN</div>
              <PatternEditor />
            </div>
          )}
          {viewMode === 'split' && <div className="viewport-divider" />}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div className={`viewport viewport-3d ${viewMode === 'split' ? 'half' : 'full'}`}>
              <div className="viewport-label">3D VIEW</div>
              <Viewport3D />
            </div>
          )}
        </div>

        {/* Right: Properties panel */}
        <PropertiesPanel />
      </div>
    </div>
  );
}
