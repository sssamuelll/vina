import { Marker, PathCommand, Comment } from '../types/types';
import ReactDOMServer from 'react-dom/server';

export const pathCommandsToSVG = (pathCommands: PathCommand[], width: number, height: number): string => {
  if (pathCommands.length === 0) return '';

  const pathD = pathCommands
    .map(cmd => {
      if (cmd.type === 'R') {
        const [x, y, w, h] = cmd.values;
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
      return `${cmd.type} ${cmd.values.join(' ')}`;
    })
    .join(' ');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <path d="${pathD}" 
            fill="none" 
            stroke="black" 
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="vector-effect: non-scaling-stroke;"/>
    </svg>
  `.trim();
};


export const svgToDataUrl = (
  svgComponent: React.ReactNode,
  width = 24,
  height = 24,
  hotspotX = 0,
  hotspotY = 0
): string => {
  const svgString = ReactDOMServer.renderToStaticMarkup(
    <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg">
      {svgComponent}
    </svg>
  );
  const encodedSvg = encodeURIComponent(svgString)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `url("data:image/svg+xml;utf8,${encodedSvg}") ${hotspotX} ${hotspotY}, auto`;
};

export const nameFirstLetter = ( name: string ) => name.charAt(0).toUpperCase();

export function optimizePath(pathCommands: PathCommand[]): PathCommand[] {
  if (pathCommands.length < 3) return pathCommands;
  
  const optimized: PathCommand[] = [pathCommands[0]];
  function calculateDirection(start: PathCommand, end: PathCommand): string {
    const dx = end.values[0] - start.values[0];
    const dy = end.values[1] - start.values[1];
    const angle = Math.atan2(dy, dx);
    return angle.toString();
  }
  let lastDirection = calculateDirection(pathCommands[0], pathCommands[1]);
  
  for (let i = 1; i < pathCommands.length - 1; i++) {
    const currentDirection = calculateDirection(pathCommands[i], pathCommands[i + 1]);
    if (currentDirection !== lastDirection) {
      optimized.push(pathCommands[i]);
      lastDirection = currentDirection;
    }
  }
  
  optimized.push(pathCommands[pathCommands.length - 1]);
  return optimized;
}

export const drawHighlight = (ctx: CanvasRenderingContext2D, commands: PathCommand[]) => {
  ctx.strokeStyle = '#0D99FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  commands.forEach(cmd => {
    if (cmd.type === 'R') {
      const [x, y, width, height] = cmd.values;
      ctx.rect(x, y, width, height);
    } else if (cmd.type === 'M') {
      ctx.moveTo(cmd.values[0], cmd.values[1]);
    } else if (cmd.type === 'L') {
      ctx.lineTo(cmd.values[0], cmd.values[1]);
    }
  });
  ctx.stroke();
};

export const isPointInPolygon = (
  point: { x: number; y: number },
  vertices: { x: number; y: number }[]
): boolean => {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
                      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export function isPointInMarker(
  point: { x: number; y: number },
  marker: { type: string; pathCommands: PathCommand[] },
  padding: number = 5 // margen extra en píxeles
): boolean {
  if (marker.type === 'rectangulo') {
    const cmd = marker.pathCommands.find(cmd => cmd.type === 'R');
    if (cmd) {
      const [x, y, w, h] = cmd.values;
      // Se añade el padding a cada lado
      return (
        point.x >= x - padding &&
        point.x <= x + w + padding &&
        point.y >= y - padding &&
        point.y <= y + h + padding
      );
    }
  } else if (marker.type === 'poligono') {
    const vertices = marker.pathCommands
      .filter(cmd => cmd.type === 'M' || cmd.type === 'L')
      .map(cmd => ({ x: cmd.values[0], y: cmd.values[1] }));
    // Primero, comprobamos si el punto está dentro del polígono
    if (isPointInPolygon(point, vertices)) return true;

    // Si no está dentro, comprobamos si se encuentra cerca de alguno de sus bordes
    let minDistance = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      const d = distancePointToSegment(
        point.x,
        point.y,
        vertices[i].x,
        vertices[i].y,
        vertices[next].x,
        vertices[next].y
      );
      if (d < minDistance) minDistance = d;
    }
    return minDistance <= padding;
  }
  return false;
}


function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export const drawCommentBubble = (ctx: CanvasRenderingContext2D, marker: Marker, comments: Comment[]) => {
  const markerComments = comments.filter(c => c.markerId === marker.id);
  if (markerComments.length > 0) {
    const initial = markerComments[0].user.charAt(0).toUpperCase();
    const cmd = marker.pathCommands[0]; // Asumimos que el primer comando es 'M' o 'R'
    let x, y;
    if (cmd.type === 'M' || cmd.type === 'L') {
      x = cmd.values[0];
      y = cmd.values[1];
    } else if (cmd.type === 'R') {
      x = cmd.values[0];
      y = cmd.values[1];
    } else {
      return; // Otros tipos no soportados por ahora
    }
    ctx.fillStyle = '#FFCD29';
    ctx.beginPath();
    ctx.arc(x + 10, y - 10, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x + 10, y - 10);
  }
};