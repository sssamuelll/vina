import type { PathCommand } from '../../types/types';

/**
 * Elipse (y círculo) como contorno cerrado de cuatro cúbicas.
 *
 * No es geometría nueva: vivía privada en `utils/formats/svgImport.ts` desde
 * 2026 para importar `<circle>` y `<ellipse>`, y desde aquí la siguen usando el
 * importador y la herramienta Círculo. La constante `k` es la aproximación
 * clásica de un cuarto de circunferencia con una bézier cúbica.
 *
 * **Cúbicas, nunca el comando `A`.** Medido en el repo: `commandsToShape`
 * (`PieceMesh.tsx:43-88`) maneja M/L/H/V/C/Q/Z y descarta `A` EN SILENCIO, y
 * `arcLength.ts:192` cuenta el arco como cero. Una pieza en arcos se dibujaría
 * en 2D y no existiría en 3D. En cúbicas, además, salen gratis las cotas vivas
 * ('C' está en `COMANDOS_SOPORTADOS`, `cotas.ts:61`) y la autodetección de
 * bordes de `addPiece` (`projectSlice.ts:394`, contorno de ≥3 comandos).
 */
export function ellipseToPath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  const k = 0.5522847498; // magic number for circle approximation
  const ox = rx * k, oy = ry * k;
  return [
    { type: 'M', values: [cx - rx, cy] },
    { type: 'C', values: [cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry] },
    { type: 'C', values: [cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy] },
    { type: 'C', values: [cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry] },
    { type: 'C', values: [cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy] },
    { type: 'Z', values: [] },
  ];
}
