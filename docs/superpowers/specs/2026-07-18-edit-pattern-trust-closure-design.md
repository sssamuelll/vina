# Cierre de confianza de «Editar patrón» — acceso, semántica de nodos y undo por gesto

**Fecha:** 2026-07-18
**Estado:** Aprobada por Samuel para planificación e implementación
**Fuente:** nota de María del 2026-06-07, auditada contra `main` en `42789bd6`
**Alcance:** PatternEditor 2D, dock izquierdo, shortcuts, overlays de nodos y undo de arrastre
**No modifica:** `PatternPiece.outline`, importación DXF, simplificación de polilíneas ni conversión a Bézier

---

## 1. Resumen ejecutivo

La nota de María contenía cuatro observaciones distintas. La auditoría del 2026-07-18 encontró este estado:

| Observación | Estado en `42789bd6` | Decisión de esta spec |
|---|---|---|
| «Editar patrón» debe estar visible por defecto | Vigente: existe en el catálogo, pero no en los siete defaults | Pasa a ser la segunda herramienta del dock, después de `Seleccionar` |
| Al mover una esquina aparece un punto extra | Corregido por `78647e61` | Se conserva y se cubre contra el DXF real |
| Ctrl+Z separa o hace desaparecer los puntos de la línea | Corregido por `78647e61` + `15689687` | Se prueba la cadena real de undo y cada drag se vuelve un solo gesto |
| Esquinas y puntos de curva se ven iguales | Parcial: círculo para `M/L`, cuadrado para `C/Q` | Se reemplaza por roles visuales derivados de geometría, válidos para polilíneas DXF |

El resultado buscado no es otro editor ni otro modelo geométrico. Es una capa de confianza sobre la autoridad existente:

1. la herramienta esencial se encuentra sin personalizar el dock;
2. el punto visible expresa su función geométrica, no solo el tipo de comando que lo almacena;
3. un arrastre completo equivale a un paso de undo;
4. geometría y overlay permanecen sincronizados después de undo/redo.

## 2. Contexto ratificado

### 2.1 El DXF real no contiene “puntos de curva” semánticos

`PatternPiece.outline` persiste comandos `M/L/C/Q/Z`. El patrón real de María llega como polilíneas densas: cuatro piezas tienen más de 100 comandos y ninguna contiene `C/Q` (`src/utils/__tests__/mariaShirt.m0.test.ts`). Una curva visible puede ser una secuencia de cientos de `L`.

Por eso la regla actual de `EditPatternOverlay` —círculo para `M/L`, cuadrado para `C/Q`— no responde la pregunta de María. Clasifica almacenamiento, no función geométrica. En su DXF, una esquina estructural y una muestra suave de la curva siguen siendo dos círculos iguales.

### 2.2 Una unión no es una entidad doble

En un path continuo, el ancla de destino de un segmento también es el origen implícito del siguiente. Una esquina no necesita dos puntos persistidos. El “punto extra” observado provenía de partir accidentalmente el segmento sobre una esquina y crear dos anclas coincidentes. `findInsertTarget` ya evita esa inserción si `hitTestNode` encuentra un ancla dentro del radio de selección.

Esta spec no reabre ese modelo. Los roles nuevos son exclusivamente una proyección de UI sobre las anclas existentes.

### 2.3 Dos superficies de edición continúan coexistiendo

- `editPattern` + `useEditPattern`: edición explícita de todos los nodos y segmentos de una pieza.
- `select` + `useEditCurve`: entrada puntual desde la selección para editar un nodo/handle.

El plan `docs/superpowers/plans/2026-07-18-boton-izquierdo-click-grammar.md` difiere expresamente su consolidación. Este alcance no la adelanta. `select` continúa como herramienta activa inicial y conserva transform box + barra flotante; `editPattern` se vuelve visible inmediatamente a su lado.

## 3. Objetivos y no objetivos

### Objetivos

1. Hacer `Editar patrón` visible en un dock nuevo y en docks históricos que todavía sean exactamente el default antiguo.
2. Hacer verdadero el atajo `Q` anunciado por el dock dentro del contexto 2D.
3. Diferenciar visualmente endpoints abiertos, esquinas/uniones, anclas Bézier y muestras suaves de una polilínea.
4. Usar una sola gramática visual en `EditPatternOverlay` y `NodeEditorOverlay`.
5. Mantener el hit-testing independiente del tamaño del glifo: un punto pequeño sigue siendo fácil de seleccionar.
6. Garantizar que un arrastre de nodo o segmento produzca exactamente una entrada de undo, aunque dure más de 500 ms.
7. Probar el flujo con el fixture DXF real de María y con el middleware real de undo.

### No objetivos

- Convertir polilíneas importadas a `C/Q`.
- Simplificar o refittear el DXF.
- Agregar `AnchorRole` a `PatternPiece`, `PathCommand` o a la persistencia.
- Cambiar la precisión, el orden o la cantidad de comandos del outline durante la clasificación visual.
- Fusionar `useEditPattern` y `useEditCurve`.
- Hacer que `Editar patrón` sea la herramienta activa al iniciar; `select` permanece activa.
- Cambiar la curación de la barra flotante o agregar `editPattern` como acción contextual. Es una herramienta/modo y su hogar es el dock.
- Prometer que Escape revierte una edición ya escrita. Escape cierra el modo; Ctrl+Z revierte.

## 4. Experiencia de usuario

### 4.1 Acceso

El orden inicial del dock 2D será:

1. `Seleccionar` (`Z`)
2. `Editar patrón` (`Q`)
3. `Pluma`
4. `Línea`
5. `Rectángulo`
6. `Tijeras`
7. `Medir`
8. `Coser`

`Seleccionar` sigue activo al abrir el proyecto. La proximidad comunica que ambos pertenecen al mismo nivel de trabajo sobre el patrón, pero no oculta que son verbos distintos.

Flujo:

1. La patronista pulsa `Editar patrón` o `Q` con foco 2D.
2. Hace clic sobre una pieza.
3. Aparecen sus anclas con jerarquía visual.
4. Arrastra una ancla o un segmento.
5. Un solo Ctrl+Z revierte el gesto completo; redo lo reaplica y el overlay acompaña la geometría.

### 4.2 Gramática visual de anclas

El rol se codifica por forma y tamaño, no solamente por color:

| `AnchorRole` | Significado | Glifo base |
|---|---|---|
| `openEndpoint` | Primer o último punto de un path sin `Z` | Diamante de 10 px |
| `corner` | Cambio de dirección estructural, incluida una unión angular | Cuadrado de 10 px |
| `bezierAnchor` | Ancla suave adyacente a un comando `C/Q` | Anillo circular de 9 px |
| `smoothSample` | Muestra no estructural de una polilínea o tramo recto subdividido | Círculo sólido de 6 px |

Prioridad cuando un punto satisface más de una condición:

```text
openEndpoint > corner > bezierAnchor > smoothSample
```

Los estados siguen siendo ortogonales al rol:

- seleccionado: dorado;
- hover: azul claro;
- idle: azul actual;
- borde blanco para los glifos principales;
- los handles de control Bézier continúan rojos/blancos y conectados por su brazo; no usan `AnchorRole`.

Todos los tamaños son de pantalla (`px / zoom2D`). El radio de hit-testing actual no disminuye cuando el glifo visible es pequeño. `smoothSample` reduce ruido visual sin reducir alcanzabilidad.

### 4.3 Densidad

La clasificación no oculta nodos ni cambia qué puntos pueden editarse. Las muestras suaves siguen visibles porque la patronista puede necesitarlas, pero dejan de competir visualmente con las esquinas. Una optimización o colapso por nivel de zoom queda fuera de este alcance.

## 5. Arquitectura

### 5.1 Acceso y migración del dock

`src/store/dockSlice.ts` conservará dos constantes:

```ts
export const LEGACY_DEFAULT_DOCK_2D_IDS = [
  'select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam',
] as const;

export const DEFAULT_DOCK_2D_IDS = [
  'select', 'editPattern', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam',
] as const;
```

Una función pura `migrateDefaultDockTools(ids)` aplica esta regla:

- coincidencia exacta, incluido el orden, con los siete defaults históricos → devuelve los ocho defaults nuevos;
- cualquier otra configuración → devuelve una copia sin cambios;
- si ya contiene `editPattern` → nunca duplica el id.

La migración se aplica al resultado validado de `loadDocks`. No cambia la forma del envelope y no requiere subir `STORAGE_VERSION`: sigue siendo `DockState v1`, con el mismo campo `tools2d: string[]`. El siguiente ciclo normal de persistencia guardará el array migrado.

Esto protege tres casos:

- instalación nueva: nace con ocho herramientas;
- usuario histórico sin personalización real: recibe `Editar patrón`;
- usuario que agregó, quitó o reordenó herramientas: conserva exactamente su dock.

`resetDockTools()` restaura el default nuevo. `DOCK_2D_CATALOG` mueve `editPattern` al segundo lugar y actualiza los tests que hoy fijan “los primeros siete”.

### 5.2 Atajo `Q`

Se agrega a `DEFAULT_SHORTCUTS`:

```ts
{ id: 'tool.editPattern', key: 'q', label: 'Editar patrón', category: '2D Tools', context: '2d' }
```

`useKeyboardShortcuts` registra el handler mediante el único escritor existente:

```ts
['tool.editPattern', () => activate2DTool(dispatch, 'editPattern')]
```

`Q` también está definido para `tool3d.camera` en contexto `3d`. Se conserva el modelo contextual actual:

- foco dentro de `.pattern-editor` → `tool.editPattern`;
- foco dentro de `.viewport-3d` → `tool3d.camera`;
- sin foco específico en la vista split, el orden del registro prioriza la definición 2D, igual que los precedentes duales `W` y `O`.

Esta spec no implementa el handler 3D ausente; solo hace verdadero el atajo que el dock 2D ya anuncia. Se actualiza el comentario obsoleto de `Tool2D.editPattern` que todavía menciona `Z`.

### 5.3 Clasificación visual derivada

Se crea un módulo puro en:

```text
src/components/PatternEditor/anchorRoles.ts
```

Interfaz:

```ts
export type AnchorRole =
  | 'openEndpoint'
  | 'corner'
  | 'bezierAnchor'
  | 'smoothSample';

export interface ClassifiedAnchor {
  node: EditableNode;
  role: AnchorRole;
}

export function classifyEditableAnchors(
  piece: PatternPiece,
  nodes: EditableNode[],
): ClassifiedAnchor[];
```

Algoritmo:

1. Detectar si el outline es cerrado por presencia de `Z`.
2. Para path abierto, marcar primer y último nodo dibujable como `openEndpoint`.
3. Reutilizar `detectCorners` de `src/utils/notchAnchor.ts`, con su umbral ratificado de 30°. Esta función aplana `C/Q`, deduplica coincidentes y ya fue creada para DXF densos.
4. Mapear las coordenadas de esquina a anclas editables con `ANCHOR_MATCH_EPS_MM = 0.05`, la misma tolerancia de deduplicación calibrada en `outlineAnalysis`. No se usa el fallback de `analyzeOutline` que fuerza dos cortes en una elipse: una curva cerrada suave puede tener cero `corner`.
5. Si el comando entrante o saliente del nodo es `C/Q`, marcar `bezierAnchor`, salvo que ya sea endpoint o esquina.
6. El resto es `smoothSample`.

La función mantiene orden y `commandIndex`; no modifica el outline ni genera ids. La clasificación se recalcula cuando cambia `piece.outline`, que ya es el evento de resync de los overlays.

### 5.4 Renderer compartido

Se crea un componente SVG puro en:

```text
src/components/PatternEditor/renderers/AnchorGlyph.tsx
```

Interfaz mínima:

```ts
interface AnchorGlyphProps {
  role: AnchorRole;
  position: Point2D;
  zoom2D: number;
  state: 'idle' | 'hovered' | 'selected';
  className?: string;
}
```

El elemento raíz expone `data-anchor-role` y `data-command-index` se coloca en el wrapper consumidor para regresiones de render.

Consumidores:

- `EditPatternOverlay`: reemplaza el bloque local círculo/cuadrado por `classifyEditableAnchors` + `AnchorGlyph`.
- `NodeEditorOverlay`: usa la misma clasificación para sus anclas; conserva aparte los handles de control y la etiqueta de coordenadas.

El hit-testing permanece en `useEditPattern`/`useEditCurve` y sigue trabajando con `EditableNode`/`NodeRef`. El renderer no se vuelve autoridad de interacción.

### 5.5 Undo por gesto

El arrastre actual despacha `project/updatePiece` en cada `mousemove` y depende de `UNDO_BATCH_MS = 500`. Una pausa de más de 500 ms dentro del mismo drag puede producir varias entradas. Se reemplaza esa coincidencia temporal por una transacción explícita de gesto.

#### Middleware

`undoMiddleware` conserva `batchUndo` para operaciones síncronas y endurece el batch explícito:

- `batchDirty: boolean` empieza en `false` al abrir el batch exterior;
- cualquier acción `project/*` dentro del batch lo vuelve `true`;
- `undo/endBatch` solo crea una entrada si `batchDirty` es `true`;
- un batch vacío se descarta y no ensucia el historial;
- si llega `editor/undo` mientras hay un batch abierto, el middleware finaliza primero el batch sucio y ese mismo undo restaura su snapshot pregesto;
- al cerrar el batch se limpian siempre snapshot, label, dirty y depth;
- al cerrar el batch se reinician `batchingAction` y `lastSnapshotTime`, para que la coalescencia automática de 500 ms no absorba una acción posterior;
- `loadProject`/`newProject` limpian también cualquier batch abierto.

La API pública agrega helpers nombrados para gestos que atraviesan eventos:

```ts
export function beginUndoBatch(dispatch, label): void;
export function endUndoBatch(dispatch): void;
```

`batchUndo` los reutiliza; los consumidores no despachan strings de control a mano.

#### Hook

En `useEditPattern`:

- mouse-down prepara el drag, pero no abre historial todavía;
- el primer movimiento que realmente cambia una coordenada abre `beginUndoBatch(dispatch, 'Editar puntos del patrón')`;
- los siguientes `updatePiece` quedan dentro del mismo batch, sin límite temporal;
- mouse-up llama `endUndoBatch` una vez;
- `exitEdit`, cambio externo del outline, desaparición de la pieza y cleanup del hook cierran idempotentemente cualquier batch abierto;
- si Ctrl+Z llega durante el drag, el middleware cierra y revierte el batch; el resync existente cancela `dragRef` y reextrae los nodos.

La misma transacción cubre drag de nodo y drag de segmento. Agregar, borrar o convertir puntos siguen siendo acciones discretas y no se meten dentro de este batch.

## 6. Flujo de datos

```text
Dock/Q
  → activate2DTool('editPattern')
  → clic en pieza
  → useEditPattern.enterEdit(pieceId)
  → extractNodes(piece)
  → classifyEditableAnchors(piece, nodes)
  → AnchorGlyph en ambos overlays

drag real
  → primer movimiento: beginUndoBatch
  → applyNodeMove
  → project/updatePiece por frame
  → dispatchAndRefresh actualiza geometría + nodos
  → mouseup: endUndoBatch (una entrada)

Ctrl+Z
  → middleware finaliza batch abierto si existe
  → project/restoreState(snapshot pregesto)
  → efecto de identidad de outline
  → resyncStateToPiece
  → geometría y glifos vuelven juntos
```

## 7. Casos límite

### Dock

- Un dock personalizado que no coincide exactamente con el default histórico no se migra.
- Un dock que ya contiene `editPattern` no recibe duplicados.
- “Restablecer” adopta el default nuevo, no el histórico.
- Un envelope corrupto mantiene el comportamiento actual: se descarta y cae al default nuevo.

### Clasificación

- Outline abierto de un solo segmento: ambos extremos son `openEndpoint`.
- Outline cerrado suave: puede tener cero esquinas; no se inventan dos corners.
- Candidatos de esquina duplicados/coincidentes: `detectCorners` ya deduplica; se produce un solo rol estructural.
- Esquina entre una curva Bézier y una línea: `corner` gana sobre `bezierAnchor`.
- Recta subdividida en muchos `L`: puntos interiores son `smoothSample`; extremos abiertos o esquinas conservan prioridad.
- Pieza rotada: los roles se calculan en coordenadas locales y el transform del overlay se mantiene como autoridad visual.
- Zoom extremo: cambia el tamaño SVG, no la clasificación ni el radio de hit.

### Undo

- Clic sin movimiento: no abre o no ensucia el batch; no aparece una entrada falsa.
- Drag de más de 500 ms: sigue siendo un paso.
- Ctrl+Z durante el drag: revierte al snapshot de mouse-down/primer movimiento y cancela el drag local mediante el resync actual.
- Undo que elimina la pieza: sale del modo de edición, como hoy.
- Excepción o unmount: el cleanup cierra el batch; nunca queda `batchDepth > 0` contaminando acciones posteriores.
- Batch anidado síncrono existente: solo el batch exterior conserva snapshot y label, igual que la semántica actual.

## 8. Estrategia de pruebas

### 8.1 Dock y migración

Extender `dockSlice.test.ts` y `dock2dTools.test.ts`:

1. default nuevo contiene ocho ids y `editPattern` está después de `select`;
2. migración exacta de los siete ids históricos;
3. array reordenado/personalizado queda intacto;
4. dock que ya contiene `editPattern` no lo duplica;
5. `resetDockTools` restaura el default nuevo;
6. round-trip de persistencia conserva el resultado migrado;
7. todo default resuelve contra el catálogo.

### 8.2 Shortcut

Crear una regresión siguiendo `seamAllowanceReachability.test.tsx`:

1. `tool.editPattern` existe con `Q` y contexto `2d`;
2. su handler despacha ambas autoridades mediante `activate2DTool`;
3. foco 2D resuelve `Q` a `tool.editPattern`;
4. foco 3D resuelve `Q` a `tool3d.camera`;
5. contexto combinado mantiene la precedencia 2D documentada.

### 8.3 Roles puros

Tests de `anchorRoles.ts`:

1. cuadrado cerrado → cuatro `corner`;
2. círculo poligonal denso → cero `corner`, todos `smoothSample`;
3. path abierto → dos `openEndpoint`;
4. path `C/Q` suave → `bezierAnchor`;
5. unión angular `C → L` → `corner`, no `bezierAnchor`;
6. duplicados consecutivos no producen roles duplicados;
7. clasificación preserva orden y `commandIndex`.

### 8.4 Overlays

Extender los tests de render:

- ambos overlays producen los mismos `data-anchor-role` para la misma pieza;
- `corner` y `smoothSample` usan formas/tamaños distintos;
- selección y hover cambian color sin cambiar rol;
- handle de control conserva su glifo rojo separado;
- rotación sigue aplicando el transform del outline.

### 8.5 Undo real

Agregar una integración con `configureStore + undoMiddleware`, no `restoreState` directo:

1. entrar a edición;
2. arrastrar durante un reloj simulado de más de 500 ms;
3. comprobar una sola entrada de historial;
4. ejecutar `undo()` real;
5. verificar simultáneamente outline, `hook.nodes`, selección y cantidad de glifos;
6. ejecutar redo y verificar la posición avanzada;
7. repetir Ctrl+Z mientras el drag permanece abierto;
8. comprobar que un clic sin movimiento no agrega historial.

### 8.6 Fixture real de María

Reutilizar `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`:

1. importar una pieza densa sin `C/Q`;
2. identificar una macroesquina mediante `detectCorners` y una muestra suave fuera de ese conjunto;
3. afirmar que sus roles son `corner` y `smoothSample` respectivamente;
4. arrastrar cada una en ejecuciones aisladas;
5. afirmar que `outline.length` no cambia;
6. afirmar que cambia exactamente el `commandIndex` seleccionado y no aumenta la multiplicidad de puntos coincidentes respecto al fixture de entrada;
7. Ctrl+Z real restaura outline y overlay; redo los reaplica.

Una prueba Playwright final cubre la cadena visible: importar fixture → activar `Editar patrón` → arrastrar ancla → Ctrl+Z → el marcador vuelve a la línea. Vitest conserva las aserciones geométricas precisas; Playwright verifica teclado, SVG y ruta de UI.

## 9. Criterios de aceptación

1. Una instalación nueva muestra `Editar patrón` inmediatamente después de `Seleccionar`.
2. Un usuario con el default histórico recibe la herramienta una vez; un dock personalizado no cambia.
3. `Q` activa `editPattern` cuando el contexto 2D tiene precedencia.
4. `select` continúa activo al iniciar y su transform box/barra flotante no cambian.
5. En el DXF real de María, una macroesquina y una muestra suave tienen glifos distintos.
6. `EditPatternOverlay` y `NodeEditorOverlay` comparten la misma clasificación y renderer de anclas.
7. El hit radius no depende del tamaño visible del glifo.
8. Arrastrar un punto no cambia la cantidad de comandos salvo en la acción explícita de agregar punto.
9. Un drag completo, incluso >500 ms, crea exactamente una entrada de undo.
10. Un Ctrl+Z restaura geometría y overlay; redo los avanza juntos.
11. Un click sin movimiento no crea una entrada.
12. No se agrega ningún campo persistido ni conversión automática a Bézier.
13. Gates verdes: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 10. Secuencia de implementación propuesta

1. Dock default + migración + shortcut.
2. `anchorRoles.ts` con pruebas puras y fixture de María.
3. `AnchorGlyph` compartido y migración de los dos overlays.
4. Semántica dirty del batch en `undoMiddleware`.
5. Transacción de drag en `useEditPattern`.
6. Integración real undo/redo + fixture DXF.
7. Playwright del flujo visible y gate completo.

La secuencia separa alcance, visual y estado. Ningún paso necesita cambiar la geometría persistida.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Umbral angular clasifica mal una curva muy cerrada | Reusar el umbral de 30° ya calibrado; fixture real + sintéticos; rol solo visual |
| Más glifos aumentan ruido | `smoothSample` más pequeño; hit radius constante; sin ocultamiento en esta fase |
| Migración pisa personalización | Solo igualdad exacta y ordenada con el default histórico |
| `Q` compite con 3D en split | Contextos/foco actuales + tests de precedencia; no se crea un listener alterno |
| Batch queda abierto por unmount/undo | cierre idempotente en todas las salidas + middleware auto-finaliza antes de undo |
| Cambio genérico del middleware afecta otros batches | tests existentes + dirty/no-op/nesting; `batchUndo` conserva su contrato público |
| Dos editores vuelven a divergir | clasificador y `AnchorGlyph` compartidos; test de paridad entre overlays |

## 12. Referencias

- `docs/superpowers/specs/2026-06-03-dock-tool-editor-design.md`
- `docs/superpowers/specs/2026-06-18-imported-dxf-parametric-editing-decision.md`
- `docs/superpowers/plans/2026-07-18-boton-izquierdo-click-grammar.md`
- `src/components/PatternEditor/useEditPattern.ts`
- `src/components/PatternEditor/nodeEditorUtils.ts`
- `src/utils/notchAnchor.ts`
- `src/utils/outlineAnalysis.ts`
- commits `78647e61`, `15689687`, merge `df1de05b`
