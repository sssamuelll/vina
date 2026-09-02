/**
 * #1097 — "al hacer zoom se quedan estas rayitas así como pixeladas de las
 * piezas, eso da una sensación poco profesional" (María, 19:18). El trazo
 * medía 1,4px en pantalla a CUALQUIER zoom (constante ÷ zoom cancela el
 * scale del grupo); ahora crece con el zoom en vez de leerse fino para
 * siempre — como CLO.
 */
import { describe, it, expect } from 'vitest';
import { zoomAwareStroke } from '../zoomAwareStroke';

describe('#1097 — zoomAwareStroke: piso fijo, crece con el zoom', () => {
  it('a 1× se comporta exactamente igual que la constante de siempre (sin regresión visual)', () => {
    expect(zoomAwareStroke(1.4, 1)).toBeCloseTo(1.4, 10);
    expect(zoomAwareStroke(0.8, 1)).toBeCloseTo(0.8, 10);
  });

  it('el ancho en PANTALLA (unidades de patrón × zoom) nunca baja del piso', () => {
    for (const zoom of [0.5, 1, 2, 5, 10, 40]) {
      const screenPx = zoomAwareStroke(1.4, zoom) * zoom;
      expect(screenPx).toBeGreaterThanOrEqual(1.4 - 1e-9);
    }
  });

  it('a 40× el ancho en pantalla creció visiblemente (no solo el piso)', () => {
    const screenAt1 = zoomAwareStroke(1.4, 1) * 1;
    const screenAt40 = zoomAwareStroke(1.4, 40) * 40;
    expect(screenAt40).toBeGreaterThan(screenAt1 * 3);
  });

  it('el piso del margen (0.8) crece proporcionalmente menos que el del contorno (1.4)', () => {
    const cutAt40 = zoomAwareStroke(1.4, 40) * 40;
    const marginAt40 = zoomAwareStroke(0.8, 40) * 40;
    expect(marginAt40).toBeLessThan(cutAt40);
    expect(marginAt40).toBeGreaterThan(0.8); // igual creció respecto al piso original
  });

  it('nunca es negativo ni NaN en el extremo bajo del zoom', () => {
    const v = zoomAwareStroke(1.4, 0.1);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });
});
