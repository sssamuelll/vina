import { describe, it, expect } from 'vitest';
import { anchoEstimadoDeChip, separarChips, ALTO_CHIP_PX } from '../cotasGeometry';
import type { Cota } from '../cotas';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F4.
 *
 * Medido en la app viva con una línea interna seleccionada (4 cotas):
 *
 *   "20,4 mm"  x=367 y=204 w=64 h=22
 *   "20,4 mm"  x=367 y=214 w=64 h=22   ← 781 px² encima del anterior (93 %)
 *   "228 mm"   x=408 y=227 w=56 h=22   ← 205 px² encima de un "20,4 mm"
 *   "0°"       x=493 y=227 w=29 h=22
 *
 * Dos chips idénticos, uno tapando al otro: María no puede saber cuál de las
 * dos distancias está editando, ni clicar el de abajo.
 *
 * La causa está a la vista: `chipScreenPosition` recibe UNA cota y no sabe de
 * las demás (`cotasGeometry.ts:11`). Y sin embargo el arreglo ya está escrito
 * en ese mismo archivo, para un caso: `pairOffset` separa Largo de Ángulo
 * ±36 px **sobre la tangente**, y su comentario dice por qué esa dirección y no
 * otra — «conserva esa ancla visual». Falta generalizarlo.
 *
 * Por qué sobre la tangente y nunca hacia fuera: el chip cae en el punto medio
 * del hilo que dibuja `CotaLines`, y esa coincidencia es TODA el ancla que hay
 * (no existe línea guía). Empujarlo por `outward` lo despega del hilo;
 * deslizarlo a lo largo del hilo lo mantiene encima.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F4.
 */

const cota = (id: string, label: string, a: [number, number], b: [number, number], kind: Cota['kind'] = 'borde'): Cota => ({
  id, kind, label, valueMm: 0, unit: 'mm', min: 0, max: 1000, primary: false,
  a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
  outward: { x: 0, y: -1 },
  apply: () => null,
});

type Puesto = { cota: Cota; left: number; top: number };
type Rect = { left: number; top: number; right: number; bottom: number };

/** El chip se dibuja centrado en (left, top): `transform: translate(-50%,-50%)`. */
function rect(p: { left: number; top: number }, label: string): Rect {
  const w = anchoEstimadoDeChip(label);
  return {
    left: p.left - w / 2, right: p.left + w / 2,
    top: p.top - ALTO_CHIP_PX / 2, bottom: p.top + ALTO_CHIP_PX / 2,
  };
}

function solape(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

function paresQueSePisan(items: Puesto[], salida: Array<{ left: number; top: number }>) {
  const rs = items.map((it, i) => ({ label: it.cota.label, r: rect(salida[i], it.cota.label) }));
  const malos: string[] = [];
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const s = solape(rs[i].r, rs[j].r);
      if (s > 0) malos.push(`"${rs[i].label}" ↔ "${rs[j].label}" (${Math.round(s)} px²)`);
    }
  }
  return malos;
}

/** El caso medido: la línea interna vertical con sus cuatro cotas. */
const CASO_MEDIDO: Puesto[] = [
  // Las dos distancias al borde: segmentos verticales, tangente (0,1).
  { cota: cota('b1', '20,4 mm', [100, 100], [100, 120]), left: 399, top: 215 },
  { cota: cota('b2', '20,4 mm', [100, 140], [100, 160]), left: 399, top: 225 },
  // Largo y ángulo del tramo: segmento horizontal, tangente (1,0).
  { cota: cota('t1', '228 mm', [100, 200], [328, 200], 'tramo-largo'), left: 436, top: 238 },
  { cota: cota('t2', '0°', [100, 200], [328, 200], 'tramo-angulo'), left: 507, top: 238 },
];

describe('F4 — dos cotas nunca se pisan', () => {
  it('el caso medido queda limpio', () => {
    const salida = separarChips(CASO_MEDIDO);
    expect(paresQueSePisan(CASO_MEDIDO, salida)).toEqual([]);
  });

  it('dos chips exactamente encima se separan', () => {
    const items: Puesto[] = [
      { cota: cota('a', '20,4 mm', [0, 0], [0, 50]), left: 300, top: 200 },
      { cota: cota('b', '20,4 mm', [0, 60], [0, 110]), left: 300, top: 200 },
    ];
    expect(paresQueSePisan(items, separarChips(items))).toEqual([]);
  });

  it('cinco chips amontonados en el mismo punto también', () => {
    const items: Puesto[] = Array.from({ length: 5 }, (_, i) => ({
      cota: cota(`c${i}`, '12,5 mm', [0, i * 10], [0, i * 10 + 5]),
      left: 400, top: 300,
    }));
    expect(paresQueSePisan(items, separarChips(items))).toEqual([]);
  });
});

describe('F4 — el chip no se despega de su hilo', () => {
  it('cada chip se mueve SOLO a lo largo de su propia línea de cota', () => {
    const items: Puesto[] = [
      { cota: cota('a', '20,4 mm', [0, 0], [0, 50]), left: 300, top: 200 },
      { cota: cota('b', '20,4 mm', [0, 60], [0, 110]), left: 300, top: 205 },
    ];
    const salida = separarChips(items);
    items.forEach((it, i) => {
      const dx = salida[i].left - it.left;
      const dy = salida[i].top - it.top;
      const t = { x: it.cota.b.x - it.cota.a.x, y: it.cota.b.y - it.cota.a.y };
      const n = Math.hypot(t.x, t.y);
      // Componente perpendicular a la tangente: tiene que ser cero.
      const perpendicular = Math.abs((dx * -t.y + dy * t.x) / n);
      expect(perpendicular, `el chip "${it.cota.label}" se salió de su línea ${perpendicular.toFixed(2)} px`)
        .toBeLessThan(0.001);
    });
  });

  it('el desplazamiento es acotado: nadie sale despedido', () => {
    const items: Puesto[] = Array.from({ length: 6 }, (_, i) => ({
      cota: cota(`c${i}`, '999,9 mm', [0, i], [0, i + 40]),
      left: 400, top: 300,
    }));
    const salida = separarChips(items);
    salida.forEach((p, i) => {
      const d = Math.hypot(p.left - items[i].left, p.top - items[i].top);
      expect(d, `el chip ${i} se fue ${Math.round(d)} px`).toBeLessThanOrEqual(160);
    });
  });
});

describe('F4 — la pasada no toca lo que ya estaba bien', () => {
  it('chips que no se pisan se quedan donde estaban', () => {
    const items: Puesto[] = [
      { cota: cota('a', '100 mm', [0, 0], [100, 0]), left: 200, top: 200 },
      { cota: cota('b', '200 mm', [0, 0], [100, 0]), left: 600, top: 400 },
    ];
    expect(separarChips(items)).toEqual([{ left: 200, top: 200 }, { left: 600, top: 400 }]);
  });

  it('con una sola cota devuelve exactamente su posición', () => {
    const items: Puesto[] = [{ cota: cota('a', '228 mm', [0, 0], [228, 0]), left: 300, top: 100 }];
    expect(separarChips(items)).toEqual([{ left: 300, top: 100 }]);
  });

  it('sin cotas devuelve una lista vacía', () => {
    expect(separarChips([])).toEqual([]);
  });

  it('es determinista: dos pasadas iguales dan lo mismo', () => {
    expect(separarChips(CASO_MEDIDO)).toEqual(separarChips(CASO_MEDIDO));
  });

  it('no depende del orden en que lleguen las cotas', () => {
    const alReves = [...CASO_MEDIDO].reverse();
    const a = separarChips(CASO_MEDIDO).map((p, i) => [CASO_MEDIDO[i].cota.id, p] as const);
    const b = separarChips(alReves).map((p, i) => [alReves[i].cota.id, p] as const);
    const porId = (xs: typeof a) => Object.fromEntries(xs.map(([id, p]) => [id, p]));
    expect(porId(a)).toEqual(porId(b));
  });
});

describe('el ancho estimado del chip es creíble', () => {
  // Medidos en la app: "228 mm" 56 px, "20,4 mm" 64 px, "0°" 29 px, alto 22 px.
  it.each([['228 mm', 56], ['20,4 mm', 64], ['0°', 29]])(
    '"%s" mide ~%s px',
    (label, medido) => {
      const est = anchoEstimadoDeChip(label as string);
      expect(Math.abs(est - (medido as number)), `estimé ${est} y medí ${medido}`).toBeLessThanOrEqual(10);
    },
  );

  it('el alto es el del chip real', () => {
    expect(ALTO_CHIP_PX).toBe(22);
  });
});
