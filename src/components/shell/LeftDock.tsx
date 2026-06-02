import { useSelector, useDispatch } from 'react-redux';
import { store, type RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import { DOCK_2D_TOOLS } from './dock2dTools';
import { getDockSuggestions } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: pinned tools + the stage-driven auto zone. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);

  if (viewMode === '3d') return null;

  const runSuggestion = (id: string) => {
    if (id === 'grade') onOpenPanel('Grading');
    else if (id === 'export') runUiExport('dxf', store.getState().project, dispatch);
  };

  return (
    <Dock
      domainLabel="2D"
      tools={DOCK_2D_TOOLS}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      autoZone={<DockAutoZone suggestions={getDockSuggestions(stage, 'left')} onRun={runSuggestion} />}
    />
  );
}
