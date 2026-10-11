import { describe, expect, it } from 'vitest';
import { anchoQueNecesita, HOLGURA_PX } from '../anchoDelPie';

/**
 * Lo que la sección del patrón necesita de la línea al pie para mostrarlo TODO
 * (spec 2026-10-02 § 5.3, P5): «la herramienta del patrón ocupa lo que necesita;
 * la sección del 3D, lo que sobra». Tiene que salir de lo que la herramienta ES
 * (su nombre, todas sus opciones, su frase entera) y no de lo que se ve ahora:
 * si dependiera de cuántas opciones están plegadas en «Más», plegar una
 * encogería la ranura, la ranura encogida plegaría otra, y así hasta cero (medido:
 * Piquete en 2D a 1100 px perdía sus tres opciones con una frase de 204 px).
 *
 * La geometría de la sección (SeccionDelPatron.css): tres columnas en fila —quién,
 * las opciones y la frase—, con `column-gap` entre ellas y `padding` a los lados; las
 * opciones, a su vez, con su propio `column-gap`. Sin opciones, dos columnas.
 */
const BASE = {
  relleno: 24,
  quien: 116,
  huecoEntreColumnas: 16,
  opciones: [259, 180, 120],
  huecoEntreOpciones: 12,
  frase: 439,
  fraseMin: 200,
};

describe('anchoQueNecesita', () => {
  it('suma quién, las opciones (con sus huecos), la frase entera, los huecos entre columnas y el relleno', () => {
    // 24 + 116 + (259 + 180 + 120 + 2×12) + 439 + 2×16
    expect(anchoQueNecesita(BASE)).toBe(24 + 116 + 583 + 439 + 32 + HOLGURA_PX);
    expect(anchoQueNecesita(BASE)).toBe(1194 + HOLGURA_PX);
  });

  it('una sola opción no lleva hueco entre opciones', () => {
    expect(anchoQueNecesita({ ...BASE, opciones: [259] })).toBe(24 + 116 + 259 + 439 + 32 + HOLGURA_PX);
  });

  it('sin opciones son dos columnas: quién y la frase, con un solo hueco', () => {
    expect(anchoQueNecesita({ ...BASE, opciones: [] })).toBe(24 + 116 + 439 + 16 + HOLGURA_PX);
  });

  it('una frase más corta que el mínimo cuenta como el mínimo: la sección no se estrecha por debajo de lo que reserva a la frase', () => {
    // Con la frase de Piquete en idle (204) y una de 120 el resultado es el mismo que con 200 cuando
    // la frase es menor: es lo que impide el plegado en cascada.
    expect(anchoQueNecesita({ ...BASE, frase: 120 })).toBe(anchoQueNecesita({ ...BASE, frase: 200 }));
    expect(anchoQueNecesita({ ...BASE, frase: 0 })).toBe(anchoQueNecesita({ ...BASE, frase: 200 }));
  });

  it('una frase más larga que el mínimo cuenta entera', () => {
    expect(anchoQueNecesita({ ...BASE, frase: 564 }) - anchoQueNecesita({ ...BASE, frase: 439 })).toBe(125);
  });

  it('no depende de cuántas opciones estén plegadas: solo de las que tiene la herramienta', () => {
    // Misma lista, mismo resultado: la función no recibe cuántas se ven.
    const todas = anchoQueNecesita(BASE);
    expect(anchoQueNecesita({ ...BASE, opciones: [...BASE.opciones] })).toBe(todas);
  });

  it('cada opción más suma su ancho y un hueco', () => {
    expect(anchoQueNecesita({ ...BASE, opciones: [...BASE.opciones, 100] }) - anchoQueNecesita(BASE)).toBe(100 + 12);
  });

  it('con huecos y relleno en cero es la suma sin más', () => {
    expect(anchoQueNecesita({ relleno: 0, quien: 10, huecoEntreColumnas: 0, opciones: [20, 30], huecoEntreOpciones: 0, frase: 300, fraseMin: 200 })).toBe(360 + HOLGURA_PX);
  });

  it('el resultado es entero hacia arriba: una fracción de píxel de menos recorta el último carácter', () => {
    expect(anchoQueNecesita({ ...BASE, quien: 116.4, frase: 439.2 })).toBe(Math.ceil(24 + 116.4 + 583 + 439.2 + 32) + HOLGURA_PX);
  });

  it('deja una holgura sobre la suma: los anchos medidos son enteros y la suma se queda corta unos píxeles', () => {
    expect(HOLGURA_PX).toBeGreaterThan(0);
    expect(anchoQueNecesita({ relleno: 0, quien: 0, huecoEntreColumnas: 0, opciones: [], huecoEntreOpciones: 0, frase: 300, fraseMin: 200 })).toBe(300 + HOLGURA_PX);
  });
});
