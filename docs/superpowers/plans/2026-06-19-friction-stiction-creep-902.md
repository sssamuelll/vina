# Fricción con stiction (creep/slide-off del drape #902) — Implementation Plan

> ⚠️ **SUPERSEDED en parte (2026-06-19) — leer la enmienda de la spec antes de
> usar este plan.** Este plan describe el modelo **A1** (Coulomb puro,
> `scale = min(friction*pushDist/|t|, 1)`) y la red E2E con banda de tolerancia.
> A1 **falló empíricamente en GPU real** (rompió el asentamiento) y fue
> reemplazado por el modelo **HYBRID** `scale = min(1, max(friction, friction*pushDist/|t|))`.
> Además los valores esperados de los unit tests aquí (p.ej. 0.994, 0.9625) son
> de A1 y **NO** corresponden al código mergeado, y la red E2E a 10s quedó en
> **log-only** (no banda) por el no-determinismo del drape. Para lo que de verdad
> se construyó y por qué, ver la **"Enmienda 2026-06-19"** en
> `docs/superpowers/specs/2026-06-19-friction-stiction-creep-902-design.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detener el creep/slide-off de la prenda añadiendo stiction de Coulomb (Macklin, 1 coeficiente) al modelo de fricción de contacto avatar↔tela, en los dos kernels que sí tienen collider de avatar (TSL = tier default, CPU = espejo), preservando su paridad.

**Architecture:** Ambos kernels hoy hacen `pos -= friction * t` (filtro 60%-pass, sin umbral → creep monótono). Se reemplaza la *aplicación* por el clamp canónico de PBD `scale = min(friction * pushDist / |t|, 1)`, presupuestando la corrección tangencial por la profundidad de corrección normal (`pushDist`). `scale==1` ⇒ stick total (sin creep); `<1` ⇒ deslizamiento cinético. El tangencial `t` y `pushDist` ya están calculados y en scope en ambos kernels; solo cambian las 3 líneas de aplicación. Se reutiliza el coeficiente `friction = 0.4` existente (cero plumbing nuevo).

**Tech Stack:** TypeScript, Three.js TSL (WebGPU node shaders), Vitest (unit), Playwright (E2E `@gpu-local`). Sin Rust/WASM.

## Global Constraints

- **Typecheck:** `npx tsc -b --noEmit` (build mode), NUNCA `tsc --noEmit` a secas.
- **No bypass de gates:** prohibido `--no-verify`. El pre-commit hook corre `npx tsc -b --noEmit` + `npx lint-staged` (eslint `--max-warnings=0` sobre `*.{ts,tsx}` staged).
- **Gate completo antes de cerrar:** `npx tsc -b --noEmit && npm run test && npm run lint`.
- **No se toca Rust/WASM:** ningún cambio en `crates/` → sin rebuild de WASM, sin sync de binarios `public/wasm/`.
- **Paridad TSL↔CPU:** el modelo aplicado a `tslCollision.ts` y `triangleCollision.ts` debe ser idéntico (preserva el invariante `// matches CPU triangleCollision.ts`).
- **Rama:** `fix/902-friction-stiction-creep` (ya creada y con el spec commiteado).

---

## Task 1: CPU kernel — fricción Coulomb con stiction (TDD)

El kernel CPU `solveTriangleCollision` es testeable de punta a punta (Vitest, sin device). Se hace primero: sus tests fijan el contrato A1 que el kernel TSL espeja en Task 2.

**Files:**
- Modify: `src/utils/cloth/triangleCollision.ts:311-323` (bloque de fricción)
- Test: `src/utils/cloth/__tests__/triangleCollision.test.ts` (añadir suite stiction; corregir 3 aserciones de magnitud)

**Interfaces:**
- Consumes: nada de tasks previas.
- Produces: el **contrato A1** que Task 2 espeja — `scale = min(friction * pushDist / max(|t|, 1e-8), 1)`, aplicado como `pos -= t * scale`. Firma de `solveTriangleCollision` **sin cambios** (los callers CPU + el pase inicial de `wasmSolverWorker` siguen llamándola igual; solo cambia la magnitud de la atenuación tangencial, no el gate `friction > 0 && prevPos`).

- [ ] **Step 1: Escribir los tests de stiction que fallan (rojo)**

Añadir al final de `src/utils/cloth/__tests__/triangleCollision.test.ts`, después de la línea 304 (cierre del `describe` de BUG-2):

```ts
// El fix de #902: la fricción de contacto pasa de un filtro 60%-pass (que deja
// creep monótono) a Coulomb position-based con stiction. El presupuesto de la
// corrección tangencial es friction*pushDist; cuando supera el slide tangencial,
// se remueve el 100% (la tela se pega en vez de reptar).
describe('solveTriangleCollision — Coulomb stiction (#902)', () => {
  it('removes a small tangential slide entirely (stiction — no creep)', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    // Penetración 0.01 ⇒ pushDist = margin + 0.01 = 0.015.
    // Slide tangencial 0.003 < friction*pushDist (0.4*0.015 = 0.006) ⇒ scale=1 ⇒ stick.
    const pos = new Float32Array([0.003, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0.4, prevPos);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[0]).toBeCloseTo(0, 4); // pegado — sin creep
  });

  it('lets a large tangential slide slip kinetically (scale = friction*pushDist/|t|)', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    // Slide 1.0 ≫ pushDist 0.015 ⇒ scale = 0.4*0.015/1 = 0.006 (régimen cinético).
    const pos = new Float32Array([1.0, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0.4, prevPos);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[0]).toBeCloseTo(1.0 - 0.4 * 0.015, 4); // 0.994 — lejos del viejo 0.6
  });
});
```

- [ ] **Step 2: Correr los tests de stiction y verificar que fallan**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts -t "Coulomb stiction"`
Expected: FAIL. El modelo viejo deja `pos[0] = 0.003 * (1-0.4) = 0.0018` (no ≈0) en el test de stiction, y `pos[0] = 1.0 * (1-0.4) = 0.6` (no ≈0.994) en el cinético.

- [ ] **Step 3: Corregir las 3 aserciones de magnitud que el modelo viejo codifica**

Estas pasan hoy con el 60%-pass; bajo A1 cambian de valor. Hay que actualizarlas (si no, fallan al implementar A1).

**3a.** En el test `'applies friction to tangential velocity when prevPos provided'` (líneas ~157-170), reemplazar la última aserción:

```ts
    // ANTES:
    // X should be partially dampened: original slide was 1.0, friction 0.5 removes half
    // expect(pos[0]).toBeCloseTo(0.5, 1);
    // DESPUÉS (Coulomb #902): cinético = friction*pushDist removido del slide.
    // pushDist = margin + 0.01 = 0.015, |t| = 1.0 ⇒ removido = 0.5*0.015 = 0.0075.
    expect(pos[0]).toBeCloseTo(1.0 - 0.5 * 0.015, 3); // 0.9925
```

**3b.** En el test `'friction > 0 with prevPos provided attenuates tangent displacement (positive control)'` (líneas ~230-243), reemplazar el bloque de comentario + la aserción final:

```ts
    expect(pos[1]).toBeCloseTo(MARGIN, 3);
    // Coulomb (#902): régimen cinético (slide 1.0 ≫ depth 0.015). Atenúa, pero
    // NO con el viejo 60%-pass — lo removido es friction*pushDist.
    expect(pos[0]).toBeLessThan(SLIDE_X); // atenuado
    expect(pos[0]).toBeGreaterThan(0);    // no sobre-clampeado
    expect(pos[0]).toBeCloseTo(SLIDE_X - 0.5 * 0.015, 3); // 0.9925
```

**3c.** En el test `'5-pass loop with refreshed prevPos attenuates inter-iteration tangent drift'` (líneas ~272-303), reemplazar las dos últimas aserciones (líneas ~301-302):

```ts
    expect(withoutFriction[0]).toBeCloseTo(1.0, 5); // 5 * 0.2 sin damping
    // Coulomb (#902): cada pase remueve friction*pushDist = 0.5*0.015 = 0.0075
    // del slide de 0.2 (régimen cinético). 1.0 − 5*0.0075 = 0.9625.
    expect(withFriction[0]).toBeCloseTo(0.9625, 3);
```

- [ ] **Step 4: Correr el archivo de tests completo y verificar que las 3 corregidas + las 2 de stiction ahora fallan (rojo coherente)**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: FAIL en los 5 tests tocados (2 stiction nuevos + 3 magnitud corregidas). El resto (gate de BUG-2, push normal, pinned, etc.) sigue verde.

- [ ] **Step 5: Implementar A1 en el kernel**

En `src/utils/cloth/triangleCollision.ts`, reemplazar el bloque de fricción (líneas 311-323):

```ts
      // ANTES:
      // // Position-based friction: dampen tangential displacement
      // if (friction > 0 && prevPos) {
      //   const dx = pos[pi] - prevPos[pi];
      //   const dy = pos[pi + 1] - prevPos[pi + 1];
      //   const dz = pos[pi + 2] - prevPos[pi + 2];
      //   const vn = dx * bestNx + dy * bestNy + dz * bestNz;
      //   const tx = dx - vn * bestNx;
      //   const ty = dy - vn * bestNy;
      //   const tz = dz - vn * bestNz;
      //   pos[pi]     -= friction * tx;
      //   pos[pi + 1] -= friction * ty;
      //   pos[pi + 2] -= friction * tz;
      // }

      // Coulomb position-based friction con stiction (#902). La corrección
      // tangencial se presupuesta por la profundidad de corrección normal
      // (pushDist): cuando friction*pushDist ≥ |t|, se remueve el slide
      // tangencial completo (contacto estático — la tela se pega en vez de
      // reptar); si no, desliza cinéticamente. min(·,1) mantiene la corrección
      // ≤ el slide → no inyecta energía (PBD-safe). Espejo: gpu/tslCollision.ts.
      if (friction > 0 && prevPos) {
        const dx = pos[pi] - prevPos[pi];
        const dy = pos[pi + 1] - prevPos[pi + 1];
        const dz = pos[pi + 2] - prevPos[pi + 2];
        const vn = dx * bestNx + dy * bestNy + dz * bestNz;
        const tx = dx - vn * bestNx;
        const ty = dy - vn * bestNy;
        const tz = dz - vn * bestNz;
        const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const scale = Math.min((friction * pushDist) / Math.max(tLen, 1e-8), 1);
        pos[pi]     -= tx * scale;
        pos[pi + 1] -= ty * scale;
        pos[pi + 2] -= tz * scale;
      }
```

(`pushDist` es la `let` definida en la línea 300 y clampeada a `MAX_PUSH_DIST` en la 305 — ya en scope en este bloque.)

- [ ] **Step 6: Correr el archivo de tests y verificar verde**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: PASS — todos los tests, incluidos los 2 de stiction nuevos, los 3 de magnitud corregidos, y toda la suite de gate de BUG-2 (#605) intacta.

- [ ] **Step 7: Typecheck + lint del archivo y commit**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

```bash
git add src/utils/cloth/triangleCollision.ts src/utils/cloth/__tests__/triangleCollision.test.ts
git commit -m "fix(902): Coulomb stiction in CPU triangle-collision friction

Replace the 60%-pass tangential damping with a depth-budgeted Coulomb
clamp (scale = min(friction*pushDist/|t|, 1)). Below the static threshold
the full tangential slide is removed, so resting cloth sticks instead of
creeping off the avatar. Gate (friction>0 && prevPos) unchanged; BUG-2
(#605) regression suite intact. Tests updated to the Coulomb contract.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: TSL kernel — espejo del modelo A1 (tier default de producción)

El kernel TSL es el que corren los usuarios. Su unit test (`tslCollision.test.ts`) es **estructural** (mockea `three/tsl` con chain-proxies, no ejecuta la matemática), así que no hay aserción de magnitud que actualizar — la verificación de comportamiento del tier GPU es el E2E de Task 3. Esta task espeja exactamente el cambio de Task 1.

**Files:**
- Modify: `src/utils/cloth/gpu/tslCollision.ts:615-628` (bloque de fricción)

**Interfaces:**
- Consumes: el contrato A1 de Task 1 (mismo `scale = min(friction*pushDist/max(|t|,1e-8), 1)`).
- Produces: paridad TSL↔CPU restaurada. Firma de `createTslCollisionBody` **sin cambios**.

- [ ] **Step 1: Implementar A1 en el kernel TSL**

En `src/utils/cloth/gpu/tslCollision.ts`, reemplazar el bloque de fricción (líneas 615-628):

```ts
          // ANTES:
          // // Position-based friction (matches CPU triangleCollision.ts:312–323).
          // If(uFriction.greaterThan(float(0)), () => {
          //   const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
          //   const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
          //   const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);
          //   const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
          //   const tx = dx.sub(vn.mul(nnx));
          //   const ty = dy.sub(vn.mul(nny));
          //   const tz = dz.sub(vn.mul(nnz));
          //   posBuf.element(i).x.subAssign(uFriction.mul(tx));
          //   posBuf.element(i).y.subAssign(uFriction.mul(ty));
          //   posBuf.element(i).z.subAssign(uFriction.mul(tz));
          // });

          // Coulomb position-based friction con stiction (#902) — espejo de CPU
          // triangleCollision.ts. Presupuesta la corrección tangencial por la
          // profundidad de corrección normal (pushDist): scale = min(μ·depth/|t|, 1).
          // scale==1 ⇒ stick total (sin creep); <1 ⇒ deslizamiento cinético.
          // Div-guard branch-free vía max(|t|, 1e-8) (si |t|→0 el slide ya es ~0).
          If(uFriction.greaterThan(float(0)), () => {
            const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
            const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
            const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

            const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
            const tx = dx.sub(vn.mul(nnx));
            const ty = dy.sub(vn.mul(nny));
            const tz = dz.sub(vn.mul(nnz));

            const tLen = tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz)).sqrt();
            const scale = uFriction.mul(pushDist).div(tLen.max(float(1e-8))).min(float(1.0));

            posBuf.element(i).x.subAssign(tx.mul(scale));
            posBuf.element(i).y.subAssign(ty.mul(scale));
            posBuf.element(i).z.subAssign(tz.mul(scale));
          });
```

(`pushDist` es el `toVar('pushDist')` de la línea 600, clampeado a `MAX_PUSH_DIST` y en scope dentro del `If(pushDist.greaterThan(float(0)))` que envuelve este bloque. `.mul/.div/.min/.max/.sqrt/.add/.sub` ya se usan en este mismo archivo — p.ej. `.sqrt()` línea 582, `.min(float(...))` línea 603, `.max(float(0))` línea 606.)

- [ ] **Step 2: Typecheck + correr el unit test estructural de TSL**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslCollision.test.ts`
Expected: PASS — los pins estructurales (atomic buffers, BVH traversal, NaN guard) no dependen del cuerpo de la fricción; siguen verdes.

- [ ] **Step 3: Lint + commit**

Run: `npm run lint`
Expected: sin warnings (eslint `--max-warnings=0`).

```bash
git add src/utils/cloth/gpu/tslCollision.ts
git commit -m "fix(902): mirror Coulomb stiction into TSL collision kernel

Default production tier. Same depth-budgeted Coulomb clamp as the CPU
kernel (Task 1), preserving the 'matches CPU triangleCollision.ts'
parity invariant. Verified end-to-end by the webgpu-maria-replay E2E.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Red de regresión E2E (#912) + tuning de umbrales

Convierte el creep-watch mudo a asserts con banda de tolerancia, y fija los valores finales del run verde post-fix. Este test es `@gpu-local`: necesita GPU real, headed; **CI nunca lo corre** → debe ejecutarse en una máquina con GPU.

**Files:**
- Modify: `tests/e2e/webgpu-maria-replay.spec.ts:196-204` (creep-watch → asserts) y el bloque de cabecera (líneas 14-18, la nota "sin assert")

**Interfaces:**
- Consumes: el fix de Task 1 + Task 2 (la prenda ya no se escurre a 10s).
- Produces: gate de regresión que falla si el creep regresa.

- [ ] **Step 1: Convertir el creep-watch en asserts con banda de tolerancia**

En `tests/e2e/webgpu-maria-replay.spec.ts`, reemplazar el bloque de las líneas 196-204:

```ts
    // ANTES:
    // // Largo horizonte (600 frames = 10s de sim): SOLO registro, sin assert.
    // // El creep lento pre-existente (issue #902) hace que belowHip/minY
    // // degraden a partir de ~3s de sim en todos los márgenes — esto es la
    // // evidencia que lo monitorea, no un veredicto del tier GPU.
    // await waitForSimWindows(page, 20, 120_000);
    // const creep = await readDrape(page);
    // console.log(
    //   `[creep-watch] simSeconds=10 belowHipPct=${creep!.belowHipPct.toFixed(2)} minY=${creep!.minY.toFixed(3)} maxY=${creep!.maxY.toFixed(3)} nan=${creep!.nan} (issue #902)`,
    // );

    // Largo horizonte (600 frames = 10s de sim): RED DE REGRESIÓN del fix de
    // stiction (#902 / #912). Banda de tolerancia relativa al checkpoint M4 de
    // 2.5s (`drape`): la prenda asentada NO debe degradarse a 10s. Banda (no
    // umbral absoluto) para sobrevivir el caos de float run-to-run en la
    // selección de triángulo de contacto.
    await waitForSimWindows(page, 20, 120_000);
    const creep = await readDrape(page);
    console.log(
      `[creep-watch] simSeconds=10 belowHipPct=${creep!.belowHipPct.toFixed(2)} minY=${creep!.minY.toFixed(3)} maxY=${creep!.maxY.toFixed(3)} nan=${creep!.nan} (issue #902)`,
    );
    expect(creep).not.toBeNull();
    expect(creep!.nan).toBe(0);
    expect(creep!.belowHipPct).toBeLessThanOrEqual(drape!.belowHipPct + 3);
    expect(creep!.minY).toBeGreaterThanOrEqual(drape!.minY - 0.1);
    expect(creep!.maxY).toBeGreaterThan(1.3);
```

- [ ] **Step 2: Actualizar la nota de cabecera (honestidad del doc)**

En el bloque de comentario de cabecera (líneas ~14-18), reemplazar la frase que dice que el creep se registra "sin assert":

```ts
 * checkpoint real del estándar (la prenda asentada tras cerrar costuras),
 * y ahí se ancla el assert: 150 frames acumulados = 2.5s de sim. El creep
 * lento (#902) se ARREGLÓ con stiction de Coulomb; a 10s de sim hay una red
 * de regresión con banda de tolerancia relativa al checkpoint de 2.5s (#912).
```

- [ ] **Step 3: Correr el E2E en una máquina con GPU y leer los números**

Run: `npm run test:e2e:gpu -- webgpu-maria-replay`
Expected: PASS en `'drape M4 en tier webgpu'`. En la salida, leer las dos líneas:
- `[drape-m4] simSeconds=2.5 belowHipPct=… minY=… maxY=…`
- `[creep-watch] simSeconds=10 belowHipPct=… minY=… maxY=… nan=0`

Confirmar que se cumple la banda: `creep.belowHipPct ≤ drape.belowHipPct + 3`, `creep.minY ≥ drape.minY − 0.1`, `creep.maxY > 1.3`, `nan=0`. Si el fix funciona, los números de 2.5s y 10s deben ser casi iguales (sin degradación).

- [ ] **Step 4: Fijar los umbrales finales con margen sobre el run verde**

Si los deltas observados (10s vs 2.5s) son holgadamente menores que `+3 / −0.1`, dejar la banda como está (cubre la varianza). Si están al borde, ampliar el delta lo justo para dar margen documentado al ruido run-to-run — pero NUNCA tanto que deje pasar un slide-off (la señal de bug es `belowHipPct` saltando decenas de puntos y `minY` cayendo bajo ~0.5). Anotar inline el run de referencia:

```ts
    // Banda fijada del run verde post-fix (YYYY-MM-DD): a 10s, belowHipPct=<v>
    // (Δ≈<d> vs 2.5s) y minY=<v> (Δ≈<d>). La banda da margen al ruido de float.
```

(Reemplazar `<v>`/`<d>`/fecha con los valores reales del run.)

- [ ] **Step 5: Commit del E2E**

```bash
git add tests/e2e/webgpu-maria-replay.spec.ts
git commit -m "test(912): assert no drape creep at 10s sim (regression for #902)

Convert the silent creep-watch into a tolerance-band assert relative to
the 2.5s M4 checkpoint: belowHipPct, minY, maxY, nan. The band absorbs
run-to-run float chaos without letting a slide-off through. @gpu-local
(real GPU, never runs in CI). Thresholds fixed from the post-fix green run.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Gate completo final**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: todo verde. (El E2E `@gpu-local` no entra en `npm run test`; ya se corrió en Step 3.)

---

## Self-Review

**1. Spec coverage:**
- Fix A1 en TSL (default prod) → Task 2. ✓
- Fix A1 en CPU (espejo paridad) → Task 1. ✓
- Reutiliza `friction=0.4`, sin uniforms nuevos → el código de ambas tasks no añade params. ✓
- `prevPos`/`pushDist` ya en scope → confirmado en ambos kernels (líneas citadas). ✓
- Unit rojo-primero en CPU → Task 1 Steps 1-6. ✓
- Unit TSL estructural, sin red de magnitud → Task 2 Step 2 (nota explícita). ✓
- E2E #912 con banda de tolerancia → Task 3. ✓
- Fuera de alcance (collision.wgsl legacy, WASM) → no aparece ninguna task que los toque. ✓
- Paridad preservada, sin doc de ratificación nuevo → ninguna task crea `docs/reports/`. ✓
- Verificación de cierre → Task 3 Step 6. ✓

**2. Placeholder scan:** Los únicos `<…>` son en Task 3 Step 4 (valores del run verde que sólo existen tras ejecutar en GPU) — es un dato empírico legítimo, no un placeholder de lógica; el step dice exactamente qué medir y cómo decidir. Sin TODO/TBD en código.

**3. Type consistency:** `solveTriangleCollision` y `createTslCollisionBody` mantienen su firma (sin cambios). El contrato A1 (`scale = min(friction*pushDist/max(|t|,1e-8), 1)`) es idéntico literal entre Task 1 (JS) y Task 2 (TSL nodes). Nombres `pushDist`, `tLen`, `scale`, `tx/ty/tz` consistentes en ambos.
