import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus } from 'lucide-react';
import { store, type RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import { pinAuto, unpinAuto, addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: an editable tool set + the stage-driven auto zone + a ＋
 *  customize editor. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);
  const tools2d = useSelector((s: RootState) => s.dock.tools2d);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pickerOpen]);

  if (viewMode === '3d') return null;

  const tools = tools2d
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);

  const runSuggestion = (id: string) => {
    if (id === 'grade') onOpenPanel('Grading');
    else if (id === 'export') runUiExport('dxf', store.getState().project, dispatch);
  };

  const keptIds = pinnedExtra.left;
  const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
  const suggested = getDockSuggestions(stage, 'left').filter((s) => !keptIds.includes(s.id));

  return (
    <Dock
      domainLabel="2D"
      tools={tools}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}
      autoZone={
        <DockAutoZone
          kept={kept}
          suggested={suggested}
          signaling={signaling}
          side="left"
          onRun={runSuggestion}
          onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
          onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
        />
      }
      footer={
        <div ref={editorRef} className="dock-editor">
          <button
            type="button"
            className="dock__add"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label="Personalizar herramientas del dock"
            aria-expanded={pickerOpen}
          >
            <Plus size={16} />
          </button>
          {pickerOpen && (
            <DockToolPicker
              catalog={DOCK_2D_CATALOG}
              selectedIds={tools2d}
              onAdd={(id) => dispatch(addDockTool(id))}
              onRemove={(id) => dispatch(removeDockTool(id))}
              onReset={() => dispatch(resetDockTools())}
            />
          )}
        </div>
      }
    />
  );
}
