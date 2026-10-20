import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus } from 'lucide-react';
import type { RootState } from '../../store';
import { activate2DTool, selectHasInternalShapeHost } from '../../store/toolActivation';
import { addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import Dock from './Dock';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';
import { herramientaParaMostrar } from './herramientaParaMostrar';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';

/** El margen de herramientas del patrón (spec 2026-10-02 § 4.3): las del dock
 *  de la usuaria + el ＋ que las agrega y las quita. Hidden in 3D-only view. La
 *  zona AUTO se fue en P2 (§ 8): Escalado y Lista de materiales están en
 *  Vina › Patrón. */
export default function LeftDock() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const hasInternalShapeHost = useSelector(selectHasInternalShapeHost);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const tools2d = useSelector((s: RootState) => s.dock.tools2d);
  const [pickerOpen, setPickerOpen] = useState(false);
  // El personalizador cuelga de <body> (ver DockToolPicker): se abre donde
  // está el «+» al pulsarlo, y un clic dentro de él no cuenta como «fuera».
  const [ancla, setAncla] = useState({ left: 0, bottom: 0 });
  const editorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  // Abierto, el foco entra al personalizador: en el DOM queda lejos del «+», y
  // Tab desde el botón ya no llegaría a la lista.
  useEffect(() => {
    if (pickerOpen) pickerRef.current?.querySelector<HTMLButtonElement>('.dock-picker__item:not(:disabled)')?.focus();
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (editorRef.current?.contains(t) || pickerRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  // Esc lo cierra antes que la selección, y si el foco estaba en el
  // personalizador vuelve al «+» que lo abrió: un peldaño de la escalera de lo
  // que se llama (spec 2026-10-02 § 6.2).
  usePeldanoDeEscape('personalizador', 'menu', pickerOpen, () => {
    if (pickerRef.current?.contains(document.activeElement)) addRef.current?.focus();
    setPickerOpen(false);
  });

  if (viewMode === '3d') return null;

  const tools = tools2d
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);
  // La activa siempre tiene marca (spec § 4.3): si no está en el margen, se
  // pinta al final, sola y detrás de aire, mientras siga activa.
  const activaFuera = tools.some((t) => t.id === activeTool) ? undefined : herramientaParaMostrar(activeTool);

  return (
    <Dock
      tools={tools}
      activeToolId={activeTool}
      activaFuera={activaFuera}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      disabledReasons={hasInternalShapeHost ? undefined : {
        internalShape: 'Crea o muestra una pieza para dibujar líneas internas.',
      }}
      onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}
      footer={
        <div ref={editorRef} className="dock-editor">
          <button
            ref={addRef}
            type="button"
            className="dock__add"
            onClick={(e) => {
              // ponytail: el ancla se mide al abrir; si el dock se desplaza o
              // crece con el menú abierto, el menú no lo sigue.
              const r = e.currentTarget.getBoundingClientRect();
              setAncla({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
              setPickerOpen((o) => !o);
            }}
            aria-label="Personalizar herramientas del dock"
            aria-expanded={pickerOpen}
            aria-controls="dock-picker"
          >
            <Plus size={16} />
          </button>
          {pickerOpen && (
            <DockToolPicker
              ancla={ancla}
              raizRef={pickerRef}
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
