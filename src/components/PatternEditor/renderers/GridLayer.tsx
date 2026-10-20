import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula } from './cuadricula';

interface GridLayerProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
}

/**
 * El papel y su cuadrícula (spec 2026-10-02 «la interfaz en papel» § 4.4).
 *
 * Se pinta FUERA del grupo escalado (espacio de pantalla): las líneas quedan a
 * 1 px nítido a cualquier zoom sin dividir el grosor entre el zoom. Hay un solo
 * paso a la vista, el que da `cuadroDeLaCuadricula()`, y nunca se apaga. Los
 * colores son tokens aplicados por `style`: los atributos de presentación de
 * SVG no leen var().
 */
export default function GridLayer({ zoom2D, pan2D, gridSize, units }: GridLayerProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);

  return (
    <>
      {cuadro && (
        <defs>
          <pattern
            id="grid-cuadro"
            width={cuadro.px}
            height={cuadro.px}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % cuadro.px}
            y={pan2D.y % cuadro.px}
          >
            <path
              d={`M ${cuadro.px} 0 L 0 0 0 ${cuadro.px}`}
              fill="none"
              style={{ stroke: 'var(--grid-2d)' }}
              strokeWidth={1}
            />
          </pattern>
        </defs>
      )}

      {/* El papel */}
      <rect width="100%" height="100%" style={{ fill: 'var(--canvas-2d)' }} />
      {cuadro && <rect width="100%" height="100%" fill="url(#grid-cuadro)" />}
    </>
  );
}
