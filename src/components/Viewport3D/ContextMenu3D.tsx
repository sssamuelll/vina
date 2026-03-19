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
}

export default function ContextMenu3D({
  menu,
  onClose,
  onResetCamera,
  onToggleAvatar,
  onSnapshot,
  onSelectPiece,
  onResetArrangement,
  onResetPieceArrangement,
  onResetPose,
  onShowProperties,
  onZoomToFit,
  onCameraPreset,
  onInspect,
  onDeactivatePiece,
  isPieceActive,
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
      label: 'Properties…',
      icon: 'ℹ',
      action: () => act(() => onShowProperties?.(pid)),
    });
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
      label: 'Reset 3D Arrangement',
      icon: '↩',
      shortcut: 'Ctrl+F',
      action: () => act(() => onResetArrangement?.()),
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
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 1000,
        minWidth: 180,
        background: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        padding: '4px 0',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontSize: 13,
        color: '#e0e0e0',
        userSelect: 'none',
      }}
    >
      {menu.target === 'piece' && menu.pieceName && (
        <div style={{
          padding: '6px 12px 4px',
          fontSize: 11,
          color: '#888',
          borderBottom: '1px solid #333',
          marginBottom: 2,
        }}>
          {menu.pieceName}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={item.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '6px 12px',
              border: 'none',
              background: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2d2d2d')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ fontSize: 11, color: '#666', marginLeft: 12 }}>{item.shortcut}</span>
            )}
          </button>
          {item.separator && (
            <div style={{ height: 1, background: '#333', margin: '2px 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}
