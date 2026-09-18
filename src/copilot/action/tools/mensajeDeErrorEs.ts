/**
 * El error de una herramienta, en el idioma de la usuaria (#1194).
 *
 * La validación del copiloto (la guardia de #1189 en `registry.ts` y la rama zod
 * de `validation.ts`) produce mensajes en inglés y con vocabulario de JSON Schema
 * —«Parameter», «must be one of», «got string»— y esa cadena se pinta LITERAL en
 * el chat (`UnifiedBarChat.tsx:310`), en rojo, rodeada de copy en español.
 *
 * Se traduce al LEER y no al escribir por dos consumidores que ya dependen del
 * inglés: `classifyError` (`errorRecovery.ts:92-99`) clasifica por subcadena
 * —'missing required', 'validation', 'not found'— y `AgenticLoop.ts:560` le manda
 * el mismo texto al LLM para que reintente. Traducir en el productor los
 * reclasificaría a los dos en silencio.
 *
 * Lo que no reconoce sale intacto: son ~232 herramientas con sus propios errores,
 * y un traductor que adivine es peor que uno que se calle.
 *
 * Techo conocido: el NOMBRE del dato (`pieceId`, `edgeAName`) se deja como llega.
 * Es un identificador, igual que el nombre de la herramienta que esa misma línea
 * ya pinta en monoespaciada. Traducir los frecuentes y no los demás dejaría media
 * frase en cada idioma, que se lee peor que el identificador entero.
 */

/** Los tipos del JSON Schema y de zod, dichos como se dicen. */
const TIPO_ES: Record<string, string> = {
  'a number': 'un número',
  number: 'un número',
  'an integer': 'un número entero',
  integer: 'un número entero',
  string: 'un texto',
  boolean: 'un sí o un no',
  array: 'una lista',
  tuple: 'una lista',
  object: 'un objeto',
  date: 'una fecha',
  undefined: 'nada',
  null: 'nada',
};

function queEsperaba(esperado: string, recibido: string): string {
  const e = TIPO_ES[esperado] ?? esperado;
  const r = TIPO_ES[recibido] ?? recibido;
  // 3,5 donde va un entero llega como «número»: repetir el sustantivo no dice nada.
  if (e === r) return `tiene que ser ${e}`;
  if (r === 'nada') return `tiene que ser ${e} y no llegó nada`;
  return `tiene que ser ${e} y llegó ${r}`;
}

/**
 * Traduce las formas canónicas de la validación; el resto pasa intacto.
 *
 * Reemplaza sobre el texto ENTERO en vez de partirlo: `validate()` une sus
 * errores con ', ' y ese mismo separador vive dentro de la lista de un enum
 * («must be one of: 2d, 3d, split»). Partir por la coma se come las opciones.
 */
export function mensajeDeErrorEs(raw: string): string {
  let toco = false;
  const marca = <T,>(v: T): T => { toco = true; return v; };

  const es = raw
    .replace(
      /Missing required parameter: "([^"]+)"/g,
      (_m, campo: string) => marca(`falta el dato ${campo}`),
    )
    .replace(
      // La lista de opciones llega hasta el próximo error unido, o hasta el final.
      /Parameter "([^"]+)" must be one of: (.+?)(?=, Missing required parameter|, Parameter "|$)/g,
      (_m, campo: string, opciones: string) =>
        marca(`el dato ${campo} tiene que ser uno de: ${opciones}`),
    )
    .replace(
      /Parameter "([^"]+)" must be (an integer|a number|[a-z]+), got ([a-z]+)/g,
      (_m, campo: string, esperado: string, recibido: string) =>
        marca(`el dato ${campo} ${queEsperaba(esperado, recibido)}`),
    );

  return toco ? es.charAt(0).toUpperCase() + es.slice(1) : raw;
}
