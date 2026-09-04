import { describe, it, expect } from 'vitest';
import { generateRulerTicks } from '../rulerTicks';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F6.
 *
 * Medido en la app viva con el patrón de María (5 piezas) a 1366×768 en vista
 * dividida: **22 de 61 etiquetas de la regla pisan a su vecina** (46 de 61 a
 * 1280×720). Al zoom con el que la app encuadra el patrón, las negativas
 * forman la tira ilegible "-1200110010009008007…".
 *
 * La causa está a la vista en `rulerTicks.ts`: el paso menor SÍ tiene guarda
 * (`minMinorGapPx`, las marcas menores se suprimen si se amontonan), pero el
 * paso MAYOR —el único que lleva rótulo— está clavado en `minorPerMajor = 10`.
 * A zoom 0,244 eso son 24,4 px entre rótulos de ~27 px de ancho.
 *
 * La regla que falta, ejecutable: **dos rótulos consecutivos nunca están más
 * cerca que el ancho de un rótulo.** El paso mayor escala por la escalera
 * 1-2-5 hasta cumplirlo, igual que escala cualquier regla de CAD.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F6.
 */

/**
 * Separación mínima entre rótulos, en px. El rótulo más ancho que se ve de
 * verdad es "-1200" en mm: 5 glifos de la monoespaciada a 9 px ≈ 27 px. 44 px
 * deja ~17 px de aire entre dos rótulos contiguos.
 */
const MIN_GAP_PX = 44;

/** Los rótulos que de verdad se pintan, ordenados a lo largo de la regla. */
function rotulos(params: Parameters<typeof generateRulerTicks>[0]) {
  return generateRulerTicks(params)
    .filter((t) => t.label !== null)
    .sort((a, b) => a.posPx - b.posPx);
}

/** El hueco más chico entre dos rótulos contiguos (Infinity si hay 0 o 1). */
function huecoMinimo(params: Parameters<typeof generateRulerTicks>[0]) {
  const ts = rotulos(params);
  let min = Infinity;
  for (let i = 1; i < ts.length; i++) min = Math.min(min, ts[i].posPx - ts[i - 1].posPx);
  return min;
}

describe('F6 — los rótulos de la regla nunca se pisan', () => {
  // El caso exacto que se midió: encuadre del patrón de María en el panel 2D
  // de una vista dividida a 1366 de ancho. 2800 mm repartidos en 683 px.
  const MARIA = {
    lengthPx: 683,
    panPx: 293,
    zoom2D: 0.244,
    gridSizeMm: 10,
    units: 'cm' as const,
  };

  it('el caso medido: al encuadrar el patrón de María los rótulos siguen legibles', () => {
    expect(huecoMinimo(MARIA)).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('el caso medido en mm, que da los rótulos más anchos ("-1200")', () => {
    expect(huecoMinimo({ ...MARIA, units: 'mm' })).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it.each([0.05, 0.1, 0.15, 0.244, 0.4, 0.6, 0.8, 1, 1.5, 2, 4, 10])(
    'a zoom %s tampoco',
    (zoom2D) => {
      expect(huecoMinimo({ ...MARIA, lengthPx: 1366, zoom2D })).toBeGreaterThanOrEqual(MIN_GAP_PX);
    },
  );

  it.each([1, 5, 10, 20, 25])(
    'con cuadrícula de %s mm tampoco (el paso menor no manda sobre el rótulo)',
    (gridSizeMm) => {
      expect(huecoMinimo({ ...MARIA, gridSizeMm })).toBeGreaterThanOrEqual(MIN_GAP_PX);
    },
  );

  it('con la regla vertical de una laptop de 643 px tampoco', () => {
    expect(huecoMinimo({ ...MARIA, lengthPx: 643, zoom2D: 0.244 })).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });
});

describe('F6 — ralear no puede vaciar la regla', () => {
  // El arreglo barato y equivocado sería quitar rótulos hasta que no se pisen.
  // Una regla sin números no es una regla: a cualquier zoom usable tiene que
  // quedar más de un rótulo a la vista para poder leer una distancia.
  it.each([0.1, 0.244, 0.5, 1, 2])('a zoom %s quedan al menos 3 rótulos a la vista', (zoom2D) => {
    expect(rotulos({ lengthPx: 1366, panPx: 300, zoom2D, gridSizeMm: 10, units: 'cm' }).length)
      .toBeGreaterThanOrEqual(3);
  });

  it('los rótulos siguen cayendo en múltiplos redondos del paso de cuadrícula', () => {
    for (const t of rotulos(MARIA_REDONDOS)) {
      // Math.abs: en JS -1200 % 10 da -0, y toBe(0) distingue -0 de 0.
      expect(Math.abs(Math.round(t.vMm) % 10), `rótulo en ${t.vMm} mm, que no es múltiplo de la cuadrícula`).toBe(0);
    }
  });

  it('el cero, cuando está a la vista, siempre lleva rótulo', () => {
    const t = generateRulerTicks(MARIA_REDONDOS).find((x) => Math.round(x.vMm) === 0);
    expect(t?.label).toBe('0');
  });
});

const MARIA_REDONDOS = {
  lengthPx: 683,
  panPx: 293,
  zoom2D: 0.244,
  gridSizeMm: 10,
  units: 'cm' as const,
};
