import { useCallback, useEffect, useRef } from 'react';

export interface MarkerContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  pieceIndex: number | null;
  pieceName?: string;
}

interface MarkerContextMenuProps {
  menu: MarkerContextMenuState;
  onClose: () => void;
  onRotate: (degrees: number) => void;
  onFlipH?: () => void;
  onSelect?: () => void;
}

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  separator?: boolean;
}

export default function MarkerContextMenu({
  menu, onClose, onRotate, onFlipH, onSelect,
}: MarkerContextMenuProps) {
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

  if (!menu.visible || menu.pieceIndex === null) return null;

  const items: MenuItem[] = [
    { label: 'Rotate 90\u00B0', icon: '\u21BB', action: () => act(() => onRotate(90)) },
    { label: 'Rotate 180\u00B0', icon: '\u21BB', action: () => act(() => onRotate(180)) },
    { label: 'Rotate -90\u00B0', icon: '\u21BA', action: () => act(() => onRotate(-90)), separator: true },
    { label: 'Flip Horizontal', icon: '\u2194', action: () => act(() => onFlipH?.()), separator: true },
    { label: 'Select', icon: '\u2610', action: () => act(() => onSelect?.()) },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 10000,
        minWidth: 160,
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
      {menu.pieceName && (
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
          </button>
          {item.separator && (
            <div style={{ height: 1, background: '#333', margin: '2px 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}
