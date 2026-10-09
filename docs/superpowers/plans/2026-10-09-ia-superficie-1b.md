# La IA de Vina — subproyecto 1, entrega 1b (primera mitad): las manos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un agente pueda cambiar el patrón por la superficie, con siete verbos de «Actuar» (crear pieza, cambiar el contorno, coser, descoser, piquete, borrar, deshacer): cada uno es un paso de Ctrl+Z, deja su entrada en la caja negra y devuelve un recibo cuya medida confirma lo hecho.

**Architecture:**
- **Un solo paso de escribir** (`src/copilot/superficie/actuar.ts`): cada verbo calcula lo que va a escribir, lo mide antes, lo despacha dentro de un lote de deshacer marcado como del agente, y lo vuelve a medir después. Si la medida no confirma, el cambio no se queda.
- **Los verbos son adaptadores finos sobre los escritores de la interfaz**: `conPaths` + `applyNodeMove` (el arrastre de un punto), `cotasDelLado` y `resizePieceTo` (las cotas de largo, ancho y alto), `createMirrorNotchLine` y `resolveNotchAnchorV2` (el piquete a una distancia), y los reductores de siempre.
- **Borrar actúa y ofrece deshacer**: un aviso con «Deshacer» que deshace solo ese paso, y solo si sigue siendo el último (`deshacerDelAgenteMiddleware`).
- **Nadie llama a la superficie todavía.** La entrega 1c le pasa el agente de hoy; el subproyecto 2, el puente MCP. Por eso esta entrega no lleva e2e: no hay puerta en la interfaz que la alcance.

**Tech Stack:** TypeScript, Redux Toolkit, zod 4 (`z.toJSONSchema`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 5.1 «Actuar», § 5.2, § 5.3, § 5.4). La Task 8 le añade la nota de esta entrega en § 5.7.

## Global Constraints

- **Idioma.** La superficie va en inglés: nombres en `snake_case`, descripciones, claves del recibo y textos de los `warnings` (D8). Lo que lee María (el aviso de borrar) va en español de Venezuela, con los textos aprobados por Samuel el 09-10 (decisión 9). Los comentarios del código, en español.
- **No se reescribe geometría.** Todo largo pasa por `computeRangeLengthMM`, `interpolateRangePoint` o `rangoMedibleDeBorde` (lo vigila `scripts/medir-bordes-lint.mjs` dentro de `npm run test`). Las conversiones de pieza, solo por `src/utils/geometry/pieceSpace.ts` (regla `vina/conversion-espacio-de-pieza`).
- **Un escritor por hecho.** Mover un punto, fijar un largo o un tamaño y poner un piquete usan las mismas funciones que la interfaz. Nada de copiar su lógica.
- **Los verbos no van al registro** (`registry.size === 232` está congelado). La superficie es un módulo aparte, y `tests/repo/la-superficie-es-corta.test.ts` limita sus verbos a 24 y sus definiciones a 30.000 caracteres.
- **IDs con `newId()`**; los piquetes que crea `createMirrorNotchLine` llevan su `lineId()` de siempre.
- **No tocar** `useNotchTool.ts`, `SeamRenderer`, la barra de IA, la línea al pie ni componentes del lienzo: P3c trabaja en paralelo sobre ellos (sesión vina-ed, worktree propio).
- **Gates.** `npx tsc -b --noEmit`; nada de `--no-verify`; `node scripts/ui-contract-lint.mjs` no sube ningún contador; cada tarea cierra con la suite entera, redirigida a un archivo.
- **`git add`** con rutas explícitas; nunca `.maria-avatar.mjs`.

## Review Focus

1. **Una pieza girada.** Mover un punto de una pieza con `rotation ≠ 0` lo deja donde se pidió, en espacio de patrón. → Task 3.
2. **Un borde curvo con parametrización desigual.** La pareja de un piquete cae a la distancia de arco que le toca, no al parámetro de la curva. → Task 5.
3. **Un borde recto de varios comandos** (el DXF de María repite vértices). `set_length` no adivina cuál mover: lo dice y propone `move_point`. → Task 3.
4. **El candado de capa** pesa igual que el de la pieza en todo verbo que edita una pieza. → Tasks 3, 6 y 7.
5. **María toca algo entre medias.** `undo` no deshace un paso suyo, y el «Deshacer» del aviso no se lleva un paso que vino después. → Task 7.

## Decisiones de este plan

Afinan la spec sin cambiar su intención. La Task 8 las anota en ella.

1. **El recibo admite medidas anidadas.** `Recibo.measure` es `Record<string, unknown>`: el de `create_piece` lleva la lista de bordes, el de `sew` una costura medida. La spec lo dibujaba plano.
2. **Error o `done: false`.** Un id que no existe o unos argumentos inválidos son un error dicho (`ok: false`), como en la 1a. Lo que el patrón no permite (una pieza bloqueada, una distancia más allá del borde, una medida que no confirma) es un recibo con `done: false` y su porqué. En los dos casos no cambia nada.
3. **Se decide antes de escribir y se mide después.** Cada verbo mide lo que va a escribir antes de despachar (así casi nunca hace falta deshacer) y vuelve a medir el estado de después para el recibo (§ 5.3, regla 2). Si esa segunda medida no confirma, `cerrar` deshace el paso. Ese deshacer deja el paso en «Rehacer»: no hay forma de quitarlo de ahí sin tocar el middleware.
4. **`edit_outline` tiene tres modos**, y cada uno es una cota de la interfaz: `move_point` (el arrastre de un nodo), `set_length` (la cota «Largo» de un lado) y `set_size` (las cotas «Ancho» y «Alto»). `set_length` solo cambia un borde de un único tramo recto: lo demás se mueve con `move_point`. «Alargar un borde» de la spec es `set_length` con el largo nuevo.
5. **`sew` cose en el sentido que le digan.** Sin `reversed`, B va en el mismo sentido que A, como la herramienta de coser de la interfaz (Ctrl+B lo invierte allí). Los tramos se dan en el sentido de su borde; el rango de un B invertido se guarda espejado, en el sentido de cosido (`seamRange.ts`). Una costura del agente lleva `createdBy: 'ai'` (ámbar en 3D, «revísame»).
6. **Las costuras del agente no son «viejas».** `isStaleAiSeam` solo mira las de autoSew (id `auto-seam-`). Antes, toda costura con `createdBy: 'ai'` sin `sewEngine` salía vieja, y «Re-coser» borraba lo que hubiera cosido el agente.
7. **Los rangos de una costura se leen en el sentido de su borde.** `medirCostura` devuelve el rango de un B invertido sin espejar, igual que se le pasa a `sew`. Antes devolvía el guardado.
8. **El piquete con pareja va por la costura que cose ese punto.** `mapNotchAcrossSeam` elige, entre las costuras del borde, la que cose el punto (una copa partida tiene dos); sigue el `reversed` de la costura cuando nadie le pasa `invert`, y pone la pareja a la distancia de arco que le toca. Con `invert` explícito (el panel de la interfaz) se comporta como antes. Si ninguna costura cose el punto, `notch` lo rehúsa.
9. **Los textos que lee María** (aprobados por Samuel el 09-10, revisados con solace-wren):
   - borrar una pieza: «La IA borró Manga 2»;
   - borrar algo de una pieza: «La IA borró un piquete de Delantero» (una pinza, el hilo, una línea de doblez, un pliegue, un pespunte, una línea de referencia, una línea de costura);
   - «Deshacer» cuando ya no puede: «No se deshizo nada porque después hubo otros cambios; usa Deshacer hasta que vuelva lo borrado»;
   - los pasos del historial: «IA: coser Delantero con Espalda» (el «Agente:» de § 5.4 era un ejemplo).
10. **Mover un piquete no mueve su pareja.** Si el piquete tiene una pareja declarada (`notchPairs`), el recibo lo avisa. `pair` solo vale al poner uno nuevo.
11. **`unsew` no avisa.** El aviso es para borrar (§ 5.4); descoser se deshace con Ctrl+Z como cualquier paso.
12. **La segunda mitad de la 1b** queda para su propio plan: `dart`, `seam_allowance`, `classify`, `assign_fabric`, `dress`, `simulate` con `fit_map`, `grade` y `export`.
13. **Coser y descoser una pieza bloqueada se permite**, como en la interfaz (las herramientas de coser no miran el candado): el candado protege la geometría de la pieza (contorno e internas), y una costura es una relación entre piezas. `edit_outline`, `notch` y `remove` sí lo respetan.

## Archivos

| Archivo | Qué |
|---|---|
| `src/copilot/superficie/tipos.ts` | `Recibo`. |
| `src/copilot/superficie/actuar.ts` (nuevo) | `actuar`, `cerrar`, `rehusar`, `cambiosEntre`, `piezaDe`, `estaBloqueada`, `MARGEN_MM`. |
| `src/copilot/superficie/verbos/leer.ts` | Exporta `bordesDe`, `cajaDe`. |
| `src/copilot/superficie/verbos/medir.ts` | Exporta `tramo` y `fraccionesDeTramo`. |
| `src/copilot/superficie/costuras.ts` | El rango de B en el sentido de su borde. |
| `src/copilot/superficie/verbos/pieza.ts` (nuevo) | `create_piece`, `edit_outline`. |
| `src/copilot/superficie/verbos/costura.ts` (nuevo) | `sew`, `unsew`. |
| `src/copilot/superficie/verbos/piquete.ts` (nuevo) | `notch`. |
| `src/copilot/superficie/verbos/borrar.ts` (nuevo) | `remove`, `undo`, los textos del aviso. |
| `src/copilot/superficie/index.ts` | Registra los siete. |
| `src/utils/seam/notchMirror.ts` | `puntoEnElBorde`; `mapNotchAcrossSeam` con la costura del punto, el sentido de la costura y la distancia de arco. |
| `src/utils/autoSew/index.ts` | `isStaleAiSeam` solo para autoSew. |
| `src/store/actions.ts` | `DESHACER_DEL_AGENTE`. |
| `src/store/deshacerDelAgenteMiddleware.ts` (nuevo), `src/store/index.ts` | El puente del «Deshacer» del aviso. |
| `src/copilot/superficie/__tests__/fixtures.ts` | `tienda()`: una tienda de verdad con deshacer. |
| Tests nuevos | `actuar.test.ts`, `pieza.test.ts`, `costura.test.ts`, `piquete.test.ts`, `borrar.test.ts`, `ciclo.maria.test.ts`, `src/store/__tests__/deshacerDelAgente.test.ts`; casos nuevos en `notchMirror.test.ts`, `resewAiSeams.test.ts` y `medir.test.ts`. |
| La spec | La nota de la entrega 1b (Task 8). |

---

### Task 1: El recibo y el paso de escribir

**Files:**
- Create: `src/copilot/superficie/actuar.ts`, `src/copilot/superficie/__tests__/actuar.test.ts`
- Modify: `src/copilot/superficie/tipos.ts`, `src/copilot/superficie/__tests__/fixtures.ts`

**Interfaces:**
- Produces:
  - `interface Recibo { done: boolean; changed: { created: string[]; modified: string[]; deleted: string[] }; measure: Record<string, unknown>; warnings: string[]; revision: { before: number; after: number } }` (en `tipos.ts`);
  - `MARGEN_MM = 0.5`;
  - `cambiosEntre(antes: Proyecto, despues: Proyecto): Recibo['changed']` (piezas, costuras e internas, por id);
  - `interface Escritura { antes: Proyecto; despues: Proyecto; changed: Recibo['changed']; revision: Recibo['revision'] }`;
  - `actuar(ctx: ContextoDeVerbo, verbo: string, etiqueta: string, escribir: () => void): Escritura`; la etiqueta del paso es `IA: ${etiqueta}` y el paso lleva `agent.toolName = verbo`;
  - `cerrar(ctx: ContextoDeVerbo, verbo: string, e: Escritura, r: { done: boolean; measure: Recibo['measure']; warnings: string[] }): Recibo`;
  - `rehusar(warning: string, measure?: Recibo['measure']): Recibo`;
  - `piezaDe(ctx, id): PatternPiece` (lanza `no piece with id …`), `estaBloqueada(ctx, piece): boolean`;
  - en `fixtures.ts`: `tienda(pieces?, seams?, proyecto?, workflow?): { store, ctx }`.

- [ ] **Step 1: La tienda de prueba**

Añade a `src/copilot/superficie/__tests__/fixtures.ts`:

```ts
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import workflowReducer from '../../../store/workflowSlice';
import { confirmationMiddleware } from '../../../store/confirmationMiddleware';
import { linkedEditingMiddleware } from '../../../store/linkedEditingMiddleware';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { seguirLaRevision } from '../../../store/revisionDelProyecto';

/**
 * Una tienda de verdad con lo que toca un verbo de «Actuar»: deshacer, la
 * confirmación de borrados y los vínculos entre piezas. El historial de
 * deshacer es del módulo, así que cada tienda empieza sin pasos.
 */
export function tienda(
  pieces: PatternPiece[] = [],
  seams: Seam[] = [],
  proyecto: Record<string, unknown> = {},
  workflow: Record<string, unknown> = {},
) {
  const inicio = { type: '@@prueba/inicio' };
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer, workflow: workflowReducer },
    preloadedState: {
      project: { ...projectReducer(undefined, inicio), pieces, seams, ...proyecto },
      workflow: { ...workflowReducer(undefined, inicio), ...workflow },
    } as never,
    middleware: g => g({ serializableCheck: false, immutableCheck: false })
      .concat(confirmationMiddleware, linkedEditingMiddleware, undoMiddleware),
  });
  store.dispatch({ type: 'prueba/historiaNueva', meta: { resetUndoHistory: true } });
  seguirLaRevision(store);
  const ctx: ContextoDeVerbo = {
    getState: () => store.getState() as unknown as RootState,
    dispatch: store.dispatch as unknown as ContextoDeVerbo['dispatch'],
    origen: 'vina',
  };
  return { store, ctx };
}
```

(La Task 7 le añade `deshacerDelAgenteMiddleware` a la cadena.)

- [ ] **Step 2: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/actuar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { undo } from '../../../store/editorSlice';
import { addInternalLine, addPiece, updatePiece } from '../../../store/projectSlice';
import { actuar, cambiosEntre, cerrar, estaBloqueada, rehusar } from '../actuar';
import { pieza, piquete, tienda } from './fixtures';

describe('actuar: el paso de escribir de todo verbo', () => {
  it('un verbo es un solo paso de deshacer, con su nombre y marcado como del agente', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    actuar(ctx, 'prueba', 'renombrar dos veces', () => {
      ctx.dispatch(updatePiece({ ...ctx.getState().project.pieces[0], name: 'uno' }));
      ctx.dispatch(updatePiece({ ...ctx.getState().project.pieces[0], name: 'dos' }));
    });
    const { past } = getHistory();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ label: 'IA: renombrar dos veces', agent: { toolName: 'prueba' } });
    store.dispatch(undo());
    expect(store.getState().project.pieces[0].name).toBe('a');
  });

  it('dice qué cambió por id, y la revisión de antes y de después', () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    expect(e.changed).toEqual({ created: ['b'], modified: [], deleted: [] });
    expect(e.revision.after).toBe(e.revision.before + 1);
  });

  it('si falla a medias, deshace lo que alcanzó a escribir y deja salir el error', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    expect(() => actuar(ctx, 'prueba', 'romper', () => {
      ctx.dispatch(addPiece(pieza('b', [50])));
      throw new Error('a medias');
    })).toThrow('a medias');
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a']);
  });
});

describe('cambiosEntre', () => {
  it('una interna nueva es «created», y su pieza «modified»', () => {
    const { store } = tienda([pieza('a', [100])]);
    const antes = store.getState().project;
    store.dispatch(addInternalLine({ pieceId: 'a', line: piquete('n1', 30) }));
    expect(cambiosEntre(antes, store.getState().project)).toEqual({ created: ['n1'], modified: ['a'], deleted: [] });
  });
});

describe('cerrar', () => {
  it('si la medida no confirma lo pedido, deshace el paso y lo dice', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    const r = cerrar(ctx, 'prueba', e, { done: false, measure: {}, warnings: ['measured 40 mm, asked 50 mm'] });
    expect(r).toMatchObject({ done: false, changed: { created: [], modified: [], deleted: [] } });
    expect(r.warnings).toEqual(['measured 40 mm, asked 50 mm', 'the change was undone']);
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a']);
  });
  it('si confirma, el recibo lleva lo que cambió', () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    expect(cerrar(ctx, 'prueba', e, { done: true, measure: { x: 1 }, warnings: [] })).toMatchObject({
      done: true, changed: { created: ['b'] }, measure: { x: 1 },
    });
  });
});

describe('rehusar y el candado', () => {
  it('rehusar no cambia nada y dice por qué', () => {
    expect(rehusar('piece is locked')).toMatchObject({
      done: false, changed: { created: [], modified: [], deleted: [] }, warnings: ['piece is locked'],
    });
  });
  it('el candado de la capa pesa igual que el de la pieza', () => {
    const { ctx } = tienda([pieza('a', [100], { layer: 2 }), pieza('b', [100], { locked: true }), pieza('c', [100])], [], { layerLocked: { 2: true } });
    const [a, b, c] = ctx.getState().project.pieces;
    expect([estaBloqueada(ctx, a), estaBloqueada(ctx, b), estaBloqueada(ctx, c)]).toEqual([true, true, false]);
  });
});
```

- [ ] **Step 3: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/actuar.test.ts`
Expected: FAIL — `Failed to resolve import "../actuar"`.

- [ ] **Step 4: El recibo**

Añade a `src/copilot/superficie/tipos.ts`:

```ts
/**
 * Lo que devuelve todo verbo de «Actuar» (spec § 5.2). `measure` es propia de
 * cada verbo y puede anidar —los bordes de una pieza, una costura medida—: el
 * `Record` plano de la spec no cabía en el recibo de `create_piece`.
 */
export interface Recibo {
  /** true solo si la medida confirma el resultado (§ 5.3). */
  done: boolean;
  /** Qué cambió, por id: piezas, costuras e internas. */
  changed: { created: string[]; modified: string[]; deleted: string[] };
  /** La medida del resultado, calculada después del cambio. */
  measure: Record<string, unknown>;
  /** Lo que no cuadra, con números. */
  warnings: string[];
  /** La revisión del proyecto antes y después: el agente ve si María tocó algo en medio. */
  revision: { before: number; after: number };
}
```

- [ ] **Step 5: El paso de escribir**

Crea `src/copilot/superficie/actuar.ts`:

```ts
import type { RootState } from '../../store';
import type { PatternPiece } from '../../types/types';
import { batchUndo, withAgentHistorySource } from '../../store/undoMiddleware';
import { undo } from '../../store/editorSlice';
import { revisionDelProyecto } from '../../store/revisionDelProyecto';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import type { ContextoDeVerbo, Recibo } from './tipos';

type Proyecto = RootState['project'];

/** El margen con que una medida confirma lo pedido (spec § 5.3, regla 1). */
export const MARGEN_MM = 0.5;

const NADA: Recibo['changed'] = { created: [], modified: [], deleted: [] };

/**
 * Qué cambió entre dos estados del proyecto, por id: piezas, costuras e
 * internas. El estado es inmutable: otra referencia es otro valor.
 */
export function cambiosEntre(antes: Proyecto, despues: Proyecto): Recibo['changed'] {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const comparar = <T extends { id: string }>(a: readonly T[], b: readonly T[]) => {
    const previos = new Map(a.map(x => [x.id, x]));
    const ids = new Set<string>();
    for (const x of b) {
      ids.add(x.id);
      const previo = previos.get(x.id);
      if (!previo) created.push(x.id);
      else if (previo !== x) modified.push(x.id);
    }
    for (const id of previos.keys()) if (!ids.has(id)) deleted.push(id);
  };
  comparar(antes.pieces, despues.pieces);
  comparar(antes.seams, despues.seams);
  comparar(antes.pieces.flatMap(p => p.internals), despues.pieces.flatMap(p => p.internals));
  return { created, modified, deleted };
}

export interface Escritura {
  antes: Proyecto;
  despues: Proyecto;
  changed: Recibo['changed'];
  revision: Recibo['revision'];
}

/**
 * El paso único de todo verbo que escribe (spec § 5.4): un lote de deshacer
 * con su nombre («IA: coser Delantero con Espalda»), marcado como del agente
 * para que `undo` sepa de quién es. Nada cambia a medias (§ 5.3, regla 3): si
 * `escribir` falla después de despachar algo, se deshace y el error sale.
 */
export function actuar(ctx: ContextoDeVerbo, verbo: string, etiqueta: string, escribir: () => void): Escritura {
  const antes = ctx.getState().project;
  const before = revisionDelProyecto();
  const fallo: { hubo: boolean; error?: unknown } = { hubo: false };
  withAgentHistorySource(verbo, () => {
    batchUndo(ctx.dispatch, `IA: ${etiqueta}`, () => {
      try {
        escribir();
      } catch (error) {
        fallo.hubo = true;
        fallo.error = error;
      }
    });
    if (fallo.hubo && ctx.getState().project !== antes) ctx.dispatch(undo());
  });
  if (fallo.hubo) throw fallo.error;
  const despues = ctx.getState().project;
  return { antes, despues, changed: cambiosEntre(antes, despues), revision: { before, after: revisionDelProyecto() } };
}

/**
 * El recibo de un verbo que ya escribió. Si la medida de después no confirma
 * lo pedido, el cambio no se queda (§ 5.3, reglas 1 y 3). Ese deshacer deja el
 * paso en «Rehacer».
 */
export function cerrar(
  ctx: ContextoDeVerbo,
  verbo: string,
  e: Escritura,
  r: { done: boolean; measure: Recibo['measure']; warnings: string[] },
): Recibo {
  if (r.done || e.despues === e.antes) {
    return { done: r.done, changed: e.changed, measure: r.measure, warnings: r.warnings, revision: e.revision };
  }
  withAgentHistorySource(verbo, () => { ctx.dispatch(undo()); });
  return {
    done: false,
    changed: NADA,
    measure: r.measure,
    warnings: [...r.warnings, 'the change was undone'],
    revision: { before: e.revision.before, after: revisionDelProyecto() },
  };
}

/** Lo que el patrón no permite: nada cambia, y el recibo dice por qué. */
export function rehusar(warning: string, measure: Recibo['measure'] = {}): Recibo {
  const r = revisionDelProyecto();
  return { done: false, changed: NADA, measure, warnings: [warning], revision: { before: r, after: r } };
}

export function piezaDe(ctx: ContextoDeVerbo, id: string): PatternPiece {
  const piece = ctx.getState().project.pieces.find(p => p.id === id);
  if (!piece) throw new Error(`no piece with id ${id}`);
  return piece;
}

/** Una pieza bloqueada no se toca (§ 5.3, regla 4): pesa el candado de la pieza y el de su capa. */
export function estaBloqueada(ctx: ContextoDeVerbo, piece: PatternPiece): boolean {
  return piezaBloqueada(piece, ctx.getState().project.layerLocked);
}
```

- [ ] **Step 6: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/actuar.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Gates y commit**

```bash
npx tsc -b --noEmit && npx vitest run src/copilot/superficie > /tmp/1b-t1.log 2>&1; tail -5 /tmp/1b-t1.log
git add src/copilot/superficie/actuar.ts src/copilot/superficie/tipos.ts src/copilot/superficie/__tests__/actuar.test.ts src/copilot/superficie/__tests__/fixtures.ts
git commit -m "feat(superficie): el recibo y el paso de escribir de los verbos de actuar"
```

---

### Task 2: `create_piece`

**Files:**
- Create: `src/copilot/superficie/verbos/pieza.ts`, `src/copilot/superficie/__tests__/pieza.test.ts`
- Modify: `src/copilot/superficie/verbos/leer.ts` (exporta `bordesDe` y `cajaDe`)

**Interfaces:**
- Consumes: `actuar`, `cerrar` (Task 1).
- Produces: `VERBOS_DE_PIEZA: readonly Verbo[]` (aquí `create_piece`; la Task 3 añade `edit_outline`); en `leer.ts`, `export function bordesDe(piece)` y `export function cajaDe(piece)`.

- [ ] **Step 1: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/pieza.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_PIEZA } from '../verbos/pieza';
import { pieza, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PIEZA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('create_piece', () => {
  it('un rectángulo por medidas: el recibo trae su ancho, su alto, su área y sus bordes, que suman el perímetro', async () => {
    const { store, ctx } = tienda();
    const r = await actuarCon(ctx, 'create_piece', { name: 'Bolsillo', rectangle: { width: 120, height: 80, x: 10, y: 20 } });
    expect(r).toMatchObject({ done: true, measure: { name: 'Bolsillo', width: 120, height: 80, area: 9600 } });
    const bordes = r.measure.edges as Array<{ length: number }>;
    expect(bordes.reduce((s, b) => s + b.length, 0)).toBeCloseTo(400, 1);
    const creada = store.getState().project.pieces[0];
    expect(creada.seamAllowance).toBe(0);
    expect(r.changed.created).toEqual([creada.id]);
  });

  it('un polígono por sus puntos, en espacio de patrón', async () => {
    const { ctx } = tienda();
    const r = await actuarCon(ctx, 'create_piece', { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] });
    expect(r).toMatchObject({ done: true, measure: { width: 100, height: 100, area: 5000 } });
  });

  it('sin sitio pedido nace a la derecha de lo que hay, sin pisarlo', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    await actuarCon(ctx, 'create_piece', { rectangle: { width: 50, height: 50 } });
    const nueva = store.getState().project.pieces[1];
    const xs = nueva.outline.filter(c => c.values.length >= 2).map(c => c.values[0] + nueva.position.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(150);
  });

  it('sin nombre se llama «Pieza N», y es un paso de deshacer con su nombre', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, 'create_piece', { rectangle: { width: 50, height: 50 } });
    expect(r.measure.name).toBe('Pieza 2');
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: crear Pieza 2', agent: { toolName: 'create_piece' } });
  });

  it('unos puntos que no encierran un área: error dicho, nada creado', async () => {
    const { store, ctx } = tienda();
    const r = await ejecutarVerbo(VERBOS_DE_PIEZA, 'create_piece', { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] }, ctx);
    expect(r).toMatchObject({ ok: false, error: 'the points do not enclose an area' });
    expect(store.getState().project.pieces).toHaveLength(0);
  });

  it('rectángulo y puntos a la vez, o ninguno: error de argumentos', async () => {
    const { ctx } = tienda();
    for (const args of [{}, { rectangle: { width: 1, height: 1 }, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }]) {
      const r = await ejecutarVerbo(VERBOS_DE_PIEZA, 'create_piece', args, ctx);
      expect(r.ok === false && r.error).toMatch(/give rectangle or points/);
    }
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/pieza.test.ts`
Expected: FAIL — `Failed to resolve import "../verbos/pieza"`.

- [ ] **Step 3: Exportar las medidas de `leer.ts`**

En `src/copilot/superficie/verbos/leer.ts`, cambia `function bordesDe(` por `export function bordesDe(` y `function cajaDe(` por `export function cajaDe(`.

- [ ] **Step 4: El verbo**

Crea `src/copilot/superficie/verbos/pieza.ts`:

```ts
import { z } from 'zod';
import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addPiece } from '../../../store/projectSlice';
import { newId } from '../../../utils/ids';
import { draftedPieceDefaults } from '../../../utils/defaults';
import { computeArea } from '../../../utils/nesting/nestingEngine';
import { computeBoundingBox } from '../../../utils/geometry/transform';
import { actuar, cerrar } from '../actuar';
import { unDecimal } from '../costuras';
import { bordesDe, cajaDe } from './leer';

const punto = z.object({ x: z.number(), y: z.number() });

/** Donde nace una pieza sin sitio pedido: a la derecha de todo, con 50 mm de aire. */
function sitioLibre(pieces: readonly PatternPiece[]): Point2D {
  const caja = pieces.length > 0 ? computeBoundingBox([...pieces], pieces.map(p => p.id)) : null;
  return caja ? { x: caja.x + caja.width + 50, y: caja.y } : { x: 0, y: 0 };
}

const createPiece = definirVerbo({
  name: 'create_piece',
  description:
    'Create a piece: a rectangle from its width and height (x, y is its top-left corner; default: to the right of every piece), or a polygon from its corners in order. Pattern space, mm. The piece is born net (seam allowance 0) and its edges are detected. Returns its id, width, height, area and every edge measured.',
  args: z.object({
    name: z.string().min(1).optional().describe('default "Pieza N"'),
    rectangle: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      x: z.number().optional(),
      y: z.number().optional(),
    }).optional(),
    points: z.array(punto).min(3).optional().describe('the corners in order, pattern space, mm'),
  }).refine(a => (a.rectangle ? 1 : 0) + (a.points ? 1 : 0) === 1, { message: 'give rectangle or points, one of them' }),
  run: (args, ctx) => {
    const { pieces } = ctx.getState().project;
    const name = args.name ?? `Pieza ${pieces.length + 1}`;
    let outline: PathCommand[];
    if (args.rectangle) {
      const { width: w, height: h } = args.rectangle;
      const libre = sitioLibre(pieces);
      const x = args.rectangle.x ?? libre.x;
      const y = args.rectangle.y ?? libre.y;
      // El mismo contorno que la herramienta Rectángulo (`useRectangleTool`).
      outline = [
        { type: 'M', values: [x, y] },
        { type: 'L', values: [x + w, y] },
        { type: 'L', values: [x + w, y + h] },
        { type: 'L', values: [x, y + h] },
        { type: 'Z', values: [] },
      ];
    } else {
      const [primero, ...resto] = args.points!;
      outline = [
        { type: 'M', values: [primero.x, primero.y] },
        ...resto.map(p => ({ type: 'L' as const, values: [p.x, p.y] })),
        { type: 'Z', values: [] },
      ];
      if (computeArea(outline) < 1) throw new Error('the points do not enclose an area');
    }
    const ahora = Date.now();
    const piece: PatternPiece = { id: newId(), name, outline, ...draftedPieceDefaults(), createdAt: ahora, updatedAt: ahora };
    const e = actuar(ctx, 'create_piece', `crear ${name}`, () => { ctx.dispatch(addPiece(piece)); });
    const creada = e.despues.pieces.find(p => p.id === piece.id);
    const area = creada ? computeArea(creada.outline) : 0;
    return cerrar(ctx, 'create_piece', e, {
      done: area > 0,
      measure: creada
        ? { piece_id: creada.id, name: creada.name, ...cajaDe(creada), area: unDecimal(area), edges: bordesDe(creada) }
        : {},
      warnings: creada?.edges?.length ? [] : ['the piece has no detected edges'],
    });
  },
});

export const VERBOS_DE_PIEZA: readonly Verbo[] = [createPiece];
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/pieza.test.ts src/copilot/superficie/__tests__/leer.test.ts`
Expected: PASS.

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npx vitest run src/copilot/superficie > /tmp/1b-t2.log 2>&1; tail -5 /tmp/1b-t2.log
git add src/copilot/superficie/verbos/pieza.ts src/copilot/superficie/verbos/leer.ts src/copilot/superficie/__tests__/pieza.test.ts
git commit -m "feat(superficie): create_piece — rectángulo o polígono, con su recibo medido"
```

---

### Task 3: `edit_outline`

**Files:**
- Modify: `src/copilot/superficie/verbos/pieza.ts`, `src/copilot/superficie/__tests__/pieza.test.ts`

**Interfaces:**
- Consumes: `piezaDe`, `estaBloqueada`, `rehusar`, `actuar`, `cerrar`, `MARGEN_MM` (Task 1); `bordesDe`, `cajaDe` (Task 2); `medirCostura` (1a).
- Produces: `edit_outline` en `VERBOS_DE_PIEZA`.

- [ ] **Step 1: Los tests (rojo)**

Añade a `pieza.test.ts` (y `costura` al import de `./fixtures`; `ejecutarVerbo` ya está):

```ts
import { VERBOS_DE_LEER } from '../verbos/leer';

/** El punto `index` de una pieza, en espacio de patrón, como lo lee `read_piece`. */
const puntoLeido = async (ctx: ReturnType<typeof tienda>['ctx'], id: string, index: number) => {
  const r = await ejecutarVerbo(VERBOS_DE_LEER, 'read_piece', { piece_id: id }, ctx);
  if (!r.ok) throw new Error(r.error);
  return (r.result as { points: Array<{ index: number; x: number; y: number }> }).points.find(p => p.index === index);
};

describe('edit_outline', () => {
  it('move_point lleva el punto donde se pide, y el recibo dice qué bordes cambiaron y cómo quedó su costura', async () => {
    const { ctx } = tienda([pieza('a', [100]), pieza('b', [60])], [costura({ pieceA: { pieceId: 'a', edgeName: 'right' }, pieceB: { pieceId: 'b', edgeName: 'right' } })]);
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'move_point', point_index: 2, to: { x: 100, y: 80 } });
    expect(r.done).toBe(true);
    expect(r.measure.edges_changed).toEqual([{ name: 'right', before: 50, after: 80 }]);
    expect(r.measure.seams).toMatchObject([{ id: 's1', a: { length: 80 }, b: { length: 50 } }]);
    expect(await puntoLeido(ctx, 'a', 2)).toMatchObject({ x: 100, y: 80 });
  });

  it('en una pieza girada, el punto queda donde se pidió, en espacio de patrón', async () => {
    const { ctx } = tienda([pieza('a', [100], { rotation: 30, position: { x: 40, y: 10 } })]);
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'move_point', point_index: 2, to: { x: 200, y: 150 } });
    expect(r.done).toBe(true);
    expect(await puntoLeido(ctx, 'a', 2)).toMatchObject({ x: 200, y: 150 });
  });

  it('set_length cambia el largo de un borde de un tramo recto, desde su inicio y en su dirección', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'set_length', edge: 'top', length: 150 });
    expect(r).toMatchObject({ done: true, measure: { length: 150 } });
    expect(await puntoLeido(ctx, 'a', 1)).toMatchObject({ x: 150, y: 0 });
  });

  it('set_length no adivina en un borde de varios tramos: lo dice y propone move_point', async () => {
    const { store, ctx } = tienda([pieza('a', [50, 80, 100])]);
    const antes = store.getState().project;
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'set_length', edge: 'top', length: 150 });
    expect(r.done).toBe(false);
    expect(r.warnings[0]).toMatch(/^edge top has 3 segments; .*move_point/);
    expect(store.getState().project).toBe(antes);
  });

  it('set_size escala la pieza al ancho y al alto pedidos, como las cotas Ancho y Alto', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'set_size', width: 200 });
    expect(r).toMatchObject({ done: true, measure: { width: 200, height: 50 } });
  });

  it('una pieza bloqueada, por ella o por su capa, no se toca', async () => {
    const { store, ctx } = tienda([pieza('a', [100], { layer: 3 })], [], { layerLocked: { 3: true } });
    const antes = store.getState().project;
    const r = await actuarCon(ctx, 'edit_outline', { piece_id: 'a', mode: 'set_size', width: 200 });
    expect(r).toMatchObject({ done: false, warnings: ['piece is locked'] });
    expect(store.getState().project).toBe(antes);
  });

  it('a cada modo le faltan sus argumentos: error dicho', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const r = await ejecutarVerbo(VERBOS_DE_PIEZA, 'edit_outline', { piece_id: 'a', mode: 'move_point' }, ctx);
    expect(r.ok === false && r.error).toMatch(/move_point needs point_index and to/);
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/pieza.test.ts`
Expected: FAIL — `unknown verb: edit_outline`.

- [ ] **Step 3: El verbo**

Añade a `src/copilot/superficie/verbos/pieza.ts` (y a sus imports `updatePiece`, `patternToPieceLocal`/`pieceLocalToPattern` de `../../../utils/geometry/pieceSpace`, `computeRangeLengthMM`, `rangoMedibleDeBorde`, y de la Task 1 `piezaDe`, `estaBloqueada`, `rehusar`, `MARGEN_MM`, `type Escritura`, más `medirCostura`):

```ts
import { applyNodeMove } from '../../../components/PatternEditor/nodeEditorUtils';
import { CLAVE_CONTORNO, conPaths } from '../../../components/PatternEditor/lineaEditable';
import { cotasDelLado } from '../../../components/PatternEditor/cotas/cotas';
import { segmentPolar } from '../../../components/PatternEditor/cotas/segmentPolar';
import { resizePieceTo } from '../../../components/PatternEditor/pieceResize';

/**
 * La pieza con un nodo del contorno en otro sitio: el mismo escritor que el
 * arrastre y la cota de un lado (`useEditPattern.moveNodeTo`), con su
 * compensación de pivote y el re-anclado de los piquetes. `destino` es local.
 */
function conNodoEn(piece: PatternPiece, commandIndex: number, destino: Point2D): PatternPiece {
  return conPaths(piece, new Map([[CLAVE_CONTORNO, applyNodeMove(piece.outline, commandIndex, 'anchor', destino)]]));
}

/** El tramo recto que ES un borde: el índice de su cota «Largo», o por qué no lo hay. */
function ladoRecto(piece: PatternPiece, edge: string): number | string {
  const borde = piece.edges?.find(e => e.name === edge);
  if (!borde) throw new Error(`piece ${piece.id} has no edge named ${edge}`);
  const [d0, d1] = rangoMedibleDeBorde(piece.outline, borde.segmentRange);
  const tramos = segmentPolar(piece.outline).filter(s => s.drawCommandIndex >= d0 && s.drawCommandIndex < d1);
  const largo = computeRangeLengthMM(piece.outline, borde.segmentRange);
  if (tramos.length !== 1 || Math.abs(tramos[0].lengthMm - largo) > 0.01) {
    return `edge ${edge} has ${tramos.length} segments; set_length changes an edge of one straight segment: move its end point with move_point`;
  }
  return tramos[0].toCommandIndex;
}

/** Dónde queda el nodo `index` de una pieza, en espacio de patrón. */
function nodoEnPatron(piece: PatternPiece, index: number): Point2D | null {
  const v = piece.outline[index]?.values;
  return v && v.length >= 2 ? pieceLocalToPattern({ x: v[v.length - 2], y: v[v.length - 1] }, piece) : null;
}

// El esquema va aparte: `medidaDelContorno` necesita su tipo, y sacarlo del
// verbo ya declarado sería una referencia circular.
const argsDeContorno = z.object({
  piece_id: z.string().describe('a piece id from read_pattern'),
  mode: z.enum(['move_point', 'set_length', 'set_size']),
  point_index: z.number().int().min(0).optional().describe('move_point: an outline point index from read_piece'),
  to: punto.optional().describe('move_point: where the point goes, pattern space, mm'),
  edge: z.string().optional().describe('set_length: an edge name from read_pattern'),
  length: z.number().positive().optional().describe('set_length: the new length, mm'),
  width: z.number().positive().optional().describe('set_size: the new width, mm'),
  height: z.number().positive().optional().describe('set_size: the new height, mm'),
}).superRefine((a, issues) => {
  const falta = (m: string) => issues.addIssue({ code: 'custom', message: m });
  if (a.mode === 'move_point' && (a.point_index == null || !a.to)) falta('move_point needs point_index and to');
  if (a.mode === 'set_length' && (!a.edge || a.length == null)) falta('set_length needs edge and length');
  if (a.mode === 'set_size' && a.width == null && a.height == null) falta('set_size needs width or height');
});
type ArgsDeContorno = z.output<typeof argsDeContorno>;

const editOutline = definirVerbo({
  name: 'edit_outline',
  description:
    'Change the outline of a piece, the way its handles and dimensions do in the editor. Modes: move_point (an outline point by its index from read_piece, to a point in pattern space); set_length (an edge made of one straight segment gets a new length, keeping its start and its direction); set_size (the width and/or height of the piece, scaling it). Returns the edges that changed, with their lengths before and after, and every seam that uses them, measured again.',
  args: argsDeContorno,
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    let nueva: PatternPiece;
    let etiqueta: string;
    if (args.mode === 'move_point') {
      const cmd = piece.outline[args.point_index!];
      if (!cmd || cmd.values.length < 2) throw new Error(`point ${args.point_index} is not an outline point of piece ${piece.id}`);
      nueva = conNodoEn(piece, args.point_index!, patternToPieceLocal(args.to!, piece));
      etiqueta = `mover un punto de ${piece.name}`;
    } else if (args.mode === 'set_length') {
      const lado = ladoRecto(piece, args.edge!);
      if (typeof lado === 'string') return rehusar(lado);
      const update = cotasDelLado(piece, lado).find(c => c.kind === 'tramo-largo')?.apply(args.length!);
      if (!update || update.kind !== 'nodo') return rehusar(`edge ${args.edge} cannot take a length of ${args.length} mm`);
      nueva = conNodoEn(piece, update.commandIndex, update.destino);
      etiqueta = `cambiar el largo de un borde de ${piece.name}`;
    } else {
      const caja = computeBoundingBox([piece], [piece.id]);
      const update = caja ? resizePieceTo(piece, args.width ?? caja.width, args.height ?? caja.height) : null;
      if (!update) return rehusar('the piece has no size to change');
      nueva = { ...piece, outline: update.outline, position: update.position, rotation: update.rotation, internals: update.internals, updatedAt: Date.now() };
      etiqueta = `cambiar el tamaño de ${piece.name}`;
    }

    // Se decide antes de escribir; el recibo se mide después (spec § 5.3).
    const previa = medidaDelContorno(args, nueva);
    if (!previa.done) return rehusar(previa.warning);
    const e = actuar(ctx, 'edit_outline', etiqueta, () => { ctx.dispatch(updatePiece(nueva)); });
    const despues = e.despues.pieces.find(p => p.id === piece.id)!;
    const final = medidaDelContorno(args, despues);
    return cerrar(ctx, 'edit_outline', e, {
      done: final.done,
      measure: { piece_id: piece.id, ...final.measure, ...cambiosDeBordes(piece, despues, e) },
      warnings: final.done ? [] : [final.warning],
    });
  },
});

/** Lo que cada modo pidió, medido sobre una pieza: ¿lo cumple? */
function medidaDelContorno(args: ArgsDeContorno, piece: PatternPiece): { done: boolean; measure: Record<string, unknown>; warning: string } {
  if (args.mode === 'move_point') {
    const p = nodoEnPatron(piece, args.point_index!);
    const lejos = p ? Math.hypot(p.x - args.to!.x, p.y - args.to!.y) : Infinity;
    return {
      done: lejos <= MARGEN_MM,
      measure: { point: p ? { x: unDecimal(p.x), y: unDecimal(p.y) } : null },
      warning: `point ${args.point_index} lands ${unDecimal(lejos)} mm from where it was asked`,
    };
  }
  if (args.mode === 'set_length') {
    const borde = piece.edges?.find(e => e.name === args.edge);
    const largo = borde ? computeRangeLengthMM(piece.outline, borde.segmentRange) : NaN;
    return {
      done: Math.abs(largo - args.length!) <= MARGEN_MM,
      measure: { edge: args.edge, length: unDecimal(largo) },
      warning: `edge ${args.edge} measures ${unDecimal(largo)} mm, asked ${args.length} mm`,
    };
  }
  const caja = computeBoundingBox([piece], [piece.id]);
  const w = caja?.width ?? NaN;
  const h = caja?.height ?? NaN;
  const ok = (pedido: number | undefined, medido: number) => pedido == null || Math.abs(medido - pedido) <= MARGEN_MM;
  return {
    done: ok(args.width, w) && ok(args.height, h),
    measure: { width: unDecimal(w), height: unDecimal(h) },
    warning: `the piece measures ${unDecimal(w)} × ${unDecimal(h)} mm`,
  };
}

/** Los bordes que cambiaron de largo, y cada costura que los usa, medida otra vez. */
function cambiosDeBordes(antes: PatternPiece, despues: PatternPiece, e: Escritura) {
  const previos = new Map(bordesDe(antes).map(b => [b.name, b.length]));
  const tocados = bordesDe(despues).filter(b => previos.get(b.name) !== b.length);
  const nombres = new Set(tocados.map(b => b.name));
  const usa = (lado: { pieceId: string; edgeName: string }) => lado.pieceId === despues.id && nombres.has(lado.edgeName);
  return {
    edges_changed: tocados.map(b => ({ name: b.name, before: previos.get(b.name) ?? null, after: b.length })),
    seams: e.despues.seams.filter(s => usa(s.pieceA) || usa(s.pieceB)).map(s => medirCostura(s, e.despues.pieces)),
  };
}

export const VERBOS_DE_PIEZA: readonly Verbo[] = [createPiece, editOutline];
```

(Quita la línea `export const VERBOS_DE_PIEZA` de la Task 2: la de arriba la sustituye.)

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/pieza.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npx vitest run src/copilot/superficie > /tmp/1b-t3.log 2>&1; tail -5 /tmp/1b-t3.log
git add src/copilot/superficie/verbos/pieza.ts src/copilot/superficie/__tests__/pieza.test.ts
git commit -m "feat(superficie): edit_outline — mover un punto, fijar un largo o un tamaño, con las cotas de la interfaz"
```

---

### Task 4: `sew` y `unsew`; las costuras del agente dejan de ser viejas

**Files:**
- Create: `src/copilot/superficie/verbos/costura.ts`, `src/copilot/superficie/__tests__/costura.test.ts`
- Modify: `src/copilot/superficie/costuras.ts:30-58`, `src/copilot/superficie/verbos/medir.ts:14-49`, `src/copilot/superficie/__tests__/medir.test.ts`, `src/utils/autoSew/index.ts:39-55`, `src/store/__tests__/resewAiSeams.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `VERBOS_DE_COSTURA: readonly Verbo[]` (`sew`, `unsew`); en `medir.ts`, `export const tramo` y `export function fraccionesDeTramo(t: Tramo, ctx: ContextoDeVerbo): { piece: PatternPiece; edgeLength: number; desde: number; hasta: number }` (fracciones del borde, ordenadas).

- [ ] **Step 1: Los tests (rojo)**

Añade a `src/copilot/superficie/__tests__/medir.test.ts`:

```ts
describe('medirCostura lee los rangos en el sentido de su borde', () => {
  it('un B invertido guarda su rango en el sentido de cosido, y se lee espejado', async () => {
    const seam = costura({ pieceB: { pieceId: 'b', edgeName: 'top', tStart: 0, tEnd: 0.4, reversed: true } });
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'walk_seam', { seam_id: 's1' }, contexto([pieza('a', [100]), pieza('b', [100])], [seam]));
    expect(r.ok && r.result).toMatchObject({ b: { t_start: 0.6, t_end: 1, reversed: true, length: 40 } });
  });
});
```

Añade a `src/store/__tests__/resewAiSeams.test.ts`, dentro de `describe('el motor 2 solo cambió dónde se parte la copa')`:

```ts
  it('lo que cose el agente no es del motor: no está viejo y «Re-coser» no lo toca', () => {
    expect(isStaleAiSeam({ ...ia(), id: '3f6c1d2e-agente', sewEngine: undefined })).toBe(false);
  });
```

Crea `src/copilot/superficie/__tests__/costura.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { isStaleAiSeam } from '../../../utils/autoSew';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_COSTURA } from '../verbos/costura';
import { costura, pieza, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_COSTURA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('sew', () => {
  it('cose dos bordes enteros: el recibo mide los dos lados, la diferencia y si camina', async () => {
    const { store, ctx } = tienda([pieza('a', [50, 80, 100]), pieza('b', [20, 50, 110])]);
    const r = await actuarCon(ctx, 'sew', { a: { piece_id: 'a', edge: 'top' }, b: { piece_id: 'b', edge: 'top' } });
    expect(r).toMatchObject({ done: true, measure: { seam: { a: { length: 100 }, b: { length: 110 }, delta: 10, walks: false } } });
    expect(r.warnings).toEqual(['the seam does not walk: 100 mm against 110 mm, 10 mm apart (tolerance 3 mm)']);
    const [s] = store.getState().project.seams;
    expect(s).toMatchObject({ createdBy: 'ai', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' } });
    expect(s.pieceA).not.toHaveProperty('tStart');
    expect(isStaleAiSeam(s)).toBe(false);
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: coser a con b', agent: { toolName: 'sew' } });
  });

  it('cose tramos: fracciones o puntos del borde, en el sentido de cada borde', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: 'a', edge: 'top', from: 0, to: 0.5 },
      b: { piece_id: 'b', edge: 'top', from: { x: 50, y: 0 }, to: { x: 100, y: 0 } },
    });
    expect(r).toMatchObject({ done: true, measure: { seam: { a: { length: 50 }, b: { length: 50, t_start: 0.5, t_end: 1 }, walks: true } } });
    expect(store.getState().project.seams[0].pieceB).toMatchObject({ tStart: 0.5, tEnd: 1 });
  });

  it('reversed: B va de su final a su inicio, y su rango se guarda en el sentido de cosido', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: 'a', edge: 'top', from: 0, to: 0.4 },
      b: { piece_id: 'b', edge: 'top', from: 0, to: 0.4 },
      reversed: true,
    });
    expect(r.measure.seam).toMatchObject({ b: { t_start: 0, t_end: 0.4, reversed: true, length: 40 } });
    expect(store.getState().project.seams[0].pieceB).toMatchObject({ tStart: 0.6, tEnd: 1, reversed: true });
  });

  it('avisa si el tramo ya estaba cosido por otra costura', async () => {
    const { ctx } = tienda([pieza('a', [100]), pieza('b', [100]), pieza('c', [100])], [costura()]);
    const r = await actuarCon(ctx, 'sew', { a: { piece_id: 'a', edge: 'top', from: 0.5, to: 1 }, b: { piece_id: 'c', edge: 'top' } });
    expect(r.done).toBe(true);
    expect(r.warnings).toContain('edge top of piece a is already sewn there by seam s1');
  });

  it('un tramo sin largo es un error dicho, y no cose nada', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await ejecutarVerbo(VERBOS_DE_COSTURA, 'sew', { a: { piece_id: 'a', edge: 'top', from: 0.3, to: 0.3 }, b: { piece_id: 'b', edge: 'top' } }, ctx);
    expect(r).toMatchObject({ ok: false, error: 'stretch a has no length' });
    expect(store.getState().project.seams).toHaveLength(0);
  });
});

describe('unsew', () => {
  it('descose, dice entre qué tramos estaba y no pide confirmación aunque María la haya pedido para sus borrados', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [110])], [costura()], {}, { confirmOverrides: { removeSeam: 'always' } });
    const r = await actuarCon(ctx, 'unsew', { seam_id: 's1' });
    expect(r).toMatchObject({ done: true, changed: { deleted: ['s1'] }, measure: { removed: { id: 's1', a: { length: 100 }, b: { length: 110 } } } });
    expect(store.getState().project.seams).toHaveLength(0);
    expect(store.getState().copilotUI.pendingConfirmation).toBeFalsy();
  });
  it('una costura que no existe es un error dicho', async () => {
    const { ctx } = tienda();
    expect(await ejecutarVerbo(VERBOS_DE_COSTURA, 'unsew', { seam_id: 'nada' }, ctx)).toMatchObject({ ok: false, error: 'no seam with id nada' });
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/costura.test.ts src/copilot/superficie/__tests__/medir.test.ts src/store/__tests__/resewAiSeams.test.ts`
Expected: FAIL — `costura.test.ts` no resuelve `../verbos/costura`; `medir.test.ts` lee `t_start: 0`; `resewAiSeams` da `true` para la costura del agente.

- [ ] **Step 3: Solo autoSew se queda viejo**

En `src/utils/autoSew/index.ts`, sustituye el comentario y el cuerpo de `isStaleAiSeam`:

```ts
/**
 * ¿Es una seam IA generada por un motor anterior? Solo autoSew tiene motor:
 * sus costuras llevan el id state-encoded `auto-seam-` desde su primera
 * versión (2026-02-23). Lo que cose el agente a mano (`sew`, `createSeam`)
 * lleva `createdBy: 'ai'` y un `newId`, y NUNCA está viejo: antes salía viejo
 * por no tener `sewEngine`, y «Re-coser» lo borraba. Las humanas tampoco.
 *
 * El motor 2 solo cambió dónde se parte la copa: del motor 1 solo están
 * viejas sus mitades de copa. Sin esto, «Re-coser» se ofrecía en cualquier
 * prenda con costuras IA, aunque no tuviera mangas, y rehacía costuras que
 * salían iguales perdiendo lo que la usuaria les hubiera cambiado.
 */
export function isStaleAiSeam(s: Seam): boolean {
  if (!s.id.startsWith('auto-seam-')) return false;
  const motor = s.sewEngine ?? 0;
  return motor < 1 || (motor < SEAM_ENGINE_VERSION && esMitadDeCopa(s));
}
```

- [ ] **Step 4: El rango de B, en el sentido de su borde**

En `src/copilot/superficie/costuras.ts`, importa `mirrorPctRange` de `../../utils/seam/seamRange` y cambia el bloque `b:` de `medirCostura`:

```ts
  // Un B invertido guarda su rango en el sentido de cosido (`seamRange.ts`);
  // aquí se lee en el de su borde, como lo recibe `sew` y lo mide `measure`.
  const [bDesde, bHasta] = seam.pieceB.reversed === true
    ? mirrorPctRange([seam.pieceB.tStart ?? 0, seam.pieceB.tEnd ?? 1])
    : [seam.pieceB.tStart ?? 0, seam.pieceB.tEnd ?? 1];
```

y, dentro del objeto devuelto:

```ts
    b: {
      piece_id: seam.pieceB.pieceId, edge: seam.pieceB.edgeName,
      t_start: bDesde, t_end: bHasta,
      reversed: seam.pieceB.reversed === true, length: b != null ? unDecimal(b) : null,
    },
```

- [ ] **Step 5: Los tramos de `medir.ts`, para coser**

En `src/copilot/superficie/verbos/medir.ts`, exporta el esquema (`export const tramo = …`, `export type Tramo = …`) y sustituye `largoDeTramo` por:

```ts
/** Un tramo en fracciones de su borde, ordenadas: dónde empieza y dónde acaba, medidos ahora. */
export function fraccionesDeTramo(t: Tramo, ctx: ContextoDeVerbo): { piece: PatternPiece; edgeLength: number; desde: number; hasta: number } {
  const piece = ctx.getState().project.pieces.find(p => p.id === t.piece_id);
  if (!piece) throw new Error(`no piece with id ${t.piece_id}`);
  const borde = piece.edges?.find(e => e.name === t.edge);
  if (!borde) throw new Error(`piece ${t.piece_id} has no edge named ${t.edge}`);
  const rango = rangoMedibleDeBorde(piece.outline, borde.segmentRange);
  const edgeLength = computeRangeLengthMM(piece.outline, borde.segmentRange);
  if (edgeLength < 1e-9) throw new Error(`edge ${t.edge} of piece ${t.piece_id} has no length`);
  const d0 = distanciaDesdeElInicio(t.from, piece, rango, edgeLength, t.edge);
  const d1 = distanciaDesdeElInicio(t.to, piece, rango, edgeLength, t.edge);
  return { piece, edgeLength, desde: Math.min(d0, d1) / edgeLength, hasta: Math.max(d0, d1) / edgeLength };
}

/** El largo de un tramo de un borde, medido ahora. */
function largoDeTramo(t: Tramo, ctx: ContextoDeVerbo): { length: number; edgeLength: number } {
  const f = fraccionesDeTramo(t, ctx);
  return { length: (f.hasta - f.desde) * f.edgeLength, edgeLength: f.edgeLength };
}
```

- [ ] **Step 6: Los verbos**

Crea `src/copilot/superficie/verbos/costura.ts`:

```ts
import { z } from 'zod';
import type { PatternPiece, Seam } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addSeam, removeSeam } from '../../../store/projectSlice';
import { newId } from '../../../utils/ids';
import { mirrorPctRange } from '../../../utils/seam/seamRange';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { actuar, cerrar, rehusar } from '../actuar';
import { medirCostura } from '../costuras';
import { fraccionesDeTramo, tramo } from './medir';

/** Menos que esto no es un tramo. */
const SIN_LARGO = 1e-6;

/** Un lado de costura con su rango; el rango entero no se guarda (convención de `Seam`). */
function lado(pieceId: string, edgeName: string, [desde, hasta]: [number, number]): Seam['pieceA'] {
  const d = desde < SIN_LARGO ? 0 : desde;
  const h = hasta > 1 - SIN_LARGO ? 1 : hasta;
  return d === 0 && h === 1 ? { pieceId, edgeName } : { pieceId, edgeName, tStart: d, tEnd: h };
}

/** El rango de un lado en el sentido de su borde: un B invertido lo guarda en el de cosido. */
function rangoEnElBorde(l: Seam['pieceA'] | Seam['pieceB']): [number, number] {
  const r: [number, number] = [l.tStart ?? 0, l.tEnd ?? 1];
  return 'reversed' in l && l.reversed === true ? mirrorPctRange(r) : r;
}

/** Las costuras que ya cosen, en más de 1 mm, el mismo tramo de un borde. */
function yaCosido(seam: Seam, seams: readonly Seam[], pieces: readonly PatternPiece[]): string[] {
  const avisos: string[] = [];
  for (const nuevo of [seam.pieceA, seam.pieceB]) {
    const piece = pieces.find(p => p.id === nuevo.pieceId);
    const borde = piece?.edges?.find(e => e.name === nuevo.edgeName);
    if (!piece || !borde) continue;
    const largo = computeRangeLengthMM(piece.outline, borde.segmentRange);
    const [n0, n1] = rangoEnElBorde(nuevo);
    for (const otra of seams) {
      for (const viejo of [otra.pieceA, otra.pieceB]) {
        if (viejo.pieceId !== nuevo.pieceId || viejo.edgeName !== nuevo.edgeName) continue;
        const [v0, v1] = rangoEnElBorde(viejo);
        if ((Math.min(n1, v1) - Math.max(n0, v0)) * largo > 1) {
          avisos.push(`edge ${nuevo.edgeName} of piece ${nuevo.pieceId} is already sewn there by seam ${otra.id}`);
        }
      }
    }
  }
  return [...new Set(avisos)];
}

const sew = definirVerbo({
  name: 'sew',
  description:
    'Sew two stretches together: a on one edge, b on another (they may be on the same piece). Each stretch runs along its own edge from `from` to `to`, given as fractions of the edge (0..1) or as points on it; default the whole edge. reversed: B is sewn from its end to its start, so the start of A meets the end of B. Returns both sewn lengths, the difference B minus A, and whether it walks within 3 mm (ease_mm: ease wanted on purpose, default 0).',
  args: z.object({
    a: tramo,
    b: tramo,
    reversed: z.boolean().default(false),
    ease_mm: z.number().optional().describe('ease wanted on purpose, B minus A, in mm; default 0'),
  }),
  run: (args, ctx) => {
    const a = fraccionesDeTramo(args.a, ctx);
    const b = fraccionesDeTramo(args.b, ctx);
    if (a.hasta - a.desde < SIN_LARGO) throw new Error('stretch a has no length');
    if (b.hasta - b.desde < SIN_LARGO) throw new Error('stretch b has no length');
    // B invertido: su rango se guarda en el sentido de cosido (`seamRange.ts`).
    const rangoB: [number, number] = args.reversed ? mirrorPctRange([b.desde, b.hasta]) : [b.desde, b.hasta];
    const seam: Seam = {
      id: newId(),
      pieceA: lado(a.piece.id, args.a.edge, [a.desde, a.hasta]),
      pieceB: { ...lado(b.piece.id, args.b.edge, rangoB), ...(args.reversed ? { reversed: true } : {}) },
      // Lo que pone la herramienta de coser de la interfaz (`buildSegmentSeam`),
      // con la procedencia del agente: ámbar en 3D, «revísame».
      type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
      createdBy: 'ai',
    };
    const { pieces, seams } = ctx.getState().project;
    const previa = medirCostura(seam, pieces, { easeMm: args.ease_mm });
    if (previa.a.length == null || previa.b.length == null) return rehusar('a side of the seam cannot be measured');
    const warnings = yaCosido(seam, seams, pieces);

    const e = actuar(ctx, 'sew', `coser ${a.piece.name} con ${b.piece.name}`, () => { ctx.dispatch(addSeam(seam)); });
    const cosida = e.despues.seams.find(s => s.id === seam.id);
    const m = cosida ? medirCostura(cosida, e.despues.pieces, { easeMm: args.ease_mm }) : null;
    if (m?.walks === false) {
      warnings.push(`the seam does not walk: ${m.a.length} mm against ${m.b.length} mm, ${m.delta} mm apart (tolerance ${m.tolerance} mm)`);
    }
    return cerrar(ctx, 'sew', e, {
      done: m != null && m.a.length != null && m.b.length != null,
      measure: { seam: m },
      warnings,
    });
  },
});

const unsew = definirVerbo({
  name: 'unsew',
  description: 'Unsew a seam. Returns which seam went and the two stretches it joined, measured before.',
  args: z.object({ seam_id: z.string().describe('a seam id from read_pattern') }),
  run: ({ seam_id }, ctx) => {
    const { seams, pieces } = ctx.getState().project;
    const seam = seams.find(s => s.id === seam_id);
    if (!seam) throw new Error(`no seam with id ${seam_id}`);
    const medida = medirCostura(seam, pieces);
    const nombre = (id: string) => pieces.find(p => p.id === id)?.name ?? id;
    const e = actuar(ctx, 'unsew', `descoser ${nombre(seam.pieceA.pieceId)} de ${nombre(seam.pieceB.pieceId)}`, () => {
      // El diálogo de confirmación es para los borrados de María; el agente
      // no puede contestarlo, y su paso se deshace con Ctrl+Z.
      ctx.dispatch({ ...removeSeam(seam_id), meta: { skipConfirmation: true } });
    });
    return cerrar(ctx, 'unsew', e, {
      done: !e.despues.seams.some(s => s.id === seam_id),
      measure: { removed: medida },
      warnings: [],
    });
  },
});

export const VERBOS_DE_COSTURA: readonly Verbo[] = [sew, unsew];
```

- [ ] **Step 7: Verlos pasar**

Run: `npx vitest run src/copilot/superficie src/store/__tests__/resewAiSeams.test.ts`
Expected: PASS.

- [ ] **Step 8: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > /tmp/1b-t4.log 2>&1; tail -8 /tmp/1b-t4.log
git add src/copilot/superficie/verbos/costura.ts src/copilot/superficie/verbos/medir.ts src/copilot/superficie/costuras.ts src/copilot/superficie/__tests__/costura.test.ts src/copilot/superficie/__tests__/medir.test.ts src/utils/autoSew/index.ts src/store/__tests__/resewAiSeams.test.ts
git commit -m "feat(superficie): sew y unsew; lo que cose el agente ya no sale viejo para «Re-coser»"
```

---

### Task 5: La pareja de un piquete va por la costura que cose el punto

**Files:**
- Modify: `src/utils/seam/notchMirror.ts:102-171`, `src/utils/seam/__tests__/notchMirror.test.ts`

**Interfaces:**
- Produces:
  - `puntoEnElBorde(piece: PatternPiece, edge: SemanticEdge, distanciaMm: number): { point: Point2D; normal: Point2D } | null` (local; distancia de arco desde el inicio del borde, en su sentido; la normal, hacia dentro);
  - `MirrorNotchResult` (ok) gana `pairedFrac: number` (fracción del borde emparejado, en su sentido), `invert: boolean` (el sentido que se usó, en los términos de `NotchPair.invert`) y `onSewnStretch: boolean`.

- [ ] **Step 1: Los tests (rojo)**

Añade a `src/utils/seam/__tests__/notchMirror.test.ts` (importa también `puntoEnElBorde`):

```ts
// Piece C: like B, its left edge (x=0) is command 1 → (0,0)→(0,400).
function pieceC(): PatternPiece {
  return { ...pieceB(), id: 'C', name: 'Collar', edges: [{ id: 'C:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }] } as unknown as PatternPiece;
}

// Piece D: its left edge is a straight cubic with uneven parametrization:
// the curve's t = 0.5 falls at y = 166.25, its arc midpoint at y = 200.
function pieceD(): PatternPiece {
  return {
    ...pieceB(), id: 'D', name: 'Curva',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 10, 0, 300, 0, 400] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'D:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
  } as unknown as PatternPiece;
}

const half = (pieceId: string, tStart?: number, tEnd?: number, reversed?: boolean) => ({
  pieceId, edgeName: 'sideSeam',
  ...(tStart != null ? { tStart, tEnd } : {}),
  ...(reversed ? { reversed: true } : {}),
});
const seamOf = (id: string, a: Seam['pieceA'], b: Seam['pieceB']): Seam => ({ ...seam, id, pieceA: a, pieceB: b });

describe('mapNotchAcrossSeam con copas partidas y sentidos', () => {
  it('un borde con dos costuras: va por la que cose el punto, no por la primera', () => {
    const seams = [seamOf('s1', half('A', 0, 0.5), half('B')), seamOf('s2', half('A', 0.5, 1), half('C'))];
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 300 }, seams, pieces: [pieceA(), pieceB(), pieceC()] });
    expect(r.ok && { id: r.pairedPieceId, seam: r.seamId, y: Math.round(r.point.y), dentro: r.onSewnStretch })
      .toEqual({ id: 'C', seam: 's2', y: 200, dentro: true });
  });

  it('sin invert, sigue el sentido de la costura: un B invertido cose al revés', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seamOf('s1', half('A'), half('B', undefined, undefined, true))], pieces: [pieceA(), pieceB()] });
    expect(r.ok && { y: Math.round(r.point.y), invert: r.invert, frac: r.pairedFrac }).toEqual({ y: 300, invert: true, frac: 0.75 });
  });

  it('con invert explícito (el panel), se comporta como antes', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seamOf('s1', half('A'), half('B', undefined, undefined, true))], pieces: [pieceA(), pieceB()], invert: false });
    expect(r.ok && Math.round(r.point.y)).toBe(100);
  });

  it('desde un B invertido con rango parcial: el rango guardado está en el sentido de cosido', () => {
    // B cose su mitad de abajo (borde 0,5..1) de su final a su inicio contra todo A.
    const seams = [seamOf('s1', half('A'), half('B', 0, 0.5, true))];
    const r = mapNotchAcrossSeam({ sourcePiece: pieceB(), point: { x: 0, y: 300 }, seams, pieces: [pieceA(), pieceB()] });
    expect(r.ok && { id: r.pairedPieceId, y: Math.round(r.point.y) }).toEqual({ id: 'A', y: 200 });
  });

  it('la pareja cae a la distancia de arco que le toca, no al parámetro de la curva', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 200 }, seams: [seamOf('s1', half('A'), half('D'))], pieces: [pieceA(), pieceD()] });
    expect(r.ok && r.point.y).toBeCloseTo(200, 0);
  });

  it('un punto fuera de todo tramo cosido lo dice', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 300 }, seams: [seamOf('s1', half('A', 0, 0.5), half('B'))], pieces: [pieceA(), pieceB()] });
    expect(r.ok && r.onSewnStretch).toBe(false);
  });
});

describe('puntoEnElBorde', () => {
  it('a una distancia de arco desde el inicio del borde, con la normal hacia dentro', () => {
    const r = puntoEnElBorde(pieceA(), pieceA().edges![0], 100);
    expect(r && { x: Math.round(r.point.x), y: Math.round(r.point.y), nx: Math.round(r.normal.x) }).toEqual({ x: 200, y: 100, nx: -1 });
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/utils/seam/__tests__/notchMirror.test.ts`
Expected: FAIL — la copa partida va a B (s1), el B invertido cae en 100, la curva en 166,25, y `puntoEnElBorde` no existe.

- [ ] **Step 3: El punto a una distancia de un borde**

En `src/utils/seam/notchMirror.ts`, importa `buildRing` de `../geometry/outlineRing`, `resolveNotchAnchorV2` de `../notchAnchor`, `interpolateRangePoint` y `computeRangeLengthMM` de `../geometry/edgeInterpolation`, y añade:

```ts
/**
 * El punto a `distanciaMm` del inicio de un borde, contado por el arco y en el
 * sentido del borde, con la normal hacia dentro: lo mismo que la cota de un
 * piquete puesto a mano (P3b), por la métrica 2. Coordenadas locales.
 */
export function puntoEnElBorde(
  piece: PatternPiece,
  edge: SemanticEdge,
  distanciaMm: number,
): { point: Point2D; normal: Point2D } | null {
  const inicio = interpolateRangePoint(piece.outline, edge.segmentRange, 0)?.point;
  const built = buildRing(piece.outline, 2);
  if (!inicio || !built.ok) return null;
  const r = resolveNotchAnchorV2(piece.outline, { refPoint: inicio, direction: 'cw', distanceMm: distanciaMm, metric: 2 }, built.value);
  return r ? { point: r.point, normal: r.normal } : null;
}
```

- [ ] **Step 4: La costura del punto, su sentido y la distancia de arco**

Sustituye en `notchMirror.ts` el tipo `MirrorNotchResult` y `mapNotchAcrossSeam` por:

```ts
export type MirrorNotchResult =
  | {
      ok: true; pairedPieceId: string; pairedEdgeName: string; point: Point2D; normal: Point2D;
      frac: number; seamId: string;
      /** Dónde cae la pareja: fracción de su borde, en el sentido de ese borde. */
      pairedFrac: number;
      /** El sentido usado, en los términos de `NotchPair.invert`: true si un borde corre al revés del otro. */
      invert: boolean;
      /** Si el punto está dentro del tramo cosido. Fuera, la pareja cae en el extremo más cercano. */
      onSewnStretch: boolean;
    }
  | { ok: false; reason: 'no-edge' | 'no-seam' | 'no-paired-edge' | 'degenerate'; message: string };

/** El rango de un lado en el sentido de su borde: un B invertido lo guarda en el de cosido (`seamRange.ts`). */
function rangoEnElBorde(lado: Seam['pieceA'] | Seam['pieceB']): [number, number] {
  const r: [number, number] = [lado.tStart ?? 0, lado.tEnd ?? 1];
  return 'reversed' in lado && lado.reversed === true ? [1 - r[1], 1 - r[0]] : r;
}

/**
 * Map a notch point on a source piece's edge to the corresponding point on the
 * paired piece's edge across their shared seam (CLO3D's "corresponding notch").
 *
 * - **La costura del punto.** Un borde puede tener varias: una copa partida
 *   cose cada mitad a una sisa. Va por la que cose el punto; si ninguna lo
 *   cose, por la más cercana, y `onSewnStretch` lo dice. Antes tomaba la
 *   primera y la pareja caía en un extremo de la otra sisa.
 * - **El sentido.** Sin `invert`, el de la costura: un B `reversed` cose de su
 *   final a su inicio. Con `invert` (el panel, D-M2), el de antes: los dos
 *   rangos guardados como si fueran del borde, y `invert` da la vuelta.
 * - **La distancia.** La pareja cae a la distancia de arco que le toca
 *   (`puntoEnElBorde`); `pointAtPathDistance` es lineal en el parámetro de
 *   una curva y la dejaba corrida.
 */
export function mapNotchAcrossSeam(args: {
  sourcePiece: PatternPiece;
  point: Point2D;
  seams: Seam[];
  pieces: PatternPiece[];
  invert?: boolean;
  sourceEdge?: SemanticEdge;
}): MirrorNotchResult {
  const { sourcePiece, point, seams, pieces, invert } = args;

  const sourceEdge = args.sourceEdge ?? findEdgeForPoint(sourcePiece, point);
  if (!sourceEdge) return { ok: false, reason: 'no-edge', message: 'Notch is not on a named edge of the piece.' };

  // Traducido: el tramo de cierre se rotula con el índice de la `M`, que no
  // dibuja y mide cero (#1143).
  const [sa0, sa1] = rangoMedibleDeBorde(sourcePiece.outline, sourceEdge.segmentRange);
  const lenA = computePathArcLength(sourcePiece.outline, sa0, sa1);
  if (lenA < 1e-9) return { ok: false, reason: 'degenerate', message: 'Source edge has zero length.' };
  const fracEdgeA = distanceAlongPath(sourcePiece.outline, point, sa0, sa1) / lenA;

  // Las costuras de este borde, con el lado que es la fuente.
  const candidatas = seams.flatMap(seam => {
    const enA = seam.pieceA.pieceId === sourcePiece.id && seam.pieceA.edgeName === sourceEdge.name;
    const enB = seam.pieceB.pieceId === sourcePiece.id && seam.pieceB.edgeName === sourceEdge.name;
    return [...(enA ? [{ seam, srcOnA: true }] : []), ...(enB ? [{ seam, srcOnA: false }] : [])];
  });
  if (candidatas.length === 0) return { ok: false, reason: 'no-seam', message: `No seam on edge "${sourceEdge.name}". Create the seam first.` };
  const tolerancia = 0.5 / lenA;
  const fuera = (c: (typeof candidatas)[number]) => {
    const [t0, t1] = rangoEnElBorde(c.srcOnA ? c.seam.pieceA : c.seam.pieceB);
    return Math.max(0, t0 - fracEdgeA, fracEdgeA - t1);
  };
  const elegida = candidatas.reduce((mejor, c) => (fuera(c) < fuera(mejor) ? c : mejor));
  const { seam, srcOnA } = elegida;
  const srcSide = srcOnA ? seam.pieceA : seam.pieceB;
  const dstSide = srcOnA ? seam.pieceB : seam.pieceA;
  const pairedPieceId = dstSide.pieceId;

  const pairedPiece = pieces.find(p => p.id === pairedPieceId);
  const pairedEdge = pairedPiece ? findEdgeByName(pairedPiece, dstSide.edgeName) : null;
  if (!pairedPiece || !pairedEdge) return { ok: false, reason: 'no-paired-edge', message: 'Paired edge not found.' };

  let pairedFrac: number;
  let sentido: boolean;
  if (invert !== undefined) {
    // El de antes: los rangos guardados como si fueran del borde.
    const tA0 = srcSide.tStart ?? 0, tA1 = srcSide.tEnd ?? 1;
    const tB0 = dstSide.tStart ?? 0, tB1 = dstSide.tEnd ?? 1;
    const spanA = tA1 - tA0;
    const u = Math.max(0, Math.min(1, spanA > 1e-9 ? (fracEdgeA - tA0) / spanA : fracEdgeA));
    pairedFrac = tB0 + (invert ? 1 - u : u) * (tB1 - tB0);
    sentido = invert;
  } else {
    // El de la costura: `u` es la posición a lo largo de lo cosido, en el
    // sentido de cosido; un B invertido corre al revés de su borde.
    const alReves = seam.pieceB.reversed === true;
    const [s0, s1] = [srcSide.tStart ?? 0, srcSide.tEnd ?? 1];
    const tCosido = !srcOnA && alReves ? 1 - fracEdgeA : fracEdgeA;
    const span = s1 - s0;
    const u = Math.max(0, Math.min(1, span > 1e-9 ? (tCosido - s0) / span : tCosido));
    const [d0, d1] = [dstSide.tStart ?? 0, dstSide.tEnd ?? 1];
    const tDestino = d0 + u * (d1 - d0);
    pairedFrac = srcOnA && alReves ? 1 - tDestino : tDestino;
    sentido = alReves;
  }

  const lenB = computeRangeLengthMM(pairedPiece.outline, pairedEdge.segmentRange);
  const sitio = puntoEnElBorde(pairedPiece, pairedEdge, pairedFrac * lenB);
  if (!sitio) return { ok: false, reason: 'degenerate', message: 'Paired edge has zero length.' };

  return {
    ok: true,
    pairedPieceId,
    pairedEdgeName: pairedEdge.name,
    point: sitio.point,
    normal: sitio.normal,
    frac: fracEdgeA,
    seamId: seam.id,
    pairedFrac,
    invert: sentido,
    onSewnStretch: fuera(elegida) <= tolerancia,
  };
}
```

Quita los imports que dejen de usarse (`pointAtPathDistance`, `findSeamForEdge` si nadie más la llama en el archivo; `findSeamForEdge` sigue exportada).

- [ ] **Step 5: Verlos pasar, y los vecinos**

Run: `npx vitest run src/utils/seam src/copilot/action/tools/definitions/__tests__/internalTools.mirrorNotch.test.ts src/utils/__tests__/los-que-miden-el-borde-de-cierre.test.ts src/copilot/__tests__/toolsE2E.test.ts`
Expected: PASS. Si un test viejo fijaba la pareja por el parámetro de una curva, se mira el número: la distancia de arco es la que promete el contrato («the matching distance along the shared seam»).

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > /tmp/1b-t5.log 2>&1; tail -8 /tmp/1b-t5.log
git add src/utils/seam/notchMirror.ts src/utils/seam/__tests__/notchMirror.test.ts
git commit -m "fix(piquete): la pareja va por la costura que cose el punto, en su sentido y a su distancia de arco"
```

---

### Task 6: `notch`

**Files:**
- Create: `src/copilot/superficie/verbos/piquete.ts`, `src/copilot/superficie/__tests__/piquete.test.ts`

**Interfaces:**
- Consumes: Task 1; `puntoEnElBorde`, `mapNotchAcrossSeam` (Task 5); `createMirrorNotchLine`; `notchPoint`.
- Produces: `VERBOS_DE_PIQUETE: readonly Verbo[]` (`notch`).

- [ ] **Step 1: Los tests (rojo)**

Crea `src/copilot/superficie/__tests__/piquete.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_PIQUETE } from '../verbos/piquete';
import { costura, pieza, piquete, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PIQUETE, 'notch', args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('notch', () => {
  it('pone un piquete a una distancia del inicio del borde; el recibo la mide', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30 });
    expect(r).toMatchObject({ done: true, measure: { piece_id: 'a', edge: 'top', distance_from_edge_start: 30, pair: null } });
    const [n] = store.getState().project.pieces[0].internals;
    expect(n).toMatchObject({ type: 'notch', notchAnchor: { metric: 2 } });
    expect(r.changed.created).toEqual([n.id]);
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: poner un piquete en a', agent: { toolName: 'notch' } });
  });

  it('from_end cuenta desde el final del borde', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    expect((await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, from_end: true })).measure.distance_from_edge_start).toBe(70);
  });

  it('más allá del borde no se pone: lo dice con los dos números', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 150 });
    expect(r).toMatchObject({ done: false, warnings: ['distance 150 mm is past the end of edge top (100 mm)'] });
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('una pieza de capa bloqueada no se toca', async () => {
    const { ctx } = tienda([pieza('a', [100], { layer: 2 })], [], { layerLocked: { 2: true } });
    expect(await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30 })).toMatchObject({ done: false, warnings: ['piece is locked'] });
  });

  it('con pareja: la pone al otro lado de la costura, a la misma distancia cosida, y declara el par', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura()]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, pair: true });
    expect(r).toMatchObject({ done: true, measure: { pair: { piece_id: 'b', edge: 'top', distance_from_edge_start: 30, seam_id: 's1' } } });
    const { pieces, notchPairs } = store.getState().project;
    expect(pieces[1].internals).toHaveLength(1);
    expect(notchPairs).toMatchObject([{ seamId: 's1', invert: false }]);
    expect(getHistory().past.at(-1)?.label).toBe('IA: poner un piquete en a y su pareja en b');
  });

  it('con pareja en una costura invertida, la pareja cae del otro lado', async () => {
    const { ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura({ pieceB: { pieceId: 'b', edgeName: 'top', reversed: true } })]);
    expect((await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, pair: true })).measure.pair).toMatchObject({ distance_from_edge_start: 70 });
  });

  it('con pareja donde ninguna costura cose ese punto: no pone nada', async () => {
    const seam = costura({ pieceA: { pieceId: 'a', edgeName: 'top', tStart: 0, tEnd: 0.5 }, pieceB: { pieceId: 'b', edgeName: 'top', tStart: 0, tEnd: 0.5 } });
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [seam]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 80, pair: true });
    expect(r).toMatchObject({ done: false, warnings: ['no seam sews edge top at 80 mm'] });
    expect(store.getState().project.pieces.every(p => p.internals.length === 0)).toBe(true);
  });

  it('mueve un piquete puesto: el mismo id, a la distancia nueva, con sus opciones', async () => {
    const { store, ctx } = tienda([pieza('a', [100], { internals: [{ ...piquete('n1', 30), notchOptions: { shape: 'slit', subType: 'straightforward', length: 12, width: 3, angle: 0, count: 2 } }] })]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 60, notch_id: 'n1' });
    expect(r).toMatchObject({ done: true, changed: { modified: expect.arrayContaining(['n1']) }, measure: { notch_id: 'n1', distance_from_edge_start: 60 } });
    expect(store.getState().project.pieces[0].internals[0]).toMatchObject({ id: 'n1', notchOptions: { length: 12, count: 2 } });
    expect(getHistory().past.at(-1)?.label).toBe('IA: mover un piquete de a');
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/piquete.test.ts`
Expected: FAIL — `Failed to resolve import "../verbos/piquete"`.

- [ ] **Step 3: El verbo**

Crea `src/copilot/superficie/verbos/piquete.ts`:

```ts
import { z } from 'zod';
import type { InternalLine, PatternPiece, SemanticEdge } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addInternalLine, addNotchPair, updateInternalLine } from '../../../store/projectSlice';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { distanceAlongPath } from '../../../utils/geometry/arcLength';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import { newId } from '../../../utils/ids';
import { createMirrorNotchLine, mapNotchAcrossSeam, puntoEnElBorde } from '../../../utils/seam/notchMirror';
import { notchPoint } from '../../reasoning/proactiveAnalysis';
import { actuar, cerrar, estaBloqueada, MARGEN_MM, piezaDe, rehusar } from '../actuar';
import { unDecimal } from '../costuras';

/** Dónde queda un piquete: mm desde el inicio de su borde, como lo mide `read_pattern`. */
function distanciaDelPiquete(piece: PatternPiece, edge: SemanticEdge, line: InternalLine): number | null {
  const p = notchPoint(line);
  return p ? distanceAlongPath(piece.outline, p, ...rangoMedibleDeBorde(piece.outline, edge.segmentRange)) : null;
}

const cerca = (medida: number | null, pedida: number) => medida != null && Math.abs(medida - pedida) <= MARGEN_MM;

const notch = definirVerbo({
  name: 'notch',
  description:
    'Put a notch on an edge at a distance from its start (mm along the edge, as read_pattern measures notches; from_end counts from its end), or move an existing one with notch_id. pair: also put the corresponding notch across the seam that sews this point, at the same sewn distance, following the seam direction; refused if no seam sews this point. Returns where each notch landed, measured.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    edge: z.string().describe('an edge name from read_pattern'),
    distance: z.number().min(0).describe('mm along the edge from its start'),
    from_end: z.boolean().default(false),
    notch_id: z.string().optional().describe('move this notch instead of adding one'),
    pair: z.boolean().default(false),
    depth_mm: z.number().min(1).max(30).optional().describe('notch depth; default 8, or the moved notch\'s own'),
  }),
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    const edge = piece.edges?.find(e => e.name === args.edge);
    if (!edge) throw new Error(`piece ${piece.id} has no edge named ${args.edge}`);
    const existente = args.notch_id ? piece.internals.find(l => l.id === args.notch_id && l.type === 'notch') : undefined;
    if (args.notch_id && !existente) throw new Error(`piece ${piece.id} has no notch with id ${args.notch_id}`);
    if (existente && args.pair) throw new Error('pair works when adding a notch; to move a pair, move each notch');
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    const largo = computeRangeLengthMM(piece.outline, edge.segmentRange);
    if (args.distance > largo + 1e-6) {
      return rehusar(`distance ${unDecimal(args.distance)} mm is past the end of edge ${args.edge} (${unDecimal(largo)} mm)`);
    }
    const pedida = args.from_end ? largo - args.distance : args.distance;
    const sitio = puntoEnElBorde(piece, edge, pedida);
    if (!sitio) return rehusar(`cannot place a point on edge ${args.edge}`);
    const opciones = { ...(existente?.notchOptions ?? DEFAULT_NOTCH_OPTIONS), ...(args.depth_mm ? { length: args.depth_mm } : {}) };
    // El escritor de un piquete a partir de un punto y su normal (locales).
    const nueva = createMirrorNotchLine(piece.outline, sitio, { notchOptions: opciones });
    const linea: InternalLine = existente ? { ...nueva, id: existente.id } : nueva;
    // ponytail: sin esquinas (un círculo) el ancla es null y al mover queda la vieja; el path manda (D-2).
    if (!cerca(distanciaDelPiquete(piece, edge, linea), pedida)) {
      return rehusar(`the notch would not land at ${unDecimal(pedida)} mm on edge ${args.edge}`);
    }

    // La pareja va por la costura que cose ESTE punto (una copa partida tiene dos).
    let pareja: { otra: PatternPiece; borde: SemanticEdge; linea: InternalLine; esperada: number; seamId: string; invert: boolean } | null = null;
    if (args.pair) {
      const { seams, pieces } = ctx.getState().project;
      const m = mapNotchAcrossSeam({ sourcePiece: piece, point: sitio.point, seams, pieces, sourceEdge: edge });
      if (!m.ok) return rehusar(m.message);
      if (!m.onSewnStretch) return rehusar(`no seam sews edge ${args.edge} at ${unDecimal(pedida)} mm`);
      const otra = pieces.find(p => p.id === m.pairedPieceId)!;
      if (estaBloqueada(ctx, otra)) return rehusar(`the paired piece ${otra.id} is locked`);
      const borde = otra.edges!.find(e => e.name === m.pairedEdgeName)!;
      const lineaOtra = createMirrorNotchLine(otra.outline, m, linea);
      const esperada = m.pairedFrac * computeRangeLengthMM(otra.outline, borde.segmentRange);
      if (!cerca(distanciaDelPiquete(otra, borde, lineaOtra), esperada)) {
        return rehusar(`the pair would not land at ${unDecimal(esperada)} mm on edge ${borde.name} of piece ${otra.id}`);
      }
      pareja = { otra, borde, linea: lineaOtra, esperada, seamId: m.seamId, invert: m.invert };
    }

    const etiqueta = existente
      ? `mover un piquete de ${piece.name}`
      : `poner un piquete en ${piece.name}${pareja ? ` y su pareja en ${pareja.otra.name}` : ''}`;
    const e = actuar(ctx, 'notch', etiqueta, () => {
      if (existente) {
        ctx.dispatch(updateInternalLine({ pieceId: piece.id, lineId: linea.id, path: linea.path, notchAnchor: linea.notchAnchor, notchOptions: linea.notchOptions }));
      } else {
        ctx.dispatch(addInternalLine({ pieceId: piece.id, line: linea }));
      }
      if (pareja) {
        ctx.dispatch(addInternalLine({ pieceId: pareja.otra.id, line: pareja.linea }));
        ctx.dispatch(addNotchPair({
          id: newId(),
          a: { pieceId: piece.id, lineId: linea.id },
          b: { pieceId: pareja.otra.id, lineId: pareja.linea.id },
          seamId: pareja.seamId,
          invert: pareja.invert,
        }));
      }
    });

    // El recibo, medido sobre el estado de después (§ 5.3, regla 2).
    const medirEn = (pieceId: string, edgeName: string, lineId: string) => {
      const p = e.despues.pieces.find(x => x.id === pieceId);
      const b = p?.edges?.find(x => x.name === edgeName);
      const l = p?.internals.find(x => x.id === lineId);
      return p && b && l ? distanciaDelPiquete(p, b, l) : null;
    };
    const d = medirEn(piece.id, edge.name, linea.id);
    const dPareja = pareja ? medirEn(pareja.otra.id, pareja.borde.name, pareja.linea.id) : null;
    const warnings: string[] = [];
    const par = existente ? e.despues.notchPairs?.find(np => np.a.lineId === existente.id || np.b.lineId === existente.id) : undefined;
    if (par) warnings.push(`notch ${existente!.id} has a pair on piece ${par.a.lineId === existente!.id ? par.b.pieceId : par.a.pieceId}; it was not moved`);
    return cerrar(ctx, 'notch', e, {
      done: cerca(d, pedida) && (!pareja || cerca(dPareja, pareja.esperada)),
      measure: {
        notch_id: linea.id,
        piece_id: piece.id,
        edge: edge.name,
        distance_from_edge_start: d != null ? unDecimal(d) : null,
        pair: pareja
          ? { notch_id: pareja.linea.id, piece_id: pareja.otra.id, edge: pareja.borde.name, distance_from_edge_start: dPareja != null ? unDecimal(dPareja) : null, seam_id: pareja.seamId }
          : null,
      },
      warnings,
    });
  },
});

export const VERBOS_DE_PIQUETE: readonly Verbo[] = [notch];
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run src/copilot/superficie/__tests__/piquete.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Gates y commit**

```bash
npx tsc -b --noEmit && npx vitest run src/copilot/superficie > /tmp/1b-t6.log 2>&1; tail -5 /tmp/1b-t6.log
git add src/copilot/superficie/verbos/piquete.ts src/copilot/superficie/__tests__/piquete.test.ts
git commit -m "feat(superficie): notch — un piquete a una distancia del borde, solo o con su pareja"
```

---

### Task 7: `remove` con su aviso, y `undo`

**Files:**
- Create: `src/copilot/superficie/verbos/borrar.ts`, `src/copilot/superficie/__tests__/borrar.test.ts`, `src/store/deshacerDelAgenteMiddleware.ts`, `src/store/__tests__/deshacerDelAgente.test.ts`
- Modify: `src/store/actions.ts`, `src/store/index.ts:36,86`, `src/copilot/superficie/__tests__/fixtures.ts` (la cadena de `tienda()`)

**Interfaces:**
- Consumes: Task 1; `getHistory`, `withAgentHistorySource` (undoMiddleware); `showUndoToast`, `showInfoToast`.
- Produces:
  - `DESHACER_DEL_AGENTE = createAction<{ etiqueta: string; instante: number }>('global/deshacerDelAgente')`;
  - `deshacerDelAgenteMiddleware: Middleware`;
  - `TEXTO_YA_NO_SE_PUEDE` (el texto del aviso cuando no se puede);
  - `VERBOS_DE_BORRAR: readonly Verbo[]` (`remove`, `undo`).

- [ ] **Step 1: Los tests (rojo)**

Crea `src/store/__tests__/deshacerDelAgente.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DESHACER_DEL_AGENTE } from '../actions';
import { batchUndo, getHistory, withAgentHistorySource } from '../undoMiddleware';
import { updatePiece } from '../projectSlice';
import { TEXTO_YA_NO_SE_PUEDE } from '../deshacerDelAgenteMiddleware';
import { pieza, tienda } from '../../copilot/superficie/__tests__/fixtures';

/** Un paso del agente, como lo deja `actuar`. */
function pasoDelAgente(store: ReturnType<typeof tienda>['store'], nombre: string) {
  withAgentHistorySource('remove', () => batchUndo(store.dispatch, `IA: ${nombre}`, () => {
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: nombre }));
  }));
  const paso = getHistory().past.at(-1)!;
  return DESHACER_DEL_AGENTE({ etiqueta: paso.label, instante: paso.timestamp });
}

describe('el «Deshacer» del aviso de un borrado del agente', () => {
  it('deshace ese paso mientras sea el último', () => {
    const { store } = tienda([pieza('a', [100])]);
    const accion = pasoDelAgente(store, 'uno');
    store.dispatch(accion);
    expect(store.getState().project.pieces[0].name).toBe('a');
  });
  it('si después hubo otro paso no deshace nada, y el aviso dice qué hacer', () => {
    const { store } = tienda([pieza('a', [100])]);
    const accion = pasoDelAgente(store, 'uno');
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'de María' }));
    store.dispatch(accion);
    expect(store.getState().project.pieces[0].name).toBe('de María');
    expect(store.getState().copilotUI.toasts.at(-1)).toMatchObject({ type: 'info', message: TEXTO_YA_NO_SE_PUEDE });
  });
});
```

Crea `src/copilot/superficie/__tests__/borrar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { updatePiece } from '../../../store/projectSlice';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_BORRAR } from '../verbos/borrar';
import { costura, pieza, piquete, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_BORRAR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};
const ultimoAviso = (store: ReturnType<typeof tienda>['store']) => store.getState().copilotUI.toasts.at(-1);

describe('remove', () => {
  it('borra una pieza y sus costuras, sin pedir confirmación, y avisa con «Deshacer» que la devuelve', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura()], {}, { confirmOverrides: { removePiece: 'always' } });
    const r = await actuarCon(ctx, 'remove', { piece_id: 'a' });
    expect(r).toMatchObject({ done: true, measure: { removed: { kind: 'piece', id: 'a', name: 'a' }, seams_removed: ['s1'] } });
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['b']);
    expect(store.getState().copilotUI.pendingConfirmation).toBeFalsy();
    const aviso = ultimoAviso(store);
    expect(aviso).toMatchObject({ type: 'undo', message: 'La IA borró a', actionLabel: 'Deshacer' });
    store.dispatch(aviso!.actionPayload as never);
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a', 'b']);
    expect(store.getState().project.seams).toHaveLength(1);
  });

  it('borra algo de dentro de una pieza, y el aviso dice qué', async () => {
    const { store, ctx } = tienda([pieza('Delantero', [100], { internals: [piquete('n1', 30)] })]);
    const r = await actuarCon(ctx, 'remove', { piece_id: 'Delantero', internal_id: 'n1' });
    expect(r).toMatchObject({ done: true, changed: { deleted: ['n1'] }, measure: { removed: { kind: 'notch', id: 'n1' } } });
    expect(ultimoAviso(store)).toMatchObject({ message: 'La IA borró un piquete de Delantero' });
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: borrar un piquete de Delantero', agent: { toolName: 'remove' } });
  });

  it('una pieza bloqueada no se borra, y no hay aviso', async () => {
    const { store, ctx } = tienda([pieza('a', [100], { locked: true })]);
    expect(await actuarCon(ctx, 'remove', { piece_id: 'a' })).toMatchObject({ done: false, warnings: ['piece is locked'] });
    expect(ultimoAviso(store)).toBeUndefined();
  });
});

describe('undo', () => {
  it('deshace el último paso si fue del agente, y dice cuál', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    await actuarCon(ctx, 'remove', { piece_id: 'a' });
    const r = await actuarCon(ctx, 'undo', {});
    expect(r).toMatchObject({ done: true, changed: { created: ['a'] }, measure: { undone: 'IA: borrar a', by: 'remove' } });
    expect(store.getState().project.pieces).toHaveLength(1);
  });
  it('si el último paso es de María, no deshace nada y lo dice', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'suyo' }));
    const r = await actuarCon(ctx, 'undo', {});
    expect(r).toMatchObject({ done: false, warnings: ['the last step was made by the user ("Edit Piece"); it is not undone'] });
    expect(store.getState().project.pieces[0].name).toBe('suyo');
  });
  it('sin pasos, nada que deshacer', async () => {
    const { ctx } = tienda();
    expect(await actuarCon(ctx, 'undo', {})).toMatchObject({ done: false, warnings: ['nothing to undo'] });
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/borrar.test.ts src/store/__tests__/deshacerDelAgente.test.ts`
Expected: FAIL — no resuelven `../verbos/borrar` ni `../deshacerDelAgenteMiddleware`.

- [ ] **Step 3: La acción y el puente**

Añade a `src/store/actions.ts`:

```ts
/**
 * El «Deshacer» del aviso de un borrado del agente (spec IA § 5.4). Acción
 * PLANA para que el botón de un toast la dispare; `deshacerDelAgenteMiddleware`
 * deshace ese paso solo si sigue siendo el último. Lo identifican su etiqueta
 * y su instante en el historial.
 */
export const DESHACER_DEL_AGENTE = createAction<{ etiqueta: string; instante: number }>('global/deshacerDelAgente');
```

Crea `src/store/deshacerDelAgenteMiddleware.ts`:

```ts
import type { Middleware } from '@reduxjs/toolkit';
import { DESHACER_DEL_AGENTE } from './actions';
import { getHistory } from './undoMiddleware';
import { undo } from './editorSlice';
import { showInfoToast } from './copilotUISlice';

/** Lo que lee María si su «Deshacer» ya no puede deshacer solo el borrado (aprobado el 09-10). */
export const TEXTO_YA_NO_SE_PUEDE = 'No se deshizo nada porque después hubo otros cambios; usa Deshacer hasta que vuelva lo borrado';

/**
 * El puente del «Deshacer» de un aviso de borrado del agente.
 *
 * @cascade
 * shape: plain-action bridge (como `resewBridgeMiddleware`)
 * triggers: global/deshacerDelAgente (botón de un toast)
 * dispatches: editor/undo si el paso sigue siendo el último; si no, copilotUI/showToast con qué hacer
 * guard: la etiqueta y el instante del último paso del historial
 * undo: es María deshaciendo: el timeline lo cuenta como deshacer rápido tras el agente
 * cap-depth: 1
 *
 * Por qué la guarda: si después del borrado hubo otro paso, deshacer ahora se
 * llevaría ese otro y dejaría lo borrado donde está.
 */
export const deshacerDelAgenteMiddleware: Middleware = (store) => (next) => (action) => {
  if (!DESHACER_DEL_AGENTE.match(action)) return next(action);
  const ultimo = getHistory().past.at(-1);
  if (ultimo && ultimo.label === action.payload.etiqueta && ultimo.timestamp === action.payload.instante) {
    return store.dispatch(undo());
  }
  return store.dispatch(showInfoToast(TEXTO_YA_NO_SE_PUEDE));
};
```

En `src/store/index.ts`, importa `deshacerDelAgenteMiddleware` y añádelo al final de la cadena, después de `resewBridgeMiddleware`. En `fixtures.ts`, añádelo al final de la cadena de `tienda()`.

- [ ] **Step 4: Los verbos**

Crea `src/copilot/superficie/verbos/borrar.ts`:

```ts
import { z } from 'zod';
import type { InternalLine } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { removeInternalLine, removePiece } from '../../../store/projectSlice';
import { getHistory, withAgentHistorySource } from '../../../store/undoMiddleware';
import { undo } from '../../../store/editorSlice';
import { showUndoToast } from '../../../store/copilotUISlice';
import { DESHACER_DEL_AGENTE } from '../../../store/actions';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { actuar, cambiosEntre, cerrar, estaBloqueada, piezaDe, rehusar } from '../actuar';

/** Lo que hay dentro de una pieza, como lo lee María (glosario; aprobado el 09-10). */
const QUE_ES: Record<InternalLine['type'], string> = {
  notch: 'un piquete',
  dart: 'una pinza',
  grainline: 'el hilo',
  fold: 'una línea de doblez',
  pleat: 'un pliegue',
  topstitch: 'un pespunte',
  reference: 'una línea de referencia',
  seam: 'una línea de costura',
};

const remove = definirVerbo({
  name: 'remove',
  description:
    'Remove a piece (with its seams), or one internal of it: a notch, dart, grainline or line, by internal_id from read_piece. The user sees a notice with Undo. Returns what was removed.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    internal_id: z.string().optional().describe('remove only this internal of the piece'),
  }),
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    const interna = args.internal_id ? piece.internals.find(l => l.id === args.internal_id) : undefined;
    if (args.internal_id && !interna) throw new Error(`piece ${piece.id} has no internal with id ${args.internal_id}`);
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    const loQue = interna ? `${QUE_ES[interna.type]} de ${piece.name}` : piece.name;
    const e = actuar(ctx, 'remove', `borrar ${loQue}`, () => {
      if (interna) ctx.dispatch(removeInternalLine({ pieceId: piece.id, lineId: interna.id }));
      // El diálogo de confirmación es para los borrados de María: borrar actúa y ofrece deshacer.
      else ctx.dispatch({ ...removePiece(piece.id), meta: { skipConfirmation: true } });
    });
    const sigue = interna
      ? e.despues.pieces.find(p => p.id === piece.id)?.internals.some(l => l.id === interna.id) === true
      : e.despues.pieces.some(p => p.id === piece.id);
    const r = cerrar(ctx, 'remove', e, {
      done: !sigue,
      measure: {
        removed: interna ? { kind: interna.type, id: interna.id, piece_id: piece.id } : { kind: 'piece', id: piece.id, name: piece.name },
        seams_removed: e.changed.deleted.filter(id => e.antes.seams.some(s => s.id === id)),
      },
      warnings: [],
    });
    // Borrar actúa y ofrece deshacer (spec § 5.4): el aviso deshace solo este paso.
    const paso = getHistory().past.at(-1);
    if (r.done && paso) {
      ctx.dispatch(showUndoToast(`La IA borró ${loQue}`, DESHACER_DEL_AGENTE({ etiqueta: paso.label, instante: paso.timestamp })));
    }
    return r;
  },
});

const undoVerb = definirVerbo({
  name: 'undo',
  description:
    'Undo the last step of the history, only if an agent made it. If the last step was made by the user, nothing is undone: done is false and the warning says so. Returns which step was undone.',
  args: z.object({}),
  run: (_args, ctx) => {
    const ultimo = getHistory().past.at(-1);
    if (!ultimo) return rehusar('nothing to undo');
    if (!ultimo.agent) return rehusar(`the last step was made by the user ("${ultimo.label}"); it is not undone`);
    const antes = ctx.getState().project;
    const before = revisionDelProyecto();
    withAgentHistorySource('undo', () => { ctx.dispatch(undo()); });
    const despues = ctx.getState().project;
    return {
      done: despues !== antes,
      changed: cambiosEntre(antes, despues),
      measure: { undone: ultimo.label, by: ultimo.agent.toolName },
      warnings: [],
      revision: { before, after: revisionDelProyecto() },
    };
  },
});

export const VERBOS_DE_BORRAR: readonly Verbo[] = [remove, undoVerb];
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run src/copilot/superficie src/store/__tests__/deshacerDelAgente.test.ts`
Expected: PASS.

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test > /tmp/1b-t7.log 2>&1; tail -8 /tmp/1b-t7.log && npm run lint > /tmp/1b-t7-lint.log 2>&1; tail -3 /tmp/1b-t7-lint.log && node scripts/ui-contract-lint.mjs
git add src/copilot/superficie/verbos/borrar.ts src/copilot/superficie/__tests__/borrar.test.ts src/copilot/superficie/__tests__/fixtures.ts src/store/actions.ts src/store/deshacerDelAgenteMiddleware.ts src/store/__tests__/deshacerDelAgente.test.ts src/store/index.ts
git commit -m "feat(superficie): remove avisa con «Deshacer» y undo solo deshace lo del agente"
```

---

### Task 8: Los siete en la superficie, el ciclo de María y la nota de la spec

**Files:**
- Modify: `src/copilot/superficie/index.ts`, `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (§ 5.7)
- Create: `src/copilot/superficie/__tests__/ciclo.maria.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `SUPERFICIE` con 12 verbos.

- [ ] **Step 1: El test del ciclo (rojo)**

Crea `src/copilot/superficie/__tests__/ciclo.maria.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { undo } from '../../../store/editorSlice';
import { esMitadDeCopa } from '../../../utils/autoSew/repartoDeCopa';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { ejecutarVerbo } from '../ejecutar';
import { SUPERFICIE } from '../index';
import type { Recibo } from '../tipos';
import { camisaDeMaria, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(SUPERFICIE, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('el ciclo de María por la superficie', () => {
  it('un piquete con pareja en la copa cae en la sisa que cose esa mitad, a su distancia, y no en un extremo', async () => {
    const { piezas, seams } = camisaDeMaria();
    const { ctx } = tienda(piezas, seams);
    const manga = piezas.find(p => p.category === 'sleeve')!;
    const copa = manga.edges!.find(e => e.name === 'sleeveCap')!;
    const largoCopa = computeRangeLengthMM(manga.outline, copa.segmentRange);
    const r = await actuarCon(ctx, 'notch', { piece_id: manga.id, edge: 'sleeveCap', distance: largoCopa * 0.2, pair: true });
    expect(r.done).toBe(true);
    const par = r.measure.pair as { piece_id: string; edge: string; distance_from_edge_start: number; seam_id: string };
    const costura = seams.find(s => s.id === par.seam_id)!;
    expect(esMitadDeCopa(costura)).toBe(true);
    const sisa = piezas.find(p => p.id === par.piece_id)!;
    const largoSisa = computeRangeLengthMM(sisa.outline, sisa.edges!.find(e => e.name === par.edge)!.segmentRange);
    // El fallo del 06-10: la pareja caía en 0 o en 230,6 mm, un extremo de la sisa.
    expect(par.distance_from_edge_start).toBeGreaterThan(5);
    expect(par.distance_from_edge_start).toBeLessThan(largoSisa - 5);
  });

  it('descoser un costado y volver a coserlo: camina, y dos Ctrl+Z dejan las costuras como estaban', async () => {
    const { piezas, seams } = camisaDeMaria();
    const { store, ctx } = tienda(piezas, seams);
    const costado = seams.find(s => s.pieceA.edgeName === 'sideSeam' && s.pieceB.edgeName === 'sideSeam')!;
    await actuarCon(ctx, 'unsew', { seam_id: costado.id });
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: costado.pieceA.pieceId, edge: 'sideSeam', from: costado.pieceA.tStart ?? 0, to: costado.pieceA.tEnd ?? 1 },
      b: { piece_id: costado.pieceB.pieceId, edge: 'sideSeam', from: costado.pieceB.tStart ?? 0, to: costado.pieceB.tEnd ?? 1 },
      reversed: costado.pieceB.reversed === true,
    });
    expect(r).toMatchObject({ done: true, measure: { seam: { walks: true } } });
    store.dispatch(undo());
    store.dispatch(undo());
    expect(store.getState().project.seams.map(s => s.id)).toEqual(seams.map(s => s.id));
  });

  it('la superficie tiene los doce verbos', () => {
    expect(SUPERFICIE.map(v => v.name)).toEqual([
      'read_pattern', 'read_piece', 'measure', 'walk_seam', 'verify',
      'create_piece', 'edit_outline', 'sew', 'unsew', 'notch', 'remove', 'undo',
    ]);
  });
});
```

(Medido el 09-10 con una sonda: autoSew cose la camisa con `sideSeam ↔ sideSeam` y `sideSeam-2 ↔ sideSeam-2`, sin invertir; cada copa, partida en 0,512, va a `armhole` y a `armhole-2`.)

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/ciclo.maria.test.ts`
Expected: FAIL — `unknown verb: notch` (la superficie todavía no los lista).

- [ ] **Step 3: Registrarlos**

En `src/copilot/superficie/index.ts`:

```ts
import { VERBOS_DE_PIEZA } from './verbos/pieza';
import { VERBOS_DE_COSTURA } from './verbos/costura';
import { VERBOS_DE_PIQUETE } from './verbos/piquete';
import { VERBOS_DE_BORRAR } from './verbos/borrar';

/**
 * La superficie de herramientas de Vina (spec 2026-10-05): la única capa que
 * ven los agentes, el de la usuaria por MCP y el de Vina. Los verbos llegan
 * por entregas: 1a leer y medir; 1b, primera mitad, las manos.
 */
export const SUPERFICIE: readonly Verbo[] = [
  ...VERBOS_DE_LEER, ...VERBOS_DE_MEDIR,
  ...VERBOS_DE_PIEZA, ...VERBOS_DE_COSTURA, ...VERBOS_DE_PIQUETE, ...VERBOS_DE_BORRAR,
];
```

- [ ] **Step 4: Verlo pasar, y el trinquete de tamaño**

Run: `npx vitest run src/copilot/superficie tests/repo/la-superficie-es-corta.test.ts`
Expected: PASS (12 verbos de 24; las definiciones por debajo de 30.000 caracteres).

- [ ] **Step 5: La nota de la spec**

Añade al final de § 5.7 de `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` la «Nota del plan de la entrega 1b, primera mitad (2026-10-09)», con las decisiones 1-12 de este plan en una línea cada una y el enlace al plan.

- [ ] **Step 6: Gates enteros y commit**

```bash
npx tsc -b --noEmit && npm run test > /tmp/1b-t8.log 2>&1; tail -8 /tmp/1b-t8.log
npm run lint > /tmp/1b-t8-lint.log 2>&1; tail -3 /tmp/1b-t8-lint.log
npm run lint:ui
git add src/copilot/superficie/index.ts src/copilot/superficie/__tests__/ciclo.maria.test.ts docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md
git commit -m "feat(superficie): los siete verbos de actuar en la superficie, probados con la camisa de María"
```

---

## Después del plan

1. Revisión final de la rama entera con un subagente Opus («revisa sin escribir en git ni desplegar»), con el foco de arriba y las mutaciones de cada guarda (`MARGEN_MM`, la guarda del puente, el prefijo de `isStaleAiSeam`, el `onSewnStretch`, el `skipConfirmation`).
2. Ensayo del deploy (`bash scripts/deploy-prod.sh --ensayo`) antes de pedir el merge, avisando antes a la sesión vina-ed por la carga de la máquina.
3. Push, PR, merge y deploy esperan la orden de Samuel.
