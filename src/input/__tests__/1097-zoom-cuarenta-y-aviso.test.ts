// @vitest-environment jsdom
/**
 * #1097 — "ahora no puedo hacer más zoom, estoy al tope… no he cogido la
 * cúspide del triángulo" (María, 18:19). El tope sube de 10× a 40× y lo
 * dice — antes la rueda simplemente dejaba de responder, sin ningún aviso.
 */
import { describe, it, expect } from 'vitest';
import { zoomAtPoint, ZOOM_MIN, ZOOM_MAX, isPinnedAtZoomCeiling } from '../zoom2d';

describe('#1097 — el tope de zoom sube a 40×', () => {
  it('ZOOM_MAX es 40, ZOOM_MIN sigue en 0.1', () => {
    expect(ZOOM_MAX).toBe(40);
    expect(ZOOM_MIN).toBe(0.1);
  });

  it('zoomAtPoint deja acercar más allá del viejo tope de 10', () => {
    const v = zoomAtPoint({ zoom: 10, pan: { x: 0, y: 0 } }, 2, 100, 100);
    expect(v.zoom).toBe(20);
  });

  it('zoomAtPoint se clava en 40, no en 10', () => {
    const v = zoomAtPoint({ zoom: 39, pan: { x: 0, y: 0 } }, 2, 100, 100);
    expect(v.zoom).toBe(40);
  });

  it('en el nuevo tope, un factor >1 más no mueve el zoom (pan sin cambios, identidad)', () => {
    const atMax = zoomAtPoint({ zoom: 40, pan: { x: 5, y: 5 } }, 1.5, 100, 100);
    expect(atMax.zoom).toBe(40);
    expect(atMax.pan).toEqual({ x: 5, y: 5 });
  });
});

describe('#1097 — isPinnedAtZoomCeiling: cuándo avisar del tope', () => {
  it('true al intentar acercar más estando ya en el tope', () => {
    expect(isPinnedAtZoomCeiling(40, 1.1)).toBe(true);
  });

  it('false si todavía queda margen antes del tope', () => {
    expect(isPinnedAtZoomCeiling(35, 1.1)).toBe(false);
  });

  it('false en el tope si el gesto es alejar (factor < 1) — eso sí responde', () => {
    expect(isPinnedAtZoomCeiling(40, 0.9)).toBe(false);
  });

  it('false en el tope con factor exactamente 1 (sin intención de zoom)', () => {
    expect(isPinnedAtZoomCeiling(40, 1)).toBe(false);
  });

  it('false por encima del tope nominal solo si el factor no acerca (defensivo, no debería ocurrir)', () => {
    expect(isPinnedAtZoomCeiling(41, 0.5)).toBe(false);
  });
});
