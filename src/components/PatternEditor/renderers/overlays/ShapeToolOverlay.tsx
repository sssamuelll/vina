import { Point2D, UnitSystem } from '../../../../types/types';
import { formatDimension } from '../../../../utils/units';

interface ShapeToolOverlayProps {
  zoom2D: number;
  units: string;
  /** 'rect' para Rectángulo, 'elipse' para Círculo, 'triangulo' para Triángulo. */
  figura?: 'rect' | 'elipse' | 'triangulo';
  /** La CAJA de la figura en curso; la elipse se dibuja inscrita en ella.
   *  El triángulo no la usa para dibujar (usa `puntos`), pero la sigue
   *  necesitando aquí ninguno de los dos: puede llegar `null`. */
  preview: { x: number; y: number; width: number; height: number } | null;
  /** Los tres vértices en curso; solo cuando `figura === 'triangulo'`. */
  puntos?: [Point2D, Point2D, Point2D] | null;
  dimensions: { width: number; height: number; center: Point2D } | null;
}

/**
 * Vista previa de las tres herramientas que dibujan una pieza arrastrando:
 * Rectángulo, Círculo y Triángulo (#1111). Un solo componente a propósito — el
 * trazo punteado y la píldora de medidas son la misma promesa visual, y
 * duplicarlos era duplicar también los cuatro colores que la ley de
 * materiales cuenta.
 */
export default function ShapeToolOverlay({ zoom2D, units, figura = 'rect', preview, puntos, dimensions }: ShapeToolOverlayProps) {
  const trazo = {
    fill: 'rgba(74, 158, 255, 0.15)',
    stroke: '#4a9eff',
    strokeWidth: 1.5 / zoom2D,
    strokeDasharray: `${4 / zoom2D}`,
  };

  return (
    <>
      {figura === 'triangulo'
        ? puntos && <polygon points={puntos.map((p) => `${p.x},${p.y}`).join(' ')} {...trazo} />
        : preview && (figura === 'elipse' ? (
          <ellipse
            cx={preview.x + preview.width / 2}
            cy={preview.y + preview.height / 2}
            rx={preview.width / 2}
            ry={preview.height / 2}
            {...trazo}
          />
        ) : (
          <rect x={preview.x} y={preview.y} width={preview.width} height={preview.height} {...trazo} />
        ))}

      {dimensions && (() => {
        const dimText = `${formatDimension(dimensions.width, units as UnitSystem)} × ${formatDimension(dimensions.height, units as UnitSystem)}`;
        const charWidth = 5.5;
        const pillWidth = Math.max(60, dimText.length * charWidth + 16);
        return (
          <g transform={`translate(${dimensions.center.x}, ${dimensions.center.y})`}>
            <rect
              x={-pillWidth / 2 / zoom2D} y={-8 / zoom2D}
              width={pillWidth / zoom2D} height={16 / zoom2D}
              rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
            />
            <text
              textAnchor="middle" dominantBaseline="central"
              fill="#fff" fontSize={10 / zoom2D} pointerEvents="none"
            >
              {dimText}
            </text>
          </g>
        );
      })()}
    </>
  );
}
