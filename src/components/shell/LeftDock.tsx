import { useSelector, useDispatch } from 'react-redux';
import { store, type RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import { pinAuto, unpinAuto } from '../../store/dockSlice';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import { DOCK_2D_TOOLS } from './dock2dTools';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: pinned tools + the stage-driven auto zone. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);

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
      autoZone={(() => {
        const keptIds = pinnedExtra.left;
        const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
        const suggested = getDockSuggestions(stage, 'left').filter((s) => !keptIds.includes(s.id));
        return (
          <DockAutoZone
            kept={kept}
            suggested={suggested}
            signaling={signaling}
            onRun={runSuggestion}
            onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
            onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
          />
        );
      })()}
    />
  );
}
