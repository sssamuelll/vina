# Fase 2 — C6: Unidades y medidas (decisión)

**Status:** decisión only. **NO contiene plan de migración.** La migración del eje C6 vive después en su lugar normal de la cola de Fase 2 mecánicos / (b) decisiones implementadas.

**Eje:** C6 — Unidades & medidas (`drift-inventory-fase1.md` axis C6, classification `(b)`).

**Pregunta única que este doc decide:** ¿Cuál es la unidad canónica para `BodyMeasurements` en el almacenamiento interno?

---

## 1. Qué decide C6 y qué NO decide

### Decide
- La **unidad de almacenamiento interno** para los campos de `BodyMeasurements` (`height`, `chest`, `waist`, `hips`, `shoulder`, `armLength`, `inseam`, y los ~22 campos opcionales adicionales).
- Si TypeScript debe usar **branded types** (`type Cm = number & { __cm }`) o seguir con `number` plano.

### NO decide (explícito por anti-scope-creep)
- Cómo se renderizan las medidas en la UI (D3 territory).
- Qué unidad usa el usuario para input (D3 territory — selector mm/cm/inches ya existe en `editor.units`).
- Cómo se convierten los sistemas coordenados (C5 territory — pattern-space ↔ world-space ↔ screen-space).
- Cómo se persisten los proyectos / avatares (B6-state territory — IDB vs localStorage).
- Si `seamAllowance`, `Dart.intake`, etc. deben cambiar de mm a otra unidad. Esos están firmemente en mm y no son parte de C6.
- Plan de migración. Esto es decisión-only.

### Pregunta auxiliar fuera de scope pero relevante para framing
"¿Por qué tenemos drift entre cm (body) y mm (pattern)?" — respuesta probable: convención industrial. Body measurements son históricamente cm en moda/sastrería; pattern engineering (CAD) es mm. La drift no es accidental, es heredada de dos tradiciones.

---

## 2. Estado actual del codebase (data, no propuesta)

### Storage de `BodyMeasurements`
- `types.ts:423-490` — la interface declara `height: number; // cm` y todos los demás campos siguen el mismo patrón.
- 7 campos requeridos (height, chest, waist, hips, shoulder, armLength, inseam) y ~22 opcionales (waistHeight, shoulderToWaistFront, backLength, etc.).
- **Default avatar** (`projectSlice.ts:149-162`): `height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82`. Todos en cm.
- Persistencia: `avatar` field en `Project` que se serializa a IDB / localStorage / archivo `.openclo`.

### Storage de pattern data
- `seamAllowance`, `Dart.intake`, `Dart.depth`, notch length/width, internal line dimensions, trim size, artwork position/width, grid size: **todos mm** (verificado en types.ts líneas 37, 150, 160, 191, 192, 277, 300, 313, 624).
- Pattern outline coordinates (`PathCommand.values`): **mm**.
- `defaultSeamAllowanceWidth`: **mm** (BUG-12 ya tracked: hardcodeado en editorSlice en vez de importar de defaults.ts).

### Conversion sites (scatter)
Identificados durante investigación (no exhaustivo):

| Sitio | Conversión | Trigger |
|---|---|---|
| `garmentPlacement.ts:150-161` | `m.height / 100`, `m.chest / 100`, ... (~6 fields) | cm → m para Three.js world |
| `garmentPlacement.ts:185` | `pieceGeometry.heightMm / 1000` | mm → m para Three.js world |
| `Mannequin.tsx:26-28` | `const scale = 0.01` (cm → m) | LatheGeometry input |
| `PieceMesh.tsx:14` | `const SCALE = 0.001` (mm → m) | ShapeGeometry input |
| `fitMaps.ts:209` | `fabric.thickness / 1000` | mm → m for compute |
| `layerOffsets.ts:89` | `totalThicknessMm / 1000` | mm → m for stack offsets |
| `dxf/converter.ts:290` | `(scale ?? 100) / 100 * unitFactor` | mm → display unit |
| `trim/trimExtractor.ts:115` | `g.lengthMM / 1000` | mm → m for BOM rollup |
| `webgpuDetect.ts:154` | `estimatedMaxParticles / 1000` | unrelated, particle count → K |

### Consumers de `BodyMeasurements`
- `garmentPlacement.ts` (placement de piezas en avatar): lee height, chest, hips, etc. Convierte cm → m.
- `Mannequin.tsx` (avatar 3D): lee measurements, escala con `0.01`.
- `fitMaps.ts` (fit map computation): consume measurements indirectamente vía simulación.
- `MeasurementCalculator.ts`, `IntelligentContext.ts` (copilot intelligence): leen measurements en cm para razonamiento sobre patrones.
- `ContextEnricher.ts:110`: `Record<string, number | undefined>` cast — implícitamente asume cm.
- `avatarLibrary.ts:70`: `Record<string, number> as BodyMeasurements` cast — **el TS error en #627** que surfacea esta drift como bug de tipo.

### Display unit
- `editor.units: UnitSystem` (`'mm' | 'cm' | 'inches'`) — solo afecta render UI, no storage.
- BUG-12 (#615): `defaultSeamAllowanceWidth: 10` hardcoded en editorSlice sin importar de defaults.ts; mismo síntoma de "unidad implícita por convención".

---

## 3. Opciones realistas

### Opción A — `BodyMeasurements` queda en cm, codificar la frontera

**Cambio:** ninguno en storage ni en valores. Documentación explícita en types.ts y CLAUDE.md de que body data = cm, pattern data = mm. Centralizar las ~6 conversiones `/100` de body en un módulo `src/utils/units/bodyConversions.ts` con funciones nombradas (`bodyMmToMetres`, `bodyToWorldVector`, etc.).

**Tradeoffs concretos:**

| Qué se rompe | Nada. Cero migración de datos. Cero cambios en archivos `.openclo` existentes. Cero cambios en el formato de export. |
| Qué se gana | Convención clara y nombrable. Las ~6 conversiones inline desaparecen — quedan en un solo módulo donde son auditables. La drift cm/mm queda explícitamente documentada como decisión, no como accidente. |
| Qué cuesta | El cognitive load de "dos unidades en el mismo codebase" persiste. Cada developer nuevo tiene que aprenderlo. La frontera es frágil contra adiciones futuras (alguien agrega un campo nuevo a BodyMeasurements forgetting que va en cm). |
| Cómo se integra con C5 | C5 hereda la dualidad. C5 tiene que diseñar conversion infra que sepa de ambas unidades. No simplifica C5. |
| Cómo se integra con D3 | D3 (forms) sigue siendo simple — input usuario en `editor.units`, conversión cuando lee/escribe a BodyMeasurements (`* 100` para cm storage). |
| Cómo afecta avatarLibrary.ts:70 (TS error #627) | Se fixea con cast explícito o adapter; el cast actual es accidental, este la legitima. |

**Confianza alta** en que esta opción mantiene comportamiento idéntico observable. Cero riesgo.

### Opción B — Migrar `BodyMeasurements` a mm; mm canónico everywhere

**Cambio:** `BodyMeasurements.height` pasa de `180` (cm) a `1800` (mm). Lo mismo para todos los campos. Migration shim (mismo shape que BUG-11) lee avatares legacy en cm, escribe en mm, registra el flag de migración. Display siempre convierte mm → unidad seleccionada por el usuario en UI.

**Tradeoffs concretos:**

| Qué se rompe | (1) Todos los archivos `.openclo` y avatar JSON existentes en disco/IDB. Necesitan migration shim que detecte version y multiplique por 10. (2) Cualquier exportación previa (DXF, tech pack PDF) que mostró cm en el header puede seguir funcionando porque el display layer convierte, pero el internal storage es ahora distinto. (3) Tests que assertean valores de measurements directamente fallan hasta que se actualizan. (4) El cast en `avatarLibrary.ts:70` (TS error #627) puede simplificarse pero requiere adaptación. |
| Qué se gana | Un solo unit interno (`mm`). El branded type `Mm` cubre 100% del storage. Las ~6 conversiones `/100` desaparecen — solo queda `/1000` (mm→m) y `*display_factor` (mm→display). Reduce cognitive load a 1 unit interno. Alinea con CAD/manufacturing convention (mm es estándar fuera de moda). |
| Qué cuesta | Migration shim production-ready (no es trivial — falla silenciosa = avatares con altura 18000mm). Tests review (~50 callsites donde se referencia un measurement directamente). Display layer en cada form que muestra measurements. Más trabajo total que Opción A. |
| Cómo se integra con C5 | C5 simplifica radicalmente. Solo dos conversiones existen (mm↔m, mm↔display). |
| Cómo se integra con D3 | D3 se complica un poco — cada `MeasurementInput` debe convertir display→mm en onChange, mm→display en value. Pero lo hace en un componente reutilizable. |
| Cómo afecta industria/UX | Body measurements en mm es **inusual fuera de engineering CAD**. Usuarios que vienen de fashion (CLO3D, Optitex, Gerber) leen body measurements en cm. Si exportamos a tech pack y mostramos "1800 mm height" se ve raro. Display layer puede renderear como cm para usuarios pero el debug logs / dev tools / API outputs van a mostrar mm. |

**Confianza alta** en que la migration es factible mecánicamente; **media** en si la convención mm para body data va a confundir a usuarios o developers downstream.

### Opción C — Branded types `Mm` y `Cm`, sin migration de valores

**Cambio:** introducir `type Mm = number & { __mmBrand: never }` y `type Cm = number & { __cmBrand: never }` en `src/types/units.ts`. Refactorear `BodyMeasurements.height: number` → `height: Cm`. Refactorear `seamAllowance: number` → `seamAllowance: Mm`. Funciones de conversión: `cmToMm(x: Cm): Mm`, `mmToM(x: Mm): Metres`, etc. Cada conversion site usa estas funciones; el compiler bloquea mezclas crudas.

**Tradeoffs concretos:**

| Qué se rompe | Cero datos migrados. Pero la signature de ~50-100 funciones cambia (cualquiera que toma un `number` que era cm/mm ahora toma `Cm` o `Mm`). Cada construction de un `Cm` requiere `cm(180)` o cast. |
| Qué se gana | Compile-time prevention de mezclas. El TS error en #627 (avatarLibrary.ts:70) es exactamente lo que branded types previenen. La drift queda imposible de re-introducir accidentalmente. |
| Qué cuesta | Ergonomic friction grande. Cada literal numérico (`180`, `10`, `0.5`) en código que toca measurements requiere un constructor explícito. Tests donde se passean `number` plano necesitan adapter. Library code de terceros (`Math.min`, etc.) requiere `unwrap` boilerplate. |
| Cómo se integra con C5 | C5 puede diseñar conversion functions con el branded-type signature — más seguro pero más boilerplate. |
| Cómo se integra con D3 | Forms necesitan un `Cm`/`Mm` constructor en cada `parseFloat(input)`. |
| Cómo afecta el tracker | El audit tiene 27 outputs totales. C6 con Opción C consume disproporcionadamente del budget de refactoring por ROI variable (depende mucho de si el equipo hace muchos errores de unidad ahora — ¿cuántos bugs en el último año fueron por esto? Sin esa data, hard to justify el costo). |

**Confianza media** en que esto se ejecuta bien sin volverse pesado. **Confianza alta** en que reduce la clase de bugs de #627. **Confianza baja** en que el ROI es positivo dado el costo.

---

## 4. Recomendación

**Opción A.** Confianza **media**.

### Razonamiento

1. **Status quo funciona observablemente.** El único bug sintomático de la drift es `avatarLibrary.ts:70` (#627), y es un cast cuestionable, no un cálculo incorrecto. Los `/100` scatter son cognitive load, no bugs.

2. **Convención industrial está del lado de cm para body.** Cualquier export downstream (tech pack, BOM, comunicación con manufacturing) lee mejor en cm para body. Migrar a mm internamente solo para presentar en cm en cada display es ceremony sin valor agregado para el usuario.

3. **Migration risk de Opción B es real.** Un avatar mal migrado (`height: 1800` que se lee como cm = 1800cm = 18m) produce resultados visualmente catastróficos. Migration shims tienen un track record de fallar silenciosamente.

4. **Opción C tiene buen costo/beneficio en el largo plazo, pero el audit no es el momento.** Branded types se introducen mejor cuando hay un patrón documentado y un equipo cómodo con el costo de boilerplate. Imponerlos ahora durante una unificación de drift agrega friction donde necesitamos velocidad.

5. **Centralización es el costo realmente útil de Opción A.** Las ~6 `/100` inline en garmentPlacement + las `0.01` en Mannequin + las `0.001` en PieceMesh son drift dentro de la drift. Centralizarlas en un módulo es trabajo proporcional al beneficio.

### Por qué confianza media (no alta)

- No verifiqué exhaustivamente todos los consumers de BodyMeasurements; podría haber sites donde la cm-implicit semantics se rompe sutilmente.
- No conozco las prioridades del equipo respecto a *engineering uniformity vs industry convention* — Sam puede tener data de usuarios o roadmap que invalida mi razonamiento.
- Opción B genuinamente sería más limpia engineering-wise; mi rechazo se basa en risk assessment, no en preferencia técnica.

---

## 5. Mapa de dependencias río abajo

C6 destrabaría / afecta a estos ejes futuros (sin resolverlos en este doc):

### C8 — Mesh import bypass (mecánico, en cola)
- Estado: BUG-9 inline'd, esperando C6 para arrancar.
- Acoplamiento: el normalizer canónico `meshImporter.importMesh` retorna `heightMm`. Si C6 = mm en BodyMeasurements, C8 no necesita conversion al hookear avatares importados a measurements. Si C6 = cm, C8 necesita explicit conversion.
- **Esperando C6 antes de arrancar.**

### C5 — Coord systems / transforms (b, en cola)
- Estado: pendiente.
- Acoplamiento: C5 diseña conversion infra entre pattern-space (mm), world-space (m), screen-space (px). Si C6 = cm, C5 hereda la cm↔m conversion como una función adicional. Si C6 = mm, C5 solo necesita mm↔m.
- **C5 puede empezar después de C6 sin acoplamiento bidireccional.** (Verificado durante esta investigación — los espacios coordenados son ortogonales a la unit choice de body data.)

### B6-state — Persistencia (b, en cola)
- Estado: pendiente, BUG-10 nota previa pendiente.
- Acoplamiento: B6-state decide IDB vs localStorage strategy. Si C6 introduce migration shim (Opción B), B6-state necesita coordinarse con la versioning del avatar storage. Si C6 = Opción A, no hay coordinación necesaria.
- **C6 puede landar antes de B6-state si elegimos A**; si elegimos B, B6-state debe estar definido primero para evitar duplicar el versioning logic.

### D3 — Forms / inputs / MeasurementInput (b, en cola)
- Estado: pendiente.
- Acoplamiento: D3 decide si crear un componente reutilizable `MeasurementInput` que abstrae unit conversion. La existencia/forma de ese componente depende de C6:
  - Opción A: `MeasurementInput` puede ser thin (cm para body, mm para pattern; el caller elige).
  - Opción B: `MeasurementInput` siempre trabaja en mm internamente; convierte a `editor.units` para display.
  - Opción C: `MeasurementInput` toma `Mm` o `Cm` como type; type-safe conversion automática.
- **D3 espera C6 antes de empezar.**

### Issues actuales que C6 resuelve / informa

- **#627** TS error `avatarLibrary.ts:70` — Opción A legitima con cast explícito; Opción B simplifica a no-cast; Opción C lo elimina por construction. Cualquier opción cierra la drift que causa el TS error, pero no necesariamente cierra #627 (que cubre 7 errors más).
- **BUG-12 #615** `defaultSeamAllowanceWidth` hardcoded — adyacente a C6 pero no resuelto por C6. Es el mismo síntoma de "unit implícita por convención" pero en un valor mm.

---

## 6. Preguntas concretas para Sam

Antes de avanzar a la migración (que es eje C6 implementación, en cola), necesito tres respuestas:

### Q1 — Industry vs engineering convention: ¿cuál priorizar para body data?

Si engineering uniformity (mm everywhere) es la prioridad → Opción B.
Si industry convention (cm for body) es la prioridad → Opción A.
Mi recomendación: A. ¿Confirmás o invalidás?

### Q2 — ¿Hay avatar profiles persistidos en producción que sería problemático migrar?

Si **sí** (usuarios reales con datos en disco/IDB que no se pueden romper):
- Opción A es claramente mejor (cero migración).
- Opción B requiere shim production-ready con telemetry.

Si **no** (proyecto pre-launch o datos solo de testing):
- Opción B es viable sin riesgo de production breakage.

### Q3 — ¿Branded types están en el roadmap del equipo?

Si **sí, eventualmente** → Opción C es el endpoint pero introducirlo ahora junto con C6 es prematuro. Hacer A, dejar branded types para una iniciativa propia más adelante.
Si **no, nunca o por ahora no** → Opción A descarta C definitivamente.
Si **sí, ya** → Opción C entra en juego como alternativa real.

---

## 7. Lo que NO sigue de este doc

- **No hay plan de migración.** Tras tu decisión, abro un follow-up doc `drift-fase2-c6-units-migration.md` con el plan detallado SI Opción B o C son elegidas. Si elegís A, la migración es trivial (centralizar 6 sitios de `/100`) y va al lugar normal de mecánicos.
- **No abro issues nuevas.** La decisión es input para C6 implementation, que tiene su propio commit/issue cuando lande.
- **No toco código.** Working tree intacto post-CLAUDE.md commit.

---

---

## 8. Decisión final + reformulación (post-Sam, 2026-04-28)

### Decisión: **A. Confianza alta** (Sam corrigió mi confianza media → alta).

### Reformulación clave del axis

Mi formulación inicial planteó C6 como "cm vs mm para BodyMeasurements". **Eso es incorrecto.** El drift de C6 no es la elección de unidad — `BodyMeasurements` en cm es la decisión correcta de antemano:

- **Fashion CAD usa cm universalmente** para body measurements.
- **La usuaria de dominio del proyecto trabaja mentalmente en cm.** Migrar a mm rompe el mental model de quien efectivamente diseña con el software.
- Cualquier engineering uniformity ganada con mm es estética; un mental model roto es UX rota.

**El drift real de C6 es las conversiones scatter** (`/100`, `/1000`, `*0.001`, `*0.01` distribuidas por el codebase). Esas son lo que la implementación de C6 (cuando llegue su turno en la cola) tiene que centralizar — sin tocar la unidad.

### Implicaciones para los ejes downstream (con la reformulación)

**Para C5 (cuando arranque):** C5 es donde viven los helpers de conversión, no C6. La API de conversión `cm↔mm`, `cm↔m`, `mm↔m` se diseña en `src/utils/coords/` o el módulo equivalente que C5 establezca. C6 no inventa esa API; solo ratifica la unidad.

**Para C8 mecánico:** consumirá la API que C5 establezca. Mientras C5 no esté implementado, C8 espera.

**Para D3:** el componente `MeasurementInput` puede asumir cm como storage para body data y mm para pattern data — la conversión a la unidad de display (`editor.units`) sigue siendo responsabilidad de la UI layer.

**Para B6-state:** sin migración de avatar storage. El formato persistido sigue igual.

### Branded types — decisión separada

Sam: "No para C6. Mantenelos en consideración para C5, donde son más justificables — `PatternSpace` vs `WorldSpace` vs `ScreenSpace` son distinciones espaciales que el compiler puede atrapar de forma valiosa. `Mm` vs `Cm` solo tiene valor si hay riesgo real de mezclar las dos en cálculos, lo cual el centralizado de conversiones (que es la cosa que C6-impl tiene que hacer) elimina por construcción. C5 RFC va a hacer esa pregunta de forma natural."

Anotado: branded types entran al alcance del C5 RFC, no al de C6.

### Lo que la implementación de C6 debe hacer (cuando le toque)

1. Crear `src/utils/units/bodyConversions.ts` (o colocación que C5 RFC determine) con funciones nombradas para las conversiones cm↔mm y cm↔m que actualmente viven inline.
2. Reemplazar los ~6 sitios de `m.height/100`, `m.chest/100`, etc. en `garmentPlacement.ts` con llamadas a esas funciones.
3. Reemplazar los `*0.01`/`*0.001` magic constants en `Mannequin.tsx` y `PieceMesh.tsx` con llamadas a las funciones canónicas.
4. Documentar la decisión en CLAUDE.md (sección "Units & coords").
5. NO migrar valores de storage. NO introducir branded types (eso es C5).

Esa implementación entra a la cola de Fase 2 mecánicos en su lugar normal.

### Cierre

C6 decisión cerrada. La pregunta de "¿qué unidad?" tiene respuesta ratificada (cm para body, mm para pattern). La pregunta abierta que pasa a C5 es "¿cómo se centralizan las conversiones?". Cuando C5 RFC abra, este doc es input.

**FIN.**
