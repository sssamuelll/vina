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

  if (menu.target === 'piece' && menu.pieceId) {
    const pid = menu.pieceId;
    items.push({
      label: 'Select',
      icon: '☐',
      action: () => act(() => onSelectPiece?.(pid)),
    });
    items.push({
      label: 'Reset 3D Arrangement',
      icon: '↩',
      action: () => act(() => onResetPieceArrangement?.(pid)),
    });
    items.push({
      label: isPieceHidden ? 'Show Piece' : 'Hide Piece',
      icon: isPieceHidden ? '👁' : '🙈',
      action: () => act(() => onToggleHide?.(pid)),
    });
    items.push({
      label: isPieceFlipped ? 'Unflip Normal' : 'Flip Normal',
      icon: '🔄',
      action: () => act(() => onToggleFlipNormal?.(pid)),
      separator: true,
    });
    items.push({
      label: 'Inspect',
      icon: '🔍',
      action: () => act(() => onInspect?.(pid)),
    });
    items.push({
      label: isPieceActive === false ? 'Activate Piece' : 'Deactivate Piece',
      icon: isPieceActive === false ? '▶' : '⏸',
      action: () => act(() => onDeactivatePiece?.(pid, isPieceActive === false)),
    });
    items.push({
      label: 'Properties\u2026',
      icon: '\u2139',
      action: () => act(() => onShowProperties?.(pid)),
      separator: true,
    });

    // Layer submenu
    if (layerProps) {
      const layerItems: SubMenuItem[] = [
        { label: `Set Layer... (${layerProps.currentLayer ?? 1})`, action: () => { layerProps.onSetLayer(pid, ((layerProps.currentLayer ?? 1) % 10) + 1); onClose(); } },
        { label: `Set Sublayer... (${layerProps.currentSublayer ?? 0})`, action: () => { layerProps.onSetSublayer(pid, ((layerProps.currentSublayer ?? 0) + 1) % 5); onClose(); } },
        { separator: true, label: 'Clone Above', action: () => { layerProps.onCloneToLayer(pid, 'over'); onClose(); } },
        { label: 'Clone Below', action: () => { layerProps.onCloneToLayer(pid, 'under'); onClose(); } },
        { separator: true, label: 'Superimpose Over...', action: () => { layerProps.onSuperimpose(pid, 'over'); onClose(); } },
        { label: 'Superimpose Under...', action: () => { layerProps.onSuperimpose(pid, 'under'); onClose(); } },
        { label: 'Superimpose Side...', action: () => { layerProps.onSuperimpose(pid, 'side'); onClose(); } },
      ];
      items.push({ label: 'Layer', icon: '\u{1F4D1}', action: () => {}, _layerSubmenu: layerItems });
    }
  } else if (menu.target === 'avatar') {
    items.push({
      label: 'Toggle Avatar',
      icon: '👤',
      shortcut: 'Shift+A',
      action: () => act(() => onToggleAvatar?.()),
    });
    items.push({
      label: 'Reset Pose',
      icon: '↩',
      action: () => act(() => onResetPose?.()),
    });
  } else {
    // Background — camera presets section
    items.push({
      label: 'Front',
      icon: '📷',
      shortcut: 'Num2',
      action: () => act(() => onCameraPreset?.('front')),
    });
    items.push({
      label: 'Back',
      icon: '📷',
      shortcut: 'Num8',
      action: () => act(() => onCameraPreset?.('back')),
    });
    items.push({
      label: 'Left',
      icon: '📷',
      shortcut: 'Num6',
      action: () => act(() => onCameraPreset?.('left')),
    });
    items.push({
      label: 'Right',
      icon: '📷',
      shortcut: 'Num4',
      action: () => act(() => onCameraPreset?.('right')),
    });
    items.push({
      label: 'Top',
      icon: '📷',
      shortcut: 'Num5',
      action: () => act(() => onCameraPreset?.('top')),
    });
    items.push({
      label: 'Bottom',
      icon: '📷',
      shortcut: 'Num0',
      action: () => act(() => onCameraPreset?.('bottom')),
      separator: true,
    });
    items.push({
      label: 'Reset Camera',
      icon: '🎥',
      action: () => act(() => onResetCamera?.()),
    });
    items.push({
      label: 'Zoom to Fit',
      icon: '🔍',
      action: () => act(() => onZoomToFit?.()),
      separator: true,
    });
    items.push({
      label: 'Toggle Avatar',
      icon: '👤',
      shortcut: 'Shift+A',
      action: () => act(() => onToggleAvatar?.()),
    });
    items.push({
      label: 'Show All Pieces',
      icon: '👁',
      action: () => act(() => onShowAll?.()),
    });
    items.push({
      label: 'Reset All 3D',
      icon: '↩',
      shortcut: 'Ctrl+F',
      action: () => act(() => onResetAll3D?.()),
      separator: true,
    });
    items.push({
      label: 'Snapshot',
      icon: '📸',
      shortcut: 'F10',
      action: () => act(() => onSnapshot?.()),
    });
  }

  return (
    <div
      ref={ref}
      className="context-menu"
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
