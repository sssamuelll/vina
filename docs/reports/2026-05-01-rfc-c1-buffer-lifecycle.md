# C1 RFC — Three.js buffer lifecycle (`useMemo` geometry pattern)

**Fecha:** 2026-05-01
**Eje:** C1 (drift-axis category (c) — RFC scope per `2026-04-28-drift-fase2-classification.md`).
**Branch:** `drift/c1-rfc-buffer-lifecycle`.
**Status:** RFC en redacción incremental. Sec 1+2 en este commit; Sec 3+ en commits subsiguientes.

**Cross-refs (input docs):**
- `docs/reports/2026-04-28-c1-rfc-input-bug9-analysis.md` — input doc generated during BUG-9 (#612) inline fix; documents the 5 leak sites repaired.
- `docs/reports/2026-04-28-drift-fase2-classification.md` — places C1 in (c) RFC bucket with framing "Post-BUG-9: patrón canónico (`useDisposableGeometry` o equivalente) tiene varios shapes válidos con tradeoffs distintos."
- `docs/reports/2026-04-29-drift-inventory-addendum.md` § 7 — confirms C1 has concrete input data from BUG-9 (5 sites).
- BUG-9 fix commit (`f6c974f1` — "fix: BUG-9 inline dispose for Three.js geometry leaks at 5 sites (#612)").

---

## 1. Decide / NO-decide

### 1.1 Lo que C1 decide

C1 RFC decide tres cosas, en orden de carga arquitectónica:

1. **Helper extraction shape para el `useMemo + new BufferGeometry` lifecycle pattern.** El pattern se observa en 7 sitios del codebase (5 ya inline-fixed por BUG-9 + 2 missed sites identificados en el sweep refresh). La pregunta es: ¿extraer un helper, y de qué shape (`useDisposableGeometry`, `useDisposable`, disposer-ref, hybrid 2-tier, etc.); o ratificar el inline pattern como canónico?

2. **Cleanup en los 2 missed leak sites.** El sweep extension encontró 2 sitios estructuralmente idénticos a los 5 BUG-9 sites pero NO incluidos en el inventario del fix: `SelectedVertexRenderer.tsx:14` y `ClothMesh.tsx:382`. Independiente de la opción del helper, estos sitios necesitan cleanup. Esta es una sub-decisión menor pero real — Pattern 2.5 extend coverage gap.

3. **Documentation strategy.** Cómo documentar la convention canónica (JSDoc, CLAUDE.md sección, inline comments, all of the above) para que future devs no introduzcan nuevos leak sites sin cobertura.

### 1.2 Lo que C1 explícitamente NO decide

C1 mantiene scope acotado a `useMemo + new BufferGeometry` lifecycle. No decide:

- **Materials lifecycle.** Sites como `EdgeHighlight.tsx:44-68` (LineBasicMaterial wrapped en Line) y `GarmentSimulation.tsx:608-622` (TSL `MeshStandardNodeMaterial`) usan un pattern distinto — `useEffect`-based, NO `useMemo`-based. La creation, use, y disposal viven dentro del mismo `useEffect` callback. Esto es una abstraction shape ortogonal al pattern en scope; un helper único distorsionaría ambos.

  **Rationale paralelo a D7 (ValidationDiagnostic vs Diagnostic):** cuando dos representations tienen lifecycles ortogonales (severity sets, anchor models, type fields semantics distintos), unificar fuerza shared fields que son inestables sin habilitar shared utility real. Mismo razonamiento aplica acá: las semantics del `useMemo geometry` lifecycle (recreación on dep change + cleanup on dep change OR unmount) y del `useEffect material` lifecycle (creation + side effects + cleanup, todo coordinado en el mismo effect) son ortogonales. Son la misma "cleanup hygiene" solo a nivel de slogan; a nivel de API, son hooks distintos.

- **Texture lifecycle.** `TextureManager` (`src/utils/textures/TextureManager.ts`) es un singleton service con LRU dispose pattern propio. Out of scope absoluto — different architectural concern (caching), not lifecycle hook extraction. El consumer pattern (`GarmentSimulation.tsx:645-673`) consume textures pooled, no crea instances per render.

- **Module-level singleton geos/materials.** Sites como `PinRenderer.tsx:26-45` y `AnchorPoints.tsx:141-142` definen geometry + materials a nivel de módulo, intencionalmente nunca disposed (alive for app lifetime). Out of scope — es shared-instance pattern, no lifecycle pattern.

- **Function-scoped transient objects.** Exporters (`stillExporter.ts:49,105,121`, `animationExporter.ts:46,153`), `bvh.ts:95,199`, `meshImporter.ts:233-237`, y `commandsToShape` helper interno de `ClothMesh.tsx:177-198` crean geometry + dispose dentro del mismo function call. Out of scope — no es lifecycle, es resource management dentro de un scope local.

- **Worker/client `.dispose()` pattern.** `useSimulationLifecycle.ts`, `useMeshing.ts`, `wasmSolverClient.ts`, `clothWorkerClient.ts`, etc. usan el método `.dispose()` por convention pero gestionan Web Worker lifecycle, no Three.js GPU resources. Misma palabra, distinto domain.

- **Ref-based dispose pattern (Sew3DTool).** `Sew3DTool.tsx:77-98` (PiecePickMesh) usa un pattern ref-based `useMemo + prevGeoRef + useEffect-on-unmount`. Es older idiom que predates BUG-9 fix. Funcionalmente correcto pero shape distinto. Si C1 elige una opción que cubre este shape uniformly, se puede migrar opportunistically; si no, se queda as-is (mismo precedente que el array `.find()` de B2-state — no migrar retroactively, prefer el canonical en new code).

### 1.3 Reopen triggers anticipados (preview, formal en Sec 7)

- Si emerge drift similar en materials/textures con N≥3 sites uncovered, abrir RFC dedicado o extender C1 con sub-decision dedicada.
- Si el helper canónico (cualquier shape) genera lint rule follow-up que captura false positives persistentes, reopen.
- Si un nuevo Three.js disposable shape emerge (RenderTarget en useMemo, ShaderMaterial en useMemo, etc.) que no encaja en ninguna de las 3 variations BUG-9 inventoriadas, reopen.

---

## 2. Estado actual

### 2.1 Pre-existing canonical infrastructure check (regla 1 v2)

**0 hooks `useDisposable*` existentes.** Verificación:

```bash
grep -rln "useDisposable\|useGeometryLifecycle" src/
# (no output)
```

**0 lifecycle helper modules** dedicados a Three.js disposables.

**TextureManager (`src/utils/textures/TextureManager.ts`)** existe como singleton service con LRU dispose, pero su concern es caching + dedup de texture loads, NO lifecycle hook extraction. Out of scope per § 1.2.

**Conclusion:** C1 propone un canonical donde no existe pre-existing canonical. No hay riesgo de duplicar infraestructura ya disponible (a diferencia de B12-state donde `newProjectRegistry.ts` pre-existía y ratificación absorbió el eje). Decision real-fix vs ratify-only depende del análisis de las opciones en Sec 3, no de pre-existencia.

### 2.2 Inventory completo: 7 sites del `useMemo + new BufferGeometry` lifecycle pattern

El input doc BUG-9 inventarió **5 sites**. El sweep refresh para C1 (siguiendo regla 1 v2/v3 — read contents, look outside obvious directory, verify divergence) encontró **2 missed sites** con structurally identical shape.

| # | Sitio | Tipo geometry | Shape | Status post-BUG-9 |
|---|---|---|---|---|
| 1 | `Mannequin.tsx:96-104` (bodyGeometry) | `THREE.LatheGeometry` | pure recipe (single non-null) | ✅ inline cleanup (line 104) |
| 2 | `Mannequin.tsx:106-113` (standGeometry) | `THREE.LatheGeometry` | pure recipe (single non-null, deps `[]`) | ✅ inline cleanup (line 113) |
| 3 | `FloorGrid.tsx:28-72` (`{fineGeo, sectionGeo}`) | 2× `THREE.BufferGeometry` | multi-geo coupled (one useMemo, two outputs) | ✅ inline cleanup (line 72) |
| 4 | `PieceMesh.tsx:107-128` (geometry) | `THREE.ShapeGeometry \| null` | nullable (degenerate outline → null) | ✅ inline cleanup (line 128) |
| 5 | `GarmentSimulation.tsx:197-269` (staticGeometry) | `THREE.BufferGeometry \| null` (wrapped en `{ staticGeometry }` object) | nullable + wrapper-object destructure | ✅ inline cleanup (line 269) |
| **6** | **`SelectedVertexRenderer.tsx:14-35`** (geometry) | `THREE.BufferGeometry \| null` | **nullable** | ❌ **NO cleanup — leak** |
| **7** | **`ClothMesh.tsx:382-392`** (staticGeometry) | `THREE.BufferGeometry` (stored in `geometryRef.current`) | **mutate-in-place + recreate-on-deps-change** | ❌ **NO cleanup — leak** |

**Variation distribution post-sweep:**

- Pure recipe (single non-null): 2/7 (Sites 1, 2).
- Multi-geo coupled: 1/7 (Site 3).
- Nullable: 3/7 (Sites 4, 6, plus Site 5 nullable + wrapper).
- Wrapper-object destructure: 1/7 (Site 5).
- Mutate-in-place + ref store: 1/7 (Site 7) — newly identified shape, not in BUG-9 inventory.

**Inventory drift overestimation pattern aplicado a la inversa:** el sub-sweep BUG-9 fue contextual al fix puntual (regla 1 v3 sub-rule — sub-sweeps son contextuales, no autoritativos). El sweep autoritativo de C1 RFC encuentra +40% sitios. Esto NO invalida el BUG-9 fix — sirvió su propósito en context (5 sites con cleanup pendiente, no parálisis por completeness). Pero confirma que el inventario inicial era lower bound, no upper bound, y que los 2 missed sites entran legítimamente al scope de C1.

#### 2.2.1 Site 6 — `SelectedVertexRenderer.tsx:14`

```tsx
// src/components/Viewport3D/SelectedVertexRenderer.tsx (lines 10-35)
export default function SelectedVertexRenderer({ livePositions }: Props) {
  const selectedVertices = useSelector((s: RootState) => s.simulation.selectedVertices);
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    if (!livePositions || selectedVertices.length === 0) return null;
    // ... (build positions array from selected indices) ...
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [livePositions, selectedVertices]);

  if (!geometry) return null;
  // ... no useEffect cleanup for geometry ...
}
```

Shape idéntico a Site 4 (PieceMesh nullable): `useMemo` returns `BufferGeometry | null`, deps `[livePositions, selectedVertices]`. Cuando la selección cambia (user click) o `livePositions` se actualiza, useMemo recomputa, generando new BufferGeometry. La previa queda dangling sin cleanup.

#### 2.2.2 Site 7 — `ClothMesh.tsx:382`

```tsx
// src/components/Viewport3D/ClothMesh.tsx (lines 226, 382-392)
const geometryRef = useRef<THREE.BufferGeometry | null>(null);
// ...
const staticGeometry = useMemo(() => {
  if (!meshData) return null;

  const geo = new THREE.BufferGeometry();
  const posArray = new Float32Array(meshData.vertices);
  geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geo.setIndex(new THREE.BufferAttribute(meshData.triIds, 1));
  geo.computeVertexNormals();
  geometryRef.current = geo;
  return geo;
}, [meshData]);
// ... no useEffect cleanup for staticGeometry ...
```

Shape novel respecto al BUG-9 inventory: el geometry se almacena en `geometryRef.current` Y se retorna del useMemo. Otros effects más abajo en el componente (lines 248, 264, 327-339) **mutate** `geometryRef.current` per-frame durante simulation (positions update, fit map color attribute). Cuando `meshData` cambia (topology change, e.g., remesh), useMemo recomputa, el nuevo geo se asigna a `geometryRef.current`, y el geo previo queda dangling sin dispose.

Esta es una **sub-variation novel** que el BUG-9 inventory no inventarió: combination de "geometry mutated in-place + recreated on topology change". El cleanup shape (single `useEffect(() => () => geo.dispose(), [staticGeometry])`) es idéntico al pure-recipe case — la complejidad de la mutation in-place no afecta el dispose contract, porque dispose libera GPU resources independientemente de cómo se haya usado el geometry en JS.

### 2.3 Pattern landscape adyacente (out-of-scope per § 1.2)

Para evitar premature scope creep y preservar focus en geometries lifecycle, los siguientes patterns adyacentes se documentan acá como contexto pero quedan fuera del scope de C1.

#### 2.3.1 Material lifecycle (`useEffect` pattern, distinct shape)

**`EdgeHighlight.tsx:44-68`** — `useMemo` crea `THREE.Line` wrapping `BufferGeometry + LineBasicMaterial`; `useEffect` cleanup dispone ambos:

```tsx
const lineObj = useMemo(() => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
  matRef.current = mat;
  return new THREE.Line(geo, mat);
}, [outline, edge]);

useEffect(() => {
  return () => {
    if (lineObj) {
      lineObj.geometry.dispose();
      (lineObj.material as THREE.Material).dispose();
    }
  };
}, [lineObj]);
```

Funcionalmente correcto pero shape compuesto: el cleanup dispone geometry + material en pareja porque el wrapped Line es la unidad de lifecycle. Si C1 eligiera Opción E (disposer-ref que cubre cualquier `{ dispose(): void }`), este sitio podría migrar uniformly. Si elige Opción B (`useDisposableGeometry` específico), se queda inline. Decisión deferred a Sec 3.

**`GarmentSimulation.tsx:608-624`** — `useEffect` (NO `useMemo`) crea `MeshStandardNodeMaterial` con state setter:

```tsx
useEffect(() => {
  const solver = tslSolverRef.current;
  if (!solver || !staticGeometry) {
    setTslMaterial(null);
    return;
  }
  const mat = new MeshStandardNodeMaterial();
  mat.positionNode = solver.positionBufNode.toAttribute();
  // ... (configure mat) ...
  setTslMaterial(mat);

  return () => {
    mat.dispose();
    setTslMaterial(null);
  };
}, [tslSolverRef.current, staticGeometry]);
```

Shape ortogonal al `useMemo` pattern: creation + side-effect (state setter) + cleanup todo coordinado en un solo `useEffect`. No es candidate para `useDisposableGeometry`-style helper porque no hay separation entre "compute value" y "register cleanup". Este es el ejemplo canónico del por qué C1 NO decide materials lifecycle: la abstraction shape natural es distinta.

#### 2.3.2 Texture lifecycle — singleton service

`TextureManager` (`src/utils/textures/TextureManager.ts`) gestiona pool LRU de Three.js textures con dedup + automatic dispose on eviction. Consumers (`GarmentSimulation.tsx:645-673`) llaman `textureManager.load(url)` y reciben referencias compartidas; las textures NO son instances per-render, son pooled.

Out of scope absoluto. Si emerge drift en cómo los consumers manejan las references retornadas (e.g., setState vs ref vs prop), eso es D8/E-async-states sub-track territory, no C1.

#### 2.3.3 Module-level singletons (intentionally never disposed)

`PinRenderer.tsx:26-45`:
```tsx
const pinGeo = new THREE.CircleGeometry(PIN_RADIUS, 16);
const pinMatActive = new THREE.MeshBasicMaterial({ ... });
const pinMatSelected = new THREE.MeshBasicMaterial({ ... });
const pinMatWeak = new THREE.MeshBasicMaterial({ ... });
```

`AnchorPoints.tsx:141-142`:
```tsx
const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 16);
const circleMat = new THREE.MeshBasicMaterial({ ... });
```

Shared instances reused across all rendered pins/anchors. Lifetime = app lifetime. NO leak — by design. Out of scope; ratificado as legitimate pattern para "icon/marker rendering with high N count where per-instance creation would itself be the leak".

#### 2.3.4 Function-scoped transient

Exporters, `bvh.ts:95-199`, `meshImporter.ts:233-237`, y el `commandsToShape` helper interno de `ClothMesh.tsx:177-198` (líneas 177→197 — `geo = new THREE.ShapeGeometry(...); ...; geo.dispose(); return { vertices, triIds }`): geometry creada, usada como fuente de extracción, dispuesta inmediatamente en el mismo function call. NO es lifecycle — es resource management dentro de un function scope local.

Distinción clave: estos sitios NO retornan el geometry al React tree; lo consumen y desechan. C1 no aplica.

#### 2.3.5 Ref-based useMemo (Sew3DTool — older idiom)

`Sew3DTool.tsx:77-98` (PiecePickMesh):

```tsx
const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);
const geometry = useMemo(() => {
  if (prevGeoRef.current) prevGeoRef.current.dispose();   // ← dispose previous
  const shape = commandsToShape(piece.outline);
  if (!shape) { prevGeoRef.current = null; return null; }
  const geo = new THREE.ShapeGeometry(shape, 32);
  // ... (modify geo) ...
  prevGeoRef.current = geo;
  return geo;
}, [piece.outline]);

useEffect(() => {
  return () => { if (prevGeoRef.current) prevGeoRef.current.dispose(); };  // ← dispose on unmount
}, []);
```

Funcionalmente equivalente a Sites 1-5 BUG-9 cleanup, pero shape distinto: el dispose vive dentro del `useMemo` (next-iteration cleanup) + dentro de un `useEffect` con deps `[]` (unmount cleanup). El shape BUG-9 inline (`useEffect(() => () => geo.dispose(), [geo])`) hace ambas cosas en una sola línea aprovechando el dep tracking de useEffect.

Decisión candidate: si C1 elige una opción uniform (E), Sew3DTool puede migrar opportunistically al canonical (find-and-replace style, similar a la regla "when a callsite is touched for another reason, prefer the selector" de B2-state). Si C1 elige status-quo o helper específico, queda as-is.

### 2.4 Leak shape verification — structural reasoning, no profile required

**Premise:** `useMemo(() => new THREE.BufferGeometry(), [deps])` sin `useEffect` cleanup acoplado leakea cada vez que `[deps]` cambia. La GPU buffer queda allocated; el JS reference se libera but no triggers WebGL `deleteBuffer`. Three.js requires explicit `.dispose()` para liberar GPU resources.

Esto es structural — no depende de la rate de cambio de `[deps]`. La fix shape (add `useEffect(() => () => geo.dispose(), [geo])`) es idéntica independientemente de la frequency de leaks.

**Documentation honest del rate per site (input directo de Sam, recorded verbatim 2026-05-01):**

> Leak rate depende de stability de deps. SelectedVertexRenderer:14 re-crea geometry on every selection change (per click); ClothMesh:382 re-crea on meshData change (per topology change in cloth). Neither is per-frame, but accumulated leaks compound across user session. Fix shape (add useEffect cleanup) is identical regardless of rate.

**Per-site rate analysis:**

| Site | Trigger de re-creation | Frequency típica | Leak compound rate |
|---|---|---|---|
| 1 (Mannequin body) | `[measurements]` change | Per avatar adjustment (low) | Low |
| 2 (Mannequin stand) | `[]` (deps empty) | Solo on unmount (no recreation) | Zero |
| 3 (FloorGrid) | `[size, cellSize, sectionEvery]` | Settings change (very rare) | Zero practical |
| 4 (PieceMesh geometry) | `[piece.outline]` | Per-edit en pattern outline (medium) | Medium |
| 5 (GarmentSimulation static) | `[pieceMeshes, activePieces, avatarMeasurements]` | Per simulation init / piece toggle (low-medium) | Low-medium |
| **6 (SelectedVertexRenderer)** | `[livePositions, selectedVertices]` | **Per vertex selection click (medium); per simulation frame if selected** | **Medium-high during simulation with selection** |
| **7 (ClothMesh staticGeometry)** | `[meshData]` | **Per remesh / topology change (low-medium)** | **Low-medium** |

Sites 6 y 7 — los missed — tienen rates variable pero accumulating: Site 6 puede leak per frame si user mantiene selection durante sim; Site 7 leakea on every remesh of an active piece.

**No profile run.** Structural verification es suficiente. La discipline correcta acá: la fix shape no cambia, el documentary value es para future devs entendiendo severity sin overstating it.

### 2.5 Adjacent fix precedent — BUG-1 small adapter pattern

El input doc BUG-9 menciona BUG-1 fix (commit `ed632b9`, #604) como adjacent precedent: agregó WASM-side `bendRestDistances` helper como localized adapter — different concern (WASM bridge) but same pattern decision shape ("small adapter at the boundary" vs "shared helper across many sites").

Para C1, este precedent es relevant en Sec 3 evaluation: BUG-1 eligió localized helper porque el adapter cross-language tiene coupling tighten al boundary específico. ¿C1 tiene un equivalent boundary que justifique localized vs shared? El answer depende de cuán similar son las 7 sites en API surface — Sec 3 lo articula formalmente.

---

## 3. Sub-decisiones

Tres sub-decisiones ortogonales. **Cada una se decide independientemente**: helper extraction shape (3.1), cleanup at missed sites (3.2), documentation strategy (3.3). El agent puede elegir Opción A para 3.1 y aún así adoptar 3.2 + 3.3, o cualquier combinación.

### 3.1 Helper extraction shape (las 6 opciones)

#### 3.1.0 Pre-requisito — site shape decomposition explícita

Antes de articular las opciones, mapear cada site a su shape canónica. La decomposition decide qué tan competitive son las opciones helper-friendly (B/F) vs uniform (E) vs status-quo (A).

| Shape | Sites | Helper-friendly? |
|---|---|---|
| Pure recipe (single non-null) | 1, 2 | ✅ Yes — fits `T = factory()` cleanly |
| Nullable | 4, 6 | ⚠️ Yes con variant `T \| null` |
| Multi-geo coupled | 3 | ❌ No — splitting useMemo decouples lifecycle artifically |
| Nullable + wrapper destructure | 5 | ❌ No — forcing helper changes return shape |
| Mutate-in-place + ref store | 7 | ❌ No — helper internalizes geo, breaks `geometryRef.current` consumers |

**Decomposition counts:**

- **Helper-friendly** (pure or nullable variant): **4/7** (Sites 1, 2, 4, 6).
- **Helper-awkward**: **3/7** (Sites 3, 5, 7).

Esto NO es un gap dramatic (4 vs 3 ≈ 57% vs 43%). Per Sam's matrix:
- Si N >> M → F (helper for common case + inline for variations) gana.
- Si N ≈ M o M > N → E (uniform disposer-ref) o A (no helper) ganan.

4/7 vs 3/7 es **N ≈ M**. La decision space queda abierta entre F (asumiendo el ergonomic gain on majority justifica el split convention), E (uniform), A (no helper, just close the gaps).

#### 3.1.1 Opción A — Status quo + cleanup at 2 missed sites

**Shape:** ratificar el inline pattern de BUG-9 fix como canonical. Add cleanup en Sites 6, 7. No introducir helper.

```tsx
// Canonical pattern (per-site):
const geometry = useMemo(() => new THREE.BufferGeometry(), [deps]);
useEffect(() => () => geometry.dispose(), [geometry]);

// Nullable variant:
const geometry = useMemo(() => /* may return null */ null, [deps]);
useEffect(() => () => { geometry?.dispose(); }, [geometry]);

// Multi-geo coupled (Site 3):
const { fineGeo, sectionGeo } = useMemo(() => /* ... */, [deps]);
useEffect(() => () => { fineGeo.dispose(); sectionGeo.dispose(); }, [fineGeo, sectionGeo]);
```

**Pros:**
- Zero abstraction overhead.
- Zero migration cost (5 BUG-9 sites already in this shape).
- Each site is fully transparent — newcomer reads the pattern in place, no helper to grep.
- Generalizable to materials/textures lifecycle in future without API change (it's just "useEffect cleanup").

**Cons:**
- Convention enforcement is by code review only. No grep-able canonical helper name → newcomers can introduce new leak sites without it being caught by lint.
- Discoverability low. A newcomer searching "how do I dispose Three.js geometry in this codebase" finds N inline patterns, not 1 documented helper.
- Repetition cost: 2 lines per site, every site (5 + 2 = 7 sites currently, growing as Three.js usage grows).

**Per-site applicability:** ✅ all 7 sites uniform.

#### 3.1.2 Opción B — `useDisposableGeometry<T>(factory, deps): T` (pure recipes only)

**Shape:** narrow helper, pure recipe only.

```tsx
function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T,
  deps: React.DependencyList,
): T {
  const geometry = useMemo(factory, deps);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

// Sites 1, 2 migrate cleanly:
const bodyGeometry = useDisposableGeometry(() => {
  const points = buildProfile(measurements).map(p => new THREE.Vector2(p.radius, p.y));
  const geo = new THREE.LatheGeometry(points, 48);
  geo.computeVertexNormals();
  return geo;
}, [measurements]);
```

**Pros:**
- 1 line per site (Sites 1, 2 only).
- Discoverable: grep `useDisposableGeometry` finds canonical sites.
- Lint rule potencial: "any useMemo creating `new THREE.*Geometry` should use this helper."

**Cons (per-site evidence, NO descarte arbitrario):**
- **Site 3 (FloorGrid multi-geo coupled):** would have to call helper twice with split useMemo, which:
  - Duplicates the dep array (current: 1× `[size, cellSize, sectionEvery]`; would become 2×).
  - Decouples geos that ARE coupled in real lifecycle (they always change together because they're produced by the same shared computation).
  - Forces re-running the shared loop building both arrays, doubling work.
  - **Awkward shape preserved → Site 3 stays inline.**
- **Site 4 (PieceMesh nullable):** factory signature `() => T` doesn't accept null. Caller would either:
  - Throw on null (bad — null is legitimate for degenerate outline).
  - Wrap with separate null check + bypass helper.
  - **Awkward shape preserved → Site 4 stays inline OR helper needs nullable variant (B').**
- **Site 5 (GarmentSimulation nullable + wrapper):** same as Site 4 plus wrapper-object destructure forced to change shape (`const { staticGeometry } = ...` → `const staticGeometry = ...`). The wrapper exists because the useMemo originally returned multiple values; even if currently only `staticGeometry`, changing it is local refactor for no helper benefit.
  - **Awkward shape preserved → Site 5 stays inline.**
- **Site 6 (SelectedVertexRenderer nullable):** same as Site 4.
  - **Awkward shape preserved → Site 6 stays inline OR B' nullable variant.**
- **Site 7 (ClothMesh mutate-in-place + ref):** factory creates geo, helper returns it. But other useEffects in the component need `geometryRef.current` (line 337: per-frame position mutation; line 372: fit map color attribute). Caller would have to manually `geometryRef.current = staticGeometry;` after the hook call — but that's a side-effect outside any effect, anti-pattern equivalent to current code (already has the smell).
  - **Awkward shape preserved → Site 7 stays inline.**

**Per-site applicability:** ✅ 2/7 (Sites 1, 2). ❌ 5/7 awkward.

#### 3.1.3 Opción B' — Nullable-aware variant `useDisposableGeometry<T>(factory: () => T | null, deps): T | null`

**Shape:** B with nullable factory return type.

```tsx
function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T | null,
  deps: React.DependencyList,
): T | null {
  const geometry = useMemo(factory, deps);
  useEffect(() => () => { geometry?.dispose(); }, [geometry]);
  return geometry;
}
```

**Pros:** covers Sites 1, 2, 4, 6 (4/7 helper-friendly).

**Cons:** Sites 3, 5, 7 same awkwardness as B.

**Per-site applicability:** ✅ 4/7 (Sites 1, 2, 4, 6). ❌ 3/7 awkward.

(B' is essentially the "F common case helper". Articulated separately because F also includes "ratify inline for variations" as part of the convention.)

#### 3.1.4 Opción C — Generalized `useDisposable<T>(factory, deps, disposer?)`

**Shape:** factory accepts arbitrary T, optional custom disposer for non-Three.js cases.

```tsx
function useDisposable<T>(
  factory: () => T,
  deps: React.DependencyList,
  disposer?: (value: T) => void,
): T {
  const value = useMemo(factory, deps);
  useEffect(() => {
    return () => {
      if (disposer) disposer(value);
      else if (value && typeof (value as { dispose?: () => void }).dispose === 'function') {
        (value as { dispose: () => void }).dispose();
      }
    };
  }, [value]);
  return value;
}

// Site 3 with multi-geo via custom disposer:
const { fineGeo, sectionGeo } = useDisposable(
  () => /* ... */,
  [size, cellSize, sectionEvery],
  ({ fineGeo, sectionGeo }) => { fineGeo.dispose(); sectionGeo.dispose(); }
);

// Site 5 with wrapper:
const { staticGeometry } = useDisposable(
  () => /* ... */,
  [pieceMeshes, activePieces, avatarMeasurements],
  ({ staticGeometry }) => { staticGeometry?.dispose(); }
);
```

**Pros:**
- Single helper covers all variants via the optional `disposer` arg.
- Generalizable to materials/textures/render-targets uniformly.
- The "what to dispose" logic stays at call site (callers know their structure).

**Cons:**
- API surface ambiguous: when do you pass a disposer? When does default work? Newcomers must learn both code paths.
- TypeScript inference: `T` may be a structural type; the runtime `typeof X.dispose === 'function'` check is a duck-type smell — no compile-time guarantee.
- Sites 1, 2 (pure recipe) gain no convenience over A — same number of lines.
- Site 7 still problematic: helper internalizes creation; caller still needs to wire `geometryRef.current` separately.
- Magic level high: the default disposer behavior (ducktype check) is subtle and easy to miss when reading.

**Per-site applicability:** ✅ 6/7 with custom disposer for variations. ❌ Site 7 still awkward (ref-store concern unsolved).

#### 3.1.5 Opción D — Hybrid 2-tier (`useDisposableGeometry` simple + `useDisposable` low-level)

**Shape:** RTK precedent (createSlice high-level + createReducer low-level). Simple helper for common case, escape hatch for variations.

```tsx
// Tier 1: simple (covers Sites 1, 2, 4, 6)
function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T | null,
  deps: React.DependencyList,
): T | null { /* same as B' */ }

// Tier 2: low-level escape hatch (covers Sites 3, 5, 7)
function useDisposable<T>(
  value: T | null,
  deps: React.DependencyList,
  disposer: (value: T) => void,
): void {
  useEffect(() => {
    return () => { if (value) disposer(value); };
  }, deps);  // eslint-disable-line react-hooks/exhaustive-deps
}
```

**Pros:**
- Common case stays ergonomic (1 line).
- Escape hatch articulated as 1st-class API, not as "fall back to inline".
- Discoverable: 2 helpers to grep, both documented.
- RTK pattern precedent in the React ecosystem.

**Cons:**
- 2 helpers to maintain + 2 doc surfaces.
- Choice paralysis: when to use which? Convention needed (e.g., "use simple unless your site has multi-geo / wrapper / external ref").
- Sites 3, 5, 7 use Tier 2 which is structurally similar to inline cleanup of A — minor real benefit over A for those sites.

**Per-site applicability:** ✅ 4/7 Tier 1, ✅ 3/7 Tier 2 (with caveat that Site 7 still has the ref-store concern but Tier 2 doesn't internalize creation, so the ref pattern stays as-is).

#### 3.1.6 Opción E — Disposer-ref hook (caller computes, hook registers)

**Shape:** caller computes the value via useMemo (or useState, or useRef — any source), hook just registers cleanup.

```tsx
function useDisposable<T extends { dispose(): void }>(value: T | null | undefined): void {
  useEffect(() => {
    return () => { value?.dispose(); };
  }, [value]);
}

// Site 1:
const bodyGeometry = useMemo(() => {
  const points = buildProfile(measurements).map(p => new THREE.Vector2(p.radius, p.y));
  const geo = new THREE.LatheGeometry(points, 48);
  geo.computeVertexNormals();
  return geo;
}, [measurements]);
useDisposable(bodyGeometry);

// Site 3 (multi-geo coupled):
const { fineGeo, sectionGeo } = useMemo(() => /* ... */, [deps]);
useDisposable(fineGeo);
useDisposable(sectionGeo);

// Site 4 (nullable):
const geometry = useMemo(() => /* may return null */, [piece.outline]);
useDisposable(geometry);  // null-safe via TS type

// Site 5 (nullable + wrapper):
const { staticGeometry } = useMemo(() => /* ... */, [deps]);
useDisposable(staticGeometry);

// Site 7 (mutate-in-place + ref):
const staticGeometry = useMemo(() => /* ... + geometryRef.current = geo */, [meshData]);
useDisposable(staticGeometry);  // ref store stays as-is
```

**Pros:**
- **Uniform across all 7 sites** — heterogeneity en creation, not en cleanup.
- Low-magic: caller controls the value, hook just registers a disposer for it. No factory abstraction.
- Generalizable to materials/textures/render-targets without API change (any `{ dispose(): void }` works).
- Site 7's `geometryRef.current = geo` smell stays as-is (it's an existing code smell, orthogonal to C1) but doesn't block helper adoption.
- Multi-geo Site 3: caller calls `useDisposable(fineGeo); useDisposable(sectionGeo);` — two cleanup registrations, semantically equivalent to current `useEffect(() => () => { a.dispose(); b.dispose(); })`. No artifical decoupling.
- Lint rule follow-up: "every useMemo creating `new THREE.*Geometry` (or `Material`, etc.) should be paired with `useDisposable(value)`".

**Cons (honest tradeoff per Sam tactical heads-up):**
- **2 lines per site instead of 1** (vs Opciones B/B'/D Tier 1 that return the value). Visual cost on common case (Sites 1, 2 pure recipes).
  ```tsx
  // Opción E: 2 lines per site
  const geometry = useMemo(() => new BufferGeometry(...), [deps]);
  useDisposable(geometry);

  // Opción F (B' + ratify inline for variations): 1 line on common case
  const geometry = useDisposableGeometry(() => new BufferGeometry(...), [deps]);
  ```
- Discoverability cost: caller must remember to call `useDisposable(value)` after every useMemo. The omission produces the SAME bug as today (silent leak). Mitigation: lint rule.
- For Sites 1, 2 pure recipes (the 2/7 simplest case), the 2-line cost is real ergonomic regression vs B/B'/F where the helper returns the value.

**Per-site applicability:** ✅ all 7 sites uniform.

#### 3.1.7 Opción F — Hybrid helper for common case + ratify inline for variations + cleanup gaps

**Shape:** B' nullable-aware helper, used for Sites 1, 2, 4, 6. Sites 3, 5, 7 stay inline. 2 missed sites get inline cleanup added (overlap with 3.2).

```tsx
function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T | null,
  deps: React.DependencyList,
): T | null { /* same as B' */ }

// Sites 1, 2, 4, 6 — 1 line:
const bodyGeometry = useDisposableGeometry(() => {
  const points = ...; const geo = new THREE.LatheGeometry(points, 48); geo.computeVertexNormals(); return geo;
}, [measurements]);

// Sites 3, 5, 7 — stay inline (canonical inline pattern documented):
const { fineGeo, sectionGeo } = useMemo(() => /* ... */, [deps]);
useEffect(() => () => { fineGeo.dispose(); sectionGeo.dispose(); }, [fineGeo, sectionGeo]);
```

**Pros:**
- Ergonomic 1-line on majority case (4/7 sites).
- Variations get explicit ratification of inline pattern (no awkward forced fit).
- Convention split is articulated: "use helper for pure or nullable; inline for multi-geo / wrapper / external ref".
- Lint rule still possible: "any `useMemo creating new THREE.BufferGeometry` returning a single geo or single nullable geo should use the helper".

**Cons:**
- 2 conventions in the codebase (helper for common, inline for variations). Newcomer must learn the boundary rule.
- Lint rule for split convention is harder to write than uniform "always use useDisposable".
- The 4 vs 3 split is not overwhelming; the "common case wins" argument depends on whether 4/7 majority is enough to justify the split.
- If new sites emerge that fall into the variations bucket (multi-geo, wrapper, ref), the inline pattern continues to grow — convention drift risk over time.

**Per-site applicability:** ✅ 4/7 helper. ✅ 3/7 inline (canonically).

#### 3.1.8 Comparison summary table

| Opción | Shape | Sites helper | Sites inline | Lines per site (helper) | Lines per site (variation) | Generalizable to materials/textures? | Lint enforceability |
|---|---|---|---|---|---|---|---|
| A | inline only | 0/7 | 7/7 | n/a | 2 | ✅ (no API change) | ❌ (no canonical name) |
| B | helper pure-only | 2/7 | 5/7 | 1 | 2 | ⚠️ partial | ⚠️ partial |
| B' | helper nullable-aware | 4/7 | 3/7 | 1 | 2 | ⚠️ partial | ⚠️ partial |
| C | generalized `useDisposable(factory, deps, disposer?)` | 6/7 | 1/7 (Site 7) | 1-3 | 2 | ✅ | ⚠️ ducktype magic |
| D | 2-tier (simple + low-level) | 4/7 + 3/7 | 0/7 | 1 / 2-3 | n/a | ✅ | ⚠️ choice rule |
| E | uniform `useDisposable(value)` | 7/7 | 0/7 | 2 | n/a | ✅ | ✅ uniform |
| F | hybrid (B' + ratify inline) | 4/7 | 3/7 | 1 | 2 | ⚠️ partial | ⚠️ partial |

**Note on "generalizable to materials/textures":** out of scope per § 1.2 but relevant as a tiebreaker if multiple opciones score similarly. ✅ means: if a future RFC extends to materials, the API doesn't need to change. ⚠️ means: API would need a parallel helper or extension.

#### 3.1.9 Decision space narrowed

Per Sam tactical recommendation post-Sec-2 + per the decomposition above:

- **B alone is dominated by B'** (B' covers strictly more sites with the same shape). B is articulated only as a stepping stone to understand B'.
- **C (generalized factory + disposer)** carries ducktype magic + Site 7 ref-store concern unsolved + no convenience win over A on Sites 1-2. **Likely rejected**.
- **D (2-tier)** has the same shape as F but with the variations promoted to a formal Tier 2 helper. **D vs F is essentially the same recommendation** with different doc surface. Decision is style preference: "2 helpers" vs "1 helper + ratified inline".
- **A, E, F** are the three contenders with substantive shape differences:
  - A (no helper) — minimal, status quo + close gaps.
  - E (uniform `useDisposable(value)`) — uniform, low-magic, generalizable.
  - F (hybrid helper + inline) — ergonomic on majority, convention split.

Sec 4 (next commit) gives the consolidated recommendation across A vs E vs F (with D as variant of F).

### 3.2 Cleanup at 2 missed sites — independent decision

**Shape:** add `useEffect(() => () => { geometry?.dispose(); }, [geometry]);` at `SelectedVertexRenderer.tsx:35` (after the useMemo) and `ClothMesh.tsx:392` (after the staticGeometry useMemo).

**Cost:** ~6 líneas total (3 per site including comment + import if needed).

**Confidence en leak shape:** structural (per § 2.4). No profile required.

**Independence from 3.1:** the cleanup addition is required regardless of helper extraction shape. If 3.1 selects:
- **A**: cleanup is the entire 3.1 + 3.2 work.
- **B/B'/F**: cleanup at the 2 sites uses the inline shape (since Site 6 is nullable and Site 7 is ref-store, both helper-awkward in some opciones).
- **E**: cleanup at the 2 sites uses `useDisposable(geometry)` after the useMemo.

**Recommendation (intrinsic to 3.2):** ratify the cleanup additions as immediate scope of C1 RFC implementation, regardless of 3.1 outcome. Pattern 2.5 extend mínimo. Sec 4 articulates the integration.

### 3.3 Documentation strategy

**Shape:** ratify-by-default per audit pattern. Three layers:

1. **JSDoc on the canonical helper** (if 3.1 selects helper extraction): describe usage, the 7 site shapes covered, when to use the helper vs inline, examples.
2. **CLAUDE.md section** (similar to existing sections like "Persistence policy", "Cascade middleware patterns", "Fabric assignment patterns"): canonical pattern + decision rule + reopen triggers + cross-ref to this RFC.
3. **Inline comments at site-of-introduction** (when a new dev adds a Three.js disposable): brief reminder + grep-able convention name.

**Cost:** ~50-80 lines combined (docstring + CLAUDE.md section + inline). Out of scope for Sec 3 articulation; wired up in Sec 5 migration plan.

**No alternative articulated** — documentation strategy is the tail of every drift audit closure. No reason to deviate from precedent.

---

---

## 4. Recomendación consolidada

### 4.1 Decision summary

**Sub-decisión 3.1 (helper extraction shape):** **Opción E — disposer-ref hook `useDisposable(value)`.**

**Sub-decisión 3.2 (cleanup at 2 missed sites):** **adopt** — cleanup added as part of the migration (orthogonal to 3.1 outcome).

**Sub-decisión 3.3 (documentation strategy):** **adopt 3-layer ratify-by-default** (JSDoc + CLAUDE.md section + inline comments at site-of-introduction).

**Confidence: medium-high.** A y F son alternative defendibles con tradeoffs genuinos. La calibración honest está en § 4.5.

**Razones para E (en orden de importancia, NO inflated):**

1. **Uniform pattern across 7 sites + future.** Heterogeneity en creation, NO en cleanup. E refleja esa estructura: caller computes the value as they need (pure / nullable / multi / wrapper / ref-store), hook just registers a disposer. Sin awkward fit en ningún site.

2. **2-line ergonomic cost is bounded.** Vs F's 1-line on common case, E adds 1 extra line per site (4 of the 7 sites). Cost: 4 lines total. Permanent. Vs the F gain: 4 lines saved en common case. **Net ergonomic delta: zero.** F's "common case wins" argument depends on cognitive value of "1-line", not on line count math.

3. **Lint rule enforceable (uniform shape).** "Every `useMemo` creating `new THREE.*Geometry` should be paired with `useDisposable(value)` on the same component" is a uniform structural pattern catchable by AST analysis. F's lint rule must distinguish helper-friendly vs helper-awkward sites by inspecting the useMemo body — significantly harder, more false-positive prone.

4. **Future generalization to materials/textures (bonus, secondary).** Out of scope per § 1.2 — not deciding argument. But noted: if a future RFC extends to materials/textures lifecycle, E's API doesn't change (the hook accepts any `{ dispose(): void }`). F would need a parallel `useDisposableMaterial`. Bonus, not primary.

### 4.2 Why not A or F (rejected con respect)

#### A rejected (con respect)

A counter-arguments are real and defendible:

- N=7 sites is small; helper extraction can look like over-engineering.
- 5/7 sites already inline-fixed correctly post-BUG-9; pattern exists, just needs enforcement + docs.
- Zero abstraction cost.
- Audit philosophy minimal-fix: real problem is 2 missed leaks (3.2) + docs (3.3); helper is "nice to have", not required.

**Why E wins over A:**

E captures the disposable pattern **explicitly** as a 1st-class API. A leaves it as **convention to memorize** — newcomer reads the pattern in place, but does not see that the pattern is canonical. The risk profile differs:

- Under A, a new site introduced by a newcomer who didn't read every Viewport3D component first will silently leak (same shape as Sites 6, 7 missed by the BUG-9 fix). Code review catches it sometimes, lint rule under A is harder to write because there's no canonical helper name to anchor on.
- Under E, the convention is `if you create a Three.js disposable in a component, call useDisposable(value)`. Greppable. Lint-rule-able. Discoverable.

The 2-line cost of E is paid **once per site, upfront**, for **permanent discoverability**. The 7 current sites are small but the pattern grows as Three.js usage grows — A scales linearly with new-leak risk; E scales with bounded line count.

#### F rejected (con respect)

F counter-arguments are real and defendible:

- 4/7 = 57% sites benefit from helper. Coverage is meaningful, not edge case.
- Visual "1 line per common case" tiene cognitive value real, especially para readers nuevos.
- Mixed pattern (helper + inline) **es como humans naturally organize** — common case extracted, variations inline. F refleja organic engineering.
- Lint rule split is harder pero implementable: "useMemo creating BufferGeometry without useEffect cleanup AND not using useDisposableGeometry → warning".

**Why E wins over F:**

E is **uniform across all 7 sites + future sites**. F's ergonomic win is **bounded** (4 sites × 1 line saved = 4 lines total) but the **uniformity cost spans ALL sites permanently** — every reader of the codebase has to internalize the split rule "use helper here, inline there, the line of demarcation is multi-coupled / wrapper / external-ref".

The split mental model has hidden costs F's articulation doesn't surface:

- New sites added later may fall into either bucket; the dev has to make the call. Convention drift risk over time.
- Reviewers have to verify the split was applied correctly. Sec 6 vs Sec 7 of the BUG-9 fix is exactly this kind of inventory miss — the "convention to memorize" failed at scale during the fix that landed it.
- Lint rule for split is harder. Under F, the rule must AST-inspect the useMemo body to decide: pure → helper required; multi-coupled → helper not required; wrapper → helper not required. False positives + false negatives both harder to control. Under E, the rule is "useDisposable call exists" — pure structural.

F is **organic** in that humans gravitate to common-case extraction. But uniformity wins when the convention is enforceable — exactly the problem at hand (a leak class went undetected for the BUG-9 inventory window).

#### Confidence calibration on rejection

A y F son ambos coherent decisions if adopted. The choice is preference for:

- **Discoverability + enforcement (E)** vs ergonomic minimization on the common case (F) vs minimal abstraction (A).

Sam may reasonably override to F or A based on weight differences. Sec 4.5 expands.

### 4.3 Integration con 3.2 y 3.3

The three sub-decisions integrate as follows:

- **3.2 cleanup at 2 missed sites** is the immediate Pattern 2.5 extend mínimo. Under recommendation E, the cleanup at Sites 6, 7 takes the form `useDisposable(geometry)` (using the helper from 3.1). Under A, it would be `useEffect(() => () => geometry?.dispose(), [geometry])` inline. Same fix shape semantically; under E the call uses the canonical helper.

- **3.3 documentation strategy** anchors E into the codebase via:
  - **JSDoc on `useDisposable`** explaining the 7-site shapes covered, when to use it, why it returns `void` (does not abstract value computation).
  - **CLAUDE.md section "Three.js disposable lifecycle"** with canonical pattern + decision rule + reopen triggers + cross-ref to this RFC.
  - **Inline comments at site-of-introduction** when adding new Three.js disposables to React components: brief reminder + `useDisposable` call.

The 3 layers are complementary: JSDoc serves grep + IDE hover; CLAUDE.md serves architectural intent + reopen criteria; inline comments serve reader at code-touch time.

### 4.4 What changes for callers

**Sites 1, 2, 4, 5 (currently `useMemo + useEffect inline cleanup`):**

```tsx
// Before (post-BUG-9):
const bodyGeometry = useMemo(() => /* ... */, [measurements]);
useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

// After (post-C1):
const bodyGeometry = useMemo(() => /* ... */, [measurements]);
useDisposable(bodyGeometry);
```

Mechanical replacement: 1-line delta per site (replacing `useEffect(() => () => ..., [...])` con `useDisposable(...)`).

**Site 3 (multi-geo coupled):**

```tsx
// Before:
const { fineGeo, sectionGeo } = useMemo(() => /* ... */, [size, cellSize, sectionEvery]);
useEffect(() => () => { fineGeo.dispose(); sectionGeo.dispose(); }, [fineGeo, sectionGeo]);

// After:
const { fineGeo, sectionGeo } = useMemo(() => /* ... */, [size, cellSize, sectionEvery]);
useDisposable(fineGeo);
useDisposable(sectionGeo);
```

Two `useDisposable` calls — semantically equivalent to the inline cleanup. No artifical decoupling because the useMemo is unchanged; only the cleanup registration is split into two declarations.

**Sites 6, 7 (currently NO cleanup — leaks):**

```tsx
// SelectedVertexRenderer.tsx (Site 6):
// Before:
const geometry = useMemo(() => /* may return null */, [livePositions, selectedVertices]);
// (no cleanup)

// After:
const geometry = useMemo(() => /* may return null */, [livePositions, selectedVertices]);
useDisposable(geometry);
```

```tsx
// ClothMesh.tsx (Site 7):
// Before:
const staticGeometry = useMemo(() => {
  if (!meshData) return null;
  const geo = new THREE.BufferGeometry();
  // ... setup ...
  geometryRef.current = geo;  // ← anti-pattern preserved (orthogonal to C1)
  return geo;
}, [meshData]);
// (no cleanup)

// After:
const staticGeometry = useMemo(() => {
  if (!meshData) return null;
  const geo = new THREE.BufferGeometry();
  // ... setup ...
  geometryRef.current = geo;
  return geo;
}, [meshData]);
useDisposable(staticGeometry);
```

Site 7's `geometryRef.current = geo` smell stays as-is — orthogonal to C1 (captured as deuda técnica § 8.1).

**New sites going forward:**

```tsx
// Convention: any useMemo creating Three.js disposable should be followed by useDisposable.
const geometry = useMemo(() => new THREE.SomeGeometry(...), [deps]);
useDisposable(geometry);
```

CLAUDE.md section anchors this. Lint rule follow-up enforces gradually.

### 4.5 Confidence calibration

**Recommendation:** Opción E.

**Confidence:** **medium-high.**

**Why not high:** A y F are coherent alternatives. The calibration is not "E is obviously correct"; it's "E has the best balance of discoverability + enforceability + uniformity, but the tradeoffs are real". A reader who weights ergonomic minimization on common case (F) or minimal abstraction (A) more heavily can reasonably reach a different conclusion.

**What would shift the recommendation:**

- **F gains weight if:** a future inventory shows pure-recipe sites grow to dominate (e.g., 8/10 sites pure); the 1-line ergonomic gain becomes meaningful.
- **A gains weight if:** the codebase exits Three.js (unlikely) OR if the 7 sites stop growing (helper extraction depreciates). Also if the lint rule under E proves false-positive prone in practice.
- **E stays correct if:** new sites continue to be heterogeneous (mix of pure / nullable / multi / wrapper / ref); the uniform pattern keeps paying off as Three.js usage grows.

**If Sam prefers F (split helper):** Sec 4.2 articulates F's strengths fairly; doc adjusts to recommend F with E + A as alternatives.

**If Sam prefers A (no helper):** Sec 4.2 articulates A's strengths fairly; doc adjusts to recommend A. 3.2 (cleanup gaps) + 3.3 (docs) become the entire Fase 3 scope.

The audit philosophy applies: **articulated reasoning > prior preference**. Sec 4 commits to E as my best read; Sam's verde or override is the final call.

---

## 5. Migration plan multi-step

### 5.1 Branch + PR

Continues on `drift/c1-rfc-buffer-lifecycle` branch (this branch). PR #673 stays as the rolling RFC + implementation surface.

### 5.2 Commit sequence (atomic per audit rules)

**Commit 1 — Extract `useDisposable` hook + unit tests.**

Files:
- `src/components/Viewport3D/hooks/useDisposable.ts` (new) — hook implementation + JSDoc.
- `src/components/Viewport3D/hooks/__tests__/useDisposable.test.tsx` (new) — unit tests covering: dispose on unmount, dispose on value change, null-safe, no-double-dispose.

Estimated size: ~80-100 lines (hook ~15 + JSDoc ~25 + tests ~50).

**Why `src/components/Viewport3D/hooks/`?** Matches existing co-location precedent (`useMeshing`, `useGeometricPreview`, etc. all live in `src/components/Viewport3D/`). The hook is Three.js-specific; lifting it to `src/hooks/` would suggest broader applicability than current scope.

If a future RFC extends to materials/textures (out of scope per § 1.2), the hook can move to a more general location at that time. YAGNI now.

**Commit 2 — Migrate Sites 1-5 (BUG-9 inline → `useDisposable`).**

Files:
- `src/components/Viewport3D/Mannequin.tsx` (Sites 1, 2).
- `src/components/Viewport3D/FloorGrid.tsx` (Site 3).
- `src/components/Viewport3D/PieceMesh.tsx` (Site 4).
- `src/components/Viewport3D/GarmentSimulation.tsx` (Site 5).

Mechanical replacement of inline cleanup with `useDisposable(value)` calls. Existing test (`Mannequin.test.tsx`) should pass unchanged (semantic equivalence).

Estimated size: ~10 lines net delta (5 sites × ~2 lines each, mostly removals).

**Commit 3 — Cleanup gaps at Sites 6, 7 + adopt `useDisposable`.**

Files:
- `src/components/Viewport3D/SelectedVertexRenderer.tsx` (Site 6 — first-time cleanup).
- `src/components/Viewport3D/ClothMesh.tsx` (Site 7 — first-time cleanup).

Adds `useDisposable(geometry)` after each useMemo. **This is the Pattern 2.5 extend mínimo — sub-decision 3.2 implementation.**

Estimated size: ~6 lines additions (2 imports + 2 calls + minor whitespace).

Note on Site 7 ref-store smell: do NOT touch the `geometryRef.current = geo` inside the useMemo. That's deuda técnica orthogonal to C1 (§ 8.1) — moving it would expand scope.

**Commit 4 — Documentation: CLAUDE.md section + cross-ref + inline.**

Files:
- `CLAUDE.md` — new section "Three.js disposable lifecycle (C1 ratified)".
- `src/components/Viewport3D/hooks/useDisposable.ts` — JSDoc finalized (commit 1 includes initial JSDoc; this commit polishes after seeing migration scenarios).

Estimated size: ~50-80 lines (CLAUDE.md section ~50; JSDoc polish ~5).

CLAUDE.md section follows the precedent established by other ratifications (e.g., "Persistence policy (B6-state ratified)", "Cascade middleware patterns (B3-state ratified)"). Includes:
- Canonical pattern + when to use.
- Inventory snapshot.
- Decision rule for new sites.
- Reopen triggers.
- Cross-ref to this RFC + BUG-9 input doc.

**Commit 5 (optional) — Lint rule scaffold or follow-up issue.**

Two paths:

- **Path A (preferred):** open follow-up issue tracking lint rule implementation. Add to the existing lint-rule cluster (#659, #662, #664). Bundle with those when implemented.
- **Path B (alternate):** scaffold custom eslint rule in a separate package directory if the team wants immediate enforcement. Higher cost; deferred unless Sam requests.

Estimated default: Path A (follow-up issue, no code).

### 5.3 Verification

**Type check:** `npx tsc -b --noEmit` clean after each commit.

**Test suite:** `npm run test` clean after each commit. Existing test (`Mannequin.test.tsx`) covers Site 1 dispose semantic; new tests in commit 1 cover the helper itself.

**Lint:** `npm run lint` clean after each commit.

**Manual verification (optional, post-migration):** browser DevTools Memory tab snapshot before/after triggering geometry recreation 100x (e.g., adjust avatar measurements 100 times). Memory should plateau, not grow linearly. NOT required per Sam's directive (§ 2.4 — structural verification suffices); listed only as optional bonus check.

### 5.4 Rollback plan

Each migration commit is mechanically reversible. If issues emerge post-merge:
- Revert commits 2 + 3 (migrations) → returns to inline-cleanup pattern at Sites 1-5; Sites 6, 7 lose their cleanup (leak returns).
- Keep commit 1 (helper exists, unused).
- Keep commit 4 (docs anchor to commit 1's helper, still valid).

If full rollback desired: revert commits 1-4. RFC doc stays as historical record.

---

## 6. Cross-references

### 6.1 Input docs + commits cited in this RFC

- `docs/reports/2026-04-28-c1-rfc-input-bug9-analysis.md` — input doc generated during BUG-9 inline fix; documents 5 leak sites + variation summary.
- `docs/reports/2026-04-28-drift-fase2-classification.md` — places C1 in (c) RFC bucket.
- `docs/reports/2026-04-29-drift-inventory-addendum.md` § 7 — confirms BUG-9 input data still valid as of 2026-04-29.
- BUG-9 fix commit `f6c974f1` — "fix: BUG-9 inline dispose for Three.js geometry leaks at 5 sites (#612)".
- BUG-1 fix commit `ed632b9` (#604) — adjacent precedent for "small adapter at the boundary" decision shape (cited in § 2.5).

### 6.2 Methodology rules applied

- **Regla 1 v2** (read contents, don't list directories) — applied in § 2 sweep extension; surfaced Sites 6, 7.
- **Regla 1 v3** (verify divergence, don't assume uniformity by grep + look outside obvious directory) — applied to confirm Sites 6, 7 share the structural shape of BUG-9 sites.
- **Regla 1 v3 sub-rule** (sub-sweeps son contextuales, no autoritativos) — anchored: BUG-9 sub-sweep was contextual to the fix; C1 sweep is authoritative for this eje.
- **Inventory drift overestimation pattern (meta-anchor)** — applied inversely: inventory was lower bound; sweep found +40% sites. Pattern still holds (current 65%+ ratify-by-convention closures); C1 doesn't move that needle but contributes a Pattern 2.5 extend variant data point.
- **Pattern 2.5 hybrid variants** — C1 fits **extend** variant (per A3 sub-rule anchored 2026-05-01): pattern existing legitimate (inline `useEffect dispose`), gaps en cobertura at 2 sites (3.2), helper extraction adds discoverability (3.1) without restructuring the existing pattern semantics.
- **Process discipline (stop → notify → wait → execute)** — applied at sweep extension (paused before Sec 3 redaction, reported inventory + framing preview, awaited Sam verde).

### 6.3 Adjacent eje precedents

- **D7 (ValidationDiagnostic vs Diagnostic)** — same shape as C1 § 1.2 deferral of materials/textures: ortogonal lifecycles → ratify separados, no force unify.
- **B11-state IDs canonical** — example of Real-fix (a) ratification with full migration (39 archivos). C1 is smaller scope (~7 sites + helper).
- **A3 cross-boundary error handling** — Pattern 2.5 extend variant precedent. C1 follows: pattern legitimate, coverage gaps in specific sites, helper extension adds without restructuring.
- **B2-state entity collections** — forward-only convention precedent. C1 follows: existing 5 BUG-9 sites preserved + canonical helper for new and migrated sites.
- **B6-state IDB persistence** — opt-in envelope precedent (per-site ratification with inline comment). C1's lint rule follow-up + CLAUDE.md section establishes equivalent ratification surface.

---

## 7. Reopen triggers

C1 reopens if any of the following surfaces:

1. **N≥3 materials/textures lifecycle leak sites uncovered** that don't fit `useDisposable`'s `{ dispose(): void }` shape — opens RFC-C1bis or sub-decision dedicated to materials/textures lifecycle.

2. **A new Three.js disposable shape emerges** that doesn't fit any of the inventoried 7 site variations (e.g., RenderTarget in useMemo, ShaderMaterial in useMemo, dynamic-import lazy disposable). If `useDisposable` covers the new shape uniformly, no reopen needed; if it doesn't, reopen to extend the helper or the convention.

3. **Lint rule under E generates >5% false positives** after 1 month warning-only — reopen to evaluate split-rule (per F's enforcement model) or to relax the canonical convention.

4. **Site 7's ref-store anti-pattern (`geometryRef.current = geo` inside useMemo) generates a real bug** — reopen to address the deferred deuda técnica § 8.1 (currently scope-orthogonal).

5. **`useDisposable` becomes a hot path overhead** (the per-render `useEffect` registration measurable in profiling) — unlikely given the small N, but listed for completeness.

6. **Sam reverses the recommendation** to A or F based on Sec 4.2 counter-arguments weighted differently — doc updates accordingly, follow-up commits adjust.

7. **Inventory of `useMemo` creating Three.js disposables grows past 20 sites** — re-evaluate whether E's uniform pattern still serves or whether a sub-classification emerges (e.g., a "common pure" subset that warrants F's helper layer alongside the uniform `useDisposable`).

---

## 8. Deuda técnica explícita post-unify

### 8.1 Site 7 — `geometryRef.current = geo` inside useMemo (anti-pattern)

`ClothMesh.tsx:382-391` assigns `geometryRef.current = geo` inside the useMemo body. This is a side-effect inside a memoization callback — anti-pattern (useMemo should be pure). The assignment is needed because other useEffects in the component (line 339 per-frame position update; line 372 fit-map color attribute) require synchronous access to the geometry via the ref.

**Why deferred:** orthogonal to C1 scope. Fixing it requires either:
- Moving the ref assignment to a `useEffect(() => { geometryRef.current = staticGeometry; }, [staticGeometry])` — adds a frame of latency before `geometryRef.current` is set, which the per-frame mutation may not tolerate.
- Refactoring the component to not rely on the ref pattern (large refactor, scope creep).

**When to revisit:** if Site 7 generates a real bug (race condition between the useMemo and the per-frame mutation), reopen as its own follow-up. Track via inline comment + this section.

### 8.2 Sew3DTool ref-based older idiom not migrated retroactively

`Sew3DTool.tsx:77-98` (PiecePickMesh) uses `useMemo + prevGeoRef + useEffect-on-unmount` (per § 2.3.5). Functionally equivalent to BUG-9 inline pattern but shape distinct. Under E, it would migrate to `useMemo + useDisposable(value)` opportunistically.

**Why deferred from initial migration:** retroactive migration of older idioms is opportunistic per B2-state precedent ("when a callsite is touched for another reason, prefer the canonical"). Forced migration risks scope creep + code review burden disproportionate to benefit.

**When to migrate:** next time `Sew3DTool.tsx` is touched for another reason. Track via inline comment after migration of Sites 1-7.

### 8.3 Lint rule pending follow-up issue

Sec 5.2 commit 5 deferred to follow-up issue (Path A preferred). Until lint rule lands, enforcement is via:
- Code review.
- CLAUDE.md section as architectural anchor.
- JSDoc on `useDisposable` as IDE hover guidance.

**When to implement:** bundle with existing lint-rule cluster (#659, #662, #664) when the team implements them. C1 follow-up issue references the cluster.

### 8.4 Materials/textures lifecycle deferred

Per § 1.2 + reopen trigger § 7.1. If drift emerges with N≥3 sites in materials/textures, RFC-C1bis or sub-decision dedicated. Until then, materials lifecycle (`EdgeHighlight`, `GarmentSimulation` TSL material) and textures lifecycle (`TextureManager`) are out of scope.

---

## 9. Pregunta a Sam + estado + calibración

### 9.1 Pregunta para verde de Fase 3

**¿Verde para Sec 4 recommendation E con confidence medium-high articulado?**

Posibles respuestas:
- **A (verde directo):** procedo con Sec 5 commits 1-4 (helper + migrations + cleanup gaps + docs). Lint rule (commit 5) deferred to follow-up issue.
- **B (override a F):** Sec 4 redacta con F como recommendation; Sec 5 ajusta scope (helper covers Sites 1, 2, 4, 6 only; Sites 3, 5, 7 stay inline; cleanup gaps add inline cleanup only).
- **C (override a A):** Sec 4 redacta con A como recommendation; Sec 5 simplifica a "cleanup gaps + CLAUDE.md docs only", no helper extraction.
- **D (más discusión):** specific aspect of Sec 4 needs more articulation before committing — pause and refine.

### 9.2 Estado del eje

- **Sec 1+2+3+4-9:** complete.
- **Doc total:** ~1000 líneas (within Sam estimate 600-900, slightly over due to comprehensive Sec 4 articulation con respect a A y F counter-arguments).
- **Branch:** `drift/c1-rfc-buffer-lifecycle`.
- **PR:** #673 draft.
- **Awaiting:** Sam verde para Sec 5 implementation.

### 9.3 Calibración estimate vs actual

**Sam pre-redacción estimate (kickoff):** 4-6h doc Fase 2 + 1-3h Fase 3.

**Actual Fase 2 (this RFC):**
- Sweep extension: ~30min (input doc lectura + +2 sites discovery).
- Sec 1-2 redacción: ~1h.
- Sec 3 articulación 6 opciones: ~1.5h.
- Sec 4-9 redacción: ~1h.
- **Total Fase 2: ~4h.** Within estimate (lower end). Ratio ~0.8x of nominal.

**Estimated Fase 3 (Sec 5 commits 1-4):**
- Commit 1 (helper + tests): ~45min.
- Commit 2 (migrate Sites 1-5): ~30min.
- Commit 3 (cleanup gaps Sites 6, 7): ~15min.
- Commit 4 (CLAUDE.md + JSDoc): ~30min.
- **Total Fase 3: ~2h.** Mid-range of estimate (1-3h).

**Total eje runtime:** ~6h Fase 2 + Fase 3 combined. On Sam's calibration (~5-7h ejes (c) RFCs).

### 9.4 Pattern 2.5 extend variant data point

C1 confirms the Pattern 2.5 extend variant anchored 2026-05-01 (post A3) generalizes:

- **A3 (cross-boundary error handling):** pattern existing legitimate (defensive Rust + CPU fallback + TS NaN guards), gaps en cobertura (panic_hook missing, UI surface absent, NaN telemetry counter absent), cleanup = add coverage to gaps without refactoring pattern.
- **C1 (Three.js buffer lifecycle):** pattern existing legitimate (inline `useEffect dispose` post-BUG-9), gaps en cobertura (2 missed sites + lack of canonical name for discoverability), cleanup = add cleanup at 2 sites + extract canonical helper for discoverability without refactoring the pattern semantics.

**Both reify the same shape:** pattern legitimate + add coverage to gaps + extract canonical for discoverability/enforcement. C1 contributes a second concrete data point. If a third Pattern 2.5 extend case emerges with the same shape, the variant generalizes from anchor → established sub-rule.

---

**FIN DEL RFC C1 (Fase 2).** Awaiting Sam verde para Sec 5 implementation.
