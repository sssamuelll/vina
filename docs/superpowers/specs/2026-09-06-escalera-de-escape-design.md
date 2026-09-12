# La escalera de Escape — decisión cerrada

**Fecha:** 2026-09-06
**Cierra:** el blocker abierto en `docs/superpowers/specs/2026-09-05-gramatica-tanda-6-design.md` § 6 (tramo 6-5).
**Censo:** 2026-09-06, contado a mano sobre el código, no heredado.
**Estado:** decisiones tomadas; implementación NO hecha, con su tamaño medido en § 6.

---

## 0. Por qué este documento existe

La gramática de la tanda 6 dejó un solo blocker abierto y le puso nombre:

> «Lo que hay que decidir antes de escribir una línea: si la escalera se
> implementa como un único enrutador en captura (y entonces los catorce
> `handleKeyDown` se re-cablean, que es el trabajo real y no es "ninguno"), o si
> se queda como está y **solo se documenta el orden vigente**.»

El censo del 06-09 **elimina la segunda opción**, y esa es la aportación de este
documento. No se puede documentar el orden vigente como convención porque el
orden vigente es un defecto: para catorce herramientas, **un Escape hace dos
cosas**, y la primera es la global.

---

## 1. El hecho que decide

`ShortcutProvider` escucha en `document`, en burbuja
(`ShortcutProvider.tsx:84`). El router de herramientas escucha en `window`,
también en burbuja (`useEditorInteractions.ts:451`). En el árbol del DOM,
`document` está por encima de `window`, así que **el global corre primero**.

Consecuencia, trazada con el código en la mano:

| Con | Escape hace |
|---|---|
| pluma, línea interna, rectángulo, círculo, punto, piquete, margen, coser | **una** cosa: el gesto la consume en la CAPTURA (`useEditorInteractions.ts:566`) y para la propagación |
| las otras **catorce** (`seam`, `measure`×3, `transform`, `editPattern`, `scissors`, `slashAndSpread`, `merge`, `seamEdit`, `topstitch`×3, `walkSeam`, `offsetOutline`, `extendTrim`, más `nodeEditor` por su cuenta) | **dos**: primero `clearSelection()` global, después el cancel de la herramienta |

Y con `editPattern` + `nodeEditor` a la vez son **tres**, porque el bloque de
burbuja hace `handlers.forEach(h => h(e))` (`:450`) sin corte: no hay «ya lo
manejé, para». Las firmas son `(e) => void` y ninguna llama
`stopImmediatePropagation`.

**Ningún test cubre ese orden.** Los que hay prueban las de la captura
(`useEditorInteractions.teclado.test.tsx:67-124`, `grammar.test.tsx:295-326`).
Las catorce de la burbuja no tienen ni uno que diga qué debe pasar primero.

---

## 2. La corrección al censo que traía la propuesta

Cifras contadas a mano el 06-09. Las que traía el documento anterior estaban mal
en dos sitios, y una de las dos correcciones **cambia el tamaño del trabajo**.

| Se decía | Es |
|---|---|
| «ocho hooks exponen `isArmed()`/`isTracing()`» | **siete funciones**, y solo **cuatro implementaciones**: `useEdgeGesture` es el primitivo y `useFreeSewingTool`/`useNotchTool` lo re-exportan verbatim, `useSeamAllowanceTool` lo envuelve. `usePointTool` **no** expone función: expone `armed: boolean` (`usePointTool.ts:308`), un valor recalculado por render con semántica distinta del ref del primitivo |
| «trece sitios de `handlers.push`» | **catorce**, en `useEditorInteractions.ts:432-453` |
| «los dos conjuntos apenas se tocan» | cierto, y **corto**. El problema no es que falte un predicado: es que hay **ocho ortografías del mismo concepto** (§ 3) |

### El hallazgo que la crítica no nombró: ocho formas de decir «hay gesto vivo»

1. `isArmed()` función — 7 sitios
2. `armed: boolean` — `usePointTool.ts:308`
3. `isTracing()` — `usePolyPenTool.ts:396`
4. `pen.nodes.length > 0` — `PatternEditor.tsx:459` (la pluma no tiene predicado; se cuenta el array desde fuera)
5. `transformTool.isDragging` — `useEditorInteractions.ts:546`
6. `nodeEditor.isEditing` — `:437`
7. `state.isEditing && state.editingPieceId` interno — `useEditPattern.ts:626`
8. **sin predicado**: `measure`, `walkSeam`, `extendTrim`, `topstitch`, `scissors`, `merge`, `seamEdit`, `slashAndSpread` deciden por dentro, *después* de que ya se les llamó, y no pueden decírselo a nadie

«Re-cablear a los dueños actuales» no es tocar ocho hooks: es unificar **ocho
ortografías repartidas en veinticuatro herramientas**.

### Y tres protocolos de consumo incompatibles, en el mismo `routeKey`

| Protocolo | Herramientas | Cómo se sabe que consumió | Bitácora |
|---|---|---|---|
| **P1 — boolean** | `internalShape`, `pen`, `rectangle`, `circle`, y desde el 06-09 `elastic` | el hook devuelve `true` y el router para | correcta |
| **P2 — void, el hook se para solo** | `point`, `notch`, `seamAllowance`, `seam` | el hook hace su `preventDefault` por dentro; el router devuelve `null` igual | **miente**: `consumedBy: null` |
| **P3 — el router para por el tool** | `select` + `transformTool.isDragging` | el router llama y para incondicionalmente | miente igual |

El predicado universal **sí existe** y está documentado
(`useEditorInteractions.ts:114`): «`handleKeyDown` devuelve boolean». Lo cumplen
**cinco de veinticuatro**.

---

## 3. Las decisiones

### D1 — La escalera se implementa. No se documenta el statu quo.

Porque el statu quo no es una convención: es que el global le gana a la
herramienta en catorce casos, sin que nadie lo decidiera y sin un test que lo
diga. Documentarlo sería ratificar un defecto por no medirlo.

### D2 — Un solo enrutador, en CAPTURA sobre `window`

El que ya existe (`useEditorInteractions.ts:566`). Las catorce de la burbuja se
mudan ahí. El bloque de burbuja (`:432-453`) **desaparece**.

El precedente no hay que inventarlo: la pluma y la línea interna ya vivían en la
burbuja y se mudaron a la captura precisamente porque «el Escape disparaba
además la deselección global» — está escrito en el comentario de `:481`.

### D3 — Protocolo único: `handleKeyDown` devuelve boolean

P2 y P3 mueren. El que consume lo dice; el router es el único que llama a
`preventDefault` y `stopPropagation`. Eso arregla de paso la bitácora, que hoy
registra `consumedBy: null` en nueve herramientas que sí consumieron — y una
caja negra que miente sobre quién se quedó la tecla es peor que no tenerla.

### D4 — El predicado no se unifica. Se **elimina** la necesidad de tenerlo.

Ésta es la decisión que abarata el tramo, y contradice a la propuesta original.

La escalera no necesita preguntar «¿hay gesto vivo?» antes de llamar: **basta
con llamar**. Si la herramienta tiene gesto vivo, su `handleKeyDown` devuelve
`true`; si no, `false`, y el evento sigue su camino. El predicado era necesario
solo mientras el router tuviera que decidir *por* la herramienta.

Las ocho ortografías del § 3 **se quedan donde están**: siguen sirviendo a sus
otros lectores (el menú contextual, el cursor, los overlays). Lo que deja de
existir es la obligación de que la escalera las conozca.

### D5 — Los peldaños, en orden, y de quién es cada uno

| # | Peldaño | Quién responde | Ya implementado |
|---|---|---|---|
| 1 | Borrador de un chip en edición | `CotaChip` (`:157`) | **sí**, con su test y su e2e |
| 2 | Gesto vivo de la herramienta (press, trazo, tramo congelado, marquee) | `handleKeyDown` de cada hook | parcial: pluma, línea interna, rectángulo, círculo, punto, piquete, margen, coser, elástico |
| 2 · **pluma** | ~~Esc cancela el trazo entero~~ → Esc **termina** el trazo como línea de construcción (spec `2026-09-12-trazos-lineas-de-construccion-design.md` § 3.3); con un solo nodo, lo suelta | `usePenTool.handleKeyDown` | **sí** (#1158) |
| 3 | Sub-selección (nodo, tramo, borde de margen) | `handleKeyDown` de su hook | **no** |
| 4 | Selección de pieza | `ShortcutProvider` → `clearSelection` | sí, y es el último a propósito |

Un Escape, un peldaño. La escalera de dos que ya funciona de punta a punta
—chip → selección, medida en navegador real en
`tests/e2e/1100-margen-en-el-borde.spec.ts:123-146`— es el precedente exacto, y
el 06-09 se le añadió un tercer sitio: con el tramo congelado, Escape lo suelta
y el trazo sigue (`usePenTool`, `usePolyPenTool`).

> **Enmendado el 2026-09-12** (#1158). En la **pluma**, el peldaño 2 dejó de ser
> «cancelar el dibujo entero»: Escape **termina** el trazo y lo deja en el
> lienzo como línea de construcción; con un solo nodo no queda nada. El peldaño
> de cancelar desaparece de la pluma —los nodos se quitan de uno en uno con
> Retroceso, y un trazo terminado se deshace con `Ctrl+Z`— porque así **nunca se
> pierde nada dibujado**, que es el fallo 3 de #1161, y porque es la convención
> de Illustrator y Figma. Contrato de interfaz § 4: actuar y ofrecer deshacer
> antes que preguntar. Spec de trazos § 3.2-3.3.

### D6 — «Volver a la flecha» NO es un peldaño

La propuesta lo ponía de tercero. Se cae: cambiar de herramienta con Escape es
un gesto de otra familia (CLO no lo hace, Illustrator tampoco) y convierte una
tecla de *cancelar* en una de *navegar*. Si algún día hace falta, es otra tecla.

---

## 4. Lo que este trabajo destapa y hay que arreglar con él

Tres cosas medidas en el mismo censo. Ninguna es de Escape, y las tres viven en
el archivo que hay que tocar:

1. **`usePOMMeasureTool.ts` es código muerto.** Implementa Escape
   (`:230-232`) y `grep -rn "usePOMMeasureTool" src/` devuelve **una sola línea:
   su propia declaración**. Nadie lo importa. Es el hermano no descubierto del
   hallazgo F8, y el trinquete `manejadores-de-tecla-registrados.test.ts` no lo
   ve porque solo lee el texto de `useEditorInteractions.ts`.
2. **`useOffsetTool` está montado en el router y no maneja Escape**
   (`:148-155`: solo `Enter`). Escape en «Contorno paralelo» cae al global. El
   trinquete lo aprueba porque mira *que exista* `handleKeyDown`, no *qué teclas
   atiende*: un rodeo abierto por el otro lado.
3. **`usePolyPenTool.isArmed` (`:397`) no tiene consumidor.** Exportado, tipado
   en la interfaz, y nadie lo llama — el router usa `isTracing()`. Predicado
   escrito, puerta sin abrir.

---

## 5. Lo que NO se hace

- **No se toca `ShortcutProvider`.** Su Escape global es el último peldaño y
  está bien donde está. Lo que cambia es que deje de ser el primero.
- **No se unifica el guard de campo editable.** Hay tres versiones distintas
  (`isEditableTarget` en la captura, dos en `ShortcutProvider` +
  `useKeyboardShortcuts`). Es real y es otro eje.
- **No se le da `role` de menú al menú contextual.** Sale de este trabajo
  (`ContextMenu.tsx:202` pinta `<button>` pelados, sin `role="menuitem"`), es un
  hueco de accesibilidad real, y no es de Escape.

---

## 6. El tamaño, medido

| Tramo | Qué | Tamaño |
|---|---|---|
| E-1 | Escribir los tests del orden: qué debe pasar con Escape en cada una de las catorce. **Va primero y solo.** | M |
| E-2 | Mudar las catorce de la burbuja a la captura, con protocolo P1 | M |
| E-3 | Matar P2 y P3 (nueve herramientas) y arreglar la bitácora | S |
| E-4 | Peldaño 3 (sub-selección) en `useEditPattern` y `useEditCurve` | S |
| E-5 | Las tres del § 4 | S |

**E-1 no es negociable y no cabe con E-2.** El censo dice que el
comportamiento de catorce herramientas no está fijado por ningún test; mudarlas
sin escribir antes qué debe pasar es cambiar catorce comportamientos a ciegas y
llamarlo refactor. Es exactamente la forma de la regresión de apilamiento que la
Ola 1 de la Fase 3+4 metió con 6889 tests en verde.

---

**Insumos.** Censo del código: 2026-09-06. Blocker de origen:
`docs/superpowers/specs/2026-09-05-gramatica-tanda-6-design.md` § 6. Precedente
implementado y medido: `tests/e2e/1100-margen-en-el-borde.spec.ts:123-146`.
