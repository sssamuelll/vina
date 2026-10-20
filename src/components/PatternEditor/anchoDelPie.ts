/**
 * Lo que la sección del patrón necesita de la línea al pie para mostrarlo TODO
 * (spec 2026-10-02 «la interfaz en papel» § 5.3, P5): «la herramienta del patrón
 * ocupa lo que necesita; la sección del 3D, lo que sobra, y es la primera que se
 * recorta». La sección lo pide como su `width` (SeccionDelPatron.tsx) y la ranura
 * de la línea al pie (`.linea-al-pie__patron`, layout.css) mide lo que ella pide.
 *
 * Es función de lo que la herramienta ES —su nombre, TODAS sus opciones, su frase
 * entera—, no de lo que se ve ahora. Esa es la condición: si dependiera de cuántas
 * opciones están plegadas en «Más» (como pasa si la ranura mide lo que mide su
 * contenido), plegar una encogería la ranura, la ranura encogida plegaría otra, y
 * así hasta cero. Medido: Piquete en 2D a 1100 px, con una frase de 204 px, perdía
 * sus tres opciones; y `linea-al-pie` («la frase conserva sus 200 px») cayó por eso.
 *
 * La geometría es la de SeccionDelPatron.css: tres columnas en fila —quién, las
 * opciones y la frase—, con `column-gap` entre ellas y `padding` a los lados; las
 * opciones, a su vez, con su propio `column-gap`. Sin opciones son dos columnas.
 */
/**
 * Los anchos que se miden son enteros (`offsetWidth`, `scrollWidth`) y la suma de
 * seis o siete puede quedarse corta un par de píxeles: a la frase le bastaría para
 * cortar con puntos suspensivos lo que sí cabía. Sobrar es invisible; faltar, no.
 */
export const HOLGURA_PX = 4;

export interface MedidasDeLaSeccion {
  /** `padding` izquierdo y derecho de la sección, sumados. */
  relleno: number;
  /** Lo que mide «quién»: el nombre de la herramienta y su tecla. */
  quien: number;
  /** El `column-gap` de la sección, entre columnas. */
  huecoEntreColumnas: number;
  /** El ancho natural de CADA opción de la herramienta, no solo las que se ven. */
  opciones: readonly number[];
  /** El `column-gap` de la fila de opciones. */
  huecoEntreOpciones: number;
  /** El ancho natural de la frase, entera y sin cortar. */
  frase: number;
  /** Lo que la frase conserva como mínimo (`FRASE_MIN_PX`). */
  fraseMin: number;
}

export function anchoQueNecesita(m: MedidasDeLaSeccion): number {
  const filaDeOpciones = m.opciones.length === 0
    ? 0
    : m.opciones.reduce((suma, ancho) => suma + ancho, 0) + (m.opciones.length - 1) * m.huecoEntreOpciones;
  const columnas = m.opciones.length === 0 ? 2 : 3;
  // La frase cuenta como mínimo lo que se le reserva: una frase corta no estrecha la sección
  // por debajo de lo que el plegado de opciones da por hecho.
  const frase = Math.max(m.frase, m.fraseMin);
  return Math.ceil(m.relleno + m.quien + filaDeOpciones + frase + (columnas - 1) * m.huecoEntreColumnas) + HOLGURA_PX;
}
