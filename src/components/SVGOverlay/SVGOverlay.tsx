import React from 'react';
import { Marker, PathCommand } from '../../types/types';

interface SvgOverlayProps {
  width: number;
  height: number;
  markers: Marker[];
  transientPathCommands: PathCommand[];
  onMarkerClick?: (markerId: string, event: React.MouseEvent) => void;
  enableMarkerInteraction?: boolean; // <-- NUEVO prop
}


// Función para convertir pathCommands a cadena para el atributo "d"
const convertPathCommands = (commands: PathCommand[]): string => {
  if (commands.length === 0) return '';
  return commands
    .map(cmd => {
      if (cmd.type === 'R') {
        const [x, y, w, h] = cmd.values;
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
      return `${cmd.type} ${cmd.values.join(' ')}`;
    })
    .join(' ');
};

const SvgOverlay: React.FC<SvgOverlayProps> = ({ width, height, markers, transientPathCommands, onMarkerClick, enableMarkerInteraction }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none', // para que no interfiera con los eventos del canvas
        zIndex: 10,
      }}
    >
      {/* Trazos permanentes */}
      {markers.map(marker => (
  <path
    key={marker.id}
    d={convertPathCommands(marker.pathCommands)}
    fill="none"
    stroke="black"
    strokeWidth="2"
    vectorEffect="non-scaling-stroke"
    style={{
      pointerEvents: enableMarkerInteraction ? 'auto' : 'none',
      cursor: enableMarkerInteraction ? 'pointer' : 'default',
    }}
    onClick={(event) => {
      if (enableMarkerInteraction) onMarkerClick?.(marker.id, event);
    }}
    onMouseEnter={(e) => {
      if (enableMarkerInteraction) e.currentTarget.setAttribute('stroke', '#0D99FF');
    }}
    onMouseLeave={(e) => {
      if (enableMarkerInteraction) e.currentTarget.setAttribute('stroke', 'black');
    }}
  />
))}

      {/* Trazos transitorios (en vivo) */}
      {transientPathCommands.length > 0 && (
        <path
          d={convertPathCommands(transientPathCommands)}
          fill="none"
          stroke="black"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
};

export default SvgOverlay;
