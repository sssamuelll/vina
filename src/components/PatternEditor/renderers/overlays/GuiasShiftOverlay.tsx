import type { GuiaShift, GuiasShift } from '../../restriccionShift';
import { polarPoint } from '../../polyPenGeometry';
import { screenToPatternLength } from '../../../../utils/geometry';

/** Largo de cada rayo en píxeles de pantalla: cruza el lienzo visible a cualquier zoom. */
const LARGO_PX = 2000;

interface Props {
  guias: GuiasShift | null;
  zoom2D: number;
}

/**
 * Las guías de Shift (spec 2026-09-23 § 4.1): la activa, por donde va la línea,
 * con el acento de la goma; la tenue, adonde iría si se cambiara de guía ahora,
 * con la tinta de construcción, que se queda detrás. Solo rayos: el punto y los
 * ángulos los decide `guiasShift`, la misma función con la que la herramienta
 * coloca (maria-196). Punteadas y más espaciadas que la goma, para no
 * confundirse con ella donde se solapan.
 */
export default function GuiasShiftOverlay({ guias, zoom2D }: Props) {
  if (!guias?.activa) return null;
  const largo = screenToPatternLength(LARGO_PX, zoom2D);
  const rayo = (guia: GuiaShift, cual: 'activa' | 'tenue') => {
    const fin = polarPoint(guia.desde, largo, guia.angleDeg);
    return (
      <line
        data-guia-shift={cual}
        x1={guia.desde.x}
        y1={guia.desde.y}
        x2={fin.x}
        y2={fin.y}
        stroke={cual === 'activa' ? 'var(--accent-2d)' : 'var(--ink-on-light-3)'}
        strokeWidth={1 / zoom2D}
        strokeDasharray={`${2 / zoom2D} ${4 / zoom2D}`}
      />
    );
  };
  return (
    <g pointerEvents="none">
      {guias.tenue && rayo(guias.tenue, 'tenue')}
      {rayo(guias.activa, 'activa')}
    </g>
  );
}
