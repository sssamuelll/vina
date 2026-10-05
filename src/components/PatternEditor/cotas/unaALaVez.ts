import type { Tool2D } from '../../../types/types';
import type { Cota } from './cotas';
import type { Sujeto } from './sujeto';

/**
 * Una cota de la pieza a la vez (spec 2026-10-02 § 5.5): «las medidas de la
 * caja no son las de la pieza», y María pidió el 07-09 que no se quedaran
 * «ahí pegado todo el rato». Seleccionar y Transformar enseñan una; Tab desde
 * su chip pasa a la siguiente, que ocupa su sitio. Las que crean la pieza
 * (Rectángulo, Círculo, Triángulo) siguen con las dos: su caja son sus
 * medidas, y el «300 Tab 150 Enter» se escribe ahí.
 */
const UNA_A_LA_VEZ: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'transform']);

/** De quién es el turno: la selección en la que se pulsó Tab, y qué cota. Otra selección vuelve a la primera. */
export interface TurnoDeCota {
  seleccion: readonly string[] | null;
  indice: number;
}

export const TURNO_INICIAL: TurnoDeCota = { seleccion: null, indice: 0 };

function aplica(sujeto: Sujeto, activeTool: Tool2D): boolean {
  return sujeto.esPieza && UNA_A_LA_VEZ.has(activeTool) && sujeto.cotas.length > 1;
}

// La selección se compara por identidad: Redux solo rehace el arreglo cuando
// se selecciona, así que un clic nuevo en la pieza vuelve a la primera cota y
// confirmar una cota (que no toca la selección) conserva el turno.
function indiceVivo(turno: TurnoDeCota, seleccion: readonly string[], cuantas: number): number {
  return turno.seleccion === seleccion ? Math.min(turno.indice, cuantas - 1) : 0;
}

export function cotasALaVista(sujeto: Sujeto, activeTool: Tool2D, turno: TurnoDeCota, seleccion: readonly string[]): Cota[] {
  if (!aplica(sujeto, activeTool)) return sujeto.cotas;
  return [sujeto.cotas[indiceVivo(turno, seleccion, sujeto.cotas.length)]];
}

/**
 * El Tab que sale de un chip: pasa a la cota siguiente (o a la anterior, con
 * Shift) del mismo objeto. `null` = no hay a dónde: el Tab sigue su camino de
 * siempre, a la línea al pie hacia adelante, y se queda hacia atrás.
 */
export function pasarTurno(
  sujeto: Sujeto,
  activeTool: Tool2D,
  turno: TurnoDeCota,
  seleccion: readonly string[],
  hacia: 'siguiente' | 'anterior',
): TurnoDeCota | null {
  if (!aplica(sujeto, activeTool)) return null;
  const indice = indiceVivo(turno, seleccion, sujeto.cotas.length) + (hacia === 'siguiente' ? 1 : -1);
  if (indice < 0 || indice >= sujeto.cotas.length) return null;
  return { seleccion, indice };
}
