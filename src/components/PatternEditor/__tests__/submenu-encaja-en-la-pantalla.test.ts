import { describe, it, expect } from 'vitest';
import { encajarSubmenu } from '../menuOverflow';

/**
 * Ronda de revisión adversarial del arreglo F3 (2026-09-04).
 *
 * La primera versión del arreglo escribía el alto en línea:
 *
 *   Math.max(96, window.innerHeight - top - 24)
 *
 * El 96 no estaba justificado en ningún comentario, y el revisor vio lo que
 * hace: **en cuanto el ítem que abre el submenú queda a menos de ~120 px del
 * pie de la ventana, ese piso devuelve exactamente el defecto que F3 acababa
 * de arreglar** — el submenú vuelve a salirse, sin scroll que lo salve y sin
 * ningún test que lo cubra, porque el e2e solo abre «Vista», que en la laptop
 * de María nace a ~113 px del techo.
 *
 * No se disparaba con los siete ítems de hoy. Era una trampa esperando a que
 * el menú creciera o a que alguien achicara la ventana.
 *
 * La salida correcta no es desbordar ni encoger hasta lo inútil: es **subir el
 * submenú**. Un menú flotante puede colgar hacia arriba; lo que no puede es
 * salirse de la pantalla.
 */

const AIRE = 24;
const MINIMO = 96;
const encajar = (topPx: number, innerHeight: number) =>
  encajarSubmenu({ topPx, innerHeight, aire: AIRE, minimo: MINIMO });

/** El borde de abajo del submenú una vez colocado. */
const fondo = (topPx: number, innerHeight: number) => {
  const { altoMax, subir } = encajar(topPx, innerHeight);
  return topPx - subir + altoMax;
};

describe('el submenú nunca se sale de la pantalla', () => {
  it('el caso de María: "Vista" en una laptop de 643 px', () => {
    const { altoMax, subir } = encajar(113, 643);
    expect(altoMax).toBe(643 - 113 - AIRE);
    expect(subir, 'con sitio de sobra no hay que subir nada').toBe(0);
  });

  it.each([
    [113, 643], [300, 643], [500, 643], [560, 643], [600, 643], [620, 643],
    [113, 768], [700, 768], [740, 768],
    [113, 1000], [950, 1000],
    [40, 400], [300, 400], [370, 400],
  ])('con el submenú naciendo en y=%s de una ventana de %s px', (topPx, innerHeight) => {
    expect(fondo(topPx, innerHeight), 'se sale por abajo').toBeLessThanOrEqual(innerHeight - AIRE + 0.001);
    const { altoMax, subir } = encajar(topPx, innerHeight);
    expect(topPx - subir, 'se sale por arriba').toBeGreaterThanOrEqual(0);
    expect(altoMax, 'alto negativo').toBeGreaterThanOrEqual(0);
  });

  it('el caso que el piso mágico rompía: el ítem casi al pie de la ventana', () => {
    // 643 − 600 − 24 = 19 px de sitio. La versión vieja devolvía 96 y se salía
    // 77 px. Ahora sube lo justo y el fondo queda dentro.
    const { altoMax, subir } = encajar(600, 643);
    expect(subir, 'no subió nada: vuelve a desbordar').toBeGreaterThan(0);
    expect(altoMax).toBe(MINIMO);
    expect(fondo(600, 643)).toBeLessThanOrEqual(643 - AIRE);
  });

  it('nunca sube más de lo que hay por encima', () => {
    // Ventana muy baja: no cabe ni subiendo. Se pega al techo, no lo atraviesa.
    const { subir } = encajar(40, 120);
    expect(40 - subir).toBeGreaterThanOrEqual(0);
  });
});

describe('el submenú no se encoge sin motivo', () => {
  it('con sitio de sobra usa todo el que hay, no el mínimo', () => {
    expect(encajar(100, 1000).altoMax).toBe(1000 - 100 - AIRE);
  });

  it('cuanto más arriba nace, más alto le cabe', () => {
    const a = encajar(100, 768).altoMax;
    const b = encajar(300, 768).altoMax;
    expect(a).toBeGreaterThan(b);
  });

  it('con sitio justo en el límite no sube', () => {
    // espacio === minimo exacto: cabe, no hay que mover nada.
    expect(encajar(768 - AIRE - MINIMO, 768)).toEqual({ altoMax: MINIMO, subir: 0 });
  });

  it('es determinista', () => {
    expect(encajar(400, 643)).toEqual(encajar(400, 643));
  });
});
