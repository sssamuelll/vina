/**
 * ContextMenu3D — right-click context menu for the 3D Viewport.
 *
 * Shows different options depending on what's under the cursor:
 * - On a garment piece: Select, Reset Position, Pin/Unpin, Properties
 * - On avatar: Toggle Visibility, Measurements, Pose Reset
 * - On empty background: Reset Camera, Toggle Grid, Render Settings
 *
 * CLO3D parity: right-click (without drag) opens context menu.
 */

import { useCallback, useEffect, useRef } from 'react';
import SubMenu from '../shared/SubMenu';
import type { SubMenuItem } from '../shared/SubMenu';
import { displayShortcut } from '../shell/shortcutDisplay';

export interface ContextMenu3DState {
  visible: boolean;
  x: number;
  y: number;
  target: 'piece' | 'avatar' | 'background';
  pieceId?: string;
  pieceName?: string;
}

interface MenuItem {
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  _layerSubmenu?: SubMenuItem[];
}

interface ContextMenu3DProps {
  menu: ContextMenu3DState;
  onClose: () => void;
  onResetCamera?: () => void;
  onToggleAvatar?: () => void;
  onSnapshot?: () => void;
  onSelectPiece?: (pieceId: string) => void;
  onResetArrangement?: () => void;
  onResetPieceArrangement?: (pieceId: string) => void;
  onResetPose?: () => void;
  onShowProperties?: (pieceId: string) => void;
  onZoomToFit?: () => void;
  onCameraPreset?: (preset: string) => void;
  onInspect?: (pieceId: string) => void;
  onDeactivatePiece?: (pieceId: string, active: boolean) => void;
  isPieceActive?: boolean;
  onToggleHide?: (pieceId: string) => void;
  onToggleFlipNormal?: (pieceId: string) => void;
  onShowAll?: () => void;
  onResetAll3D?: () => void;
  isPieceHidden?: boolean;
  isPieceFlipped?: boolean;
  layerProps?: {
    currentLayer?: number;
    currentSublayer?: number;
    onSetLayer: (pieceId: string, layer: number) => void;
    onSetSublayer: (pieceId: string, sublayer: number) => void;
    onCloneToLayer: (pieceId: string, direction: 'over' | 'under') => void;
    onSuperimpose: (pieceId: string, mode: 'over' | 'under' | 'side') => void;
  };
}

export default function ContextMenu3D({
  menu,
  onClose,
  onResetCamera,
  onToggleAvatar,
  onSnapshot,
  onSelectPiece,
  onResetPieceArrangement,
  onResetPose,
  onShowProperties,
  onZoomToFit,
  onCameraPreset,
  onInspect,
  onDeactivatePiece,
  isPieceActive,
  onToggleHide,
  onToggleFlipNormal,
  onShowAll,
  onResetAll3D,
  isPieceHidden,
  isPieceFlipped,
  layerProps,
}: ContextMenu3DProps) {
  const ref = useRef<HTMLDivElement>(null);

  // `onClose` por ref, no en las dependencias: mismo mecanismo que el menú 2D
  // (`PatternEditor/ContextMenu.tsx`) — un Escape real dispara antes el atajo
  // global, que re-renderiza al padre en medio del dispatch y, con `onClose`
  // inline, este listener se quitaba y volvía a registrar sin llegar a correr.
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

  const act = useCallback((fn: () => void) => {
    fn();
    onClose();
  }, [onClose]);

  if (!menu.visible) return null;

  const items: MenuItem[] = [];

  if (menu.target === 'piece' && menu.pieceId) {
    const pid = menu.pieceId;
    items.push({
      label: 'Seleccionar',
      icon: '☐',
      action: () => act(() => onSelectPiece?.(pid)),
    });
    items.push({
      label: 'Restablecer colocación 3D',
      icon: '↩',
      action: () => act(() => onResetPieceArrangement?.(pid)),
    });
    items.push({
      label: isPieceHidden ? 'Mostrar pieza' : 'Ocultar pieza',
      icon: isPieceHidden ? '👁' : '🙈',
      action: () => act(() => onToggleHide?.(pid)),
    });
    items.push({
      label: isPieceFlipped ? 'Restaurar normal' : 'Invertir normal',
      icon: '🔄',
      action: () => act(() => onToggleFlipNormal?.(pid)),
      separator: true,
    });
    items.push({
      label: 'Inspeccionar',
      icon: '🔍',
      action: () => act(() => onInspect?.(pid)),
    });
    items.push({
      label: isPieceActive === false ? 'Activar pieza' : 'Desactivar pieza',
      icon: isPieceActive === false ? '▶' : '⏸',
      action: () => act(() => onDeactivatePiece?.(pid, isPieceActive === false)),
    });
    items.push({
      label: 'Propiedades\u2026',
      icon: '\u2139',
      action: () => act(() => onShowProperties?.(pid)),
      separator: true,
    });

    // Layer submenu
    if (layerProps) {
      const layerItems: SubMenuItem[] = [
        { label: `Cambiar capa... (${layerProps.currentLayer ?? 1})`, action: () => { layerProps.onSetLayer(pid, ((layerProps.currentLayer ?? 1) % 10) + 1); onClose(); } },
        { label: `Cambiar subcapa... (${layerProps.currentSublayer ?? 0})`, action: () => { layerProps.onSetSublayer(pid, ((layerProps.currentSublayer ?? 0) + 1) % 5); onClose(); } },
        { separator: true, label: 'Clonar encima', action: () => { layerProps.onCloneToLayer(pid, 'over'); onClose(); } },
        { label: 'Clonar debajo', action: () => { layerProps.onCloneToLayer(pid, 'under'); onClose(); } },
        { separator: true, label: 'Superponer encima...', action: () => { layerProps.onSuperimpose(pid, 'over'); onClose(); } },
        { label: 'Superponer debajo...', action: () => { layerProps.onSuperimpose(pid, 'under'); onClose(); } },
        { label: 'Superponer al lado...', action: () => { layerProps.onSuperimpose(pid, 'side'); onClose(); } },
      ];
      items.push({ label: 'Capa', icon: '\u{1F4D1}', action: () => {}, _layerSubmenu: layerItems });
    }
  } else if (menu.target === 'avatar') {
    items.push({
      label: 'Mostrar/ocultar avatar',
      icon: '👤',
      shortcut: 'Shift+A',
      action: () => act(() => onToggleAvatar?.()),
    });
    items.push({
      label: 'Restablecer pose',
      icon: '↩',
      action: () => act(() => onResetPose?.()),
    });
  } else {
    // Background — camera presets section
    items.push({
      label: 'Frontal',
      icon: '📷',
      shortcut: 'Num2',
      action: () => act(() => onCameraPreset?.('front')),
    });
    items.push({
      label: 'Trasera',
      icon: '📷',
      shortcut: 'Num8',
      action: () => act(() => onCameraPreset?.('back')),
    });
    items.push({
      label: 'Izquierda',
      icon: '📷',
      shortcut: 'Num6',
      action: () => act(() => onCameraPreset?.('left')),
    });
    items.push({
      label: 'Derecha',
      icon: '📷',
      shortcut: 'Num4',
      action: () => act(() => onCameraPreset?.('right')),
    });
    items.push({
      label: 'Superior',
      icon: '📷',
      shortcut: 'Num5',
      action: () => act(() => onCameraPreset?.('top')),
    });
    items.push({
      label: 'Inferior',
      icon: '📷',
      shortcut: 'Num0',
      action: () => act(() => onCameraPreset?.('bottom')),
      separator: true,
    });
    items.push({
      label: 'Restablecer cámara',
      icon: '🎥',
      action: () => act(() => onResetCamera?.()),
    });
    items.push({
      label: 'Ajustar zoom',
      icon: '🔍',
      action: () => act(() => onZoomToFit?.()),
      separator: true,
    });
    items.push({
      label: 'Mostrar/ocultar avatar',
      icon: '👤',
      shortcut: 'Shift+A',
      action: () => act(() => onToggleAvatar?.()),
    });
    items.push({
      label: 'Mostrar todas las piezas',
      icon: '👁',
      action: () => act(() => onShowAll?.()),
    });
    items.push({
      label: 'Restablecer todo en 3D',
      icon: '↩',
      shortcut: 'Ctrl+F',
      action: () => act(() => onResetAll3D?.()),
      separator: true,
    });
    items.push({
      label: 'Captura',
      icon: '📸',
      shortcut: 'F10',
      action: () => act(() => onSnapshot?.()),
    });
  }

  return (
    <div
      ref={ref}
      className="context-menu context-menu--scroll"
      data-superficie="menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.target === 'piece' && menu.pieceName && (
        <div className="context-menu__header">
          {menu.pieceName}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i}>
          {item._layerSubmenu ? (
            <SubMenu label={item.label} icon={item.icon} items={item._layerSubmenu} />
          ) : (
            <button
              onClick={item.action}
              className="context-menu__item"
            >
              <span className="context-menu__icon">{item.icon}</span>
              <span className="context-menu__label">{item.label}</span>
              {item.shortcut && (
                <span className="context-menu__shortcut">{displayShortcut(item.shortcut)}</span>
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
