# Fase 2 — C8: Mesh import normalization (bypass parcial)

**Fecha:** 2026-04-29
**Eje:** C8.
**Categoría:** **(a) mecánico** — confirmado tras read-only check; pero **tamaño M, no S** como decía inventario (axis count expansion 1.0x → 2x).
**Output esperado:** canónico propuesto + archivos a tocar + tamaño + recomendación. Decisión simple porque no hay sub-RFC oculto (a diferencia de B5).
**Pre-requisito:** ninguno bloqueante. C6 está decidido (cm body / mm pattern) pero **NO está implementado**; este eje procede con conversión inline mm→m marcada como candidate para C6-impl.

---

## 1. Hallazgos previos al canónico

### 1.1 Pre-existing canonical (importMesh) — robusto

`src/utils/import/meshImporter.ts` cubre:

- **4 formatos:** OBJ, FBX, GLTF/GLB, **VRM** (delega a `loadVRM` internamente, línea 359).
- **Auto-scaling** mm/cm/m/inches → mm (líneas 397-405).
- **Auto-scale a target height** (default 1800mm = 180cm).
- **Center at origin** (feet on ground, líneas 426-429).
- **ImportResult rico:** format, detectedUnit, appliedScale, boundingBox, heightMm, hasSkeleton, boneCount, meshCount, vertexCount, warnings.
- **MeshImportLimitError** safety (file size + vertex count + triangle count).

Consumers correctos hoy: `useSimulationLifecycle.ts:139`, `CollisionBodyMesh.tsx:39`.

### 1.2 Axis count expansion (1.0x → 2x — lower bound confirmado)

Inventario dijo solo `AvatarModel.tsx` bypassa. Read-only encontró **2 bypassers**:

| Archivo | Bypass real | Notas |
|---|---|---|
| `src/components/Viewport3D/AvatarModel.tsx` | **Sí** | useLoader(GLTFLoader) + dummy `'/default-avatar.glb'` para non-GLTF (phantom load bug, línea 169) + useEffect manual para FBX/OBJ con scaling/centering inline (líneas 217-269) + loadVRM via vrmLoader. |
| `src/utils/cloth/avatarCollisionMesh.ts` | **Sí, NO en inventario** | Usa GLTFLoader + isVRMFile/loadVRM directos (líneas 19-29). Inline scaling/centering (líneas 33-46) con comment explícito "same transforms as AvatarModel.tsx" — espejo intencional del bypass. |
| `src/utils/avatar/vrmLoader.ts` | **NO** | Helper interno consumido POR meshImporter (línea 12 import + línea 359 case 'vrm'). No es bypass; es infra interna. |

El comment "same transforms as AvatarModel.tsx" en `avatarCollisionMesh.ts` es señal de que ambos están **pensados como par**. Migrar uno sin el otro deja drift documentado donde antes había drift implícito — peor que el estado actual.

### 1.3 Phantom load bug confirmado

`AvatarModel.tsx:169`:

```tsx
// useLoader is always called (hooks can't be conditional), but non-GLTF files are loaded separately
const gltf = useLoader(GLTFLoader, isGltf ? url : '/default-avatar.glb');
```

Cuando `isGltf=false` (formato OBJ/FBX/VRM), useLoader carga el archivo dummy `/default-avatar.glb` real (no es código muerto — useLoader fires regardless of conditional). El comment línea 168 lo acknowledges como hack. **Bug observable:** spurious file load por cada montaje del componente con un avatar no-GLTF.

### 1.4 Dependencia C6 — concreta

`importMesh` outputs scene **en mm** (módulo doc + lógica líneas 397-405). Three.js viewport convención: **metros**. AvatarModel actual normaliza a metros via `UNIT_TO_METERS` map (línea 232).

**Implicación:** routear AvatarModel a importMesh requiere conversión mm→m en el boundary del consumer. **Eso es exactamente lo que C6-impl centralizará** cuando llegue.

C6-impl no tiene scheduler conocido. Esperarlo bloquea C8 indefinidamente.

### 1.5 Drift adyacente out-of-scope (cross-eje observations)

- **`useSimulationLifecycle.ts:147`** — `scene.scale.set(...body.transform.scale)` enmascara el unit mismatch sobreescribiendo la scale de importMesh con la del usuario. Síntoma del mismo problema que tracking en issue **#635** ("CollisionBodyMesh latent bug"). NO se cierra acá.
- **`importMesh` API — output unit fijo en mm** sin opción de pedir metros. Cambiar la API afecta a TODOS los consumers presentes y futuros, decisión arquitectónica que merece su propio análisis. Issue **#635** captura el bug latente concreto; la decisión de API completa queda diferida a un eje futuro (probablemente gemelo a C5 coord systems o sub-eje de A4 geometry/mesh ops).

---

## 2. Canónico propuesto

### 2.1 AvatarModel.tsx — routear via importMesh

**Cambios:**

1. Eliminar `useLoader(GLTFLoader, ...)` con phantom dummy (línea 169).
2. Reemplazar useEffect para VRM (líneas 192-207) y useEffect para OBJ/FBX (líneas 210-269) con un único useEffect que llama `importMesh(url, filename, { targetHeightMm: height * 1000 })`.
3. Convertir `result.scene` de mm a metros con conversión inline marcada:

   ```tsx
   // C6-impl: centralize mm→m conversion at boundary (currently inline pending C6 implementation)
   result.scene.scale.multiplyScalar(0.001);
   result.scene.updateMatrixWorld(true);
   ```

4. Eliminar `UNIT_TO_METERS` map y la lógica de detectUnit/scaling/centering inline (importMesh ya las hace).
5. `setVrmInstance(result.vrm)` para preservar el manejo VRM (importMesh actualmente devuelve solo scene en su ImportResult — **sub-decisión**: ¿extender ImportResult con `vrm?: VRM` opcional, o hacer una llamada secundaria a `loadVRM` cuando el formato es VRM? Ver sección 4 abajo).

### 2.2 avatarCollisionMesh.ts — routear via importMesh

**Cambios:**

1. Reemplazar el branching `if (isVRMFile) { loadVRM } else { GLTFLoader }` (líneas 22-30) con `importMesh(avatarUrl, filename, { targetHeightMm: avatarHeight })`.
2. Eliminar la lógica inline de scaling/centering (líneas 33-46) — importMesh ya las hace.
3. Convertir `result.scene` de mm a metros con la misma conversión inline marcada como en 2.1.
4. `extractMeshData(result.scene)` continúa igual.
5. **Sub-decisión:** `avatarHeight` actualmente es metros. importMesh espera `targetHeightMm` en mm. Pasar `avatarHeight * 1000` en el llamador, marcado con `// C6-impl: m→mm conversion at boundary`.

### 2.3 Conversión inline mm→m — pattern uniforme

Misma forma en ambos sitios:

```typescript
// C6-impl: centralize mm→m conversion at boundary (currently inline pending C6 implementation)
result.scene.scale.multiplyScalar(0.001);
result.scene.updateMatrixWorld(true);
```

Cuando C6-impl llegue, este patrón es find-and-replace mecánico hacia `mmToMeters(result.scene)` o similar. Cero rework arquitectónico.

---

## 3. Archivos a tocar

| Archivo | Cambio | Líneas aprox |
|---|---|---|
| `src/components/Viewport3D/AvatarModel.tsx` | Reemplazar 3 useEffect (gltf/vrm/objfbx) con 1 unificado via importMesh; eliminar UNIT_TO_METERS + detectUnit; agregar conversión mm→m marcada | ~80 líneas eliminadas, ~30 nuevas |
| `src/utils/cloth/avatarCollisionMesh.ts` | Eliminar GLTFLoader/loadVRM directo + scaling inline; agregar importMesh + conversión | ~25 líneas eliminadas, ~10 nuevas |
| `src/utils/import/meshImporter.ts` | **Posible**: extender ImportResult con `vrm?: VRM` opcional (ver sección 4) | ~5 líneas si se decide incluir |
| Tests (si existen) | Verificar que pasan; si AvatarModel tiene tests, posible ajuste menor | TBD |

**Total estimado: 2-3 archivos, ~100 líneas modificadas.** Tamaño **M** (no S como decía inventario por axis count expansion + sub-decisión VRM exposure).

---

## 4. Sub-decisión: cómo expone importMesh la VRM instance

`AvatarModel.tsx` hoy guarda `vrmInstance` (línea 170) cuando carga VRM, lo usa para humanoid bones, expressions, IK. importMesh actualmente devuelve solo `result.scene` — descarta la `vrm` instance que `loadVRM` produce internamente (línea 359).

**Tres opciones:**

| Opción | Cambio | Impacto |
|---|---|---|
| **A.** Extender ImportResult con `vrm?: VRM` opcional | meshImporter.ts línea 20 + línea 359 settea el campo | Mínimo, retro-compatible. Mejor opción. |
| **B.** AvatarModel hace llamada secundaria a `loadVRM` cuando `result.format === 'vrm'` | Doble carga del archivo (importMesh + loadVRM) | Wasteful, redundante. |
| **C.** Cambiar firma de importMesh para devolver `Result<{scene, vrm?}> | Cambio de API affects todos los consumers | Over-engineering para 1 caso. |

**Recomendación: A** — campo opcional `vrm?: VRM` en ImportResult. 5 líneas cambio en meshImporter.ts. Retro-compatible: consumers que no usan VRM ignoran el campo.

Nota: este es el ÚNICO cambio a importMesh que C8 propone. NO toca la API de output unit (esa decisión sigue siendo separate eje futuro per #635).

---

## 5. Tamaño confirmado: M

2-3 archivos, ~100 líneas, sin sub-RFC abierto. **2 commits separados en el branch:**

1. `unify: C8 part 1 — route AvatarModel.tsx through importMesh canonical`
2. `unify: C8 part 2 — route avatarCollisionMesh.ts through importMesh canonical`

Si la sub-decisión 4.A se aprueba, la extensión de `ImportResult.vrm?` va en el commit del part 1 (donde se necesita primero).

---

## 6. Riesgo de cambio de comportamiento

**Cero a nivel API:** ningún consumer downstream cambia su shape de uso.

**Cambios observables:**

- ✅ **Eliminación del phantom load bug** — `/default-avatar.glb` ya no se carga espuriamente cuando isGltf=false. Cambio observable POSITIVO.
- ✅ **Normalización uniforme** — los 4 formatos siguen el mismo pipeline (detect → scale → center). Antes, OBJ/FBX usaban una variante inline distinta de la canónica.
- ✅ **Safety enforcement** — los avatares ahora pasan por `MeshImportLimitError` checks (file size + vertex count + triangle count). Previamente, AvatarModel cargaba cualquier mesh sin límites. **Posible cambio de comportamiento:** un avatar que excede los defaults (50MB / 500k verts / 1M tris) ahora fallaría donde antes cargaba. Esto es desejable (defense en profundidad), pero **observable** para usuarios con avatares muy pesados. **Mitigación:** los defaults son razonables para avatares humanos típicos; si algún test/usage actual carga un avatar mayor, se puede pasar `{ skipLimits: true }` o ajustar limits.
- ⚠️ **Conversión inline mm→m** — deuda explícita marcada. C6-impl la absorberá.

**Tests:** verificar qué tests existen para AvatarModel y avatarCollisionMesh antes de Fase 3. Si los tests asertan referencias específicas (ej. "useLoader called with X"), pueden requerir update.

---

## 7. Out-of-scope (anotaciones cross-eje)

- **`useSimulationLifecycle.ts:147` workaround** — `scene.scale.set(...body.transform.scale)` enmascarando unit mismatch. Síntoma del mismo problema de issue #635. NO se toca acá.
- **`importMesh` output unit API** — output fijo en mm, decisión arquitectónica que afecta a TODOS los consumers. Issue #635 lo captura como bug latente concreto en `CollisionBodyMesh.tsx`. La decisión sobre API (outputUnit option, wrapper, etc.) queda diferida a eje futuro (probablemente C5 coord systems o sub-eje de A4 geometry/mesh ops).
- **AvatarModel internal logic** (IK, bone mapping, morph targets, axis discovery) — fuera de scope. Solo se toca el path de carga/normalización.

---

## 8. Mi recomendación

**Confianza: alta.** A diferencia de B5-state donde la decisión era arquitectónica (filosofía consistencia vs problema real), C8 es genuinamente mecánico **una vez aceptamos los hallazgos**:

- Phantom load bug es bug real con impacto observable → arreglar.
- Bypass con scaling inline duplicado es divergencia mantenida manualmente → consolidar.
- importMesh ya cubre los 4 formatos → el canónico existe, solo hay que usarlo.
- C6-impl no tiene scheduler → proceder inline con marca explícita es proporcional.
- VRM exposure via `result.vrm?` opcional es retro-compatible y mínimo.

**Recomendación: proceder con Opción 4.A (extender ImportResult con `vrm?` opcional) + 2 commits separados (AvatarModel primero, avatarCollisionMesh después).**

---

## 9. Preguntas para Sam

### Pregunta 1 — Sub-decisión 4.A (VRM en ImportResult)

¿Aprobás extender `ImportResult` con campo opcional `vrm?: VRM`? Es 5 líneas, retro-compatible, evita doble carga.

Alternativa que descarté pero menciono: que AvatarModel haga `loadVRM` secundaria cuando detecte VRM — wasteful pero NO toca importMesh API.

### Pregunta 2 — MeshImportLimitError defaults para avatares

Los defaults de importMesh (50MB / 500k verts / 1M tris) son razonables para avatares humanos típicos. **¿Necesitamos pasar `{ skipLimits: true }` para AvatarModel** porque los avatares de la app pueden ser mayores, o están dentro de límites? No tengo contexto del tamaño típico de avatares en uso.

Si los avatares pueden exceder defaults, opciones:
- **(a)** AvatarModel pasa `{ skipLimits: true }` (consciente bypass).
- **(b)** AvatarModel pasa límites más altos (ej. `{ limits: { maxFileSizeBytes: 200_000_000 } }`).
- **(c)** Ajustar defaults globalmente en meshImporter.

Si los avatares están dentro de defaults, no hacer nada (defaults aplican).

---

**FIN FASE 2 C8.** Awaiting Sam's decision on Pregunta 1 (4.A vs alternativa) y Pregunta 2 (limits) antes de Fase 3.
