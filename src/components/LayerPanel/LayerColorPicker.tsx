import { useRef, useState } from 'react';

interface LayerColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

/**
 * A compact inline color swatch that opens a native color input on click.
 * Used in the Layer Panel header to set per-layer outline/accent colors.
 */
export default function LayerColorPicker({ color, onChange }: LayerColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  return (
    <span
      className="layer-color-swatch"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: 3,
        background: color,
        border: hovered ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
        cursor: 'pointer',
        flexShrink: 0,
        marginRight: 4,
        verticalAlign: 'middle',
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Layer color: ${color}`}
    >
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        tabIndex={-1}
      />
    </span>
  );
}
