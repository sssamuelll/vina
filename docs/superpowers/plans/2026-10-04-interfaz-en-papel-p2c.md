# Interfaz en papel — P2c: la IA convocada, Preferencias como panel, la pantalla vacía y la marca de escala

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que nada flote en reposo. La barra de IA solo existe cuando se la llama: un modo, tres estados, la conversación y el agente en el store. Sus ajustes pasan a un panel. La pantalla vacía y la marca de escala quedan donde dice la spec. Lo que se llama responde a Esc antes que la selección.

**Architecture:**
- **Estado.** El slice `ia` guarda si la barra está abierta, la conversación y el turno en curso.
- **Agente.** `src/copilot/conversacion.ts` corre el agente fuera de React: un `AgenticLoop` por conexión, con `detener()` cooperativo.
- **Barra.** `UnifiedBar` se monta solo con `ia.abierta`, en papel y con un solo modo. La abren el botón «IA» de la barra superior, `Ctrl+/`, `Ctrl+K` y la pantalla vacía.
- **Esc.** Un registro de peldaños (`src/shortcuts/escaleraDeLoLlamado.ts`) ordena los Esc: menú, IA, panel, selección. ShortcutProvider lo consulta antes de deseleccionar.

**Tech Stack:** React + Redux Toolkit, Vitest + Testing Library (jsdom), Playwright (e2e contra el Vite de 5174).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3). Secciones que aplica:
- § 4.2: el botón «IA».
- § 4.4: la marca de escala.
- § 4.6: el reposo y la pantalla vacía.
- § 6.1: Preferencias.
- § 6.2: la IA.
- § 7.5: `--band-bar`.
- § 8: lo que se borra.
- § 9: los trinquetes.
- § 11: la fila P2.

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, sentence case, sin «¡» ni «por favor». Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md` (pieza, costura, margen, piquete, pinza, tramo). Los `aria-label` también van en español.
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - solo tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin color literal;
  - todo `:hover` lleva su `:focus-visible`;
  - todo portal y todo lo que flota nace papel (`data-material="papel"`);
  - dentro del papel no se usan `--bg-surface`, `--bg-base` ni `--bg-deeper`;
  - ningún `z-index` literal;
  - Enter y Espacio son del botón de una botonera (§ 4);
  - una sola notación de atajo, vía `shortcutDisplay.ts`.
- **Superficies.** Toda superficie nueva declara `data-superficie` con el vocabulario de `tests/repo/superficies-declaradas.test.ts`.
- **Gates del repo:**
  - el typecheck es `npx tsc -b --noEmit`;
  - nada de `--no-verify`;
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador.
- **Por tarea.** Cada tarea cierra con la suite entera (`npm run test`), no solo con sus tests.
- **Trinquetes.** Sus líneas base solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`.
- **E2e en curso.** Con un e2e corriendo no se editan archivos de la app: el Vite de 5174 recarga.
- **Archivos.** Ids con `newId()` de `src/utils/ids.ts`, y `git add` con rutas explícitas.

## Review Focus

1. **Cerrar la barra con el agente trabajando**, con Esc o con «IA».
   - El agente sigue y «IA» lo enseña.
   - Al volver están la conversación y «Detener».
   - Lo que el agente hizo sigue en el patrón.
   - → Task 1 (store y servicio) y Task 4 (botón y barra).
2. **Esc con varias cosas abiertas**: un menú, la barra, un panel y una pieza seleccionada.
   - Un Esc, un peldaño, en ese orden.
   - Un modal encima se queda su Esc.
   - El borrador de una cota va primero.
   - → Task 2.
3. **`Ctrl+/` y `Ctrl+K` desde cualquier sitio**: el lienzo con foco, el 3D o un campo de la línea al pie.
   - Abren la barra.
   - Desde un campo, `Ctrl+K` no le quita la escritura.
   - → Task 4.
4. **Una posición guardada antes de P2c.** Es una barra de 58 de alto, pegada a la línea al pie. La cápsula de 48 aparece entera sobre la línea, dentro de la ventana. → Task 4.
5. **La pantalla vacía con la barra convocada.** «o descríbeselo a la IA» abre la cápsula sobre la línea al pie con el foco en el campo, y nada tapa «Importar DXF». → Task 5.

## Decisiones de este plan

1. **Rama.** Va apilada sobre P2b (PR #1230): `feat/interfaz-en-papel-p2c` sale de `79cba8a8`.
2. **Qué parte de la escalera de Escape.** La de `2026-09-06-escalera-de-escape-design.md` (E-1…E-5, las herramientas del lienzo) **no entra**. P2c hace solo los peldaños de lo que se llama, que § 6.2 pone «por delante del panel y de la deselección». ShortcutProvider los consulta antes de deseleccionar, así que dos cosas siguen yendo primero: el borrador de una cota, que corta la propagación antes, y los gestos del lienzo, que van en captura.
3. **Orden de los peldaños.** Menú (3) > IA (2) > panel (1) > selección.
   - Son menú: «Más», «Mostrar», Vina, el menú contextual y el personalizador del margen.
   - A igual prioridad gana el último que se abrió.
   - Los paneles son **un** peldaño, en `usePanelHost`, que cierra los dos, como fija `ContextPanel.test.tsx`.
4. **Dónde viven la conversación y el agente.**
   - La conversación vive en el slice `ia` sin los `result` de las herramientas, que pueden traer funciones: solo nombre, estado, error y razón.
   - El agente corre en `copilot/conversacion.ts`: un `AgenticLoop` por conexión, que se rehace cuando `ConnectionsList` avisa (`vina:provider-config-changed`).
   - El hook `useAgenticLoop` se borra. Su módulo conserva `ToolCallProgress` y `reduceToolCalls`.
5. **«Detener» es cooperativo.** El loop lo mira al volver cada respuesta y antes de cada herramienta. Lo que ya hizo se queda.
6. **Esc sobre la barra.** Con texto, lo borra. Con el campo vacío, la oculta. La conversación y el agente siguen. En § 6.2, cerrar y ocultar son lo mismo para la vista; solo cambia si queda conversación.
7. **Comandos.**
   - Se entra con `Ctrl+K`, o con «/» al empezar (el «/» se consume).
   - Retroceso con el campo vacío vuelve a la conversación.
   - Ejecutar un comando cierra la barra.
8. **Preferencias.** Es el panel «IA y ratón», con dos puertas: Vina › Preferencias › «IA y ratón...» y la paleta (Paneles › «IA y ratón»). Con `enPanel`, `AgentSettings` no pinta su cabecera ni su «Cerrar»: el panel ya tiene título y ✕.
9. **Marca de escala.** Va abajo a la izquierda, con la base en la última línea de la cuadrícula que deja 24 px hasta el pie de la hoja.
10. **`--band-bar` sale.** Sus dos consumidores, en el 3D, vuelven a `var(--sp-3)`.
11. **Textos nuevos (solace-wren, 2026-10-04):**

    | Dónde | Texto |
    |---|---|
    | «IA» cerrada: nombre / title | «Conversar con la IA» / «Conversar con la IA (Ctrl+/)» |
    | «IA» abierta: title | «Ocultar la IA» |
    | «IA» trabajando con la barra oculta | «La IA está trabajando» |
    | Detener | «Detener» |
    | Al detenerla | «Detenida. Lo que alcanzó a hacer sigue en el patrón.» |
    | Vina › Preferencias / título del panel | «IA y ratón...» / «IA y ratón» |
    | Sin conexión | «Falta una conexión de IA. Agrégala en Vina › Preferencias › IA y ratón.» |
    | Sin conexión, con un DXF | «Cargué tu patrón (N piezas). Para trabajar con él, agrega una conexión de IA en Vina › Preferencias › IA y ratón.» |

## Archivos

| Archivo | Qué |
|---|---|
| `src/store/iaSlice.ts` (nuevo) | Abierta/oculta, la conversación, el turno en curso. |
| `src/copilot/conversacion.ts` (nuevo) | `enviar`, `detener`: el agente fuera de React. |
| `src/copilot/reasoning/bridge/AgenticLoop.ts` | `detener()` y `RESPUESTA_DETENIDA`. |
| `src/shortcuts/escaleraDeLoLlamado.ts` (nuevo) | `subirPeldano`, `bajarLaEscalera`, `usePeldanoDeEscape`. |
| `src/shortcuts/ShortcutProvider.tsx` | Consulta la escalera antes de deseleccionar. |
| `src/components/shell/UnifiedBar.tsx`, `UnifiedBarChat.tsx`, `src/styles/unified-bar.css` | Un modo, papel, 560 × 48, Esc, comandos. |
| `src/components/shell/TopBar.tsx`, `src/styles/layout.css` | El botón «IA». |
| `src/components/shell/PreferenciasPanel.tsx` (nuevo), `src/copilot/AgentSettings.tsx`, `AppShell.tsx`, `LogoMenu.tsx`, `unifiedBarCommandDefs.ts` | El panel «IA y ratón» y sus puertas. |
| `src/components/PatternEditor/EmptyState2D.tsx` | Pantalla vacía de § 4.6. |
| `src/components/PatternEditor/renderers/MarcaDeEscala.tsx`, `renderers/cuadricula.ts` | La marca, abajo. |
| `src/styles/tokens.css`, `floating.css`, `Viewport3D/SnapshotBar.css` | Fuera `--band-bar`. |

---

### Task 1: La conversación en el store; el agente, fuera de la barra; «Detener»

**Files:**
- Create: `src/store/iaSlice.ts`, `src/store/__tests__/iaSlice.test.ts`, `src/copilot/conversacion.ts`, `src/copilot/__tests__/conversacion.test.ts`, `src/copilot/reasoning/bridge/__tests__/AgenticLoop.detener.test.ts`
- Modify: `src/store/index.ts` (reductor `ia`), `src/copilot/reasoning/bridge/AgenticLoop.ts`, `src/components/shell/UnifiedBarChat.tsx`, `src/copilot/hooks/useAgenticLoop.ts` (se va el hook), `src/copilot/hooks/__tests__/useAgenticLoop.test.ts`

**Interfaces:**
- Produces:
  - `src/store/iaSlice.ts`:
    - actions: `abrirIA(modo?: ModoDeApertura)`, `ocultarIA()`, `agregarMensaje(m: MensajeDeIA)`, `empezarTurno()`, `progresoDelTurno(p: PasoDelAgente[])`, `terminarTurno()`, `olvidarConversacion()`;
    - tipos: `MensajeDeIA`, `PasoDelAgente`, `ModoDeApertura`, `IaState`;
    - el estado vive en `RootState['ia']`.
  - `src/copilot/conversacion.ts`:
    - `enviar(texto: string, adjunto?: PendingDXFAttachment | null): Promise<void>`;
    - `detener(): void`;
    - las constantes `SIN_CONEXION` y `sinConexionConDxf(n: number)`.
  - `AgenticLoop.detener(): void` y `export const RESPUESTA_DETENIDA`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/store/__tests__/iaSlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import reducer, { abrirIA, ocultarIA, agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, olvidarConversacion } from '../iaSlice';

/**
 * La IA convocada (spec 2026-10-02 § 6.2): no existe en reposo, y cerrar la
 * barra no pierde la conversación ni corta al agente. Por eso todo vive aquí y
 * no en el componente.
 */
const inicial = reducer(undefined, { type: '@@init' });

describe('iaSlice', () => {
  it('en reposo, cerrada y sin conversación', () => {
    expect(inicial).toEqual({ abierta: false, modoDeApertura: 'conversacion', aperturas: 0, mensajes: [], trabajando: false, enCurso: [] });
  });

  it('abrir dice con qué se abrió y cuenta la apertura; ocultar no borra nada', () => {
    let s = reducer(inicial, abrirIA('comandos'));
    expect(s).toMatchObject({ abierta: true, modoDeApertura: 'comandos', aperturas: 1 });
    s = reducer(s, agregarMensaje({ id: 'm1', role: 'user', content: 'hola' }));
    s = reducer(s, ocultarIA());
    expect(s.abierta).toBe(false);
    expect(s.mensajes).toHaveLength(1);
    s = reducer(s, abrirIA());
    expect(s).toMatchObject({ abierta: true, modoDeApertura: 'conversacion', aperturas: 2 });
  });

  it('un turno: trabajando con sus pasos en vivo, y al terminar se limpian', () => {
    let s = reducer(inicial, empezarTurno());
    expect(s.trabajando).toBe(true);
    s = reducer(s, progresoDelTurno([{ name: 'leerPieza', status: 'running' }]));
    expect(s.enCurso).toEqual([{ name: 'leerPieza', status: 'running' }]);
    s = reducer(s, terminarTurno());
    expect(s).toMatchObject({ trabajando: false, enCurso: [] });
  });

  it('olvidar la conversación deja la barra como estaba', () => {
    let s = reducer(reducer(inicial, abrirIA()), agregarMensaje({ id: 'm1', role: 'user', content: 'hola' }));
    s = reducer(s, olvidarConversacion());
    expect(s).toMatchObject({ abierta: true, mensajes: [], enCurso: [] });
  });
});
```

`src/copilot/reasoning/bridge/__tests__/AgenticLoop.detener.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AgenticLoop, RESPUESTA_DETENIDA, type AgenticEvent } from '../AgenticLoop';
import type { ProviderResponse } from '../../../providers/types';
import type { ToolRegistry, ToolResult } from '../../../action/tools/registry';

/**
 * «Detener» (spec 2026-10-02 § 6.2): María lo pulsa y el agente no hace nada
 * más. Es cooperativo: el loop lo mira al volver cada respuesta y antes de cada
 * herramienta. Lo que ya hizo se queda.
 */
function montar(send: () => Promise<ProviderResponse>, alEjecutar: (nombre: string) => void = () => {}) {
  const registry = {
    execute: vi.fn(async (nombre: string): Promise<ToolResult> => { alEjecutar(nombre); return { success: true, data: {} }; }),
    get: vi.fn((nombre: string) => ({ name: nombre })),
  };
  const loop = new AgenticLoop({
    send: vi.fn(send),
    metaTools: [],
    actionToolDefs: [
      { name: 'primera', description: 'una', parameters: { type: 'object', properties: {} } },
      { name: 'segunda', description: 'otra', parameters: { type: 'object', properties: {} } },
    ],
    getState: () => ({}) as never,
    dispatch: vi.fn(),
    registry: registry as unknown as ToolRegistry,
  });
  return { loop, registry };
}

describe('AgenticLoop.detener', () => {
  it('entre dos herramientas: la segunda no corre y la respuesta lo dice', async () => {
    let vuelta = 0;
    const { loop, registry } = montar(async () => {
      vuelta += 1;
      return vuelta === 1
        ? { content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }, { id: 't2', name: 'segunda', arguments: '{}' }] }
        : { content: 'listo', toolCalls: [] };
    }, (nombre) => { if (nombre === 'primera') loop.detener(); });
    const eventos: AgenticEvent[] = [];
    const respuesta = await loop.run('acorta el escote', (e) => eventos.push(e));
    expect(registry.execute.mock.calls.map((c) => c[0])).toEqual(['primera']);
    expect(respuesta).toBe(RESPUESTA_DETENIDA);
  });

  it('con la respuesta en camino: al llegar no se ejecuta nada', async () => {
    let soltar!: (r: ProviderResponse) => void;
    const { loop, registry } = montar(() => new Promise<ProviderResponse>((r) => { soltar = r; }));
    const corriendo = loop.run('acorta el escote', () => {});
    await Promise.resolve();
    loop.detener();
    soltar({ content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }] });
    expect(await corriendo).toBe(RESPUESTA_DETENIDA);
    expect(registry.execute).not.toHaveBeenCalled();
  });

  it('detener no se arrastra al turno siguiente', async () => {
    const { loop } = montar(async () => ({ content: 'hecho', toolCalls: [] }));
    loop.detener();
    expect(await loop.run('otra cosa', () => {})).toBe('hecho');
  });
});
```

`src/copilot/__tests__/conversacion.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderResponse } from '../providers/types';

/**
 * La conversación vive fuera de la barra (spec 2026-10-02 § 6.2): se envía, el
 * agente trabaja con la barra cerrada, y la respuesta llega igual al store.
 * El proveedor es de mentira (ollama no pide clave); cada test carga los
 * módulos de nuevo para empezar con el store y el loop vacíos.
 */
let responder: () => Promise<ProviderResponse>;

vi.mock('../connections/storage', () => ({
  loadConnectionsState: vi.fn(async () => ({})),
  getActiveConnection: vi.fn(() => (conConexion ? { id: 'c1' } : null)),
}));
vi.mock('../connections/types', () => ({
  connectionToProviderConfig: vi.fn(() => ({ provider: 'ollama', apiKey: '', model: 'de-mentira' })),
}));
vi.mock('../providers/ollama', () => ({
  ollamaProvider: { send: vi.fn(() => responder()) },
}));

let conConexion = true;

async function cargar() {
  vi.resetModules();
  const { store } = await import('../../store');
  const conv = await import('../conversacion');
  const ia = await import('../../store/iaSlice');
  return { store, ...conv, ...ia };
}

beforeEach(() => {
  conConexion = true;
  responder = async () => ({ content: 'Hola, María.', toolCalls: [] });
});

describe('la conversación', () => {
  it('lo que se envía y lo que responde la IA quedan en el store', async () => {
    const { store, enviar } = await cargar();
    await enviar('hola');
    expect(store.getState().ia.mensajes.map((m) => [m.role, m.content])).toEqual([['user', 'hola'], ['assistant', 'Hola, María.']]);
    expect(store.getState().ia.trabajando).toBe(false);
  });

  it('con la barra oculta el agente sigue: la respuesta llega igual', async () => {
    let soltar!: (r: ProviderResponse) => void;
    responder = () => new Promise((r) => { soltar = r; });
    const { store, enviar, abrirIA, ocultarIA } = await cargar();
    store.dispatch(abrirIA());
    const enviando = enviar('acorta el escote');
    await vi.waitFor(() => expect(store.getState().ia.trabajando).toBe(true));
    store.dispatch(ocultarIA());
    soltar({ content: 'Acorté el escote.', toolCalls: [] });
    await enviando;
    expect(store.getState().ia.mensajes.at(-1)?.content).toBe('Acorté el escote.');
    expect(store.getState().ia).toMatchObject({ abierta: false, trabajando: false });
  });

  it('detener: lo que estaba en camino no se ejecuta y la conversación lo dice', async () => {
    let soltar!: (r: ProviderResponse) => void;
    responder = () => new Promise((r) => { soltar = r; });
    const { store, enviar, detener } = await cargar();
    const { RESPUESTA_DETENIDA } = await import('../reasoning/bridge/AgenticLoop');
    const enviando = enviar('acorta el escote');
    await vi.waitFor(() => expect(store.getState().ia.trabajando).toBe(true));
    detener();
    soltar({ content: '', toolCalls: [{ id: 't1', name: 'herramientaQueNoDebeCorrer', arguments: '{}' }] });
    await enviando;
    expect(store.getState().ia.mensajes.at(-1)?.content).toBe(RESPUESTA_DETENIDA);
  });

  it('sin conexión, la respuesta dice dónde se agrega', async () => {
    conConexion = false;
    const { store, enviar, SIN_CONEXION } = await cargar();
    await enviar('hola');
    expect(store.getState().ia.mensajes.at(-1)).toMatchObject({ role: 'assistant', content: SIN_CONEXION });
  });

  it('los pasos del agente llegan sin su resultado: el store no guarda funciones', async () => {
    let vuelta = 0;
    responder = async () => {
      vuelta += 1;
      return vuelta === 1
        ? { content: 'Miro la prenda.', toolCalls: [{ id: 't1', name: 'getGarmentState', arguments: '{}' }] }
        : { content: 'Hecho.', toolCalls: [] };
    };
    const { store, enviar } = await cargar();
    await enviar('mira la prenda');
    const pasos = store.getState().ia.mensajes.at(-1)?.toolCalls ?? [];
    // Que el caso se ejerza: la herramienta terminó, así que traía un resultado.
    expect(pasos.some((p) => p.name === 'getGarmentState' && p.status === 'done')).toBe(true);
    for (const p of pasos) expect(p).not.toHaveProperty('result');
    expect(pasos[0].reason).toBe('Miro la prenda.');
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/store/__tests__/iaSlice.test.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.detener.test.ts src/copilot/__tests__/conversacion.test.ts`
Expected: FAIL. No existen `../iaSlice`, `RESPUESTA_DETENIDA` ni `../conversacion`.

- [ ] **Step 3: El slice `ia`**

`src/store/iaSlice.ts`:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ToolCallProgress } from '../copilot/hooks/useAgenticLoop';

/**
 * La IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2). No existe en
 * reposo: la barra se monta solo con `abierta`. La conversación y el turno del
 * agente viven aquí y no en el componente, porque cerrar la barra no puede
 * perder la conversación ni cortar al agente.
 */

/** Un paso del agente, sin su resultado: puede traer funciones (`rollback`). */
export interface PasoDelAgente {
  name: string;
  status: ToolCallProgress['status'];
  error?: string;
  /** Por qué lo hizo: la frase con que el agente abrió esa tanda. */
  reason?: string;
}

export interface MensajeDeIA {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Las herramientas de ese turno: el rastro de lo que decidió. */
  toolCalls?: PasoDelAgente[];
}

/** Con qué se abre: escribiendo, o con la lista de comandos (`Ctrl+K`). */
export type ModoDeApertura = 'conversacion' | 'comandos';

export interface IaState {
  abierta: boolean;
  modoDeApertura: ModoDeApertura;
  /** Sube con cada apertura: la barra ya montada se entera de un `Ctrl+K`. */
  aperturas: number;
  mensajes: MensajeDeIA[];
  /** El agente corre, con la barra a la vista o no. */
  trabajando: boolean;
  /** Los pasos de la vuelta en curso, en vivo. */
  enCurso: PasoDelAgente[];
}

const initialState: IaState = {
  abierta: false,
  modoDeApertura: 'conversacion',
  aperturas: 0,
  mensajes: [],
  trabajando: false,
  enCurso: [],
};

const iaSlice = createSlice({
  name: 'ia',
  initialState,
  reducers: {
    abrirIA(state, action: PayloadAction<ModoDeApertura | undefined>) {
      state.abierta = true;
      state.modoDeApertura = action.payload ?? 'conversacion';
      state.aperturas += 1;
    },
    ocultarIA(state) {
      state.abierta = false;
    },
    agregarMensaje(state, action: PayloadAction<MensajeDeIA>) {
      state.mensajes.push(action.payload);
    },
    empezarTurno(state) {
      state.trabajando = true;
      state.enCurso = [];
    },
    progresoDelTurno(state, action: PayloadAction<PasoDelAgente[]>) {
      state.enCurso = action.payload;
    },
    terminarTurno(state) {
      state.trabajando = false;
      state.enCurso = [];
    },
    olvidarConversacion(state) {
      state.mensajes = [];
      state.enCurso = [];
    },
  },
});

export const { abrirIA, ocultarIA, agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, olvidarConversacion } = iaSlice.actions;
export default iaSlice.reducer;
```

En `src/store/index.ts`, el import junto a los demás y el reductor en el mapa:

```ts
import iaReducer from './iaSlice';
```

```ts
    copilotUI: copilotUIReducer,
    ia: iaReducer,
```

- [ ] **Step 4: `detener()` en el loop**

En `src/copilot/reasoning/bridge/AgenticLoop.ts`, junto a los demás `export`, arriba de la clase:

```ts
/** Lo que queda en la conversación cuando María detiene al agente (spec 2026-10-02 § 6.2). */
export const RESPUESTA_DETENIDA = 'Detenida. Lo que alcanzó a hacer sigue en el patrón.';
```

En la clase, después de `private conversationHistory: ChatMessage[] = [];`:

```ts
  /** «Detener»: el turno en curso no hace nada más. Lo mira `runInner`. */
  private detenido = false;
```

Después de `clearHistory()`:

```ts
  /**
   * «Detener» (spec 2026-10-02 § 6.2). Es cooperativo: la respuesta que esté
   * en camino se descarta al llegar y no se ejecuta otra herramienta. Lo que
   * ya hizo se queda en el patrón.
   */
  detener(): void {
    this.detenido = true;
  }
```

En `run()`, la primera línea pasa a ser:

```ts
    this.lastToolCalls = [];
    this.detenido = false;
```

En `runInner`, justo después de `const response = await this.send(messages, allToolDefs, this.providerConfig);`:

```ts
      if (this.detenido) return RESPUESTA_DETENIDA;
```

Y como primera línea del cuerpo de `for (const toolCall of response.toolCalls) {`:

```ts
        if (this.detenido) return RESPUESTA_DETENIDA;
```

- [ ] **Step 5: El servicio de la conversación**

`src/copilot/conversacion.ts`:

```ts
/**
 * La conversación con la IA, fuera de cualquier componente (spec 2026-10-02
 * «la interfaz en papel» § 6.2): cerrar la barra no pierde la conversación ni
 * corta al agente. Hay un solo loop por conexión activa, y su historia
 * sobrevive entre turnos: la confirmación de M2 propone y para, y sigue en el
 * turno siguiente. Lo que se pinta vive en el slice `ia`.
 */
import { store } from '../store';
import { addPiece } from '../store/projectSlice';
import { selectPiece, requestFitView } from '../store/editorSlice';
import { showErrorToast, showSuccessToast } from '../store/copilotUISlice';
import {
  agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, type PasoDelAgente,
} from '../store/iaSlice';
import { piecesLabel, promptSafeName, type PendingDXFAttachment } from '../components/shell/dxfImport';
import { reduceToolCalls, type ToolCallProgress } from './hooks/useAgenticLoop';
import { getDefaultRegistry } from './action/tools/registry';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { deepseekProvider } from './providers/deepseek';
import { ollamaProvider } from './providers/ollama';
import { claudeBridgeProvider } from './providers/claudeBridge';
import { vercelGatewayProvider } from './providers/vercelGateway';
import type { ProviderConfig, ChatMessage, ProviderToolDef } from './providers/types';
import { loadConnectionsState, getActiveConnection } from './connections/storage';
import { connectionToProviderConfig } from './connections/types';
import { getAllMetaTools } from './reasoning/bridge/meta-tools';
import type { AgenticEvent, AgenticLoop } from './reasoning/bridge/AgenticLoop';
import { createDebugAgenticLoop } from './debug/createDebugBridge';
import { classifyError, getErrorMessage } from './errorRecovery';
import { newId } from '../utils/ids';

export const SIN_CONEXION = 'Falta una conexión de IA. Agrégala en Vina › Preferencias › IA y ratón.';

export const sinConexionConDxf = (piezas: number) =>
  `Cargué tu patrón (${piecesLabel(piezas)}). Para trabajar con él, agrega una conexión de IA en Vina › Preferencias › IA y ratón.`;

function proveedorDe(config: ProviderConfig) {
  switch (config.provider) {
    case 'vercel-gateway': return vercelGatewayProvider;
    case 'claude-bridge': return claudeBridgeProvider;
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'deepseek': return deepseekProvider;
    case 'ollama': return ollamaProvider;
    default: return anthropicProvider;
  }
}

const lista = (c: ProviderConfig | null): c is ProviderConfig =>
  c !== null && (c.provider === 'ollama' || c.provider === 'claude-bridge' || c.apiKey.length > 0);

/** Los pasos tal como los pinta la conversación: sin `result`. */
const aPasos = (tcs: ToolCallProgress[]): PasoDelAgente[] =>
  tcs.map(({ name, status, error, reason }) => ({ name, status, ...(error ? { error } : {}), ...(reason ? { reason } : {}) }));

let conexion: Promise<ProviderConfig | null> | null = null;
let loop: AgenticLoop | null = null;
let escuchando = false;

/** La conexión activa. Un cambio en `ConnectionsList` la invalida, y el loop con ella. */
function laConexion(): Promise<ProviderConfig | null> {
  if (!escuchando && typeof window !== 'undefined') {
    escuchando = true;
    window.addEventListener('vina:provider-config-changed', () => { conexion = null; loop = null; });
  }
  conexion ??= loadConnectionsState().then((s) => {
    const activa = getActiveConnection(s);
    return activa ? connectionToProviderConfig(activa) : null;
  });
  return conexion;
}

function elLoop(config: ProviderConfig): AgenticLoop {
  if (loop) return loop;
  const registry = getDefaultRegistry();
  registry.setContext(store.dispatch, () => store.getState());
  const vistas = new Set<string>();
  const actionToolDefs = registry.list()
    .filter((t) => (vistas.has(t.name) ? false : (vistas.add(t.name), true)))
    .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const proveedor = proveedorDe(config);
  loop = createDebugAgenticLoop({
    send: (msgs: ChatMessage[], tools: ProviderToolDef[], cfg?: unknown) => proveedor.send(msgs, tools, (cfg ?? config) as ProviderConfig),
    metaTools: getAllMetaTools(),
    actionToolDefs,
    getState: () => store.getState(),
    dispatch: store.dispatch,
    registry,
    providerConfig: config,
  }).loop;
  return loop;
}

/**
 * Envía un mensaje. Con un DXF adjunto, primero lo carga en el proyecto (de una
 * vez, en un solo sitio) y el agente trabaja sobre las piezas ya cargadas:
 * nunca recibe los bytes del archivo. El nombre del archivo lo elige quien lo
 * manda, así que entra al modelo neutralizado (`promptSafeName`).
 */
export async function enviar(texto: string, adjunto: PendingDXFAttachment | null = null): Promise<void> {
  const { dispatch, getState } = store;
  if ((!texto.trim() && !adjunto) || getState().ia.trabajando) return;

  let alAgente = texto;
  let aLaVista = texto;
  if (adjunto) {
    for (const piece of adjunto.pieces) dispatch(addPiece(piece));
    dispatch(selectPiece(adjunto.pieces[0].id));
    dispatch(requestFitView());
    const nombre = promptSafeName(adjunto.name);
    const rotulo = `${nombre} · ${piecesLabel(adjunto.pieces.length)}`;
    aLaVista = texto.trim() ? `📎 ${rotulo}\n${texto}` : `📎 ${rotulo}`;
    const nota = `[Contexto: el usuario adjuntó y cargó un patrón DXF "${nombre}" con ${adjunto.pieces.length} piezas, ya presentes en el proyecto.]`;
    alAgente = texto.trim() ? `${nota}\n\n${texto}` : `${nota}\n\nAcabo de cargar este patrón. ¿Qué puedes hacer con él?`;
  }
  dispatch(agregarMensaje({ id: newId(), role: 'user', content: aLaVista }));

  const config = await laConexion();
  if (!lista(config)) {
    if (adjunto) dispatch(showSuccessToast(`Cargué tu patrón: ${piecesLabel(adjunto.pieces.length)}`));
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: adjunto ? sinConexionConDxf(adjunto.pieces.length) : SIN_CONEXION }));
    return;
  }

  // Los pasos de ESTE turno, en una variable y no en el store: son el registro
  // que se guarda con la respuesta. La frase con que el agente abre cada tanda
  // se pega a su primera herramienta, para que el rastro diga por qué.
  let pasos: ToolCallProgress[] = [];
  let razon: string | undefined;
  const alEvento = (event: AgenticEvent) => {
    switch (event.type) {
      case 'text:delta':
        razon = event.content?.trim() || undefined;
        break;
      case 'tool:start':
        pasos = reduceToolCalls(pasos, event);
        if (razon && pasos.length > 0) {
          const ultimo = pasos.length - 1;
          pasos = pasos.map((tc, i) => (i === ultimo ? { ...tc, reason: razon } : tc));
          razon = undefined;
        }
        dispatch(progresoDelTurno(aPasos(pasos)));
        break;
      case 'tool:complete':
      case 'tool:cancelled':
      case 'tool:error':
        pasos = reduceToolCalls(pasos, event);
        dispatch(progresoDelTurno(aPasos(pasos)));
        break;
      case 'error':
        dispatch(showErrorToast(event.error));
        break;
    }
  };

  dispatch(empezarTurno());
  try {
    const respuesta = await elLoop(config).run(alAgente, alEvento);
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: respuesta, toolCalls: aPasos(pasos) }));
  } catch (e: unknown) {
    dispatch(agregarMensaje({ id: newId(), role: 'assistant', content: getErrorMessage(classifyError(e), e) }));
  } finally {
    dispatch(terminarTurno());
  }
}

/** «Detener»: el turno en curso no hace nada más (spec 2026-10-02 § 6.2). */
export function detener(): void {
  loop?.detener();
}
```

- [ ] **Step 6: La barra lee la conversación del store**

En `src/components/shell/UnifiedBarChat.tsx`:
- Se van el estado local (`messages`, `providerConfig`, el registro, `useAgenticLoop`) y los imports que solo usaba eso.
- `handleSend` llama a `enviar(texto, pendingDXF)` y borra el adjunto.
- Lo que se pinta sale de `useSelector((s: RootState) => s.ia)`: `mensajes`, `trabajando` y `enCurso`. El bloque «en curso» usa `enCurso` donde antes usaba `agenticHook.toolCalls`.
- El estado vacío («Pregúntale a la IA…» / «Agrega un proveedor…») se va: desde la Task 4 el panel solo aparece con conversación, y sin conexión lo dice la respuesta (`SIN_CONEXION`).
- Con `trabajando`, junto a «Pensando…», va el botón «Detener»:

```tsx
          <button type="button" className="unified-bar__detener" onClick={detener}>
            Detener
          </button>
```

Queda así el arranque del componente (el resto del JSX conserva sus estilos actuales):

```tsx
export default function UnifiedBarChat({ input, setInput, submitNonce, pendingDXF, clearAttachment }: Props) {
  const { mensajes, trabajando, enCurso } = useSelector((s: RootState) => s.ia);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enCurso]);

  const handleSend = useCallback((text: string) => {
    if ((!text.trim() && !pendingDXF) || trabajando) return;
    setInput('');
    const adjunto = pendingDXF;
    clearAttachment();
    void enviar(text, adjunto);
  }, [pendingDXF, trabajando, setInput, clearAttachment]);
```

El efecto del `submitNonce` se queda como está, cambiando `agenticHook.isRunning` por `trabajando`. `runningToolName` sale de `enCurso.find(tc => tc.status === 'running')?.name`.

En `.unified-bar__detener` (`src/styles/unified-bar.css`): un botón secundario con tokens.

```css
.unified-bar__detener { margin-left: auto; height: 24px; padding: 0 10px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font: inherit; cursor: pointer; }
.unified-bar__detener:hover { background: var(--bg-elevated); }
.unified-bar__detener:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 7: Se va el hook**

En `src/copilot/hooks/useAgenticLoop.ts`:
- Se borran la función `useAgenticLoop` y los imports que solo ella usaba (`useState`, `useCallback`, `useMemo`, `useDispatch`, `createDebugAgenticLoop`, `showErrorToast`).
- Quedan `ToolCallProgress`, `UseAgenticLoopReturn` (si nadie lo importa, también se va) y `reduceToolCalls`.
- La cabecera del módulo dice: «El turno del agente lo corre `copilot/conversacion.ts` (P2c); aquí quedan el tipo de un paso y su reductor».

En `src/copilot/hooks/__tests__/useAgenticLoop.test.ts`, el `it('hook module exports useAgenticLoop and reduceToolCalls')` pasa a comprobar solo `reduceToolCalls`. El `describe('useAgenticLoop integration')` conserva los dos casos que no montan el hook.

- [ ] **Step 8: Correr los tests y verlos pasar**

Run: `npx vitest run src/store/__tests__/iaSlice.test.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.detener.test.ts src/copilot/__tests__/conversacion.test.ts src/copilot/hooks src/copilot/reasoning`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: typecheck 0, suite verde, lint sin errores nuevos, `✓ ningún contador subió`.

- [ ] **Step 9: Commit**

```bash
git add src/store/iaSlice.ts src/store/__tests__/iaSlice.test.ts src/store/index.ts src/copilot/conversacion.ts src/copilot/__tests__/conversacion.test.ts src/copilot/reasoning/bridge/AgenticLoop.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.detener.test.ts src/components/shell/UnifiedBarChat.tsx src/styles/unified-bar.css src/copilot/hooks/useAgenticLoop.ts src/copilot/hooks/__tests__/useAgenticLoop.test.ts
git commit -m "feat(ia): la conversación y el agente viven fuera de la barra, y se pueden detener"
```

---

### Task 2: La escalera de lo que se llama

**Files:**
- Create: `src/shortcuts/escaleraDeLoLlamado.ts`, `src/shortcuts/__tests__/escaleraDeLoLlamado.test.tsx`
- Modify: `src/shortcuts/ShortcutProvider.tsx`, `src/components/PatternEditor/SeccionDelPatron.tsx` («Más»), `src/components/PatternEditor/FilaDeCapas.tsx` («Mostrar»), `src/components/shell/LogoMenu.tsx`, `src/components/PatternEditor/ContextMenu.tsx`, `src/components/shell/LeftDock.tsx`, `src/hooks/usePanelHost.ts`, `src/components/shell/ContextPanel.tsx`
- Tests: `SeccionDelPatron.mas.test.tsx`, `FilaDeCapas.test.tsx`, `Dock.test.tsx`, `ContextPanel.test.tsx`, `usePanelHost.test.ts`, `tests/e2e/linea-al-pie.spec.ts`

**Interfaces:**
- Produces:
  - `type Prioridad = 'menu' | 'ia' | 'panel'`;
  - `subirPeldano(nombre: string, prioridad: Prioridad, alEscape: () => void): () => void` (devuelve la función que lo baja);
  - `bajarLaEscalera(): string | null` (el nombre del peldaño que respondió);
  - `usePeldanoDeEscape(nombre: string, prioridad: Prioridad, activo: boolean, alEscape: () => void): void`.
- Consumes: `hayModalDelante()` de `src/utils/superficieModal.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/shortcuts/__tests__/escaleraDeLoLlamado.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * La escalera de lo que se llama (spec 2026-10-02 § 6.2): un menú, la barra de
 * IA y un panel se cierran con Esc antes que la selección. Un Escape, un
 * peldaño. ShortcutProvider la consulta antes de su atajo global de
 * deseleccionar; un modal encima se queda su Esc.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useState } from 'react';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import { bajarLaEscalera, subirPeldano, usePeldanoDeEscape } from '../escaleraDeLoLlamado';

afterEach(cleanup);

describe('el orden de los peldaños', () => {
  it('menú antes que IA antes que panel; a igual prioridad, el último que se abrió', () => {
    const orden: string[] = [];
    const bajar = [
      subirPeldano('panel', 'panel', () => orden.push('panel')),
      subirPeldano('ia', 'ia', () => orden.push('ia')),
      subirPeldano('mostrar', 'menu', () => orden.push('mostrar')),
      subirPeldano('mas', 'menu', () => orden.push('mas')),
    ];
    expect(bajarLaEscalera()).toBe('mas');
    bajar[3]();
    expect(bajarLaEscalera()).toBe('mostrar');
    bajar[2]();
    expect(bajarLaEscalera()).toBe('ia');
    bajar[1]();
    expect(bajarLaEscalera()).toBe('panel');
    bajar[0]();
    expect(bajarLaEscalera()).toBeNull();
    expect(orden).toEqual(['mas', 'mostrar', 'ia', 'panel']);
  });
});

function montar(conModal = false) {
  const store = configureStore({ reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer } });
  let abrir!: () => void;
  function Menu() {
    const [abierto, setAbierto] = useState(false);
    abrir = () => setAbierto(true);
    usePeldanoDeEscape('menu-de-prueba', 'menu', abierto, () => setAbierto(false));
    return abierto ? <div role="menu" aria-label="Menú de prueba" /> : null;
  }
  function Lienzo() {
    useKeyboardShortcuts();
    return <div data-shortcut-context="2d" tabIndex={0} data-testid="lienzo" />;
  }
  const view = render(
    <Provider store={store}>
      <ShortcutProvider>
        <Lienzo />
        <Menu />
        {conModal && <div role="dialog" aria-modal="true" aria-label="¿Unir las piezas?" />}
      </ShortcutProvider>
    </Provider>,
  );
  const lienzo = view.getByTestId('lienzo');
  lienzo.focus();
  store.dispatch({ type: 'editor/selectPiece', payload: 'p1' });
  act(() => abrir());
  const escape = () => act(() => { lienzo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  return { store, view, escape };
}

describe('con ShortcutProvider', () => {
  it('el primer Escape cierra el menú y la pieza sigue seleccionada; el segundo la suelta', () => {
    const { store, view, escape } = montar();
    escape();
    expect(view.queryByRole('menu')).toBeNull();
    expect(store.getState().editor.selectedPieceIds, 'el Escape del menú deseleccionó también').toEqual(['p1']);
    escape();
    expect(store.getState().editor.selectedPieceIds).toEqual([]);
  });

  it('con un modal delante, el menú no se lleva el Escape: es del modal', () => {
    const { view, escape } = montar(true);
    escape();
    expect(view.queryByRole('menu'), 'el Escape se fue al menú de detrás del modal').not.toBeNull();
  });
});
```

En `SeccionDelPatron.mas.test.tsx`, `FilaDeCapas.test.tsx` y `Dock.test.tsx`, los casos que cierran con `fireEvent.keyDown(window, { key: 'Escape' })`:
- montan el componente dentro de `<ShortcutProvider>` (de `../../../shortcuts/ShortcutProvider`);
- pulsan Escape donde está el foco: `fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })`.

Lo que comprueban no cambia: el menú se cierra y el foco vuelve a su botón.

En `ContextPanel.test.tsx`:
- Se borran los dos casos de Escape («renders the title and still closes on the button and Escape» se queda con el botón y pierde su línea de Escape; «Escape con dos paneles abiertos cierra los dos…» se muda), el arnés del `flushSync` y su comentario H-2. `ContextPanel` ya no escucha teclas: los paneles los cierra un solo peldaño en `usePanelHost`.

En `src/hooks/__tests__/usePanelHost.test.ts`, el caso mudado:

```ts
  it('Escape con dos paneles abiertos cierra los dos: un solo peldaño, el de los paneles', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => { result.current.openPanel('Properties'); result.current.openPanel('Layers'); });
    expect([result.current.leftPanel, result.current.rightPanel]).toEqual(['Properties', 'Layers']);
    act(() => { expect(bajarLaEscalera()).toBe('paneles'); });
    expect([result.current.leftPanel, result.current.rightPanel]).toEqual([null, null]);
  });
```

En `tests/e2e/linea-al-pie.spec.ts`, en el caso de 1100 px: después de `await expect(mas).toBeFocused();` (tras el Escape dentro del menú) se borran el comentario de la decisión 10 y el `dispatch(page, 'editor/selectPiece', 'desplazar-pie')`. En su lugar se comprueba que la pieza sigue seleccionada:

```ts
  // Escape cierra «Más» y nada más: la pieza sigue seleccionada (spec
  // 2026-10-02 § 6.2, la escalera de lo que se llama).
  expect(await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => { editor: { selectedPieceIds: string[] } } } }).__VINA_STORE__.getState().editor.selectedPieceIds)).toEqual(['desplazar-pie']);
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/shortcuts/__tests__/escaleraDeLoLlamado.test.tsx src/hooks/__tests__/usePanelHost.test.ts`
Expected: FAIL. No existe `../escaleraDeLoLlamado`.

- [ ] **Step 3: La escalera**

`src/shortcuts/escaleraDeLoLlamado.ts`:

```ts
import { useEffect, useRef } from 'react';

/**
 * La escalera de lo que se llama (spec 2026-10-02 «la interfaz en papel»
 * § 6.2): un menú abierto, la barra de IA y un panel se cierran con Esc antes
 * que la selección, y de uno en uno. ShortcutProvider la consulta antes de su
 * atajo global de deseleccionar, así que van antes los gestos del lienzo (en
 * captura) y el borrador de una cota (corta la propagación antes); un modal
 * encima se queda su Esc.
 *
 * No es la escalera de las herramientas del lienzo
 * (`2026-09-06-escalera-de-escape-design.md`): esa es otro trabajo.
 */
export type Prioridad = 'menu' | 'ia' | 'panel';

const PESO: Record<Prioridad, number> = { menu: 3, ia: 2, panel: 1 };

interface Peldano {
  nombre: string;
  prioridad: Prioridad;
  alEscape: () => void;
}

const peldanos: Peldano[] = [];

/** Sube un peldaño. Devuelve la función que lo baja. */
export function subirPeldano(nombre: string, prioridad: Prioridad, alEscape: () => void): () => void {
  const peldano = { nombre, prioridad, alEscape };
  peldanos.push(peldano);
  return () => {
    const i = peldanos.indexOf(peldano);
    if (i >= 0) peldanos.splice(i, 1);
  };
}

/**
 * Un Escape, un peldaño: responde el de más prioridad y, a igual prioridad, el
 * último que se abrió. Devuelve su nombre, o `null` si no hay ninguno.
 */
export function bajarLaEscalera(): string | null {
  let elegido: Peldano | null = null;
  for (const p of peldanos) {
    if (!elegido || PESO[p.prioridad] >= PESO[elegido.prioridad]) elegido = p;
  }
  if (!elegido) return null;
  elegido.alEscape();
  return elegido.nombre;
}

/** El peldaño de una superficie, mientras está `activo`. `alEscape` se lee por ref. */
export function usePeldanoDeEscape(nombre: string, prioridad: Prioridad, activo: boolean, alEscape: () => void): void {
  const ref = useRef(alEscape);
  ref.current = alEscape;
  useEffect(() => {
    if (!activo) return;
    return subirPeldano(nombre, prioridad, () => ref.current());
  }, [nombre, prioridad, activo]);
}
```

En `src/shortcuts/ShortcutProvider.tsx`, el import y, justo antes de `const activeContexts = getActiveContext();`:

```ts
import { bajarLaEscalera } from './escaleraDeLoLlamado';
```

```ts
      // Lo que se llama se cierra antes que la selección (spec 2026-10-02
      // § 6.2): un menú, la barra de IA, un panel. Un Escape, un peldaño. Un
      // modal delante se queda su Escape.
      if (e.key === 'Escape' && !hayModalDelante()) {
        const peldano = bajarLaEscalera();
        if (peldano) {
          pushJournal('shortcut', 'escape', { peldano });
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
```

- [ ] **Step 4: Cada superficie, su peldaño**

Cada una pierde su oyente de Escape en `window` o en `document`. El de `mousedown` (cerrar al pinchar fuera) se queda.

**`SeccionDelPatron.tsx` («Más»):** del efecto `if (!abierto) return; … onKey …` se borran `onKey` y sus dos líneas de `add/removeEventListener('keydown')`. Debajo:

```ts
  usePeldanoDeEscape('mas', 'menu', abierto, () => {
    if (menuRef.current?.contains(document.activeElement)) masRef.current?.focus();
    setAbierto(false);
  });
```

**`FilaDeCapas.tsx` («Mostrar»):** igual, con sus refs:

```ts
  usePeldanoDeEscape('mostrar', 'menu', abierto, () => {
    if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierto(false);
  });
```

**`LogoMenu.tsx`:** se borra el efecto de `keydown` entero. En su lugar:

```ts
  usePeldanoDeEscape('vina', 'menu', open, () => { setOpen(false); setHoveredTop(null); });
```

**`ContextMenu.tsx`:** del efecto se borran `handleKey` y sus dos líneas de `keydown`. Después del efecto:

```ts
  usePeldanoDeEscape('contextual', 'menu', menu.visible, () => onCloseRef.current());
```

**`LeftDock.tsx` (el personalizador del «+»):** se borran `onKey` y sus dos líneas.

```ts
  usePeldanoDeEscape('personalizador', 'menu', pickerOpen, () => {
    if (pickerRef.current?.contains(document.activeElement)) addRef.current?.focus();
    setPickerOpen(false);
  });
```

**`src/hooks/usePanelHost.ts`:** los paneles son un solo peldaño, que cierra los dos (lo fijaba `ContextPanel.test.tsx` y se queda).

```ts
  usePeldanoDeEscape('paneles', 'panel', Boolean(leftPanel || rightPanel), () => { closeLeft(); closeRight(); });
```

**`ContextPanel.tsx`:** se borran el efecto de Escape, `onCloseRef` y su comentario. El ✕ sigue llamando a `onClose`. Su cabecera dice: «Los cierra Esc desde `usePanelHost` (un peldaño de la escalera de lo que se llama)».

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx vitest run src/shortcuts src/hooks/__tests__/usePanelHost.test.ts src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/ContextPanel.test.tsx`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

Run (con el Vite de 5174 arriba y sin tocar archivos mientras corre): `npx playwright test tests/e2e/linea-al-pie.spec.ts tests/e2e/1100-margen-en-el-borde.spec.ts tests/e2e/barra-superior.spec.ts tests/e2e/margen-de-herramientas.spec.ts --workers=2 --retries=0`
Expected: PASS. El caso de 1100 px comprueba que la pieza sigue seleccionada tras el Escape de «Más».

- [ ] **Step 6: Commit**

```bash
git add src/shortcuts/escaleraDeLoLlamado.ts src/shortcuts/__tests__/escaleraDeLoLlamado.test.tsx src/shortcuts/ShortcutProvider.tsx src/components/PatternEditor/SeccionDelPatron.tsx src/components/PatternEditor/FilaDeCapas.tsx src/components/shell/LogoMenu.tsx src/components/PatternEditor/ContextMenu.tsx src/components/shell/LeftDock.tsx src/hooks/usePanelHost.ts src/components/shell/ContextPanel.tsx src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/ContextPanel.test.tsx src/hooks/__tests__/usePanelHost.test.ts tests/e2e/linea-al-pie.spec.ts
git commit -m "feat(esc): lo que se llama se cierra antes que la selección, de uno en uno"
```

---

### Task 3: Preferencias como panel

**Files:**
- Create: `src/components/shell/PreferenciasPanel.tsx`, `src/components/shell/__tests__/PreferenciasPanel.test.tsx`
- Modify: `src/copilot/AgentSettings.tsx` (`enPanel`), `src/components/shell/AppShell.tsx`, `src/components/shell/LogoMenu.tsx`, `src/components/shell/unifiedBarCommandDefs.ts`

**Interfaces:**
- Produces:
  - el panel `'Preferences'`, con el rótulo «IA y ratón»;
  - `renderPanelContent(name: string, cerrar: () => void)`;
  - `PreferenciasPanel({ alCerrar }: { alCerrar: () => void })`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/shell/__tests__/PreferenciasPanel.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import PreferenciasPanel from '../PreferenciasPanel';
import { PREFERENCES_MENU } from '../LogoMenu';
import { COMMANDS } from '../unifiedBarCommandDefs';

/**
 * Preferencias (spec 2026-10-02 § 6.1): lo que era el «modo ajustes» de la
 * barra de IA pasa a un panel, con puerta en Vina › Preferencias y en la
 * paleta. El panel ya tiene título y ✕: AgentSettings no pinta los suyos.
 */
afterEach(cleanup);

describe('el panel «IA y ratón»', () => {
  it('trae el esquema del ratón y los ajustes de la IA, sin una segunda cabecera ni un segundo «Cerrar»', () => {
    render(<Provider store={store}><PreferenciasPanel alCerrar={() => {}} /></Provider>);
    expect(screen.getByText('Ratón (CLO3D)')).toBeTruthy();
    expect(screen.getByText('Idioma')).toBeTruthy();
    expect(screen.queryByText('Ajustes del agente')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('«Guardar preferencias» guarda y cierra el panel', () => {
    const alCerrar = vi.fn();
    render(<Provider store={store}><PreferenciasPanel alCerrar={alCerrar} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe('sus puertas', () => {
  it('Vina › Preferencias › «IA y ratón...»', () => {
    expect(PREFERENCES_MENU).toContainEqual(expect.objectContaining({ label: 'IA y ratón...', panel: 'Preferences' }));
  });

  it('la paleta: Paneles › «IA y ratón»', () => {
    const onOpenPanel = vi.fn();
    const cmd = COMMANDS.find((c) => c.name === 'IA y ratón');
    expect(cmd?.category).toBe('Paneles');
    cmd!.action(store.dispatch, { onOpenPanel } as never);
    expect(onOpenPanel).toHaveBeenCalledWith('Preferences');
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/shell/__tests__/PreferenciasPanel.test.tsx`
Expected: FAIL. No existe `../PreferenciasPanel`.

- [ ] **Step 3: `AgentSettings` en un panel**

En `src/copilot/AgentSettings.tsx`, la prop nueva en `AgentSettingsProps`:

```ts
  /** Dentro de un panel (Preferencias, spec 2026-10-02 § 6.1): el panel ya
   *  tiene título y ✕, así que no se pintan la cabecera ni el «Cerrar». */
  enPanel?: boolean;
```

En la firma del componente se añade `enPanel = false`. La fila de la cabecera (`<h4>Ajustes del agente</h4>` y su ✕) queda envuelta en `{!enPanel && ( … )}`, y el botón «Cerrar» del pie, en `{!enPanel && <button style={btnSecondaryStyle} onClick={onClose}>Cerrar</button>}`.

- [ ] **Step 4: El panel y sus puertas**

`src/components/shell/PreferenciasPanel.tsx`:

```tsx
import InputSchemeSection from './InputSchemeSection';
import AgentSettings from '../../copilot/AgentSettings';

/**
 * Preferencias (spec 2026-10-02 «la interfaz en papel» § 6.1): el esquema del
 * ratón y los ajustes de la IA, que eran el «modo ajustes» de la barra. Un
 * panel del marco, con puerta en Vina › Preferencias › «IA y ratón...» y en la
 * paleta.
 */
export default function PreferenciasPanel({ alCerrar }: { alCerrar: () => void }) {
  return (
    <>
      <InputSchemeSection />
      <AgentSettings
        enPanel
        onClose={alCerrar}
        onSave={() => {
          // `ConnectionsList` avisa de cada cambio de conexión por su cuenta;
          // esto es para las preferencias (enseñanza, idioma) al guardar.
          window.dispatchEvent(new CustomEvent('vina:provider-config-changed'));
        }}
      />
    </>
  );
}
```

En `src/components/shell/AppShell.tsx`:
- `PANEL_LABELS` gana `Preferences: 'IA y ratón',`.
- `renderPanelContent(name: string, cerrar: () => void)` gana:

```tsx
    case 'Preferences':
      return <PreferenciasPanel alCerrar={cerrar} />;
```

- Las dos llamadas pasan a ser `renderPanelContent(leftPanel, closeLeft)` y `renderPanelContent(rightPanel, closeRight)`.

En `src/components/shell/LogoMenu.tsx`:

```ts
// eslint-disable-next-line react-refresh/only-export-components
export const PREFERENCES_MENU: MenuItem[] = [
  { label: 'Avatar y medidas...', panel: 'Avatar' },
  { label: 'IA y ratón...', panel: 'Preferences' },
];
```

(Se exporta para que su test lea la lista que pinta el menú, no una copia.)

El comentario de arriba («Fase1-S2: AI Provider abría el placeholder…») pasa a decir: «Las conexiones de IA y el ratón son el panel Preferencias desde P2c».

En `src/components/shell/unifiedBarCommandDefs.ts`, después de `show-properties`:

```ts
  { id: 'show-preferences', category: 'Paneles', name: 'IA y ratón', description: 'Conexiones de IA, idioma y ratón', icon: Settings, action: (_d, cb) => cb.onOpenPanel('Preferences') },
```

Si `Settings` no está importado de `lucide-react` en ese archivo, se añade.

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/shell src/copilot`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/PreferenciasPanel.tsx src/components/shell/__tests__/PreferenciasPanel.test.tsx src/copilot/AgentSettings.tsx src/components/shell/AppShell.tsx src/components/shell/LogoMenu.tsx src/components/shell/unifiedBarCommandDefs.ts
git commit -m "feat(preferencias): las conexiones de IA y el ratón son un panel, con puerta en Vina y en la paleta"
```

---

### Task 4: La barra convocada: un modo, tres estados, el botón «IA», `Ctrl+/` y `Ctrl+K`

**Files:**
- Modify:
  - la barra: `src/components/shell/UnifiedBar.tsx`, `src/components/shell/UnifiedBarChat.tsx`, `src/styles/unified-bar.css`, `src/components/shell/barPosition.ts` (`BAR_HEIGHT = 48`);
  - quién la monta y la abre: `src/components/shell/AppShell.tsx`, `src/components/shell/TopBar.tsx`, `src/styles/layout.css`;
  - atajos: `src/shortcuts/defaults.ts`, `src/hooks/useKeyboardShortcuts.ts`;
  - `src/components/PatternEditor/EmptyState2D.tsx` (solo el `onClick` de la IA).
- Create: `src/components/shell/__tests__/la-ia-convocada.test.tsx`, `tests/e2e/ia-convocada.spec.ts`
- Tests que cambian: `tests/repo/lo-que-flota-es-papel.test.ts` (la barra es papel), `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, `tests/e2e/emplazamiento-modales.spec.ts`, `tests/e2e/contraste-del-cromo.spec.ts`, `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`; y los de estilos que nombren `.unified-bar__mode-btn` (los dice la suite).

**Interfaces:**
- Consumes:
  - de la Task 1: `abrirIA`, `ocultarIA`, `RootState['ia']`, `enviar`, `detener`;
  - de la Task 2: `usePeldanoDeEscape`;
  - de la Task 3: el panel `'Preferences'`.
- Produces: el botón `.boton-ia` en la barra superior, y la barra montada solo con `ia.abierta`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/shell/__tests__/la-ia-convocada.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { abrirIA, ocultarIA, empezarTurno, terminarTurno, olvidarConversacion } from '../../../store/iaSlice';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import TopBar from '../TopBar';
import UnifiedBar from '../UnifiedBar';

/**
 * La IA convocada (spec 2026-10-02 § 6.2 y § 4.2): no existe en reposo; un
 * modo; el botón «IA» dice sus tres estados; Esc con texto lo borra y con el
 * campo vacío la oculta, antes que la selección.
 */
beforeEach(() => {
  act(() => { store.dispatch(ocultarIA()); store.dispatch(terminarTurno()); store.dispatch(olvidarConversacion()); });
});
afterEach(cleanup);

function barraSiAbierta() {
  const abierta = store.getState().ia.abierta;
  return abierta ? <UnifiedBar onOpenPanel={() => {}} /> : null;
}

describe('el botón «IA», en sus tres estados', () => {
  it('cerrada: en reposo; abierta: marcado; trabajando con la barra oculta: marcado y con señal', () => {
    render(<Provider store={store}><TopBar onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
    const ia = screen.getByRole('button', { name: 'Conversar con la IA' });
    expect(ia.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(ia);
    expect(store.getState().ia.abierta).toBe(true);
    expect(screen.getByRole('button', { name: 'Conversar con la IA' }).getAttribute('aria-pressed')).toBe('true');
    act(() => { store.dispatch(empezarTurno()); store.dispatch(ocultarIA()); });
    const trabajando = screen.getByRole('button', { name: 'La IA está trabajando' });
    expect(trabajando.getAttribute('aria-pressed')).toBe('true');
    expect(trabajando.querySelector('.boton-ia__actividad')).not.toBeNull();
  });
});

describe('la cápsula', () => {
  it('un solo modo: ni botones de modo ni «Enviar» hasta que hay texto', () => {
    act(() => { store.dispatch(abrirIA()); });
    render(<Provider store={store}><ShortcutProvider>{barraSiAbierta()}</ShortcutProvider></Provider>);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta');
    expect(document.activeElement).toBe(campo);
    expect(document.querySelector('.unified-bar__modes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
    fireEvent.change(campo, { target: { value: 'hola' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy();
    expect(document.querySelector('.unified-bar')?.getAttribute('data-material')).toBe('papel');
  });

  it('«/» al empezar son comandos; Retroceso con el campo vacío vuelve a la conversación', () => {
    act(() => { store.dispatch(abrirIA()); });
    render(<Provider store={store}><ShortcutProvider>{barraSiAbierta()}</ShortcutProvider></Provider>);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '/' } });
    expect(campo.value).toBe('');
    expect(screen.getByPlaceholderText('Escribe un comando')).toBe(campo);
    expect(document.querySelector('.unified-bar__panel')).not.toBeNull();
    fireEvent.keyDown(campo, { key: 'Backspace' });
    expect(screen.getByPlaceholderText('Pide algo o pregunta')).toBe(campo);
  });

  it('Ctrl+K abre con los comandos', () => {
    act(() => { store.dispatch(abrirIA('comandos')); });
    render(<Provider store={store}><ShortcutProvider>{barraSiAbierta()}</ShortcutProvider></Provider>);
    expect(screen.getByPlaceholderText('Escribe un comando')).toBeTruthy();
  });

  it('Esc con texto lo borra; con el campo vacío la oculta, y la pieza sigue seleccionada', () => {
    act(() => { store.dispatch(abrirIA()); store.dispatch({ type: 'editor/selectPiece', payload: 'p1' }); });
    render(<Provider store={store}><ShortcutProvider>{barraSiAbierta()}</ShortcutProvider></Provider>);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'acorta' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo.value).toBe('');
    expect(store.getState().ia.abierta).toBe(true);
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(store.getState().ia.abierta).toBe(false);
    expect(store.getState().editor.selectedPieceIds).toEqual(['p1']);
  });
});

describe('los atajos', () => {
  it('Ctrl+/ es global y abre la conversación; Ctrl+K abre los comandos', async () => {
    const { DEFAULT_SHORTCUTS } = await import('../../../shortcuts/defaults');
    expect(DEFAULT_SHORTCUTS.find((s) => s.id === 'copilot.focusChat')).toMatchObject({ key: '/', ctrl: true, context: 'global', label: 'Conversar con la IA' });
    expect(DEFAULT_SHORTCUTS.find((s) => s.id === 'copilot.togglePanel')).toBeUndefined();
  });
});
```

`tests/e2e/ia-convocada.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { cargarDxfDeMaria, reposo, centroDePieza } from './helpers/estados';

/**
 * La IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2), en la
 * pantalla de María (1366 × 643, Split). Lo que jsdom no ve: dónde aparece la
 * cápsula, que no está en reposo, y que sus puertas abren de verdad.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.use({ viewport: { width: 1366, height: 643 } });

const leerIA = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { ia: { abierta: boolean; mensajes: unknown[] }; editor: { selectedPieceIds: string[] } } } })
    .__VINA_STORE__.getState());

test('no existe en reposo; «IA» la abre sobre la línea al pie, en papel, de una línea', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await expect(page.locator('.unified-bar')).toHaveCount(0);
  const ia = page.getByRole('button', { name: 'Conversar con la IA' });
  await expect(ia).toHaveAttribute('aria-pressed', 'false');

  await ia.click();
  const barra = page.locator('.unified-bar');
  await expect(barra).toBeVisible();
  await expect(barra).toHaveAttribute('data-material', 'papel');
  await expect(page.getByPlaceholder('Pide algo o pregunta')).toBeFocused();
  const caja = (await barra.boundingBox())!;
  expect(Math.round(caja.width)).toBe(560);
  expect(Math.round(caja.height)).toBe(48);
  const lineaTop = await page.locator('.linea-al-pie').evaluate((e) => e.getBoundingClientRect().top);
  expect(caja.y + caja.height, 'la cápsula pisa la línea al pie').toBeLessThanOrEqual(lineaTop);
  await expect(ia).toHaveAttribute('aria-pressed', 'true');
});

test('la conversación sobrevive a ocultarla; Esc la oculta sin soltar la pieza', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('z');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  const seleccion = (await leerIA(page)).editor.selectedPieceIds;
  expect(seleccion.length).toBe(1);

  await page.keyboard.press('Control+/');
  const campo = page.getByPlaceholder('Pide algo o pregunta');
  await expect(campo).toBeFocused();
  await campo.fill('hola');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');

  await page.keyboard.press('Escape');
  await expect(page.locator('.unified-bar')).toHaveCount(0);
  expect((await leerIA(page)).editor.selectedPieceIds, 'el Escape de la barra soltó la pieza').toEqual(seleccion);

  await page.keyboard.press('Control+/');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');
});

test('Ctrl+K abre los comandos; un comando abre su panel y la barra se va', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Escribe un comando')).toBeFocused();
  await page.locator('.unified-bar__input').fill('IA y ratón');
  await page.locator('.unified-bar__panel').getByText('IA y ratón', { exact: true }).first().click();
  await expect(page.locator('.context-panel__header', { hasText: 'IA y ratón' })).toBeVisible();
  await expect(page.locator('.unified-bar')).toHaveCount(0);
});
```

Y en `tests/e2e/ia-convocada.spec.ts`, el caso del Review Focus 5:

```ts
test('la pantalla vacía la llama, y la cápsula no tapa «Importar DXF»', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('empty-state-2d')).toBeVisible({ timeout: 20_000 });
  await page.locator('.empty-state-2d__ai-hint').click();
  const barra = page.locator('.unified-bar');
  await expect(barra).toBeVisible();
  await expect(page.locator('.unified-bar__input')).toBeFocused();
  const importar = (await page.getByRole('button', { name: 'Importar DXF' }).boundingBox())!;
  const caja = (await barra.boundingBox())!;
  const solapan = importar.x < caja.x + caja.width && caja.x < importar.x + importar.width
    && importar.y < caja.y + caja.height && caja.y < importar.y + importar.height;
  expect(solapan, 'la cápsula tapa «Importar DXF»').toBe(false);
});
```

En `src/components/shell/__tests__/unifiedBarPosition.test.ts`, cada `58` (el alto de la barra vieja) pasa a `48`. Su caso de la posición guardada al pie (`643 - 58 - 24` → `643 - 36 - 58 - 16`) es el Review Focus 4: la posición guardada con la barra de 58 se sigue escribiendo con `58` y lo que se lee pasa a `643 - 36 - 48 - 16`. Así, la cápsula de 48 queda entera sobre la línea al pie.

En `tests/repo/lo-que-flota-es-papel.test.ts`, `RAICES` gana `['src/components/shell/UnifiedBar.tsx', 1]`.

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, el `describe` de los botones de modo pasa a medir la cápsula convocada. Los cuatro tests de modos se sustituyen por estos dos:

```ts
  test('convocada en Split, la cápsula se alcanza entera y no pisa el grupo del patrón', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    await page.keyboard.press('Control+/');
    await expect(page.locator('.unified-bar')).toBeVisible();
    const tapados = (await alcanzables(page, '.unified-bar input')).filter((m) => !m.alcanzable);
    expect(tapados, `tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`).toEqual([]);
    expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
  });

  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    test(`tampoco a ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await abrirApp(page);
      await vistaDividida(page);
      await unaPieza(page);
      await page.keyboard.press('Control+/');
      await expect(page.locator('.unified-bar')).toBeVisible();
      expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
    });
  }
```

El test «y los interruptores tampoco quedan tapados por la barra» se queda como está.

En `tests/e2e/emplazamiento-modales.spec.ts`:
- **Prueba que mide `ganaSobreBarraIA`.** Antes de abrir lo que mide, convoca la barra; si no, la comparación sería contra nada:

```ts
    await page.keyboard.press('Control+/');
    await expect(page.locator('.unified-bar')).toBeVisible();
```

- **Prueba del `ConnectionModal`.** El clic en «Modo ajustes» se cambia por `await abrirPanel(page, 'IA y ratón', 'IA y ratón');` (de `./helpers/estados`). El comentario pasa a decir: «El panel Preferencias monta AgentSettings → ConnectionsList → ConnectionModal».

En `tests/e2e/contraste-del-cromo.spec.ts`, `await page.getByRole('button', { name: 'Modo ajustes' }).click();` se cambia por `await abrirPanel(page, 'IA y ratón', 'IA y ratón');`. Si `abrirPanel` no está importado de `./helpers/estados`, se añade.

En `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`, el caso que espera el evento `vina:focusChat` pasa a esperar `store.getState().ia.abierta === true` tras el clic.

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/components/shell/__tests__/la-ia-convocada.test.tsx tests/repo/lo-que-flota-es-papel.test.ts src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`
Expected: FAIL. No hay botón «Conversar con la IA», existen los botones de modo, y `ia.abierta` no cambia.

- [ ] **Step 3: La barra**

`src/components/shell/barPosition.ts`: `export const BAR_HEIGHT = 48;`, y el comentario de la constante dice «la cápsula de una línea (spec 2026-10-02 § 6.2)».

`src/components/shell/UnifiedBar.tsx` queda así. El arrastre y el adjunto de DXF no cambian:

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Search, ArrowUp } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { showErrorToast } from '../../store/copilotUISlice';
import { ocultarIA } from '../../store/iaSlice';
import { enviar } from '../../copilot/conversacion';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { readAndParseDXFFile } from '../../utils/dxf';
import { dxfErrorMessage, type PendingDXFAttachment } from './dxfImport';
import UnifiedBarChat from './UnifiedBarChat';
import UnifiedBarCommands from './UnifiedBarCommands';
import { loadPosition, clampPosition, savePosition } from './barPosition';

interface UnifiedBarProps {
  onOpenPanel: (name: string) => void;
}

/**
 * La barra de IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2): una
 * cápsula de papel de una línea, que solo existe abierta (la monta AppShell con
 * `ia.abierta`). Un solo modo: escribir es conversación; `Ctrl+K`, o «/» al
 * empezar, son comandos. La conversación y el agente viven en el store, así
 * que ocultarla no los pierde.
 */
export default function UnifiedBar({ onOpenPanel }: UnifiedBarProps) {
  const dispatch = useDispatch();
  const { modoDeApertura, aperturas, mensajes, trabajando } = useSelector((s: RootState) => s.ia);
  const [comandos, setComandos] = useState(modoDeApertura === 'comandos');
  const [input, setInput] = useState('');
  const [position, setPosition] = useState(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Cada apertura —«IA», Ctrl+/, Ctrl+K, la pantalla vacía— pone el foco en el
  // campo; un Ctrl+K con la barra ya abierta pasa a comandos.
  useEffect(() => {
    setComandos(modoDeApertura === 'comandos');
    inputRef.current?.focus();
  }, [aperturas, modoDeApertura]);

  // Esc (spec § 6.2): con texto, lo borra; con el campo vacío, la oculta. La
  // conversación y el agente siguen. Un peldaño por delante del panel y de la
  // selección.
  usePeldanoDeEscape('ia', 'ia', true, () => {
    if (inputRef.current?.value) { setInput(''); return; }
    dispatch(ocultarIA());
  });

  // ─── DXF adjunto (soltar → adjuntar → enviar con texto) ──────────
  const [pendingDXF, setPendingDXF] = useState<PendingDXFAttachment | null>(null);
  const [dxfDragActive, setDxfDragActive] = useState(false);
  const dxfDragCounter = useRef(0);
  const attachDXF = useCallback(async (file: File) => {
    try {
      const { name, result } = await readAndParseDXFFile(file, { unit: 'auto', autoDetect: true });
      setPendingDXF({ name, pieces: result.pieces });
      setComandos(false);
    } catch (err) {
      dispatch(showErrorToast(dxfErrorMessage(err)));
    }
  }, [dispatch]);
  // (handleDxfDragEnter / Over / Leave / Drop: sin cambios)

  // ─── Arrastre y redimensionado: sin cambios ──────────────────────

  const handleSubmit = useCallback(() => {
    if (comandos || (!input.trim() && !pendingDXF)) return;
    const adjunto = pendingDXF;
    setInput('');
    setPendingDXF(null);
    void enviar(input, adjunto);
  }, [comandos, input, pendingDXF]);

  const conPanel = comandos || mensajes.length > 0 || trabajando || pendingDXF !== null;
  const Icono = comandos ? Search : MessageSquare;

  return (
    <div
      className={['unified-bar', conPanel ? 'unified-bar--panel-open' : '', isDragging ? 'unified-bar--dragging' : 'unified-bar--draggable'].filter(Boolean).join(' ')}
      data-superficie="barra"
      data-material="papel"
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
      onDragEnter={handleDxfDragEnter}
      onDragOver={handleDxfDragOver}
      onDragLeave={handleDxfDragLeave}
      onDrop={handleDxfDrop}
    >
      {/* (el velo del DXF al arrastrar: sin cambios) */}
      <Icono size={16} className="unified-bar__icono" aria-hidden="true" />
      <div className="unified-bar__input-wrap">
        <input
          ref={inputRef}
          className="unified-bar__input"
          aria-label={comandos ? 'Buscar un comando' : 'Pedirle algo a la IA'}
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            if (!comandos && input === '' && v.startsWith('/')) { setComandos(true); setInput(v.slice(1)); return; }
            setInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Backspace' && comandos && input === '') setComandos(false);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setComandos(true); }
          }}
          placeholder={comandos ? 'Escribe un comando' : 'Pide algo o pregunta'}
        />
      </div>
      {!comandos && (input.trim() || pendingDXF) ? (
        <button className="unified-bar__send" aria-label="Enviar" onClick={handleSubmit}>
          <ArrowUp size={16} />
        </button>
      ) : (
        <kbd className="unified-bar__esc" aria-hidden="true">Esc</kbd>
      )}
      {conPanel && (
        <div className="unified-bar__panel" data-superficie="paleta" onClick={(e) => e.stopPropagation()}>
          {comandos ? (
            <UnifiedBarCommands
              query={input}
              onExecute={() => { setInput(''); dispatch(ocultarIA()); }}
              onOpenPanel={onOpenPanel}
            />
          ) : (
            <UnifiedBarChat pendingDXF={pendingDXF} clearAttachment={() => setPendingDXF(null)} />
          )}
        </div>
      )}
    </div>
  );
}
```

> El arrastre (`handleMouseDown` y su efecto), el reajuste al redimensionar y los cuatro manejadores de arrastrar un DXF se copian sin cambios del archivo actual. En `handleMouseDown` se cambian `.unified-bar__mode-btn` por `.unified-bar__esc` en la lista de lo que no arrastra. Se van:
> - `BarMode`, `MODE_ICONS`, `MODE_LABELS` y `MODE_PLACEHOLDERS`;
> - el modo ajustes y sus imports (`AgentSettings`, `InputSchemeSection`, `displayShortcut`);
> - el efecto de teclado (`Ctrl+K` / `Escape` en `window`) y el de `vina:focusChat`;
> - `submitNonce`, `panelOpen` y `handleInputFocus`.

`src/components/shell/UnifiedBarChat.tsx` pierde `input`, `setInput`, `submitNonce` y su efecto, porque ya envía la barra. Sus props quedan en `{ pendingDXF, clearAttachment }` y solo pinta: los mensajes, los pasos en curso con «Detener» y el chip del adjunto.

`src/styles/unified-bar.css`:
- `.unified-bar` pasa a `height: 48px`, `background: var(--surface-overlay-bg)`, `border: var(--surface-overlay-border)` y `box-shadow: var(--surface-overlay-shadow)`. Sin `backdrop-filter` y sin las variantes `-recessed`: no tiene reposo.
- Se borran las reglas de `:hover`/`:focus-within`, que subían del reposo, y todas las de `.unified-bar__modes` y `.unified-bar__mode-btn`.
- Nuevas:

```css
.unified-bar__icono { flex-shrink: 0; color: var(--text-tertiary); }
.unified-bar__esc { flex-shrink: 0; padding: 1px 6px; border: var(--hairline); border-radius: var(--radius-sm); color: var(--text-tertiary); font: var(--text-xs) / 1.4 var(--font-mono); }
```

`.unified-bar__send` conserva su forma con 32 × 32 y sus reglas de `:hover`/`:focus-visible`.

- [ ] **Step 4: Montarla abierta, el botón «IA» y los atajos**

En `src/components/shell/AppShell.tsx`:

```tsx
  const iaAbierta = useSelector((s: RootState) => s.ia.abierta);
```

```tsx
      {iaAbierta && <UnifiedBar onOpenPanel={togglePanel} />}
```

En `src/components/shell/TopBar.tsx`, en `top-bar__lado--derecho`, después del estado de desarrollo:

```tsx
        <BotonIA />
```

con, en el mismo archivo:

```tsx
/**
 * «IA» (spec 2026-10-02 § 4.2 y § 6.2): marcado con la barra abierta, y con
 * una señal mientras el agente trabaja con la barra oculta.
 */
function BotonIA() {
  const dispatch = useDispatch();
  const { abierta, trabajando } = useSelector((s: RootState) => s.ia);
  const trabajandoOculta = trabajando && !abierta;
  const nombre = trabajandoOculta ? 'La IA está trabajando' : 'Conversar con la IA';
  return (
    <button
      type="button"
      className={`boton-ia${abierta || trabajandoOculta ? ' boton-ia--activo' : ''}`}
      aria-pressed={abierta || trabajandoOculta}
      aria-label={nombre}
      title={abierta ? 'Ocultar la IA' : trabajandoOculta ? nombre : `${nombre} (${displayShortcut('⌘/')})`}
      onClick={() => dispatch(abierta ? ocultarIA() : abrirIA())}
    >
      IA
      {trabajandoOculta && <span className="boton-ia__actividad" aria-hidden="true" />}
    </button>
  );
}
```

`src/styles/layout.css`, junto a las reglas de la barra superior:

```css
/* «IA» (spec 2026-10-02 § 4.2): marcado = relleno y tinta plena, no solo tono. */
.boton-ia { position: relative; height: 26px; padding: 0 10px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
.boton-ia:hover { color: var(--text-primary); }
.boton-ia:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.boton-ia--activo { background: var(--bg-elevated); color: var(--text-primary); }
.boton-ia__actividad { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: boton-ia-latido 1.2s ease-in-out infinite; }
@keyframes boton-ia-latido { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .boton-ia__actividad { animation: none; } }
```

En `src/shortcuts/defaults.ts`:

```ts
  { id: 'copilot.focusChat', key: '/', ctrl: true, label: 'Conversar con la IA', category: 'View', context: 'global' },
```

Se borra la línea de `copilot.togglePanel`: con un solo modo ya no hay panel que mostrar u ocultar. Su nombre se busca con `grep -rn "copilot.togglePanel" src tests` y se quita de donde aparezca.

En `src/hooks/useKeyboardShortcuts.ts`, junto a los demás manejadores (y el import de `abrirIA`):

```ts
      ['copilot.focusChat', () => dispatch(abrirIA('conversacion'))],
      ['app.commandPalette', () => dispatch(abrirIA('comandos'))],
```

En `src/components/PatternEditor/EmptyState2D.tsx`, el `onClick` de la IA pasa a `onClick={() => dispatch(abrirIA())}`, con `import { abrirIA } from '../../store/iaSlice';`.

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/shell src/components/PatternEditor/__tests__/EmptyState2D.test.tsx src/shortcuts src/hooks tests/repo src/styles`
Expected: PASS. Si un test de estilos nombra `.unified-bar__mode-btn` o `.unified-bar--panel-open` en reposo, se ajusta a la cápsula nueva, dejándolo escrito en el registro como Ruling.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

Run (Vite de 5174 arriba, sin tocar archivos mientras corre): `npx playwright test tests/e2e/ia-convocada.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts tests/e2e/emplazamiento-modales.spec.ts tests/e2e/emplazamiento-paneles.spec.ts tests/e2e/marca-de-escala.spec.ts --workers=2 --retries=0`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/UnifiedBar.tsx src/components/shell/UnifiedBarChat.tsx src/styles/unified-bar.css src/components/shell/barPosition.ts src/components/shell/__tests__/unifiedBarPosition.test.ts src/components/shell/AppShell.tsx src/components/shell/TopBar.tsx src/styles/layout.css src/shortcuts/defaults.ts src/hooks/useKeyboardShortcuts.ts src/components/PatternEditor/EmptyState2D.tsx src/components/shell/__tests__/la-ia-convocada.test.tsx tests/e2e/ia-convocada.spec.ts tests/repo/lo-que-flota-es-papel.test.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts tests/e2e/emplazamiento-modales.spec.ts tests/e2e/contraste-del-cromo.spec.ts src/components/PatternEditor/__tests__/EmptyState2D.test.tsx
git commit -m "feat(ia): la barra se convoca: un modo, el botón «IA», Ctrl+/ y Ctrl+K, y Esc la oculta sin soltar nada"
```

---

### Task 5: La pantalla vacía y la marca de escala abajo

**Files:**
- Modify: `src/components/PatternEditor/EmptyState2D.tsx`, `src/components/PatternEditor/EmptyState2D.css`, `src/components/PatternEditor/renderers/MarcaDeEscala.tsx`, `src/components/PatternEditor/renderers/cuadricula.ts`, `src/components/PatternEditor/PatternEditor.tsx` (pasa `alto`)
- Tests: `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`, `src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx`, `src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts`, `tests/e2e/marca-de-escala.spec.ts`

**Interfaces:**
- Produces:
  - `ultimaLineaHasta(panPx: number, cuadroPx: number, hastaPx: number): number`;
  - `MarcaDeEscala` con la prop nueva `alto: number`.

- [ ] **Step 1: Escribir los tests que fallan**

En `cuadricula.test.ts`:

```ts
describe('ultimaLineaHasta', () => {
  it('la última línea de la cuadrícula que no pasa de un tope', () => {
    expect(ultimaLineaHasta(0, 20, 95)).toBe(80);
    expect(ultimaLineaHasta(7, 20, 95)).toBe(87);
    expect(ultimaLineaHasta(-13, 20, 95)).toBe(87);
    expect(ultimaLineaHasta(0, 20, 80)).toBe(80);
  });
});
```

En `MarcaDeEscala.test.tsx`, el caso «va arriba, en la franja que dejó la regla…» se sustituye por:

```tsx
  it('va abajo a la izquierda: la base en la última línea de la cuadrícula que deja 24 px al pie de la hoja', () => {
    const { container } = render(
      <svg><MarcaDeEscala zoom2D={1} pan2D={{ x: 0, y: 0 }} gridSize={10} units="mm" izquierda={12} alto={600} /></svg>,
    );
    const path = container.querySelector('.marca-de-escala path')!.getAttribute('d')!;
    const ys = [...path.matchAll(/[ML] [\d.-]+ ([\d.-]+)/g)].map((m) => Number(m[1]));
    const base = Math.max(...ys);
    // A zoom 1 con 10 mm de cuadrícula el cuadro mide 20 px: la línea es la 560.
    expect(base).toBe(560);
    expect(600 - base).toBeGreaterThanOrEqual(24);
  });
```

> Los demás casos de `MarcaDeEscala.test.tsx` montan la marca sin `alto`, así que todos ganan `alto={600}`. El cuadro de 20 px sale de la tabla del propio test: si la tabla dice otro valor a zoom 1, el `560` se recalcula con `ultimaLineaHasta(0, cuadro, 576)` y el comentario lo dice.

En `EmptyState2D.test.tsx`:

```tsx
  it('lo que dice la spec § 4.6: sin «Dibujar desde cero», y la IA se llama', () => {
    renderEmpty();
    expect(screen.queryByText(/Dibujar desde cero/)).toBeNull();
    expect(screen.getByText('o arrastra el archivo aquí')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'o descríbeselo a la IA' })).toBeTruthy();
  });
```

(`renderEmpty` es el arnés que ya usa ese archivo; si se llama distinto, se usa ese.)

En `tests/e2e/marca-de-escala.spec.ts`, dentro de `leer`, el dato nuevo:

```ts
    abajo: (() => {
      const svg = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
      const r = marca.querySelector('path')!.getBoundingClientRect();
      return { aIzquierda: r.left - svg.left, alPie: svg.bottom - r.bottom, altoHoja: svg.height };
    })(),
```

En el primer test, después de `expect(antes, …).not.toBeNull();`:

```ts
    // Abajo a la izquierda de la hoja (spec § 4.4): a menos de un cuadro y 24 px del pie.
    expect(antes!.abajo.alPie).toBeGreaterThanOrEqual(23);
    expect(antes!.abajo.alPie).toBeLessThanOrEqual(24 + antes!.cuadro + 1);
    expect(antes!.abajo.aIzquierda).toBeLessThan(80);
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/renderers src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`
Expected: FAIL. No existe `ultimaLineaHasta`, la marca sigue arriba y sigue «Dibujar desde cero».

- [ ] **Step 3: Implementar**

En `renderers/cuadricula.ts`, junto a `primeraLineaDesde`:

```ts
/** La última línea de la cuadrícula que no pasa de `hastaPx`: donde se apoya la marca de escala (spec § 4.4). */
export function ultimaLineaHasta(panPx: number, cuadroPx: number, hastaPx: number): number {
  return panPx + Math.floor((hastaPx - panPx) / cuadroPx) * cuadroPx;
}
```

En `MarcaDeEscala.tsx`:
- La prop nueva va en la interfaz: `/** Alto de la hoja en px: la marca va al pie. */ alto: number;`.
- `LINEA_BASE_PX` y su comentario se van. En su lugar:

```ts
/** Lo que la marca deja hasta el pie de la hoja, sobre la línea al pie (spec § 4.4). */
const AIRE_AL_PIE_PX = 24;
```

La `y` pasa a ser:

```ts
  const y = ultimaLineaHasta(pan2D.y, cuadro.px, alto - AIRE_AL_PIE_PX);
```

En `PatternEditor.tsx`, la marca recibe `alto={svgSize.height}`. Con `svgSize.height === 0` (sin medir) no se pinta: la condición queda `{!pantallaVacia && svgSize.height > 0 && ( … )}`.

En `EmptyState2D.tsx`:
- Se borra el botón «Dibujar desde cero» con su `activate2DTool`.
- Se borran los imports que solo usaba ese botón.
- `o suelta tu .dxf aquí` pasa a `o arrastra el archivo aquí`.
- El botón de la IA pierde la flecha (svg) y el `aria-label`. Su texto es «o descríbeselo a la IA», sin el `<span>` de la palabra.

En `EmptyState2D.css` se borran las reglas de `.empty-state-2d__secondary`, `.empty-state-2d__kbd` y `.empty-state-2d__ai-word`.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde. Si R2 (refs a tokens fantasma) o R3 (colores) bajan, se fija con `node scripts/ui-contract-lint.mjs --update`.

Run (Vite arriba): `npx playwright test tests/e2e/marca-de-escala.spec.ts tests/e2e/las-siete-puertas.spec.ts --workers=2 --retries=0`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/EmptyState2D.tsx src/components/PatternEditor/EmptyState2D.css src/components/PatternEditor/renderers/MarcaDeEscala.tsx src/components/PatternEditor/renderers/cuadricula.ts src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/__tests__/EmptyState2D.test.tsx src/components/PatternEditor/renderers/__tests__/MarcaDeEscala.test.tsx src/components/PatternEditor/renderers/__tests__/cuadricula.test.ts tests/e2e/marca-de-escala.spec.ts
git commit -m "feat(hoja): la pantalla vacía de la spec, y la marca de escala abajo, sobre una línea de la cuadrícula"
```

---

### Task 6: `--band-bar` fuera, trinquetes, contrato y gate

**Files:**
- Modify:
  - el token y sus consumidores: `src/styles/tokens.css`, `src/styles/floating.css`, `src/components/Viewport3D/SnapshotBar.css`;
  - trinquetes y gate: `tests/e2e/contraste-del-cromo.spec.ts`, `tests/e2e/*-baseline.json` (solo vía UPDATE), `scripts/deploy-prod.sh`, `tests/repo/el-gate-corre-los-trinquetes.test.ts`;
  - textos: `.claude/skills/contrato-de-interfaz/SKILL.md`, `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`.

- [ ] **Step 1: Quitar el token y ver caer el trinquete**

En `tokens.css` se borra `--band-bar: 94px;` con su comentario.

Run: `node scripts/ui-contract-lint.mjs`
Expected: FAIL. R2 sube en 2: `floating.css` y `SnapshotBar.css` nombran un token que ya no existe.

- [ ] **Step 2: Sus consumidores vuelven al suelo**

En `floating.css` (`.floating-3d--bottom-left`) y en `SnapshotBar.css` (`.snapshot-bar`), `bottom: var(--band-bar);` pasa a `bottom: var(--sp-3);`. El comentario de cada uno pasa a decir: «La barra de IA ya no está en reposo (spec 2026-10-02 § 6.2): nada reserva su franja, y esto vuelve al suelo».

Run: `node scripts/ui-contract-lint.mjs`
Expected: `✓ ningún contador subió`.

- [ ] **Step 3: Los estados nuevos del contraste**

En `tests/e2e/contraste-del-cromo.spec.ts`, un test nuevo junto al de «Más»:

```ts
test('la IA convocada y su panel', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 643 });
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('Control+/');
  await page.getByPlaceholder('Pide algo o pregunta').fill('hola');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');
  await page.waitForTimeout(200);
  await registrar('barra de IA con una conversación', page);
  await page.keyboard.press('Escape');
  await abrirPanel(page, 'IA y ratón', 'IA y ratón');
  await page.waitForTimeout(200);
  await registrar('panel IA y ratón', page);
});
```

Run (Vite arriba): `npx playwright test tests/e2e/contraste-del-cromo.spec.ts --workers=1 --retries=0`
Expected: FAIL solo por «… no está en tests/e2e/contraste-baseline.json». Los textos bajo AA de los estados nuevos se leen. Si alguno es mayor que 0, se arregla con tokens antes de seguir.

- [ ] **Step 4: Las líneas base**

Run (en serie):

```bash
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
```

Expected: el reposo en «2D con patrón» baja de 1 a 0, porque la barra ya no está; «vacía» y «Split» bajan en 1 cada una. El diff de los JSON solo trae bajadas y los estados nuevos. «convocar la IA» puede subir: queda por debajo de la meta de 4, y el `_doc` del archivo lo permite.

- [ ] **Step 5: Al gate**

En `scripts/deploy-prod.sh`, la lista e2e gana `tests/e2e/ia-convocada.spec.ts \` junto a `linea-al-pie`. En `tests/repo/el-gate-corre-los-trinquetes.test.ts`, la lista de lo que el gate tiene que nombrar gana `'ia-convocada.spec.ts'`.

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts`
Expected: PASS.

- [ ] **Step 6: El contrato y la spec**

En `.claude/skills/contrato-de-interfaz/SKILL.md`:
- **§ 2, «Hasta su fase siguen con el overlay oscuro…».** Se quita la barra de IA: es papel desde P2c y solo existe convocada.
- **§ 2, variantes declaradas.** Se quita «`--surface-overlay-bg-recessed` para el reposo de la barra de IA»: ya no la usa la barra. Siguen la cota y el avatar hasta P6 (spec § 7.5).
- **§ 3.** Una viñeta nueva: «**La IA no existe en reposo.** Se llama con «IA», `Ctrl+/`, `Ctrl+K` o desde la pantalla vacía, y aparece sobre la línea al pie. Lo mide `ia-convocada.spec.ts`».
- **§ 4.** Una viñeta nueva: «**Esc cierra lo que se llama antes que la selección**: menú, IA, panel, en ese orden y de uno en uno. Una superficie nueva que se cierra con Esc sube su peldaño con `usePeldanoDeEscape` (`src/shortcuts/escaleraDeLoLlamado.ts`) y no escucha Escape por su cuenta».

En la spec, § 6.2 gana una nota al final, sin tocar el texto de antes: «**Nota del plan de P2c (2026-10-04).** "Cerrar" y "ocultar" son lo mismo para la vista; lo que cambia es si queda conversación. Esc borra primero el texto del campo. "Detener" es cooperativo. La escalera de lo que se llama no incluye las herramientas del lienzo (`2026-09-06-escalera-de-escape-design.md`, aparte). Preferencias se llama "IA y ratón" en el menú y en el panel».

- [ ] **Step 7: El gate entero**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

El ensayo del deploy (`bash scripts/deploy-prod.sh --ensayo`, ~45 min) corre **después** de la revisión final y su pase de arreglos, sobre el árbol final, como en P2b.

- [ ] **Step 7b: Commit**

```bash
git add src/styles/tokens.css src/styles/floating.css src/components/Viewport3D/SnapshotBar.css tests/e2e/contraste-del-cromo.spec.ts tests/e2e/contraste-baseline.json tests/e2e/reposo-baseline.json tests/e2e/superficies-baseline.json scripts/deploy-prod.sh tests/repo/el-gate-corre-los-trinquetes.test.ts .claude/skills/contrato-de-interfaz/SKILL.md docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(ia): trinquetes de P2c, --band-bar fuera, y el contrato dice que la IA se llama"
```
