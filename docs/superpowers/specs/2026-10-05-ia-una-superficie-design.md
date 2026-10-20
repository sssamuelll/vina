# La IA de Vina: una superficie, dos cerebros

**Fecha:** 2026-10-05.
**Estado:** diseño aprobado por Samuel en conversación («perfecto»); spec escrita para su revisión.
**Quiénes:** Samuel decide. Voronov (crítica de arquitectura) y dos reconocimientos del código
dieron las medidas. Claude escribe.

## 0. Las frases que ordenan el documento

- **Vina es el lugar.** Los agentes generales tienen la palabra; Vina tiene la física. No se compite
  por la palabra.
- **Tomarse en serio al agente no es darle más pantalla.** Es que no pueda decir que una costura
  camina cuando no camina.
- **Una sola capa que mantener.** La superficie de herramientas es la única capa. Los cerebros que
  la usan cambian; ella no.

## 1. Objetivo y no objetivos

**Objetivo.** Que cualquier agente —el de la usuaria por MCP o el de Vina— pueda trabajar un patrón
de verdad: leerlo, cambiarlo, medir lo que cambió y corregir, con pocas llamadas y sin poder
inventar un éxito. Y que el agente de Vina sea el producto que el proyecto cobra.

**No objetivos.**
- Una «vista de IA» con conversaciones, contexto y claves. Eso es oficio del anfitrión del agente
  (Claude, ChatGPT, Cursor), no de Vina (D5).
- Competir con los agentes generales en conversación, memoria o razonamiento general.
- Un cerebro cerrado sobre un cuerpo abierto: el repo es MIT y el conocimiento de patronaje que
  hoy va en el prompt ya es público.

## 2. Decisiones del 2026-10-05

| # | Decisión | De quién y por qué |
|---|---|---|
| D1 | **Una sola superficie de herramientas.** Es la única capa que se mantiene. | Samuel: «si se queda tendría que mantener esa capa también; con MCP es una sola capa». |
| D2 | **Dos cerebros sobre ella.** El de cada quien, por MCP, abierto y gratis, como hace Blender. Y el agente de Vina, el tier pagado. | Samuel: «vamos a hacerlo igual que lo hace Blender»; «Vina tiene que ofrecer un tier de IA propio y va a ser nuestro propio agente, es la forma en que vamos a facturar». Coincide con el «Cloud Intelligence Pass» de `docs/business/PITCH-DECK-SUMMARY.md` § 4. |
| D3 | **El agente de Vina piensa en la pestaña.** El servidor de Vina es un relevo sin estado: autentica, pone la clave del modelo, mide y cobra. | Voronov: «el cerebro va donde vive el cuerpo, y hoy el cuerpo vive en la pestaña» (el patrón está en el IndexedDB). En el servidor, cada despliegue cortaría turnos a medias. Samuel: «dale vamos con A». |
| D4 | **El agente de Vina no ve nada que el MCP no vea.** La misma lista, las mismas respuestas, el mismo adaptador. Sin atajos dentro del proceso. | Condición de Voronov para D3. Si se rompe, vuelven las dos capas. |
| D5 | **No hay vista grande.** La cápsula de P2c queda como puerta del agente de Vina y como paleta de comandos. | Voronov: la vista junta el oficio del anfitrión con el del mundo; un conector, del lado de Vina, «es una dirección y un permiso». |
| D6 | **Se van las claves dentro de Vina y los seis proveedores.** Quien quiera su propio cerebro lo trae por MCP. | Sigue de D1-D3. Se hace en el subproyecto 4. |
| D7 | **Orden: 1 → 2 → 3 → 4** (§ 4). | Samuel: «lo que tú recomiendes». |
| D8 | **La superficie va en inglés:** nombres, descripciones y avisos. | Es lo que espera el mundo MCP y un cliente como adidas, y en una sola lengua. El español queda para la interfaz y para lo que el agente le dice a María. |

## 3. Lo que hay hoy (medido el 05-10)

Del inventario del registro y del análisis de Voronov, con archivo y línea.

**Tres superficies, no una.**
- 232 herramientas en el registro (`src/copilot/action/tools/registry.ts:344`, 43 módulos en
  `ALL_TOOL_MODULES`, `:413-457`): 55 de solo lectura y 177 que cambian algo.
- 10 meta-herramientas fuera del registro (`meta-tools/index.ts:50-62`), entre ellas los mejores
  ojos (`verifyGarment`, `compareCurves`, `measureAlongCurve`, `getFitMapStats`).
- 58 definiciones de herramientas de la interfaz con un bloque `copilot:` que nadie lee.

**Caminos para que un cerebro actúe: cuatro, y solo uno llega.**
- Llega `registry.execute` (`registry.ts:349-377`).
- `claudeBridge.ts` siempre devuelve `toolCalls: []` (`:97`): habla, pero no actúa.
- `server/copilotBridge.ts` no lo llama nadie, y es el protocolo al revés: Vina como cliente del
  agente.

**Costo.** Unos 58.000 tokens fijos por llamada al modelo, sin caché. Las descripciones van dos
veces (`AgenticLoop.ts:658-700`). Un turno de vestir hace al menos siete vueltas: más de 400.000
tokens solo en definiciones.

**Respuestas sin medida.**
- De las 177 que cambian algo, solo 7 devuelven alguna medida del resultado, y ninguna de costura
  trae un largo.
- 20 devuelven `{ success: true }` a secas.
- `success: true` quiere decir «corrió», no «quedó bien».
- La camisa de 5 piezas de María pide unas 28 llamadas. Siete son `compareCurves`, que existen solo
  porque `createSeam` no dice cuánto miden sus lados.

**Ojos que mienten.**
- `verifyGarment` compara perímetros de piezas enteras («Use perimeter as proxy»,
  `proactiveAnalysis.ts:257`) y marca el margen 0 como error. Con un patrón neto siempre dice «con
  errores».
- `getFitMapByPiece` copia la cifra global a cada pieza (`getFitMapByPiece.ts:88-97`).
- `SemanticEdge.length` se calcula al detectar los bordes y no se recalcula. Después de escalar o
  alargar, todo ojo que lo lea da el largo viejo.
- La meta `measureEdge`, con el largo guardado, tapa a la del registro, que lo calcula en el
  momento (`AgenticLoop.ts:530-533`).

**Los ojos buenos ya existen, en la interfaz.**
- «Caminar costura» calcula la diferencia, la holgura y un veredicto con tolerancia
  (`useWalkSeamTool.ts:228-305` y `:393-404`).
- El escalado que aplica las reglas por punto es `gradePieceToSize` (`gradingEngine.ts:187`); las
  herramientas del agente llaman a `gradePiece` y se lo saltan.

**La honestidad vive en el bucle.**
- Las compuertas contra los «listo» inventados están en `AgenticLoop.ts:243-423`. Existen porque
  Sonnet fabricaba éxitos.
- Un cliente MCP no las tiene.
- Ni dentro del bucle son obligatorias: la salida por texto plano no pasa por ninguna
  (`:475-485`).

## 4. Los cuatro subproyectos

Cada uno tiene su spec (esta es la del 1), su plan, su PR y su despliegue.

1. **La superficie.** Lo que detalla esta spec (§ 5): unos 20 verbos con recibo y ojos honestos. El
   agente de hoy pasa a usarla. Es grande: el plan puede partirlo en entregas, siempre que cada una
   deje la app desplegable y el agente funcionando.
2. **El puente MCP.** `npx vina-mcp`, un servidor MCP local en Node que lanza el agente de la
   usuaria (Claude Desktop, Claude Code, Cursor).
   - Un navegador no puede escuchar un socket, así que la pestaña de Vina se conecta al puente local
     con un botón «Conectar» y enseña su estado. Es el «Start MCP Server» de Blender.
   - La puerta vive en el botón «IA» de la barra superior.
   - El bloque de configuración se copia desde ahí.
   - Expone la misma superficie, verbo por verbo.
3. **El relevo con cuentas y cobro.** Un servicio pequeño y sin estado en el servidor de
   producción: la cuenta de la usuaria, la clave del modelo puesta por el servidor, la medición por
   cuenta y el cobro del pase.
   - El proxy de hoy (`/api/anthropic`, `src/copilot/providers/anthropic.ts:4-31`) solo esquiva
     CORS y deja pasar la clave de la usuaria. No basta.
4. **El agente de Vina sobre la superficie.** El bucle habla con un solo proveedor, el relevo. Se
   borran las claves de «IA y ratón», los seis proveedores, `claudeBridge.ts` y
   `server/copilotBridge.ts`.

**Nota del puente (2026-10-09).** El subproyecto 2 va antes de terminar el 1 y tiene su spec,
`2026-10-09-puente-mcp-design.md`. La puerta no es el botón «IA» sino un enchufe a su lado, con un
punto cuando hay un agente conectado: Samuel eligió esa variante viendo las maquetas.

## 5. Subproyecto 1: la superficie

### 5.1 La forma: unos 20 verbos

Cada verbo es un adaptador fino sobre el motor que ya existe. **No se reescribe geometría.** La
lista de partida tiene 21 verbos; el techo es 24 (§ 7). Un verbo nuevo entra solo cuando un ciclo
real de María lo pide.

**Leer (2).**

| Verbo | Qué devuelve | Sobre qué |
|---|---|---|
| `read_pattern` | Todo el patrón, con medidas calculadas en el momento. Piezas (id, nombre, categoría, lado, bloqueada, ancho, alto, área). Bordes por pieza (id, largo, recto o curvo, extremos). Costuras (id, los dos tramos, los dos largos, la diferencia, si caminan). Piquetes (id, pieza, borde, distancia a la esquina). Margen por borde y tipo de esquina. La revisión del proyecto. | El store y la geometría de hoy. Los largos se miden, no se leen de `SemanticEdge.length`. |
| `read_piece` | Una pieza en detalle: los puntos del contorno con coordenadas, las internas (pinzas, hilo, piquetes) con sus ids y los tramos de cada borde. Así los verbos que piden coordenadas o ids los tienen. | Hoy cinco verbos piden ids que ningún ojo enseña. |

**Medir (4).**

| Verbo | Qué devuelve | Sobre qué |
|---|---|---|
| `measure` | El largo de un borde, de un tramo o de una curva entre dos puntos. | La medida a lo largo de la curva de hoy (`measureAlongCurve`). |
| `walk_seam` | Dos tramos comparados: los dos largos, la diferencia, la holgura en % y el veredicto contra la tolerancia de la herramienta de la interfaz (la misma para los dos). | El motor de «Caminar costura» (`useWalkSeamTool.ts:228-305` y `:393-404`), sacado a `src/utils/seam/caminarCostura.ts`, que usan la herramienta y la superficie. |
| `verify` | El veredicto de la prenda, con números: cada costura caminada de verdad, los contornos que no cierran, los piquetes sin pareja. El margen 0 es lo normal y no es un error. | Lo que `verifyGarment` debía ser: `walk_seam` sobre cada costura, en vez del perímetro. |
| `fit_map` | Después de simular: las cifras del mapa de ajuste por pieza, de verdad. Si no hay simulación, `available: false` y el porqué. | Hoy el «por pieza» copia la cifra global. |

**Actuar (15).**

| Verbo | Qué hace | Qué mide su recibo |
|---|---|---|
| `create_piece` | Una pieza: rectángulo por medidas o polígono por puntos. | Ancho, alto, área y largo de cada borde. |
| `edit_outline` | Un verbo con modos: mover un punto, alargar un borde, fijar una medida (ancho, alto o largo de un borde). | Los largos nuevos de los bordes tocados, y la diferencia nueva de cada costura que los usa. |
| `sew` | Cose dos tramos, con su sentido. | Los dos largos, la diferencia, la holgura, y si camina dentro de la tolerancia. |
| `unsew` | Descose una costura. | Qué costura se fue y entre qué tramos estaba. |
| `notch` | Pone o mueve un piquete a una distancia de la esquina de un borde, solo o con su pareja al otro lado de una costura. | La distancia medida, el borde y la pareja. |
| `dart` | Pone una pinza o cambia su toma. | La toma antes y después, medida, y si los lados quedan iguales. |
| `seam_allowance` | El ancho del margen por borde o por pieza, y el tipo de esquina. | El ancho de cada borde tocado. |
| `classify` | La categoría y el lado de una pieza (delantero, espalda, manga…), que es lo que lee el vestir. | Lo que quedó escrito. |
| `assign_fabric` | La tela de una pieza o de todas. | La tela de cada pieza. |
| `dress` | Coloca las piezas sobre el avatar. | Qué piezas se colocaron, cuáles no y por qué, y qué costuras quedan activas. |
| `simulate` | Arranca o detiene la simulación. Con `wait`, responde cuando el simulador da la tela por asentada, o a los 60 s con `done: false` y el porqué. | El estado y, si se asentó, el resumen del mapa de ajuste. |
| `grade` | Las tallas, por `gradePieceToSize`. | Por talla, las medidas clave (POM) y su tolerancia. |
| `remove` | Borra una pieza o una interna. | Qué se borró. |
| `export` | DXF o PDF. | El archivo, las piezas y las tallas incluidas. |
| `undo` | Deshace el último paso del historial, solo si fue del agente. Si el último paso es de María, no deshace nada: `done: false` y el aviso. | Qué se deshizo y la revisión que queda. |

**Lo que no entra en la lista**, aunque exista en el registro: nesting, BOM, colorways, render,
avíos, anotaciones, artes, POM sueltos, vista y memoria. Ningún ciclo de María los pide hoy. Si uno
los pide, el verbo entra con su recibo.

### 5.2 El recibo

Todo verbo de «Actuar» devuelve un recibo con esta forma:

```ts
interface Recibo {
  /** true solo si la medida confirma el resultado (§ 5.3). */
  done: boolean;
  /** Qué cambió, por id. */
  changed: { created: string[]; modified: string[]; deleted: string[] };
  /** La medida del resultado, propia de cada verbo (§ 5.1), calculada después del cambio. */
  measure: Record<string, number | string | boolean | null>;
  /** Lo que no cuadra, con números: «the seam does not walk: 4.2 mm apart (tolerance 3 mm)». */
  warnings: string[];
  /** La revisión del proyecto antes y después: el agente ve si algo cambió, y si María tocó algo en medio. */
  revision: { before: number; after: number };
}
```

Los verbos de «Leer» y «Medir» devuelven sus datos más `revision`.

### 5.3 Las reglas de honestidad

Son las compuertas del bucle, mudadas a la respuesta. Valen para cualquier cerebro.

1. **`done: true` solo si la medida confirma el resultado.**
   - Coser: la costura existe y sus dos tramos están medidos.
   - Piquete: está en el borde pedido, a la distancia pedida, con 0,5 mm de margen.
   - Pinza: la toma medida es la pedida.
2. **Todo número de un recibo se calcula después del cambio.** Nunca se lee de un campo guardado
   (`SemanticEdge.length`).
3. **Un fallo es `done: false` con sus `warnings`.** Nada falla callado, y nada cambia a medias: si
   un verbo no puede terminar, deshace lo que hizo.
4. **Una pieza bloqueada no se toca:** `done: false`, «piece is locked».
5. **Leer antes de inventar.** Las respuestas traen ids, nombres y la revisión, así que lo que dice
   el agente se puede contrastar con lo que hay.

En el bucle del agente de Vina (§ 5.6) queda una sola compuerta, la salida por `presentToUser`, y
cambia su condición: «listo» exige un recibo con `done: true` desde la última confirmación, y ya no
cualquier llamada.

### 5.4 Deshacer, permisos y caja negra

- **Un verbo, un paso de deshacer.** Cada llamada va en un lote de deshacer con su nombre, por
  ejemplo «Agente: coser delantero con espalda». María lo deshace con Ctrl+Z como cualquier gesto
  suyo; el agente lo hace con `undo`.
- **Borrar actúa y ofrece deshacer** (contrato de interfaz § 4): un aviso con «Deshacer». Los demás
  verbos no avisan, para no llenar la pantalla con 20 avisos por tarea.
- **La caja negra ve toda llamada.** Una entrada de bitácora por verbo: el verbo, de dónde viene
  (`mcp` o `vina`), un resumen de los argumentos y del recibo, y la revisión. Si María dice «la IA
  me borró la manga», la bitácora lo enseña.
- **La revisión del proyecto** es un contador que sube con cada cambio del proyecto. Si no existe,
  se crea.

### 5.5 El idioma

- **En inglés:** los nombres, las descripciones, las claves del recibo y el texto de los `warnings`
  (D8).
- **Las descripciones van una sola vez.** Hoy van dos: en las definiciones y en el prompt.
- **Lo que el agente de Vina le dice a María sigue en español:** lo pide su prompt.

### 5.6 El agente de hoy pasa a la superficie

Dentro de este subproyecto, para probar la superficie desde el primer día y cumplir D4:

- El bucle (`AgenticLoop.ts`) recibe como herramientas los verbos de la superficie y nada más: ni
  las 232 del registro ni las meta-herramientas sueltas.
- Las compuertas de grounding y done-gating se reemplazan por las reglas de § 5.3. La salida por
  `presentToUser` se queda.
- Las claves y los proveedores siguen como están hasta el subproyecto 4.
- Lo que quede sin uso del registro y de las meta-herramientas se borra en este subproyecto si
  nadie más lo llama; si algo más lo llama, se anota para el subproyecto 4.

### 5.7 Lo que no entra en el subproyecto 1

- El puente MCP y su puerta: subproyecto 2.
- El relevo, las cuentas y el cobro: subproyecto 3.
- Quitar las claves y los proveedores: subproyecto 4.
- Organizar las conversaciones del agente de Vina, y la caché de definiciones por proveedor: cuando
  el agente de Vina hable con un solo proveedor.

**Nota del plan de la entrega 1a (2026-10-05).** Lo que el código y la camisa de María afinaron (plan
`docs/superpowers/plans/2026-10-05-ia-superficie-1a.md`, «Decisiones»):

- La tolerancia es la de «Caminar costura», 3 mm.
- **Vina no adivina la holgura.** Camina quien queda con |diferencia − holgura buscada| por debajo
  de la tolerancia, y la holgura buscada es 0 salvo que el agente la pase (`ease_mm`).
  - En la camisa de María la copa de la manga mide 450,9 mm y la sisa entera 450,5 mm: 0,4 mm de
    embebido.
  - Una regla de 30-50 mm por categoría, como `SLEEVE_CAP_EASE`, habría marcado rotas sus cuatro
    costuras de manga.
- Cada lado de una costura se mide por su tramo cosido (`sewnLengthMm`).
- Un piquete da su distancia desde el inicio de su borde, y la de su ancla cuando la tiene.
- `fit_map` pasa a la entrega 1b, con `simulate`.
- La revisión del proyecto es por sesión.
- El lienzo medía, pintaba y anclaba cada costura por el primer comando de su borde: la etiqueta de
  desajuste, los largos al pasar el ratón y el resalte, que en la sisa de María era de 2,4 mm. Ahora
  mide con lo mismo que el agente y pinta y ancla el borde entero. Una costura sobre el tramo de
  cierre, que no se pintaba, se pinta.
- Las costuras M:N (`seamGroups`) se anuncian en `warnings` y no se describen todavía. Si las hay,
  `verify` no dice `ok`.
- Un borde se nombra por su `name`.
- `measure` acepta fracciones o puntos sobre el borde.
- El desvío de un punto a un borde sale de la misma proyección que su distancia (`projectOntoPath`).
  La ida y vuelta de antes mentía en las curvas: `pointAtPathDistance` es lineal en el parámetro, no
  en el arco. Sigue así para quien coloca un punto a una distancia; eso queda pendiente.
- `verify` recibe la holgura buscada por costura (`ease_mm`) y deja fuera las costuras apagadas. Cada
  costura medida trae su `tension` y si está activa.
- Los piquetes de una costura parcial son los de su tramo cosido (`auditNotches`). El aviso dice el
  hecho y ya no aconseja copiar el piquete que falta.
- Lo que `verify` dice de la camisa de María:
  - costados y hombros caminan;
  - las dos mitades de cada copa quedan a ±5 mm, porque autoSew parte la copa en t = 0,5 y las sisas
    miden 230,6 mm (delantera) y 219,9 mm (trasera);
  - el cuello mide 62 mm menos que el escote (456 contra 518);
  - los piquetes:
    - en la costura delantera de cada manga, los 2 de la sisa delantera no tienen pareja;
    - en la trasera, los 2 de la manga tampoco.

    Por las distancias (43,9 y 60,8 mm desde el inicio de la sisa delantera; 43,8 y 59,8 desde el
    final de la copa), autoSew parece haber cosido las mitades de la copa a la sisa que no les toca.
    Es una hipótesis.

  Son diferencias reales, no ruido.

  **Medido el 2026-10-06.**
  - **El cruce no llega a la app.** autoSew solo, sin pose, sí da a la sisa trasera la mitad de la
    copa que lleva los piquetes. Pero worldRefine corre antes de guardar en los cuatro caminos que
    cosen desde la app (el menú, «Re-coser» y las dos herramientas del agente), devuelve esa mitad a
    la sisa delantera, y los piquetes casan. Los tests de esta nota cosían sin worldRefine.
  - **Los ±5 mm sí eran de Vina.** La copa se partía en t = 0,5 aunque las sisas no miden lo mismo.
    Ahora se parte donde cada mitad mide lo que su sisa (`src/utils/autoSew/repartoDeCopa.ts`), y las
    cuatro medias costuras quedan a 0,2 mm. Con `SEAM_ENGINE_VERSION` 2, «Re-coser» se ofrece solo
    donde hay mitades de copa del motor anterior, y rehace solo esas.
  - **El cuello parece una tira de punto** (provisional hasta que María lo confirme). Es un
    rectángulo de 456 × 40,9 mm sobre un escote de 518 mm sin abertura: el 88 %, que es lo que se
    corta una tira para que se estire y quede plana. Vina la reparte pareja (88 % delante y detrás).
    Que el lienzo la marque con «⚠» es otra cosa: no hay cómo decirle a Vina que esa diferencia es a
    propósito.
  - Los dos caminos que cosen sin pose, la carga generativa de `loadProject` y el motor paramétrico
    (`useParametricEngine`), no tienen llamador en la app: nadie despacha `project/loadProject` fuera
    de los tests, y ningún componente usa el hook.
- Las definiciones de los cinco verbos miden 4.605 caracteres, contra unos 203.000 del registro de
  hoy por llamada (§ 3).

**Nota del plan de la entrega 1b, primera mitad (2026-10-09).** Plan
`docs/superpowers/plans/2026-10-09-ia-superficie-1b.md`. Entran siete verbos de «Actuar»:
`create_piece`, `edit_outline`, `sew`, `unsew`, `notch`, `remove` y `undo`. Lo que el código afinó:

- `Recibo.measure` admite medidas anidadas (los bordes de una pieza, una costura medida).
- Un id que no existe o unos argumentos inválidos son un error dicho. Lo que el patrón no permite
  (una pieza bloqueada, una distancia más allá del borde, una medida que no confirma) es un recibo
  con `done: false`. En los dos casos no cambia nada.
- Cada verbo mide lo que va a escribir antes de despachar y vuelve a medir el estado de después. Si
  esa segunda medida no confirma, el paso se deshace y queda en «Rehacer».
- Los verbos usan los escritores de la interfaz. `edit_outline` tiene tres modos, y cada uno es una
  cota de la interfaz: `move_point` (el arrastre de un nodo), `set_length` (la cota «Largo» de un
  lado de un solo tramo recto) y `set_size` (las cotas «Ancho» y «Alto»).
- `sew` cose en el mismo sentido salvo `reversed`, como la herramienta de coser. Los tramos se dan
  en el sentido de su borde; el rango de un B invertido se guarda espejado y se lee sin espejar.
- Las costuras del agente llevan `createdBy: 'ai'` y ya no salen viejas: `isStaleAiSeam` solo mira
  las de autoSew (id `auto-seam-`). Antes «Re-coser» borraba lo que hubiera cosido el agente.
- El piquete con pareja va por la costura que cose ese punto (una copa partida tiene dos), en el
  sentido de la costura y a la distancia de arco que le toca. Si ninguna costura cose el punto, se
  rehúsa. Mover un piquete no mueve su pareja; el recibo lo avisa.
- `notchPoint` mide un piquete por el centro de su base. En una V, una U, un castillo o un piquete
  doble, el primer punto del trazo está corrido medio ancho por el borde, y `read_pattern` lo medía
  1,5 mm fuera de sitio.
- Borrar avisa: «La IA borró Manga 2», con «Deshacer», que deshace ese paso solo si sigue siendo el
  último. Si no, el aviso dice «No se deshizo nada porque después hubo otros cambios; usa Deshacer
  hasta que vuelva lo borrado». Descoser no avisa. Los pasos del historial se llaman «IA: coser
  Delantero con Espalda»: el «Agente:» de § 5.4 era un ejemplo. Textos aprobados por Samuel.
- Coser y descoser una pieza bloqueada se permite, como en la interfaz; el candado protege su
  contorno y sus internas.
- Medido en la camisa de María: un piquete con pareja a un 20 % de la copa cae en la sisa que cose
  esa mitad, dentro de ella, y no en un extremo como antes.
- La superficie tiene 12 verbos y sus definiciones miden 11.060 caracteres.
- Queda para la segunda mitad: `dart`, `seam_allowance`, `classify`, `assign_fabric`, `dress`,
  `simulate` con `fit_map`, `grade` y `export`.

**Nota del plan de la entrega 1b, segunda mitad, parte A (2026-10-09).** Plan
`docs/superpowers/plans/2026-10-09-ia-superficie-1b2-ajuste.md`. Entra el ciclo del ajuste:
`classify`, `assign_fabric`, `dress`, `simulate` y `fit_map`. La parte B (`dart`,
`seam_allowance`, `grade`, `export`) tiene su propio plan. Lo que el código y dos sondas
afinaron:

- **La simulación solo avanza con Vina a la vista.**
  - Con otra pestaña delante o la ventana minimizada, el navegador baja a 1 cuadro por segundo y
    la tela no se mueve.
  - `simulate` mira el latido: los cuadros de tela nueva que la app dibuja
    (`latirLaSimulacion`, en el `useFrame` de `GarmentSimulation`).
  - No espera de balde. Lo dice con la pestaña oculta 2 s, sin cuadro nuevo en 10 s, o sin
    ningún cuadro en 30 s; en este último caso, con lo último que dijo el solver.
- **Asentada.** Pasados 180 cuadros, la tela se mueve menos de 0,02 mm por cuadro (percentil 95
  de sus vértices) en tres lecturas seguidas, separadas por al menos 30 cuadros.
  - Medido con la camisa de María cosida, en WebGPU: el percentil 95 baja de 4,9 mm a ~0,01 mm
    hacia el cuadro 500, y ahí se queda entre 0,006 y 0,015. El máximo nunca baja de 0,14: unos
    pocos vértices tiemblan siempre.
  - En WASM el worker da un cuadro cada 1-2 s: la camisa no se asienta en el plazo, y el recibo
    lo dice con el tier, los cuadros por segundo y lo que se mueve todavía.
- **`wait_seconds`** va de 1 a 110 y por defecto vale 60: los 60 s de esta spec, siempre por
  debajo de los 120 s del puente.
- **`stop` pausa:** la app libera el solver y la tela queda donde estaba. Un `start` después
  vuelve a vestir desde la pose del vestido.
- **`fit_map` mide cada pieza por sus aristas y por largo de tela** (las del manifiesto de la
  malla), con la tela de la simulación. Da la mediana y el percentil 95 del estiramiento, y qué
  parte de la tela pasa del 80 % («ajustada») o del 100 % («no se puede poner») de lo que aguanta.
  - No toma el máximo de cada vértice, como el mapa en pantalla: con eso, un 4 % de aristas
    estiradas pintaba de rojo casi toda la pieza.
  - Deja fuera las aristas de menos de 1 mm: son astillas del mallado y daban 240-890 %.
  - Sin el cuerpo, como la app (que pasa el avatar como `null`): cuenta la pieza entera.
  - Las aristas del solver se piden mientras falten, con el mapa en pantalla o sin él.
  - El «por pieza» que copiaba la cifra global (`getFitMapByPiece`) no lo usa la superficie.
- **`dress` no escribe el patrón** ni borra lo que María movió a mano, cosa que la herramienta
  vieja (`arrangeGarment`) sí hacía. Para la simulación si corre y deja el 3D en vestir.
  - Por cada pieza dice si su región la decidió la categoría o el nombre. La que Vina no sabe
    ubicar sale sin región, con el aviso de clasificarla: caería en el delantero del torso.
- **Desde 2D, `dress` y `simulate` pasan la vista a Split**, como el panel de render.
- **`classify` nombra de nuevo los bordes por la categoría solo si nada los usa** (costuras,
  grupos, pliegues, elásticos, puntos de medida). Si algo los usa, los deja y lo avisa. Sin
  `side`, el lado viejo se va.
- **El candado protege el contorno y las internas:** `classify` y `assign_fabric` se permiten,
  como coser.
- **`assign_fabric`** usa la biblioteca que lee el simulador (`PHYSICAL_FABRIC_LIBRARY`).
  - El simulador viste con una sola tela: la toma cuando todas las piezas activas comparten una.
    Si difieren, sigue con la suya y el recibo lo dice.
  - La tela de las piezas se deshace con Ctrl+Z; la de la simulación no, porque es estado de la
    simulación, como la vista.
- **Pasos del historial:** «IA: clasificar Manga», «IA: poner Denim 12oz a 5 piezas» (el
  `nameEs` de la tela).
- **Lo que dio la camisa de María al vestirla:** el clasificador geométrico ubica las cinco
  piezas (cuello, dos mangas, delantero, espalda) con 15 costuras activas.
  - Quitada la categoría del cuello, `dress` lo nombra sin región. `classify` como cuello deja
    sus bordes, que están cosidos, y entonces la camisa se viste entera.
- **Las instrucciones** dicen que la simulación solo avanza con Vina a la vista, y la línea del
  candado dice lo que protege.
- **La superficie tiene 17 verbos** y sus definiciones miden 14.646 caracteres.
- **Lo que cambió la revisión final (Opus, 0 críticos, 3 importantes y 2 menores subidos de grado):**
  - Las piezas que se visten y se simulan salen de un solo filtro, el de `GarmentSimulation`
    (`piezasEnLaSimulacion.ts`): activas, sin ocultar en 3D y en una capa visible. `dress` dice
    cuáles deja fuera y por qué; antes miraba solo `active` y vestía otra prenda que la simulada.
  - `classify` tampoco nombra de nuevo los bordes si un avío está puesto sobre uno o si un borde
    tiene margen propio: el margen se perdía en silencio.
  - `fit_map` no mide una tela recién montada (0 cuadros desde que se montó): daba un ajuste
    perfecto de la pose de partida.
  - «No arrancó» cita lo que dijo el solver en esta corrida, no en una vieja.
  - Dos lecturas iguales de la malla no cuentan como tela quieta: en TSL la malla se relee cada
    15 cuadros.
- **El simulador estiraba la tela (medido y arreglado el 10-10, Samuel: «Física primero»).** Con la camisa de María
  cosida y asentada en WebGPU, el 15-26 % del cuerpo pasa del 8 % de estiramiento con ~12 cm de
  holgura de pecho sobre el avatar «mujer-eu38» (88 cm), así que `fit_map` y el mapa de ajuste de
  la app dicen «no se puede poner» de una camisa holgada.
  - No es la medida: el reposo de la malla es el patrón plano (UV × 0,1 exacto) y la tela
    envuelta nace a 0 %.
  - No es una costura: quitar el cuello, las mangas, los costados o los hombros deja el
    estiramiento entre 14 y 20 %; solo sin ninguna costura baja al 2 %. Tampoco es el tirante del
    cuerpo ni la velocidad del cierre.
  - Es convergencia: con 15 subpasos por cuadro las restricciones «rígidas» no aguantan el peso
    de la prenda cerrada, que cuelga de los hombros, y lo de arriba se estira. Con 30 subpasos
    queda en 3,8 % (p95 6,9 %); con 45, en 1,6 % (p95 4,0 %), como sin coser.
  - El precio en esta máquina, con la camisa de María: 25,3 cuadros/s con 15, 12,9 con 30 y
    ~8,5 con 45.
  - El mecanismo: el estiramiento, con su tope rígido del 2 %, corría al principio del subpaso;
    costuras, autocolisión, tirante y colisión volvían a estirar después, y eso solo se corregía
    en el subpaso siguiente.
  - El arreglo (Samuel eligió «tres repasos»): el estiramiento se repasa tres veces en cada
    subpaso, después del suelo y ANTES de la colisión con el cuerpo (`nodosDelSubpaso.ts`).
    Medido: 21,7 cuadros/s, 3,7 % de aristas sobre el 8 % y p95 de 6,9 %, lo mismo que 30
    subpasos, sin penetración.
  - Dónde van importa. La primera versión los ponía entre la colisión y el cierre: la fricción
    no los veía y el cierre los tomaba por empuje, y la prenda subía sola (el ruedo, de 0,836 a
    0,864 m entre el segundo 1 y el 8). Antes de la colisión entran en la velocidad como
    cualquier restricción y la camisa queda quieta (ruedo a 0,850-0,851 m; el área crece 0,7 %
    en 8 s, contra 4,6 % sin repasos). Medido con el descenso largo de la réplica de María.
  - Solo el tier GPU tiene los repasos. WASM y CPU tienen el mismo tope del 2 % (backport A7
    STEP-4) pero no los repasos, así que ahí la tela se lee más estirada; `fit_map` lo dice en
    su respuesta fuera de WebGPU.
  - Validado en GPU (`@gpu-local`, versión final): pasan la caída M4, el cierre de costuras (las
    cuatro sisas a 0,2-0,3 cm), el determinismo, el descenso largo, la demo del flujo y los
    diagnósticos del mapa de ajuste (su prueba de paridad leía una sola vez una muestra que
    llega después; ahora la espera). El orden de Cusick pasa, pero por azar: chiffon y canvas
    dan 10,3 los dos (la tela no se distingue en el disco, problema anterior). El DoD de ≥30
    cuadros/s falla en esta máquina con y sin repasos: 25,8 sin ellos, 22,5 con ellos (−13 %).
  - `fit_map` de la camisa holgada, cada cambio por separado. El solver: las aristas sobre el
    8 % bajan de 17,9 % a 3,7 % con los repasos (misma medida). La medida: por vértice (el
    máximo de sus aristas) un 4 % de aristas estiradas pintaba de rojo casi toda la pieza, y
    salía 70 % «no se puede poner»; por largo de tela y sin astillas, la prenda queda en mediana
    0,1 %, p95 7,1 % y 3,5 % «no se puede poner». El delantero 6,2 %, la espalda 2,7 %, las
    mangas 0,1-0,4 % y el cuello 4,7 % (la tira de punto, cosida como popelina).
  - Prenda ajustada (10-10): la camisa de María (≈100 cm de pecho) sobre las tallas 46 y 48 de
    la biblioteca (busto 104 y 108). Ninguna costura se abre (la media de cada una queda bajo
    1 cm) y la penetración es 0, con y sin repasos. Sin repasos la prenda da 19-20 % «no se
    puede poner» en todas las tallas, holgada o no: era el residuo del solver, no el ajuste. Con
    repasos: 3,5 % (talla 38), 3,8 % (46) y 6,0 % (48); el delantero, 6,2 / 7,1 / 11,1 %. Ahora
    el ajuste se distingue, pero poco: la popelina no pasa del tope y la prenda chica se acomoda
    sin estirarse; que no entre es contacto con el cuerpo, y `fit_map` no lo mide.
  - El cuello: con repasos la costura del cuello al escote se abre en un punto, hasta 3,3 cm en
    la talla 38 y 4,5 cm en la 48 (media 0,6-0,9 cm; sin repasos, 0,9 cm como máximo). El cuello
    mide 62 mm menos que el escote: parece una tira de punto que en la realidad estira, pero la
    simulación viste todo con una sola tela y en GPU el estiramiento es rígido con el mismo tope
    del 2 % para todas, así que el punto se comporta como la popelina. El arreglo de fondo es un
    tope por tela, con la tela de cada pieza llegando al simulador.

## 6. Riesgos

- **Perder alcance.** La superficie corta deja fuera nesting, BOM, colorways, render y avíos. Si
  María los pide al agente, no los encuentra. La regla de § 5.1 los deja entrar uno a uno, con su
  recibo.
- **El inglés de la superficie.** Un agente que habla con María en español traduce los avisos. Hoy
  los modelos lo hacen bien. Si un aviso llega en inglés a la pantalla de María, es un fallo del
  prompt del agente de Vina, no de la superficie.
- **Dos manos a la vez.** Un agente externo actúa mientras María trabaja. La revisión de cada
  recibo deja ver el cambio ajeno. No hay bloqueo; si molesta, se añade después.
- **El motor de «Caminar costura» vive dentro de un hook.** Hay que sacarlo a una función pura sin
  cambiar lo que la herramienta enseña. La herramienta de la interfaz y la superficie quedan
  usando la misma.
- **Los e2e del copiloto.** Los specs que fijan las 232 herramientas o el bucle de hoy cambian. Cada
  uno se actualiza en su tarea; ninguno se salta.
- **La estrategia escrita se contradice.**
  - `docs/business/OPEN-SOURCE-STRATEGY.md` § 1 dice «100% free (no SaaS tiers…)», contra el pase
    pagado de `SUSTAINABILITY-MODEL.md` § 3 y del pitch.
  - El «BYOK gratis» de ese modelo queda sustituido por el MCP.
  - Se corrige en § 8.

## 7. Pruebas y medidas

- **La superficie es corta** (test de repo): como mucho 24 verbos, y las definiciones que se mandan
  en cada llamada no pasan de 30.000 caracteres (unos 8.500 tokens). Es un trinquete, como los de la
  interfaz: el techo solo baja.
- **Todo verbo de «Actuar» devuelve un recibo** con `measure` no vacío y `revision`. Lo prueba un
  test de contrato que corre cada verbo sobre un patrón de prueba.
- **Las reglas de honestidad, una por una.**
  - Un verbo sobre una pieza bloqueada da `done: false`.
  - Una costura que no camina sale en `warnings`.
  - Un largo medido después de alargar un borde no es el viejo.
  - `verify` sobre un patrón neto no marca el margen 0.
- **El ciclo de María, medido.** Con su DXF de 5 piezas: clasificar, coser, verificar y vestir. La
  meta es cerrarlo en no más de 16 llamadas (hoy son unas 28), con `verify` diciendo la diferencia
  real de cada costura.
- **El costo, medido.** Los caracteres fijos por llamada, antes y después, quedan anotados en el
  plan.

## 8. Enmiendas

| Documento | Cambio | Cuándo |
|---|---|---|
| `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` § 6.2 | La cápsula es la puerta del agente de Vina (el tier) y la paleta. El botón «IA» gana el estado de la conexión MCP. | Con el subproyecto 2. |
| `docs/business/OPEN-SOURCE-STRATEGY.md` § 1 | Núcleo abierto y gratis; el pase de IA hospedada es pagado. Se quita «no SaaS tiers». | Con esta spec. |
| `docs/business/SUSTAINABILITY-MODEL.md` § 3 | El camino gratis es traer el propio agente por MCP, no las claves dentro de Vina. | Con esta spec. |
| `CLAUDE.md`, fila D4 | AgentSettings deja de vivir en la barra; las claves salen de Vina. | Con el subproyecto 4. |
