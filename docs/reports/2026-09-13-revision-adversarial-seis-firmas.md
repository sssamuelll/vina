# Revisión adversarial de las seis firmas — PR #1166

Fecha: 2026-09-13. Rango: `874103ab..0a79f908` (rama `fix/seis-firmas-maria`). Objeto: la implementación orquestada de D1–D6 (#1153, #1155–#1161) descrita en [el contrato integrado](2026-09-13-seis-firmas-maria.md) y su [plan](../superpowers/plans/2026-09-13-seis-firmas-maria.md).

Método: tres revisores Opus en paralelo, solo lectura, con sondas ejecutadas y borradas —A: propagación de metadatos y persistencia; B: gramática de interacción y contrato de interfaz; C: matemática, clasificación y calidad de tests—, más lectura a mano del núcleo (persistencia, `angleReference`, hooks de la Pluma y la Línea interna, `CotaChip`) y una corrida completa del gate e2e de `scripts/deploy-prod.sh` más los specs nuevos y reescritos (16 archivos, `--workers=2`, sin reintentos). Los tres informes coincidieron en su lado del mapa y no se pisaron: cada hallazgo alto salió de una sola lente.

## Veredicto

**No mergeable todavía.** El núcleo está bien hecho —la ida y vuelta angular es exacta a 1e-14 con la pieza girada, la orientación «+90 hacia dentro» funciona en los dos sentidos de giro, las preferencias en IDB cumplen los tres no-negociables, la pareja Largo/Ángulo confirma sin colocar y el inválido no sale— pero hay un rojo en el gate de deploy, cinco defectos altos confirmados con sonda y dos decisiones de producto que se escribieron como firmadas sin que nadie las firmara.

Gate e2e corrido hoy: **89 pasan, 2 fallan**, los dos en `tests/e2e/medidas-escritas-gramatica.spec.ts`.

## Bloqueante

**B0 · El e2e del gate de deploy afirma el contrato viejo** — `tests/e2e/medidas-escritas-gramatica.spec.ts:86,90` (Enter deja la pareja viva) y `:152-163` (botón derecho mudo en la Pluma). Son las dos cosas que la tanda cambió a propósito, y #1161 pedía literalmente enmendar este archivo. El plan verificó 26 casos escogidos, nunca la lista del gate. Con esto `deploy-prod.sh` sale rojo. *Confirmado (corrida propia).*

## Altos (confirmados con sonda)

| # | Dónde | Qué pasa | Lo que ve María |
|---|---|---|---|
| H1 | `usePenTool.ts:207`, `usePolyPenTool.ts:176` | `handleMouseDown` no limpia `nextPoint`: colocar con clic deja la pareja congelada apuntando al origen anterior; `buildGuidePath` dibuja hacia el destino congelado y `hover` va a `null` | pulsa Tab sin querer, sigue con el ratón: el nodo se coloca pero la goma queda tiesa a un punto muerto, el chip sigue sobre el tramo anterior y el imán no ilumina hasta dos Escape |
| H2 | `usePenTool.ts:401-402` vs `:213-227` | `willClose` incorpora `!nextPoint`, pero la decisión de cerrar en `handleMouseDown` no: con la pareja congelada el clic sobre el origen **cierra la pieza sin aviso** (la divergencia aviso/comportamiento que maria-196 prohibió, por el otro lado) | congela con clic derecho, cambia de idea y clica el origen: sin anillo, sin píldora, la pieza se cierra de golpe |
| H3 | `LogoMenu.tsx:376` | `onMouseEnter` hace `setHoveredSub(hasSubmenu ? label : null)`; «Largos» es el primer submenú de segundo nivel del repo y entrar en «Al crear/Todas/Ninguna» desmonta el flyout que las contiene. El test nuevo salta del `mouseEnter` al `click` sin pasar el puntero | Vina ▸ Vista ▸ Largos: las tres opciones se esfuman al ir hacia ellas; la puerta del menú queda muerta (el `<select>` de la fila de capas sí funciona) |
| H4 | `angleReference.ts:78-102`; test `angleReference.test.ts:77-83` | En una **esquina**, `pointAt` resuelve el empate a favor del segmento que llega y la corrección de bobinado invierte esa tangente: en las cuatro esquinas del cuadrado la base queda **a lo largo de un borde**, nunca hacia dentro. Un tramo que sigue el borde lee `180 al borde` donde la firma dice 0; escribir 90 dibuja por el otro borde. `resolveSnap` prioriza `vertex` sobre `outline`, así que la esquina es el arranque más probable. El único test del caso es `expect(f(x)).toEqual(f(x))` | arranca una línea en la esquina de la pieza y el chip dice 180 —el «menos 179» del que se quejó ([07:48])— y el 90 no entra |
| H5 | `splitOutline.ts:340-390, 472-485` (`splitCommandAt`) | Las tijeras reconstruyen la frontera del corte con literales `{ type, values }`: un lado con «Convertir en curva» (`manualBezier`) cortado con tijeras sale **sin la marca en las dos mitades** y una vuelve a ser gestionada; un `L` con `authoredAnchor` cortado pierde la marca en la mitad que conserva el extremo. Alcanzable por `useScissorsTool` → `splitPieceAtLine`, `slashAndSpread` y el copiloto. Es la colisión de asas que el replay obligó a arreglar en `convertToCurve`, entrando por otra puerta | convierte un lado en curva, lo corta con tijeras, y las asas desaparecen: V la trata como curva por puntos y la resuaviza |

## Medios

- **M1 · Dos verdades en el mismo campo** — `CotaChip.tsx:188-191, 267-271`. `parsea()` perdió `round1` también para lo escrito: `100,25` → se guarda 100,25 y el chip vuelve diciendo `100,3 mm`. Las flechas siguen redondeando: subir un grado sobre 12,345678 deja 13,3. Solo la rama `!dirty` necesitaba conservar la precisión interna. *Confirmado.*
- **M2 · Decisiones sin dueño escritas como firmadas** — cinco enmiendas de spec con verbo de autoridad («rige», «sustituye»), ninguna dice provisional (ver § Decisiones). *Confirmado.*
- **M3 · `trimEdgeAtPoint` arrastra marcas a geometría sustituida** — `patternOps.ts:715,730,746`: un `C` recortado a `L` conserva `manualBezier` (inerte) y `authoredAnchor` (visible: el punto de recorte nace con glifo de esquina sin que nadie lo insertara). *Confirmado.*
- **M4 · `convertToCurve` borra la marca del ancla que no mueve** — `nodeEditorUtils.ts:571-576` construye el `C` desde cero; curva → recta pierde el glifo para siempre (solo undo lo recupera). El contrato separa ancla de segmento; esto los mezcla. *Confirmado.*
- **M5 · `authoredAnchor` sobre un `M` nunca da glifo, y Desplegar lo escribe** — `patternOps.ts:838-842` vs `anchorRoles.ts:23-29` (`hasStraightIncidentEdges` exige `L`). Tras `unfoldPiece` el punto insertado vuelve a ser invisible e inagarrable ([07:17] «uno se siente ciego»). El test (`patternOps.test.ts:433-465`) asserta la bandera, no el rol. *Confirmado.*
- **M6 · `deletePoint` pierde la marca al promover a `M`** — `nodeEditorUtils.ts:532`, literal sin `...cmds[0]`. *Confirmado.*
- **M7 · `anchorRoles` cambia la clasificación de proyectos sin marcas** — `anchorRoles.ts:92-99`: un grupo coincidente con un miembro `L→L` y otro `L→C` pasa entero a `bezierAnchor` (antes uno era `lineEnd`). Deliberado según el comentario, pero el informe afirma «los proyectos antiguos conservan su clasificación» y el fixture de María no contiene el caso que lo delata. *Confirmado.*
- **M8 · `z.literal(true)` puede dejar un proyecto sin cargar** — `projectSchema.ts:92-93` es el único `z.object` del archivo sin `.loose()` (la cabecera promete lo contrario); un `authoredAnchor: false` escrito por un plugin (`PluginBridge.ts:470-478` solo valida M…Z) tumba el `safeParse` entero en el arranque siguiente. *Plausible.*
- **M9 · La pista cruza el punto del siguiente clic** — `PenToolOverlay.tsx:206-222`, `PolyPenToolOverlay.tsx:159-173`: «Tab · escribe la medida» son ≈150 px centrados 22 px a la derecha del cursor, de `cursor.y+7` a `+18`: una banda por debajo del cursor, donde cae el clic y el vértice que engancha (deshace el desplazamiento de maria-196). Y falta el e2e que #1160 pidió (se ve la primera vez → tras Tab no vuelve → recarga). *Plausible; jsdom es ciego.*
- **M10 · Índice de enganche reconstruido en la ruta de render** — `cotas.ts:354,380` construyen `buildSnapIndex`/`buildRing` en cada llamada dentro del `useMemo` de `cotasDelSujeto` (`PatternEditor.tsx:829`), cuyas deps incluyen `pieces` (cambian por frame en un scrub). Medido: 0,18 ms con el DXF de María (≈1 % de frame, no muerde hoy) y **7,29 ms** por llamada con 20 piezas curvas y el origen fuera de todos los anillos. `snapIndex.ts:70-78` manda memoizarlo. *Confirmado el techo, no el síntoma.*
- **M11 · Clic derecho sobre la pareja abierta saca el menú de Chrome** — `CotaChip.tsx:333` tiene `preventDefault` solo en el chip en reposo; los `<input>` del editor no, y `.cotas` es hermana del `<svg>`. Ahora que el derecho es el gesto anunciado, el reflejo de re-congelar cae sobre el campo abierto. *Confirmado.*
- **M12 · Cobertura esquivada** — `cotasDeLineaInterna.test.ts:135-140`: el fixture del tramo enganchado al contorno en pieza girada se movió al interior (`(0,0)→(100,0)` a `(10,10)→(90,10)`) para que el −90 viejo siguiera valiendo; el cruce girado × borde queda sin ninguna prueba (verificado a mano que funciona: base −127). *Confirmado.*
- **M13 · Pieza con agujero: sin referencia al borde ni en el contorno exterior** — `angleReference.ts:84` descarta la pieza entera si `subpathCount !== 1`; sin documentar, sin test, y el plan afirma «subpaths tienen pruebas». 0 de 5 piezas del DXF de María. *Confirmado.*
- **M14 · «Seguir el borde = 0» solo en el sentido corregido** — en el opuesto lee ±180. Inherente a una referencia con signo; no está dicho. *Confirmado.*
- **M15 · Replay paso 11 perdió el oráculo negativo** — `replay-maria-07-09.spec.ts`: se borró «ningún rótulo sigue diciendo 100» sin sustituto sobre los rótulos (se podía filtrar por pieza); `rotulosEditada` se captura y no se asserta. El paso 5 sí sigue certificando la colisión de `convertToCurve` (`toHaveCount(2)` de asas). *Confirmado.*

## Bajos

- `CotasLayer.tsx:117` mide con `referenceLabel` y `:151` pinta sin él (inerte hoy).
- Dos frases para el mismo concepto: la tira dice «Tab escribe largo y ángulo» (`HintText.tsx:69,77`, permanente) y el lienzo «Tab · escribe la medida»; y «al eje» (`angleReference.ts:27`) no está en el glosario — es la etiqueta por defecto de todo tramo sin borde.
- Clic derecho en Línea interna con press vivo y cero nodos: no-op silencioso (`PatternEditor.tsx:512-516` vs `usePolyPenTool.ts:287-289`); preexistente.
- La fila de capas creció ≈73 px (`<label>` + `<select>`), sin `flex-wrap` ni `overflow`; esta superficie ya chocó con la barra de IA a 1366×643 y ningún e2e mide su ancho.
- `markPrecisionUsed()` se llama antes de `abrirPrimero()` (`PatternEditor.tsx:886-890`): la pista se retira aunque el chip no abra; y nace en `true`, así que parpadea hasta que resuelve IDB.
- Ruta binaria `encodeOutline`/`decodeOutline` del protocolo del worker sigue tirando las banderas (sin llamadores en producción).
- `scripts/verify-display-toggles.mjs:27-28` quedó roto por el renombrado (`showLineLengths`, «Line Lengths»).
- `addFacing` duplica `authoredAnchor` en el contorno espejado; un `C` marcado deja de gestionar la cadena vecina entera (`splineSegment.ts:43-50, 94-96`).
- `referenceBefore` no normaliza `baseDeg` (devuelve −180) y con un path sin `M` inventa un tramo desde (0,0) (inalcanzable hoy; `cotasDeTramos` lo llama sin la guarda de `referenceForNext`).
- Píldora `12.3 mm · 45.0° al borde` vs chip `12,3 mm · 45°`: punto y coma decimal para el mismo número.
- `withHandles` persiste un `authoredAnchor` muerto sobre un `C` y el test nuevo lo fija como contrato.
- El chip pinta `90° al borde` y `parseMedida` rechaza `90°` (preexistente). `projectSchema.test.ts` sin newline final.
- El informe atribuye a esta tanda el viewport 1920×1080 y la simulación apagada del replay: ya estaban en `874103ab`; lo nuevo es `encuadrar()` y el punto del clic derecho.

## Decisiones que quedaron sin dueño

1. **Enter.** #1161 lo dejó abierto: «¿Enter = colocar (hoy) o Enter = confirmar campo y otro Enter = colocar?». Se resolvió «Enter coloca una vez y no rearma la pareja» (antes rearmaba el chip del tramo siguiente para encadenar, cotas vivas § 5.4). Arregla la queja 3 (dos Esc borraban el trazo) sin tocar el significado de Enter; pero la queja 1 de Samuel —«edito el largo y clico Enter y no me deja editar el ángulo»— sigue literalmente en pie: la respuesta implícita es «usa Tab». Las cinco enmiendas lo escriben con verbo de autoridad y sin marca de provisional.
2. **D1 sin «al seleccionar».** La nota de Samuel dice «que ella pueda seleccionar qué ver **cuando selecciona una pieza**»; los tres estados entregados (Al crear / Todas / Ninguna) no ofrecen ese modo, y tres e2e invirtieron la aserción de [06:55] «cuando clico esto…» con respaldo del 10-09 ([03:45]), pero el reemplazo no sirve lo que reemplazó. Merece marcarse provisional y preguntarle a María.

## Verificado y correcto

- Preferencias IDB: `// shape:` en los dos `storageSet`, cero escrituras a LS, la carrera «la usuaria elige antes de que resuelva `storageGet`» cubierta de verdad en `lineLengthPreference.test.ts`, `NEW_PROJECT` es el único reseteo del editor y conserva el modo, `hydrateLineLengthMode` fuera del undo. `usePrecisionHint` se instancia una sola vez (`PatternEditor.tsx:195`) y viaja por props.
- Propagación 1:1 correcta en `splitSegmentAt`, `withHandles`, `toManualBezier`, `clonePiece`, `extendEdge`, `reflectCommands`, `optimizeCurvePoints`, `transform`, `slashAndSpread`, `gradingEngine`, `linkedEditing`, `modifyDimension`, `cornerTypes`, codec por `postMessage`. Ningún importador escribe marcas. `unfoldPiece` lleva la marca al comando que ahora llega a la coordenada, y la corrección del cursor invertido es real.
- Aritmética: `normalizeAngle` en (−180, 180] sin `−0`; `referenceBefore` excluye solo el cierre sintético; +90 hacia dentro en bordes no-esquina con los dos bobinados; pieza girada 37° exacta; un punto de `resolveSnap` reproyecta a 1,6e-14 mm (umbral 1e-5); ida y vuelta del chip 1,4e-14 mm y sin acumulación en 20 ciclos; `apply` normaliza siempre (±360 seguro).
- D3: control negativo hecho (mismo punto: `corner` con marca, `smoothSample` sin ella); el fixture de María sigue en 58/27/802; la marca no se cuela de `L` a `C` al convertir en spline.
- D5: `resmoothAfterMove` respeta `manualBezier`; `toManualBezier` conserva coordenadas bit a bit; `editableCurveNodes` no se salta runs; el cambio de contrato de `convertToCurve` está justificado por #1159 y ningún consumidor se rompe; el undo se prueba con store real.
- D6: un solo commit al cambiar de campo (el `preventDefault` del `mousedown` impide el foco nativo y `onFocus` llega como no-op); inválido retiene campo, borrador y `aria-invalid`; Enter coloca exactamente una vez; la clave `${activeTool}:${tramoSeq}` no deja tecla muerta; la escalera de Escape se cumple en las dos herramientas y G conserva su cancelación; el botón derecho no coloca ni arma nada (`button !== 0`); ningún tercer consumidor del derecho en el lienzo.
- Contrato de interfaz: ocho reglas en verde, R3 642/642, los siete tokens nuevos de `FilaDeCapas.css` existen, la pista usa `--ink-hint`, el `<select>` tiene `:hover` y `:focus-visible`, `aria-label` en español, los tres nombres coinciden en fila y menú.
- Tests: ningún `skip`/`only`, ningún `toEqual`→`toMatchObject`; 479 tests de las 32 suites tocadas verdes en corrida independiente. Fuertes: `CotaChip`, `lineLengthPreference`, `usePrecisionHint`, `authoredAnchor`, `editableCurveNodes`, `useEditCurve.undo`, `actionCuration`, `patternOps`. Con hueco: `angleReference` (esquina tautológica, sin girado×borde ni multi-subpath), `patternOps` unfold (bandera, no rol), `LogoMenu` (sin paso del puntero), `cotasDeLineaInterna` (fixture movido).

## Fuera de esta PR (con nota)

- Ruta binaria `encodeOutline`/`decodeOutline` del protocolo del worker sin banderas: sin llamadores en producción; se deja.
- Un `C` con `manualBezier` desgestiona la cadena Catmull-Rom vecina entera (`splineSegment.ts` define el run por `C` consecutivos): comportamiento definitivo, documentado aquí.
- Píldora con punto decimal (`12.3 mm`) y chip con coma (`12,3 mm`): preexistente; unificar es cambio aparte.
- Dos frases para la misma pista (tira: «Tab escribe largo y ángulo»; lienzo: «Tab · escribe la medida»): se unifican cuando se toque la tira.
- Piezas con agujero (`subpathCount !== 1`) sin referencia al borde: fallback al eje, documentado en `angleReference.ts`.

## Resolución — mismo día, misma rama

Las dos decisiones fueron a María en una hoja de firma con capturas (`https://claude.ai/code/artifact/09f05860-abc0-40f8-9d7c-c5ae111bcdb5`) y sus firmas están en el [contrato integrado](2026-09-13-seis-firmas-maria.md) § Firmas de María: Enter coloca de una vez y el tramo vuelve al ratón (opción A, con la pista «Tab para continuar · Enter para trazar» que ella pidió), y «Largos» pasa a ser un interruptor apagado de fábrica, sin las tres opciones — editar largos de una pieza existente es #1167. Los arreglos, con test rojo primero cada uno, tres Sonnet en archivos disjuntos y el resto a mano:

| # | Qué se hizo | Dónde |
|---|---|---|
| B0 | El e2e del gate reescrito al contrato firmado; asserta además la pista de la pareja | `tests/e2e/medidas-escritas-gramatica.spec.ts` |
| H1 | El clic con la pareja congelada la suelta y coloca donde se clicó; el `hover` y la goma vuelven al ratón | `usePenTool.ts` (`handleMouseDown`), `usePolyPenTool.ts` (`handleMouseDown`) + tests |
| H2 | `willClose`/`closeArmed` ya no se apagan al congelar: aviso y comportamiento coinciden | ídem |
| H3 | Desaparece con el submenú: «Largos» vuelve a ser un ítem con marca en Ver y una casilla en la fila; el test pasa el puntero antes de clicar | `LogoMenu.tsx`, `FilaDeCapas.tsx` |
| H4 | En una esquina la referencia es el borde que se puede seguir desde ella en el sentido corregido: seguirlo lee 0, el otro 90, en los dos bobinados; test real por las cuatro esquinas | `angleReference.ts` (`borderTangent`) + test |
| H5 | `splitCommandAt` reparte las marcas como `splitSegmentAt`: el extremo original hereda las dos, el punto de corte solo `manualBezier` | `splitOutline.ts` + `splitOutline.marcas.test.ts` |
| M1 | Lo escrito se redondea a un decimal como el chip; sin editar conserva la precisión interna | `CotaChip.tsx` (`parsea`) |
| M2 | Las decisiones ya tienen dueña: firmas de María en el informe y en las enmiendas de las specs | docs |
| M3 | `trimEdgeAtPoint`: el punto de recorte nace sin marcas; el extremo original conserva `authoredAnchor` y no `manualBezier`; también las ramas que mueven el extremo del comando anterior | `patternOps.ts` + tests |
| M4 | `convertToCurve`/`convertToLine` conservan `authoredAnchor` del ancla que no mueven | `nodeEditorUtils.ts` + round-trip test |
| M5 | Un `M` con `authoredAnchor` en contorno cerrado con llegada y salida rectas es esquina | `anchorRoles.ts` (`hasStraightIncidentEdges`) |
| M6 | `deletePoint` conserva la marca al promover a `M` | `nodeEditorUtils.ts` |
| M7 | El informe ya dice lo que se midió (grupo mixto → `bezierAnchor`) | docs |
| M8 | `authoredAnchor`/`manualBezier` con `z.preprocess` (todo lo que no sea `true` se limpia) y `.loose()`: una marca rara no tumba el proyecto | `projectSchema.ts` + test |
| M9 | La pista va encima de la píldora, alineada a su borde izquierdo; e2e nuevo: se ve la primera vez, se retira con Tab, no vuelve tras recargar, y no tapa el cursor | overlays + `seis-firmas-maria.spec.ts` D6 |
| M10 | `WeakMap` por pieza y por array de piezas en `cotas.ts`; `sujeto.ts` memoiza las piezas visibles por identidad | `cotas.ts`, `sujeto.ts` + tests |
| M11 | `preventDefault` del menú del navegador también en el editor abierto | `CotaChip.tsx` |
| M12 | Test nuevo girado×borde (ida y vuelta < 1e-9 mm, 90 entra en la pieza) | `cotasDeLineaInterna.test.ts` |
| M13/M14 | Documentados en el módulo y probados (agujero → eje) | `angleReference.ts` + test |
| M15 | Oráculo negativo por pieza en el paso 11 del replay (ningún rótulo dentro de la caja de la pieza editada dice 100) | `replay-maria-07-09.spec.ts` |
| Bajos | `CotasLayer` pinta con `referenceLabel`; la pista ya no parpadea (nace apagada hasta que IDB contesta); se retira solo si la pareja de verdad abrió; clic derecho en Línea interna con press vivo y cero nodos queda dicho; `parseMedida` acepta `90°`, `12,3 mm` y el menos Unicode; `verify-display-toggles.mjs` arreglado; newline de `projectSchema.test.ts`; el informe ya no se atribuye el viewport del replay | varios |

Fuera, con nota arriba: la ruta binaria del worker, el run de `C` consecutivos, la coma de la píldora, las dos frases de la pista, y la fila de capas a 1366 px (ahora vuelve a medir lo que medía antes de la PR: el `<select>` que la ensanchaba ya no existe).
