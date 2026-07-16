/**
 * SurfaceModePill — floating 9-way surface-mode picker for the 3D viewport.
 *
 * Collapsed: one pill button showing the current mode (icon + label).
 * Open: a 3×3 flyout grid of all modes. Outside-mousedown + Escape close;
 * the trigger lives inside the wrapper ref so opening never self-closes
 * (DockToolPicker pattern). Distinct concern from RenderSettingsPanel
 * (scene/environment/export) — this only sets simulation.surfaceMode3D.
 */
import { useRef, useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Image, Droplets, Box, Layers, Square, Scan, Circle, CircleDot, ImagePlus,
  type LucideIcon,
} from 'lucide-react';
import type { RootState } from '../../store';
import { setSurfaceMode3D } from '../../store/simulationSlice';
import type { SurfaceMode3D } from '../../store/simulationSlice';
import './SurfaceModePill.css';

interface ModeDef {
  mode: SurfaceMode3D;
  label: string;
  icon: LucideIcon;
}

// Same inventory + icons the legacy DisplayBar3D exposed (deleted 2026-06-04).
const MODES: ModeDef[] = [
  { mode: 'textured', label: 'Texturizado', icon: Image },
  { mode: 'translucent', label: 'Translúcido', icon: Droplets },
  { mode: 'mesh', label: 'Malla', icon: Box },
  { mode: 'thick', label: 'Con grosor', icon: Layers },
  { mode: 'flat', label: 'Plano', icon: Square },
  { mode: 'xray', label: 'Rayos X', icon: Scan },
  { mode: 'shaded', label: 'Sombreado', icon: Circle },
  { mode: 'shaded-wire', label: 'Sombreado + alambre', icon: CircleDot },
  { mode: 'textured-wire', label: 'Texturizado + alambre', icon: ImagePlus },
];

export default function SurfaceModePill() {
  const dispatch = useDispatch();
  const surfaceMode3D = useSelector((s: RootState) => s.simulation.surfaceMode3D);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = MODES.find(m => m.mode === surfaceMode3D) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={wrapperRef} className="surface-pill">
      <button
        className={`surface-pill__trigger ${open ? 'surface-pill__trigger--open' : ''}`}
        aria-label={`Modo de superficie: ${current.label}`}
        onClick={() => setOpen(o => !o)}
      >
        <CurrentIcon size={14} />
        <span>{current.label}</span>
      </button>
      {open && (
        <div className="surface-pill__flyout" role="group" aria-label="Modo de superficie">
          {MODES.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              className={`surface-pill__option ${mode === surfaceMode3D ? 'surface-pill__option--active' : ''}`}
              aria-label={label}
              aria-pressed={mode === surfaceMode3D}
              onClick={() => { dispatch(setSurfaceMode3D(mode)); setOpen(false); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
