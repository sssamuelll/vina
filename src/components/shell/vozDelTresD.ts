import { displayModifierKey } from './shortcutDisplay';

/**
 * La voz del 3D (spec 2026-10-02 «la interfaz en papel» § 5.3, P5): lo que dice
 * la línea al pie mientras se está en el visor, hermana de la frase del patrón.
 * El nombre de la herramienta activa y UNA frase de cómo se usa; sin herramienta
 * (la cámara) dice cómo se mueve la vista, que antes decía un rótulo azul sobre
 * el visor («MODO EDICIÓN — orbitar con dos dedos…»).
 *
 * Los textos salen del glosario (docs/specs/2026-07-16-ui-copy-es-glosario.md) y
 * de `solace-wren`: tuteo, sin signos de exclamación, el nombre en español. Una
 * herramienta que no tiene entrada NO enseña su id: da un nombre genérico y la
 * frase de mover la vista, que siempre es cierta.
 *
 * Las TECLAS no se escriben aquí: la del nombre la pone `SeccionDel3D` desde el
 * registro de atajos. Y ninguna frase anuncia un atajo que el navegador se queda:
 * Ctrl+W (quitar todas las fijaciones) cierra la pestaña y la página nunca lo
 * recibe, así que la frase de Fijar ya no lo dice.
 */

export interface VozDelTresD {
  /** El nombre de la herramienta, o `null` si no hay ninguna que nombrar (la cámara). */
  nombre: string | null;
  frase: string;
}

export interface OpcionesDeLaVoz {
  esquema: 'trackpad' | 'mouse';
  /** El editor de pose está abierto: gana sobre cualquier herramienta. */
  poseAbierta: boolean;
}

/** Cómo se mueve la vista: la frase de la cámara y la de lo que no tiene frase propia. */
function moverLaVista(esquema: OpcionesDeLaVoz['esquema']): string {
  const alt = displayModifierKey('⌥');
  return esquema === 'trackpad'
    ? `Dos dedos orbitan · pellizco acerca · ${alt} + arrastrar panea`
    : `Clic derecho orbita · clic central o ${alt} + arrastrar panea`;
}

const POSE: VozDelTresD = { nombre: 'Pose', frase: 'Arrastra una articulación para cambiar la pose' };

/** Un Map, no un objeto: un id como `constructor` no debe encontrar nada. */
const HERRAMIENTAS = new Map<string, () => VozDelTresD>([
  ['arrangement', () => ({ nombre: 'Colocar', frase: 'Clic en la pieza y luego en el punto del cuerpo donde va' })],
  ['sew3d', () => ({ nombre: 'Coser', frase: 'Clic en un borde y luego en el otro' })],
  ['pin', () => ({ nombre: 'Fijar', frase: 'Clic en la tela para fijar un punto' })],
  ['steamBrush', () => ({ nombre: 'Plancha a vapor', frase: 'Arrastra sobre la tela para alisar las arrugas' })],
  ['meshGrab', () => ({ nombre: 'Agarre de malla', frase: 'Arrastra un punto de la tela para tirar de él' })],
  ['meshSelectBox', () => ({ nombre: 'Selección por caja', frase: 'Arrastra un recuadro para seleccionar puntos de la tela' })],
  ['meshSelectLasso', () => ({ nombre: 'Selección por lazo', frase: 'Dibuja un lazo para seleccionar puntos de la tela' })],
  ['pose', () => POSE],
]);

export function vozDelTresD(herramienta: string, opciones: OpcionesDeLaVoz): VozDelTresD {
  if (opciones.poseAbierta) return POSE;
  if (herramienta === 'camera') return { nombre: null, frase: moverLaVista(opciones.esquema) };
  const entrada = HERRAMIENTAS.get(herramienta);
  if (entrada) return entrada();
  return { nombre: 'Herramienta del 3D', frase: moverLaVista(opciones.esquema) };
}
