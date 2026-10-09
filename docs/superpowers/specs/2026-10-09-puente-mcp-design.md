# El puente MCP: tu agente trabaja en el patrón abierto en Vina

- **Fecha:** 2026-10-09.
- **Estado:** diseño aprobado por Samuel en conversación («dale con A»). Con ese sí, la spec, el plan
  y la ejecución siguen sin parar. Push, PR, merge, deploy y la publicación en npm esperan su orden.
- **Spec madre:** `2026-10-05-ia-una-superficie-design.md`. Esta es la spec del subproyecto 2 (§ 4,
  punto 2). El orden del § 4 cambia: el 2 va antes de terminar el 1 (D7, «lo que tú recomiendes»).
  La superficie tiene 12 verbos y hasta ahora ningún cerebro conectado. El puente no le quita nada a
  nadie y deja probar con un agente real todo lo que venga después.

## 1. Qué es

Un agente de la usuaria (Claude Code, Claude Desktop, Cursor) trabaja sobre el patrón que tiene
abierto en Vina, con los verbos de la superficie. Se hace como en Blender: el agente arranca un
programa local, `npx -y vina-studio` (que corre `vina-mcp`), y la pestaña de Vina se conecta a ese programa con un botón. Vina
no guarda claves ni habla con ningún modelo: el cerebro es el de la usuaria.

## 2. Lo medido el 09-10

La prueba usó un servidor WebSocket en `127.0.0.1` y la página de producción, en Playwright y en
Chrome con ventana. El código fue desechable y no entra al repo.

- **Chrome 155, Edge 154 y Brave 155** no dejan que una página HTTPS abra `ws://127.0.0.1` sin
  permiso: `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. Con el permiso concedido, abren en 5-8
  ms.
- **La primera vez, el navegador pregunta**: «vina.sdar.dev quiere acceder a otras aplicaciones y
  servicios de este dispositivo», con «Permitir» y «Bloquear». Mientras pregunta, la conexión espera;
  con «Permitir», se abre.
- **`navigator.permissions.query({ name: 'local-network-access' })`** existe en Chrome 155 y devuelve
  `prompt`, `granted` o `denied`. Con eso la hoja sabe si avisar del permiso o explicar que el
  navegador lo negó.
- **Sin puente**, el error llega en milisegundos.
- **El Chromium 145 de Playwright no hace esa comprobación.** Los e2e entran desde `localhost`, que
  tampoco pregunta.
- **Producción manda `Content-Security-Policy-Report-Only`** con un `connect-src` que no incluye
  `ws://127.0.0.1`. Hoy solo avisa en la consola; no bloquea.
- **Firefox y Safari quedan sin medir:** no están instalados en la máquina.
- **Los nombres `vina-mcp` y `vina-studio` están libres en npm** (09-10). `vina`, a secas, lo tiene otra persona.

## 3. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| P1 | **La puerta es un enchufe al lado de «IA»** (la variante A de las maquetas). Lleva un punto verde cuando hay un agente conectado y abre la hoja «Tu agente». | Samuel: «dale con A». Siempre está a la vista (ley de puertas), y con un clic se conecta o se desconecta. Reemplaza «el botón IA gana el estado» de la spec madre. |
| P2 | **`vina-mcp` es un programa de Node sin dependencias nuevas** (solo `ws`, que el repo ya tiene) y sin paso de compilación (`.mjs`). El MCP va escrito a mano: cinco métodos. | Usamos un trozo corto del protocolo. Si crece (recursos, prompts, progreso), se pasa al SDK oficial; queda dicho en un comentario `ponytail:`. |
| P3 | **El agente arranca el puente por stdio; el puente espera a la pestaña en `127.0.0.1:8462`.** `VINA_MCP_PORT` cambia el puerto (para las pruebas). | Un navegador no puede escuchar un socket: la pestaña tiene que llamar. 8462 es «VINA» en el teclado del teléfono. |
| P4 | **Una pestaña a la vez:** gana la última, y la anterior se apaga diciendo por qué. | Dos pestañas que reintentan se robarían la conexión sin fin. |
| P5 | **Un puerto, un puente.** Si el 8462 está ocupado (otra sesión del agente lo tiene), el segundo puente sigue vivo, reintenta cada 3 s y responde a cada llamada que otra sesión tiene la conexión. | En esta máquina corren a veces dos sesiones de Claude Code a la vez. Morir dejaría al agente con un servidor caído y sin explicación. |
| P6 | **El puente solo acepta a Vina como pestaña:** `Origin` igual a `https://vina.sdar.dev`. `http://localhost` y `http://127.0.0.1`, con cualquier puerto, solo con `VINA_MCP_ALLOW_LOCAL=1` (desarrollo, e2e). Lo demás, 403, y el puente registra el rechazo. | Que otra web abierta no se haga pasar por la pestaña. La revisión final mostró que «cualquier web local» era demasiado: un servidor de desarrollo ajeno, o un XSS en uno, podía cambiarle al agente las descripciones de las herramientas. |
| P7 | **La lista de verbos viaja dos veces:** horneada en el paquete (`mcp/superficie.json`) y en el saludo de la pestaña. Si difieren, manda la de la pestaña, y el puente avisa con `notifications/tools/list_changed`. Un test exige que la horneada sea igual a la de la superficie. | El agente pide la lista al arrancar, casi siempre antes de que la pestaña conecte. La pestaña desplegada es la verdad: un paquete viejo no recorta verbos nuevos. |
| P8 | **Las instrucciones para el agente viven en la superficie** (`instrucciones.ts`, en inglés) y viajan horneadas y en el saludo. El MCP las da en `initialize.instructions`. | D4: el agente de Vina recibirá las mismas. D8: la superficie va en inglés. |
| P9 | **Una llamada espera a la pestaña hasta 120 s.** Si la pestaña se va a mitad, la llamada vuelve con error al momento. Sin pestaña, la llamada espera hasta 4 s a que llegue, y después vuelve con error y con lo que hay que hacer. Cada llamada lleva su plazo (`hasta`): la pestaña no corre una vencida, y los errores de plazo y de corte dicen que pudo haberse aplicado. | `simulate` con `wait` llegará a 60 s (segunda mitad de la 1b). La pestaña reintenta cada 3 s: el agente arranca el puente y llama enseguida, casi siempre antes de que la pestaña lo encuentre. Sin el plazo, una llamada dada por fallida podía correr después, y el agente, al reintentar, la duplicaba (revisión final). |
| P10 | **«Conectar» no se recuerda entre recargas.** El permiso del navegador sí se recuerda. | Conectarse es un permiso por sesión. Si molesta, se guarda después. |
| P11 | **El resultado viaja como texto JSON en `content`:** `{ result, revision }`. Con `ok: false` va `{ error, revision }` con `isError`; si el puente no pudo llamar, el porqué, en texto y con `isError`. Un `done: false` no es error: es la respuesta honesta (§ 5.3 de la spec madre). | Todo cliente MCP lee texto. Un `structuredContent` sin `outputSchema` no lo usa nadie todavía. La revisión viaja en toda respuesta, también en las de leer. |
| P12 | **Publicar en npm es un paso aparte**, con la cuenta y la orden de Samuel, y va antes del deploy de la puerta. Se publican los dos paquetes, `vina-mcp` primero. | La hoja enseña `npx -y vina-studio`, que depende de `vina-mcp`. El repo es público, así que conviene reservar los nombres pronto. |
| P13 | **El paquete que se enseña es `vina-studio`, con `vina-mcp` dentro.** `vina-studio` (`studio/`) es una entrada de dos líneas que arranca el bin de `vina-mcp`, su única dependencia, con la versión exacta. `vina-mcp` sigue siendo el motor y también se publica. | Samuel: «vina-studio con vina-mcp dentro». La usuaria pega el nombre del producto; el descriptivo queda como motor y deja reservado ese nombre. Costo: dos paquetes y dos publicaciones por versión. Un test exige que la dependencia sea la versión de `mcp/`, y otro que la hoja enseñe el nombre que se publica. |

## 4. Las piezas

### 4.1 `mcp/`, el paquete `vina-mcp`, y `studio/`, el paquete `vina-studio` (P13)

**`studio/`** tiene `package.json` (nombre `vina-studio`, un solo `bin` que se llama como el paquete,
dependencia exacta de `vina-mcp`), `bin/vina-studio.mjs` (importa el bin de `vina-mcp`), el README
completo para la usuaria y la licencia. El README de `mcp/` solo apunta a `vina-studio` y lista las
variables de entorno.

- **`mcp/package.json`:** nombre `vina-mcp`, `bin`, `type: module`, dependencia `ws`, Node ≥ 18.
- **`mcp/bin/vina-mcp.mjs`:** une la entrada y la salida estándar con el puente. Lo que registra va a
  stderr: stdout es del protocolo.
- **`mcp/src/protocolo.mjs`:** el MCP a mano, JSON-RPC 2.0 por líneas.
  - Responde `initialize`, `ping`, `tools/list` y `tools/call`, y acepta `notifications/initialized`.
  - A otros métodos les responde `-32601`; a otras notificaciones, nada.
  - Versión del protocolo: responde la que pide el cliente si la conoce. Si no, la más nueva que
    conoce.
- **`mcp/src/puente.mjs`:** el servidor WebSocket. Comprueba el origen, deja una pestaña a la vez,
  lleva las llamadas pendientes con su tiempo máximo y reintenta el puerto.
- **`mcp/superficie.json`:** lo horneado, `{ instrucciones, definiciones }`.
- **`mcp/README.md`:** cómo se configura en Claude Code, Claude Desktop y Cursor.

Entre la pestaña y el puente viaja JSON por WebSocket, en la versión 1 del protocolo:

| Sentido | Mensaje | Cuándo |
|---|---|---|
| pestaña → puente | `{ t: 'hola', v: 1, instrucciones, definiciones }` | al abrir |
| puente → pestaña | `{ t: 'agente', nombre, version }` | cuando el agente se presenta, o al llegar la pestaña si ya se presentó |
| puente → pestaña | `{ t: 'llamada', id, verbo, args, hasta }` | por cada `tools/call`; `hasta` es el instante (ms, el reloj de la máquina) en que el agente la da por fallida |
| pestaña → puente | `{ t: 'respuesta', id, respuesta }` | la `Respuesta` de `ejecutarVerbo` |

El puente cierra con el código **4001** cuando llega otra pestaña. Un saludo de otra versión (`v` distinto de 1) o sin lista no cambia nada: el puente sigue con su lista horneada y registra que hay que actualizar `vina-studio`. Si el puente no puede escuchar por algo que no sea el puerto ocupado, sigue vivo y lo dice en cada llamada.

### 4.2 La pestaña

- **`src/copilot/superficie/instrucciones.ts`:** las instrucciones para el agente, en inglés: qué es
  Vina, que todo va en milímetros, leer antes de actuar, qué es un recibo y que `done: false` es una
  respuesta, que cada cambio es un paso de Ctrl+Z, y que `undo` deshace solo lo suyo.
- **`src/copilot/puente/conexion.ts`:** el cliente.
  - Estados: `apagado`; `buscando` (esperando a tu agente); `conectado`; `bloqueado` (el navegador
    negó el permiso); `reemplazado` (otra pestaña tomó la conexión).
  - Con «Conectar» encendido, reintenta cada 3 s.
  - Cada llamada va a `ejecutarVerbo(SUPERFICIE, verbo, args, { getState, dispatch, origen: 'mcp' })`.
  - El puerto sale de una anulación de pruebas: `localStorage['vina-puente-puerto']`, que solo
    escribe el e2e. Si no existe, el 8462.
- **`src/store/puenteSlice.ts`:** `{ estado, agente }`, lo que lee la puerta.
- **`src/components/shell/PuertaDelAgente.tsx`:** el enchufe y la hoja «Tu agente». Copian el menú
  «Mostrar» de `FilaDeCapas`: un portal a `<body>` con `data-material="papel"` y
  `data-superficie="menu"`, Esc por la escalera de lo llamado, cierre al clicar fuera y el foco
  adentro al abrir.
- **La paleta** gana «Conectar tu agente» y «Desconectar tu agente».
- **La caja negra** gana el tipo `puente`: una entrada por cambio de estado. Las llamadas ya las
  registra `ejecutarVerbo` (`agente`, origen `mcp`).

### 4.3 La hoja «Tu agente»

Los textos finales salen de solace-wren, en el plan.

| Estado | Lo que enseña |
|---|---|
| `apagado` | Qué hace, «Conectar» y la nota del permiso del navegador (solo si el permiso está en `prompt`). Debajo, la configuración para copiar: Claude Code (`claude mcp add vina -- npx -y vina-mcp`) y Claude Desktop o Cursor (el bloque JSON). |
| `buscando` | «Esperando a tu agente», qué hacer y «Desconectar». La configuración sigue debajo. |
| `conectado` | «Conectado a <agente>», qué puede hacer y «Desconectar». |
| `bloqueado` | El navegador negó el permiso, y cómo volver a darlo: el icono a la izquierda de la dirección. |
| `reemplazado` | Otra pestaña de Vina tomó la conexión, y «Conectar aquí». |

## 5. Seguridad

**Protege:**
- El puente escucha solo en `127.0.0.1`.
- Solo acepta como pestaña a Vina en producción, por su origen (P6). Una Vina local entra solo si
  se pide.
- La pestaña solo corre verbos de la superficie, validados con zod: ningún archivo, ninguna red,
  ningún código del agente.
- Cada llamada queda en la caja negra, y cada cambio se deshace con Ctrl+Z.
- Hacen falta dos consentimientos: el permiso del navegador y el clic en «Conectar».

**No protege:** un programa malicioso que ya corre en la misma computadora. Puede ocupar el puerto
y mandarle órdenes a la pestaña, o hacerse pasar por ella ante el agente. Quien ya corre código en
la máquina queda fuera de este alcance.

## 6. Pruebas

- **Unitarias del protocolo y del puente** (Node): la versión que se negocia, `tools/list` horneado y
  después el de la pestaña con su aviso, `tools/call` sin pestaña, el error del origen, gana la
  última pestaña, el tiempo máximo y la pestaña que se va a mitad de una llamada.
- **De integración:** el puente como proceso hijo, hablando por stdio, con una pestaña falsa por
  WebSocket. Una llamada de ida y vuelta, y el segundo puente con el puerto ocupado.
- **La pestaña:** el cliente con un WebSocket falso y la tienda real (`tienda()`). El saludo, una
  llamada que cambia el patrón y deja su paso de deshacer, los reintentos y el reemplazo.
- **Lo horneado igual a la superficie,** con `MCP_SUPERFICIE_UPDATE=1` para regenerarlo, como las
  líneas base del repo.
- **E2E** (`tests/e2e/puente-mcp.spec.ts`, en el gate del deploy): arranca el puente en otro puerto
  y conecta la app por la puerta. El test hace de agente: `create_piece` hace aparecer la pieza en
  el lienzo, y `undo` la quita.
- **Al final, Claude Code de verdad:** `claude -p` con `--mcp-config` contra la app local.

## 7. Lo que queda fuera

- Publicar en npm (P12).
- Firefox y Safari.
- Recordar «Conectar» entre recargas (P10).
- Un concentrador para que varias sesiones del agente compartan una pestaña (P5).
- MCP por HTTP: Claude Desktop y Cursor lanzan servidores locales por stdio.
- El agente de Vina sobre la superficie (subproyectos 3 y 4) y la 1c.
- **La CSP de producción:** cuando pase de `Report-Only` a activa, se añade `ws://127.0.0.1:8462` a
  `connect-src`, en el nginx del servidor (`2026-09-29-homepage-nginx.md`).

## 8. Lo que cambia en otros documentos

| Documento | Cambio |
|---|---|
| Spec madre § 4, punto 2, y la tabla de efectos («El botón «IA» gana el estado de la conexión MCP») | La puerta es el enchufe al lado de «IA», con su punto (P1). |
| Spec madre, D7 | El subproyecto 2 va antes de terminar el 1. |
