# Step 2 — Test flakes fix (#631) + E2E rojo del DoD (#506)

**Fecha:** 2026-05-18
**Contexto:** segundo paso del programa propuesto en el informe de priorización por ROI sobre `sssamuelll/openclo`. Paso 1 cerrado en `2026-05-18-seamly-deprecation-epic-clarification.md` y issue GitHub #800. Este doc cubre el paso 2: red de seguridad antes de tocar el cluster #527/#518/#556/#531.

## TL;DR

1. **Fix de las test flakes** (`tshirtMeshing.test.ts`, `cubicBezier.test.ts`, rastreado como **#631** en el CI yml — no #623 como decía el informe original) vía aislamiento de pool de Vitest 4 (API `projects`), sin tocar el código de los tests ni de `constructionResolver`.
2. **`npm run test:e2e`** ahora existe (faltaba).
3. **CI corre Playwright** en un job nuevo `e2e`, `continue-on-error: true` hasta que el DoD esté verde.
4. **`tests/e2e/dress-avatar-dod.spec.ts`** encodea el DoD del #506 con assertions funcionales (Redux state + vertex positions). Es **rojo intencional** hoy.

## Cambios aplicados

### 1. `vitest.config.ts` — pool isolation para tests CDT-heavy

Refundación del diagnóstico de las flakes: el comentario del propio CI (`Excluded tests tracked in #631 — flaky under concurrent run, pass in isolation`) ya documentaba el síntoma. La hipótesis original del informe ROI (path relativo + `maxPasses = 5` del `constructionResolver`) era plausible pero no encaja con "pass in isolation". El síntoma "concurrent → falla, aislado → pasa" es prácticamente siempre **contención de recursos**, no race de datos.

Causa raíz probable: ambos tests corren Constrained Delaunay Triangulation (CPU-bound) sobre patrones Seamly2D reales. Bajo el pool por defecto de Vitest 4 (`threads`, paralelismo = `os.cpus().length`), múltiples test files compiten por CPU; los dos tests CDT-heavy ocasionalmente exceden sus timeouts (10 s y 60 s) intermitentemente.

Fix surgical aplicado: API `projects` de Vitest 4 con dos sub-proyectos:

- `default`: incluye todos los tests **excepto** los dos heavy. Mantiene pool `threads` (default).
- `seamly-heavy`: incluye solo `tshirtMeshing.test.ts` + `cubicBezier.test.ts`. Pool `forks` con `singleFork: true`. Esto los hace correr **secuencialmente en su propio proceso**, aislados del thread pool default.

Ventaja vs. alternativas consideradas:
- vs. **mover setup a `beforeEach`**: no atacaría la contención de CPU.
- vs. **subir timeouts**: tapa el síntoma sin entender por qué.
- vs. **`pool: 'forks'` global**: penaliza la velocidad de los ~150 tests rápidos.
- vs. **arreglar `maxPasses` del resolver**: bien hipotéticamente, pero "pass in isolation" lo refuta como causa próxima de las flakes.

Verificación local (Samuel, esto NO se puede correr en este sandbox):

```bash
# Pre-condición: instalar deps
npm ci

# (a) Los tests heavy en isolation 20 veces — deben pasar 20/20
for i in {1..20}; do
  npm run test -- src/utils/seamly2d/__tests__/tshirtMeshing.test.ts \
    || echo "FAIL aislado run $i"
done

for i in {1..20}; do
  npm run test -- src/utils/seamly2d/__tests__/cubicBezier.test.ts \
    || echo "FAIL aislado run $i"
done

# (b) El suite completo 10 veces — antes flaky, ahora debe pasar 10/10
for i in {1..10}; do
  npm run test || echo "FAIL suite run $i"
done
```

Expectativa: **cero líneas `FAIL`** en cualquiera de los tres loops. Si alguno falla, ver "Si la fix no funciona" abajo.

### 2. `package.json` — scripts e2e

Agregados: `test:e2e`, `test:e2e:headed`, `test:e2e:ui`. El primero es el que CI invoca; los otros dos son convenience para dev local (UI mode de Playwright es excelente para iterar).

### 3. `.github/workflows/ci.yml` — 2 cambios

- **Removidos** los `--exclude` de los 2 tests del job `validate`. Ahora corre `npx vitest run --coverage` sin flags. Comentario nuevo apunta a `vitest.config.ts` para contexto.
- **Agregado** un job `e2e` con Playwright headless chromium:
  - `continue-on-error: true` mientras `#506` siga abierto (no rompe PRs, solo informa).
  - **NO** está en `ci-success.needs` todavía. Cuando el DoD esté verde, hay que (i) flip a `false`, (ii) agregar `e2e` a `ci-success.needs`. Ambos cambios en el mismo PR que cierra #506.
  - Cache de browsers Playwright (`~/.cache/ms-playwright`) keyed por `package-lock.json` hash. Cold install dura ~1-2 min; warm cache ~10 s.
  - Upload de `playwright-report/` como artefacto en failures.

### 4. `tests/e2e/dress-avatar-dod.spec.ts` — el test rojo

Encodea el DoD del epic #506:

> Open the app → load a male shirt pattern from Template Library → click "Dress" → within ≤10s the cloth simulation produces a draped garment such that (a) ≥15 seams form, (b) no cloth vertex falls below avatar waist Y.

Decisiones de diseño:

- **Assertions funcionales, NO pixel-compare** (por ahora). Se inspeccionan `window.__REDUX_STORE__.getState().project.{pieces,seams}` y los vértices de `window.__OPENCLO_CLOTH_MESH__.geometry.position`. Razón: pixel diff necesita baseline previo, lo cual choca con "rojo intencional".
- **Selectores defensivos**. El template library se abre vía múltiples botones potenciales (TopBar + UnifiedBar); el test prueba varios candidatos antes de fallar. El template "Male Shirt" puede tener distinto label en el catálogo; el test cae a `/shirt|camisa/i` si el match exacto falla.
- **Fallback claros**. Si `window.__REDUX_STORE__` no existe, `window.__OPENCLO_CLOTH_MESH__` no existe, o no hay `position` en la geometría, el test falla con mensaje explícito. **No** pasa silenciosamente sobre una build degradada.
- **Tolerancia 5 cm** debajo de la cintura (un hem puede pasarse un poco; no es un panel caído). Ajustable en el test.

Modos esperados de fallo **hoy** (cualquiera invalida el DoD):

1. `expected ≥15 seams to form (...) got <N>` → causa probable: `#518` (auto-seams con edge names genéricos).
2. `<N> cloth vertices fell below waistY=...` → causa probable: `#531` directo (panels caídos) que a su vez sale de `#527` (coordenadas mal) + `#556` (placement círculo por categoría unknown).
3. `cloth mesh not exposed via window.__OPENCLO_CLOTH_MESH__` → la app no está exponiendo el observable; los tests existentes (`cloth-simulation.spec.ts`) sugieren que sí lo expone, pero verificar.
4. `male shirt template not found` → renombrado del catálogo; ajustar el matcher en el test.

## Estado de verificación

| Cambio | Verificado local | Cómo verificarlo |
|---|---|---|
| `vitest.config.ts` projects API | ❌ No (sandbox no soporta `npm ci`) | Tres loops bash arriba. |
| `package.json` test:e2e | ❌ No | `npm run test:e2e --help` o correr el spec directamente. |
| `ci.yml` validate sin exclude | ❌ No | Push a una rama; el job `validate` debe pasar 3 corridas seguidas. |
| `ci.yml` job `e2e` | ❌ No | El job debe aparecer en el primer push y correr rojo (esperado). |
| `dress-avatar-dod.spec.ts` | ❌ No | `npm run test:e2e -- dress-avatar-dod.spec.ts` debe fallar con uno de los 4 mensajes esperados. |

**Acción tuya, Samuel**: correr los pasos de verificación, reportar resultados. Si algo no cumple expectativa, ver sección siguiente.

## Si la fix no funciona

### Si las flakes de `seamly-heavy` persisten

Sub-fix más conservador: añadir margin a los timeouts:
- `tshirtMeshing.test.ts:84` — `{ timeout: 60000 }` → `{ timeout: 120000 }`.
- `cubicBezier.test.ts:55` — `}, 10000);` → `}, 30000);`.

Si AÚN persisten, mover todo el suite a `pool: 'forks'` con `singleFork: false` (cada test file en su propio proceso, pero paralelo). Performance hit del 20-30% en el suite completo. Aceptable como último recurso.

Si NADA funciona, atacar el sospechoso original (`maxPasses = 5` del `constructionResolver`): subir a 10 y agregar logging cuando se descarta una pieza por exceder el límite.

### Si el e2e falla por motivo no esperado

Modos esperados están en §4 arriba. Cualquier otro modo (ej. `template library never opens`, `Dress button not found`, `Redux store undefined`) indica que la app divergió de lo mapeado por la exploración inicial. En ese caso, abrir un sub-issue para reparar el bridge entre la UI y los observables, NO modificar el test rojo (sigue siendo el DoD correcto).

### Si el job CI `e2e` falla por infraestructura (no por el test)

Síntomas típicos: `chromium not found`, `webServer timed out`, `WebGL not available`. Mitigaciones:
- Cache miss → primer run lento (~2 min). Esperado.
- WebGL → la config ya usa `--use-gl=angle --use-angle=swiftshader`; debería bastar para ubuntu-latest.
- webServer timeout → subir `webServer.timeout` en `playwright.config.ts` de 15 s a 60 s para CI cold start.

## Próximos pasos del programa (recordatorio)

Con el paso 2 entregado y verificado, pasar al cluster #506:
1. `#527` — coordenadas pattern-space → piece-local (`useLineTool.ts:53-54`).
2. `#518` — auto-seams con edges reales (no genéricos).
3. `#556` — placement por categoría real (no fallback a círculo).
4. `#531` — verificación end-to-end (debería caer solo si los tres anteriores cierran).

Después de cada fix, el `dress-avatar-dod.spec.ts` debería pasar de rojo a verde gradualmente:
- Después de `#527`: probablemente todavía rojo, pero el modo de fallo cambia.
- Después de `#518`: assertion (a) (seam count) debería empezar a pasar.
- Después de `#556`: assertion (b) (vertex positions) debería pasar.
- Después de `#531`: todo verde 3 corridas seguidas → cerrar #506.

Cuando esté verde 3 corridas seguidas, el PR que cierra #506 debe también:
- Flip `continue-on-error: true` → `false` en `ci.yml` job `e2e`.
- Agregar `e2e` a `ci-success.needs`.
- Capturar baseline screenshot del dress vestido (opcional, segunda capa) y agregar `expect(page).toHaveScreenshot(...)` al final del test.

## Addendum 2026-05-18 v1.1 — fix del bridge app↔test

Primera verificación end-to-end (por agent con terminal access) produjo:

- ✅ Tarea 1 (`npm ci`): OK en 26 s.
- ✅ Tarea 2 (flakes): 0/0/0 FAILs. La fix de pool isolation funciona; sub-proyecto `seamly-heavy` aparece etiquetado en el output.
- ❌ Tarea 3 (e2e rojo): **bucket C inesperado**. Test murió en `beforeEach` con `Test timeout of 30000ms exceeded` esperando `window.__REDUX_STORE__`. **El bridge app↔test estaba roto desde el primer paso del test, antes de medir cualquier cosa del DoD.**
- ✅ Tarea 4 (CI yml): conceptualmente OK; un `grep` literal del protocolo no matcheó porque el job se llama `E2E (Playwright) — non-blocking until #506 closes` (mayúscula + texto más largo). Sin impacto.

Nota lateral: la verificación corrió con node v24.14.0; CI usa v22. Forward-compatible pero vale la pena consistencia (instalar nvm + `.nvmrc` con `22` en algún momento futuro — no es urgente).

### Causa raíz del bucket C

La exploración inicial de UI le pasó al test un nombre de observable incorrecto: dijo `window.__REDUX_STORE__` cuando el observable real es `window.__OPENCLO_STORE__`. Verificable en `src/store/index.ts:87` que lo expone incondicionalmente (sin guard de env). Usado también por `Viewport3D.tsx` (3 sitios) y `bundle-split.spec.ts`.

Origen del confuso: `cloth-simulation.spec.ts:83` sí menciona `__REDUX_STORE__`, pero ese spec es código stale y ese path nunca se ejerce con éxito. La exploración tomó esa mención como verdad.

Lección: cuando un observable es citado por un spec existente, **confirmarlo en `src/` antes** de extrapolar. Si está solo en el spec y no en `src/`, es stale.

### Fix aplicado

`tests/e2e/dress-avatar-dod.spec.ts`:
- Renombrado `__REDUX_STORE__` → `__OPENCLO_STORE__` en todos los sitios (TypeScript declaration + 3 callsites en `page.evaluate`).
- `beforeEach` ahora atrapa el timeout de `waitForFunction` y tira un error explícito apuntando a `src/store/index.ts:87` y a los otros specs que dependen del mismo observable. Cualquier regresión futura del bridge va a fallar con un mensaje accionable, no con "timeout exceeded".

### Re-verificación pedida

Samuel: correr **solo Tarea 3** del protocolo original (no hace falta repetir 1, 2, 4). Esperado ahora: el test entra al body, ejecuta el flow Load → Dress → assertions, y falla en bucket A o B (los esperados que apuntan a #518 / #527+#556+#531):

```bash
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Si vuelve a fallar en bucket C apuntando a `__OPENCLO_CLOTH_MESH__`, significa que la simulación nunca llega a montar el mesh — posiblemente porque el handler del botón "Dress" no se dispara correctamente sobre un proyecto cargado vía Template Library (vs. proyecto vacío). Eso sería un sub-bug a investigar antes de avanzar al #506. Reportá y paramos.

Si cae en bucket A o B → red de seguridad lista, podemos avanzar al cluster #506.

## Addendum 2026-05-18 v1.2 — fix de openTemplateLibrary

Segunda verificación end-to-end (post v1.1) produjo:

- ✅ `beforeEach` pasó (la fix v1.1 funcionó — `__OPENCLO_STORE__` es el nombre correcto).
- ❌ Test murió en `openTemplateLibrary` con click interceptado por el canvas SVG. **Bucket E, no esperado.**

### Causa raíz del bucket E

Mi función `openTemplateLibrary` original probaba 4 selectores en cascada, uno de los cuales era `getByRole('button', { name: /patterns?/i })`. Esa regex matcheó un `<button class="template-card">` que ya estaba renderizado en la página (carga inicial o panel auxiliar), no el botón para *abrir* la library. El canvas 3D (un `<rect>` SVG con `fill="url(#grid-large)"`) cubría la card, así que el click se interceptaba 39 veces y fallaba.

Lección **inversa** a la de v1.1: ahora exceso de defensividad mordió. Los 4 selectores fallback "por si la UI cambió" introdujeron false matches contra elementos similares. La lección: **fallbacks son defensa contra cambios, no contra desconocimiento del DOM**. Cuando no conocés el DOM, fallbacks fuzzy aumentan riesgo en vez de reducirlo.

### Fix v1.2 aplicado

Reescrita `openTemplateLibrary` para usar la **command palette** vía ⌘K (shortcut global registrado en `UnifiedBar.tsx:121`):

```ts
await page.keyboard.press('ControlOrMeta+k');
await page.waitForTimeout(150);  // espera al focus setTimeout
await page.keyboard.type('Load Template', { delay: 20 });
const cmdBtn = page.locator('button', { hasText: 'Load Template' }).first();
await cmdBtn.click();
await expect(page.locator('.template-overlay.open')).toBeVisible({ timeout: 5_000 });
```

Razones:
- "Load Template" es el `name` literal del comando registrado en `UnifiedBarCommands.tsx:28`. No colisiona con ningún texto de template card.
- El flow es deterministic: teclado → input → buscar → click. Sin DOM scanning fuzzy.
- Si algo del bridge se rompe (shortcut deshabilitado o comando renombrado), el test falla con mensaje explícito apuntando a los dos archivos a revisar.

### Por qué no usar el LogoMenu directamente

El LogoMenu (`src/components/shell/LogoMenu.tsx`) sí permite abrir la library — su item "Import Seamly2D Pattern..." llama `onOpenTemplates?.()`. Pero requiere: (a) click en el logo para abrir el dropdown, (b) hover/click en el item correcto. Más pasos, más estados intermedios. Command palette es 1 atajo + tipear + 1 click.

Por curiosidad: el `click-n-go.spec.ts` existente usa `button:has-text("Templates")` con `force: true`. Esa string no existe literal en ninguna parte del repo según `grep`. Probablemente ese spec también está roto, o usa una versión vieja de la UI. No vale la pena imitarlo.

### Re-re-verificación pedida

Mismo comando que la última vez:

```bash
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Esperado ahora: `openTemplateLibrary` pasa, `pickMaleShirtTemplate` pasa, `clickDressButton` pasa, y el test cae en bucket **A** (seam count) o **B** (cloth vertices below waist) — los dos modos que confirman que la red de seguridad está midiendo lo correcto y que los bugs downstream (#527/#518/#556/#531) siguen vivos.

Si cae en bucket A o B → red de seguridad lista, arrancamos #527. Si cae en cualquier otro bucket (C/D/E o nuevo) → reportar literal del último error y paramos sin improvisar.

## Addendum 2026-05-18 v1.3 — hardening de cold-start + mejor señal de mesh

Tercera verificación post-v1.2 produjo **dos modos de fallo en una sola ejecución**:

- Run 1 (9.3 s): fallo en `openTemplateLibrary` con timeout de 3 s — "Load Template" no apareció dentro del budget porque la app aún hidrataba. Race condition entre `page.keyboard.press('⌘K')` y el `useEffect` que registra el handler en `UnifiedBar.tsx:121`.
- Retry (19.8 s): UI completa funcionó, `simulationState === 'running'`, pero `__OPENCLO_CLOTH_MESH__` nunca apareció dentro del budget. El mensaje genérico ("cloth mesh not exposed") no diferenciaba entre "bug en el bridge app↔test" vs "el meshing pipeline efectivamente falló y no produjo mesh".

### Causas raíz

**Issue 1 (cold-start race).** Mi `beforeEach` v1.1 esperaba solo a `__OPENCLO_STORE__`, que se setea al cargar el módulo `src/store/index.ts:87` — antes de que React renderee siquiera. El handler de ⌘K se registra en un `useEffect` de `UnifiedBar`, que corre después del primer commit. Hay una ventana de varios cientos de ms donde el store existe pero el listener no.

**Issue 2 (mesh ambiguo).** Mi assertion final asumía que si `__OPENCLO_CLOTH_MESH__` no estaba, el bridge estaba roto. Pero en realidad puede no estar porque la simulación nunca produjo un mesh (meshing falló silenciosamente, pieces no se pudieron triangular, etc.) — y eso **es la señal correcta del DoD fallando**, no un bug del test. Necesitamos distinguir esto del bridge roto.

### Fix v1.3 aplicado

**Two-stage hydration wait en `beforeEach`**:

```ts
await page.waitForFunction(() => Boolean(window.__OPENCLO_STORE__), ...);
await expect(page.locator('.floating-3d__pill').first()).toBeVisible({ timeout: 10_000 });
```

El `.floating-3d__pill` (el botón "Dress") es parte de `FloatingControls3D`, sibling de `UnifiedBar` en el shell. Si está visible, `UnifiedBar` también montó → listener de ⌘K registrado → seguro abrir command palette.

**Bumps de timeout en `openTemplateLibrary`**: `waitForTimeout` post-⌘K subido de 150 → 300 ms; locator timeout subido de 3 → 8 s. Cold-start con GPU/WASM init compitiendo por el main thread puede demorar varios cientos de ms.

**Nuevo helper `waitForClothMeshOrFail`** reemplaza el `waitForTimeout(10s)` + check del verdict. Hace `page.waitForFunction(() => Boolean(window.__OPENCLO_CLOTH_MESH__?.geometry), { timeout: 10000, polling: 250 })`. Si nunca aparece, tira un error que incluye snapshot de estado (`simulationState`, `pieces.length`, `seams.length`) y la explicación de que **esto mismo es una falla del DoD** — likely el meshing pipeline falló silenciosamente, lo cual es el bug más upstream que el cluster #527/#518/#556 puede producir.

### Re-re-re-verificación pedida

```bash
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Modos posibles ahora (todos accionables, ninguno ambiguo):

- **A: ≥15 seams no formados** → causa probable #518, baseline counter útil.
- **B: cloth vertices below waist** → causa probable #531 directo, baseline de N vértices caídos.
- **C: cloth mesh nunca apareció + state snapshot** → causa probable meshing pipeline broken, baseline de cuántos pieces/seams se generaron antes de fallar el meshing. Esta es ahora una falla **clara y accionable** del DoD, no un bug del test.
- Cualquier otro → reportar y parar.

Todos los modos A/B/C son **válidos como señal del DoD**. La elección entre ellos dice cuál bug del cluster #506 muerde primero. Anotar el modo + las cifras concretas (seams, vértices caídos, simulationState etc.) — eso es el baseline desde el cual mediremos progreso cuando fixeemos #527.

### Si todavía es flaky run vs retry

Si después de v1.3 sigue habiendo modo distinto entre run y retry, el problema no es ya el test — es que la app misma tiene non-determinismo en el pipeline (probable: WASM init asíncrono, GPU detection variable, etc.). Eso lo dejamos abierto y arrancamos #527 igual: la red de seguridad es "el test debe fallar consistentemente con el mismo bucket en 3 runs consecutivas", no "el test debe ser pixel-perfect determinístico antes de que arreglemos los bugs upstream".

## Addendum 2026-05-18 v1.4 — baseline establecido, red de seguridad lista

Verificación post-v1.3: **6/6 corridas idénticas bit-a-bit** (3 ejecuciones × run + retry). Determinismo perfecto.

### Baseline DoD actual

| Métrica | Valor | Implicación |
|---|---|---|
| Bucket | **B** (todas las 6 mediciones) | Físico, no estructural |
| Cloth vertices below waistY | **4195** | Es el contador maestro de progreso |
| waistY (Mannequin reference) | 1.044 m | Constante, ~58% de avatar height |
| Lowest vertex Y | 0.837 m | Cae 20 cm bajo la cintura |
| Drop relativo | ~20% del waist height | Significativo, no marginal |
| Tiempo por attempt | ~30 s | Estable run-to-run |
| Mensaje | `4195 cloth vertices fell below waistY=1.044 (lowest vertex at Y=0.837). This is the canonical #531 symptom — pieces falling as loose panels.` | Exactamente lo previsto |

### Inferencia importante sobre el cluster #506

El assertion de seam count (bucket A) **se chequea antes** que el de vertex Y (bucket B) en el código del test. Como vemos consistentemente el mensaje de B y nunca el de A, **A pasa**: el male shirt sí forma ≥15 seams bajo el código actual.

Eso significa que **#518** (auto-seams con edge names genéricos) **no es el bottleneck para este patrón en particular**. Lo que muerde primero es la física: las piezas se ensamblan pero caen a través del avatar.

Hipótesis (no verificada todavía) sobre el orden de impacto del cluster #506:
1. **#527 (coords pattern-space → piece-local)** — probablemente el más upstream; si las coords están mal interpretadas, las piezas parten en posiciones incorrectas y caen.
2. **#556 (placement por categoría → círculo)** — relacionado: si la app no sabe que es un shirt, lo posiciona como genérico (círculo en el suelo).
3. **#531** — síntoma observable de #527 + #556.
4. **#518** — probablemente aparece después de que B esté arreglado, como bucket A en otros patrones.

Esta hipótesis es testeable: cuando fixees #527, el bucket debería seguir siendo B pero con menor N de vértices caídos (o lowestY más cerca de waistY). Si fixeás #527 y N=4195 se mantiene, #527 no era el dominante. Iteración guiada por el número.

### Progreso esperado del baseline

Como referencia visual de progreso:

```
Baseline (hoy):     4195 vértices bajo waist, lowestY = 0.837 m (Δ = 0.207 m bajo)
Después de #527:    ¿?         (esperado: N baja o lowestY sube)
Después de #527+#556: ¿?       (esperado: N baja más)
Después de #531 (real fix):  0  (debería pasar a verde)
Después: bucket A puede aparecer si #518 no resuelto en otros patrones.
```

Cuando el N llegue a 0 (o lowestY ≥ waistY - 0.05) en 3 corridas seguidas, #506 está cerrado y se promueve a CI gate (flip `continue-on-error: false` + `e2e` en `ci-success.needs`).

### Estado del paso 2 — cerrado

Todos los items entregados, verificados y deterministas:

- ✅ Flakes #631 fixed (vitest projects API): 0/0/0 FAILs en 50 corridas totales.
- ✅ `npm run test:e2e` script existe.
- ✅ Job CI `e2e` configurado (no-blocking hasta cerrar #506).
- ✅ Test rojo del DoD escrito, determinístico, con baseline numérico y mensaje accionable.
- ✅ Tres lecciones aprendidas registradas (v1.1 store name, v1.2 fallback fuzzy = riesgo, v1.3 cold-start race).

**Listo para arrancar el cluster #506 cuando Samuel diga.** El primer issue por ROI según el informe original era #527 (`useLineTool.ts:53-54`, estimado 2 días, ROI 10.0).

## Notas para el agent con GitHub access (si querés publicar este step)

Hay tres acciones posibles en GitHub asociadas a este step. Las dejo opcionales — el doc local es la entrega, GitHub es metadata:

1. **Comentar en #631** (el issue que el CI yml rastrea): "addressed by vitest.config.ts projects API (PR pending); verification pending Samuel local 20-run loop." Linkear este doc.
2. **Comentar en #506**: "e2e DoD encoded as `tests/e2e/dress-avatar-dod.spec.ts`, intentionally red. Cierre del epic implica este test 3 verdes consecutivas en CI."
3. **NO crear issue nuevo** por esto — todo es follow-up de issues existentes.
