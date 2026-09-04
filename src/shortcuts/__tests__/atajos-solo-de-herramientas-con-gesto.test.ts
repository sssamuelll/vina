import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SHORTCUTS, ATAJOS_2D_SIN_GESTO } from '../defaults';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F7.
 *
 * Barrido de las 52 teclas (a-z con y sin Shift) contra la app viva: **siete
 * teclas del lienzo 2D meten a María en un modo que no hace absolutamente
 * nada**. En las siete la tira dibuja la cabina de la herramienta (nombre,
 * atajo, opciones) y el cursor se pone en cruz:
 *
 *   c → Editar curvatura · d → Pinza · e → Elipse (círculo) · i → Trazar
 *   p → Medir POM · t → Editar pespunte · w → Fijar
 *
 * Verificado además con un gesto real: con `e` activa, un clic y un arrastre
 * sobre el patrón dejan 5 piezas en 5 y la selección vacía.
 *
 * La ironía medida: #1111 es María pidiendo el círculo — «círculo es
 * indispensable»— mientras la app ya le enseña el selector Círculo/Elipse/Arco
 * de una herramienta que no existe.
 *
 * La causa: `DEFAULT_SHORTCUTS` es una lista escrita a mano y el despachador
 * (`useEditorInteractions.ts`) es una cadena de `if` sin `default`. Nada obliga
 * a que una tecla tenga gesto detrás; TypeScript tampoco avisa, porque el id
 * está en el tipo `Tool2D` y activarlo compila.
 *
 * La regla que falta, ejecutable: **una tecla que activa una herramienta 2D
 * solo existe si el despachador sabe conducirla.** Las que no, se quedan
 * escritas en `ATAJOS_2D_SIN_GESTO` —con su tecla reservada— y no se registran.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F7.
 */

const DESPACHADOR = readFileSync(
  join(process.cwd(), 'src/components/PatternEditor/useEditorInteractions.ts'),
  'utf8',
);

/**
 * Los ids que el despachador conduce de verdad. Dos formas conviven en el
 * archivo y las dos cuentan:
 *   1. `activeTool === 'x'` — la mayoría.
 *   2. `X_TOOL_IDS = new Set([...])` + `.has(activeTool)` — medir y compañía.
 *
 * NO cuenta el `switch` de cursor (`case 'x': return 'default'`): pintar un
 * cursor no es conducir un gesto. Ese fue justamente el ciego que dejó pasar a
 * `topstitchEdit` en la primera lectura de esta revisión.
 */
function idsQueElDespachadorConduce(): Set<string> {
  const ids = new Set<string>();
  for (const m of DESPACHADOR.matchAll(/activeTool\s*===\s*'([A-Za-z0-9]+)'/g)) ids.add(m[1]);
  for (const decl of DESPACHADOR.matchAll(/const\s+([A-Z0-9_]*TOOL_IDS)\s*=\s*new Set\(\[([^\]]*)\]/g)) {
    // Solo si ese Set se consulta con el id activo; si no, es una lista muerta.
    if (!new RegExp(`${decl[1]}\\.has\\(activeTool`).test(DESPACHADOR)) continue;
    for (const lit of decl[2].matchAll(/'([A-Za-z0-9]+)'/g)) ids.add(lit[1]);
  }
  return ids;
}

const CONDUCIDOS = idsQueElDespachadorConduce();

/** Ids de herramienta 2D que hoy tienen tecla registrada. */
const CON_TECLA = DEFAULT_SHORTCUTS
  .filter((s) => s.id.startsWith('tool.') && s.context === '2d')
  .map((s) => ({ ...s, toolId: s.id.slice('tool.'.length) }));

describe('F7 — ninguna tecla activa una herramienta que el despachador no sabe conducir', () => {
  it('el detector no está ciego: el despachador conduce al menos 25 herramientas', () => {
    // Si un refactor cambia la forma de los `if`, este censo se vuelve cero y
    // el resto de la suite pasaría vacío. Que falle aquí, ruidosamente.
    expect(
      CONDUCIDOS.size,
      `solo detecté ${CONDUCIDOS.size} ids conducidos: el regex del censo se quedó ciego`,
    ).toBeGreaterThanOrEqual(25);
    expect(CONDUCIDOS.has('select')).toBe(true);
    expect(CONDUCIDOS.has('measure'), 'measure entra por MEASURE_TOOL_IDS, no por ===').toBe(true);
  });

  it('cada tecla 2D registrada tiene gesto detrás', () => {
    const muertas = CON_TECLA.filter((s) => !CONDUCIDOS.has(s.toolId));
    expect(
      muertas.map((m) => `${m.shift ? '⇧' : ''}${m.key.toUpperCase()} → ${m.toolId} ("${m.label}")`),
      'teclas que meten a la usuaria en un modo inerte',
    ).toEqual([]);
  });

  it('las siete que no tienen gesto quedan escritas, no borradas', () => {
    // Se documentan con su tecla reservada para que, cuando la herramienta
    // exista, el atajo vuelva al sitio que ya era suyo (#1111 es el primero).
    expect(ATAJOS_2D_SIN_GESTO.map((s) => s.id).sort()).toEqual([
      'tool.circle',
      'tool.dart',
      'tool.editConstrain',
      'tool.pin',
      'tool.pomMeasure',
      'tool.topstitchEdit',
      'tool.trace',
    ]);
  });

  it('y ninguna de ellas se cuela también en la lista viva', () => {
    const vivas = new Set(DEFAULT_SHORTCUTS.map((s) => s.id));
    for (const s of ATAJOS_2D_SIN_GESTO) {
      expect(vivas.has(s.id), `${s.id} está en las dos listas a la vez`).toBe(false);
    }
  });

  it('la reserva caduca sola: en cuanto una tenga gesto, este test avisa', () => {
    // Sin esto la lista se pudre. El día que se implemente el círculo (#1111),
    // nada obligaría a devolverle su tecla: seguiría reservada para siempre.
    // Que falle aquí es el recordatorio de moverla de vuelta a DEFAULT_SHORTCUTS.
    const yaImplementadas = ATAJOS_2D_SIN_GESTO
      .map((s) => s.id.slice('tool.'.length))
      .filter((toolId) => CONDUCIDOS.has(toolId));
    expect(
      yaImplementadas,
      'estas herramientas ya tienen gesto: devuélveles su tecla, que está reservada esperándolas',
    ).toEqual([]);
  });

  it('las teclas que quedan libres no se las queda nadie por accidente', () => {
    // c, d, e, i, p, t, w quedan sin dueño. Que ninguna otra acción las tome
    // en silencio: si alguien las quiere, que sea una decisión escrita.
    const libres = new Set(['c', 'd', 'e', 'i', 'p', 't', 'w']);
    const ocupadas = DEFAULT_SHORTCUTS.filter(
      (s) => s.context === '2d' && !s.ctrl && !s.alt && !s.shift && libres.has(s.key),
    );
    expect(ocupadas.map((s) => `${s.key} → ${s.id}`)).toEqual([]);
  });
});

describe('F7 — las herramientas que SÍ funcionan conservan su tecla', () => {
  // La red contra el arreglo perezoso: vaciar la lista también haría pasar el
  // test de arriba. Estas son las trece del dock que María usa hoy.
  const IMPRESCINDIBLES: Array<[string, string]> = [
    ['select', 'z'], ['editPattern', 'q'], ['pen', 'h'], ['rectangle', 's'],
    ['internalShape', 'g'], ['scissors', 'x'], ['measure', 'm'], ['seam', 'n'],
    ['seamEdit', 'b'], ['seamAllowance', 'o'], ['transform', 'a'],
    ['editCurve', 'v'], ['merge', 'j'],
  ];

  it.each(IMPRESCINDIBLES)('%s sigue teniendo su tecla (%s)', (toolId, key) => {
    const s = CON_TECLA.find((x) => x.toolId === toolId);
    expect(s, `${toolId} perdió su atajo`).toBeDefined();
    expect(s!.key).toBe(key);
    expect(CONDUCIDOS.has(toolId), `${toolId} tiene tecla pero el despachador no lo conduce`).toBe(true);
  });

  it('siguen quedando al menos 20 teclas 2D vivas', () => {
    expect(CON_TECLA.length).toBeGreaterThanOrEqual(20);
  });
});
