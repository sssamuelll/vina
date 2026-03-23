import { useState, useRef, useEffect } from 'react';

const PRESET_COLORS = [
  '#4ade80', '#60a5fa', '#f97316', '#a78bfa',
  '#f43f5e', '#facc15', '#2dd4bf', '#e879f9',
];

interface LayerColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export default function LayerColorPicker({ color, onChange }: LayerColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="layer-color-dot"
        style={{ backgroundColor: color }}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title="Change layer color"
      />
      {open && (
        <div className="layer-color-popover">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`layer-color-swatch${c === color ? ' active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={(e) => {
                e.stopPropagation();
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
