/**
 * SurfaceModePill — «Texturizado ▾», el selector de 9 modos de superficie del
 * 3D (spec 2026-06-04 display-toggles-resurface §3).
 *
 * Desde P5 (spec 2026-10-02 «la interfaz en papel» § 4.2) vive en el grupo de la
 * prenda de la barra superior, junto a «IA»: ya no es una píldora absoluta sobre
 * el visor. El disparador es un botón de texto con el estilo de «Mostrar»; el
 * menú de nueve cuadros (3×3) cuelga de <body> por portal y es papel (contrato
 * § 2, «todo portal nace papel»), anclado bajo el borde derecho del disparador.
 * Como cuelga del final de <body>, Tab desde el disparador no llegaría a las
 * opciones: al abrirse el foco entra al modo que está puesto.
 *
 * Sigue siendo un asunto distinto de RenderSettingsPanel (escena, entorno,
 * exportación): esto solo escribe simulation.surfaceMode3D.
 */
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Image, Droplets, Box, Layers, Square, Scan, Circle, CircleDot, ImagePlus, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import type { RootState } from '../../store';
import { setSurfaceMode3D } from '../../store/simulationSlice';
import type { SurfaceMode3D } from '../../store/simulationSlice';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
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
  const [ancla, setAncla] = useState({ right: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // El foco entra al menú, al modo puesto (o al primero).
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    (menu?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? menu?.querySelector<HTMLElement>('button'))?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // El menú se ancla al abrirse; si la ventana cambia de tamaño, se va con el botón.
    const cerrar = () => setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', cerrar);
    };
  }, [open]);

  // Esc lo cierra antes que la barra de IA, un panel y la selección: un peldaño
  // de la escalera de lo que se llama (spec 2026-10-02 § 6.2). El foco vuelve al disparador.
  usePeldanoDeEscape('superficie', 'menu', open, () => {
    if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setOpen(false);
  });

  const current = MODES.find(m => m.mode === surfaceMode3D) ?? MODES[0];

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={`surface-pill__trigger grupo-del-patron__plegado${open ? ' surface-pill__trigger--open' : ''}`}
        aria-label={`Modo de superficie: ${current.label}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          if (open) { setOpen(false); return; }
          const r = e.currentTarget.getBoundingClientRect();
          setAncla({ right: window.innerWidth - r.right, top: r.bottom + 4 });
          setOpen(true);
        }}
      >
        {current.label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="surface-pill__flyout"
          role="group"
          aria-label="Modo de superficie"
          data-superficie="menu"
          data-material="papel"
          data-botonera
          style={{ right: ancla.right, top: ancla.top }}
        >
          {MODES.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              className={`surface-pill__option ${mode === surfaceMode3D ? 'surface-pill__option--active' : ''}`}
              aria-label={label}
              aria-pressed={mode === surfaceMode3D}
              onClick={() => { dispatch(setSurfaceMode3D(mode)); botonRef.current?.focus(); setOpen(false); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
