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
import { pushJournal } from '../../utils/telemetry/journal';
import { selectWorkflowStage } from '../../store/selectors';
import type { InternalLineType } from '../../types/types';
import SubMenu from '../../components/shared/SubMenu';
import { shortcutLabelFor } from '../shell/shortcutDisplay';
import { computeScrollFade, type ScrollFade } from './menuOverflow';
import { instrumentSubmenuItems } from './menuInstrumentation';
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
  /** Borde alcanzado con Margen activo; añade el acelerador numérico. */
  saEdgeId?: string | null;
  /** Segment command index for convert options (set when right-clicking in edit pattern mode) */
  segmentIndex?: number;
  /** Whether the segment is currently a curve */
  segmentIsCurve?: boolean;
  /** La interna del tramo, en Q (spec 2026-09-24 § 4.4); sin ella, el contorno. */
  segmentLineId?: string;
  /** Active tool when context menu was opened */
  activeTool?: string;
  /** ID of internal line under cursor, or null */
  internalLineId?: string | null;
  /** Type of internal line under cursor */
  internalLineType?: string | null;
  /** True cuando el hit-test ocurrió en altitud POINT (edición de nodos). */
  isEditingNodes?: boolean;
  /** El clic derecho cayó sobre el punto ya elegido en «Editar patrón» (#1112). */
  derechoSobreElPuntoElegido?: boolean;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<ScrollFade>({ top: false, bottom: false });

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

  useLayoutEffect(() => {
    if (!menu.visible) return;
    const updateFade = () => {
      const el = scrollRef.current;
      if (el) setFade(computeScrollFade(el));
    };
    const el = scrollRef.current;
    updateFade();
    el?.addEventListener('scroll', updateFade);
    window.addEventListener('resize', updateFade);
    return () => {
      el?.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [menu.visible, menu.x, menu.y]);

  // Close on click outside or Escape.
  //
  // `onClose` va por ref y NO en las dependencias del efecto. Medido en
  // navegador real (2026-08-29, e2e de la bitácora): con un Escape de
  // teclado, `ShortcutProvider` (también en `document`, registrado antes)
  // despacha `selection.deselect`, eso re-renderiza PatternEditor de forma
  // síncrona (useSyncExternalStore), y como `onClose` es una flecha inline
  // el efecto quitaba y volvía a registrar ESTE listener en medio del mismo
  // dispatch — el DOM no invoca listeners quitados ni añadidos durante el
  // dispatch, así que Escape nunca cerraba el menú. Un keydown sintético
  // (jsdom, dispatchEvent) no pasa por ese camino, y por eso los tests
  // unitarios lo daban por bueno.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu.visible]);

  if (!menu.visible) return null;

  // Arma el CurationCtx desde el hit-test (prop menu) + Redux.
  const piece = menu.pieceId ? pieces.find(p => p.id === menu.pieceId) ?? null : null;
  const seam = menu.seamId ? seams.find(s => s.id === menu.seamId) ?? null : null;
  const internalLine = (piece && menu.internalLineId) ? piece.internals.find(l => l.id === menu.internalLineId) ?? null : null;
  // La altitud 'point' es la del MODO nodo, y solo vale mientras la herramienta
  // activa sea la de editar patrón. `editPatternTool.isEditing` no se apaga al
  // cambiar de herramienta — solo con Esc — así que se puede tener la flecha en
  // la mano y el modo nodo encendido por debajo (el mismo estado latente del
  // rastro del #194). Colgando la altitud de ese flag a secas, con la flecha
  // activa `resolveTargetKind` devolvía `point.node` para cualquier clic que no
  // cayera a 8px de un segmento; `point.node` no tiene verbos y este componente
  // devuelve null sin verbos. Resultado: clic derecho mudo en toda la lona, sin
  // ninguna señal de por qué (samuel #214).
  const altitude: 'body' | 'point' =
    menu.isEditingNodes && menu.activeTool === 'editPattern' ? 'point' : 'body';
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
    saEdgeId: menu.saEdgeId ?? null,
    internalLineId: menu.internalLineId ?? null,
    internalLineType: (menu.internalLineType as InternalLineType | null) ?? null,
    internalLine,
    segmentIndex: menu.segmentIndex, segmentIsCurve: menu.segmentIsCurve, segmentLineId: menu.segmentLineId,
    derechoSobreElPuntoElegido: menu.derechoSobreElPuntoElegido,
    clipboard, groups, pieces, cb, onClose,
  };

  const defs = resolveMenuActions(ctx);
  if (defs.length === 0) return null; // sin verbo aplicable → sin caja fantasma

  // Agrupa por GROUP_ORDER; separador SOLO entre grupos presentes (N−1, cero vacíos).
  const present = GROUP_ORDER
    .map(g => defs.filter(d => d.group === g))
    .filter(g => g.length > 0);

  return (
    <div ref={ref} className="context-menu" data-superficie="menu" style={{ left: pos.x, top: pos.y }}>
      <div className="context-menu__scroll" ref={scrollRef}>
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
                return <SubMenu key={def.id} label={label} icon={def.icon} items={instrumentSubmenuItems(def.id, def.submenu(ctx))} />;
              }
              return (
                <button
                  key={def.id}
                  onClick={() => { pushJournal('ui', 'menu:action', { id: def.id }); def.run(ctx); onClose(); }}
                  className={`context-menu__item${def.danger ? ' context-menu__item--danger' : ''}`}
                >
                  <span className="context-menu__icon">{def.icon}</span>
                  <span className="context-menu__label">{label}</span>
                  {shortcutLabelFor(def.shortcutId) && (
                    <span className="context-menu__shortcut">{shortcutLabelFor(def.shortcutId)}</span>
                  )}
                </button>
              );
            })}
            {gi < present.length - 1 && <div className="context-menu__separator" />}
          </Fragment>
        ))}
      </div>
      {fade.bottom && <div className="context-menu__fade context-menu__fade--bottom"><span className="context-menu__fade-chevron">⌄</span></div>}
      {fade.top && <div className="context-menu__fade context-menu__fade--top"><span className="context-menu__fade-chevron">⌃</span></div>}
    </div>
  );
}
