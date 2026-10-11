# Home de Vina — el taller abierto

> **Estado:** diseño aprobado por Samuel el 2026-10-10 (partes 1 a 7, en conversación); pendiente de spec-review y plan.
> **Sucede a** `docs/superpowers/specs/2026-09-28-homepage-design.md` (la home publicada el 2026-09-29, PR #1218). Donde los dos choquen, manda este. Lo que este documento no toca (la piel, la composición del hero, la tipografía, el layout, el movimiento) sigue rigiéndose por aquel, y se cita por sección.
> **Rama:** `feat/home-taller-abierto`, worktree `.claude/worktrees/taller-abierto`, cortada de `origin/main` en `97e78e98`.

## 0. Las frases que ordenan el documento

> **Samuel, 2026-10-10:** *"queremos meterle marketing for real, primero, hacerla english centric y enfocarnos en obtener leads."*
>
> *"sin comparar, yo no quiero levantar el peo entre nosotros y clo3d, no quiero ser el que empiece. quiero simplemente ofrecerla con naturaleza zen: qué es lo que puede hacer y por qué es una buena herramienta aunque aún está en construcción. muestre con vulnerabilidad pero con mucho orgullo todo el proceso de fabricación de este software. creo que la historia en github se narra sola."*
>
> *"también es una excelente oportunidad para actualizar el readme."*

De ahí salen las cuatro decisiones de fondo: la página se lee primero en inglés; su trabajo es conseguir leads; no nombra a ningún competidor; y dice con la misma claridad lo que la herramienta hace hoy, lo que le falta y cómo se construye. El orgullo no va en adjetivos. Va en que todo el proceso es público y se puede leer.

Un hallazgo del 2026-10-10 fija el tono: la home publicada promete formatos que el taller no tiene (leer Gerber, SVG y ZPRJ; escribir PDF de corte y DXF por tallas). Para una patronista con criterio eso es lo primero que se descubre y lo último que se perdona. Este rediseño convierte la honestidad en estructura: cada afirmación pública apunta a la ruta del código que la prueba, y un test falla si esa ruta desaparece.

## 1. Objetivo y no objetivos

**Objetivo.** Una página pública en `vina.sdar.dev/` (inglés) y `vina.sdar.dev/es/` (español de Venezuela) que:

1. en el primer viewport de un portátil de 1366×768 enseñe el patrón y la tela cayendo, como hoy;
2. diga en el vocabulario del oficio lo que Vina hace hoy, lo que todavía no está y cómo se hace;
3. convierta a la lectora en un lead por un solo camino: mandar un patrón por correo a `contact@sdar.dev`;
4. tenga un README que cuente la misma historia con la misma honestidad;
5. conserve lo que la home de septiembre ya ganó: cero JavaScript en el navegador, cero terceros, ≤ 2 fuentes, trinquete de peso, axe limpio, regla del pliegue.

**No objetivos de esta ronda.** Alemán (`/de/`, previsto en el spec de i18n; queda para cuando exista demanda). Traducir el taller (`/app/`): sigue en español y la página lo declara. Formulario con backend. Analítica. Cita de María (D11 del spec anterior sigue en pie: solo con frase firmada en sesión). Comparativas con otros CAD. Tocar la piel (tokens, tipografía, radios, movimiento). Arreglar las 12 pruebas rojas que `main` trae en `97e78e98` (§ 12).

## 2. Decisiones tomadas (2026-10-10)

| # | Decisión | Quién | Resultado |
|---|---|---|---|
| E1 | Posición | Samuel | **Taller abierto.** Primera persona, sin superlativos, sin competidores, sin contadores. Lo que hace hoy y lo que falta, dicho igual de claro. |
| E2 | Idiomas | Samuel | **Inglés en `/`, español en `/es/`.** Es lo que el spec de i18n (D10) ya decidía: `/` inglés y `x-default`, `/es/`, sin redirección automática. En vez de la «suggestion strip» de aquel spec, un enlace de idioma en la cabecera y en el pie: menos ruido, mismo resultado. |
| E3 | Oferta | recomendación, sin objeción | **Mandar un patrón.** Quien escribe recibe su DXF cosido y caído en Vina, con su mapa de ajuste, y una respuesta honesta sobre dónde Vina se quedó corta. Unos pocos al mes. Cada patrón que entra es una prueba real del taller y, con permiso, material para la página. |
| E4 | Mecanismo | recomendación, sin objeción | **`mailto:`, sin formulario.** `sdar.dev` ya recibe correo en Zoho (MX `mx.zoho.eu`, comprobado el 2026-10-10); `contact@sdar.dev` es un alias que crea Samuel. Cero JS, cero terceros, nada que mantener en el servidor; el DXF viaja adjunto, que es como una patronista manda un patrón de todas formas. Los leads se cuentan con un filtro en la bandeja. |
| E5 | Honestidad | recomendación, sin objeción | **Archivos de datos con prueba.** Lo que hace hoy (`home/datos/hoy.json`) lleva la ruta del código que lo demuestra; lo que falta (`home/datos/en-construccion.json`) lleva su issue o su sección del `ROADMAP.md`; el diario (`home/datos/diario.json`) cita PRs que existen en el historial. Tests en § 10. |
| E6 | Diario | corrección propia | **Escrito a mano, no generado.** Generarlo del historial daría títulos de commit en jerga. Cinco entradas con fecha, una línea en cada idioma y el enlace al PR; un test comprueba que cada PR citado existe. |
| E7 | README | Samuel | **Misma historia, mismos datos.** Las secciones «What it does today» y «In the making» del README se generan de los mismos archivos que la página; un test falla si página y README dejan de decir lo mismo. |
| E8 | Prenda | Samuel | **Se lanza con lo que es real.** La camiseta de María, el único DXF ajeno que ha pasado por el taller, sin nombrarla a ella salvo permiso expreso. La página la llama «the first pattern Vina draped». |
| E9 | Copiloto | recomendación, sin objeción | **Una fila, no un bloque.** El copiloto existe y es distintivo, pero la página no tiene sección de IA (D3 del spec anterior sigue). Va como una fila de «lo que hace hoy», con su condición: tu propia llave. El puente MCP se nombra en el README, no en la página. |
| E10 | Plantilla | recomendación, sin objeción | **Una plantilla, un archivo de textos por idioma, dos HTML generados y commiteados.** `scripts/home/paginas.mjs` escribe `index.html` y `es/index.html`; un test falla si están desactualizados. Vite los construye como hoy (dos entradas). |
| E11 | Anclas | recomendación, sin objeción | Los `id` de bloque son los mismos en los dos idiomas (`today`, `making`, `how`, `send`): las anclas no son copy. |
| E12 | Póster del hero | Samuel | **Se vuelve a grabar con WebGPU** en la máquina de Samuel (Chrome visible con `--enable-unsafe-webgpu`, como `playwright.webgpu.config.ts`). Si la franja negra del issue #1219 sale también ahí, el bug se arregla antes de publicar. Un fallo de render en el hero no es vulnerabilidad, es descuido. |
| E13 | Documentos viejos | recomendación, sin objeción | Se borran `docs/specs/LANDING-PAGE-SPEC.md`, `docs/specs/LANDING-PAGE-STRUCTURE.md` y `docs/specs/ROADMAP.md` (promesas falsas; el historial los guarda). El spec del 2026-09-28 recibe un aviso de «sucedido por» en su cabecera y se queda. |

## 3. La página, bloque a bloque

El copy es el aprobado; cambiarlo es cambiar el spec. Inglés en caja de oración, sin exclamaciones, sin «AI-powered», sin superlativos. Español de Venezuela con el glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md`: pieza, pinza, piquete, hilo, margen de costura, caída, ajuste, marcada, escalado, costura, tela. Los términos de motor (WebGPU, DXF-AAMA, glTF) no se traducen. Techo: **520 palabras visibles por página** (hoy 337 con seis bloques; entran tres más).

Lo que no cambia respecto al spec anterior: la composición del hero (D2, «el patrón sobre la página»), la cabecera de 56 px, el eyebrow en mono, las columnas separadas por línea de pelo, la sección oscura de cierre, el pie. Lo que cambia: el idioma, dos botones, tres bloques nuevos (§ 3.4, § 3.5, § 3.6), el bloque de formatos se funde en § 3.3, y el bloque del copiloto desaparece como sección.

### 3.1 Cabecera

Piquete a 28 px. A la derecha, cuatro enlaces a 14 px en `--tinta-70` y la píldora de tinta **Open Vina** (→ `/app/`). Entre los enlaces y la píldora, el enlace de idioma. En móvil quedan el piquete, el enlace de idioma y la píldora.

| | EN (`/`) | ES (`/es/`) |
|---|---|---|
| Enlaces | Today · In the making · How it's made · Send a pattern | Hoy · En construcción · Cómo se hace · Envía un patrón |
| Anclas | `#today` · `#making` · `#how` · `#send` | iguales |
| Idioma | **Español** → `/es/` | **English** → `/` |
| Píldora | Open Vina | Abrir Vina |
| Saltar | Skip to content | Saltar al contenido |

### 3.2 Hero

| | EN | ES |
|---|---|---|
| H1 | **Draft the pattern, watch it drape.** (35 car.) | **Traza el patrón, mira la caída.** |
| Entradilla | Vina is a pattern-making CAD that opens in the browser: an editable 2D pattern, fabric simulated in real time on an avatar, and a copilot that knows a dart from a notch. | Vina es un CAD de patronaje que se abre en el navegador: patrón 2D editable, tela simulada en tiempo real sobre un avatar y un copiloto que distingue una pinza de un piquete. |
| Botón 1 (tinta) | Open Vina → `/app/` | Abrir Vina → `/app/` |
| Botón 2 (contorno) | Send a pattern → `mailto:` (§ 3.6) | Enviar un patrón → `mailto:` |
| Línea mono | `Free · Open source · No account · In the making` | `Gratis · Código abierto · Sin cuenta · En construcción` |
| Rótulos del patrón | `FRONT · ×1` · `SLEEVE · ×2` · `PATRONES PARA SAMUEL · AAMA · mm` · cota `520 mm · hem` | `DELANTERO · ×1` · `MANGA · ×2` · `PATRONES PARA SAMUEL · AAMA · mm` · cota `520 mm · dobladillo` |
| Visor | `● Simulating · WebGPU` | `● Simulando · WebGPU` |

El nombre del bloque del DXF (`PATRONES PARA SAMUEL`) sale del archivo y no se traduce. El SVG del patrón se genera por idioma (§ 5.1). El visor lleva el póster regrabado (§ 5.2); sin vídeo en esta ronda, como hoy.

### 3.3 Today · lo que hace hoy (`#today`)

Eyebrow `Fig 0.1 · The workshop` / `Fig 0.1 · El taller`.

| | EN | ES |
|---|---|---|
| H2 | **What it does today** | **Lo que hace hoy** |
| Entradilla | A paper canvas with your pattern, a 3D viewer with the avatar, and the usual tools in the usual order. The interface speaks Spanish for now. | Un lienzo de papel con tu patrón, un visor 3D con el avatar y las herramientas de siempre en el orden de siempre. |

Figura: la captura real del 2D con el patrón de María y la pieza seleccionada con su cota (`fig-01`, como hoy). Pie: `A real pattern imported from a DXF · the selected piece with its dimension` · `Chromium · 1600 × 1000` (ES: `Patrón real importado de un DXF · pieza seleccionada con su cota`).

Tres columnas separadas por línea de pelo, sin tarjeta ni icono. Cada frase sale de `home/datos/hoy.json` con su prueba (§ 7):

| | EN | ES | Prueba |
|---|---|---|---|
| **Drafting** / **Trazado** | Pen, rectangle, notches and seam allowances, with the grainline drawn and the dimensions written where they measure. Darts come in with your DXF. | Pluma, rectángulo, piquetes y márgenes de costura, con el hilo dibujado y las cotas escritas donde miden. Las pinzas entran con tu DXF. | `src/components/shell/dock2dTools.ts`, `src/utils/seam/tiposDeEsquina.ts`, `src/utils/notchAnchor.ts`, `src/utils/grainLine.ts`, `src/utils/dartEntity.ts` |
| **Sewing** / **Costura** | Sew pieces automatically or edge to edge, and watch the seams close in 3D. | Cose las piezas automáticamente o borde a borde, y mira las costuras cerrarse en el 3D. | `src/utils/seam/caminarCostura.ts`, `src/utils/cloth/` |
| **Drape** / **Caída** | Fabric simulated in real time on the avatar, with WebGPU inside the browser. A fit map from the first frame. | Tela simulada en tiempo real sobre el avatar, con WebGPU dentro del navegador. Mapa de ajuste desde el primer fotograma. | `src/utils/cloth/gpu/`, `public/wasm/xpbd_wasm_bg.wasm`, `public/avatares/` |

Debajo, tres filas con línea de pelo, rótulo en sans y contenido en mono (formatos) o en sans (copiloto):

| | EN | ES | Prueba |
|---|---|---|---|
| **Reads** / **Lee** | `DXF-AAMA · DXF-ASTM · Gerber and Lectra dialects` | `DXF-AAMA · DXF-ASTM · dialectos Gerber y Lectra` | `src/utils/dxf/formatProfiles.ts` (perfiles `aama`, `astm`, `gerber`, `lectra`), `src/components/AppShell.tsx` (`accept=".dxf"`) |
| **Writes** / **Escribe** | `DXF-AAMA · PDF at 1:1 · BOM (CSV) · glTF · USDZ · 360° turn` | `DXF-AAMA · PDF a escala 1:1 · BOM (CSV) · glTF · USDZ · vuelta 360°` | `src/utils/export/uiExport.ts`, `src/components/Viewport3D/renderSections/ExportSection.tsx`, `src/components/shell/LogoMenu.tsx` |
| **Copilot** / **Copiloto** | Ask it to add a dart or to audit the seam allowances. It uses the same tools you do, and every change can be undone. With your own key: Anthropic, OpenAI, DeepSeek or Ollama. | Pídele que añada una pinza o que audite los márgenes. Usa las mismas herramientas que tú y cada cambio se puede deshacer. Con tu propia llave: Anthropic, OpenAI, DeepSeek u Ollama. | `src/copilot/connections/registry.ts`, `src/copilot/tools/` |

Fuera, a propósito, porque no se alcanzan desde la interfaz (comprobado el 2026-10-10): Gerber-ZIP, SVG y ZPRJ como lectura; PDF de corte, DXF por tallas, OBJ, FBX y tech pack como escritura. Si alguno entra a la interfaz, entra a `hoy.json` con su prueba y aparece en la fila.

### 3.4 In the making · lo que todavía no está (`#making`)

Eyebrow `In the making` / `En construcción`.

| | EN | ES |
|---|---|---|
| H2 | **What isn't there yet** | **Lo que todavía no está** |
| Entradilla | You'd find it in the workshop anyway. Better to read it here first. | Lo encontrarías en el taller de todas formas. Mejor leerlo aquí primero. |

Lista sin viñetas gráficas: cada punto es una frase en tinta y un enlace mono al lado (`#915`, `ROADMAP`), separados por línea de pelo. Sale de `home/datos/en-construccion.json`:

| EN | ES | Enlace |
|---|---|---|
| Real grading. Sizes scale in proportion today; rules per point come next. | Escalado de verdad. Hoy las tallas escalan en proporción; las reglas por punto vienen después. | issue #915 |
| A marker you can export. The nesting panel estimates fabric use and stops there. | Una marcada que se pueda exportar. El panel de marcada estima el consumo de tela y ahí se queda. | `ROADMAP.md` § Next |
| A dart tool. Darts arrive with your DXF or through the copilot, not from the pen yet. | Una herramienta de pinza. Las pinzas llegan con tu DXF o por el copiloto, todavía no con la pluma. | `ROADMAP.md` § Next |
| Project files. Your work lives in this browser until `.vina` files can be saved and opened. | Archivos de proyecto. Tu trabajo vive en este navegador hasta que los `.vina` se puedan guardar y abrir. | issue #15 |
| The interface in English. The workshop speaks Spanish. | La interfaz en inglés. El taller habla español. | issue #964 |
| Fabrics measured from cloth. Thirty-two presets today. | Telas medidas sobre el tejido. Hoy hay treinta y dos preajustes. | issue #1005 |

Los enlaces a issues van a `https://github.com/sssamuelll/vina/issues/<n>`; los de roadmap, a `https://github.com/sssamuelll/vina/blob/main/ROADMAP.md#next`. Si un punto se cumple, sale de la lista y entra a `hoy.json` con su prueba. Que `ROADMAP.md` § Next nombre la marcada exportable y la herramienta de pinza es parte de este trabajo (§ 8.4).

### 3.5 How it's made · cómo se hace (`#how`)

Eyebrow `How it's made` / `Cómo se hace`.

| | EN | ES |
|---|---|---|
| H2 | **In the open, one decision at a time** | **En abierto, una decisión a la vez** |
| Entradilla | Each change starts as a written design, gets a review, and lands with its tests. The specs, the research and the mistakes are in the repository, so the history tells itself. | Cada cambio empieza como un diseño escrito, pasa por revisión y entra con sus pruebas. Los specs, la investigación y los errores están en el repositorio, así que la historia se cuenta sola. |

Rótulo mono `From the workshop diary` / `Del diario del taller`, y cinco filas con línea de pelo: fecha en mono, una frase, y el número de PR como enlace mono. De `home/datos/diario.json`:

| Fecha | EN | ES | PR |
|---|---|---|---|
| 2026-10-09 | Your own agent can work on the pattern open in Vina. | Tu propio agente puede trabajar en el patrón abierto en Vina. | #1238 |
| 2026-10-09 | The panels moved onto paper: one slot on the right, properties in two levels, the avatar in seven fields. | Los paneles pasaron al papel: una ranura a la derecha, propiedades en dos niveles, el avatar en siete campos. | #1239 |
| 2026-10-06 | A seam fix: the sleeve cap splits where each half measures its armhole. | Un arreglo de costura: la copa se parte donde cada mitad mide lo que su sisa. | #1235 |
| 2026-10-05 | The piece's cabin: a strip of four tools and one dimension at a time. | La cabina de la pieza: una barrita de cuatro herramientas y una cota a la vez. | #1233 |
| 2026-07-10 | Real sewing on the avatar: a shirt forms and drapes for the first time. | Costura real sobre el avatar: una camisa se forma y cae por primera vez. | #934 |

Debajo, la sección oscura de cierre tal como existe (fondo `--tinta`, texto `--papel`), sin eyebrow propio: línea mono `MIT · github.com/sssamuelll/vina · v0.11` (la versión la escribe Vite, `%VITE_VINA_VERSION%`) y dos botones: **See the code** (→ `https://github.com/sssamuelll/vina`) y **Read the design notes** (→ `https://github.com/sssamuelll/vina/tree/main/docs/superpowers/specs`). ES: **Ver el código** · **Leer las notas de diseño**.

### 3.6 Send a pattern · la oferta (`#send`)

Eyebrow `Send a pattern` / `Envía un patrón`. Sobre `--papel-hundido`, como la banda de formatos de hoy.

| | EN | ES |
|---|---|---|
| H2 | **Bring your pattern, I'll drape it** | **Trae tu patrón, yo lo visto** |
| Entradilla | Email me a DXF. I'll return it sewn and draped in Vina, with its fit map, and I'll tell you where Vina fell short. Every pattern that comes in is a test the workshop hasn't passed yet. A few each month, in the order they arrive. | Mándame un DXF por correo. Te lo devuelvo cosido y caído en Vina, con su mapa de ajuste, y te digo dónde Vina se quedó corta. Cada patrón que llega es una prueba que el taller todavía no ha pasado. Unos pocos al mes, en el orden en que llegan. |
| Botón (tinta) | **Send a pattern** | **Enviar un patrón** |
| Línea mono | `contact@sdar.dev · DXF-AAMA or DXF-ASTM · I read and reply myself` | `contact@sdar.dev · DXF-AAMA o DXF-ASTM · leo y respondo yo mismo` |

Los dos botones de oferta de la página (hero y este) llevan el mismo `href`:
`mailto:contact@sdar.dev?subject=A%20pattern%20for%20Vina` (ES: `?subject=Un%20patr%C3%B3n%20para%20Vina`). Sin cuerpo prellenado: un formulario disfrazado no es zen.

### 3.7 Pie

Banda con línea de pelo: `© 2026 Vina · Pattern making and 3D simulation in the browser` (ES: `Patronaje y simulación 3D en el navegador`) a la izquierda; a la derecha los cuatro enlaces y el enlace de idioma, a 13 px en `--tinta-70`.

## 4. La piel

Sin cambios de tokens, familias, radios, sombras ni movimiento: rige § 4 del spec del 2026-09-28 completo, con la enmienda § 12 (tokens `--ink`, `--ink-2`, `--blanco`, visor y rejilla). `home/tokens.css` no gana ni pierde un token. Lo nuevo se compone con lo que hay:

- **Lista de «In the making» y diario:** filas con `border-top: var(--hairline)`; frase en `--tinta` a 16 px; enlace a la derecha en mono a 13 px, color `--senal-texto`, `min-height: 24px`. En móvil la frase y el enlace se apilan.
- **Enlace de idioma:** mismo estilo que los enlaces de cabecera; en móvil se queda (a diferencia de los otros cuatro).
- **Fila «Copilot»:** rótulo en sans como las de formatos, contenido en sans a 16 px (no es un dato alineado carácter a carácter, § 5 de la ley de idioma del contrato).
- **Sección oscura:** se queda como está; pierde el eyebrow `Código` y el H2 `Abierto, y se queda abierto` porque el bloque de cómo se hace los absorbe.

`tests/repo/home-tokens.test.ts` sigue vigilando: sin `var(--x, fallback)`, sin literales, solo Inter y JetBrains Mono.

## 5. Activos reales

### 5.1 El patrón del hero, por idioma

`scripts/home/dxf-a-svg.mjs` gana `--idioma=en|es` y escribe `home/img/patron.en.svg` y `home/img/patron.es.svg` (rótulos de § 3.2; el nombre del bloque del DXF sale tal cual). Cada HTML incluye el suyo con el comentario `<!-- incluir: home/img/patron.en.svg -->` que el plugin `incluirEnHome` ya resuelve. `tests/repo/home-patron.test.ts` compara los dos byte a byte contra la salida del script. `home/img/patron.svg` desaparece.

### 5.2 El póster de la caída

`scripts/home/activos.mjs` gana `--gpu`: lanza Chrome visible con `--enable-unsafe-webgpu`, `--disable-backgrounding-occluded-windows` y `--disable-renderer-backgrounding` (los mismos flags de `playwright.webgpu.config.ts`), viste el avatar con el DXF de María, deja correr la simulación hasta reposo y captura el póster a 1040×600 (`home/img/caida-poster.webp`, ≤ 60 KB). Solo corre en la máquina de Samuel. Antes de commitear el póster se mira la costura lateral derecha: si la franja de #1219 sigue ahí, el issue se arregla primero (E12).

### 5.3 Figuras

- `fig-01@{1x,2x}.webp` y `fig-01-movil.webp`: como hoy (el 2D con la pieza seleccionada y su cota).
- `fig-02@{1x,2x}.webp`: **cambia**. Deja de ser la paleta de comandos y pasa a ser el visor 3D con el avatar vestido y el mapa de ajuste activo, a 1600×1000 con `deviceScaleFactor: 2`, recorte de 560 px de alto anclado al avatar. Se captura con el mismo `--gpu` de § 5.2 para que el render sea el real. Pie: `The fit map on the avatar · tighter in red, looser in blue` (ES: `El mapa de ajuste sobre el avatar · más tenso en rojo, más suelto en azul`; los colores reales los dicta `FitMapToggle` y se confirman al capturar). Esta figura va en el bloque de hoy, bajo las tres columnas y antes de las filas, como segunda imagen. En móvil se sirve `fig-02-movil.webp`, un recorte de 360 px de alto anclado al avatar, como ya se hace con `fig-01-movil.webp`.

### 5.4 OG por idioma

`home/og.html` recibe el H1 por parámetro; `activos.mjs` renderiza `public/og.png` (inglés) y `public/og-es.png` (español), 1200×630, papel, piquete, H1. Cada página declara el suyo en `og:image`.

### 5.5 Marca y fuentes

Sin cambios: `home/img/logo.svg`, favicons, manifest y las dos fuentes variables autoalojadas (§ 5.4 y § 5.5 del spec anterior).

## 6. Arquitectura

### 6.1 Ficheros

```
index.html                       ← generado (EN), commiteado
es/index.html                    ← generado (ES), commiteado
home/plantilla.html              ← la única fuente de estructura
home/copy/en.json  home/copy/es.json
home/datos/hoy.json  home/datos/en-construccion.json  home/datos/diario.json
home/img/patron.en.svg  home/img/patron.es.svg  (patron.svg desaparece)
home/img/caida-poster.webp  fig-01@{1x,2x}.webp  fig-01-movil.webp  fig-02@{1x,2x}.webp  fig-02-movil.webp
public/og.png  public/og-es.png  public/sitemap.xml
scripts/home/paginas.mjs         ← plantilla + copy + datos → los dos HTML (`--check` falla si hay deriva)
scripts/home/readme.mjs          ← datos → secciones marcadas del README (`--check`)
scripts/home/enlaces.mjs         ← HEAD a cada enlace externo de los datos (lo corre el deploy)
scripts/home/dxf-a-svg.mjs       ← gana --idioma
scripts/home/activos.mjs         ← gana --gpu y el OG por idioma
server/rutas.ts                  ← reglas /es y /es/
tests/e2e/home.spec.ts           ← parametrizado por idioma
tests/e2e/home-peso-baseline.json
tests/repo/home-tokens.test.ts   ← sin cambios
tests/repo/home-patron.test.ts   ← dos SVG
tests/repo/home-paginas.test.ts  ← nuevo
tests/repo/home-honestidad.test.ts ← nuevo
server/__tests__/rutas.test.ts   ← casos /es
```

### 6.2 Plantilla y generación

`home/plantilla.html` es el `index.html` de hoy con los textos sustituidos por marcas `{{clave}}` (sin lógica; para las listas, un bloque `{{#hoy}}…{{/hoy}}` que el script repite por entrada). `paginas.mjs` lee la plantilla, el copy del idioma y los tres archivos de datos, y escribe el HTML con `lang`, `title`, `description`, `canonical`, `hreflang`, `og:*`, JSON-LD (`inLanguage` por idioma) y el comentario de inclusión del SVG correcto. Sin dependencias nuevas: es un reemplazo de cadenas de unas cien líneas.

Los dos archivos de copy tienen exactamente el mismo conjunto de claves; `home-paginas.test.ts` lo comprueba y corre `paginas.mjs --check`.

### 6.3 Vite

`build.rollupOptions.input` gana `es: resolve(__dirname, 'es/index.html')`. El plugin `incluirEnHome` ya actúa sobre todo `index.html` salvo el del taller, así que `es/index.html` hereda la inclusión. `%VITE_VINA_VERSION%` se sustituye en los dos.

### 6.4 Servidores

- **`server/rutas.ts`:** `es` → 301 a `/es/`; `es/` → `es/index.html`. Tests en `server/__tests__/rutas.test.ts`. Hoy `existe` exige fichero y `/es/` daría 404 aunque el HTML exista.
- **nginx (fuera del repo):** sin cambios necesarios. En producción toda ruta devuelve 200 con la home (los `=404` del spec de nginx del 2026-09-29 nunca se aplicaron); `/es/` resuelve a `/es/index.html` por `$uri/` con el `index` por defecto. Comprobarlo desde local tras el primer deploy: `curl -sI https://vina.sdar.dev/es/`.
- **`scripts/deploy-prod.sh`:** la comprobación de `/` pasa a buscar `Draft the pattern`; se añade `/es/` con `Traza el patrón`. Antes de enviar, `node scripts/home/enlaces.mjs` (HEAD a cada enlace de `en-construccion.json` y `diario.json`; cualquier 404 para el deploy).

### 6.5 Acoples pequeños

- `.gitattributes`: líneas LF para `es/index.html`, `home/plantilla.html`, `home/copy/*.json`, `home/datos/*.json` (el trinquete de peso mide bytes).
- `public/sitemap.xml`: dos URL, cada una con sus `xhtml:link` alternos.
- `public/manifest.webmanifest` (`lang: es`) es del taller: no se toca.
- `CONTRIBUTING.md` § Setup: «Open `http://localhost:5173`» pasa a `/app/` (hoy cae en la home).

## 7. Los datos de la honestidad

Tres archivos JSON en `home/datos/`, la única fuente de la página y del README para esas tres listas.

```json
// hoy.json — una entrada por frase de § 3.3
[{ "id": "trazado", "en": "Pen, rectangle, …", "es": "Pluma, rectángulo, …",
   "prueba": ["src/components/shell/dock2dTools.ts", "src/utils/grainLine.ts"] }]

// en-construccion.json — una entrada por punto de § 3.4
[{ "id": "escalado", "en": "Real grading. …", "es": "Escalado de verdad. …",
   "enlace": "https://github.com/sssamuelll/vina/issues/915", "rotulo": "#915" }]

// diario.json — una entrada por fila de § 3.5
[{ "fecha": "2026-10-09", "pr": 1238, "en": "Your own agent …", "es": "Tu propio agente …" }]
```

Reglas: `prueba` son rutas relativas a la raíz del repo y tienen que existir; `enlace` es un issue del repo o un ancla de `ROADMAP.md`; `pr` tiene que aparecer en el historial de `main` como `Merge pull request #<n>` o en el asunto de un commit `(#<n>)`. Las tres se verifican en `tests/repo/home-honestidad.test.ts` (§ 10.2).

## 8. README y ficha del repo

### 8.1 Estructura del README (inglés)

Hoy: 100 líneas, seis insignias de shields.io, cero imágenes, un badge de «Build» que apunta a un workflow desactivado (señal falsa) y un «What it does today» que no se contrasta con nada. Queda así:

1. `# Vina` y una línea: *Pattern-making CAD in the browser: an editable 2D pattern, real-time cloth on an avatar, and a copilot that knows a dart from a notch. Free, MIT, in the making.*
2. **Una imagen real**: `home/img/fig-02@1x.webp` (el avatar vestido con el mapa de ajuste), con alt.
3. Dos enlaces en una línea: `vina.sdar.dev` · `vina.sdar.dev/es/`.
4. `## What it does today` ← generado entre `<!-- hoy -->` y `<!-- /hoy -->` desde `hoy.json` (las seis frases en inglés, cada una con su ruta de prueba como enlace relativo al repo).
5. `## In the making` ← generado entre `<!-- en-construccion -->` y `<!-- /en-construccion -->` (las seis frases con su enlace).
6. `## Send a pattern` (la oferta de § 3.6, en tres líneas, con `contact@sdar.dev`).
7. `## Quick start` (los comandos de hoy; `npm run dev` abre `/app/`).
8. `## How it's made` (los specs en `docs/superpowers/specs/`, la investigación en `docs/reports/`, el gate de `CONTRIBUTING.md`, el puente MCP y `vina-studio` en npm: aquí sí, para quien programa).
9. `## Tech stack`, `## Architecture at a glance`, `## Contributing`, `## Language` (se conservan, revisados contra lo que existe).
10. Insignias: se quedan licencia y versión; se va la de Build.

`scripts/home/readme.mjs` reescribe solo las dos secciones marcadas; `--check` falla si difieren. El resto del README se edita a mano.

### 8.2 CONTRIBUTING y ROADMAP

- `CONTRIBUTING.md`: la corrección de § 6.5.
- `ROADMAP.md` § «Where we are»: las cuatro viñetas de «today that path works» incluyen escalado por tallas, marcada y tech pack, que no son ciertas. Se sustituyen por una línea: *What works today is the list in the README, generated from `home/datos/hoy.json`.* § Next gana dos viñetas, «A marker you can export» y «A dart tool», para que los enlaces de § 3.4 apunten a algo.

### 8.3 Ficha del repo (la corre Samuel con `!`)

```
gh repo edit sssamuelll/vina \
  --homepage https://vina.sdar.dev \
  --description "Pattern-making CAD in the browser: editable 2D pattern, real-time cloth on an avatar, and a copilot that knows a dart from a notch. Free, MIT, in the making." \
  --add-topic pattern-making,patternmaking,garment-cad,cloth-simulation,webgpu,dxf,fashion-tech,open-source
```

Hoy el sitio web del repo apunta a `openclo.sdar.dev`.

### 8.4 Lo que se borra

`docs/specs/LANDING-PAGE-SPEC.md`, `docs/specs/LANDING-PAGE-STRUCTURE.md`, `docs/specs/ROADMAP.md`. El spec del 2026-09-28 recibe en su primera línea: *Sucedido el 2026-10-10 por `2026-10-10-home-taller-abierto-design.md`; sigue rigiendo la piel (§ 4) y los activos de marca (§ 5.4, § 5.5).*

## 9. Accesibilidad, idioma y buscadores

- `<html lang="en">` en `/`, `lang="es"` en `/es/`; `<span lang="en">` para «WebGPU» en la página española, como hoy.
- Cada página: `<link rel="alternate" hreflang="en" href="https://vina.sdar.dev/">`, `hreflang="es" href="https://vina.sdar.dev/es/"`, `hreflang="x-default" href="https://vina.sdar.dev/"`; `canonical` a sí misma; `og:locale` (`en_US` / `es_VE`) y `og:locale:alternate`; `og:image` por idioma; JSON-LD `WebApplication` con `inLanguage` por idioma, `offers.price: 0`, `isAccessibleForFree`, `license` y `sameAs`, sin valoraciones.
- `<title>`: `Vina — Pattern making and 3D simulation in the browser` / `Vina — Patronaje y simulación 3D en el navegador`. `meta description` de 120 a 150 caracteres: EN *A pattern-making CAD that opens in the browser: editable 2D pattern, real-time cloth on an avatar, and a copilot. Free, open source, in the making.*; ES la actual (150).
- Un solo `h1`; landmarks; «Skip to content» primer foco; objetivos ≥ 24×24; `:focus-visible` en todo; sin modales; sin nada que tape el primer viewport. Contrastes de § 4.1 del spec anterior.
- El enlace de idioma lleva `hreflang` y `lang` en el propio `<a>`.

## 10. Verificación

### 10.1 `tests/e2e/home.spec.ts`, parametrizado

Una tabla con dos entradas y los mismos tests para cada una:

| | `/` | `/es/` |
|---|---|---|
| `lang` | `en` | `es` |
| H1 exacto | Draft the pattern, watch it drape. | Traza el patrón, mira la caída. |
| Píldora | Open Vina | Abrir Vina |
| Saltar | Skip to content | Saltar al contenido |
| Código | See the code | Ver el código |
| Oferta | Send a pattern | Enviar un patrón |
| Idioma | Español → `/es/` | English → `/` |

Los dieciocho tests de hoy se mantienen con esos valores (título, `lang`, un solo h1, sin errores ni terceros; los «Open Vina» llevan al taller y los «See the code» al repo; regla del pliegue a 1366×768; CLS ≈ 0; axe WCAG 2.2 AA; primer foco; ningún bloque invisible por ancla; descripción de 120 a 150; objetivos ≥ 24×24; toda imagen carga y tiene alt; sin scroll horizontal a 390, 768 y 320; orden texto → patrón → visor en móvil). Cambian o entran:

- **≤ 520 palabras visibles** (era 400).
- **Los dos botones de oferta** llevan exactamente el `mailto:` de § 3.6 (`href` completo, con el asunto).
- **`hreflang`**: las tres alternativas presentes y correctas en las dos páginas; el enlace de idioma lleva a la otra página y esa responde con su H1.
- **Las listas de datos están completas**: tantas filas de «In the making» y del diario como entradas en los JSON.
- **Trinquete de peso por página**: `home-peso-baseline.json` pasa a tener una entrada por URL (`/` y `/es/`). Techos nuevos: documento ≤ 25 KB, CSS ≤ 20 KB, JS 0, fuentes ≤ 100 KB y ≤ 2 ficheros, imágenes ≤ 200 KB, vídeo 0, total ≤ 420 KB. La línea base se fija una vez con `HOME_PESO_UPDATE=1 … --retries=0 --workers=1` y se commitea; después solo baja.

### 10.2 Tests de repo

- `tests/repo/home-paginas.test.ts`: `en.json` y `es.json` tienen el mismo conjunto de claves; `paginas.mjs --check` pasa (los HTML commiteados son los generados); ningún texto de `copy/` contiene `!`, `¡` ni «AI-powered».
- `tests/repo/home-honestidad.test.ts`: toda ruta de `prueba` existe; todo `enlace` es `https://github.com/sssamuelll/vina/issues/<n>` o `…/blob/main/ROADMAP.md#<ancla>` y, si es ancla, existe en `ROADMAP.md`; todo `pr` del diario aparece en `git log --oneline main` (merge o asunto); `readme.mjs --check` pasa; ninguna frase de `en-construccion.json` nombra un formato que `hoy.json` ya promete.
- `tests/repo/home-patron.test.ts`: los dos SVG coinciden byte a byte con el script.
- `tests/repo/home-tokens.test.ts`: sin cambios.
- `server/__tests__/rutas.test.ts`: `/es` → 301 `/es/`; `/es/` → `es/index.html`; `/es/x` → 404.

### 10.3 Puertas manuales

- `npm run build` y `npm run test:e2e:home` contra `vite preview` antes del PR.
- Gates de siempre: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Las 12 pruebas rojas de § 12 se comparan contra la línea base de `97e78e98`: ni una más.
- `scripts/deploy-prod.sh`: sus comprobaciones de § 6.4; Lighthouse a mano en la máquina de Samuel (≥ 0,95 escritorio, LCP ≤ 1.200 ms, CLS ≤ 0,01), como dice el spec anterior.
- Tras publicar: `curl -sI https://vina.sdar.dev/es/` da 200; las dos URL salen con 0 `<script>` salvo el JSON-LD.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| La franja negra (#1219) sale también con WebGPU | E12: se arregla el bug antes de publicar; la página no sale con el póster viejo. |
| 520 palabras no alcanzan con nueve bloques | La fila del copiloto es la primera en acortarse; el diario baja a cuatro entradas. El e2e mide. |
| El SVG en inglés rompe la caja de 720×540 (rótulos más largos) | `FRONT`/`SLEEVE` son más cortos que `DELANTERO`/`MANGA`; `hem` que `dobladillo`. Se mira la maqueta a 1366 antes de commitear. |
| Spam al `mailto:` | El alias filtra en Zoho; si molesta, pasa a formulario con backend (fuera de esta ronda). |
| María no autoriza su DXF en público | Se lanza con una captura del taller con otro DXF propio (uno de los fixtures de `tests/fixtures/garments/`), y la frase «the first pattern Vina draped» se va. Decisión de Samuel antes del deploy. |
| Los HTML generados se editan a mano y se pierde la fuente | `paginas.mjs --check` en el test de repo y en el gate; el PR lo deja escrito en la cabecera de los HTML (`<!-- generado por scripts/home/paginas.mjs; edita home/plantilla.html -->`). |
| `ROADMAP.md` cambia de anclas y los enlaces se rompen | `home-honestidad.test.ts` comprueba que cada ancla existe. |

## 12. Pendientes de Samuel y estado previo

- Crear el alias `contact@sdar.dev` en Zoho antes del deploy (enmendado el 2026-10-11: antes era `vina@sdar.dev`, § 15).
- Pedirle a María permiso para su DXF en las figuras y, si quiere, una frase firmada (D11).
- Correr `gh repo edit` de § 8.3 con `!`.
- Grabar el póster y la figura 2 con `--gpu` en su máquina (§ 5.2, § 5.3), o dejar que lo haga Claude con Chrome visible si él está delante.
- Línea base de `main` en `97e78e98` (medida el 2026-10-10 en este worktree, Windows): typecheck limpio; **12 pruebas rojas de 9.916** en `tests/repo/el-trinquete-de-medir-bordes-no-esta-ciego`, `tests/repo/lo-que-flota-es-papel`, `src/tools/__tests__/idiomaDeOpciones`, `src/components/shell/__tests__/herramienta-con-gesto-tiene-puerta`, `src/components/shell/__tests__/puerta-del-agente`, `src/components/PatternEditor/__tests__/{FilaDeCapas, PatternEditor.cotaDelPunto, PatternEditor.etiquetaDeLaCostura, PatternEditor.notchExactDistance, PatternEditor.seamAllowanceExactWidth}` y `src/copilot/actions/__tests__/importDxfExecutor` (dos). Ninguna toca la home. Este trabajo no las arregla; el gate exige que no haya ni una más.

## 13. Referencias

- `docs/superpowers/specs/2026-09-28-homepage-design.md` (la piel, el hero, la tipografía, el layout; sucedido en lo demás).
- `docs/superpowers/specs/2026-09-29-i18n-design.md` (rama `worktree-i18n`, D10 y § 6.5: URLs por idioma, `hreflang`, el check del deploy).
- `docs/reports/2026-09-27-homepage-competencia-y-referentes.md` y sus cinco notas (la gramática de lo caro; sigue vigente).
- `docs/specs/2026-07-16-ui-copy-es-glosario.md` (el vocabulario del oficio en español).
- `docs/superpowers/specs/2026-06-18-imported-dxf-parametric-editing-decision.md` (el alcance honesto del DXF importado: «Never promise Level 3»).
- `.agents/context/PRODUCT.md` (María como usuaria de referencia; tono sobrio).
- `.claude/skills/contrato-de-interfaz/SKILL.md` (leyes de tokens, idioma y puertas, aplicadas aquí a la home).
- Issues citados: #915, #15, #964, #1005, #1219.

## 14. Enmienda al implementar (2026-10-11)

Medido con la página construida, el techo de § 3 y § 10.1 no se sostenía: 583 palabras visibles en inglés y 604 en español con el copy aprobado, porque la lista de faltas y el diario que este spec exige pesan más de lo estimado. Decidido al ejecutar el plan (Task 5), con las podas que § 11 ya preveía y tres recortes mínimos:

- El diario baja a **cuatro entradas** (sale #1233, la cabina de la pieza, la menos significativa para una patronista).
- La fila del copiloto pierde la lista de proveedores: «Ask it to add a dart or to audit the seam allowances. Same tools as yours, and every change can be undone. With your own key.» (ES: «Pídele que añada una pinza o que audite los márgenes. Las mismas herramientas que tú, y cada cambio se puede deshacer. Con tu propia llave.»). Los proveedores siguen en el README.
- Pie de la figura 1: «A real DXF pattern · the selected piece with its dimension» (ES: «Patrón real de un DXF · pieza seleccionada con su cota»).
- «Project files. Your work lives in this browser until .vina files can be saved.» y «A dart tool. Darts arrive with your DXF or the copilot, not from the pen yet.» (ES: «…hasta que los .vina se puedan guardar.»).
- La oferta cierra en «A few each month.» / «Unos pocos al mes.»
- **El techo pasa a 580 palabras visibles por página** (medido tras las podas: ≈ 545 en inglés, ≈ 565 en español). Es un trinquete: solo baja.

Y un detalle de § 4: los enlaces de las listas llevan `min-width: 24px` (el rótulo `#15` medía 23 px de ancho, bajo el objetivo de puntero de § 9).

Y dos cosas de § 5 que salieron de capturar con WebGPU (Task 8):

- **La figura 2 enseña el mapa de estiramiento, no el de ajuste.** Con sus umbrales por defecto, el mapa de ajuste pinta la camiseta entera de rojo («no se puede poner»), un artefacto de calibración y no de la prenda. El de estiramiento (azul en reposo, rojo estirado, la convención de CLO) sí dice algo verdadero: hombros y pecho tensos, mangas y bajo en reposo. Pie: «The strain map on the avatar · stretched in red, at rest in blue» (ES: «El mapa de estiramiento sobre el avatar · estirado en rojo, en reposo en azul»). El mapa de ajuste sigue en «lo que hace hoy» porque existe.
- **El póster y la figura 2 salen del mismo contexto** (el del paso 7 de `activos.mjs`, a @2x con `--gpu`): la misma simulación en reposo, primero sin mapa y luego con él. Capturarla en el contexto del 2D daba la cámara de lado y las piezas sin coser. Con WebGPU el póster no trae la franja de #1219: era del tier WASM.

## 15. Enmienda del 2026-10-11 — el correo es contact@sdar.dev

Samuel pidió, al autorizar el merge y el deploy, que la oferta use `contact@sdar.dev` en vez de `vina@sdar.dev` (E4, § 3.6). Cambia el texto en los dos idiomas y los dos `mailto:` de la plantilla; no cambia nada de la mecánica (sigue siendo un alias de Zoho, sin formulario, sin backend).
