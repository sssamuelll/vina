import type { UnitSystem } from '../../../types/types';

/**
 * La cuadrícula del lienzo 2D: UN solo paso a la vista, siempre (spec
 * 2026-10-02 «la interfaz en papel» § 4.4). Sustituye a los tres pasos fijos
 * que hubo hasta ese día (10 cm, 1 cm y 5 mm), que con el patrón entero en
 * pantalla (zoom 0,48) dejaban las líneas de 1 cm al 27 % y a 4,8 px: una
 * trama que casi no se veía.
 *
 * El cuadro vale `gridSizeMm` por un multiplicador de la escalera 1-2-5: el
 * menor que mida `CUADRO_MIN_PX` o más en pantalla, y nunca menos de 1 mm. La
 * escalera va en el MULTIPLICADOR y no en milímetros absolutos: así, de la
 * cuadrícula para arriba, un cuadro es siempre un número entero de pasos. En
 * pulgadas la escalera es la de la cinta de costura: 1/8, 1/4, 1/2, 1, 2, 6, 12.
 */
export const CUADRO_MIN_PX = 18;
const CUADRO_MIN_MM = 1;

export interface Cuadro {
  /** Lado del cuadro, en mm de patrón. */
  mm: number;
  /** Lado del cuadro, en px de pantalla. */
  px: number;
  /** Lo que dice la marca de escala: «50 mm», «0,5 cm», «1/2 in». */
  rotulo: string;
}

const PELDANOS_125 = [1, 2, 5];
/** De ×0,001 a ×5·10⁸: sobra para cualquier zoom, y acota la búsqueda. */
const DECADA_MIN = -3;
const DECADA_MAX = 8;

const PULGADA_MM = 25.4;
const PULGADAS: ReadonlyArray<{ pulgadas: number; rotulo: string }> = [
  { pulgadas: 1 / 8, rotulo: '1/8' },
  { pulgadas: 1 / 4, rotulo: '1/4' },
  { pulgadas: 1 / 2, rotulo: '1/2' },
  { pulgadas: 1, rotulo: '1' },
  { pulgadas: 2, rotulo: '2' },
  { pulgadas: 6, rotulo: '6' },
  { pulgadas: 12, rotulo: '12' },
  { pulgadas: 24, rotulo: '24' },
  { pulgadas: 48, rotulo: '48' },
  { pulgadas: 96, rotulo: '96' },
];

/** `1.5` → «1,5»; `50` → «50». Dos decimales como mucho, coma decimal. */
function numero(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

/** Los cuadros posibles, de menor a mayor: la cuadrícula por 0,001, 0,002, 0,005, 0,01… */
function candidatosMm(gridSizeMm: number): number[] {
  const salida: number[] = [];
  for (let decada = DECADA_MIN; decada <= DECADA_MAX; decada++) {
    for (const peldano of PELDANOS_125) {
      // Dividir en vez de multiplicar por 10^-n: 10 × 5 / 10 da 5 exacto.
      salida.push(decada < 0 ? (gridSizeMm * peldano) / 10 ** -decada : gridSizeMm * peldano * 10 ** decada);
    }
  }
  return salida;
}

/** El cuadro que se ve a este zoom, o `null` si la cuadrícula o el zoom no valen. */
export function cuadroDeLaCuadricula(gridSizeMm: number, zoom2D: number, units: UnitSystem): Cuadro | null {
  if (!Number.isFinite(gridSizeMm) || !Number.isFinite(zoom2D) || gridSizeMm <= 0 || zoom2D <= 0) return null;

  if (units === 'inches') {
    const paso = PULGADAS.find((p) => p.pulgadas * PULGADA_MM * zoom2D >= CUADRO_MIN_PX) ?? PULGADAS[PULGADAS.length - 1];
    const mm = paso.pulgadas * PULGADA_MM;
    return { mm, px: mm * zoom2D, rotulo: `${paso.rotulo} in` };
  }

  const candidatos = candidatosMm(gridSizeMm);
  const mm = candidatos.find((c) => c >= CUADRO_MIN_MM && c * zoom2D >= CUADRO_MIN_PX) ?? candidatos[candidatos.length - 1];
  return { mm, px: mm * zoom2D, rotulo: units === 'cm' ? `${numero(mm / 10)} cm` : `${numero(mm)} mm` };
}

/**
 * La primera línea vertical de la cuadrícula en `desdePx` o a su derecha. Las
 * líneas caen en `panPx + k · cuadroPx`, con k entero.
 */
export function primeraLineaDesde(panPx: number, cuadroPx: number, desdePx: number): number {
  return panPx + Math.ceil((desdePx - panPx) / cuadroPx) * cuadroPx;
}

/** La última línea de la cuadrícula que no pasa de `hastaPx`: donde se apoya la marca de escala (spec § 4.4). */
export function ultimaLineaHasta(panPx: number, cuadroPx: number, hastaPx: number): number {
  return panPx + Math.floor((hastaPx - panPx) / cuadroPx) * cuadroPx;
}
