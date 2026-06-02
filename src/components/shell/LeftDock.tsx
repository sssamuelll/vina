import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import Dock from './Dock';
import { DOCK_2D_TOOLS } from './dock2dTools';

/** The left (2D) dock. Hidden in 3D-only view. */
export default function LeftDock() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);

  if (viewMode === '3d') return null;

  return (
    <Dock
      domainLabel="2D"
      tools={DOCK_2D_TOOLS}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
    />
  );
}
