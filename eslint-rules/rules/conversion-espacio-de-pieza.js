/**
 * conversion-espacio-de-pieza — marca la conversión a mano entre el espacio de
 * patrón y el espacio local de una pieza.
 *
 * El problema
 * -----------
 * Desde #1033 el giro de una pieza es DECLARATIVO: el tirador escribe
 * `piece.rotation` y el renderizador lo aplica como un `rotate()` sobre el
 * grupo. Eso abre una diferencia real entre los dos espacios, y cualquier
 * conversión hecha a mano —sumar o restar solo `position`— apunta a donde la
 * pieza estaba ANTES de girar. Sobre una pieza girada, el clic no engancha
 * donde el borde se ve.
 *
 * Los helpers correctos viven en `src/utils/geometry/pieceSpace.ts`:
 * `pieceLocalToPattern`, `patternToPieceLocal` y sus variantes de dirección.
 *
 * Por qué una regla de AST y no un regex
 * --------------------------------------
 * Esto empezó como un trinquete de expresiones regulares en
 * `src/utils/geometry/__tests__/pieceSpace.trinquete.test.ts`. Llegó a tener
 * SIETE rodeos documentados, y cada vez que se cerraba uno aparecían sitios
 * que ningún censo anterior había contado. La lista es instructiva porque
 * todos son el mismo error de fondo —leer texto en vez de leer la forma— y el
 * AST los mata de una sola vez, no de siete:
 *
 *   1. El regex empezaba en `-`, así que la SUMA no la veía.
 *   3. `const ox = snap.position.x` seguido de `anchor.x - ox`: el alias
 *      escondía la aritmética, y el nombre no contenía "piece".
 *   4. `m.point.x + edge.piece.position.x` — la propiedad anidada a la DERECHA
 *      del operador no casaba; a la izquierda sí. Era asimétrico.
 *   5. `piece.position?.x` no casa `\.position\.`. La forma más común del
 *      alias en este repo: 20 de 32 sitios.
 *   6. `const pos = piece.position;` — se lleva el objeto entero y la línea
 *      que usa `pos.x` ni siquiera contiene "position".
 *   7. `(piece.position?.x ?? 0) + cmd.values[0]` — el `?? 0` y su paréntesis
 *      se meten ENTRE la coordenada y el operador.
 *
 * En el árbol, 5 y 7 desaparecen solos (el encadenamiento opcional, la
 * coalescencia y los paréntesis son nodos, no caracteres entre medias), 1 y 4
 * son simétricos por construcción (los dos lados del `BinaryExpression` son el
 * mismo tipo de nodo), y 3 y 6 son la rama del `VariableDeclarator`.
 *
 * Qué detecta
 * -----------
 * 1. ARITMÉTICA — un `+` o un `-` donde cualquiera de los dos lados es la
 *    coordenada de posición de una pieza (`<pieza>.position.x|y`), tolerando
 *    encadenamiento opcional y `?? <valor>`.
 * 2. ALIAS DE COORDENADA — `const ox = <pieza>.position.x`. Capturar la
 *    coordenada en una variable no tiene ningún uso legítimo: solo esconde la
 *    aritmética de la línea siguiente.
 * 3. ALIAS DE OBJETO — `const pos = <pieza>.position`. Lo mismo, un nivel más
 *    arriba.
 *
 * Se marca en la DECLARACIÓN, no en el uso posterior del alias, para no contar
 * dos veces el mismo sitio.
 *
 * Fuera de alcance (falsos negativos deliberados, no bugs)
 * --------------------------------------------------------
 * - LA POSICIÓN PASADA COMO PARÁMETRO SUELTO. Era el 8º rodeo y es el único
 *   que ningún detector estático puede ver: `computeGhostTransform(stationaryPos:
 *   Point2D, mobilePos: Point2D)` recibía las posiciones en vez de las piezas,
 *   así que el cuerpo de la función no menciona `.position` ni una vez. El
 *   rodeo es ARQUITECTÓNICO, no sintáctico — desacoplar la posición de su
 *   pieza esconde la conversión de cualquier análisis local. Se cierra
 *   cambiando la firma para que pida la pieza entera, y eso es revisión
 *   humana. La advertencia, textual: una función que recibe `Point2D` de
 *   posición y `PathCommand[]` de contorno por separado ya perdió el giro, y
 *   esta regla dirá que está limpia.
 * - LECTURA SIN ARITMÉTICA. `transform={`translate(${piece.position.x}, …)`}`
 *   no compone nada: delega en SVG. No se marca.
 * - POSICIONES QUE SON TUPLAS. `const [px, py, pz] = placement.position` y
 *   `const [nx, ny] = notch.position` desarman un array, no un `{x, y}`: son
 *   la colocación 3D de una pieza sobre el avatar y el punto de un piquete,
 *   otro tipo y otro espacio. El regex anterior no los veía porque su alias
 *   exigía un identificador simple a la izquierda del `=`; el AST sí los veía
 *   y los marcaba mal — cuatro falsos positivos en `cloth/` y `export/`,
 *   medidos al portar la regla. Un punto `{x, y}` no se puede desarmar por
 *   posición, así que el `ArrayPattern` es señal fiable de que esto no es la
 *   conversión que #1068 persigue.
 * - NEGACIÓN UNARIA. `-piece.position.x + a` deja la coordenada dentro de un
 *   `UnaryExpression`, y no se desenvuelve. Cero sitios hoy; se añade si
 *   aparece uno.
 * - MULTIPLICACIÓN Y ESCALA. `piece.position.x * k` no es una conversión entre
 *   los dos espacios; solo `+` y `-` trasladan.
 *
 * Vía de escape
 * -------------
 * El código que SÍ tiene derecho a componer la posición a mano marca la línea
 * de arriba (o la propia) con `// espacio-de-patrón: <razón>`. Es
 * deliberadamente incómoda: exige nombrar la razón. El caso canónico es el
 * `transform=` de un renderizador, que es `translate(position) rotate(…)` por
 * definición y se rompería envuelto en el helper.
 *
 * Cross-ref: #1068, #1064, #1066, `src/utils/geometry/pieceSpace.ts`.
 *
 * @type {import('eslint').Rule.RuleModule}
 */

/**
 * Receptores cuyo `.position` NO es el de una pieza de patrón. `current` es el
 * `.current` de un ref de Three.js (`groupRef.current.position`) y `attributes`
 * el de un BufferGeometry (`geo.attributes.position`).
 */
const NO_PIEZA = new Set([
  'node', 'img', 'cam', 'camera', 'scene', 'artwork', 'selectedNodeData',
  'penDistance', 'action', 'target', 'existing', 'obj', 'mesh', 'light',
  'group', 'current', 'attributes',
]);

/**
 * Los únicos archivos con derecho a tocar la posición a mano: son la
 * conversión. `transform.ts` está aquí porque es la capa primitiva sobre la que
 * `pieceSpace.ts` se apoya —`rotatePoint` y `outlineBBoxCenter` viven ahí— y su
 * `piecePoints(piece, rotated)` aplica el giro él mismo, ofreciendo la variante
 * sin girar a propósito. No es un consumidor con deuda.
 */
const HELPERS = [
  'src/utils/geometry/pieceSpace.ts',
  'src/utils/geometry/transform.ts',
  'src/components/PatternEditor/pieceTransform.ts',
];

const MARCA_EXENTA = /espacio-de-patrón:/;

/** Quita las envolturas que no cambian a qué apunta la expresión. */
function desenvolver(node) {
  let n = node;
  while (n && (n.type === 'ChainExpression' || n.type === 'TSNonNullExpression')) {
    n = n.expression;
  }
  return n;
}

/**
 * El último identificador antes de `.position` — el que `NO_PIEZA` juzga.
 * Para `edge.piece.position` devuelve `piece`; para `piece.position`, `piece`.
 */
function receptor(node) {
  const n = desenvolver(node);
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
    return n.property.name;
  }
  return null;
}

/** ¿`node` es `<pieza>.position`? */
function esPosicionDePieza(node) {
  const n = desenvolver(node);
  if (!n || n.type !== 'MemberExpression' || n.computed) return false;
  if (n.property.type !== 'Identifier' || n.property.name !== 'position') return false;
  const r = receptor(n.object);
  return r !== null && !NO_PIEZA.has(r);
}

/** ¿`node` es `<pieza>.position.x` o `.y`? */
function esCoordenadaDePieza(node) {
  const n = desenvolver(node);
  if (!n || n.type !== 'MemberExpression' || n.computed) return false;
  if (n.property.type !== 'Identifier') return false;
  if (n.property.name !== 'x' && n.property.name !== 'y') return false;
  return esPosicionDePieza(n.object);
}

/**
 * Igual que {@link esCoordenadaDePieza} pero atravesando la coalescencia:
 * `piece.position?.x ?? 0` sigue siendo la coordenada. Era el 7º rodeo.
 */
function esCoordenadaAunBajoCoalescencia(node) {
  const n = desenvolver(node);
  if (!n) return false;
  if (n.type === 'LogicalExpression' && n.operator === '??') {
    return esCoordenadaAunBajoCoalescencia(n.left);
  }
  return esCoordenadaDePieza(n);
}

function enHelper(filename) {
  if (!filename) return false;
  const normalizado = filename.split('\\').join('/');
  return HELPERS.some(h => normalizado === h || normalizado.endsWith(`/${h}`));
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prohíbe convertir a mano entre espacio de patrón y espacio local de pieza: sumar o restar `position` sin girar apunta a donde la pieza estaba antes de rotar (#1068).',
      url: 'https://github.com/sssamuelll/vina/issues/1068',
    },
    schema: [],
    messages: {
      conversionAMano:
        'Conversión a mano entre espacio de patrón y espacio local: componer `position` sin `rotation` apunta a donde la pieza estaba ANTES de girar. Usa `pieceLocalToPattern` / `patternToPieceLocal` de src/utils/geometry/pieceSpace.ts. Si de verdad toca componer a mano, márcalo con `// espacio-de-patrón: <razón>` en la línea de arriba. Ver #1068.',
    },
  },

  create(context) {
    if (enHelper(context.filename ?? context.getFilename?.())) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Líneas marcadas con la vía de escape. */
    let exentas = null;
    function lineaExenta(linea) {
      if (exentas === null) {
        exentas = new Set();
        for (const c of sourceCode.getAllComments()) {
          if (MARCA_EXENTA.test(c.value)) exentas.add(c.loc.end.line);
        }
      }
      // La marca cubre su propia línea y la siguiente — el caso canónico es un
      // comentario encima de una plantilla JSX, donde no cabe uno de línea.
      return exentas.has(linea) || exentas.has(linea - 1);
    }

    function marcar(node) {
      if (lineaExenta(node.loc.start.line)) return;
      context.report({ node, messageId: 'conversionAMano' });
    }

    return {
      // Rodeos 1, 4, 5 y 7: la aritmética, mire donde mire.
      BinaryExpression(node) {
        if (node.operator !== '+' && node.operator !== '-') return;
        if (
          esCoordenadaAunBajoCoalescencia(node.left) ||
          esCoordenadaAunBajoCoalescencia(node.right)
        ) {
          marcar(node);
        }
      },

      // Rodeos 3 y 6: el alias, que esconde la aritmética de la línea de al lado.
      VariableDeclarator(node) {
        if (!node.init) return;
        // `const [px, py, pz] = x.position` desarma una TUPLA, no un punto:
        // es la posición 3D de una colocación o de un piquete, otro tipo y otro
        // espacio. Ver la nota de falsos positivos en la cabecera.
        if (node.id.type === 'ArrayPattern') return;
        if (
          esCoordenadaAunBajoCoalescencia(node.init) ||
          esPosicionDePieza(node.init)
        ) {
          marcar(node);
        }
      },
    };
  },
};
