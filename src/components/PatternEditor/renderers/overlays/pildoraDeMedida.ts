/**
 * La píldora de medida dibujada SOBRE el papel del lienzo 2D: el fondo oscuro
 * translúcido detrás de una lectura numérica (`--readout-bg-2d` /
 * `--readout-ink-2d` en `tokens.css`).
 *
 * Existe porque las dos píldoras que hay tenían el ancho escrito a mano —96 px
 * en `PolyPenToolOverlay`, 80 px en `NodeEditorOverlay`— y el texto no cabe.
 * Samuel lo vio el 2026-09-10 con la herramienta V: "x: 489.1 mm, y: 411.0 mm"
 * se sale de una píldora de 80 px por los dos lados, así que la mitad del
 * número queda sobre la cuadrícula clara y no se lee. La otra píldora estaba a
 * un dígito de romperse igual (su lectura ya medía ~94 px de los 96).
 *
 * El ancho se estima desde el largo del texto, y eso SOLO es fiable en
 * monoespaciada: quien use esta geometría tiene que pintar el texto con
 * `--font-mono-2d`. Es además lo que le conviene a una lectura que cambia
 * mientras arrastras — con fuente proporcional la píldora late al cambiar de
 * dígito.
 */

/**
 * Tamaño de letra de las lecturas sobre el papel, en píxeles de pantalla.
 *
 * Los 11 px no son un gusto: es el piso que ya se ratificó para los números que
 * la usuaria lee todo el día, con la cita de María delante —[07:31] "la letra
 * casi ni se lee"— y fijado por `tanda5-un-cuadro-y-un-aviso.spec.ts`
 * ("el número que ella tiene que leer todo el día no baja de 11 px"). Ese piso
 * se decidió para los chips de cota; estas dos píldoras son la misma clase de
 * texto y estaban por debajo (9 px y 10 px). Se les aplica la decisión que ya
 * existía en vez de inventar un tamaño nuevo para cada superficie.
 */
export const READOUT_FONT_PX = 11;

/** Avance por carácter de las monoespaciadas de `--font-mono-2d` (0,6 em) más un pelo de margen. */
const AVANCE_POR_CARACTER = 0.62;
/** Aire horizontal a cada lado del texto, en múltiplos del tamaño de letra. */
const AIRE_HORIZONTAL = 0.7;
/** Alto de la píldora en múltiplos del tamaño de letra. */
const FACTOR_DE_ALTO = 1.8;

export interface GeometriaDePildora {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

/**
 * Geometría centrada en el origen del grupo que la contiene. `fontSize` va en
 * las MISMAS unidades que el resto del grupo — o sea, ya dividido por el zoom
 * si el grupo vive en espacio de patrón.
 */
export function pildoraDeMedida(texto: string, fontSize: number): GeometriaDePildora {
  const ancho = texto.length * fontSize * AVANCE_POR_CARACTER + fontSize * AIRE_HORIZONTAL * 2;
  const alto = fontSize * FACTOR_DE_ALTO;
  return {
    x: -ancho / 2,
    y: -alto / 2,
    width: ancho,
    height: alto,
    rx: alto / 2,
  };
}
