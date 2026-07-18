/**
 * ContextMenu — right-click context menu for the 2D Pattern Editor canvas.
 *
 * Shows different options depending on what's under the cursor:
 * - On a piece: Rotate, Flip H/V, Duplicate, Delete, Rename
 * - On empty canvas: Paste, Add Piece, Zoom to Fit
 *
 * @module ContextMenu
 */

import { useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { selectWorkflowStage } from '../../store/selectors';
import type { InternalLineType } from '../../types/types';
import SubMenu from '../../components/shared/SubMenu';
import {
  GROUP_ORDER, resolveMenuActions, resolveTargetKind,
  type CurationCtx, type CurationCallbacks,
} from './actionCuration';

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
  /** True cuando el hit-test ocurrió en altitud POINT (edición de nodos). */
  isEditingNodes?: boolean;
}

interface ContextMenuProps extends CurationCallbacks {
  menu: ContextMenuState;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContextMenu(props: ContextMenuProps) {
  const { menu, onClose } = props;
  const cb: CurationCallbacks = props; // onRename/onConvertSegment/onZoomToFit/onUnfold/onOffsetInternalLine/onOptimizeCurves/onOpenProperties
  const dispatch = useDispatch<AppDispatch>();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
  const groups = useSelector((s: RootState) => s.project.groups);
  const stage = useSelector(selectWorkflowStage);
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

  if (!menu.visible) return null;

  // Arma el CurationCtx desde el hit-test (prop menu) + Redux.
  const piece = menu.pieceId ? pieces.find(p => p.id === menu.pieceId) ?? null : null;
  const seam = menu.seamId ? seams.find(s => s.id === menu.seamId) ?? null : null;
  const internalLine = (piece && menu.internalLineId) ? piece.internals.find(l => l.id === menu.internalLineId) ?? null : null;
  const altitude: 'body' | 'point' = menu.isEditingNodes ? 'point' : 'body';
  const targetKind = resolveTargetKind({
    seamId: menu.seamId ?? null,
    pieceId: menu.pieceId,
    pieceCount: menu.pieceId ? 1 : 0, // Surface B: hit-test = objeto único
    internalLineType: (menu.internalLineType as InternalLineType | null) ?? null,
    altitude,
    segmentHit: menu.segmentIndex !== undefined,
  });

  const ctx: CurationCtx = {
    dispatch, targetKind, stage, altitude,
    pieceId: menu.pieceId, piece, selectedPieceIds,
    seamId: menu.seamId ?? null, seam,
    internalLineId: menu.internalLineId ?? null,
    internalLineType: (menu.internalLineType as InternalLineType | null) ?? null,
    internalLine,
    segmentIndex: menu.segmentIndex, segmentIsCurve: menu.segmentIsCurve,
    clipboard, groups, pieces, cb, onClose,
  };

  const defs = resolveMenuActions(ctx);
  if (defs.length === 0) return null; // p.ej. point.node en v1: sin verbo → sin caja fantasma

  // Agrupa por GROUP_ORDER; separador SOLO entre grupos presentes (N−1, cero vacíos).
  const present = GROUP_ORDER
    .map(g => defs.filter(d => d.group === g))
    .filter(g => g.length > 0);

  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {menu.seamId && (
        <div className="context-menu__header context-menu__header--seam">Costura</div>
      )}
      {menu.pieceId && !menu.seamId && (
        <div className="context-menu__header">{menu.pieceName || menu.pieceId}</div>
      )}
      {present.map((group, gi) => (
        <Fragment key={gi}>
          {group.map((def) => {
            const label = typeof def.label === 'function' ? def.label(ctx) : def.label;
            if (def.submenu) {
              return <SubMenu key={def.id} label={label} icon={def.icon} items={def.submenu(ctx)} />;
            }
            return (
              <button
                key={def.id}
                onClick={() => { def.run(ctx); onClose(); }}
                className={`context-menu__item${def.danger ? ' context-menu__item--danger' : ''}`}
              >
                <span className="context-menu__icon">{def.icon}</span>
                <span className="context-menu__label">{label}</span>
                {def.shortcut && <span className="context-menu__shortcut">{def.shortcut}</span>}
              </button>
            );
          })}
          {gi < present.length - 1 && <div className="context-menu__separator" />}
        </Fragment>
      ))}
    </div>
  );
}
