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

## Sec 3+ pendiente

Sec 3 (Sub-decisiones — articulación formal de las 6 opciones de helper extraction shape, sub-decisión 3.2 cleanup at 2 missed sites, sub-decisión 3.3 documentation strategy) en el siguiente commit.

Sec 4 (Recomendación consolidada), Sec 5 (Migration plan), Sec 6 (Cross-references), Sec 7 (Reopen triggers), Sec 8 (Deuda técnica), Sec 9 (Pregunta a Sam + estado + calibración) — commits subsiguientes.
