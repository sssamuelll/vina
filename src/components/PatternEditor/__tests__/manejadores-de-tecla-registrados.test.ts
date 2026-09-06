import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F8.
 *
 * `useSlashAndSpreadTool` implementa su Escape (`:407-418`: cancela el reparto
 * en curso, y si no hay, resetea la herramienta), y `useEditorInteractions`
 * lo lista en el array de dependencias del efecto que registra los manejadores
 * de tecla (`:445`)… pero **ningún `handlers.push` lo monta**. O sea: se
 * escribió, se cableó a medias, y Escape en Abrir la pieza no hace nada.
 * (Se llamaba «Slash & Spread» hasta el 2026-09-05: se tradujo al abrirle la
 * puerta en el dock, en el mismo lote.)
 *
 * El array de dependencias es la huella del olvido: alguien lo añadió ahí
 * pensando que había terminado. Este test convierte esa huella en la regla:
 * **cada `handleKeyDown` que aparece en las dependencias tiene su `push`.**
 *
 * Es un censo sobre el texto del archivo, con su propio guardián: si el regex
 * deja de encontrar nada, falla ruidosamente en vez de pasar en vacío. La
 * alternativa —montar el hook entero con `renderHook`— no serviría: habría que
 * simular las 24 herramientas para llegar a cada rama.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F8.
 */

const FUENTE = readFileSync(
  join(process.cwd(), 'src/components/PatternEditor/useEditorInteractions.ts'),
  'utf8',
);

/** El efecto que registra los manejadores de tecla, de su `useEffect(` a su `]);`. */
function bloqueDeTeclas(): string {
  const i = FUENTE.indexOf('handlers.push');
  expect(i, 'no encontré el efecto que registra manejadores de tecla').toBeGreaterThan(0);
  const inicio = FUENTE.lastIndexOf('useEffect(', i);
  const fin = FUENTE.indexOf('}, [', i);
  const cierre = FUENTE.indexOf(']);', fin);
  return FUENTE.slice(inicio, cierre + 3);
}

const BLOQUE = bloqueDeTeclas();

const nombres = (re: RegExp) => {
  const out = new Set<string>();
  for (const m of BLOQUE.matchAll(re)) out.add(m[1]);
  return out;
};

/** Los que se registran de verdad: `handlers.push(xTool.handleKeyDown)`. */
const MONTADOS = nombres(/handlers\.push\(\s*([A-Za-z]+)\.handleKeyDown\s*\)/g);
/** Los que aparecen en las dependencias: `xTool.handleKeyDown` tras `}, [`. */
const DECLARADOS = (() => {
  const deps = BLOQUE.slice(BLOQUE.indexOf('}, ['));
  const out = new Set<string>();
  for (const m of deps.matchAll(/([A-Za-z]+)\.handleKeyDown/g)) out.add(m[1]);
  return out;
})();

describe('F8 — ningún manejador de tecla se queda a medio cablear', () => {
  it('el censo no está ciego', () => {
    expect(MONTADOS.size, 'no detecté ningún handlers.push: el regex se quedó ciego').toBeGreaterThanOrEqual(8);
    expect(DECLARADOS.size, 'no detecté las dependencias del efecto').toBeGreaterThanOrEqual(8);
  });

  it('cada handleKeyDown declarado en las dependencias está montado', () => {
    const olvidados = [...DECLARADOS].filter((n) => !MONTADOS.has(n));
    expect(
      olvidados,
      'ganchos cuyo handleKeyDown se declara como dependencia pero nunca se registra: ' +
      'la tecla existe en el hook y no llega nunca',
    ).toEqual([]);
  });

  it('y al revés: nada montado se queda fuera de las dependencias (se congelaría)', () => {
    const sinDependencia = [...MONTADOS].filter((n) => !DECLARADOS.has(n));
    expect(
      sinDependencia,
      'manejadores registrados sin declarar: el efecto no se re-suscribe y queda con la versión vieja',
    ).toEqual([]);
  });

  it('el de Abrir la pieza está montado (el que faltaba)', () => {
    expect(MONTADOS.has('slashAndSpreadTool')).toBe(true);
  });
});

/**
 * El rodeo por el otro lado (spec de la escalera de Escape, § 4.2).
 *
 * El trinquete de arriba comprueba que el `handleKeyDown` **exista y llegue**.
 * No mira QUÉ TECLAS atiende — así que un hook con un `handleKeyDown` que solo
 * escucha Enter pasa en verde, y Escape en esa herramienta cae al peldaño
 * global sin que nadie lo note. `useOffsetTool` es ese caso.
 *
 * La spec lo listó como «falta añadirle Escape». El código dice otra cosa: su
 * `reset` es `useCallback(() => {}, [])` —un no-op— porque la herramienta no
 * guarda gesto en curso; su vista previa se deriva de la selección. Escape
 * cayendo al global (`selection.deselect`) deselecciona, la vista previa
 * desaparece, y eso ES el comportamiento correcto de la escalera.
 *
 * Así que lo que se arregla no es el hook: es el censo. Cada `handleKeyDown`
 * montado declara aquí qué teclas atiende, y quien no atienda Escape tiene que
 * decir por qué. Un hook nuevo que no aparezca en la lista rompe el test.
 */
describe('cada manejador declara qué teclas atiende, no solo que existe', () => {
  /** Ganchos que NO atienden Escape, con la razón. Añadir aquí es una decisión. */
  const SIN_ESCAPE: Record<string, string> = {
    offsetTool: 'no guarda gesto: su reset es un no-op y la vista previa sale de '
      + 'la selección, así que Escape cae al peldaño global y deselecciona — correcto',
  };

  const DIR = join(process.cwd(), 'src/components/PatternEditor');

  /** `xTool` → `useXTool.ts`: la convención de nombres del router. */
  function archivoDe(nombre: string): string {
    const base = nombre.replace(/Tool$/, '');
    return `use${base[0].toUpperCase()}${base.slice(1)}Tool.ts`;
  }

  it('los que dicen atender Escape lo atienden de verdad', () => {
    const revisados: string[] = [];
    for (const nombre of MONTADOS) {
      if (nombre in SIN_ESCAPE) continue;
      let src: string;
      try {
        src = readFileSync(join(DIR, archivoDe(nombre)), 'utf8');
      } catch {
        // El gancho no sigue la convención de nombres (`nodeEditor`,
        // `editPattern`, `measureTool`…): fuera del alcance de este censo.
        continue;
      }
      revisados.push(nombre);
      expect(
        /'Escape'/.test(src),
        `${nombre} está montado en el router y su hook no menciona Escape. `
        + 'O lo atiende, o entra en SIN_ESCAPE con su razón escrita.',
      ).toBe(true);
    }
    // Control: si la convención de nombres cambia, esto deja de revisar nada.
    expect(revisados.length, 'el censo no revisó ningún gancho').toBeGreaterThanOrEqual(4);
  });

  it('la lista de excepciones no crece sin que alguien lo decida', () => {
    expect(Object.keys(SIN_ESCAPE)).toEqual(['offsetTool']);
  });
});
