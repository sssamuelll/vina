# Notch espejo — Alcance B (par persistente + enforcement) · DISEÑO

**Fecha:** 2026-06-09 · **Estado:** APROBADO (B1) — decisiones resueltas por Samuel (2026-06-09).

**Decisiones ratificadas (Samuel):**
- **D-B0 → B1** (identidad de par persistente + re-derive on-demand). NO B-full (no viable; el amendment a D-2 del spec previo es demostrablemente incorrecto por el doble-signo). B2 (enforcement edit/delete) queda como upgrade futuro explícito, no ahora.
- **D-B5 → aceptar el límite de tamaño base** (las variantes gradeadas no llevan par re-derivable; no corrompe, solo no cubre — cubrirlas es B-full).
- **D-B1 → registro central de un lado** (`NotchPair` en project state, no `partnerId` en `InternalLine` — descartado por blocker 4: viaja corrupto por `mirrorInternalsX`).
- **D-B2 → GC de pares huérfanos en los reducers de borrado** (removePiece/removePieces/removeInternalLine), NO vía `@cascade` (preserva el inventario de 5 middlewares).
- **D-2 NO se amenda** (B1 no lo requiere; B1 re-deriva, nunca re-mapea).
**Eleva:** `docs/superpowers/specs/2026-06-09-notch-mirror-design.md` (Alcance C, mergeado #868) §3 (Alcance B), §5 (amendment D-2 diferido), §7 (glitches).
**Specs base (APROBADOS y FIRMADOS):**
- `docs/superpowers/specs/2026-06-07-notch-precision-design.md` — `NotchAnchor`, decisión D-2 "path manda" (irreversible).
- `docs/superpowers/specs/2026-06-09-notch-mirror-design.md` — Alcance C (one-shot + detección posicional, sin identidad).

---

## 1. Contexto

Alcance C (mergeado) entrega el one-shot del video CLO3D + verificación posicional, pero **sin identidad de par**: `mapNotchAcrossSeam` mapea un notch al edge par one-shot; `auditNotches` empareja por POSICIÓN infiriendo el par por mejor-match. La correspondencia se **deriva** de geometría + seam en cada lectura, nunca se almacena.

Samuel quiere ahora **Alcance B**: identidad de par PERSISTENTE ("este notch en A ES el espejo de aquel en B") + ENFORCEMENT (editar/mover/borrar uno actualiza el par) + sobrevivir grading y mirror. El objetivo declarado sube de "paridad pragmática" al **diferenciador** (el agente detecta desbalance + crea/mantiene el par — lo que CLO3D no hace).

La pregunta de fondo de este spec no es "cómo persistir el par" sino **"¿qué forma de B SOBREVIVE el runtime?"**. El análisis previo (Halberg) marcó "B-full NO sobrevive el runtime tal como está descrito — corrompe estado bajo grading-no-uniforme y choca con el matching-por-índice del linked editing". Este spec abre el espectro en tres sub-alcances con mecanismo concreto, somete cada uno al gate de runtime, y recomienda el de mayor identidad que sobrevive.

**Hallazgo estructural que atraviesa todo el documento (Meta-Architect, verificado):** la identidad del par de notches **no es una propiedad del notch — es del SEAM más una posición de arc-length**. `mapNotchAcrossSeam` (`notchMirror.ts:116-170`) deriva el lado B entero de `(sourcePiece, point, seams)` SIN consumir ningún `lineId` del lado B. El lado B es `f(lado A, seam)`, no una entidad coordinada con él. Por eso cualquier registro que guarde dos `lineId` (`a.lineId`, `b.lineId`) sobre-especifica la relación por un factor de dos — `b.lineId` es derivable, no fundamental, y por eso queda colgando (necesita garbage-collect). La identidad mínima honesta es `{ seamId, sense }` sobre el notch de origen, no un registro de dos lados.

---

## 2. Estado / blockers verificados (leído en código, 2026-06-09)

Los seis blockers son REALES. Verificados en código por dos pasadas independientes + cuatro críticas técnicas convergentes.

| # | Blocker | Real | Evidencia en código |
|---|---------|------|---------------------|
| 1 | **Halberg (runtime):** B-full no sobrevive sin re-arquitectura | SÍ | Confirmado en los 4 frentes abajo. B1 sobrevive trivial; B2 sobrevive condicionado; B-full no-viable. |
| 2 | **Grading no-uniforme:** no dispara cascade | SÍ (con matiz) | `gradePiece` (`gradingEngine.ts:139-181`) es función PURA escalar (`scaleFactor = targetVal/baseVal` del `primaryMeasurement`, L151) alrededor del centroide propio. **No dispatchea.** El dispatch real es `addPiece(gradedPiece)` con id NUEVO en `GradingTab.tsx:198-208`. `addPiece` NO está en `SYNCED_ACTIONS` (`linkedEditingMiddleware.ts:8-15`) ni en `PIECE_MODIFYING_ACTIONS` de `gradingStalenessMiddleware`. Matiz: el cascade no se silencia por "produce piezas nuevas" — falla porque **grading SIEMPRE crea variantes vía `addPiece`, acción que ningún middleware sincroniza**. Las variantes A[L]/B[L] son piezas independientes sin link entre ellas. |
| 3 | **Triple sistema de signo bajo reflexión** | SÍ | (a) `mirrorPathX` (`linkedEditing.ts:29-47`) es `.map` posicional → CONSERVA el orden de comandos, el winding GEOMÉTRICO se invierte. (b) shoelace en `resolveNotchAnchor` (`notchAnchor.ts:178-198`) y `interiorNormalAtPoint` (`notchMirror.ts:65-88`) eligen normal inward por signo de `area2` → AUTO-corrigen el winding invertido. (c) `direction` cw/ccw (`notchAnchor.ts:12-15`) se define sobre el ORDEN de comandos, NO geometría, NO se invierte. **Trampa:** re-mapear `direction` ADEMÁS del shoelace auto-corregido = doble inversión = notch hacia AFUERA. |
| 3b | **`mirrorInternalsX` dropea el anchor a propósito** | SÍ | `linkedEditing.ts:57-67`: `const { notchAnchor: _dropped, ...rest } = line`. Doc-block lo nombra "the future anchor-manda upgrade". |
| 4 | **Linked editing empareja internals por ÍNDICE** | SÍ | `syncUpdateInternalLine` (`linkedEditingMiddleware.ts:180-202`): `partner.internals[sourceIdx]`. `addInternalLine` está en `SYNCED_ACTIONS` (:10) → un enforcement que dispatchee sobre una pieza con `linkedPieceId+linkMode` añade un notch extra o toca el internal equivocado. |
| 5 | **Cascade convention (@cascade depth≤1, 5 middlewares, meta-flags)** | SÍ — RATIFICADO, no propuesta | CLAUDE.md row B3-state ratifica la convención + ya implementada en los 5 middlewares con headers `@cascade` reales. `store/index.ts:80` wirea exactamente 5. Un enforcement de par sería el 6to y DEBE conformar (header, depth≤1, undo-batch para sym 1↔1 por §3.3.A). |
| 6 | **El modelo no tiene identidad de par** | SÍ | `NotchAnchor` (`types.ts:246-250`) = `{refPoint, direction, distanceMm}` — sin `pieceId`/`partnerId`/`id`. `grep partnerId|NotchPair|fromPartnerSync` sobre `src/` = 0 hits. |

### 2.1 Hechos load-bearing adicionales (no en el brief original)

- **GradingTab NO crea seams entre variantes.** `grep addSeam` en `GradingTab.tsx` = 0 hits; solo `addPiece` + `setGradingResult`. Los `Seam` referencian piezas por `pieceId` (`types.ts:351-353`), así que NINGÚN seam apunta a A[L]/B[L]. `mapNotchAcrossSeam` depende de `findSeamForEdge(pieceId)` (`notchMirror.ts:129`) → **retorna no-seam sobre variantes gradeadas**. Esto es decisivo para B-full.
- **`removePiece`/`removePieces` YA ejercen el patrón de garbage-collect cross-ref.** `removePiece` (`projectSlice.ts:396-413`) filtra `seams`/`elastics`/`trims`/`poms`/`groups`/`arrangementOverrides` por `pieceId`. `removePieces` (:415-439) hace lo mismo + `seamGroups`/`pleats`. Añadir `state.notchPairs` a esa lista es UNA línea por reducer.
- **`removeInternalLine` NO limpia ninguna colección externa hoy** (`projectSlice.ts:486-493`). Ahí sí hay adición neta (~2 líneas de filtro).
- **`removeInternalLine` está EXCLUIDO de `willCascade` de linkedEditing** (`linkedEditingMiddleware.ts:46`: `if (action.type === 'project/removeInternalLine') return false`). Esto FAVORECE usar `removeInternalLine` en el delete-cascade de B2 — no cruza con linkedEditing.
- **`willCascade` NO lee meta-flags ajenos** (`linkedEditingMiddleware.ts:44-50`); el guard es el boolean module-level `isSyncing` (:6,87,103), que protege re-entrada del MISMO middleware, NO un middleware ajeno re-entrando.
- **Los 2 meta-flags existentes** (`confirmationMiddleware.ts:118,149` — `skipConfirmation`, `fromToolMemory`) son para RE-ENTRADA DEL MISMO middleware; `fromPartnerSync` sería el primero CROSS-middleware (y el 3ro del store).
- **`Seam` no tiene campo de orientación** (`types.ts:348-373`); `reverseSeam` (`projectSlice.ts:770`) es inversión manual de rol A↔B, no orientación de primera clase.

---

## 3. Sub-alcances

Cada uno con mecanismo concreto + cómo maneja grading y mirror (los dos puntos de corrupción).

### B1 — Identidad de par persistente + RE-DERIVAR posición on-demand (nunca re-mapea a través de transforms) · tamaño S

**Mecanismo.** El par se persiste SOLO como conocimiento ("A es el espejo de B"), nunca como posición mantenida a través de transforms.

1. **Identidad:** registro central `notchPairs?: NotchPair[]` en `OpenCloProject` (`types.ts`, calca la forma de `seams: Seam[]`). Forma honesta-mínima: `NotchPair { id, source: { pieceId, lineId }, seamId, sense: 'direct'|'inverted' }`. (Ver DECISIÓN PENDIENTE D-B1 sobre uno-lado vs dos-lados.)
2. **Creación:** `createMirrorNotchLine` (`notchMirror.ts:178`) sigue construyendo el notch independiente como hoy (Alcance C); ADEMÁS registra el `NotchPair` con el `sense` que el humano eligió vía el toggle F3 mergeado.
3. **Re-derivación on-demand:** cuando algo necesita saber dónde DEBERÍA estar el espejo (un audit, un botón "re-sincronizar", un ghost), se RE-DERIVA llamando `mapNotchAcrossSeam(sourcePiece, point, seams, pieces, { invert: pair.sense === 'inverted' })` sobre la geometría ACTUAL. La posición NUNCA se almacena ni se propaga.
4. **Verificación:** `auditNotches` (ya posicional) gana la capacidad de verificar un par DECLARADO en vez de inferir cardinalidad por mejor-match → resuelve la ambigüedad D-M6 (falsos positivos en edges casi simétricos).
5. **Garbage-collect:** limpieza de pares huérfanos en los reducers de borrado (NO middleware — ver §veredicto).

**Maneja grading:** No re-mapea `frac` a través del grade → §7.2 esquivado por construcción. PERO el par NO sobrevive a las variantes gradeadas: `addPiece` crea piezas nuevas sin seam entre ellas ni `NotchPair` heredado → `mapNotchAcrossSeam` no resuelve sobre A[L]/B[L]. **B1 cubre solo el tamaño base.** No corrompe (no propaga), solo no cubre.

**Maneja mirror:** No re-mapea `direction` → §7.1 esquivado por construcción. `mirrorInternalsX` SIGUE dropeando el anchor sin cambio. El `NotchPair` vive FUERA del `InternalLine` → el mirror nunca lo toca; al re-derivar, el shoelace del outline espejado reconstruye el normal correcto. **needs_d2_amendment: false.**

### B2 — Identidad + enforcement @cascade SOLO en edit/delete (grade y mirror re-derivan, no propagan) · tamaño M

**Mecanismo.** B1 + un 6to middleware `@cascade` (`notchPairMiddleware`) que escucha SOLO `updateInternalLine` y `removeInternalLine`.

1. Al editar un notch lado-A (o lado-B) de un `NotchPair`: (a) abre undo batch (`startBatch` antes de `next`, patrón `linkedEditingMiddleware.ts:99` — sym 1↔1 cae bajo §3.3.A); (b) lee `sourcePiece+point` post-acción; (c) RE-DERIVA el espejo vía `mapNotchAcrossSeam` con `pair.sense`; (d) `dispatch(updateInternalLine)` sobre el lado opuesto usando el **lineId GUARDADO en el NotchPair** (NO por índice — esto evita el blocker 4 dentro de su propio middleware) con el path re-generado.
2. En delete: `dispatch(removeInternalLine)` sobre el par + limpia el `NotchPair`. **`removeInternalLine` está excluido de `willCascade` de linkedEditing (:46) → el delete NO cruza con linkedEditing.**
3. **Guard:** boolean module-level `isSyncing` (P1 canónico para sym 1↔1, igual que linkedEditing — NO meta-flag para la re-entrada propia).
4. **cap-depth 1:** el `updateInternalLine` que emite NO re-dispara enforcement (`isSyncing` lo bloquea).
5. grade + mirror NO se escuchan → re-derive on-demand (mecanismo B1).

**El cruce blocker4×blocker5 (la deuda real de B2, NO un "toque aislado"):** `updateInternalLine` está en `SYNCED_ACTIONS` de linkedEditing (`:12`). Si la pieza par tiene `linkedPieceId+linkMode`, el `dispatch` del enforcement dispara TAMBIÉN linkedEditing → empareja por índice → notch equivocado o extra. El `isSyncing` de linkedEditing NO protege (es OTRO middleware re-entrando). **Mitigación válida:** añadir a `willCascade` de linkedEditing un early-return `if (action.meta?.fromPartnerSync) return false` + marcar los dispatches del enforcement con `meta.fromPartnerSync`. Esto TOCA un middleware ratificado (B3-state) + introduce el 3er meta-flag del store. Justificación contra §4.3: el problema es CROSS-middleware (coordinación entre dos), no re-entrada del mismo — por eso no basta el boolean `isSyncing` que el precedente sym 1↔1 usa.

**Maneja grading:** idéntico a B1 — no se escucha `addPiece`; variantes sin cubrir.
**Maneja mirror:** `mirrorInternalsX` SIGUE dropeando el anchor; el enforcement re-deriva (nunca re-mapea `direction`) → §7.1 esquivado. **needs_d2_amendment: false** (re-deriva, no re-mapea).

### B-full — Enforcement a través de TODO (edit + delete + grade + mirror) · tamaño L · Halberg: NO-VIABLE sin re-arquitectura

**Mecanismo.** B2 + propagación a través de los dos transforms que son los puntos de corrupción:

- **(A) GRADING dispara re-sync.** Como `addPiece` no se sincroniza, exige O (a1) que el grade copie el `NotchPair` a cada par de variantes A[size]/B[size] **Y RE-CREE seams entre las variantes gradeadas (HOY NO EXISTEN)** para que `mapNotchAcrossSeam` tenga seam que resolver; O (a2) meter `addPiece` en un `SYNCED_ACTIONS` (cambio a la convención).
- **(B) MIRROR re-mapea el anchor** (invertir `mirrorInternalsX`) — lo que el amendment §5(2)(4) describe.
- **(C) IDENTIDAD-NO-ÍNDICE:** reemplazar `partner.internals[sourceIdx]` por matching estable por id (`linkedEditingMiddleware.ts:182,193`) — cambio a middleware ratificado con cobertura Epic-746.
- **(D) ORIENTACIÓN de seam como dato de primera clase** (`Seam.reversed` o inferencia por tangentes) tocando `matchVertices`/`walkSeam`/`autoSew` — riesgo de regresión en el cosido XPBD (3 superficies).

**Maneja grading:** corrupción matemáticamente garantizada bajo `scaleFactor` heterogéneo. Si A y B tienen categorías/centroides distintos, mantener `frac_A == frac_B` es IMPOSIBLE; el único camino no-corrupto re-deriva, y re-derivar necesita los seams entre variantes que no existen. **Es motor de grading, no middleware.**
**Maneja mirror:** **el amendment §5 literal es DEMOSTRABLEMENTE incorrecto.** Re-mapear `direction` cw↔ccw + shoelace que ya auto-corrige = doble inversión = notch hacia afuera. **El único camino viable de "enforcement a través de mirror" es NO re-mapear sino RECOMPUTAR desde el winding real (`interiorNormalAtPoint`) — que es exactamente el re-derive de B1.** Paradoja confirmada: el camino correcto en mirror NO necesita el amendment §5 que el spec redactó; necesita uno DISTINTO (recompute), o ninguno.
**needs_d2_amendment:** el spec marca `true`, pero **engañoso** — el texto §5(2)(4) firmado-condicionalmente describe el mecanismo INCORRECTO. B-full tendría que RE-ESCRIBIRLO, no aplicarlo.

---

## 4. Veredicto de runtime (Halberg — el gate)

> **El sub-alcance de MAYOR identidad que sigue runtime-safe es B2, y solo dentro de su frontera declarada (edit/delete sobre tamaño base).**

| Sub-alcance | Veredicto | Frontera de validez |
|---|---|---|
| **B1** | **SOBREVIVE** (trivial y demostrable) | Nunca mantiene posición a través de transforms; re-deriva sobre geometría viva vía `mapNotchAcrossSeam`. Cero middleware nuevo → no toca @cascade, no cruza linked-by-index. **PERO no es enforcement:** "editar uno marca el par divergente + ofrece re-derivar (1 click)", NO "editar uno actualiza el par solo". |
| **B2** | **SOBREVIVE-CONDICIONADO** | Solo si respeta TRES invariantes no-negociables: (1) emparejar por **lineId-en-NotchPair**, NUNCA por índice; (2) cortar el cruce blocker4×blocker5 con guard `meta.fromPartnerSync` en `willCascade` de linkedEditing; (3) usar `removeInternalLine` para delete (excluido de `willCascade`, evita el cruce). Registrarse DESPUÉS de linkedEditing y ANTES de undo (orden load-bearing). NO cubre variantes gradeadas. Degrada limpio a B1 si el middleware da problemas. |
| **B-full** | **NO-SOBREVIVE** sin re-arquitectura | Cuatro frentes independientes: (A) grading sin seams entre variantes + `scaleFactor` heterogéneo = corrupción matemática garantizada; (B) amendment §5 produce notches hacia afuera; (C) matching-por-id en middleware ratificado; (D) orientación de seam toca cosido XPBD. Costo L confirmado. |

**La trampa que el arquitecto internaliza:** el camino correcto en mirror para B-full ES el re-derive de B1. Cualquier versión de B que funcione bajo mirror lo hace **recomputando, no re-mapeando**. El re-derive es la verdad; el enforcement-through-transform es la ilusión de que el acuerdo se puede congelar.

**Punto de runtime adicional verificado:** el garbage-collect de pares huérfanos NO puede ser un @cascade (sería el 6to middleware sin justificación) — debe vivir en los reducers de `removeInternalLine`/`removePiece`/`removePieces` (donde el patrón `.filter` cross-ref ya existe) o en un selector que filtre pares con `lineId`/`pieceId` muerto al leer.

---

## 5. Recomendación + rationale

> **Recomendado: B1 ahora (cimiento runtime-safe garantizado), con B2 como upgrade explícito SOLO si Samuel confirma que necesita el "editar uno actualiza el par" automático y acepta tocar el middleware ratificado linkedEditing.**

### Peso de la evidencia (cinco roles convergen)

- **Orchestration Judge (el gate):** "B1 SOBREVIVE el runtime; B2 SOBREVIVE condicionado; B-full NO SOBREVIVE sin re-arquitectura de 4 subsistemas. El amendment §5 es demostrablemente incorrecto. El de mayor identidad runtime-safe es B2, solo en su frontera."
- **Meta-Architect:** "La identidad del par no vive en el notch — vive en el seam. B1 es identidad real (seamId+sense) pero sobre-especificada si guarda dos lineId. B2 cumple el requirement con el mínimo daño, no limpiamente (reabre un middleware ratificado). B-full pide que el seam exista donde el sistema decidió que no exista."
- **Hacker:** "B1 y B-full-hecho-bien convergen al MISMO mecanismo (recompute sobre winding vivo). La diferencia no es el mecanismo — es cuántos subsistemas hay que sincronizar para dispararlo. El enforcement-through-transform es la ilusión; el re-derive es la verdad."
- **Principal Analyst:** "B1 sobrevive sin tocar nada ratificado pero no es enforcement. B2 entrega enforcement-at-edit real pero paga un toque a linkedEditing + el 3er meta-flag + 3 decisiones bloqueantes. B-full no-viable."
- **Calibrator:** "B1=S, B2=M, B-full=L. El salto de costo NO es B1→B2 (un escalón) — es B2→B-full (4 subsistemas + reescritura de un amendment firmado). El riesgo es importar la meta 'diferenciador' como licencia para saltar a B-full cuando B1 ya entrega identidad-declarada + detección proactiva."

### Por qué B1 primero

B1 es la adición neta más pequeña (~40-90 líneas), reusa la maquinaria de Alcance C ya mergeada y probada (`mapNotchAcrossSeam` tiene 4 callsites de producción vivos), no introduce ningún punto de mutación en el runtime caliente (re-deriva, no mantiene), y **es el cimiento exacto de B2** (B2 = B1 + un middleware). Cierra el agujero conceptual de Alcance C: hoy `auditNotches` INFIERE el par por mejor-match (falso-positiva en edges casi simétricos); con `NotchPair` el par es DECLARADO. Eso es identidad real, no `partnerId` decorativo — aunque sin propagación automática.

### Por qué B2 como upgrade explícito, no por defecto

B2 entrega el "editar uno actualiza el par" del requirement en el 80% del uso (edición interactiva, tamaño base). PERO no es "añadir un middleware aislado": el cruce blocker4×blocker5 obliga a tocar `willCascade` de linkedEditing (middleware ratificado) + introducir el 3er meta-flag del store con su documentación obligatoria en CLAUDE.md y justificación contra §4.3. Es decisión de gobernanza, no solo técnica. Por eso se ofrece como upgrade que Samuel confirma, no como default.

### Por qué NO B-full

B-full va más allá de la paridad pragmática ratificada del proyecto y exige construir infraestructura que hoy no existe: seams entre variantes gradeadas (un proyecto en sí), orientación de seam de primera clase (riesgo en cosido XPBD), matching-por-id en linkedEditing (cambio a middleware con cobertura Epic-746), y la reescritura de un amendment a un spec firmado por Samuel. El amendment §5 literal produce notches hacia afuera. **Es decisión de MODELO de Samuel, no técnica — el runtime no la toma por él.** Queda fuera hasta que existan "seams entre variantes" y "orientación de seam de primera clase" como dos proyectos independientes.

### Axiom-0

Silencio. No hubo intervención de Axiom-0; la recomendación se sostiene solo sobre el peso de la evidencia técnica y el gate de runtime.

---

## 6. Amendment a D-2

> **El sub-alcance recomendado (B1, y también B2) NO necesita amendment a D-2 ni a la fila D1-real de CLAUDE.md.**

Razones, verificadas en código:

- B1/B2 crean notches con su propio `path` congelado y su propio anchor recalculado en B → "path manda" (D-2 Opción 1) sigue intacto en ambas piezas.
- B1/B2 NO tocan `mirrorInternalsX` (`linkedEditing.ts:57-67`) → la política de dropear el anchor bajo mirror se conserva. El par vive FUERA del `InternalLine` (registro central) → el mirror nunca lo toca; al re-derivar, el shoelace reconstruye el normal correcto.
- B1/B2 NO re-mapean `direction` → el triple-signo (§7.1) nunca se activa.
- El doc-block de `NotchAnchor` (`types.ts:237-244`) YA contempla "manual pair-matching" como uso del anchor; B1/B2 lo persisten como identidad declarada sin reificar parametricidad nueva en el campo. La fila D1-real ("path remains render/export truth per D-2") sigue exacta.

**B1/B2 son aditivos sobre el contrato vigente, no una contradicción. La única superficie nueva es un registro central de proyecto (`notchPairs`), del mismo orden que `seams`/`poms`/`trims`.**

> **CORRECCIÓN al amendment §5 redactado para B-full:** el texto §5(2) y §5(4) del spec mirror (re-mapear `direction` bajo reflexión) es **demostrablemente incorrecto** bajo el triple-signo verificado. Si Samuel alguna vez subiera a B-full, **NO debe aplicarse el texto firmado-condicionalmente — debe RE-ESCRIBIRSE** para decir "recompute desde el winding real" en vez de "re-map direction". El amendment a D-2 que el spec mirror redactó está mal en su propia letra para la parte de mirror. (Esto NO bloquea B1/B2, que no requieren amendment alguno.)

---

## 7. Decisiones pendientes (Samuel)

> **DECISIÓN PENDIENTE (Samuel) — D-B0 · Sub-alcance.** ¿B1 (identidad declarada + re-derive on-demand), B2 (B1 + enforcement-at-edit), o B-full (enforcement a través de todo)?
> **Default recomendado: B1.** Runtime-safe garantizado, cero toque a canónico ratificado, cimiento exacto de B2. Subir a B2 solo si confirmas que necesitas el "editar uno mueve el par automático" y aceptas el toque a linkedEditing + 3er meta-flag. B-full queda fuera (4 subsistemas + amendment mal redactado + decisión de modelo, no técnica).

> **DECISIÓN PENDIENTE (Samuel) — D-B1 · Forma del registro de identidad.** ¿`NotchPair { id, source:{pieceId,lineId}, seamId, sense }` (un-lado, el par es f(source, seam)) o `NotchPair { id, a:{pieceId,lineId}, b:{pieceId,lineId}, seamId, sense }` (dos-lados)?
> **Default recomendado: un-lado (`source` + `seamId` + `sense`).** El Meta-Architect verificó que `mapNotchAcrossSeam` deriva el lado B sin consumir ningún `lineId` de B → el `b.lineId` es derivable, no fundamental, y por eso queda colgando (garbage-collect). Guardar un solo lado minimiza la superficie de pares huérfanos. `partnerId`-DENTRO-de-InternalLine queda DESCARTADO por evidencia dura: viajaría por el `.map` de `mirrorInternalsX` apuntando a un `lineId` regenerado inexistente (blocker 4).

> **DECISIÓN PENDIENTE (Samuel) — D-B2 · Garbage-collect de pares huérfanos.** ¿Limpieza en los reducers de borrado, o selector que filtra pares inválidos al leer?
> **Default recomendado: reducers de borrado.** `removePiece`/`removePieces` (`projectSlice.ts:396-439`) YA ejercen el patrón `.filter` cross-ref — añadir `state.notchPairs` es una línea por reducer. `removeInternalLine` (:486-493) gana ~2 líneas de filtro. NO puede ser un @cascade (violaría el inventario de 5). Un selector defensivo al leer es complemento opcional, no sustituto.

> **DECISIÓN PENDIENTE (Samuel) — D-B3 · (solo si B2) Delete de UN lado del par.** Borrar el notch de A borra el de B automáticamente. Si solo querías quitar uno, el enforcement borra los dos. ¿Confirmación previa, o modo "romper par" explícito?
> **Default recomendado: modo "romper par" explícito** (acción que disuelve el `NotchPair` sin borrar geometría) + delete-cascade solo cuando el par sigue activo. Es UX irreversible; conviene que romper el vínculo sea una acción distinta de borrar el notch.

> **DECISIÓN PENDIENTE (Samuel) — D-B4 · (solo si B2) El 3er meta-flag + toque a linkedEditing.** ¿Se acepta añadir `meta.fromPartnerSync` (3er meta-flag del store) + el guard en `willCascade` de linkedEditing (middleware ratificado B3-state)?
> **Default recomendado: SÍ, con documentación obligatoria.** Documentar `fromPartnerSync` en CLAUDE.md "Action meta flags" + justificar (es CROSS-middleware, no re-entrada del mismo — por eso no basta el boolean `isSyncing` del precedente). Actualizar el inventario "5 middlewares" → 6 en la fila B3-state de CLAUDE.md. Sin esta decisión cerrada, B2 choca con canónico ratificado.

> **DECISIÓN PENDIENTE (Samuel) — D-B5 · Destino de variantes gradeadas.** B1/B2 cubren solo el tamaño base (las variantes son piezas nuevas sin seam ni `NotchPair` heredado). ¿Se acepta que el diferenciador desaparece al gradear?
> **Default recomendado: aceptar el límite (mismo techo que Alcance C).** Cubrir variantes es B-full (seams entre variantes + motor de grading reescrito). No corrompe — solo no cubre. Decisión de PRODUCTO, no técnica.

---

## 8. Plan de implementación (B1 recomendado; B2 marcado como upgrade)

### B1 (S)

1. **F1 — Modelo `NotchPair` (XS).** Interface `NotchPair` (~6 líneas en `types.ts` junto a `NotchAnchor:246-250`) + campo `notchPairs?: NotchPair[]` en `OpenCloProject` (calca `seams: Seam[]`). Forma según D-B1 (default un-lado).
2. **F2 — Reducers de registro (S).** `addNotchPair`/`removeNotchPair`/`breakNotchPair` en `projectSlice` (~20 líneas). Persistencia vía el envelope opt-in existente (shape comment en el callsite de `storageSet`).
3. **F3 — Garbage-collect (S).** Añadir filtro `state.notchPairs` a `removePiece`/`removePieces` (1 línea c/u) + a `removeInternalLine` (~2 líneas). Según D-B2.
4. **F4 — Re-derive on-demand (XS, reuso puro).** Invocar `mapNotchAcrossSeam` con `pair.sense` desde el botón "re-sincronizar" / ghost preview. CERO geometría nueva (`mapNotchAcrossSeam`/`createMirrorNotchLine`/`interiorNormalAtPoint` ya mergeados y probados).
5. **F5 — `auditNotches` con par declarado (M).** Modificar para verificar un par DECLARADO (lee `notchPairs`) en vez de inferir cardinalidad. Resuelve falsos positivos en edges casi simétricos.
6. **F6 — Tests + doc (XS).** Tests de registro + GC + audit con par declarado/divergente. Sin amendment a D-2. Añadir el spec al índice de Architecture en CLAUDE.md.

### B2 (upgrade, M — solo si D-B0 = B2)

7. **F7 — `notchPairMiddleware` (M).** 6to middleware `@cascade` (~80-110 líneas, plantilla `linkedEditingMiddleware.ts:73-202`): header `@cascade` conforme, guard `isSyncing` boolean, `startBatch`/`endBatch`, handlers `updateInternalLine`+`removeInternalLine` emparejando por **lineId guardado en NotchPair**. Registrar en `store/index.ts:80` DESPUÉS de linkedEditing, ANTES de undo (documentar el invariante de orden).
8. **F8 — Guard cross-middleware (S, toca ratificado).** Early-return `if (action.meta?.fromPartnerSync) return false` en `willCascade` de linkedEditing (`:44-50`) + 3er meta-flag documentado en CLAUDE.md "Action meta flags". Según D-B4.
9. **F9 — Modo "romper par" + delete-cascade (S).** Según D-B3. `removeInternalLine` (excluido de `willCascade` de linkedEditing) para el delete del par.

---

## 9. Out-of-scope

- **B-full completo** — enforcement a través de grade + mirror. Requiere seams entre variantes gradeadas (proyecto independiente) + orientación de seam de primera clase + matching-por-id en linkedEditing. Fuera hasta que esos dos proyectos existan.
- **Invertir `mirrorInternalsX`** — sigue dropeando el anchor; el par se re-deriva, no se mantiene a través del mirror.
- **`Seam.reversed` / orientación de primera clase** — B-full; B1/B2 usan el `sense` humano one-shot + shoelace en re-derive.
- **Seams entre variantes gradeadas** — no existen hoy; crearlos/mantenerlos es motor de grading.
- **Re-mapeo de `direction` bajo mirror (amendment §5 literal)** — DESCARTADO: produce notches hacia afuera (triple-signo).
- **Re-proyección continua bajo edit de outline** — sigue fuera de scope (la otra mitad de "anchor manda", ni B-full la requiere).

---

## 10. Glitches a manejar

| # | Glitch | Aplica a | Manejo en el alcance recomendado |
|---|--------|----------|----------------------------------|
| 7.1 | **Triple sistema de signo** (orden de comandos conserva / shoelace auto-invierte / `direction` no se invierte) | solo B-full | **Esquivado por construcción** en B1/B2: re-derive recomputa el normal desde el shoelace del winding real; nunca re-mapea `direction`. |
| 7.2 | **Corrupción silenciosa bajo grading no-uniforme** (`scaleFactor` escalar por pieza + `addPiece` sin cascade) | solo B-full | **Esquivado por construcción** en B1/B2: no propagan a través del grade. Costo: variantes sin cubrir (D-B5). |
| — | **`mirrorInternalsX` dropea el anchor** | todos | B1/B2 lo dejan intacto; el par re-deriva tras mirror. No requiere amendment. |
| 4 | **Linked editing por índice** | solo B2 | El enforcement empareja por **lineId-en-NotchPair**, no por índice; el cruce con linkedEditing se corta con `meta.fromPartnerSync` en `willCascade` + delete vía `removeInternalLine` (excluido de `willCascade`). |
| 5 | **6to middleware + cascade convention** | solo B2 | Header `@cascade` conforme, depth≤1 vía `isSyncing`, undo-batch (§3.3.A), inventario actualizado a 6 en CLAUDE.md. |
| — | **Garbage-collect de pares huérfanos** | B1/B2 | Reducers de borrado (patrón `.filter` cross-ref ya existente), NO @cascade. |
| 7.3 | **Anchor invalidado por edits** (`refPoint` fuera del outline → fallback `path[0]`) | todos | Coherente con re-derive (lee geometría viva cada vez); documentar que la posición re-derivada puede saltar tras un edit fuerte. |
| 7.4 | **Impedancia ring↔edge** | todos | Ya manejado por `mapNotchAcrossSeam` (Alcance C). |
| 7.5 | **tStart/tEnd (cosido parcial)** | todos | Ya manejado por el helper de mapeo de Alcance C. |
| 7.6 | **edgeName semántico vs fallback regex** | todos | El re-derive reusa la resolución con fallback de Alcance C. |
| — | **Orden de registro load-bearing** | solo B2 | El middleware DEBE ir después de linkedEditing y antes de undo en `store/index.ts:80`. Documentar el invariante; frágil al refactor del orden.