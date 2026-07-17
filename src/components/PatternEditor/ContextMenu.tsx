/**
 * ContextMenu — right-click context menu for the 2D Pattern Editor canvas.
 *
 * Shows different options depending on what's under the cursor:
 * - On a piece: Rotate, Flip H/V, Duplicate, Delete, Rename
 * - On empty canvas: Paste, Add Piece, Zoom to Fit
 *
 * @module ContextMenu
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  removePiece,
  removeSeam,
  reverseSeam,
  rotatePiece,
  duplicatePiece,
  flipPieceH,
  flipPieceV,
  linkPieces,
  unlinkPieces,
  cloneAsLinked,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  lockPiece,
  unlockPiece,
  addPiece,
  createGroup,
  addPiecesToGroup,
  removePiecesFromGroup,
  deactivatePiece,
  setLayer,
  setSublayer,
  cloneToLayer,
} from '../../store/projectSlice';
import { selectPiece, clearSelection, copyPieces, createPastedPieces, enterSuperimposePickMode } from '../../store/editorSlice';
import { dispatchInspectPiece } from '../../store/inspectorSlice';
import SubMenu from '../../components/shared/SubMenu';
import type { SubMenuItem } from '../../components/shared/SubMenu';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** ID of piece under cursor, or null for empty canvas */
  pieceId: string | null;
  pieceName?: string;
  /** ID of seam under cursor, or null */
  seamId?: string | null;
  /** Segment command index for convert options (set when right-clicking in edit pattern mode) */
  segmentIndex?: number;
  /** Whether the segment is currently a curve */
  segmentIsCurve?: boolean;
  /** Active tool when context menu was opened */
  activeTool?: string;
  /** ID of internal line under cursor, or null */
  internalLineId?: string | null;
  /** Type of internal line under cursor */
  internalLineType?: string | null;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
  onZoomToFit?: () => void;
  onUnfold?: (pieceId: string, foldLineId: string, outlineOnly?: boolean) => void;
  onOffsetInternalLine?: (pieceId: string, lineId: string) => void;
  onOptimizeCurves?: (pieceId: string, lineId?: string) => void;
  /** Selects the piece and opens the Properties ContextPanel (re-homed PropertiesPanel). */
  onOpenProperties?: (pieceId: string) => void;
}

// ─── Menu Items ─────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  danger?: boolean;
  /** When set, renders a SubMenu component instead of a flat button */
  _layerSubmenu?: SubMenuItem[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContextMenu({ menu, onClose, onRename, onConvertSegment, onZoomToFit, onUnfold, onOffsetInternalLine, onOptimizeCurves, onOpenProperties }: ContextMenuProps) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
  const groups = useSelector((s: RootState) => s.project.groups);
  const ref = useRef<HTMLDivElement>(null);

  // Clamp the menu into the viewport: long piece menus (25+ rows) opened
  // mid-canvas extend past the fold, leaving the bottom items unreachable
  // (review finding, properties re-home). Measured post-render, pre-paint.
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    if (!menu.visible) return;
    const el = ref.current;
    if (!el) { setPos({ x: menu.x, y: menu.y }); return; }
    const pad = 8;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, Math.max(pad, window.innerWidth - r.width - pad)),
      y: Math.min(menu.y, Math.max(pad, window.innerHeight - r.height - pad)),
    });
  }, [menu.visible, menu.x, menu.y]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu.visible, onClose]);

  const act = useCallback((fn: () => void) => {
    fn();
    onClose();
  }, [onClose]);

  if (!menu.visible) return null;

  const items: MenuItem[] = [];

  if (menu.segmentIndex !== undefined) {
    items.push({
      label: menu.segmentIsCurve ? 'Convertir en línea' : 'Convertir en curva',
      icon: menu.segmentIsCurve ? '─' : '⌒',
      action: () => { onConvertSegment?.(menu.segmentIndex!, !menu.segmentIsCurve); onClose(); },
      separator: true,
    });
  }

  // ── Internal line context ──
  if (menu.internalLineId && menu.pieceId) {
    const piece = pieces.find(p => p.id === menu.pieceId);
    const line = piece?.internals.find(l => l.id === menu.internalLineId);

    if (line?.type === 'fold') {
      items.push({
        label: 'Desplegar',
        icon: '⇔',
        action: () => act(() => onUnfold?.(menu.pieceId!, menu.internalLineId!)),
      });
      items.push({
        label: 'Desplegar solo el contorno',
        icon: '⇔',
        action: () => act(() => onUnfold?.(menu.pieceId!, menu.internalLineId!, true)),
        separator: true,
      });
    }

    items.push({
      label: 'Offset como línea interna',
      icon: '⏛',
      action: () => act(() => onOffsetInternalLine?.(menu.pieceId!, menu.internalLineId!)),
    });

    items.push({
      label: 'Optimizar puntos de curva',
      icon: '◇',
      action: () => act(() => onOptimizeCurves?.(menu.pieceId!, menu.internalLineId!)),
      separator: true,
    });
  }

  if (menu.seamId) {
    // ── Seam context ──
    const sid = menu.seamId;
    const seam = seams.find(s => s.id === sid);
    const connectedA = seam?.pieceA.pieceId;
    const connectedB = seam?.pieceB.pieceId;

    items.push({
      label: 'Invertir dirección de costura',
      icon: '↔',
      shortcut: 'Ctrl+B',
      action: () => act(() => dispatch(reverseSeam(sid))),
    });

    // Select connected pieces
    if (connectedA && connectedB) {
      const nameA = pieces.find(p => p.id === connectedA)?.name || 'Pieza A';
      const nameB = pieces.find(p => p.id === connectedB)?.name || 'Pieza B';
      items.push({
        label: `Seleccionar "${nameA}"`,
        icon: '☐',
        action: () => act(() => dispatch(selectPiece(connectedA))),
      });
      items.push({
        label: `Seleccionar "${nameB}"`,
        icon: '☐',
        action: () => act(() => dispatch(selectPiece(connectedB))),
        separator: true,
      });
    }

    items.push({
      label: 'Eliminar costura',
      icon: '🗑',
      shortcut: 'Del',
      action: () => act(() => {
        dispatch(removeSeam(sid));
        dispatch(clearSelection());
      }),
      danger: true,
    });
  } else if (menu.pieceId) {
    // ── Piece context ──
    const pid = menu.pieceId;
    const piece = pieces.find(p => p.id === pid);

    // Find current rotation to add to it
    const currentRotation = piece?.rotation ?? 0;

    // Copy
    items.push({
      label: 'Copiar',
      icon: '📄',
      shortcut: 'Ctrl+C',
      action: () => act(() => {
        if (piece) dispatch(copyPieces({ pieces: [piece] }));
      }),
    });
    // Paste
    if (clipboard) {
      items.push({
        label: 'Pegar',
        icon: '📋',
        shortcut: 'Ctrl+V',
        action: () => act(() => {
          const pasted = createPastedPieces(clipboard);
          pasted.forEach(p => dispatch(addPiece(p)));
        }),
      });
      items.push({
        label: 'Pegar en espejo',
        icon: '🪞',
        shortcut: 'Ctrl+R',
        action: () => act(() => {
          const pasted = createPastedPieces(clipboard, true);
          pasted.forEach(p => dispatch(addPiece(p)));
        }),
        separator: true,
      });
    } else {
      items.push({
        label: 'Pegar',
        icon: '📋',
        shortcut: 'Ctrl+V',
        action: () => {},
        separator: true,
      });
    }

    // Rotate
    items.push({
      label: 'Rotar 90°',
      icon: '↻',
      shortcut: 'R',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 90 }))),
    });
    items.push({
      label: 'Rotar 180°',
      icon: '↻',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 180 }))),
    });
    items.push({
      label: 'Rotar -90°',
      icon: '↺',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation - 90 }))),
      separator: true,
    });

    // Flip
    items.push({
      label: 'Voltear horizontal',
      icon: '↔',
      shortcut: 'H',
      action: () => act(() => dispatch(flipPieceH(pid))),
    });
    items.push({
      label: 'Voltear vertical',
      icon: '↕',
      shortcut: 'V',
      action: () => act(() => dispatch(flipPieceV(pid))),
      separator: true,
    });

    // Z-order
    items.push({
      label: 'Traer al frente',
      icon: '⬆',
      action: () => act(() => dispatch(bringToFront(pid))),
    });
    items.push({
      label: 'Adelantar',
      icon: '↑',
      action: () => act(() => dispatch(bringForward(pid))),
    });
    items.push({
      label: 'Atrasar',
      icon: '↓',
      action: () => act(() => dispatch(sendBackward(pid))),
    });
    items.push({
      label: 'Enviar al fondo',
      icon: '⬇',
      action: () => act(() => dispatch(sendToBack(pid))),
      separator: true,
    });


    // Layer submenu
    const layerItems: SubMenuItem[] = [
      { label: `Cambiar capa... (${piece?.layer ?? 1})`, action: () => { dispatch(setLayer({ pieceId: pid, layer: ((piece?.layer ?? 1) % 10) + 1 })); onClose(); } },
      { label: `Cambiar subcapa... (${piece?.sublayer ?? 0})`, action: () => { dispatch(setSublayer({ pieceId: pid, sublayer: ((piece?.sublayer ?? 0) + 1) % 5 })); onClose(); } },
      { separator: true, label: 'Clonar encima', action: () => { dispatch(cloneToLayer({ pieceId: pid, direction: 'over' })); onClose(); } },
      { label: 'Clonar debajo', action: () => { dispatch(cloneToLayer({ pieceId: pid, direction: 'under' })); onClose(); } },
      { separator: true, label: 'Superponer encima...', action: () => { dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'over' })); onClose(); } },
      { label: 'Superponer debajo...', action: () => { dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'under' })); onClose(); } },
      { label: 'Superponer al lado...', action: () => { dispatch(enterSuperimposePickMode({ sourcePieceId: pid, mode: 'side' })); onClose(); } },
    ];
    items.push({
      label: 'Capa',
      icon: '\u{1F4D1}',
      action: () => {},
      _layerSubmenu: layerItems,
      separator: true,
    });

    // Duplicate
    items.push({
      label: 'Duplicar',
      icon: '⧉',
      shortcut: 'Ctrl+D',
      action: () => act(() => dispatch(duplicatePiece(pid))),
    });

    // Lock / Unlock
    items.push({
      label: piece?.locked ? 'Desbloquear' : 'Bloquear',
      icon: piece?.locked ? '🔓' : '🔒',
      action: () => act(() => dispatch(piece?.locked ? unlockPiece(pid) : lockPiece(pid))),
    });

    // Activate / Deactivate
    items.push({
      label: piece?.active === false ? 'Activar pieza' : 'Desactivar pieza',
      icon: piece?.active === false ? '▶' : '⏸',
      action: () => act(() => dispatch(deactivatePiece({ pieceId: pid, active: piece?.active === false }))),
    });

    // Rename
    items.push({
      label: 'Renombrar…',
      icon: '✏️',
      shortcut: 'F2',
      action: () => act(() => onRename?.(pid)),
    });

    // Properties — high in the menu: it's María's everyday entry point to
    // SA width / fabric / seam editing, and long menus can scroll.
    items.push({
      label: 'Propiedades…',
      icon: '🎛',
      action: () => act(() => onOpenProperties?.(pid)),
      separator: true,
    });

    // ─── Linked Editing ───
    if (piece?.linkedPieceId) {
      // Already linked — show unlink and select partner
      items.push({
        label: 'Quitar edición vinculada',
        icon: '🔗',
        action: () => act(() => dispatch(unlinkPieces({ pieceId: pid }))),
      });
      items.push({
        label: 'Seleccionar patrón vinculado',
        icon: '👆',
        action: () => act(() => dispatch(selectPiece(piece.linkedPieceId!))),
        separator: true,
      });
    } else if (selectedPieceIds.length === 2) {
      // Two pieces selected — show link options
      items.push({
        label: 'Aplicar edición vinculada – simetría',
        icon: '🪞',
        action: () => act(() => dispatch(linkPieces({ pieceIdA: selectedPieceIds[0], pieceIdB: selectedPieceIds[1], mode: 'symmetry' }))),
      });
      items.push({
        label: 'Aplicar edición vinculada – instancia',
        icon: '📋',
        action: () => act(() => dispatch(linkPieces({ pieceIdA: selectedPieceIds[0], pieceIdB: selectedPieceIds[1], mode: 'instance' }))),
        separator: true,
      });
    } else {
      // Single unlinked piece — show clone options
      items.push({
        label: 'Clonar con edición vinculada – simetría',
        icon: '🪞',
        action: () => act(() => dispatch(cloneAsLinked({ pieceId: pid, mode: 'symmetry' }))),
      });
      items.push({
        label: 'Clonar con edición vinculada – instancia',
        icon: '📋',
        action: () => act(() => dispatch(cloneAsLinked({ pieceId: pid, mode: 'instance' }))),
        separator: true,
      });
    }

    // ─── Groups ───
    items.push({
      label: 'Crear grupo con la selección',
      icon: '📁',
      action: () => act(() => {
        const ids = selectedPieceIds.length > 0 ? selectedPieceIds : [pid];
        dispatch(createGroup({ name: `Grupo ${groups.length + 1}`, pieceIds: ids }));
      }),
    });
    if (groups.length > 0) {
      for (const group of groups) {
        if (!group.pieceIds.includes(pid)) {
          items.push({
            label: `Agregar a "${group.name}"`,
            icon: '+',
            action: () => act(() => dispatch(addPiecesToGroup({ groupId: group.id, pieceIds: [pid] }))),
          });
        }
      }
      // "Remove from group" for groups the piece belongs to
      for (const group of groups) {
        if (group.pieceIds.includes(pid)) {
          items.push({
            label: `Quitar de "${group.name}"`,
            icon: '−',
            action: () => act(() => dispatch(removePiecesFromGroup({ groupId: group.id, pieceIds: [pid] }))),
          });
        }
      }
    }
    items.push({
      label: '',
      icon: '',
      action: () => {},
      separator: true,
    });

    if (!menu.internalLineId && !menu.seamId) {
      items.push({
        label: 'Optimizar todos los puntos de curva',
        icon: '◇',
        action: () => act(() => onOptimizeCurves?.(pid)),
        separator: true,
      });
    }

    items.push({
      label: 'Seleccionar',
      icon: '☐',
      action: () => act(() => dispatch(selectPiece(pid))),
    });
    items.push({
      label: 'Inspeccionar',
      icon: '🔍',
      action: () => act(() => {
        dispatchInspectPiece(dispatch, pid);
      }),
      separator: true,
    });
    items.push({
      label: 'Eliminar pieza',
      icon: '🗑',
      shortcut: 'Del',
      action: () => act(() => dispatch(removePiece(pid))),
      danger: true,
    });
  } else {
    // ── Empty canvas context ──
    if (clipboard) {
      items.push({
        label: 'Pegar',
        icon: '📋',
        shortcut: 'Ctrl+V',
        action: () => act(() => {
          const pasted = createPastedPieces(clipboard);
          pasted.forEach(p => dispatch(addPiece(p)));
        }),
      });
      items.push({
        label: 'Pegar en espejo',
        icon: '🪞',
        shortcut: 'Ctrl+R',
        action: () => act(() => {
          const pasted = createPastedPieces(clipboard, true);
          pasted.forEach(p => dispatch(addPiece(p)));
        }),
        separator: true,
      });
    }
    items.push({
      label: 'Ajustar zoom al patrón',
      icon: '⊞',
      action: () => act(() => onZoomToFit?.()),
    });
  }

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
    >
      {menu.seamId && (
        <div className="context-menu__header context-menu__header--seam">
          Costura
        </div>
      )}
      {menu.pieceId && !menu.seamId && (
        <div className="context-menu__header">
          {menu.pieceName || menu.pieceId}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i}>
          {item._layerSubmenu ? (
            <SubMenu label={item.label} icon={item.icon} items={item._layerSubmenu} />
          ) : (
            <button
              onClick={item.action}
              className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}`}
            >
              <span className="context-menu__icon">{item.icon}</span>
              <span className="context-menu__label">{item.label}</span>
              {item.shortcut && (
                <span className="context-menu__shortcut">{item.shortcut}</span>
              )}
            </button>
          )}
          {item.separator && (
            <div className="context-menu__separator" />
          )}
        </div>
      ))}
    </div>
  );
}
