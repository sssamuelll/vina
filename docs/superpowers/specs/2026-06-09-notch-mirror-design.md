# Notch espejo — el notch correspondiente entre piezas cosidas

**Fecha:** 2026-06-09 · **Estado:** APROBADO — decisiones resueltas por Samuel (2026-06-09).

**Decisiones ratificadas (Samuel):**
- **D-M1 → Alcance C** (one-shot + detección posicional, sin enforcement). NO se amenda D-2, NO se toca `mirrorInternalsX` ni el cosido XPBD.
- **D-M2 → Orientación: preview + toggle manual** (el humano decide el sentido, como CLO3D). En C el audit infiere el sentido por mejor-match. NO se crea `Seam.reversed` (eso es alcance B).
- **D-M3 → Notch fuente sin anchor: caer a `path[0]` crudo** (las mangas curvas necesitan notches).
- **D-M4 → Normal interior por convención shoelace** (`resolveNotchAnchor`), extraída a helper compartido.
- **D-M5 → Sin Seam: fallar con mensaje claro** ("crea la costura primero"). autoSew fuera de scope.
- **D-M6 → Tolerancia ~2% del arc-length del menor edge, piso ~5mm; ante empate NO afirmar correspondencia.**
**Origen:** EPIC declarado por la junta (2026-06-09). Surge del video CLO3D (Ellie, "Tips Part 4"): tras poner un notch a X distancia de una costura, la patronista crea el notch CORRESPONDIENTE en la pieza que casa, a la MISMA distancia, para que el cosido calce. En el video lo hace A MANO, one-shot, sin enforcement persistente.
**Spec previo relevante (APROBADO):** `docs/superpowers/specs/2026-06-07-notch-precision-design.md` — define `NotchAnchor` y la decisión irreversible D-2 ("path manda").
**Objetivo ratificado del proyecto:** paridad pragmática (lo mínimo que reproduce el one-shot del video). La decisión de alcance es de Samuel.

---

## 1. Contexto

El notch espejo es lo que la junta llamó **categoría relacional**: la afirmación "este notch en A ES el par de aquel en B". El modelo de OpenClo reificó identidad para casi todas las relaciones del dominio de patronaje — seams (`Seam.id`, `pieceA`/`pieceB`), pleats (`generatedLineIds`), darts (`dartEntity` bridge) — **menos para notches**. Un notch hoy es geometría pura (`path` congelado) con una nota al margen sobre cómo nació (`notchAnchor`, introducido 2026-06-07). La correspondencia entre notches de piezas distintas es la única relación estructural del dominio que el modelo nunca representó.

Eso no es un bug: es la consecuencia de que los notches entraron al sistema como render-truth (`path`) y solo recientemente ganaron intención (`anchor`). El espejo es el primer lugar donde la ausencia de esa categoría se vuelve visible. La pregunta de fondo que este EPIC plantea no es "cómo espejar un notch" sino **"cuándo deja un notch de ser un trazo y empieza a ser una entidad"**. El alcance que se elija responde a esa pregunta.

Este spec NO contradice el spec previo. El doc-block de `NotchAnchor` (`types.ts:240-241`) YA nombra "manual pair-matching" como uso legítimo del anchor, y D-2 recomendó explícitamente "(1) ahora, (2) como evolución... el campo queda diseñado para que (2) sea un upgrade, no un rediseño". El amendment (si se requiere) reabre a propósito lo que se difirió — no algo que se olvidó.

---

## 2. Estado actual verificado (leído en código, 2026-06-09)

### 2.1 El linchpin: el mapeo de posición A→B YA existe y CORRE en runtime

Esta es la pieza que la junta no asumió y que verifiqué directamente. **El mínimo one-shot es TRATABLE (S/M): cero geometría nueva.**

- **El modelo Seam SÍ empareja edges entre piezas.** `Seam.pieceA`/`pieceB = { pieceId, edgeName, tStart?, tEnd? }` (`types.ts:348-373`). Empareja por `edgeName` (nombre del `SemanticEdge`), no por índice; el rango `[start, end)` vive en `SemanticEdge.segmentRange` (`types.ts:329`). `tStart`/`tEnd` permiten cosido parcial de un sub-rango.
- **El descubrimiento del par ya está implementado.** `findSeamForEdge(pieceId, edgeName, seams)` (`useWalkSeamTool.ts:67-89`) devuelve `{ seam, pairedPieceId, pairedEdgeName }`, bidireccional A↔B.
- **El mapeo distancia A→B ya corre en pantalla.** `computeGhostTransform` (`useWalkSeamTool.ts:135-198`) hace exactamente: `frac = dS / stationaryArcLen` → `dM = frac * mobileArcLen` → `pointAtPathDistance(mobile, dM, range)`. `sampleMismatch` (`useWalkSeamTool.ts:212-239`) lo recorre a 5mm. Está probado y vivo.
- **Las utilidades arc-length por-edge existen.** `computePathArcLength` / `pointAtPathDistance` (dist→punto) / `distanceAlongPath` (punto→dist), todas con `startIdx`/`endIdx` para recortar a un solo edge vía `segmentRange` (`arcLength.ts:246-346`).
- **La plantilla de creación del notch existe.** El copilot `addNotch` (`internalTools.ts:223-297`) ya construye un `InternalLine` 'notch' completo: punto sobre el outline → normal perpendicular → `path = [M, L]` → `computeNotchAnchor` recalculado → `dispatch(addInternalLine)`.

**Conclusión del linchpin:** crear el notch correspondiente NO requiere infra de geometría nueva. Es ensamblar piezas probadas. El mínimo NO es trivial en líneas (hay tres bordes que manejar, ver §6), pero NO precede ninguna pieza de infra de geometría — esa ya está construida y corre.

### 2.2 El gap real: ORIENTACIÓN de costura (frac vs 1-frac)

El gap NO es arc-length — es sentido. **No existe dato ni heurística de orientación de costura en ninguna parte del modelo, y todo el código asume mismo-sentido implícitamente:**

- `Seam` no tiene flag de orientación (`types.ts:348-373`).
- `matchVertices` empareja por `|t − target.t|` mínimo asumiendo ambos arrays en t **ascendente** (`seamAssembly.ts:274-299`, comentario explícito "Assumes both inputs sorted by ascending t").
- `walkSeam` usa `dB = frac * lenB` directo, sin opción `1-frac` (`useWalkSeamTool.ts:155-156`).
- `reverseSeam` (`projectSlice.ts:770-778`) **NO sirve**: solo intercambia el rol A↔B, no invierte el sentido de recorrido relativo de los dos edges.
- `autoSew` empareja por longitud (Hungarian) + naming pero NUNCA decide ni guarda sentido.

Cuando dos edges se cosen derecho-con-derecho (el caso NORMAL de patronaje: voltear una pieza), el mapeo correcto es `dB = (1−frac)*lenB`, no `frac*lenB`. **Hoy nada distingue los dos casos.** Sin resolverlo, el notch espejo cae en el extremo opuesto del edge en ~50% de los seams reales, en silencio, y nadie lo nota hasta cortar la tela.

Dato relevante: el sistema YA **conoce** la orientación pero la **descarta**. `computeGhostTransform` (`useWalkSeamTool.ts:167-173`) calcula `angleDiff` entre tangentes para rotar el ghost del render, luego usa `frac` directo para la distancia. La orientación es conocida para el render y desechada para el mapeo. Esto importa: una **verificación** puede permitirse inferir el sentido barato; un **enforcement automático** debe reconstruirlo caro y consistente cross-tier.

### 2.3 La asimetría grading-preserva / mirror-destruye

Dos motores transforman el `path` sin saber del anchor, con políticas opuestas — y esa asimetría es la frontera exacta donde el equipo decidió que la identidad deja de ser gratis:

- **Grading PRESERVA y escala el anchor.** `gradePiece` (`gradingEngine.ts:161-173`): `refPoint` sigue el centroide (`center + (refPoint−center)*scaleFactor`), `distanceMm *= scaleFactor`.
- **Mirror DESTRUYE el anchor a propósito.** `mirrorInternalsX` (`linkedEditing.ts:57-67`): `const { notchAnchor: _dropped, ...rest } = line`. El comentario (`:52-55`) lo nombra "the future 'anchor manda' upgrade". El `path` sí se espeja (`mirrorPathX`, `:29-47`).

El notch espejo entre-piezas (vía seam) es un **eje distinto** al mirror-de-pieza (reflexión X de la misma pieza). El alcance recomendado NO pasa por `mirrorInternalsX`.

### 2.4 auditNotches: el único dato del modelo que MIENTE hoy

`auditNotches` (`proactiveAnalysis.ts:281-313`) **solo cuenta cardinalidad**: `notchesA.length` vs `notchesB.length` por seam → 0/0 = info, A≠B = warning. **Cero comparación de posición, distancia o emparejamiento 1-a-1.** El docstring (`:273-275`) promete "corresponding notches on shared edges" pero el cuerpo solo cuenta. Dos notches en posiciones totalmente distintas pasan el audit si los counts coinciden — falso "todo bien". La correspondencia NO existe ni como dato NI como lectura.

### 2.5 La impedancia ring↔edge (afecta a TODOS los alcances)

`NotchAnchor` mide arc-distance desde un corner a lo largo del **RING COMPLETO** del outline (`arcPositionOf` sobre el perímetro entero, `notchAnchor.ts:99-150`). Los seams operan **por-edge** vía `segmentRange`. Producir un notch correspondiente exige convertir `s_ring ↔ s_edge` en ambos lados — no es "copiar `distanceMm`". Coste acotado (~15-30 líneas), no estructural, pero real en A, B y C.

### 2.6 Productores y forma del dato

`NotchAnchor = { refPoint: Point2D; direction: 'cw'|'ccw'; distanceMm }` (`types.ts:246-250`). **Sin `pieceId`, sin `partnerId`, sin `id` propio** — cero identidad de par. Es opcional en `InternalLine` (`:266`), solo aplica a `'notch'`. 3 productores: `useNotchTool`, DXF `interpretNotchMark`, copilot `addNotch`. `NotchPrecisionModal` solo tiene Distance(mm) + Depth(mm), sin modo ratio.

---

## 3. Alcances candidatos

### Alcance A — Mínimo one-shot: comando "espejar notch al edge par" (paridad CLO3D a mano) · tamaño S

**Mecanismo.** Un tool/comando nuevo (`mapNotchToSeamPartner`) que toma un notch en pieza A y crea su gemelo independiente en la pieza par:

1. Ubicar el notch fuente y sobre qué `SemanticEdge` de A cae. Como el anchor mide sobre el ring y los seams por-edge, tomar el punto del notch (`path[0]`, o `resolveNotchAnchor` si tiene anchor) y resolver el edge candidato por menor `perpDist` usando `distanceAlongPath` por edge.
2. Descubrir el edge par con `findSeamForEdge` → `{ pairedPieceId, pairedEdgeName }`. Sin seam, el comando falla con mensaje.
3. Mapear distancia (idéntico a `sampleMismatch`): `dA = distanceAlongPath(...)` → `frac = dA / computePathArcLength(A, segA)` → `dB = frac * computePathArcLength(B, segB)` → `ptB = pointAtPathDistance(B, dB, segB)`.
4. Construir un `InternalLine` 'notch' NUEVO E INDEPENDIENTE en B: `path = [M(ptB), L(ptB + normalInterior*depth)]`, `notchOptions` copiadas del fuente, y `notchAnchor` **recalculado desde cero** en B vía `computeNotchAnchor(outlineB, ptB)` — NO se copia el anchor de A.
5. `dispatch(addInternalLine({ pieceId: pairedPieceId, line: notchB }))`.

El notch resultante es indistinguible de uno puesto a mano con el modal. **Sentido:** preview del punto resultante + toggle manual "invertir" → decisión humana, consistente con CLO3D a mano.

- **Persistencia:** one-shot (editar A NO mueve B).
- **¿Amendment D-2?** NO. El notch en B lleva su propio `path` congelado y su propio anchor derivado de B. "Path manda" intacto en ambas piezas. No toca `mirrorInternalsX`.
- **Depende del seam pairing:** SÍ totalmente — y ese dato + el mapeo arc-length ya existen y están probados (§2.1).

**Pros:** geometría nueva = cero; no toca D-2 ni mirror ni el modelo; replica fielmente el video; rollback trivial (`removeInternalLine`); coherente con el spec previo ("manual pair-matching" ya nombrado).
**Cons:** hereda el gap de orientación (mitigado por toggle humano); impedancia ring↔edge; requiere que exista el Seam; sin identidad, `auditNotches` sigue ciego — A **simula** el par y el propio sistema no puede verificar si la simulación es buena.

### Alcance C — Intermedio: one-shot (=A) + vínculo DÉBIL (detección posicional, sin enforcement) · tamaño M

**Mecanismo.** Combina el comando one-shot de A con una capa de detección posicional que NO impone enforcement:

1. **Creación:** idéntica a A.
2. **Detección/verificación (lo nuevo):** reescribir `auditNotches` para que en vez de solo contar, empareje 1-a-1 **por posición**. Para cada notch en el edge de A computa `frac_A`; para cada notch en el edge par de B computa `frac_B`; los empareja por `|frac_A − frac_B|` mínimo, probando AMBOS sentidos (`frac` y `1−frac`) y quedándose con el mejor match global. Warning cuando un notch de A no tiene contraparte dentro de tolerancia. La correspondencia se **DERIVA** de geometría + seam en cada audit, no se almacena. Opcionalmente, el audit ofrece la acción "crear el notch faltante" que invoca el comando one-shot.

- **Persistencia:** one-shot. El sentido (frac vs 1-frac) se INFIERE por mejor-match en cada audit (heurística), no se almacena como dato.
- **¿Amendment D-2?** NO. Cero `partnerId`, cero middleware, cero invertir `direction`. Path manda intacto.
- **Depende del seam pairing:** igual que A. La orientación se convierte de "dato obligatorio" en "heurística de lectura". No toca `matchVertices`/`autoSew`/`seamPairs`.

**Pros:** entrega lo del video MÁS lo que CLO3D no tiene — verificación posicional real; **cierra el agujero concreto de `auditNotches`** (el único dato que miente hoy) con cambio acotado a un archivo; no arriesga el cosido XPBD; camino evolutivo limpio hacia B sin tirar nada; habilita el "par espejo proactivo" del Arrogant Architect en forma no-intrusiva (el agente DETECTA el desbalance y PROPONE crear el faltante).
**Cons:** sigue siendo one-shot (editar A no mueve B); la inferencia de sentido por mejor-match falla en degenerados (pocos notches, edges casi simétricos) → ante empate NO debe afirmar correspondencia; la correspondencia es efímera (parpadea con la geometría); riesgo de falso positivo (empareja dos notches que nunca fueron pares); más trabajo que A (M, no S) por la reescritura del audit + impedancia ring↔edge por cada notch.

### Alcance B — Relacional completo: identidad de par persistente + enforcement + sobrevive grading/mirror · tamaño L

**Mecanismo.** Introduce identidad de par como dato y enforcement como middleware:

1. Identidad: `InternalLine.partnerId?` o registro central `NotchPair { id, a:{pieceId,lineId}, b:{pieceId,lineId}, seamId }`.
2. El comando crea el notch en B (mecanismo de A) **y** registra el vínculo bidireccional.
3. Enforcement: middleware `@cascade` (B3-state, depth≤1) que al editar/borrar el notch de A recomputa y re-emite sobre B, con meta-flag (`meta.fromPartnerSync`) anti-loop.
4. Sobrevivir grading: re-verificar el par tras gradear AMBAS piezas.
5. Sobrevivir mirror: **INVERTIR** `mirrorInternalsX` para re-mapear el anchor en vez de dropearlo — los DOS saltos ontológicos (ver §7).
6. Resolver orientación del seam como dato de primera clase (`Seam.reversed?` o inferencia por tangentes); tocar `matchVertices`/`walkSeam`/`seamPairs`/`autoSew` consistentemente.

- **Persistencia:** linked-pair (edita uno, el par se mueve solo).
- **¿Amendment D-2?** SÍ, obligatorio (ver §4).
- **¿Cambio a mirror?** SÍ.
- **Depende del seam pairing:** del mismo mapeo (existe) MÁS orientación obligatoria e indelegable (existe en NINGUNA parte) MÁS identidad de par (existe en NINGUNA parte).

**Pros:** es "el diferenciador" (CLO3D no lo hace); cierra el requirement original de Samuel; `auditNotches` verificaría posición real; coherente con la asimetría que ya existe (cerrar mirror elimina la inconsistencia).
**Cons:** costo L confirmado (= D-2 Opción 2 "anchor manda", descartada para MVP por coste); dos saltos ontológicos en mirror; orientación obligatoria con riesgo de regresión en el cosido XPBD (3 superficies); requiere revertir 4 textos literales; ciclos de cascade; **corrupción silenciosa del par bajo grading no-uniforme** (ver §7); choque con el `linkedEditingMiddleware` que sincroniza por índice; va MÁS ALLÁ de la paridad pragmática ratificada.

---

## 4. Recomendación + rationale

**Recomendado: Alcance C (one-shot + detección posicional sin enforcement).**

### Peso de la evidencia

Las seis críticas convergen. El Meta-Architect: "C es el único alcance coherente con paridad pragmática sin mentir". El Hacker: "solo A y C sobreviven el triple sistema de signo porque nunca re-mapean". El Orchestration Judge: "C es el punto de máxima relación entrega/riesgo de runtime". El Principal Analyst: "el alcance mejor argumentado del documento y el que mejor calza con la paridad ratificada". El Calibrator: "C es el punto medio honesto: por ~2x sobre A cierra el agujero concreto sin pagar identidad ni enforcement".

### Por qué C y no A

A entrega el one-shot del video, pero deja `auditNotches` ciego: tras correr A, dos notches en posiciones correctas y dos en posiciones equivocadas son indistinguibles para el sistema (count 1 = count 1). A **simula** el par y luego no tiene cómo saber si la simulación es buena. C cierra exactamente ese agujero — el único dato del modelo que miente hoy — con un cambio acotado a un archivo, sin pagar nada más. C deriva la correspondencia que ya está implícita en seam + geometría, en vez de almacenarla. Eso es ontológicamente preciso: la correspondencia **realmente es derivable**.

### Por qué NO B (todavía)

B compra el diferenciador a un precio que el propio spec previo midió y difirió. Es costo L: dos saltos ontológicos en mirror (re-significar `direction` + reubicar `refPoint`), orientación obligatoria e indelegable que toca tres superficies del cosido XPBD, un middleware de cascade que debe coexistir con el `linkedEditingMiddleware` que empareja por índice, **y una corrupción silenciosa del par bajo grading no-uniforme que el brief subestima** (§7). B va más allá de la paridad pragmática ratificada del proyecto. Es la decisión de alcance de Samuel, no técnica.

### La ley de orquestación (por qué C es honesto)

Todo sistema que afirme "estos dos son pares" elige una de tres relaciones, y solo dos son baratas: **coincidencia** (A — no cuesta nada, no garantiza nada), **derivación** (C — recalcula de datos que ya existen; cuesta lectura, es verdadera mientras los datos-fuente lo sean), **identidad** (B — almacena la relación y debe defenderla en cada transform; cuesta enforcement perpetuo). No puedes tener enforcement sin identidad, y no puedes tener identidad gratis. C nunca afirma identidad — solo proximidad ("estos dos casan dentro de tolerancia"), no "estos dos SON pares". Si C ante empate se NIEGA a afirmar correspondencia, C no miente nunca.

C entrega lo que el video muestra (one-shot a mano) MÁS lo único que el modelo puede afirmar honestamente: que la correspondencia es derivable y por tanto verificable. Y deja la puerta a B abierta sin construir nada que B tenga que tirar.

---

## 5. Amendment a D-2

**El alcance recomendado (C) NO necesita amendment a D-2 ni a la fila D1-real de CLAUDE.md.**

Razones, verificadas en código:

- C crea notches con su propio `path` congelado y su propio anchor recalculado en B → "path manda" (D-2 Opción 1) sigue intacto en ambas piezas.
- C no toca `mirrorInternalsX` (`linkedEditing.ts:57-67`) → la política de dropear el anchor bajo mirror se conserva.
- C no introduce `partnerId` ni enforcement → la línea 85 del spec previo ("enforcement automático es feature futura / fuera de scope") sigue siendo cierta como descripción del estado.
- C no introduce parametricidad nueva en el campo → la fila D1-real de CLAUDE.md ("path remains render/export truth per D-2") sigue exacta.

El doc-block de `NotchAnchor` (`types.ts:240-241`) YA contempla "manual pair-matching" como uso del anchor. C lo automatiza one-shot + lo verifica, sin reificar la categoría. **C es aditivo sobre el contrato vigente, no una contradicción.**

> **Si Samuel elige B**, el amendment SÍ es obligatorio y debe revertir cuatro textos literales que hoy dicen lo contrario. El texto exacto propuesto sería:
>
> **(1) Spec `2026-06-07-notch-precision-design.md` línea 85** — reemplazar:
> > "**Pares entre piezas** ("coincidir con el piquete en cualquier otro lugar"): **fuera de scope** de esta fase. No existe superficie de enforcement... el enforcement automático es feature futura."
>
> por:
> > "**Pares entre piezas:** reabierto por el EPIC notch-espejo (`docs/superpowers/specs/2026-06-09-notch-mirror-design.md`, Alcance B). La correspondencia se reifica como entidad de par (`NotchPair` / `partnerId`) con enforcement vía middleware `@cascade`. Esto activa el upgrade 'anchor manda' PARCIAL (re-mapeo bajo mirror + orientación de seam de primera clase), NO la re-proyección continua bajo edit de outline — esa última permanece fuera de scope."
>
> **(2) Spec línea 42-45 (D-2 Opción 1 ganadora)** — añadir nota: "mirror **eliminaba** el anchor; con el EPIC notch-espejo (Alcance B) mirror lo **re-mapea** cuando el notch tiene par — ver `2026-06-09-notch-mirror-design.md` §7."
>
> **(3) Fila D1-real de CLAUDE.md (línea 57)** — añadir tras la oración del amendment notch-precision:
> > "**Amendment (notch-mirror, Alcance B):** los notches con par (`partnerId`/`NotchPair`) ganan enforcement cross-pieza; bajo mirror el anchor se re-mapea en vez de dropearse (re-significa `direction` cw↔ccw + reubica `refPoint`). `Seam` gana orientación de primera clase. Path sigue siendo render/export truth; el anchor manda PARCIAL (mirror + grading), NO bajo edit de outline."
>
> **(4) Doc-block `NotchAnchor` en `types.ts:240-244`** — reemplazar "mirroring drops the anchor... not this MVP" por la semántica de re-mapeo + mención de `partnerId`.

---

## 6. Decisiones pendientes (Samuel)

> **DECISIÓN PENDIENTE (Samuel) — D-M1 · Alcance.** ¿A (one-shot puro), C (one-shot + verificación), o B (relacional con enforcement)?
> **Default recomendado: C.** Cierra el agujero de `auditNotches` sin tocar D-2, mirror ni el cosido XPBD; respeta la paridad pragmática ratificada; deja camino limpio a B. B solo si Samuel decide subir el alcance del proyecto (decisión de modelo, no técnica).

> **DECISIÓN PENDIENTE (Samuel) — D-M2 · Orientación (frac vs 1-frac) en el one-shot.** El caso normal de patronaje cose edges en sentidos opuestos → `dB = (1−frac)*lenB`. No hay dato de sentido en el modelo. ¿Cómo se resuelve?
> **Default recomendado:** en A/C, **preview del punto resultante + toggle "invertir" manual** (consistente con CLO3D a mano). En C, el audit infiere el sentido por mejor-match global (heurística de verificación). NO crear `Seam.reversed` (eso es coste B y arriesga el cosido).

> **DECISIÓN PENDIENTE (Samuel) — D-M3 · Notch fuente sin anchor (manga curva).** `computeNotchAnchor` retorna null en outlines sin corners (círculos, curvas densas, `notchAnchor.ts:128-130`). ¿Fallar o caer al punto crudo?
> **Default recomendado:** caer a `path[0]` crudo y resolver el edge por proximidad. Las mangas curvas son justo donde el patronista más necesita notches de alineación — fallar ahí mata el valor del feature.

> **DECISIÓN PENDIENTE (Samuel) — D-M4 · Normal interior del notch en B.** `addNotch` calcula `normal = (-dy/len, dx/len)` SIN verificar winding (`internalTools.ts:264-265`); `resolveNotchAnchor` usa shoelace (`notchAnchor.ts:176-198`). Reusar la convención de `addNotch` en una pieza con winding invertido coloca el notch hacia AFUERA.
> **Default recomendado:** usar la convención shoelace de `resolveNotchAnchor` (determinista por winding), NO la de `addNotch`. Extraer el cálculo de normal interior a un helper compartido para no duplicar la inconsistencia.

> **DECISIÓN PENDIENTE (Samuel) — D-M5 · Sin Seam entre los edges.** El one-shot necesita un Seam para tener par que mapear. ¿Falla con mensaje, o guía a crear el seam?
> **Default recomendado:** fallar con mensaje claro ("no hay costura entre estos edges — crea la costura primero"). Integración con autoSew queda fuera de scope de esta fase.

> **DECISIÓN PENDIENTE (Samuel) — D-M6 · (solo si C) Tolerancia de emparejamiento + política de empate.** El audit empareja por `|frac_A − frac_B|` mínimo. ¿Qué umbral, y qué hace ante empate?
> **Default recomendado:** tolerancia relativa al arc-length del edge (p.ej. 2% del menor de los dos, con piso absoluto ~5mm alineado con el `INTERVAL` de `sampleMismatch`). Ante empate o ambigüedad: NO afirmar correspondencia (mostrar "verificación ambigua", no warning espurio ni falso "todo bien").

---

## 7. Glitches y trampas a manejar

### 7.1 Triple sistema de signo bajo reflexión (solo afecta a B)

Tres relojes que deberían marcar la misma hora bajo mirror y no lo hacen:
1. **Orden de comandos del path** — `mirrorPathX` (`linkedEditing.ts:29-47`) lo CONSERVA (preserva índices).
2. **Winding geométrico vía shoelace** (`resolveNotchAnchor:178-198`) — se INVIERTE bajo mirror (`area2` cambia de signo, el normal interior se autocorrige solo).
3. **`direction` cw/ccw** (`notchAnchor.ts:12-15`) — definido sobre el orden de comandos (reloj 1), por lo tanto NO se invierte bajo mirror aunque la geometría sí.

**La trampa profunda:** si B re-mapea `direction` (cw↔ccw) **sin saber que el shoelace YA se autocorrige**, aplica la inversión del normal interior DOS VECES y el notch sale hacia afuera. La junta dijo "invertir direction + reubicar refPoint" — la verdad es que esos dos pasos chocan con la auto-corrección del shoelace. **Solo A y C sobreviven esto porque NUNCA re-mapean — recalculan desde cero en el winding real de cada pieza.** La paridad pragmática no es solo barata: es la única que no entra en el campo de los tres relojes.

### 7.2 Corrupción silenciosa del par bajo grading no-uniforme (solo afecta a B)

El brief asume "bajo escala uniforme el frac se conserva" — cierto SOLO para escala isótropa. Pero el grading real de prendas NO es uniforme entre piezas de distinta categoría. `gradePiece` (`gradingEngine.ts:139-181`) aplica UN `scaleFactor` escalar por pieza y produce piezas nuevas (`{...piece}`) **sin disparar el cascade** → el middleware de enforcement NUNCA se entera del re-grade. Si A y B se gradean con factores distintos, `frac_A` deja de igualar `frac_B` y el par queda descuadrado en silencio. Esto es corrupción de estado, no un edge case. B tendría que re-verificar y re-emitir el par tras gradear AMBAS piezas.

### 7.3 Anchor invalidado silenciosamente por edits de geometría (afecta a todos)

`resolveNotchAnchor` rechaza el anchor si `refPoint` ya no cae sobre el outline (tol escala con perímetro, `notchAnchor.ts:167-169`) → fallback a path congelado. Además, `detectCorners` se recomputa siempre: un edit que cruza el umbral de 30° hace aparecer/desaparecer corners, moviendo el anchor sin tocar el path. C debe asumir que la correspondencia derivada puede cambiar tras un edit — es coherente con su naturaleza (re-deriva cada audit), pero hay que documentarlo.

### 7.4 Impedancia ring↔edge (afecta a todos)

Ver §2.5. `NotchAnchor` mide sobre el ring completo; los seams por-edge. Convertir `s_ring ↔ s_edge` en ambos lados. Ubicar sobre qué edge cae el notch ANTES de mapear (por `perpDist`, patrón de `distanceAlongPath`).

### 7.5 tStart/tEnd (cosido parcial — afecta a todos)

Un Seam puede cubrir solo un sub-rango del edge. El `frac` debe computarse contra el **sub-rango cosido**, no el edge completo, o el notch espejo cae fuera de la zona de costura.

### 7.6 edgeName semántico vs fallback regex (afecta a todos)

`edgeName` puede ser semántico O fallback `edge-N` regex (`seamAssembly.ts:411-429`, `seamPairs.ts:93-99`). Cualquier utilidad nueva debe replicar esa resolución con fallback para no romper con seams sin SemanticEdges nombrados.

---

## 8. Plan de implementación (Alcance C recomendado)

1. **F1 — helper compartido de mapeo cross-seam (S).** Extraer `mapDistanceAcrossSeam(seam, pieceA, edgeA, dA) → { pieceB, edgeB, dB, ptB }` que centraliza: resolución de edge por `edgeName` con fallback, conversión `s_ring ↔ s_edge`, mapeo arc-length (reusando `arcLength.ts`), y respeto de `tStart`/`tEnd`. Helper de normal interior shoelace (D-M4). Tests con seams sintéticos. (Evita la 4ª implementación paralela del mapeo.)
2. **F2 — comando one-shot `mapNotchToSeamPartner` (S).** Tool nuevo que ensambla F1 + `computeNotchAnchor(outlineB, ptB)` + `addInternalLine`. Fallback a `path[0]` si el notch fuente no tiene anchor (D-M3). Falla con mensaje sin seam (D-M5). Rollback vía `removeInternalLine`.
3. **F3 — UI de sentido (S).** Preview del punto resultante + toggle "invertir" (D-M2). Integrar al flujo del notch tool o como acción contextual sobre un notch existente.
4. **F4 — reescribir `auditNotches` (M).** De contar cardinalidad a emparejar 1-a-1 por `frac` probando ambos sentidos (reusa F1). Tolerancia + política de empate (D-M6). Acción "crear el notch faltante" que invoca F2. Firma `(pieces, seams)` no cambia; invocada desde `runProactiveAnalysis`.
5. **F5 — tests + doc (XS).** Tests de mapeo, de audit con pares correctos/desbalanceados/ambiguos. Sin amendment a D-2 ni a CLAUDE.md (C no lo necesita). Añadir el spec al índice de Architecture en CLAUDE.md.

---

## 9. Out-of-scope (de C)

- **Enforcement / identidad persistente** (`partnerId`, `NotchPair`, middleware cascade) — es Alcance B, diferido.
- **Invertir `mirrorInternalsX`** — Alcance B; sigue dropeando el anchor.
- **`Seam.reversed` / orientación de primera clase** — Alcance B; C la infiere por heurística.
- **Re-proyección continua bajo edit de outline** — sigue fuera de scope (es la otra mitad de "anchor manda", ni siquiera B la requiere).
- **Integración con autoSew para crear el seam** — el one-shot exige un seam preexistente.
- **Sobrevivir grading/mirror como par garantizado** — C re-deriva desde cero; no hay garantía de identidad (por diseño).
