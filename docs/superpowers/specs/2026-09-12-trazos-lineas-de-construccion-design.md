# Trazos — líneas de construcción fuera de una pieza

> **Enmienda 2026-09-13:** se conserva D4. Al confirmar una medida con Enter ya no se rearma el par numérico; por eso un Esc posterior termina el trazo. Mientras se edita un borrador siguen los peldaños input → descongelar → terminar. Referencia angular, clic entre campos y evidencia de #1161 en el [contrato integrado](../../reports/2026-09-13-seis-firmas-maria.md).

**Origen:** reunión María + Samuel del 2026-09-10 ([informe](../../reports/2026-09-10-reunion-maria.md), § 0, § 3 N4, § 5.4), decisión D4 firmada por Samuel el 2026-09-12 (§ 8) → issue #1158. Brainstorm del 2026-09-12 con tres respuestas suyas que fijan el tamaño de todo lo demás (§ 1).

**Qué cierra:** que María pueda trazar primero y sacar la pieza después. Hoy cada raya suelta que dibuja con la Pluma es una «pieza abierta» con aviso (`t_11-20.jpg`: tres rayas, tres avisos), y Línea interna no arranca fuera de una pieza.

> **Estado: implementado el 2026-09-12** en la rama `feat/trazos` (#1158), con las tres enmiendas de § 10. Enmienda D4 de `2026-09-09-lo-que-se-ve-y-cuando-design.md` y la escalera de Escape (§ 8). No reabre AXIS-2 (§ 1).

---

## 0. Lo que ella pidió, en sus palabras

| Momento | Cita |
|---|---|
| [11:22] | *"dice abierta, no se puede simular… si siempre que me ponen todas abiertas no se puede simular, es como otra vez crea mucho ruido"* |
| [13:22] | *"una no quiere crear una figura geométrica. **Son las líneas que uno traza para poder seguir dibujando.** Porque yo luego voy a crear más líneas"* |
| [13:39] | *"me gusta la opción de que te cree el polígono y lo cierre. Pero no siempre. Que también puedas dejarlo abierto"* |
| [13:58] | *"uno podría llegar a dibujar piezas abiertas y estar allí"* |

Y Samuel, al firmar D6 el 12-09: *"esa pieza abierta nunca puede ser considerada como una pieza real para simular en el 3D, serían como líneas de construcción"*.

Vina era **pieza-primero**: la Pluma crea piezas, las internas viven dentro de una pieza, un trazo de tres puntos se cierra solo. María dibuja **líneas-primero**. Esta spec le da a Vina el papel debajo de las piezas.

---

## 1. Las tres decisiones que fijan el tamaño (Samuel, 2026-09-12)

| Pregunta | Decidido | Lo que descarta |
|---|---|---|
| ¿Qué es una línea de construcción? | **Papel y lápiz**: rayas sueltas que se miden, enganchan, editan y borran; cada una por su cuenta; el número exacto se escribe | Rayas que se acuerdan de cómo se hicieron (perpendicular a, paralela) — es el drafting paramétrico que **AXIS-2** (`2026-06-17-847-axis2-construction-engine-decision.md`) aplazó a post-M2. Y «puntos bautizados» para el futuro: no se paga hoy |
| ¿Con qué se traza? | **La Pluma: cerrado es pieza, abierto es construcción** | Línea interna fuera de pieza; una herramienta nueva |
| ¿Cómo se saca la pieza? | **Calcando**: Pluma encima, enganchando a las rayas | «Convertir en pieza» eligiendo rayas (cerrar ciclos, cortar cruces, explicar por qué no cierra) |

**La raya con AXIS-2, dicha:** AXIS-2 vetó una superficie de drafting *paramétrica y agente-driven*. Desde entonces Vina ganó Pluma, Rectángulo, Punto y Línea interna: el dibujo manual desde cero ya está. Los trazos son el siguiente paso de ese dibujo manual, sin relaciones ni fórmulas. Si un día se les cuelgan relaciones, es otra decisión y otra spec.

---

## 2. El dato

### 2.1 Nombre

En código, **`Trazo`**. No «construction»: ese nombre ya lo usa el copiloto para sus puntos paramétricos (`s.construction`, `ConstructionOverlay.tsx`, `constructionTools.ts` — vivos por el grading, AXIS-2 § "Alive"). Para la usuaria, en pantalla, **«construcción»** (el interruptor) y **«trazo»** (la pista de la Pluma, la tira). Los dos entran al glosario de copy.

### 2.2 Forma

```ts
export interface Trazo {
  id: string;            // newId()
  /** M + L/C…, en coordenadas del lienzo (patrón). Nunca lleva Z. */
  path: PathCommand[];
  createdAt: number;
}
```

`project.trazos: Trazo[]`, hermana de `referenceImages` — que ya es «algo en el lienzo que no es pieza» (`projectSlice.ts:218, 251, 1011-1024`). Un trazo **no tiene anfitriona, ni posición, ni rotación**: su `path` está en mundo, donde se dibujó. Como una raya en el papel.

### 2.3 Persistencia y deshacer

- `VinaProject` gana `trazos?: Trazo[]`. Al cargar, backfill a `[]` junto a `referenceImages` (`projectSlice.ts:351`). Sin sobre de versión: la ausencia del campo es el caso viejo y se resuelve en el backfill (B6-state, variante sin envelope). Si el guardado del proyecto tiene comentario de shape en su `storageSet`, se actualiza el `<Type>`; no cambia la versión.
- **La puerta de escritura también los lleva.** `stateToProject` (`src/utils/projectIO.ts`), que es por donde el autoguardado serializa el estado, emite `trazos: state.trazos ?? []`. Un campo que el reducer tiene y el serializador no escribe es un dato que se pierde al recargar y nadie ve fallar.
- **El esquema los declara.** `vinaProjectSchema` (`src/utils/projectSchema.ts`) gana `trazoSchema` y el campo `trazos` opcional, con tope `MAX_TRAZOS = 2000` — el mismo tipo de cota que ya llevan las demás listas del proyecto.
- **La compuerta de hidratación los cuenta.** `projectAutosave.ts` decidía si había algo que restaurar por `pieces` y `seams`; ahora suma los trazos, así que **un proyecto de solo trazos se restaura** en vez de descartarse en silencio, y el aviso dice lo que de verdad volvió: «Restauré tu proyecto: N piezas y M trazos» (solo la mitad que existe, si una es cero).
- Reducers: `addTrazo`, `updateTrazo({ id, path })`, `removeTrazo(id)`, `removeTramoDeTrazo({ trazoId, segmentIndex })` (§ 5.4). Los cuatro entran al mapa de `undoMiddleware.ts:306+` con sus nombres («Trazo», «Editar trazo», «Borrar trazo», «Borrar tramo»). **Un trazo terminado = una entrada de deshacer.** Arrastrar una punta va en lote (`beginDragBatch`), como las internas.

### 2.4 Lo que un trazo no es

No va al 3D (la simulación lee `pieces`; sale gratis). No aparece en la lista de piezas, no se cose, no lleva margen, no tiene capa de prenda (`layer`), no se agrupa, no se bloquea. **No se exporta** en esta versión (DXF/PDF/SVG), igual que las imágenes de referencia; si un día hace falta, es una capa de construcción en el exportador, aparte (§ 6).

---

## 3. Cómo nace: la Pluma

### 3.1 Un solo cambio en el corazón

`usePenTool.complete(nodes, closed)` (`usePenTool.ts:167-181`) hoy siempre llama a `onComplete` con una pieza. Pasa a repartir:

- `closed` → **pieza**, exactamente como hoy (`handlePieceComplete`, `PatternEditor.tsx:186-195`).
- abierto → **trazo**: `onComplete({ kind: 'trazo', path })` → `addTrazo`. **Un trazo terminado no queda seleccionado** (es lo que #1154 pide para las internas: el chip del último tramo no se planta donde va el siguiente clic).

**La Pluma deja de poder crear una pieza abierta.** El aviso «abierta: no se puede simular» (`PieceRenderer.tsx:520-534`) no se toca: sigue para las piezas abiertas que vengan de un DXF o de otra puerta, pero de la Pluma ya no sale ninguna.

### 3.2 Los gestos

| Gesto | Nodos | Resultado |
|---|---|---|
| Clic sobre el primer punto | ≥ 3 | cierra → **pieza** (como hoy, `willClose`) |
| Enter · doble clic | ≥ 3 | cierra → **pieza** (D4 del 09-09 se conserva: le gustó, [12:26]) |
| Enter · doble clic | 2 | no hay área → **trazo** |
| **Esc** | ≥ 2 | termina abierto → **trazo** |
| Esc | 1 | no queda nada |
| Retroceso / Supr | ≥ 1 | quita el último nodo (como hoy) |
| Cambiar de herramienta a mitad | ≥ 2 | = Esc: queda el **trazo** (hoy `reset` lo descarta, `usePenTool.ts:263-267`) |
| Cambiar de herramienta a mitad | 1 | no queda nada |

**Esc termina el trazo, no lo borra.** Es la convención de Illustrator y Figma (Esc termina el path abierto) y cierra de raíz el tercer fallo de #1161 (*"lo que dibujé desaparece"*): con esto **nunca se pierde nada dibujado**; si no se quería, `Ctrl+Z`. Contrato de interfaz § 4: actuar y ofrecer deshacer, antes que preguntar.

La alternativa descartada: un gesto nuevo para «terminar abierto» (Shift+Enter). Ella no lee pistas; Esc ya lo pulsa sola cuando quiere salir.

### 3.3 La escalera de Escape, enmendada

Con el chip de Tab abierto (`nextPoint`, #1129), los peldaños del chip siguen igual que hoy: un Esc cierra la edición del chip, el siguiente suelta el tramo congelado (`usePenTool.ts:341-345`) y el trazo sigue vivo. **El Esc que hoy tira el dibujo entero (`setState(EMPTY)`) pasa a terminar el trazo.** El peldaño «cancelar el trazo entero» **desaparece de la Pluma**: Retroceso quita nodos de uno en uno, y un trazo terminado se deshace con `Ctrl+Z`.

### 3.4 Lo que se dice y se registra

- Pista de la Pluma: **«Enter cierra la pieza · Esc deja el trazo»** (delante de lo que ya dice: arrastra para curvar, Tab escribe largo y ángulo, Retroceso quita el último).
- Caja negra: `pen:complete { kind: 'pieza' | 'trazo', nodes, via: 'close' | 'enter' | 'dblclick' | 'esc' | 'toolChange' }`.

---

## 4. Cómo se ve

- **Estilo:** el de la línea interna de **referencia** (`internalLineStyle.ts:17`, tinta `--ink-*`). Ni color nuevo ni token nuevo: para una patronista una raya de construcción y una línea de referencia son la misma cosa; solo cambia dónde viven. Ley de tokens: ningún literal.
- **Orden de pintado:** un `TrazosLayer` propio (memoizado, como `PuntosDelContorno`) montado **después de `PieceRenderer` y antes de `ToolOverlay`** — encima de las piezas, debajo de cotas, tiradores y píldoras. Encima porque la raya tiene que seguir viéndose sobre la pieza que se calcó encima (*"para poder seguir dibujando"*); debajo de lo que flota, por la ley de emplazamiento. `ReferenceImageLayer` queda debajo de todo, como hoy (`PatternEditor.tsx:1242`).
- **Anclas:** se pintan **todas las anclas de todos los trazos visibles, siempre** —puntas y vértices interiores— con `AnchorGlyph` en rol `lineEnd`; con el trazo seleccionado, las suyas pasan a estado `selected`. Un punto que ella puso es un punto que se ve: `resolveSnap` engancha a las anclas interiores de cualquier trazo visible, no solo a las puntas, y lo que el imán encuentra se ve (D3 firmada, #1157). Los **cruces** entre tramos rectos no son glifo permanente en `TrazosLayer` —nadie los creó, salen de dos trazos— pero sí entran en `verticesVisibles` del índice, así que la Pluma los pinta como candidatos y Línea interna les da su anillo al acercarse (§ 5.1).
- **Estados:** tramo seleccionado en acento y sus anclas en estado seleccionado; **sin hover** — las internas tampoco lo tienen en Seleccionar (paridad, no omisión).
- **Interruptor:** la fila de capas pasa a **Margen · Hilo · Piquetes · Costuras · Largos · Construcción** (`FilaDeCapas.tsx:19`, flag `showTrazos` en `editorSlice`, encendido de fábrica; el mismo asiento en `LogoMenu.tsx`, como «Largos de línea»). Apagado: los trazos **ni se pintan ni enganchan ni se seleccionan** — lo oculto no engancha, como las capas de piezas ocultas. Si había un tramo de trazo seleccionado, se suelta.
- **Copy:** «Construcción», «trazo», «Editando: el tramo seleccionado». `aria-label` en español. Ley 5.

---

## 5. Cómo se usa

### 5.1 Enganche

`buildSnapIndex(pieces, trazos)` (`snapIndex.ts:62`) recibe los trazos visibles además de las piezas. Nuevos `SnapKind`: `'trazoEnd'` (puntas), `'trazoCross'` (cruce entre dos tramos **rectos** de trazos); los vértices interiores entran como `'vertex'`, el recorrido como `'outline'`. `SnapTarget.pieceId` ya es `string | null`; gana `trazoId?: string`.

Prioridad, de mayor a menor: `firstNode` → vértice (de pieza o de trazo) → cruce de trazos → extremo (de interna o de trazo) → recorrido (contorno o trazo). Mismo radio (`EDGE_HIT_PX`), mismo resolutor.

Con eso, **Pluma, Línea interna, Punto y Medir enganchan a trazos sin cambiar nada**: todos leen del mismo índice. Los cruces con curvas no entran (§ 6). El cruce, además, **se pinta como candidato de la Pluma**: entra en `verticesVisibles(index)` junto a las anclas de los trazos, y Línea interna lo enseña con su anillo de enganche al acercarse (§ 4). El índice se recalcula por identidad de `trazos`, nunca por evento de ratón (mismo motivo que con `pieces`: un patrón de ella tiene cientos).

### 5.2 Seleccionar

En Seleccionar (`Z`), clic sobre un trazo selecciona **el tramo** — contrato 08-09 § 5: la unidad es el tramo, un trazo es línea de dibujo (`seSeleccionaPorTramo` = siempre). Estado propio en `editorSlice`: `selectedTrazo: { trazoId, segmentIndex } | null`, excluyente con la selección de piezas y con `selectedInternalLine` (seleccionar uno limpia los otros, como hace `selectInternalLine`). No se sobrecarga `InternalLineSelection.pieceId` con `null`: tiene demasiados lectores que asumen pieza.

**Empates:** un trazo se pinta encima de las piezas, así que su tramo gana al cuerpo de una pieza. Sobre una punta de trazo que cae en el mismo sitio que un vértice de pieza —el caso normal después de calcar— **gana la pieza si ya está seleccionada**; sin seleccionar, la esquina elige el trazo, que es lo que está encima. No es un descuido: es la gramática de `Z` (contrato 08-09 § 4, *Z selecciona, Q edita*) — el vértice de una pieza solo se toca cuando esa pieza es el sujeto, y el primer clic sobre una pieza sin seleccionar es el que la elige, no el que le edita un nodo. La pieza es el objeto terminado; el trazo, la guía. Para coger esa punta con la pieza seleccionada, se mueve o esconde la pieza.

La tira dice **«Editando: el tramo seleccionado»**, como con una interna.

### 5.3 Editar

- **Chip de cota:** el tramo seleccionado enseña su chip de largo · ángulo, editable — el mismo de las internas. `cotasDeLineaInterna` (`cotas.ts:257`) trabaja sobre pieza + línea; la parte «cotas por tramo de un path» se extrae a una función sobre `path` en mundo que usen las dos. En `sujeto.ts` entra una rama `selectedTrazo` gemela de la de `selectedInternalLine` (`:228-256`). Cuando entre #1156, el ángulo se lee con la misma referencia (al tramo anterior).
- **Puntas:** arrastrar una punta con `Z` la mueve, como hoy las puntas de una interna (`useEditorInteractions.ts:858-885`, `:995`): un `trazoDragRef` gemelo de `internalLineDragRef`, commit `updateTrazo` en lote.
- **Vértices interiores y curvas:** cuando entre el contrato 08-09 § 4 (`Q` toca internas), tocará trazos **por la misma puerta**. El trazo no tiene puerta propia. Trazar arrastrando hace curva (Bézier), como la Pluma.

### 5.4 Borrar

Supr con un tramo seleccionado → `removeTramoDeTrazo`: borra **ese tramo** (§ 5 del 08-09: *"Supr borra solo BC"*). Si era del medio, el trazo queda partido en dos trazos (dos ids, una entrada de deshacer). Si al trazo le queda un solo nodo, se borra entero. Ojo con #1115 (Supr global gana a los sujetos locales): la rama de trazo entra por el mismo sitio que la de interna.

### 5.5 Medir y mover

- **Medir:** nada nuevo; lee el índice. Mide entre puntas de trazos y sobre ellos.
- **Mover:** un trazo no pertenece a la pieza que se calcó encima. Mover, girar o borrar la pieza **no toca** el trazo. Papel.

### 5.6 Caja negra

`trazo:select { trazoId, segmentIndex }`, `trazo:delete { trazoId, segmentIndex, parte: boolean }`, `trazo:drag { trazoId, extremo }`, y los `snap` con `kind: 'trazoEnd' | 'trazoCross'`. Toda superficie nueva nace instrumentada.

`trazo:delete` lo emiten **las dos puertas de borrado** —Supr (`useKeyboardShortcuts.ts`) y Edición ▸ Eliminar (`LogoMenu.tsx`)—, con la misma sonda; y `parte` no se razona en cada puerta: se deriva de `quitarTramo` con `parteElTrazo(path, segmentIndex)` (`trazos/trazoPath.ts`), que es su misma condición leída al revés. Una puerta sin sonda es cómo #1115 se escapó.

---

## 6. Lo que NO se hace, con su razón

| No | Por qué |
|---|---|
| Relaciones entre trazos (perpendicular a, paralela, intersección viva) | firmado papel y lápiz; AXIS-2 |
| «Convertir en pieza» eligiendo trazos | firmado calcar |
| Línea interna fuera de pieza | una sola puerta; spec 08-29 § 4.6 sin cambios |
| Exportar trazos (DXF/PDF/SVG) | como las imágenes de referencia; si hace falta, capa de construcción aparte |
| Trazos en el 3D | nunca |
| Curva por puntos en trazos; cruces con curvas | después de #1159, si se mide que hace falta |
| Adoptar el trazo al crear la pieza; moverlo con ella | papel: el trazo se queda |
| Capa de prenda, grupos, candado por trazo | lo gobierna el interruptor único |
| Herramienta nueva en el dock | la Pluma ya es la puerta |
| Vértices interiores arrastrables desde `Z` | van con el contrato 08-09 § 4, por la misma puerta que las internas |

---

## 7. Casos raros

| Caso | Qué pasa |
|---|---|
| Esc con el chip de Tab abierto | 1.º suelta el chip; 2.º termina el trazo (§ 3.3) |
| Cambiar de herramienta con 2+ nodos | queda el trazo (§ 3.2) |
| Apagar «Construcción» con un tramo seleccionado | se suelta la selección; lo oculto no se edita |
| Trazo debajo de una pieza bloqueada | el candado es de la pieza, no del papel: el trazo se edita igual |
| Punta de trazo en el mismo sitio que un vértice de pieza | gana la pieza **si ya está seleccionada**; sin seleccionar, la esquina elige el trazo, que es lo que está encima (§ 5.2) |
| Proyecto viejo sin `trazos` | lista vacía, sin migración |
| Cientos de trazos | índice por identidad de la lista; `TrazosLayer` memoizado y sin hover, con una sola pasada por trazo (las anclas salen de `anclasDeTrazo`, no de un recorrido aparte). El tope del dato lo pone `MAX_TRAZOS = 2000` en el esquema |
| Deshacer tras borrar un tramo del medio | vuelve el trazo entero, con su id |

---

## 8. Enmiendas a lo escrito

| Documento | Qué cambia |
|---|---|
| `2026-09-09-lo-que-se-ve-y-cuando-design.md` § 4 (D4) | «≥ 3 cierra sola» se queda. La fila «2 nodos: se crea abierta y el aviso se queda» pasa a «2 nodos, o Esc: queda un trazo; la Pluma no crea piezas abiertas». El párrafo *"Por qué Pluma sí y las internas no"* gana una nota de enmienda debajo que remite al § 1 de aquí |
| `2026-09-06-escalera-de-escape-design.md` | el peldaño de la Pluma «Esc cancela el trazo entero» → «Esc termina el trazo» (§ 3.3) |
| `2026-09-08-contexto-y-control-numerico-design.md` § 5 | la granularidad del tramo aplica también a trazos |
| `2026-08-29-linea-interna-y-medidas-design.md` § 4.6 | sin cambios; se cita para que no se relea como olvido |
| Glosario de copy `docs/specs/2026-07-16-ui-copy-es-glosario.md` | entran «trazo» y «construcción» |
| #1161 (fallo 3) | queda cubierto por § 3.2-3.3 |

---

## 9. Pruebas

**Unitarias** (vitest):

1. `usePenTool.complete`: `closed` → `onComplete` con `kind: 'pieza'`; abierto → `kind: 'trazo'` y el `path` sin `Z`.
2. `handleKeyDown` Esc: con `nextPoint` → solo cierra el chip; con 2+ nodos → completa abierto; con 1 → vacío. Cambio de herramienta con 2+ → completa abierto.
3. Reducers `addTrazo` / `updateTrazo` / `removeTrazo` / `removeTramoDeTrazo` (tramo del medio → dos trazos; último nodo → borra) y backfill de `trazos` en `applyProjectPayload`. Los cuatro en el mapa de deshacer.
4. `buildSnapIndex(pieces, trazos)`: puntas como `trazoEnd`, vértices como `vertex`, recorrido como `outline`, cruce de dos rectas como `trazoCross`; con `showTrazos = false`, nada.
5. `sujeto` con `selectedTrazo` → cotas de largo · ángulo del tramo y `lineaDeSujeto` «Editando: el tramo seleccionado».
6. El trinquete del contrato de UI no sube ningún contador (`node scripts/ui-contract-lint.mjs`).

**E2E con la caja negra**, en el orden en que ella lo haría (`tests/e2e/trazos.spec.ts`):

1. Pluma, dos clics, Enter → un trazo, ninguna pieza, ningún aviso.
2. Pluma, tres clics, Enter → una pieza cerrada, ningún trazo.
3. Pluma, tres clics, Esc → un trazo de tres nodos, ninguna pieza.
4. Pluma, Tab, `100`, Enter, Esc → queda el trazo con su tramo de 100,0 (**#1161 fallo 3 en verde**).
5. Pluma nueva enganchando a la punta de un trazo → el nodo cae exacto (`snap.kind === 'trazoEnd'`).
6. Dos trazos rectos que se cruzan → la Pluma engancha al cruce (`trazoCross`).
7. «Construcción» apagado → no se pinta, no engancha, no se selecciona.
8. Recargar → los trazos siguen.
9. Cambiar de herramienta a mitad → queda el trazo.
10. `Z`, clic en un tramo → chip de largo; Supr → el tramo se va y el trazo se parte; `Ctrl+Z` → vuelve.

**Lo que jsdom no ve:** el orden de pintado (§ 4) y los empates de hit-test (§ 5.2) se prueban en navegador con `elementFromPoint`, como en `tests/e2e/emplazamiento-modales.spec.ts`.

---

## 10. Registro

- **2026-09-12 — implementado** en `feat/trazos` (#1158), en diez tareas. **Enmendado el mismo día con tres rulings que salieron de implementarlo:** (1) § 4 — las anclas ya no se reparten «puntas siempre, interiores solo con el trazo seleccionado»: se pintan **todas las de todos los trazos visibles, siempre**, porque `resolveSnap` engancha a las interiores y lo que engancha se ve (D3, #1157); y los cruces, que no son glifo permanente, entran en `verticesVisibles` y por eso la Pluma los pinta como candidatos (tarea 6, con § 5.1 y la fila de «cientos de trazos» de § 7 puestas de acuerdo). (2) § 5.6 — `trazo:delete` lo emiten las **dos** puertas de borrado y `parte` se deriva de `quitarTramo` vía `parteElTrazo`, no se razona dos veces (tarea 3). (3) § 2.3 — el plan no vio tres huecos de persistencia que las tareas 2 y 9 cerraron: `stateToProject` escribe `trazos`, `vinaProjectSchema` los declara con `MAX_TRAZOS = 2000`, y la compuerta de hidratación de `projectAutosave.ts` los cuenta, así que un proyecto de solo trazos se restaura. **Ronda 1 de revisión** (mismo día): dos frases más que la implementación había dejado falsas — § 4 prometía un **hover** de trazos que nunca existió (`TrazosLayer` es deliberadamente sin hover, por paridad con las internas en Seleccionar) y la tabla de § 8 decía que el párrafo *"Por qué Pluma sí y las internas no"* del 09-09 «se sustituye», cuando el ruling fue dejarlo con una nota debajo.
- **2026-09-12** — escrito tras el brainstorm con Samuel. Tres respuestas suyas (§ 1) y ocho secciones aprobadas una a una en la conversación. Decisión de más peso: reutilizar la gramática de la interna entera (tramo, chip, Supr, arrastre de puntas, índice de enganche) en vez de darle al trazo una propia. Decisión de gesto: Esc termina el trazo (Illustrator/Figma), lo que además cierra #1161 fallo 3.
