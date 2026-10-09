# El puente MCP — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el agente de la usuaria (Claude Code, Claude Desktop, Cursor) trabaje sobre el patrón abierto en Vina por MCP, con los 12 verbos de la superficie, entrando por un enchufe al lado de «IA».

**Architecture:** `vina-mcp` es un programa de Node en `mcp/` que el agente arranca por stdio. Habla MCP con el agente (JSON-RPC a mano) y espera a la pestaña en un WebSocket en `127.0.0.1:8462`. La pestaña se conecta con «Conectar», saluda con la lista de verbos y corre cada llamada por `ejecutarVerbo` con origen `mcp`, el mismo camino que usará el agente de Vina (D4).

**Tech Stack:** Node ≥ 18 con `ws` 8 (ya en el repo), React + Redux Toolkit, zod 4, vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-puente-mcp-design.md` (y su madre, `2026-10-05-ia-una-superficie-design.md`).

## Global Constraints

- Lo que lee el agente va en inglés (D8): instrucciones, descripciones, errores del puente. Lo que lee María va en español de Venezuela, con tuteo y en sentence case, sin «¡» ni «por favor».
- Ninguna dependencia nueva. El paquete usa solo `ws` (`^8.19.0`, ya en `package.json`). Sin paso de compilación: el paquete es `.mjs`.
- El puerto es `8462`. `VINA_MCP_PORT` lo cambia en el puente; `localStorage['vina-puente-puerto']` lo cambia en la pestaña, y solo lo escribe el e2e. Se lee con `safeGetItem`.
- Orígenes aceptados como pestaña: `https://vina.sdar.dev`, y `http://localhost` o `http://127.0.0.1` con cualquier puerto.
- Tiempos:

  | Qué | Tiempo |
  |---|---|
  | Una llamada espera la respuesta de la pestaña | 120 s |
  | Una llamada sin pestaña espera a que llegue | 4 s |
  | La pestaña reintenta la conexión | cada 3 s |
  | El puente reintenta el puerto ocupado | cada 3 s |

- El código de cierre de una pestaña reemplazada es `4001`.
- Contrato de interfaz:
  - Colores, radios y sombras salen de tokens, sin literales y sin `var(--x, respaldo)`.
  - Cada `:hover` lleva su `:focus-visible`.
  - La hoja es un portal a `<body>` con `data-material="papel"` y `data-superficie="menu"`, y su capa es `z-index: var(--z-menu)`.
  - Esc cierra la hoja por `usePeldanoDeEscape(…, 'menu', …)`.
  - Los `aria-label` van en español.
- Los textos de la interfaz son exactamente los de la tabla de la Tarea 6, que salieron de solace-wren el 09-10.
- Nunca `--no-verify`. Nunca editar a mano `scripts/ui-contract-baseline.json` ni las líneas base de `tests/e2e/`. `git add` siempre con rutas explícitas. `.maria-avatar.mjs` no se commitea.
- Commits en español, terminados en:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TDD5H3bAwh5uavCmtaPgsN
  ```
- Push, PR, merge, deploy y `npm publish` esperan la orden de Samuel. Antes de una suite entera o de un e2e, avisar a la sesión vina-ed si está corriendo algo.

## Review Focus

1. **El agente llama en los primeros 3 s de vida del puente**, cuando la pestaña todavía no reintentó. La llamada tiene que esperar a la pestaña (hasta 4 s) en vez de fallar. Lo cubre la Tarea 3, test «sin pestaña, la llamada espera a que llegue».
2. **El agente pide varias herramientas en paralelo**, como hace Claude Code. La pestaña las corre una tras otra: cada una con su paso de deshacer y su respuesta con el id correcto. Lo cubre la Tarea 5, test «dos llamadas seguidas».
3. **La pestaña se recarga o se cierra a mitad de una llamada.** El agente recibe el error al momento, no a los 120 s. Lo cubre la Tarea 3, test «la pestaña se va a mitad».
4. **El agente se cierra.** El puente se va con él y suelta el 8462, sin dejar un proceso huérfano que bloquee la próxima sesión. Lo cubre la Tarea 4, test «al cerrarse la entrada, sale y suelta el puerto».
5. **Dos pestañas de Vina con «Conectar».** Gana la última y la otra no reintenta, para que no se roben la conexión sin fin. Lo cubren la Tarea 3, test «gana la última pestaña», y la Tarea 5, test «4001 apaga sin reintentar».

---

### Task 1: Las instrucciones y la superficie horneada

**Files:**
- Create: `src/copilot/superficie/instrucciones.ts`
- Create: `src/copilot/superficie/__tests__/horneado.test.ts`
- Create (generado): `mcp/superficie.json`
- Modify: `.gitattributes` (al final)

**Interfaces:**
- Consumes: `definicionesDeLaSuperficie(): DefinicionDeVerbo[]` de `src/copilot/superficie/index.ts`.
- Produces: `INSTRUCCIONES: string` (de `src/copilot/superficie/instrucciones.ts`) y el archivo `mcp/superficie.json`, de forma `{ instrucciones: string; definiciones: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> }`.

- [ ] **Step 1: Escribir el test que falla**

`src/copilot/superficie/__tests__/horneado.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { definicionesDeLaSuperficie } from '../index';
import { INSTRUCCIONES } from '../instrucciones';

/**
 * `vina-mcp` lleva la superficie horneada para responder `tools/list` antes de
 * que llegue la pestaña (spec 2026-10-09, P7). Tiene que ser la de hoy:
 * `MCP_SUPERFICIE_UPDATE=1` la regenera, como las líneas base del repo.
 */
const RUTA = resolve(process.cwd(), 'mcp/superficie.json');
const hoy = () =>
  JSON.stringify({ instrucciones: INSTRUCCIONES, definiciones: definicionesDeLaSuperficie() }, null, 2) + '\n';

describe('la superficie horneada en vina-mcp', () => {
  it('es la de hoy (MCP_SUPERFICIE_UPDATE=1 la regenera)', () => {
    if (process.env.MCP_SUPERFICIE_UPDATE) writeFileSync(RUTA, hoy());
    expect(existsSync(RUTA), 'falta mcp/superficie.json').toBe(true);
    expect(readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n')).toBe(hoy());
  });

  it('cada verbo tiene un objeto en la raíz de su esquema, como pide MCP', () => {
    for (const d of definicionesDeLaSuperficie()) expect(d.input_schema.type, d.name).toBe('object');
  });

  it('las instrucciones dicen lo que el agente necesita, en inglés', () => {
    const t = INSTRUCCIONES.toLowerCase();
    for (const clave of ['millimetres', 'receipt', 'done: false', 'undo', 'revision', 'locked']) expect(t).toContain(clave);
    expect(INSTRUCCIONES).not.toMatch(/[áéíóúñ¿¡]/);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/copilot/superficie/__tests__/horneado.test.ts`
Expected: FAIL. El import de `../instrucciones` no se resuelve.

- [ ] **Step 3: Escribir las instrucciones**

`src/copilot/superficie/instrucciones.ts`:

```ts
/**
 * Lo que el agente lee antes de llamar a un verbo (spec 2026-10-09, P8): el MCP
 * lo da en `initialize.instructions`, y el agente de Vina lo recibirá igual
 * (spec 2026-10-05, D4). En inglés (D8). Solo dice lo que la superficie cumple.
 */
export const INSTRUCCIONES = [
  "Vina is a CAD for garment patterns, open in the user's browser. These tools read and change the pattern that is open right now.",
  'All lengths are in millimetres.',
  'Read before you act: read_pattern lists the pieces, their edges, seams and notches, with the ids the other tools take.',
  'Every answer carries the project revision. It goes up with every change: if it moved between two of your calls, someone else changed the pattern, so read it again.',
  'Every tool that changes the pattern returns a receipt. done is true only when the measured result confirms the change. done: false is an honest answer, not a crash: read its warnings; nothing was half-changed.',
  'Each change is one undo step for the user (Ctrl+Z). The undo tool reverts only steps made by an agent.',
  'A locked piece is never edited or removed: the tools that would do it answer done: false.',
  'The user works in Spanish: pieza = piece, costura = seam, piquete = notch, pinza = dart, patrón = pattern.',
].join('\n');
```

- [ ] **Step 4: Generar el horneado y fijar los finales de línea**

Al final de `.gitattributes`:

```
# vina-mcp se publica en npm desde esta carpeta: un CRLF en el shebang de
# bin/vina-mcp.mjs rompe `npx vina-mcp` en Mac y Linux. Force LF.
mcp/** text eol=lf
```

Run: `mkdir -p mcp && MCP_SUPERFICIE_UPDATE=1 npx vitest run src/copilot/superficie/__tests__/horneado.test.ts`
Expected: PASS, 3 tests. Existe `mcp/superficie.json`, con 12 definiciones.

- [ ] **Step 5: Correrlo sin regenerar**

Run: `npx vitest run src/copilot/superficie/__tests__/horneado.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/copilot/superficie/instrucciones.ts src/copilot/superficie/__tests__/horneado.test.ts mcp/superficie.json .gitattributes
git commit -m "feat(puente): las instrucciones del agente y la superficie horneada para vina-mcp"
```

---

### Task 2: El protocolo MCP, a mano

**Files:**
- Create: `mcp/src/protocolo.mjs`
- Test: `tests/mcp/protocolo.test.ts`

**Interfaces:**
- Consumes: la forma de `mcp/superficie.json` (Tarea 1). La de `Respuesta`: `{ ok: true, result, revision } | { ok: false, error, revision }`.
- Produces:
  ```js
  export const VERSIONES: string[]  // ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
  export function crearProtocolo({ version, superficie, llamar, presentarse, enviar }): {
    recibir(linea: string): Promise<void>,
    avisarListaCambiada(): void,
  }
  // superficie: () => { instrucciones, definiciones }
  // llamar: (verbo, args) => Promise<Respuesta>; puede rechazar con Error(mensaje para el agente)
  // presentarse: (clientInfo: { name?, version? }) => void
  // enviar: (mensajeJsonRpc: object) => void
  ```

- [ ] **Step 1: Escribir el test que falla**

`tests/mcp/protocolo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { crearProtocolo, VERSIONES } from '../../mcp/src/protocolo.mjs';

/** El MCP de vina-mcp (spec 2026-10-09, P2 y P11), sin red: un pedido entra por línea y sale por `enviar`. */
type Msg = Record<string, unknown> & { id?: unknown; result?: Record<string, unknown>; error?: { code: number } };

const SUPERFICIE = {
  instrucciones: 'All lengths are in millimetres.',
  definiciones: [{ name: 'read_pattern', description: 'Read it.', input_schema: { type: 'object', properties: {} } }],
};

function montar(llamar = vi.fn()) {
  const enviados: Msg[] = [];
  const presentarse = vi.fn();
  const p = crearProtocolo({ version: '0.1.0', superficie: () => SUPERFICIE, llamar, presentarse, enviar: (m: Msg) => enviados.push(m) });
  const pedir = async (id: number, method: string, params?: unknown) => {
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return enviados.find(m => m.id === id)!;
  };
  return { p, enviados, pedir, presentarse };
}

describe('initialize', () => {
  it('responde la versión que pide el cliente si la conoce, y presenta al agente', async () => {
    const { pedir, presentarse } = montar();
    const r = await pedir(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1' } });
    expect(r.result).toEqual({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'vina', version: '0.1.0' },
      instructions: SUPERFICIE.instrucciones,
    });
    expect(presentarse).toHaveBeenCalledWith({ name: 'claude-code', version: '2.1' });
  });

  it('con una versión que no conoce, responde la más nueva que conoce', async () => {
    const { pedir } = montar();
    const r = await pedir(1, 'initialize', { protocolVersion: '1999-01-01', capabilities: {} });
    expect(r.result!.protocolVersion).toBe(VERSIONES[0]);
  });
});

describe('tools', () => {
  it('tools/list da la superficie con inputSchema', async () => {
    const { pedir } = montar();
    const r = await pedir(2, 'tools/list');
    expect(r.result).toEqual({ tools: [{ name: 'read_pattern', description: 'Read it.', inputSchema: { type: 'object', properties: {} } }] });
  });

  it('tools/call: el resultado y la revisión viajan como texto JSON, sin isError', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, result: { done: false, warnings: ['piece is locked'] }, revision: 7 });
    const { pedir } = montar(llamar);
    const r = await pedir(3, 'tools/call', { name: 'sew', arguments: { a: 1 } });
    expect(llamar).toHaveBeenCalledWith('sew', { a: 1 });
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ result: { done: false, warnings: ['piece is locked'] }, revision: 7 }) }] });
  });

  it('tools/call: una llamada que no corrió (ok: false) vuelve con isError', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: false, error: 'invalid arguments: name: Required', revision: 7 });
    const { pedir } = montar(llamar);
    const r = await pedir(4, 'tools/call', { name: 'create_piece' });
    expect(llamar).toHaveBeenCalledWith('create_piece', {});
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ error: 'invalid arguments: name: Required', revision: 7 }) }], isError: true });
  });

  it('tools/call: si el puente no puede llamar, el agente lee el porqué con isError', async () => {
    const llamar = vi.fn().mockRejectedValue(new Error('Vina is not connected.'));
    const { pedir } = montar(llamar);
    const r = await pedir(5, 'tools/call', { name: 'read_pattern', arguments: {} });
    expect(r.result).toEqual({ content: [{ type: 'text', text: 'Vina is not connected.' }], isError: true });
  });

  it('un verbo sin resultado no deja el texto vacío', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, result: undefined, revision: 1 });
    const { pedir } = montar(llamar);
    const r = await pedir(6, 'tools/call', { name: 'x', arguments: {} });
    expect((r.result!.content as Array<{ text: string }>)[0].text).toBe(JSON.stringify({ result: null, revision: 1 }));
  });
});

describe('lo demás', () => {
  it('ping responde vacío', async () => {
    const { pedir } = montar();
    expect((await pedir(7, 'ping')).result).toEqual({});
  });

  it('un método que no existe da -32601; una notificación que no existe, nada', async () => {
    const { p, pedir, enviados } = montar();
    expect((await pedir(8, 'resources/list')).error!.code).toBe(-32601);
    const antes = enviados.length;
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 3 } }));
    expect(enviados.length).toBe(antes);
  });

  it('una línea que no es JSON da -32700 con id null; una línea en blanco o con \\r final no rompe nada', async () => {
    const { p, enviados } = montar();
    await p.recibir('{no es json');
    expect(enviados.at(-1)).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    await p.recibir('   \r');
    expect(enviados.length).toBe(1);
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }) + '\r');
    expect(enviados.at(-1)).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
  });

  it('avisa que la lista cambió solo después de notifications/initialized', async () => {
    const { p, enviados } = montar();
    p.avisarListaCambiada();
    expect(enviados).toEqual([]);
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    p.avisarListaCambiada();
    expect(enviados).toEqual([{ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }]);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/mcp/protocolo.test.ts`
Expected: FAIL. `mcp/src/protocolo.mjs` no existe.

- [ ] **Step 3: Escribir el protocolo**

`mcp/src/protocolo.mjs`:

```js
/**
 * El MCP de vina-mcp (spec 2026-10-09, P2): JSON-RPC 2.0, un mensaje por línea
 * en stdin/stdout. Lo que dice va para el agente, en inglés (D8).
 *
 * ponytail: el protocolo va a mano, con cinco métodos. Si crece (recursos,
 * prompts, progreso, cancelación), pasar al SDK oficial
 * (@modelcontextprotocol/sdk).
 */

/** Las versiones del protocolo que habla, de la más nueva a la más vieja. */
export const VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * @param {{
 *   version: string,
 *   superficie: () => { instrucciones: string, definiciones: Array<{ name: string, description: string, input_schema: object }> },
 *   llamar: (verbo: string, args: unknown) => Promise<{ ok: boolean, result?: unknown, error?: string, revision: number }>,
 *   presentarse?: (cliente: { name?: string, version?: string }) => void,
 *   enviar: (mensaje: object) => void,
 * }} op
 */
export function crearProtocolo({ version, superficie, llamar, presentarse = () => {}, enviar }) {
  let listo = false;
  const responder = (id, result) => enviar({ jsonrpc: '2.0', id, result });
  const fallar = (id, code, message) => enviar({ jsonrpc: '2.0', id, error: { code, message } });
  const texto = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

  async function atender({ id, method, params = {} }) {
    const esPedido = id !== undefined && id !== null;
    switch (method) {
      case 'initialize': {
        presentarse(params.clientInfo ?? {});
        const pedida = params.protocolVersion;
        return responder(id, {
          protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'vina', version },
          instructions: superficie().instrucciones,
        });
      }
      case 'notifications/initialized':
        listo = true;
        return;
      case 'ping':
        return responder(id, {});
      case 'tools/list':
        return responder(id, {
          tools: superficie().definiciones.map(d => ({ name: d.name, description: d.description, inputSchema: d.input_schema })),
        });
      case 'tools/call': {
        try {
          // § 5.3 de la spec madre: un `done: false` es una respuesta, no un
          // error. isError queda para lo que no corrió.
          const r = await llamar(params.name, params.arguments ?? {});
          return responder(id, r.ok
            ? texto(JSON.stringify({ result: r.result ?? null, revision: r.revision }), false)
            : texto(JSON.stringify({ error: r.error, revision: r.revision }), true));
        } catch (e) {
          return responder(id, texto(e instanceof Error ? e.message : String(e), true));
        }
      }
      default:
        if (esPedido) fallar(id, -32601, `Method not found: ${method}`);
    }
  }

  return {
    async recibir(linea) {
      const t = linea.trim();
      if (!t) return;
      let m;
      try { m = JSON.parse(t); } catch { return fallar(null, -32700, 'Parse error'); }
      await atender(m);
    },
    avisarListaCambiada() {
      if (listo) enviar({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    },
  };
}
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run tests/mcp/protocolo.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/protocolo.mjs tests/mcp/protocolo.test.ts
git commit -m "feat(puente): el MCP de vina-mcp, a mano: initialize, tools/list, tools/call y ping"
```

---

### Task 3: El puente WebSocket

**Files:**
- Create: `mcp/src/puente.mjs`
- Test: `tests/mcp/puente.test.ts`

**Interfaces:**
- Consumes: `ws` (`WebSocketServer`).
- Produces:
  ```js
  export const CIERRE_REEMPLAZADA = 4001;
  export function origenPermitido(origen: string | undefined): boolean
  export function crearPuente({ puerto, superficie?, registrar?, alCambiarSuperficie?, plazoMs?, esperaMs?, reintentoMs? }): {
    escuchar(): Promise<'escuchando' | 'ocupado'>,
    llamar(verbo: string, args: unknown): Promise<Respuesta>,   // rechaza con Error(mensaje en inglés)
    presentarAgente(cliente: { name?, version? }): void,
    estado(): 'escuchando' | 'ocupado' | 'conectado' | 'cerrado',
    puertoReal(): number | null,
    cerrar(): Promise<void>,
  }
  ```
  Mensajes con la pestaña (spec § 4.1): entran `hola` y `respuesta`; salen `agente` y `llamada`.

- [ ] **Step 1: Escribir el test que falla**

`tests/mcp/puente.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { crearPuente, origenPermitido, CIERRE_REEMPLAZADA } from '../../mcp/src/puente.mjs';

/** El puente de vina-mcp (spec 2026-10-09, P3-P9): un WebSocket en 127.0.0.1 al que se conecta la pestaña. */
type Puente = ReturnType<typeof crearPuente>;
type Recibido = { t: string; id?: number; verbo?: string; args?: unknown; nombre?: string; version?: string };

const abiertos: Puente[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach(s => s.terminate());
  await Promise.all(abiertos.splice(0).map(p => p.cerrar()));
});

async function puente(op: Record<string, unknown> = {}) {
  const p = crearPuente({ puerto: 0, ...op });
  abiertos.push(p);
  await p.escuchar();
  return p;
}

/** Una pestaña de mentira: saluda con su lista y contesta lo que le pidan. */
function pestana(p: Puente, origin = 'http://localhost:5174') {
  const ws = new WebSocket(`ws://127.0.0.1:${p.puertoReal()}`, { origin });
  sockets.push(ws);
  const recibidos: Recibido[] = [];
  const cierres: number[] = [];
  ws.on('message', d => recibidos.push(JSON.parse(String(d))));
  ws.on('close', code => cierres.push(code));
  const abierta = new Promise<void>((ok, mal) => { ws.once('open', () => ok()); ws.once('error', mal); });
  const decir = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, recibidos, cierres, abierta, decir };
}

const LISTA = { instrucciones: 'mm', definiciones: [{ name: 'read_pattern', description: 'd', input_schema: { type: 'object' } }] };

describe('origenPermitido', () => {
  it('Vina en producción y en esta máquina sí; lo demás no', () => {
    expect(origenPermitido('https://vina.sdar.dev')).toBe(true);
    expect(origenPermitido('http://localhost:5174')).toBe(true);
    expect(origenPermitido('http://127.0.0.1')).toBe(true);
    expect(origenPermitido('https://otra.web')).toBe(false);
    expect(origenPermitido('http://localhost.otra.web')).toBe(false);
    expect(origenPermitido('http://vina.sdar.dev')).toBe(false);
    expect(origenPermitido(undefined)).toBe(false);
  });

  it('una web ajena no entra como pestaña', async () => {
    const p = await puente();
    await expect(pestana(p, 'https://otra.web').abierta).rejects.toThrow(/403/);
    expect(p.estado()).toBe('escuchando');
  });
});

describe('una llamada', () => {
  it('va a la pestaña y vuelve con su respuesta', async () => {
    const p = await puente();
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    t.ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') t.decir({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: { verbo: m.verbo, args: m.args }, revision: 3 } });
    });
    await vi.waitFor(() => expect(p.estado()).toBe('conectado'));
    await expect(p.llamar('read_pattern', { a: 1 })).resolves.toEqual({ ok: true, result: { verbo: 'read_pattern', args: { a: 1 } }, revision: 3 });
  });

  it('sin pestaña, espera a que llegue (Review Focus 1)', async () => {
    const p = await puente({ esperaMs: 3000 });
    const llamada = p.llamar('read_pattern', {});
    const t = pestana(p);
    t.ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') t.decir({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: 'ok', revision: 1 } });
    });
    await expect(llamada).resolves.toEqual({ ok: true, result: 'ok', revision: 1 });
  });

  it('sin pestaña, pasado el plazo, dice qué hacer', async () => {
    const p = await puente({ esperaMs: 50 });
    await expect(p.llamar('read_pattern', {})).rejects.toThrow(/Vina is not connected.*«Conectar»/);
  });

  it('si la pestaña no contesta a tiempo, falla con el verbo', async () => {
    const p = await puente({ plazoMs: 50 });
    const t = pestana(p);
    await t.abierta;
    await expect(p.llamar('sew', {})).rejects.toThrow(/did not answer sew/);
  });

  it('la pestaña se va a mitad: falla al momento (Review Focus 3)', async () => {
    const p = await puente();
    const t = pestana(p);
    await t.abierta;
    const llamada = p.llamar('create_piece', {});
    await vi.waitFor(() => expect(t.recibidos.some(m => m.t === 'llamada')).toBe(true));
    t.ws.close();
    await expect(llamada).rejects.toThrow(/disconnected while running create_piece/);
  });
});

describe('la pestaña', () => {
  it('gana la última: la anterior se cierra con 4001 y su llamada pendiente falla (Review Focus 5)', async () => {
    const p = await puente();
    const vieja = pestana(p);
    await vieja.abierta;
    const llamada = p.llamar('sew', {});
    await vi.waitFor(() => expect(vieja.recibidos.some(m => m.t === 'llamada')).toBe(true));
    const nueva = pestana(p);
    await nueva.abierta;
    await expect(llamada).rejects.toThrow(/another Vina tab took over/);
    await vi.waitFor(() => expect(vieja.cierres).toEqual([CIERRE_REEMPLAZADA]));
    expect(p.estado()).toBe('conectado');
  });

  it('su lista distinta de la horneada avisa una vez; la misma, no', async () => {
    const alCambiar = vi.fn();
    const p = await puente({ superficie: LISTA, alCambiarSuperficie: alCambiar });
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    const otra = { instrucciones: 'mm', definiciones: [...LISTA.definiciones, { name: 'dart', description: 'd', input_schema: { type: 'object' } }] };
    t.decir({ t: 'hola', v: 1, ...otra });
    t.decir({ t: 'hola', v: 1, ...otra });
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1));
    expect(alCambiar).toHaveBeenCalledWith(otra);
  });

  it('se entera de quién es el agente, aunque se haya presentado antes de que ella llegara', async () => {
    const p = await puente();
    p.presentarAgente({ name: 'claude-code', version: '2.1' });
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    await vi.waitFor(() => expect(t.recibidos).toContainEqual({ t: 'agente', nombre: 'claude-code', version: '2.1' }));
  });
});

describe('un puerto, un puente', () => {
  it('el segundo puente espera, lo dice en cada llamada, y toma el puerto cuando se libera', async () => {
    const a = await puente();
    const b = crearPuente({ puerto: a.puertoReal()!, reintentoMs: 50, esperaMs: 50 });
    abiertos.push(b);
    expect(await b.escuchar()).toBe('ocupado');
    await expect(b.llamar('read_pattern', {})).rejects.toThrow(/Another agent session is connected to Vina/);
    await a.cerrar();
    await vi.waitFor(() => expect(b.estado()).toBe('escuchando'), { timeout: 3000 });
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/mcp/puente.test.ts`
Expected: FAIL. `mcp/src/puente.mjs` no existe.

- [ ] **Step 3: Escribir el puente**

`mcp/src/puente.mjs`:

```js
import { WebSocketServer } from 'ws';

/**
 * El puente de vina-mcp (spec 2026-10-09, § 4.1): un servidor WebSocket en
 * 127.0.0.1 al que se conecta la pestaña de Vina. Un navegador no puede
 * escuchar un socket, así que la pestaña llama y el puente espera (P3). Lo que
 * dice va para el agente, en inglés (D8).
 */

/** Con este código se cierra a una pestaña cuando llega otra (P4). */
export const CIERRE_REEMPLAZADA = 4001;

const VINA = 'https://vina.sdar.dev';
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Solo Vina puede ser la pestaña (P6): producción, o la app en esta máquina. */
export function origenPermitido(origen) {
  return origen === VINA || (typeof origen === 'string' && LOCAL.test(origen));
}

const NO_CONECTADA =
  'Vina is not connected. Ask the user to open Vina in the browser, click the plug icon next to «IA» and press «Conectar».';

export function crearPuente({
  puerto,
  superficie = null,
  registrar = () => {},
  alCambiarSuperficie = () => {},
  plazoMs = 120_000,
  esperaMs = 4_000,
  reintentoMs = 3_000,
}) {
  let servidor = null;
  let pestana = null;
  let ocupado = false;
  let cerrado = false;
  let reintento;
  let agente = null;
  let siguienteId = 1;
  let ultimaSuperficie = superficie ? JSON.stringify(superficie) : null;
  const pendientes = new Map();
  const aLaEspera = new Set();

  const enUso = () =>
    `Another agent session is connected to Vina (port ${puerto} is in use). Close that session or use it.`;

  function soltar(motivo) {
    for (const p of pendientes.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(`Vina disconnected while running ${p.verbo}${motivo}.`));
    }
    pendientes.clear();
  }

  function contarAgente(ws) {
    if (agente) ws.send(JSON.stringify({ t: 'agente', ...agente }));
  }

  function alConectar(ws) {
    if (pestana) {
      const vieja = pestana;
      pestana = null;
      soltar(': another Vina tab took over');
      vieja.close(CIERRE_REEMPLAZADA, 'another tab');
    }
    pestana = ws;
    registrar('Vina connected');
    for (const avisar of aLaEspera) avisar();
    aLaEspera.clear();
    ws.on('message', (datos) => {
      let m;
      try { m = JSON.parse(String(datos)); } catch { return; }
      if (m.t === 'hola') {
        // La pestaña desplegada es la verdad (P7): un paquete viejo no recorta verbos nuevos.
        const s = { instrucciones: m.instrucciones, definiciones: m.definiciones };
        const clave = JSON.stringify(s);
        if (clave !== ultimaSuperficie) {
          ultimaSuperficie = clave;
          alCambiarSuperficie(s);
        }
        contarAgente(ws);
      } else if (m.t === 'respuesta') {
        const p = pendientes.get(m.id);
        if (!p) return;
        pendientes.delete(m.id);
        clearTimeout(p.timer);
        p.resolve(m.respuesta);
      }
    });
    ws.on('close', () => {
      if (pestana !== ws) return;
      pestana = null;
      soltar('');
      registrar('Vina disconnected');
    });
  }

  function escuchar() {
    return new Promise((listo) => {
      const intentar = () => {
        if (cerrado) return;
        const s = new WebSocketServer({
          host: '127.0.0.1',
          port: puerto,
          verifyClient: ({ origin }) => origenPermitido(origin),
        });
        s.on('listening', () => {
          servidor = s;
          ocupado = false;
          registrar(`waiting for Vina on 127.0.0.1:${s.address().port}`);
          s.on('connection', alConectar);
          listo('escuchando');
        });
        s.on('error', (e) => {
          if (e.code !== 'EADDRINUSE') { registrar(e.message); return; }
          // P5: otra sesión del agente tiene el puerto. Este puente sigue vivo
          // y reintenta; si muriera, el agente vería un servidor caído sin
          // explicación.
          if (!ocupado) registrar(`port ${puerto} is in use, retrying every ${reintentoMs / 1000} s`);
          ocupado = true;
          listo('ocupado');
          s.close();
          reintento = setTimeout(intentar, reintentoMs);
        });
      };
      intentar();
    });
  }

  async function llamar(verbo, args) {
    if (cerrado) throw new Error('vina-mcp is shutting down.');
    if (!pestana) {
      if (ocupado) throw new Error(enUso());
      // La pestaña reintenta cada 3 s: una llamada que llega antes la espera.
      await new Promise((seguir) => {
        const avisar = () => { clearTimeout(t); seguir(); };
        const t = setTimeout(() => { aLaEspera.delete(avisar); seguir(); }, esperaMs);
        aLaEspera.add(avisar);
      });
      if (!pestana) throw new Error(ocupado ? enUso() : NO_CONECTADA);
    }
    const ws = pestana;
    const id = siguienteId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendientes.delete(id);
        reject(new Error(`Vina did not answer ${verbo} within ${Math.round(plazoMs / 1000)} s.`));
      }, plazoMs);
      pendientes.set(id, { resolve, reject, timer, verbo });
      ws.send(JSON.stringify({ t: 'llamada', id, verbo, args }));
    });
  }

  function presentarAgente(cliente = {}) {
    agente = { nombre: String(cliente.name ?? ''), version: String(cliente.version ?? '') };
    if (pestana) contarAgente(pestana);
  }

  async function cerrar() {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(reintento);
    soltar('');
    for (const avisar of aLaEspera) avisar();
    aLaEspera.clear();
    pestana?.close(1001, 'vina-mcp closed');
    pestana = null;
    if (servidor) await new Promise((r) => servidor.close(() => r()));
  }

  return {
    escuchar,
    llamar,
    presentarAgente,
    cerrar,
    estado: () => (cerrado ? 'cerrado' : ocupado ? 'ocupado' : pestana ? 'conectado' : 'escuchando'),
    puertoReal: () => servidor?.address()?.port ?? null,
  };
}
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run tests/mcp/puente.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/puente.mjs tests/mcp/puente.test.ts
git commit -m "feat(puente): el WebSocket de vina-mcp: solo Vina, una pestaña, plazos y el puerto ocupado"
```

---

### Task 4: El programa `vina-mcp`

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/bin/vina-mcp.mjs`
- Create: `mcp/README.md`
- Test: `tests/mcp/proceso.test.ts`

**Interfaces:**
- Consumes: `crearProtocolo` (Tarea 2), `crearPuente` (Tarea 3) y `mcp/superficie.json` (Tarea 1).
- Produces: el ejecutable `node mcp/bin/vina-mcp.mjs`, que se publicará como `npx -y vina-mcp`. Lee `VINA_MCP_PORT` (por defecto 8462), escribe solo JSON-RPC en stdout, registra en stderr (`[vina-mcp] waiting for Vina on 127.0.0.1:<puerto>`), y sale con 0 cuando se cierra su stdin.

- [ ] **Step 1: Escribir el test que falla**

`tests/mcp/proceso.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';
import WebSocket from 'ws';

/** vina-mcp de punta a punta (spec 2026-10-09, § 4.1): como lo arranca un agente, por stdio. */
type Msg = { id?: number; method?: string; result?: Record<string, unknown> };

const procesos: ChildProcessWithoutNullStreams[] = [];
const sockets: WebSocket[] = [];
afterEach(() => {
  sockets.splice(0).forEach(s => s.terminate());
  procesos.splice(0).forEach(p => p.kill());
});

const puertoLibre = () =>
  new Promise<number>(ok => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

function arrancar(puerto: number) {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(puerto) } });
  procesos.push(proc);
  let errores = '';
  proc.stderr.on('data', d => { errores += String(d); });
  const respuestas = new Map<number, (m: Msg) => void>();
  const avisos: Msg[] = [];
  createInterface({ input: proc.stdout }).on('line', l => {
    const m: Msg = JSON.parse(l);
    if (m.id !== undefined) respuestas.get(m.id)?.(m);
    else avisos.push(m);
  });
  let id = 0;
  return {
    proc,
    avisos,
    stderr: () => errores,
    pedir: (method: string, params: unknown = {}) =>
      new Promise<Msg>(ok => {
        const mio = ++id;
        respuestas.set(mio, ok);
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
      }),
    avisar: (method: string) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    escuchando: () =>
      new Promise<void>(ok => {
        const mirar = () => { if (errores.includes('waiting for Vina')) ok(); else setTimeout(mirar, 20); };
        mirar();
      }),
  };
}

async function iniciar(a: ReturnType<typeof arrancar>) {
  const r = await a.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
  a.avisar('notifications/initialized');
  return r;
}

describe('vina-mcp, como lo arranca un agente', () => {
  it('se presenta con las instrucciones y da la superficie horneada antes de que llegue la pestaña', async () => {
    const a = arrancar(await puertoLibre());
    const r = await iniciar(a);
    expect(String(r.result!.instructions)).toContain('millimetres');
    const lista = await a.pedir('tools/list');
    const nombres = (lista.result!.tools as Array<{ name: string }>).map(t => t.name);
    expect(nombres).toContain('read_pattern');
    expect(nombres).toContain('create_piece');
    expect(nombres.length).toBe(12);
  });

  it('una pestaña con otra lista la cambia y avisa; una llamada va y vuelve', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await iniciar(a);
    await a.escuchando();
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}`, { origin: 'http://localhost:5174' });
    sockets.push(ws);
    await new Promise(ok => ws.once('open', ok));
    ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') ws.send(JSON.stringify({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: { done: true }, revision: 4 } }));
    });
    ws.send(JSON.stringify({ t: 'hola', v: 1, instrucciones: 'x', definiciones: [{ name: 'solo_este', description: 'd', input_schema: { type: 'object' } }] }));
    await new Promise<void>(ok => { const mirar = () => (a.avisos.length ? ok() : setTimeout(mirar, 20)); mirar(); });
    expect(a.avisos[0].method).toBe('notifications/tools/list_changed');
    const lista = await a.pedir('tools/list');
    expect((lista.result!.tools as Array<{ name: string }>).map(t => t.name)).toEqual(['solo_este']);
    const r = await a.pedir('tools/call', { name: 'solo_este', arguments: {} });
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ result: { done: true }, revision: 4 }) }] });
  });

  it('un segundo vina-mcp en el mismo puerto sigue vivo y lo dice en cada llamada', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await a.escuchando();
    const b = arrancar(puerto);
    await iniciar(b);
    const r = await b.pedir('tools/call', { name: 'read_pattern', arguments: {} });
    expect(r.result!.isError).toBe(true);
    expect(JSON.stringify(r.result)).toContain('Another agent session is connected to Vina');
  });

  it('al cerrarse la entrada, sale con 0 y suelta el puerto (Review Focus 4)', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await a.escuchando();
    const salida = new Promise<number | null>(ok => a.proc.on('exit', code => ok(code)));
    a.proc.stdin.end();
    expect(await salida).toBe(0);
    const b = arrancar(puerto);
    await b.escuchando();
    expect(b.stderr()).not.toContain('in use');
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run tests/mcp/proceso.test.ts`
Expected: FAIL. `mcp/bin/vina-mcp.mjs` no existe: el proceso sale con «Cannot find module» y las llamadas no reciben respuesta (timeout).

- [ ] **Step 3: Escribir el paquete y el programa**

`mcp/package.json`:

```json
{
  "name": "vina-mcp",
  "version": "0.1.0",
  "description": "Let your AI agent (Claude Code, Claude Desktop, Cursor) work on the pattern open in Vina.",
  "type": "module",
  "bin": { "vina-mcp": "bin/vina-mcp.mjs" },
  "files": ["bin", "src", "superficie.json", "README.md"],
  "engines": { "node": ">=18" },
  "dependencies": { "ws": "^8.19.0" },
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/sssamuelll/vina", "directory": "mcp" },
  "homepage": "https://vina.sdar.dev"
}
```

`mcp/bin/vina-mcp.mjs`:

```js
#!/usr/bin/env node
// vina-mcp: el puente entre tu agente (MCP por stdio) y la pestaña de Vina
// (WebSocket en 127.0.0.1). Spec: docs/superpowers/specs/2026-10-09-puente-mcp-design.md
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { crearProtocolo } from '../src/protocolo.mjs';
import { crearPuente } from '../src/puente.mjs';

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const { version } = leer('../package.json');
let superficie = leer('../superficie.json');
const puerto = Number(process.env.VINA_MCP_PORT || 8462);
// stdout es del protocolo: lo demás va a stderr.
const registrar = (...m) => console.error('[vina-mcp]', ...m);

const protocolo = crearProtocolo({
  version,
  superficie: () => superficie,
  llamar: (verbo, args) => puente.llamar(verbo, args),
  presentarse: (cliente) => puente.presentarAgente(cliente),
  enviar: (m) => process.stdout.write(JSON.stringify(m) + '\n'),
});
const puente = crearPuente({
  puerto,
  superficie,
  registrar,
  alCambiarSuperficie: (s) => {
    superficie = s;
    protocolo.avisarListaCambiada();
  },
});

await puente.escuchar();
const lineas = createInterface({ input: process.stdin });
lineas.on('line', (l) => { void protocolo.recibir(l); });
// El agente se fue: el puente se va con él y suelta el puerto.
lineas.on('close', () => { void puente.cerrar().then(() => process.exit(0)); });
```

`mcp/README.md`:

````markdown
# vina-mcp

Let your AI agent work on the garment pattern you have open in [Vina](https://vina.sdar.dev):
read it, measure it, create pieces, sew, notch, remove and undo. Every change is one Ctrl+Z step
in Vina.

It works like Blender's MCP: your agent starts `vina-mcp` on your computer, and the Vina tab
connects to it when you press «Conectar».

## Set up your agent once

**Claude Code**

```sh
claude mcp add vina -- npx -y vina-mcp
```

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor** (`~/.cursor/mcp.json`), inside
`mcpServers`:

```json
"vina": { "command": "npx", "args": ["-y", "vina-mcp"] }
```

Restart the agent after adding it.

## Connect Vina

1. Open Vina in Chrome, Edge or Brave.
2. Click the plug icon next to «IA» and press «Conectar».
3. The first time, the browser asks whether Vina may access other apps and services on this
   device. Choose «Permitir» (Allow).

## How it works

- `vina-mcp` speaks MCP over stdio with your agent and waits for the Vina tab on
  `ws://127.0.0.1:8462` (set `VINA_MCP_PORT` to change it).
- It only listens on your computer, and only accepts Vina as the tab. One tab at a time: the
  last one to connect wins.
- The tab runs the same tools Vina's own agent uses. Nothing else: no files, no network, no
  code from the agent.
- Requires Node 18 or newer.

License: MIT.
````

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run tests/mcp/proceso.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: La suite del paquete entera**

Run: `npx vitest run tests/mcp src/copilot/superficie/__tests__/horneado.test.ts`
Expected: PASS, 29 tests: 11 + 11 + 4 + 3.

- [ ] **Step 6: Commit**

```bash
git add mcp/package.json mcp/bin/vina-mcp.mjs mcp/README.md tests/mcp/proceso.test.ts
git commit -m "feat(puente): vina-mcp, el programa que arranca el agente"
```

---

### Task 5: La pestaña: el estado y la conexión

**Files:**
- Create: `src/store/puenteSlice.ts`
- Modify: `src/store/index.ts:15` (import) y `:55` (reducer `puente`)
- Modify: `src/utils/telemetry/journal.ts:26` (tipo `'puente'`)
- Create: `src/copilot/puente/conexion.ts`
- Create: `src/copilot/puente/puenteDeLaApp.ts`
- Test: `src/copilot/puente/__tests__/conexion.test.ts`

**Interfaces:**
- Consumes: `ejecutarVerbo` (`src/copilot/superficie/ejecutar.ts`), `SUPERFICIE` y `definicionesDeLaSuperficie` (`src/copilot/superficie/index.ts`), `INSTRUCCIONES` (Tarea 1), `pushJournal` y `tienda()` (`src/copilot/superficie/__tests__/fixtures.ts`). El protocolo con el puente es el de la Tarea 3.
- Produces:
  ```ts
  // src/store/puenteSlice.ts
  export type EstadoDelPuente = 'apagado' | 'buscando' | 'conectado' | 'bloqueado' | 'reemplazado';
  export interface PuenteState { estado: EstadoDelPuente; agente: string | null }
  export const cambiarPuente: ActionCreatorWithPayload<{ estado: EstadoDelPuente; agente?: string | null }>;
  export default reducer;   // montado como `puente` en la tienda

  // src/copilot/puente/conexion.ts
  export const PUERTO_DEL_PUENTE = 8462;
  export const CIERRE_REEMPLAZADA = 4001;
  export type PermisoDelNavegador = 'prompt' | 'granted' | 'denied' | 'desconocido';
  export function permisoDelNavegador(): Promise<PermisoDelNavegador>;
  export function nombreDelAgente(nombre: unknown): string | null;
  export function crearConexion(dep: DependenciasDelPuente): { conectar(): void; desconectar(): void };

  // src/copilot/puente/puenteDeLaApp.ts
  export function conectarTuAgente(): void;
  export function desconectarTuAgente(): void;
  ```

- [ ] **Step 1: Escribir el test que falla**

`src/copilot/puente/__tests__/conexion.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { crearConexion, nombreDelAgente, CIERRE_REEMPLAZADA, type PermisoDelNavegador } from '../conexion';
import { cambiarPuente, type EstadoDelPuente } from '../../../store/puenteSlice';
import { tienda } from '../../superficie/__tests__/fixtures';
import { INSTRUCCIONES } from '../../superficie/instrucciones';
import { SUPERFICIE } from '../../superficie';
import { getJournal, clearJournal } from '../../../utils/telemetry/journal';
import { undo } from '../../../store/editorSlice';

/** La pestaña ante el puente (spec 2026-10-09, § 4.2), con un WebSocket de mentira y la tienda de verdad. */
class SocketFalso {
  static OPEN = 1;
  static todos: SocketFalso[] = [];
  readyState = 0;
  enviados: Array<Record<string, unknown>> = [];
  cerradoCon: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) { SocketFalso.todos.push(this); }
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close(code = 1000) { this.cerradoCon = code; this.readyState = 3; this.onclose?.({ code }); }
  abrir() { this.readyState = 1; this.onopen?.(); }
  recibir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  caer(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

function montar(permiso: PermisoDelNavegador = 'granted') {
  const { store, ctx } = tienda();
  const estados: Array<{ estado: EstadoDelPuente; agente: string | null }> = [];
  const dispatch = ((a: { type: string; payload?: { estado: EstadoDelPuente; agente?: string | null } }) => {
    if (a.type === cambiarPuente.type) estados.push({ estado: a.payload!.estado, agente: a.payload!.agente ?? null });
    return ctx.dispatch(a as never);
  }) as typeof ctx.dispatch;
  const conexion = crearConexion({
    WebSocketImpl: SocketFalso as unknown as typeof WebSocket,
    getState: ctx.getState,
    dispatch,
    puerto: () => 18462,
    permiso: async () => permiso,
    reintentoMs: 3000,
  });
  const ultimo = () => estados.at(-1);
  const socket = () => SocketFalso.todos.at(-1)!;
  return { store, conexion, estados, ultimo, socket };
}

const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { SocketFalso.todos = []; clearJournal(); });
afterEach(() => { vi.useRealTimers(); });

describe('conectar', () => {
  it('busca el puente, saluda con la superficie y queda conectado', async () => {
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    expect(ultimo()).toEqual({ estado: 'buscando', agente: null });
    await tick();
    expect(socket().url).toBe('ws://127.0.0.1:18462');
    socket().abrir();
    const hola = socket().enviados[0];
    expect(hola).toMatchObject({ t: 'hola', v: 1, instrucciones: INSTRUCCIONES });
    expect((hola.definiciones as Array<{ name: string }>).map(d => d.name)).toEqual(SUPERFICIE.map(v => v.name));
    expect(ultimo()).toEqual({ estado: 'conectado', agente: null });
  });

  it('se entera del nombre del agente', async () => {
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'agente', nombre: 'claude-code', version: '2.1' });
    expect(ultimo()).toEqual({ estado: 'conectado', agente: 'Claude Code' });
  });

  it('con el permiso negado no abre nada: queda bloqueado', async () => {
    const { conexion, ultimo } = montar('denied');
    conexion.conectar();
    await tick();
    expect(SocketFalso.todos).toEqual([]);
    expect(ultimo()).toEqual({ estado: 'bloqueado', agente: null });
  });

  it('cada cambio de estado deja una entrada en la caja negra, sin repetir', async () => {
    const { conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'agente', nombre: 'claude-code' });
    socket().recibir({ t: 'agente', nombre: 'claude-code' });
    const puente = getJournal().events.filter(e => e.kind === 'puente');
    expect(puente.map(e => [e.name, e.data?.agente])).toEqual([['buscando', undefined], ['conectado', undefined], ['conectado', 'Claude Code']]);
  });
});

describe('las llamadas', () => {
  it('una llamada corre el verbo con origen mcp, cambia el patrón y responde con su id', async () => {
    const { store, conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 7, verbo: 'create_piece', args: { name: 'Del agente', rectangle: { width: 100, height: 50 } } });
    await vi.waitFor(() => expect(socket().enviados.some(m => m.t === 'respuesta')).toBe(true));
    const r = socket().enviados.find(m => m.t === 'respuesta')!;
    expect(r.id).toBe(7);
    expect(r.respuesta).toMatchObject({ ok: true, result: { done: true } });
    expect(store.getState().project.pieces.map(p => p.name)).toEqual(['Del agente']);
    const entrada = getJournal().events.find(e => e.kind === 'agente' && e.name === 'create_piece');
    expect(entrada?.data?.origen).toBe('mcp');
  });

  it('dos llamadas seguidas corren una tras otra, cada una con su paso de deshacer (Review Focus 2)', async () => {
    const { store, conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 1, verbo: 'create_piece', args: { rectangle: { width: 100, height: 50 } } });
    socket().recibir({ t: 'llamada', id: 2, verbo: 'create_piece', args: { rectangle: { width: 80, height: 40 } } });
    await vi.waitFor(() => expect(socket().enviados.filter(m => m.t === 'respuesta').length).toBe(2));
    expect(socket().enviados.filter(m => m.t === 'respuesta').map(m => m.id)).toEqual([1, 2]);
    expect(store.getState().project.pieces.length).toBe(2);
    store.dispatch(undo());
    expect(store.getState().project.pieces.length).toBe(1);
  });

  it('un verbo que no existe responde ok: false, sin romper la conexión', async () => {
    const { conexion, socket, ultimo } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 3, verbo: 'no_existe', args: {} });
    await vi.waitFor(() => expect(socket().enviados.some(m => m.t === 'respuesta')).toBe(true));
    expect(socket().enviados.find(m => m.t === 'respuesta')!.respuesta).toMatchObject({ ok: false, error: 'unknown verb: no_existe' });
    expect(ultimo()!.estado).toBe('conectado');
  });
});

describe('cuando se corta', () => {
  it('si el puente se va, vuelve a buscar y reintenta a los 3 s', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    socket().caer();
    expect(ultimo()).toEqual({ estado: 'buscando', agente: null });
    expect(SocketFalso.todos.length).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(SocketFalso.todos.length).toBe(2);
  });

  it('4001: otra pestaña tomó la conexión; apaga sin reintentar (Review Focus 5)', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    socket().caer(CIERRE_REEMPLAZADA);
    expect(ultimo()).toEqual({ estado: 'reemplazado', agente: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(SocketFalso.todos.length).toBe(1);
  });

  it('desconectar cierra con 1000, apaga y no reintenta', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    conexion.desconectar();
    expect(socket().cerradoCon).toBe(1000);
    expect(ultimo()).toEqual({ estado: 'apagado', agente: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(SocketFalso.todos.length).toBe(1);
  });
});

describe('nombreDelAgente', () => {
  it('pone nombre a los que conoce y deja los demás tal cual', () => {
    expect(nombreDelAgente('claude-code')).toBe('Claude Code');
    expect(nombreDelAgente('mi-agente')).toBe('mi-agente');
    expect(nombreDelAgente('')).toBeNull();
    expect(nombreDelAgente(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/copilot/puente/__tests__/conexion.test.ts`
Expected: FAIL. `../conexion` y `puenteSlice` no existen.

- [ ] **Step 3: El estado y la caja negra**

`src/store/puenteSlice.ts`:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * El puente con el agente de la usuaria (spec 2026-10-09, § 4.2): lo que lee
 * la puerta «Tu agente». No se guarda (P10): conectarse es un permiso por
 * sesión.
 */
export type EstadoDelPuente = 'apagado' | 'buscando' | 'conectado' | 'bloqueado' | 'reemplazado';

export interface PuenteState {
  estado: EstadoDelPuente;
  /** Quién está del otro lado, si se presentó: «Claude Code». */
  agente: string | null;
}

const initialState: PuenteState = { estado: 'apagado', agente: null };

const puenteSlice = createSlice({
  name: 'puente',
  initialState,
  reducers: {
    cambiarPuente(state, action: PayloadAction<{ estado: EstadoDelPuente; agente?: string | null }>) {
      state.estado = action.payload.estado;
      state.agente = action.payload.agente ?? null;
    },
  },
});

export const { cambiarPuente } = puenteSlice.actions;
export default puenteSlice.reducer;
```

En `src/store/index.ts`, después de `import iaReducer from './iaSlice';`:

```ts
import puenteReducer from './puenteSlice';
```

y en el `reducer`, después de `ia: iaReducer,`:

```ts
    puente: puenteReducer,
```

En `src/utils/telemetry/journal.ts`, el tipo queda:

```ts
  | 'solver'
  | 'agente'
  | 'puente';
```

- [ ] **Step 4: La conexión**

`src/copilot/puente/conexion.ts`:

```ts
import type { AppDispatch, RootState } from '../../store';
import { cambiarPuente, type EstadoDelPuente } from '../../store/puenteSlice';
import { pushJournal } from '../../utils/telemetry/journal';
import { ejecutarVerbo } from '../superficie/ejecutar';
import { SUPERFICIE, definicionesDeLaSuperficie } from '../superficie';
import { INSTRUCCIONES } from '../superficie/instrucciones';
import type { Verbo } from '../superficie/tipos';

/**
 * La pestaña ante vina-mcp (spec 2026-10-09, § 4.2). El navegador no puede
 * escuchar, así que la pestaña llama al puente y, mientras «Conectar» esté
 * encendido, reintenta. Cada llamada del agente pasa por `ejecutarVerbo` con
 * origen `mcp`: el mismo camino que usará el agente de Vina (D4).
 */
export const PUERTO_DEL_PUENTE = 8462;
/** Con este código cierra el puente a una pestaña cuando llega otra (P4). */
export const CIERRE_REEMPLAZADA = 4001;

export type PermisoDelNavegador = 'prompt' | 'granted' | 'denied' | 'desconocido';

/** El permiso de «acceso a la red local». Chrome 155 lo llama así (medido el 09-10); otros navegadores no lo conocen. */
export async function permisoDelNavegador(): Promise<PermisoDelNavegador> {
  try {
    const { state } = await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
    return state;
  } catch {
    return 'desconocido';
  }
}

const NOMBRES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude Desktop',
  cursor: 'Cursor',
  'cursor-vscode': 'Cursor',
};

/** El `clientInfo.name` del agente, como lo leería María. Los que no conocemos salen tal cual. */
export function nombreDelAgente(nombre: unknown): string | null {
  if (typeof nombre !== 'string' || !nombre.trim()) return null;
  return NOMBRES[nombre] ?? nombre;
}

export interface DependenciasDelPuente {
  WebSocketImpl: typeof WebSocket;
  getState: () => RootState;
  dispatch: AppDispatch;
  puerto: () => number;
  permiso: () => Promise<PermisoDelNavegador>;
  reintentoMs: number;
  verbos?: readonly Verbo[];
}

type MensajeDelPuente =
  | { t: 'agente'; nombre?: unknown }
  | { t: 'llamada'; id: number; verbo: string; args: unknown };

export function crearConexion(dep: DependenciasDelPuente) {
  const verbos = dep.verbos ?? SUPERFICIE;
  let encendido = false;
  let ws: WebSocket | null = null;
  let reintento: ReturnType<typeof setTimeout> | undefined;
  let cola: Promise<void> = Promise.resolve();
  let ultimo = '';

  function poner(estado: EstadoDelPuente, agente: string | null = null) {
    const clave = `${estado}|${agente ?? ''}`;
    if (clave === ultimo) return;
    ultimo = clave;
    dep.dispatch(cambiarPuente({ estado, agente }));
    pushJournal('puente', estado, agente ? { agente } : undefined);
  }

  async function abrir() {
    if (!encendido || ws) return;
    if ((await dep.permiso()) === 'denied') {
      encendido = false;
      poner('bloqueado');
      return;
    }
    if (!encendido || ws) return;
    const s = new dep.WebSocketImpl(`ws://127.0.0.1:${dep.puerto()}`);
    ws = s;
    s.onopen = () => {
      s.send(JSON.stringify({ t: 'hola', v: 1, instrucciones: INSTRUCCIONES, definiciones: definicionesDeLaSuperficie(verbos) }));
      poner('conectado');
    };
    s.onmessage = (e) => {
      let m: MensajeDelPuente;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'agente') poner('conectado', nombreDelAgente(m.nombre));
      if (m.t === 'llamada') {
        const { id, verbo, args } = m;
        // Una a la vez: un agente que pide en paralelo no mezcla dos lotes de deshacer.
        cola = cola.then(async () => {
          const respuesta = await ejecutarVerbo(verbos, verbo, args, { getState: dep.getState, dispatch: dep.dispatch, origen: 'mcp' });
          if (s.readyState === dep.WebSocketImpl.OPEN) s.send(JSON.stringify({ t: 'respuesta', id, respuesta }));
        });
      }
    };
    s.onclose = (e) => {
      if (ws !== s) return;
      ws = null;
      if (e.code === CIERRE_REEMPLAZADA) {
        encendido = false;
        poner('reemplazado');
        return;
      }
      if (!encendido) return;
      poner('buscando');
      reintento = setTimeout(() => void abrir(), dep.reintentoMs);
    };
  }

  return {
    conectar() {
      if (encendido) return;
      encendido = true;
      poner('buscando');
      void abrir();
    },
    desconectar() {
      encendido = false;
      clearTimeout(reintento);
      const s = ws;
      ws = null;
      s?.close(1000);
      poner('apagado');
    },
  };
}
```

`src/copilot/puente/puenteDeLaApp.ts`:

```ts
import { store } from '../../store';
import { safeGetItem } from '../../utils/safeStorage';
import { crearConexion, permisoDelNavegador, PUERTO_DEL_PUENTE } from './conexion';

/**
 * La conexión de esta pestaña con vina-mcp, sobre la tienda de verdad. El
 * puerto solo cambia en las pruebas: el e2e escribe `vina-puente-puerto` antes
 * de cargar la app, para no chocar con un puente de verdad en el 8462.
 */
let conexion: ReturnType<typeof crearConexion> | null = null;

function laConexion() {
  conexion ??= crearConexion({
    WebSocketImpl: WebSocket,
    getState: store.getState,
    dispatch: store.dispatch,
    puerto: () => Number(safeGetItem('vina-puente-puerto')) || PUERTO_DEL_PUENTE,
    permiso: permisoDelNavegador,
    reintentoMs: 3000,
  });
  return conexion;
}

export const conectarTuAgente = () => laConexion().conectar();
export const desconectarTuAgente = () => laConexion().desconectar();
```

- [ ] **Step 5: Correrlo y verlo pasar**

Run: `npx vitest run src/copilot/puente/__tests__/conexion.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Tipos y suite entera**

Run: `npx tsc -b --noEmit`
Expected: sin salida (exit 0).

Run: `npm run test > .superpowers/suite-t5.log 2>&1; tail -5 .superpowers/suite-t5.log`
Expected: todos los archivos en verde.

- [ ] **Step 7: Commit**

```bash
git add src/store/puenteSlice.ts src/store/index.ts src/utils/telemetry/journal.ts src/copilot/puente/conexion.ts src/copilot/puente/puenteDeLaApp.ts src/copilot/puente/__tests__/conexion.test.ts
git commit -m "feat(puente): la pestaña se conecta a vina-mcp y corre cada llamada por la superficie"
```

---

### Task 6: La puerta: el enchufe y la hoja «Tu agente»

**Antes de escribir:** invocar la skill `contrato-de-interfaz`.

**Files:**
- Create: `src/components/shell/PuertaDelAgente.tsx`
- Modify: `src/components/shell/TopBar.tsx:96` (después de `<BotonIA />`)
- Modify: `src/styles/layout.css` (después del bloque `.boton-ia`, línea 182)
- Modify: `src/components/shell/unifiedBarCommandDefs.ts:11-16` (icono `Plug`) y `:44-48` (dos comandos)
- Modify: `tests/repo/superficies-declaradas.test.ts:54` (la marca nueva, después de `DockToolPicker.tsx`)
- Test: `src/components/shell/__tests__/puerta-del-agente.test.tsx`

**Interfaces:**
- Consumes: `conectarTuAgente` y `desconectarTuAgente` (`src/copilot/puente/puenteDeLaApp.ts`), `permisoDelNavegador` y `PermisoDelNavegador` (`src/copilot/puente/conexion.ts`), y `state.puente` con `cambiarPuente` (Tarea 5).
- Produces: `export default function PuertaDelAgente()`, más `export const COMANDO_CLAUDE_CODE` y `export const CONFIG_JSON`.

**Los textos** (solace-wren, 09-10):

| Dónde | Texto |
|---|---|
| Enchufe, nombre y `title` | `Tu agente`. Conectado: `<agente> está conectado`; sin nombre, `Tu agente está conectado` |
| Título de la hoja | `Tu agente` |
| Apagado | `Claude Code, Claude Desktop o Cursor pueden leer y cambiar este patrón. Lo que cambien se deshace con Ctrl+Z, como lo tuyo.` + botón `Conectar` |
| Nota del permiso (solo con permiso `prompt`) | `La primera vez, tu navegador te pregunta si Vina puede acceder a otras aplicaciones de este dispositivo. Haz clic en «Permitir».` |
| Configuración | `Configura tu agente una sola vez` · filas `Claude Code` y `Claude Desktop o Cursor` · botón `Copiar` / `Copiado` · nota `Va dentro de «mcpServers», en la configuración de tu agente.` |
| `aria-label` de copiar | `Copiar el comando de Claude Code` · `Copiar la configuración de Claude Desktop o Cursor` |
| Buscando | estado `Esperando a tu agente` + `Abre tu agente y Vina se conecta en cuanto arranque. Si lo acabas de configurar, ciérralo y ábrelo otra vez.` + botón `Desconectar` |
| Conectado | estado `Conectado a <agente>` (sin nombre: `Conectado a tu agente`) + `Puede leer y cambiar este patrón. Lo que cambie se deshace con Ctrl+Z, como lo tuyo.` + botón `Desconectar` |
| Bloqueado | estado `Tu navegador bloqueó la conexión` + `Haz clic en el icono a la izquierda de la dirección y permite el acceso a otras aplicaciones de este dispositivo. Después, intenta de nuevo.` + botón `Intentar de nuevo` |
| Reemplazado | estado `Otra pestaña de Vina tomó la conexión` + `Tu agente trabaja ahora en esa pestaña.` + botón `Conectar aquí` |
| Paleta | `Conectar tu agente` · `Deja que Claude Code, Claude Desktop o Cursor trabajen en este patrón` |
| Paleta | `Desconectar tu agente` · `Tu agente deja de ver y cambiar este patrón` |

- [ ] **Step 1: Escribir el test que falla**

`src/components/shell/__tests__/puerta-del-agente.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { cambiarPuente } from '../../../store/puenteSlice';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import TopBar from '../TopBar';
import { COMANDO_CLAUDE_CODE } from '../PuertaDelAgente';
import { conectarTuAgente, desconectarTuAgente } from '../../../copilot/puente/puenteDeLaApp';
import { COMMANDS } from '../unifiedBarCommandDefs';

vi.mock('../../../copilot/puente/puenteDeLaApp', () => ({ conectarTuAgente: vi.fn(), desconectarTuAgente: vi.fn() }));

/** La puerta «Tu agente» (spec 2026-10-09, P1 y § 4.3): el enchufe al lado de «IA» y su hoja de papel. */
function Atajos() {
  useKeyboardShortcuts();
  return null;
}

function montar() {
  return render(
    <Provider store={store}>
      <ShortcutProvider>
        <Atajos />
        <TopBar onOpenPanel={() => {}} onImportDXF={() => {}} />
      </ShortcutProvider>
    </Provider>,
  );
}

const poner = (estado: Parameters<typeof cambiarPuente>[0]) => act(() => { store.dispatch(cambiarPuente(estado)); });
const hoja = () => document.querySelector<HTMLElement>('.hoja-del-agente');

beforeEach(() => {
  poner({ estado: 'apagado' });
  vi.mocked(conectarTuAgente).mockClear();
  vi.mocked(desconectarTuAgente).mockClear();
});
afterEach(cleanup);

describe('el enchufe', () => {
  it('en reposo se llama «Tu agente» y no lleva punto; conectado dice con quién y lleva el punto', () => {
    montar();
    const enchufe = screen.getByRole('button', { name: 'Tu agente' });
    expect(enchufe.querySelector('.puerta-del-agente__punto')).toBeNull();
    poner({ estado: 'conectado', agente: 'Claude Code' });
    const conectado = screen.getByRole('button', { name: 'Claude Code está conectado' });
    expect(conectado.querySelector('.puerta-del-agente__punto')).not.toBeNull();
    poner({ estado: 'conectado', agente: null });
    expect(screen.getByRole('button', { name: 'Tu agente está conectado' })).toBeTruthy();
  });
});

describe('la hoja', () => {
  it('abre en papel, como menú, con el foco en «Conectar»; Conectar conecta', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const h = hoja()!;
    expect(h.getAttribute('data-material')).toBe('papel');
    expect(h.getAttribute('data-superficie')).toBe('menu');
    expect(h.parentElement).toBe(document.body);
    expect(h.textContent).toContain('Claude Code, Claude Desktop o Cursor pueden leer y cambiar este patrón.');
    const conectar = within(h).getByRole('button', { name: 'Conectar' });
    await vi.waitFor(() => expect(document.activeElement).toBe(conectar));
    fireEvent.click(conectar);
    expect(conectarTuAgente).toHaveBeenCalledTimes(1);
  });

  it('esperando: lo dice, deja la configuración y Desconectar desconecta', () => {
    poner({ estado: 'buscando' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const h = hoja()!;
    expect(h.textContent).toContain('Esperando a tu agente');
    expect(h.textContent).toContain('Configura tu agente una sola vez');
    fireEvent.click(within(h).getByRole('button', { name: 'Desconectar' }));
    expect(desconectarTuAgente).toHaveBeenCalledTimes(1);
  });

  it('conectado: con quién, y sin la configuración', () => {
    poner({ estado: 'conectado', agente: 'Claude Code' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code está conectado' }));
    const h = hoja()!;
    expect(h.textContent).toContain('Conectado a Claude Code');
    expect(h.textContent).not.toContain('Configura tu agente');
  });

  it('bloqueado e intercambiado: cada uno con su salida', () => {
    poner({ estado: 'bloqueado' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    expect(hoja()!.textContent).toContain('Tu navegador bloqueó la conexión');
    fireEvent.click(within(hoja()!).getByRole('button', { name: 'Intentar de nuevo' }));
    poner({ estado: 'reemplazado' });
    expect(hoja()!.textContent).toContain('Otra pestaña de Vina tomó la conexión');
    fireEvent.click(within(hoja()!).getByRole('button', { name: 'Conectar aquí' }));
    expect(conectarTuAgente).toHaveBeenCalledTimes(2);
  });

  it('Copiar pone el comando en el portapapeles y dice «Copiado»', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const copiar = within(hoja()!).getByRole('button', { name: 'Copiar el comando de Claude Code' });
    fireEvent.click(copiar);
    expect(writeText).toHaveBeenCalledWith(COMANDO_CLAUDE_CODE);
    await vi.waitFor(() => expect(copiar.textContent).toBe('Copiado'));
  });

  it('la nota del permiso sale solo si el navegador va a preguntar', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    await vi.waitFor(() => expect(hoja()!.textContent).toContain('Haz clic en «Permitir».'));
    expect(query).toHaveBeenCalledWith({ name: 'local-network-access' });
    cleanup();
    query.mockResolvedValue({ state: 'granted' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(hoja()!.textContent).not.toContain('Permitir');
  });

  it('Esc la cierra y el foco vuelve al enchufe; un clic fuera también la cierra', async () => {
    montar();
    const enchufe = screen.getByRole('button', { name: 'Tu agente' });
    fireEvent.click(enchufe);
    await vi.waitFor(() => expect(hoja()!.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(hoja()).toBeNull();
    expect(document.activeElement).toBe(enchufe);
    fireEvent.click(enchufe);
    expect(hoja()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(hoja()).toBeNull();
  });
});

describe('la paleta', () => {
  it('conecta y desconecta a tu agente', () => {
    const conectar = COMMANDS.find(c => c.id === 'conectar-tu-agente')!;
    const desconectar = COMMANDS.find(c => c.id === 'desconectar-tu-agente')!;
    expect([conectar.name, conectar.description]).toEqual(['Conectar tu agente', 'Deja que Claude Code, Claude Desktop o Cursor trabajen en este patrón']);
    expect([desconectar.name, desconectar.description]).toEqual(['Desconectar tu agente', 'Tu agente deja de ver y cambiar este patrón']);
    conectar.action(store.dispatch, { onOpenPanel: () => {} });
    desconectar.action(store.dispatch, { onOpenPanel: () => {} });
    expect(conectarTuAgente).toHaveBeenCalledTimes(1);
    expect(desconectarTuAgente).toHaveBeenCalledTimes(1);
  });
});
```

En `tests/repo/superficies-declaradas.test.ts`, después de la línea de `DockToolPicker.tsx`:

```ts
  ['src/components/shell/PuertaDelAgente.tsx', 'menu', 1],
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/shell/__tests__/puerta-del-agente.test.tsx tests/repo/superficies-declaradas.test.ts`
Expected: FAIL. `../PuertaDelAgente` no existe, y la marca de `PuertaDelAgente.tsx` cuenta 0.

- [ ] **Step 3: Escribir la puerta**

`src/components/shell/PuertaDelAgente.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { Plug } from 'lucide-react';
import type { RootState } from '../../store';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../utils/telemetry/journal';
import { conectarTuAgente, desconectarTuAgente } from '../../copilot/puente/puenteDeLaApp';
import { permisoDelNavegador, type PermisoDelNavegador } from '../../copilot/puente/conexion';

export const COMANDO_CLAUDE_CODE = 'claude mcp add vina -- npx -y vina-mcp';
export const CONFIG_JSON = '"vina": { "command": "npx", "args": ["-y", "vina-mcp"] }';

/**
 * «Tu agente» (spec 2026-10-09, P1 y § 4.3): el enchufe al lado de «IA», con un
 * punto cuando hay un agente conectado, y su hoja. Copia el menú «Mostrar» de
 * `FilaDeCapas`: portal de papel, Esc por la escalera de lo llamado, cierre al
 * clicar fuera y el foco adentro al abrir.
 */
export default function PuertaDelAgente() {
  const { estado, agente } = useSelector((s: RootState) => s.puente);
  const [abierta, setAbierta] = useState(false);
  const [ancla, setAncla] = useState({ right: 0, top: 0 });
  const [permiso, setPermiso] = useState<PermisoDelNavegador>('desconocido');
  const [copiado, setCopiado] = useState<string | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const conectado = estado === 'conectado';
  const nombre = conectado ? `${agente ?? 'Tu agente'} está conectado` : 'Tu agente';

  // Abrir y cerrar quedan en la bitácora. Abierta, el foco entra a la hoja y
  // se pregunta el permiso: la nota solo sale si el navegador va a preguntar.
  const abiertaAntes = useRef(abierta);
  useEffect(() => {
    if (abiertaAntes.current === abierta) return;
    abiertaAntes.current = abierta;
    pushJournal('ui', 'tu-agente', { abierta });
    if (!abierta) return;
    hojaRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    void permisoDelNavegador().then(setPermiso);
  }, [abierta]);

  useEffect(() => {
    if (!abierta) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || hojaRef.current?.contains(t)) return;
      setAbierta(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [abierta]);

  usePeldanoDeEscape('tu-agente', 'menu', abierta, () => {
    if (hojaRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierta(false);
  });

  const copiar = (clave: string, texto: string) => {
    const escrito = navigator.clipboard?.writeText(texto);
    if (!escrito) return;
    void escrito.then(() => {
      setCopiado(clave);
      setTimeout(() => setCopiado(c => (c === clave ? null : c)), 2000);
    });
  };

  const accion = (texto: string, alClic: () => void, principal: boolean) => (
    <button
      type="button"
      className={`hoja-del-agente__accion${principal ? ' hoja-del-agente__accion--principal' : ''}`}
      onClick={alClic}
    >
      {texto}
    </button>
  );

  const senal = (ok: boolean, texto: string) => (
    <div className="hoja-del-agente__estado">
      <span className={`hoja-del-agente__senal${ok ? ' hoja-del-agente__senal--ok' : ''}`} aria-hidden="true" />
      {texto}
    </div>
  );

  const configuracion = (
    <div className="hoja-del-agente__configuracion">
      <div className="hoja-del-agente__subtitulo">Configura tu agente una sola vez</div>
      <div className="hoja-del-agente__fila">
        <span>Claude Code</span>
        <button type="button" className="hoja-del-agente__copiar" aria-label="Copiar el comando de Claude Code" onClick={() => copiar('code', COMANDO_CLAUDE_CODE)}>
          {copiado === 'code' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <code className="hoja-del-agente__codigo">{COMANDO_CLAUDE_CODE}</code>
      <div className="hoja-del-agente__fila">
        <span>Claude Desktop o Cursor</span>
        <button type="button" className="hoja-del-agente__copiar" aria-label="Copiar la configuración de Claude Desktop o Cursor" onClick={() => copiar('json', CONFIG_JSON)}>
          {copiado === 'json' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <code className="hoja-del-agente__codigo">{CONFIG_JSON}</code>
      <p className="hoja-del-agente__nota">Va dentro de «mcpServers», en la configuración de tu agente.</p>
    </div>
  );

  let contenido;
  if (estado === 'buscando') {
    contenido = (
      <>
        {senal(false, 'Esperando a tu agente')}
        <p>Abre tu agente y Vina se conecta en cuanto arranque. Si lo acabas de configurar, ciérralo y ábrelo otra vez.</p>
        {accion('Desconectar', desconectarTuAgente, false)}
        {configuracion}
      </>
    );
  } else if (estado === 'conectado') {
    contenido = (
      <>
        {senal(true, `Conectado a ${agente ?? 'tu agente'}`)}
        <p>Puede leer y cambiar este patrón. Lo que cambie se deshace con Ctrl+Z, como lo tuyo.</p>
        {accion('Desconectar', desconectarTuAgente, false)}
      </>
    );
  } else if (estado === 'bloqueado') {
    contenido = (
      <>
        {senal(false, 'Tu navegador bloqueó la conexión')}
        <p>Haz clic en el icono a la izquierda de la dirección y permite el acceso a otras aplicaciones de este dispositivo. Después, intenta de nuevo.</p>
        {accion('Intentar de nuevo', conectarTuAgente, true)}
      </>
    );
  } else if (estado === 'reemplazado') {
    contenido = (
      <>
        {senal(false, 'Otra pestaña de Vina tomó la conexión')}
        <p>Tu agente trabaja ahora en esa pestaña.</p>
        {accion('Conectar aquí', conectarTuAgente, true)}
      </>
    );
  } else {
    contenido = (
      <>
        <p>Claude Code, Claude Desktop o Cursor pueden leer y cambiar este patrón. Lo que cambien se deshace con Ctrl+Z, como lo tuyo.</p>
        {accion('Conectar', conectarTuAgente, true)}
        {permiso === 'prompt' && (
          <p className="hoja-del-agente__nota">La primera vez, tu navegador te pregunta si Vina puede acceder a otras aplicaciones de este dispositivo. Haz clic en «Permitir».</p>
        )}
        {configuracion}
      </>
    );
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={`puerta-del-agente${abierta ? ' puerta-del-agente--abierta' : ''}`}
        aria-label={nombre}
        title={nombre}
        aria-expanded={abierta}
        aria-controls="hoja-del-agente"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAncla({ right: window.innerWidth - r.right, top: r.bottom + 4 });
          setAbierta(a => !a);
        }}
      >
        <Plug size={14} aria-hidden="true" />
        {conectado && <span className="puerta-del-agente__punto" aria-hidden="true" />}
      </button>
      {abierta && createPortal(
        <div
          ref={hojaRef}
          id="hoja-del-agente"
          className="hoja-del-agente"
          role="dialog"
          aria-label="Tu agente"
          data-superficie="menu"
          data-material="papel"
          style={{ right: ancla.right, top: ancla.top }}
        >
          <h2 className="hoja-del-agente__titulo">Tu agente</h2>
          {contenido}
        </div>,
        document.body,
      )}
    </>
  );
}
```

En `src/components/shell/TopBar.tsx`, el import (con los de `./`):

```tsx
import PuertaDelAgente from './PuertaDelAgente';
```

y en el lado derecho:

```tsx
        <BotonIA />
        <PuertaDelAgente />
```

En `src/styles/layout.css`, después de la línea 182 (`@media (prefers-reduced-motion: reduce) { .boton-ia__actividad … }`):

```css

/* «Tu agente» (spec 2026-10-09, P1): el enchufe al lado de «IA», del mismo
   alto, y su hoja de papel, que cuelga de <body> como el menú «Mostrar». */
.puerta-del-agente { position: relative; height: 26px; width: 30px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; }
.puerta-del-agente:hover { color: var(--text-primary); }
.puerta-del-agente:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.puerta-del-agente--abierta { background: var(--bg-elevated); color: var(--text-primary); }
.puerta-del-agente__punto { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--success); }

.hoja-del-agente { position: fixed; z-index: var(--z-menu); width: 330px; padding: 14px 16px; background: var(--surface-overlay-bg); border: var(--surface-overlay-border); border-radius: var(--surface-overlay-radius); box-shadow: var(--surface-overlay-shadow); color: var(--text-primary); font-size: 13px; line-height: 1.45; }
.hoja-del-agente__titulo { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.hoja-del-agente p { margin: 0 0 10px; color: var(--text-secondary); }
.hoja-del-agente__estado { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-weight: 600; }
.hoja-del-agente__senal { width: 8px; height: 8px; border-radius: 50%; background: var(--text-tertiary); }
.hoja-del-agente__senal--ok { background: var(--success); }
.hoja-del-agente__accion { height: 28px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
.hoja-del-agente__accion:hover { background: var(--bg-elevated); }
.hoja-del-agente__accion:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.hoja-del-agente__accion--principal { border-color: var(--accent-fuerte); background: var(--accent-fuerte); color: var(--on-accent); font-weight: 600; }
.hoja-del-agente__accion--principal:hover { background: var(--accent-fuerte-hover); }
.hoja-del-agente .hoja-del-agente__nota { margin: 10px 0 0; font-size: 12px; }
.hoja-del-agente__configuracion { margin: 12px -16px 0; padding: 12px 16px 0; border-top: var(--hairline); }
.hoja-del-agente__subtitulo { font-size: 12px; font-weight: 600; }
.hoja-del-agente__fila { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0 3px; font-size: 12px; color: var(--text-secondary); }
.hoja-del-agente__copiar { padding: 0; border: 0; background: transparent; color: var(--accent-fuerte); font: inherit; font-weight: 600; cursor: pointer; }
.hoja-del-agente__copiar:hover { text-decoration: underline; }
.hoja-del-agente__copiar:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.hoja-del-agente__codigo { display: block; padding: 6px 8px; background: var(--bg-elevated); border-radius: var(--radius-sm); font: 11.5px/1.4 var(--font-mono); color: var(--text-primary); white-space: pre-wrap; word-break: break-all; }
```

En `src/components/shell/unifiedBarCommandDefs.ts`: añadir `Plug` al import de `lucide-react`, el import

```ts
import { conectarTuAgente, desconectarTuAgente } from '../../copilot/puente/puenteDeLaApp';
```

y, después de `reset-sim`:

```ts
  // ─── Tu agente (spec 2026-10-09) ───
  { id: 'conectar-tu-agente', category: 'Acciones', name: 'Conectar tu agente', description: 'Deja que Claude Code, Claude Desktop o Cursor trabajen en este patrón', icon: Plug, action: () => conectarTuAgente() },
  { id: 'desconectar-tu-agente', category: 'Acciones', name: 'Desconectar tu agente', description: 'Tu agente deja de ver y cambiar este patrón', icon: Plug, action: () => desconectarTuAgente() },
```

- [ ] **Step 4: Correrlo y verlo pasar**

Run: `npx vitest run src/components/shell/__tests__/puerta-del-agente.test.tsx tests/repo/superficies-declaradas.test.ts`
Expected: PASS. Los 9 de la puerta y todas las marcas.

- [ ] **Step 5: El contrato y los vecinos**

Run: `node scripts/ui-contract-lint.mjs`
Expected: ningún contador sube (exit 0).

Run: `npx vitest run src/components/shell`
Expected: PASS. La barra superior, la paleta y los grupos de comandos siguen en verde.

- [ ] **Step 6: Los trinquetes y la barra en el navegador**

Antes, avisar a vina-ed. Calentar Vite: `npx vite --port 5174` en segundo plano y esperar a que conteste.

Run: `npx playwright test tests/e2e/barra-superior.spec.ts tests/e2e/reposo-solo-lo-que-perdura.spec.ts tests/e2e/contraste-del-cromo.spec.ts tests/e2e/ia-convocada.spec.ts --workers=2 --retries=0 > .superpowers/e2e-t6.log 2>&1; grep -E "passed|failed|flaky" .superpowers/e2e-t6.log`
Expected: todos pasan. El selector de vista sigue en el centro, «Mostrar» no se pliega a 1366 px, nada nuevo en reposo y ningún contraste baja.

- [ ] **Step 7: Suite entera y commit**

Run: `npm run test > .superpowers/suite-t6.log 2>&1; tail -5 .superpowers/suite-t6.log`
Expected: todos los archivos en verde.

```bash
git add src/components/shell/PuertaDelAgente.tsx src/components/shell/TopBar.tsx src/styles/layout.css src/components/shell/unifiedBarCommandDefs.ts tests/repo/superficies-declaradas.test.ts src/components/shell/__tests__/puerta-del-agente.test.tsx
git commit -m "feat(puente): la puerta «Tu agente», un enchufe al lado de «IA» con su hoja de papel"
```

---

### Task 7: El e2e de punta a punta y el gate del deploy

**Files:**
- Create: `tests/e2e/puente-mcp.spec.ts`
- Modify: `scripts/deploy-prod.sh` (una línea en la primera lista de e2e, después de `tests/e2e/ia-convocada.spec.ts \`)
- Modify: `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (una nota al final de § 4)

**Interfaces:**
- Consumes: `mcp/bin/vina-mcp.mjs` (Tarea 4), la puerta (Tarea 6), `localStorage['vina-puente-puerto']` (Tarea 5) y `abrirAppVacia` (`tests/e2e/helpers/estados.ts`).
- Produces: el spec en el gate del deploy.

- [ ] **Step 1: Escribir el e2e**

`tests/e2e/puente-mcp.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { abrirAppVacia } from './helpers/estados';

/**
 * El puente MCP (spec 2026-10-09), con la app de verdad: el test hace de
 * agente. Arranca `vina-mcp` como lo arrancaría Claude Code y habla MCP por su
 * stdio; la app entra por la puerta, el enchufe al lado de «IA». Lo que jsdom
 * no ve: que la pestaña llega al puente, y que lo que hace el agente se ve en
 * el lienzo y se deshace.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.use({ viewport: { width: 1366, height: 643 } });

/** No el 8462: en la máquina de Samuel puede estar corriendo el puente de verdad. */
const PUERTO = 18462;

type Respuesta = { result?: { content?: Array<{ text: string }>; isError?: boolean } };

function agente(proc: ChildProcessWithoutNullStreams) {
  let id = 0;
  const esperando = new Map<number, (r: Respuesta) => void>();
  createInterface({ input: proc.stdout }).on('line', (l) => {
    const m = JSON.parse(l) as Respuesta & { id?: number };
    if (m.id !== undefined) esperando.get(m.id)?.(m);
  });
  return {
    pedir(method: string, params: unknown = {}) {
      const mio = ++id;
      return new Promise<Respuesta>((ok) => {
        esperando.set(mio, ok);
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
      });
    },
    avisar(method: string) {
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
  };
}

test('tu agente entra por el enchufe: crea una pieza que se ve, y la deshace', async ({ page }) => {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(PUERTO) } });
  try {
    const yo = agente(proc);
    await yo.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'e2e' } });
    yo.avisar('notifications/initialized');

    await page.addInitScript((p) => localStorage.setItem('vina-puente-puerto', String(p)), PUERTO);
    await abrirAppVacia(page);
    await page.getByRole('button', { name: 'Tu agente', exact: true }).click();
    const hoja = page.locator('.hoja-del-agente');
    await expect(hoja).toHaveAttribute('data-material', 'papel');
    await hoja.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(hoja).toContainText('Conectado a Claude Code');
    await expect(page.getByRole('button', { name: 'Claude Code está conectado', exact: true })).toBeVisible();

    const creada = await yo.pedir('tools/call', { name: 'create_piece', arguments: { name: 'Del agente', rectangle: { width: 200, height: 100 } } });
    expect(creada.result?.isError, JSON.stringify(creada.result)).toBeFalsy();
    expect(JSON.parse(creada.result!.content![0].text).result.done).toBe(true);
    await expect(page.locator('[data-piece-id]')).toHaveCount(1);

    const deshecha = await yo.pedir('tools/call', { name: 'undo', arguments: {} });
    expect(deshecha.result?.isError, JSON.stringify(deshecha.result)).toBeFalsy();
    await expect(page.locator('[data-piece-id]')).toHaveCount(0);
  } finally {
    proc.kill();
  }
});
```

- [ ] **Step 2: Correrlo**

Vite caliente en el 5174, como en la Tarea 6.

Run: `npx playwright test tests/e2e/puente-mcp.spec.ts --workers=1 --retries=0 > .superpowers/e2e-t7.log 2>&1; grep -E "passed|failed" .superpowers/e2e-t7.log`
Expected: `1 passed`.

Si falla: abrir `.superpowers/e2e-t7.log` y depurar con superpowers:systematic-debugging antes de tocar nada.

- [ ] **Step 3: Probar que el e2e muerde**

Comentar en `src/copilot/puente/conexion.ts` la línea `s.send(JSON.stringify({ t: 'hola', … }))` del `onopen`. Correr el e2e: tiene que fallar, porque el agente no se entera, `create_piece` no responde y vence el plazo. Restaurar con `git checkout -- src/copilot/puente/conexion.ts` (la Tarea 5 ya está commiteada).

- [ ] **Step 4: El gate del deploy y la nota en la spec madre**

En `scripts/deploy-prod.sh`, en la primera lista de `npx playwright test --workers=2 \`, después de `  tests/e2e/ia-convocada.spec.ts \`:

```
  tests/e2e/puente-mcp.spec.ts \
```

Al final de § 4 de `docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md` (antes de `## 5.`):

```markdown
**Nota del puente (2026-10-09).** El subproyecto 2 va antes de terminar el 1 y tiene su spec,
`2026-10-09-puente-mcp-design.md`. La puerta no es el botón «IA» sino un enchufe a su lado, con un
punto cuando hay un agente conectado: Samuel eligió esa variante viendo las maquetas.
```

Run: `bash -n scripts/deploy-prod.sh && grep -c "puente-mcp.spec.ts" scripts/deploy-prod.sh`
Expected: sin errores de sintaxis; `1`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/puente-mcp.spec.ts scripts/deploy-prod.sh docs/superpowers/specs/2026-10-05-ia-una-superficie-design.md
git commit -m "test(puente): el agente entra por el enchufe, crea una pieza que se ve y la deshace; al gate del deploy"
```

---

## Después de las tareas

1. **Revisión final** con un subagente Opus (`superpowers:requesting-code-review`), con este Review Focus y los `Ruling:` del registro.
2. **Prueba con Claude Code de verdad.** Con Vite en el 5174 y una pestaña de Playwright con «Conectar» encendido sobre el puerto 18463, correr:

   ```bash
   claude -p "Use the vina tools: read the pattern and create a rectangle of 300 by 200 mm named Prueba. Then tell me the piece id and the revision." --mcp-config <cfg> --allowedTools "mcp__vina__read_pattern,mcp__vina__create_piece" --model haiku
   ```

   `<cfg>` es un archivo `{"mcpServers":{"vina":{"command":"node","args":["mcp/bin/vina-mcp.mjs"],"env":{"VINA_MCP_PORT":"18463"}}}}`. Esperado: la pieza aparece en la pestaña y la respuesta trae su id. El `clientInfo.name` que mande Claude Code confirma o corrige `nombreDelAgente`.
3. **Ensayo del deploy:** `bash scripts/deploy-prod.sh --ensayo`, avisando antes a vina-ed. Después, apagar el Vite huérfano del 5174 (cadena bash→npx→cmd→node).
4. Push, PR, merge, deploy y `npm publish` esperan la orden de Samuel.
