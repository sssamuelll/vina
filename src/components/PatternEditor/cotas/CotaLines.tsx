import type { Cota } from './cotas';
import { COTA_OFFSET_PX } from './cotasGeometry';

const TICK_PX = 5;

/**
 * Líneas de cota con ticks (spec 2026-08-30 § 5.1-5.2), dentro del grupo
 * pan-zoom: aire, grosor y ticks constantes en pantalla (÷ zoom), como el
 * readout de `PolyPenToolOverlay`. Sin punteros: la tinta no estorba al
 * lienzo. `stroke` es un token, no un literal.
 */
export default function CotaLines({ cotas, zoom2D }: { cotas: Cota[]; zoom2D: number }) {
  const z = zoom2D || 1;
  const off = COTA_OFFSET_PX / z;
  const tick = TICK_PX / z;
  return (
    <g className="cota-lineas" pointerEvents="none">
      {cotas.map((c) => {
        const ax = c.a.x + c.outward.x * off;
        const ay = c.a.y + c.outward.y * off;
        const bx = c.b.x + c.outward.x * off;
        const by = c.b.y + c.outward.y * off;
        // el tick es perpendicular a la línea de cota = paralelo a `outward`
        const tx = c.outward.x * tick;
        const ty = c.outward.y * tick;
        return (
          <g key={c.id} className="cota-linea" pointerEvents="none">
            <line className="cota-linea__hilo" x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
            <line className="cota-linea__tick" x1={ax - tx} y1={ay - ty} x2={ax + tx} y2={ay + ty} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
            <line className="cota-linea__tick" x1={bx - tx} y1={by - ty} x2={bx + tx} y2={by + ty} stroke="var(--cota-line-2d)" strokeWidth={1 / z} />
          </g>
        );
      })}
    </g>
  );
}
