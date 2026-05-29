# M3 — Importación de DXF: design spec (v3 — implementado)

**Fecha:** 2026-05-29
**Estado:** IMPLEMENTADO. v3 agrega el chat attachment (estilo Claude) sobre la base v2.
**Continúa:** probe M3 (commit `6251ef9f`) que confirmó que el parser DXF maneja el archivo real de María (5 piezas, AAMA)
**Slice MVP v1 spec § 1:** "Importar este DXF de Adidas"
**Bloquea:** M4 (sesión con María)
**Fundamentado por:** workflow `m3-dxf-spec-research` (9 agentes, grounding verbatim) + crítica clínica Serrano (3 BLOCKERS en v1 → resueltos en v2) + review adversarial de implementación (13 agentes → 1 defecto, arreglado) + decisión de Samuel (chat attachment, v3)

> **Historial de versiones.** v1: staging slot agentic — **rechazado** (Serrano: doble-import estructural, §7). v2: import-on-drop directo, sin staging, agente downstream. v3 (esta, implementada): conserva v2 (canvas drop + file-picker) y **agrega una tercera superficie** — adjuntar el DXF al chat como asset y enviarlo con texto. Diseño en §12.

---

## 0. TL;DR de la decisión

El parser DXF ya existe y funciona. La lógica de import **completa** ya existe (`import_dxf` en `actionExecutor.ts:913`). Lo que falta no es lógica de parsing — es **una superficie de entrada de archivo robusta en el browser**, más el aprovechamiento del agente sobre el patrón ya cargado.

**Diseño v2 (corregido):** **el drop importa directo. No hay staging slot. No hay tools nuevos.** El usuario suelta el DXF (único acto que el sandbox permite), se importa inmediatamente, aparecen las piezas. El valor agentic está en el **downstream**: el agente, sobre estado real ya cargado, ofrece coser / vestir / simular / ajustar.

**Por qué v2 ≠ v1:** la v1 proponía un staging slot (`pendingDXFImports`) que el drop llenaba Y el agente consumía. Serrano demostró que eso es complejidad accidental con doble-import latente estructural (drop importa directo + agente ve un "pending" ya importado → 10 piezas en vez de 5). El sandbox del browser ya fuerza a que la entrada del archivo sea un gesto del usuario; el agente nunca puede leer el archivo por sí mismo. Por eso "el agente importa el DXF" es teatro. La v2 es honesta: el usuario importa con un gesto; el agente piensa sobre el resultado.

---

## 1. El hallazgo que reencuadra todo

El código tiene **dos subsistemas de razonamiento disjuntos**:

| | Mundo A: `copilot/actions/` (legacy) | Mundo B: `AgenticLoop` + `ToolRegistry` |
|---|---|---|
| Qué es | Schema-actions: `CopilotAction` → `ActionExecutor.execute()` | Tool-calling loop: `ToolDefinition.execute(params, dispatch, getState)` |
| Invocado por | `planExecutor.ts`, `conversationManager.ts` | `UnifiedBarChat.tsx:108` → `useAgenticLoop` |
| ¿Lo usa María? | **NO** | **SÍ** (la chat que validamos en M2) |
| Estado DXF | `import_dxf` **completo** (`actionExecutor.ts:913-973`) | solo `detectDXFFormat` (read-only) |

`import_dxf` está terminado pero en el mundo que María no toca. Su core de import se **extrae a una función compartida** (§4.1) para no duplicar lógica — pero esa función la llama el **drop-zone**, no un tool del agente.

---

## 2. La restricción que define el diseño: el sandbox del browser

**Este es el corazón.** El browser sandbox prohíbe que el agente:
- abra un file picker,
- lea un path del filesystem,
- produzca los bytes de un archivo.

Por lo tanto **la entrada del archivo es SIEMPRE un gesto del usuario** (drop o file-picker). No hay forma de que el agente "importe" autónomamente el DXF de María. Cualquier diseño que finja lo contrario (ej. un tool `importStagedDXF` que el agente dispara) es teatro sobre bytes que el usuario ya entregó — y, como mostró Serrano, introduce un ciclo de vida de staging que se vuelve fuente de doble-import.

**Conclusión:** el acto de import lo dispara el gesto del usuario, directamente. El agente entra después.

---

## 3. Hechos verificados (firmas reales, no inventadas)

```ts
parseDXF(content: string): DXFDocument                                   // parser.ts:332
dxfToPatternPieces(doc: DXFDocument, options?: DXFImportOptions): PatternPiece[]  // converter.ts:256
detectDXFFormat(doc: DXFDocument): DetectionResult[]                      // formatDetector.ts:93

interface DXFImportOptions {                                             // converter.ts:220
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  importNotches?: boolean;
  importGrainlines?: boolean;
  importInternalLines?: boolean;
  formatProfile?: FormatProfile;
}
```

**El adapter gap es semántico, NO estructural.** `dxfToPatternPieces` produce `PatternPiece` válidos (13 campos). `addPiece` (`projectSlice.ts:350`) los acepta directo — el dispatch-in-a-loop ya funciona en producción (`actionExecutor.ts:962-965`). `addPiece` auto-rellena `layer`/`fabricCode`/`edges`.

**Degradación conocida:** `dxfToPatternPieces` hardcodea `layer: 1` y nunca setea `category` → todas las piezas DXF caen en layer 1. → §6 (deferred).

**DXF nunca produce seams nativamente** (`InternalLineType` no tiene `'seam'`; `converter.ts:436-438` los salta). Pero `autoSew` (`src/utils/autoSew/`, general-purpose) es reusable. → §5.

**Reporting:** `presentToUser({message, awaiting: 'confirmation'|'done'})` (`presentToUser.ts:26`). **Grounding gate** (`AgenticLoop.ts:200-253`): el agente necesita un tool call real antes de hablar — satisfecho por tools de lectura existentes (`getProjectOverview`/análisis) sobre las piezas ya cargadas.

---

## 4. Diseño v2

### 4.1 Core compartido extraído (DRY)

Extraer la lógica inline de `actionExecutor.ts:913-973` a una función pura que NO dispatchea:

```ts
// src/utils/dxf/importPipeline.ts  (nuevo)
import type { PatternPiece } from '../../types/types';
import type { FormatId } from './types';

export interface DXFImportOptions {            // reusa el tipo de converter.ts:220, NO inventa
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  autoDetect?: boolean;
  format?: FormatId;
}

export interface DXFImportResult {
  pieces: PatternPiece[];
  format: FormatId | null;
  formatConfidence: number;
}

/** Parsea + convierte. NO toca Redux. Lanza DXFParseError en fallo. */
export function importDXFContent(content: string, options?: DXFImportOptions): DXFImportResult;

export class DXFParseError extends Error { /* code: 'empty' | 'parse' | 'no-pieces' */ }
```

`actionExecutor.ts:913` se refactoriza para llamar a `importDXFContent` (mantiene comportamiento + sus tests `importDxfExecutor.test.ts` verdes). El drop-zone (§4.2) también la llama. Una sola fuente de verdad de la lógica de import.

**Tipos:** `DXFImportOptions` aquí es un subconjunto explícito y tipado del de `converter.ts:220` (solo los campos que el caller controla). Cero `any` implícito — el gate `tsc -b --noEmit` no negociable lo exige.

### 4.2 Drop-zone (la única superficie de entrada)

- Listener global de drop sobre `canvas-area` (`AppShell.tsx:115`), espejando `ImportSeamlyModal.tsx:76` (`handleDrop`, `e.dataTransfer.files[0]`).
- Botón file-picker como fallback accesible (espeja `ReferenceImageSettings.tsx:48`).
- Flujo al soltar:
  1. Validar extensión `.dxf` **y** tamaño ≤ límite (§4.4). Si falla → toast de error, no se hace nada más.
  2. `FileReader.readAsText` (con `onerror` manejado).
  3. `importDXFContent(content, { unit: 'auto', autoDetect: true })` dentro de `try/catch`.
  4. **Éxito:** `for (piece of result.pieces) dispatch(addPiece(piece))` (siempre `loadType: 'add'` — nunca destructivo) → `selectPiece(result.pieces[0].id)` → toast éxito "Cargué tu patrón: N piezas".
  5. **Fallo** (`DXFParseError` o 0 piezas): toast de error específico ("No pude leer ese DXF" / "El archivo no tiene piezas reconocibles"). El estado del proyecto **no se toca**.

**No hay staging slot. No hay `pendingDXFImports`. No hay ciclo de vida que gestionar.** El import es una transacción atómica disparada por el gesto. Esto disuelve los BLOCKERS #1/#2/#4/#5 y los findings #8/#9/#12/#14 de la crítica v1.

### 4.3 Error handling (BLOCKER #3 de Serrano — ahora explícito)

| Caso | Comportamiento |
|---|---|
| Drop de no-`.dxf` | Toast "Solo acepto archivos .dxf", no-op |
| `FileReader.onerror` | Toast "No pude leer el archivo", no-op |
| `parseDXF` lanza / doc inválido | `DXFParseError('parse')` → toast "Ese DXF no se pudo interpretar", no-op |
| 0 piezas extraídas | `DXFParseError('no-pieces')` → toast "El archivo no tiene piezas reconocibles", no-op |
| `.dxf` corrupto que parsea a basura | Cae en 0-piezas o parse-error según el parser; mismo manejo |

Regla invariante: **el proyecto solo cambia si el import produjo ≥1 pieza.** Nunca un toast de éxito sobre 0 piezas.

### 4.4 Límite de tamaño (finding #13)

Cap de archivo en el drop-zone (ej. 10 MB — el de María es 89 KB, holgura amplia). Sobre el cap → toast "Archivo muy grande", no-op. Evita el footgun de `readAsText` sobre un DXF patológico congelando el tab.

### 4.5 El valor agentic (downstream, sobre estado real)

El agente NO importa. Una vez las piezas están cargadas, el agente — vía la chat de María en `UnifiedBar` — opera sobre estado real con tools existentes:

- María: "ya cargué mi patrón, ayúdame a vestir el avatar"
- Agente: llama `getProjectOverview` (o análisis) → ve 5 piezas reales (grounding gate satisfecho) → `presentToUser({awaiting:'confirmation'})`: "Veo 5 piezas cargadas. ¿Las coso (autoSew) y visto el avatar?"
- María confirma → agente corre `autoSew` + `dressAvatar`/`runGarmentPipeline` (tools que **ya existen** del slice M2).

Esto usa la maquinaria agentic validada en M2, sobre piezas reales, sin tools nuevos, sin staging, sin grounding-gate co-design.

---

## 5. Seams + simulación (decisión, finding #11 resuelto)

**El drop-zone NO cose ni simula.** Solo carga las piezas. Coser y simular son pasos **downstream explícitos** disparados por el agente (o por UI manual), sobre las piezas ya cargadas — exactamente el flujo M2 (`autoSew` post-piezas, `simulate` tras confirmación). Esto:
- evita repetir el hang de 17-piezas de M2 (simular es un acto deliberado, no automático),
- elimina la contradicción v1 (`autoSew` atado a `simulate` vs. flags independientes): en v2 ni siquiera son parámetros del import — son operaciones separadas del agente.

`autoSew(pieces, {minConfidence: 0.3})`, filtra `>= 0.6` para `addSeam`. Gate: `pieces.length >= 2` antes de coser (sin esto, `startSimulation` corre sobre piezas desconectadas = basura).

---

## 6. Degradación conocida — deferred a M3.5

`dxfToPatternPieces` mete todo en `layer: 1` (nunca setea `category`). Seamly evita esto con `applyClassification`; el path DXF no. **Para M3 mínimo, las piezas de María caen todas en layer 1** — visible pero no bloqueante para "ver el patrón cargado". Si la UX lo pide, M3.5 corre `applyClassification` en `importDXFContent` (opt-in `classify`) para inferir `category`/`side` antes del dispatch y que `autoDetectLayer` haga algo útil.

---

## 7. Alternativa considerada y rechazada (v1 — staging agentic)

La v1 proponía: drop stagea en `pendingDXFImports` + dos tools nuevos (`listPendingImports` meta + `importStagedDXF` action) para que el agente "importe".

**Rechazada** porque Serrano encontró 3 BLOCKERS estructurales, todos la misma herida — el staging slot sin ciclo de vida:
1. Drop importa directo + stagea → el agente ve un "pending" ya importado → doble-import (10 piezas).
2. Nadie define quién llama `clearDXFImport` ni cuándo → leak monótono de strings ~89KB en Redux.
3. Race no determinista entre drop directo y tool agentic sobre el mismo slot.

Más: el `loadType:'open'` destructivo dependía de que el LLM "decidiera" confirmar (no enforced en código → riesgo de pérdida de trabajo de María).

La raíz: el sandbox (§2) ya fuerza la entrada por gesto del usuario, así que el tool agentic de import no aporta capacidad real — solo dispara lógica sobre bytes ya entregados, a cambio de todo el ciclo de vida del staging. **Coste alto, valor nulo.** La v2 lo elimina.

---

## 8. Wiring risks (lo que SÍ aplica en v2)

| Riesgo | Estado en v2 |
|---|---|
| Tool-count tests (231) | **No se tocan** — v2 no agrega tools. Cero edits de count. |
| Nombres duplicados | N/A — sin tools nuevos. |
| `fileContent` como param del LLM = trampa | Eliminado — el agente no recibe bytes. |
| Doble-import / staging lifecycle | Eliminado — sin staging. |
| `tsc -b` con tipos `any` | Mitigado — `DXFImportOptions` explícito (§4.1). |
| `startSimulation` sin seams | Mitigado — simular es downstream con guard `>= 2` piezas (§5). |
| Refactor de `actionExecutor.ts` rompe sus tests | `importDXFContent` preserva comportamiento; `importDxfExecutor.test.ts` debe seguir verde. |

---

## 9. Integration test

`tests/integration/m3-dxf-import.test.ts`:
- Gate: `M3_INTEGRATION === '1'` + archivo existe (reusar `MARIA_DXF` env var, default `C:\Users\simon\Desktop\temp.dxf`).
- **Core path (sin LLM, barato):** leer el DXF de María (en test, `readFileSync` es legítimo — el test simula el resultado del `FileReader`), llamar `importDXFContent`, asertar `result.pieces.length === 5`, dispatch al store real, asertar `store.getState().project.pieces.length === 5`. Esto valida el camino crítico que María dispara.
- **Agentic downstream (opcional, con LLM, espeja M2):** con piezas ya cargadas, correr el loop con "cose mi patrón y visten el avatar", asertar `tool:start` incluye análisis + `autoSew`/`dressAvatar`, y `seams.length > 0`. Costo ~$0.25-0.50/run.
- Unit test del error handling (§4.3): contenido vacío / basura / 0-piezas → `DXFParseError` con el `code` correcto, proyecto sin tocar.

Mantener `maria-dxf-parse.test.ts` como está (valida el parser standalone).

---

## 10. Scope M3 vs deferred

**En M3:**
- `importDXFContent` core extraído + refactor de `actionExecutor.ts` (DRY)
- Drop-zone global en `canvas-area` + file-picker fallback
- Error handling completo (§4.3) + límite de tamaño (§4.4)
- Toasts de éxito/error
- Integration test (core path) + unit tests de error
- El valor agentic downstream usa tools M2 existentes (cero tools nuevos)

**Deferred (M3.5+ si la UX lo pide):**
- Clasificación de piezas en import (§6) — evitar layer-1 flattening
- Multi-archivo drag
- Format override UI / dynamic model fetch

**LOC estimado:** ~150 (core ~60, drop-zone + error handling ~60, tests ~30). Menos de la mitad de la v1 (~274) porque la v2 borra staging + 2 tools + edits de count.

---

## 11. Decisiones (resueltas)

1. **Arquitectura** — v2 (import-on-drop) validada por Samuel + **v3** agrega chat attachment (§12).
2. **Drop-zone location** — global sobre `canvas-area` (canvas) + chip en el chat (attachment). Ambas.
3. **Clasificación de piezas** — deferred a M3.5 (piezas en layer 1 por ahora). Confirmado.

---

## 12. Chat attachment (v3 — estilo Claude)

Decisión de Samuel: además del drop sobre el canvas, **arrastrar el DXF sobre la conversación lo adjunta como asset** (chip sobre el input), permite escribir texto al lado, y al enviar van **juntos** (patrón + instrucción) en un solo mensaje al agente.

### Flujo

1. **Drop sobre el chat** (`UnifiedBar`) → `readAndParseDXFFile` parsea (valida ext/tamaño/contenido, cuenta piezas) → se guarda como `pendingDXF` en estado local de `UnifiedBar`. **NO importa todavía.** Chip: `📎 patrón.dxf · 5 piezas ×`.
2. Usuario escribe texto opcional ("vísteme esto con tela de algodón").
3. **Enviar** (`UnifiedBarChat.handleSend`):
   - Importa las piezas del attachment a Redux (`addPiece` × N + `selectPiece`) — **atómico, un solo punto**.
   - Limpia el chip (`clearAttachment`).
   - Compone el mensaje del agente: nota de contexto (`[el usuario adjuntó y cargó un patrón DXF "X" con N piezas, ya presentes en el proyecto]`) + el texto del usuario. El agente **nunca recibe los bytes** — opera sobre las piezas ya en estado (grounding gate satisfecho con tools de lectura).
   - Si no hay provider configurado: importa igual + mensaje canned (María ve su patrón sin depender del LLM).

### Por qué NO reintroduce los blockers de Serrano (§7)

| Blocker v1 | Por qué no aplica en v3 |
|---|---|
| Doble-import (drop importa + stagea) | El drop **solo adjunta** (parsea, no dispatcha). El import ocurre una vez, al enviar. Sin ruta dual. |
| Nadie limpia el slot / leak | El attachment vive en `useState` local de `UnifiedBar` (NO slice Redux). Un solo consumidor (send) que limpia tras consumir; el `×` también limpia. Muere con el componente. |
| Race drop-directo vs agente | No hay agente consumiendo un slot compartido. El flujo es lineal: adjuntar → enviar → importar. |
| `loadType:'open'` destructivo vía LLM | El attachment siempre hace `addPiece` (append). Nunca `loadProject`. Sin ruta destructiva. |
| `fileContent` al LLM | El agente recibe una nota de contexto + texto, nunca bytes. |

La diferencia estructural: el slot v1 era **Redux compartido entre un importador (drop) y un consumidor (agente)** → ciclo de vida ambiguo. El attachment v3 es **estado local de UI con un único consumidor (send)** → ciclo de vida trivial.

### Archivos (implementación final)

| Archivo | Rol |
|---|---|
| `src/utils/dxf/importPipeline.ts` | `importDXFContent` (puro) + `readAndParseDXFFile` (File→pieces, valida) + `DXFParseError`/`DXFFileError` + `DXF_MAX_BYTES` |
| `src/utils/dxf/index.ts` | Barrel exports |
| `src/copilot/actions/actionExecutor.ts` | `import_dxf` usa `importDXFContent` (DRY) |
| `src/components/shell/dxfImport.ts` | `dxfErrorMessage` (copy ES), `piecesLabel`, tipo `PendingDXFAttachment` |
| `src/components/shell/AppShell.tsx` | Canvas drop-zone + input oculto fallback |
| `src/components/shell/{TopBar,LogoMenu}.tsx` | `File ▸ Import DXF…` → file-picker |
| `src/components/shell/UnifiedBar.tsx` | Drop→attach, chip drag overlay, gate de submit, estado `pendingDXF` |
| `src/components/shell/UnifiedBarChat.tsx` | Chip render + consumo del attachment al enviar |
| `src/utils/dxf/__tests__/importPipeline.test.ts` | 9 tests (core + File + errores) |
| `tests/integration/m3-dxf-import.test.ts` | Core path con DXF real de María (gated) |

### Tres superficies de entrada (coexisten)

- **Canvas drop** / **`File ▸ Import DXF…`** → import inmediato ("solo cargar").
- **Chat drop** → adjuntar + enviar con texto ("cargar + hablar").

Todas comparten `readAndParseDXFFile`. Cero staging Redux, cero tools nuevos, cero cambio de tool-count.
