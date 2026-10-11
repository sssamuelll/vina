/**
 * @vitest-environment jsdom
 *
 * Con el fondo «Papel» el lienzo del visor es transparente (spec 2026-10-02
 * § 4.5), así que lo que se exporta sin fondo sale transparente, o negro en
 * JPEG y en vídeo. `sobreElPapel` lo pinta encima del color de la hoja, que
 * lee de su token: el JS no copia el hex (contrato de interfaz § 1).
 *
 * jsdom no trae canvas 2D: el contexto es falso y anota el ORDEN de lo que se
 * le pide, que es lo que importa (el papel va debajo).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { colorDelPapel, sobreElPapel } from '../sobreElPapel';

afterEach(() => vi.restoreAllMocks());

function conToken(valor: string) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (nombre: string) => (nombre === '--canvas-2d' ? valor : ''),
  } as unknown as CSSStyleDeclaration);
}

function conContextoFalso() {
  const llamadas: string[] = [];
  const ctx = {
    set fillStyle(v: string) { llamadas.push(`fillStyle=${v}`); },
    fillRect: (...a: number[]) => llamadas.push(`fillRect(${a.join(',')})`),
    drawImage: (...a: unknown[]) => llamadas.push(`drawImage(${a.length})`),
  };
  // `getContext` está sobrecargado (2D, WebGL, WebGPU): se tipa a mano.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
  return llamadas;
}

describe('colorDelPapel', () => {
  it('lee --canvas-2d de :root, sin los espacios', () => {
    conToken('  #faf4e3 ');
    expect(colorDelPapel()).toBe('#faf4e3');
  });

  it('si el token no existe, lanza: un fondo adivinado sería un color suelto', () => {
    conToken('');
    expect(() => colorDelPapel()).toThrow(/--canvas-2d/);
  });
});

describe('sobreElPapel', () => {
  it('pinta el papel primero y el origen encima, en un canvas nuevo del mismo tamaño', () => {
    conToken('#faf4e3');
    const llamadas = conContextoFalso();
    const origen = document.createElement('canvas');
    origen.width = 40;
    origen.height = 20;

    const salida = sobreElPapel(origen);

    expect(llamadas).toEqual(['fillStyle=#faf4e3', 'fillRect(0,0,40,20)', 'drawImage(3)']);
    expect(salida).not.toBe(origen);
    expect([salida.width, salida.height]).toEqual([40, 20]);
  });
});

describe('sobreElPapel ▸ lo que va encima es el origen', () => {
  it('drawImage recibe el origen, no otro lienzo', () => {
    conToken('#faf4e3');
    const dibujados: unknown[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      set fillStyle(_v: string) { /* nada */ },
      fillRect: () => {},
      drawImage: (img: unknown) => { dibujados.push(img); },
    })) as never);
    const origen = document.createElement('canvas');
    sobreElPapel(origen);
    expect(dibujados).toHaveLength(1);
    expect(dibujados[0]).toBe(origen);
  });
});
