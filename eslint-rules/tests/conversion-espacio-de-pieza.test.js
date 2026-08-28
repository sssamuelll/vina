/**
 * RuleTester para `conversion-espacio-de-pieza`.
 *
 * La cobertura está organizada por los SIETE RODEOS que llegó a tener el
 * trinquete de regex que esta regla sustituye. Cada uno era una anécdota en un
 * comentario; acá pasa a ser un caso que falla si alguien lo reabre.
 *
 * Historial de los rodeos (venía de
 * `src/utils/geometry/__tests__/pieceSpace.trinquete.test.ts`):
 *
 *   1. Solo miraba la resta — el regex empezaba en `-`.
 *   2. No era recursivo — no entraba a `renderers/` ni a `utils/`. No aplica
 *      acá: recorrer el árbol es trabajo del trinquete, no de la regla.
 *   3. Alias de coordenada — `const ox = snap.position.x`.
 *   4. Propiedad anidada a la DERECHA del operador — era asimétrico.
 *   5. Encadenamiento opcional — `piece.position?.x`.
 *   6. Alias del objeto entero — `const pos = piece.position`.
 *   7. Coalescencia inline — `(piece.position?.x ?? 0) + …`.
 *
 * Cross-ref: #1068, `src/utils/geometry/pieceSpace.ts`.
 */
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from '../rules/conversion-espacio-de-pieza.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
});

/** Un archivo cualquiera con deuda: ni helper ni exento. */
const ARCHIVO = 'src/components/PatternEditor/useAlgunaHerramienta.ts';

const conversion = [{ messageId: 'conversionAMano' }];

describe('conversion-espacio-de-pieza', () => {
  it('ve los siete rodeos y deja en paz lo que no es una pieza', () => {
    ruleTester.run('conversion-espacio-de-pieza', rule, {
      valid: [
        // ── Receptores que NO son piezas ──
        // El `.position` de un ref de Three.js o de un BufferAttribute vive en
        // otro espacio; sumarle algo no convierte nada.
        { filename: ARCHIVO, code: 'const cx = (node.position?.x ?? 0) + d.x;' },
        { filename: ARCHIVO, code: 'const p = groupRef.current.position;' },
        { filename: ARCHIVO, code: 'const positions = geo.attributes.position;' },
        { filename: ARCHIVO, code: 'const z = cam.position.x + 10;' },
        { filename: ARCHIVO, code: 'const dx = local.x - node.position.x;' },

        // ── Leer la posición sin aritmética no es convertir ──
        // El `transform=` de un renderizador es `translate(position)` por
        // definición: no compone, delega en SVG.
        {
          filename: 'src/components/PatternEditor/renderers/PieceRenderer.tsx',
          code: 'const t = `translate(${piece.position.x}, ${piece.position.y})`;',
        },

        // ── La vía de escape, cuando nombra su razón ──
        {
          filename: ARCHIVO,
          code: [
            '// espacio-de-patrón: transform del renderizador, translate+rotate.',
            'const t = `translate(${piece.position.x + tx}, ${piece.position.y + ty})`;',
          ].join('\n'),
        },

        // ── Posiciones que son TUPLAS, no puntos ──
        // La colocación 3D de una pieza sobre el avatar y el punto de un
        // piquete son arrays. Un `{x, y}` no se puede desarmar por posición,
        // así que el `ArrayPattern` distingue los dos casos sin excepciones
        // por nombre. Cuatro falsos positivos medidos al portar la regla.
        { filename: ARCHIVO, code: 'const [px, py, pz] = placement.position;' },
        { filename: ARCHIVO, code: 'const [nx, ny] = notch.position;' },
        // Pero desarmar las coordenadas de un punto SÍ es el alias del rodeo 6.
        // (va en `invalid`, abajo — acá queda la nota de por qué no es simétrico)

        // ── Los helpers SON la conversión ──
        {
          filename: 'src/utils/geometry/pieceSpace.ts',
          code: 'const local = { x: patternPt.x - piece.position.x, y: patternPt.y - piece.position.y };',
        },
        {
          filename: 'src/utils/geometry/transform.ts',
          code: 'const p = { x: pt.x + piece.position.x, y: pt.y + piece.position.y };',
        },
        {
          filename: 'src/components/PatternEditor/pieceTransform.ts',
          code: 'const p = pt.x + piece.position.x;',
        },
      ],

      invalid: [
        // ── Rodeo 1 · la SUMA, no solo la resta ──
        { filename: ARCHIVO, code: 'const sx = start.x + piece.position.x;', errors: conversion },
        { filename: ARCHIVO, code: 'const lx = pt.x - piece.position.x;', errors: conversion },

        // ── Rodeo 3 · alias de coordenada, con la aritmética en otra línea ──
        // El sitio exacto de #1066: el nombre no contiene "piece" y el regex
        // viejo no lo veía.
        { filename: ARCHIVO, code: 'const ox = snap.position.x;', errors: conversion },

        // ── Rodeo 4 · propiedad anidada, a los DOS lados del operador ──
        { filename: ARCHIVO, code: 'const wx = m.point.x + edge.piece.position.x;', errors: conversion },
        { filename: ARCHIVO, code: 'const wx = edge.piece.position.x + m.point.x;', errors: conversion },

        // ── Rodeo 5 · encadenamiento opcional ──
        // 20 de los 32 sitios que aparecieron el 2026-08-24 tienen esta forma.
        { filename: ARCHIVO, code: 'const ox = piece.position?.x ?? 0;', errors: conversion },
        { filename: ARCHIVO, code: 'const oy = piece?.position?.y ?? 0;', errors: conversion },
        { filename: ARCHIVO, code: 'const lx = pt.x - piece.position?.x;', errors: conversion },

        // ── Rodeo 6 · alias del OBJETO entero ──
        // La línea que luego usa `pos.x` ni siquiera contiene "position".
        { filename: ARCHIVO, code: 'const pos = stationaryEdge.piece.position;', errors: conversion },
        { filename: ARCHIVO, code: 'const offA = pieceA.position;', errors: conversion },
        // Desarmar por NOMBRE sigue siendo el alias: `{x, y}` es la forma de un
        // punto. Lo que exime es el `ArrayPattern`, no el destructuring.
        { filename: ARCHIVO, code: 'const { x: ox, y: oy } = piece.position;', errors: conversion },

        // ── Rodeo 7 · coalescencia inline, con el operador despegado ──
        // El `?? 0` y su paréntesis se meten ENTRE la coordenada y el operador.
        { filename: ARCHIVO, code: 'const cx = (piece.position?.x ?? 0) + cmd.values[0];', errors: conversion },
        { filename: ARCHIVO, code: 'const v = a.x + (piece.position?.x ?? 0);', errors: conversion },

        // ── JSX, que es donde vive la mitad de la deuda ──
        {
          filename: 'src/components/PatternEditor/renderers/overlays/AlgunOverlay.tsx',
          code: 'const el = <circle cx={(p.position?.x ?? 0) + a.x} cy={0} />;',
          errors: conversion,
        },

        // ── Un comentario cualquiera NO exime: hay que nombrar la marca ──
        {
          filename: ARCHIVO,
          code: ['// esto está bien, confía en mí', 'const sx = start.x + piece.position.x;'].join('\n'),
          errors: conversion,
        },

        // ── Y la marca no cubre la línea de más abajo ──
        // Exime la de arriba y la propia; la siguiente vuelve a estar sola.
        {
          filename: ARCHIVO,
          code: [
            '// espacio-de-patrón: solo esta.',
            'const a = pt.x + piece.position.x;',
            'const b = pt.y + piece.position.y;',
          ].join('\n'),
          errors: conversion,
        },
      ],
    });
  });
});
