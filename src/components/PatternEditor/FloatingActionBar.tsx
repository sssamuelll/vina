/**
 * FloatingActionBar (Surface A) — barra flotante de acciones sobre el transform
 * box en el verbo `select`. Cabalga T2–T5: monta cuando `showTransformBox` es
 * true (⇒ suprimida en altitud POINT por construcción, invariante G7), se ancla
 * a `transformTool.bbox`, y NO lleva listener de teclado — la seguridad de Escape
 * la da la captura de T5. Lee `resolveBarActions` (T6, cap 5, sin danger,
 * BAR_ENABLED_KINDS) y `BAR_ICONS` (T8, monocromo). icon-only + ToolTooltip:
 * el label vive en el tooltip.
 */
import { useMemo } from 'react';
import type { BBox } from '../../utils/geometry/transform';
import type { Point2D } from '../../types/types';
import type { CurationCtx } from './actionCuration';
import { resolveBarActions } from './actionCuration';
import { BAR_ICONS } from './barIcons';
import ToolTooltip from '../shell/ToolTooltip';

/** Gap (px de pantalla) del borde inferior de la barra al tope del box. La corona
 *  del handle de rotación vive en `bboxScreen.top − 29px` (ROTATION_ARM_LENGTH=25
 *  + ROTATE_RADIUS=4); 32 = 29 + 3px de aire → la barra nunca pisa el handle. */
const ROTATE_HANDLE_GAP = 32;
/** Gap del caso below-flip: despeja los handles inferiores (~5px). */
const BAR_GAP = 8;
// ponytail: altura estimada solo para ELEGIR arriba/abajo; el anclaje exacto no
// depende de ella. Subir a medición con ref si el layout real difiere.
const APPROX_BAR_HEIGHT = 40;

export interface FloatingActionBarProps {
  /** showTransformBox (T2): monta SOLO si es true → POINT suprimido por construcción. */
  show: boolean;
  /** transformTool.bbox (T2/F4): anclaje en coords de patrón. */
  bbox: BBox | null;
  pan2D: Point2D;
  zoom2D: number;
  /** transformTool.isDragging (T3): dismiss en cuanto arranca el transform drag. */
  isDragging: boolean;
  /** ctxMenu.visible: dos superficies nunca coexisten. */
  contextMenuOpen: boolean;
  /** calibrationMode !== null (F9): barra suprimida en calibración. */
  calibrationActive: boolean;
  /** Contexto resuelto (selección → piece/multiPiece). null si no hay selección. */
  ctx: CurationCtx | null;
}

export default function FloatingActionBar({
  show, bbox, pan2D, zoom2D, isDragging, contextMenuOpen, calibrationActive, ctx,
}: FloatingActionBarProps) {
  const actions = useMemo(() => (ctx ? resolveBarActions(ctx) : []), [ctx]);

  // Compuerta de montaje: todos los dismiss en un solo lugar.
  if (!show || !bbox || isDragging || contextMenuOpen || calibrationActive || !ctx) return null;
  if (actions.length === 0) return null;

  // Anclaje: box (patrón) → pantalla vía pan/zoom. Coords locales del contenedor
  // .pattern-editor (position:relative; SVG a 0,0).
  const left = pan2D.x + (bbox.x + bbox.width / 2) * zoom2D;
  const boxTop = pan2D.y + bbox.y * zoom2D;
  const boxBottom = pan2D.y + (bbox.y + bbox.height) * zoom2D;
  const flipBelow = boxTop - ROTATE_HANDLE_GAP - APPROX_BAR_HEIGHT < 0;
  const top = flipBelow ? boxBottom + BAR_GAP : boxTop - ROTATE_HANDLE_GAP;
  const transform = flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';

  return (
    <div
      className="floating-action-bar"
      style={{
        position: 'absolute',
        left,
        top,
        transform,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
      }}
    >
      {actions.map((def) => {
        const Icon = BAR_ICONS[def.id];
        const label = typeof def.label === 'function' ? def.label(ctx) : def.label;
        return (
          <ToolTooltip key={def.id} name={label} shortcut={def.shortcut}>
            <button
              type="button"
              className="floating-action-bar__btn"
              aria-label={label}
              onClick={() => def.run(ctx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                padding: 0,
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                color: '#e0e0e0',
                cursor: 'pointer',
              }}
            >
              {Icon && <Icon size={16} />}
            </button>
          </ToolTooltip>
        );
      })}
    </div>
  );
}
