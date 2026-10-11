# Homepage de Vina — el patrón sobre la página

> **Sucedido el 2026-10-10 por `2026-10-10-home-taller-abierto-design.md`; sigue rigiendo la piel (§ 4) y los activos de marca (§ 5.4, § 5.5).**
> **Estado:** implementado el 2026-09-29 (PR #1218); publicado: pendiente de nginx y repo público. Plan: `docs/superpowers/plans/2026-09-29-homepage.md`; lo que falta para publicar: `docs/superpowers/specs/2026-09-29-homepage-nginx.md`. **Enmendado el 2026-09-29 (§ 12): manda sobre el cuerpo.**
> Sale de `docs/reports/2026-09-27-homepage-competencia-y-referentes.md` (investigación del
> 2026-09-27: 12 CAD de moda, 16 entrantes con IA, 24 homepages de software premium, 20 casas de
> lujo, técnica; sus cinco notas están en `docs/reports/2026-09-27-homepage-investigacion/`) y del
> paquete de marca de María del 2026-08-06 (Vina Studio: piquete, paleta
> Contraluz), que Samuel pidió usar **solo como referencia**. Este documento es la norma; aquellos
> son la evidencia. Las maquetas aprobadas están en `docs/superpowers/specs/assets/2026-09-28-homepage-*`
> (hero a 1366×768, página completa a 1366 y a 390, y el HTML de la maqueta).

## 0. La frase que ordena el documento

> **Samuel, 2026-09-27:** *"Quiero que hagas una investigación de las competencias y adaptes la idea
> para crear algo completamente elegante y que se sienta caro 2026."*

Lo que la investigación cambió es **dónde está la elegancia**. No está en el color ni en la fuente
—el papel cálido ya lo tienen Browzwear y Lectra, Inter la tienen todos y el oro no lo tiene nadie
porque en pantalla no funciona— sino en dos decisiones de producto: **abrir la herramienta desde la
portada** y **poner el patrón, no el avatar, en el primer viewport**. Entre 28 portadas del sector
ninguna abre el CAD en el navegador, ninguna enseña el patrón 2D en el primer viewport, ninguna
nombra a la patronista y solo tres hablan español. La gramática medida de lo caro es de resta: una
grotesca a 48–64 px en peso 400–510, neutro cálido con tinta cálida y un acento plano, mono para
rótulos, líneas de pelo en vez de sombras, 134–340 palabras por página, cero «!» y cero «✨».

## 1. Objetivo y no objetivos

**Objetivo.** Una página pública en `vina.sdar.dev/` que en el primer viewport de un portátil de
1366×768 enseñe el patrón y la tela cayendo, le hable a la patronista en español, y la lleve al
taller con un clic; que lea cara por resta (una familia, un acento, líneas de pelo, ≤ 400 palabras)
y que cargue con cero JavaScript antes del primer pintado y ≤ 500 KB.

**No objetivos de esta ronda.** Versión en inglés (`/en/`). Blog, docs o precios. Demo interactiva
con el solver en la portada. Tocar el `index.html` del taller más allá de moverlo (su `lang`, su
`viewport` y sus fuentes remotas son un seguimiento aparte, § 10). Rediseñar la marca: el piquete de
María se usa tal cual está en sus SVG.

## 2. Decisiones tomadas (2026-09-28)

| # | Decisión | Quién | Resultado |
|---|---|---|---|
| D1 | Dirección | Samuel, entre tres | **El patrón vivo**: papel cálido y tinta cálida, una sola señal roja, el oro solo como plano. Descartadas «pliego editorial» (foto sin interfaz es la plantilla del sector; sin fotografía propia) e «instrumento oscuro» (oscuro + acento es el defecto de Optitex, Style3D y Marvelous; «Linear clone» ya es nombre de plantilla). |
| D2 | Composición del hero | Samuel, entre tres maquetas | **C · El patrón sobre la página**: la página es el papel; el patrón se dibuja en tinta a gran escala a la derecha; el visor 3D es un recuadro bajo el texto. Descartadas A (marco recortado, asoman ~230 px del producto) y B (dos columnas, el layout más repetido del sector). |
| D3 | Estructura y copy | Samuel | Seis bloques, ~330 palabras, el copy de § 3 tal cual. Sin muro de logos, sin contadores, sin sección «IA», sin precios. |
| D4 | URL | Samuel | **Home en `/`, taller en `/app/`.** Segunda entrada HTML del mismo `vite build`. Mismo origen: IndexedDB y `localStorage` de las usuarias sobreviven. Descartada `/inicio` (quien escribe el dominio caería en el taller). |
| D5 | Tokens | recomendación, sin objeción | La home tiene **su propio** `home/tokens.css`. Es otra superficie con otra paleta (papel/tinta/señal frente a grafito/azul 248); se declara aquí para que no parezca un segundo registro por descuido (contrato § 1). El trinquete `ui-contract-lint.mjs` solo mira `src/`: no lo cuenta ni lo sube. |
| D6 | Tipografía | investigación | **Inter + JetBrains Mono, sin serif.** Dos ficheros variables autoalojados, subconjunto latino. Caveat (la mano del logotipo) solo dentro del SVG del logo, nunca como texto de la página: es la fuente del hero de Optitex. |
| D7 | Oro y gris | investigación | Oro `#F0D08A` **nunca texto ni fondo con texto claro** (1,30:1 sobre papel): solo plano bajo tinta (subrayado-marcador, muesca, la tela). Gris `#9C958A` **nunca texto sobre papel** (2,59:1): solo reglas y adornos. |
| D8 | Un acento | recomendación, sin objeción | La cota del patrón del hero va en señal `#C0472B`, no en el azul del taller: un solo acento en la página. Dentro de las capturas reales del producto el azul aparece tal cual, porque son capturas. |
| D9 | Terceros | recomendación, sin objeción | Cero terceros: sin analítica, sin fuentes remotas, sin cookies → sin aviso. |
| D10 | Nombre y marca | supuesto confirmado en maqueta | El producto se llama **Vina**; la cabecera lleva el piquete **sin «STUDIO»** (`vina-studio-logo-sin-studio.svg`) a 28 px de alto. La mano A (Caveat) es la de los SVG entregados. |
| D11 | Cita de María | pendiente | El bloque de cita solo entra con una frase que ella firme en sesión con fecha. Hasta entonces no existe. |

## 3. La página, bloque a bloque

El copy es el aprobado; cambiarlo es cambiar el spec. Español de Venezuela, caja de oración, sin
«¡», sin «por favor», sin «revolucionar», «potenciar» ni «transformar». Los términos de motor
(WebGPU, DXF-AAMA, glTF) no se traducen y llevan `lang="en"` cuando son palabras inglesas
(WebGPU); las siglas no lo necesitan. Total ≈ 330 palabras; techo 400.

### 3.1 Cabecera (56 px, ambiente)

Piquete a 28 px a la izquierda. A la derecha, cuatro enlaces en caja de oración a 14 px en
`--tinta-70` —**Producto · Formatos · Copiloto · Código**— y la píldora de tinta **Abrir Vina**
(36 px, enlace a `/app/`). Línea de pelo debajo. En móvil solo quedan el piquete y la píldora.

### 3.2 Hero (bloque 1)

- H1: **Traza el patrón, mira la caída.**
- Entradilla: *Vina es un CAD de patronaje que se abre en el navegador: patrón 2D editable, tela
  simulada en tiempo real y un copiloto que entiende de pinzas y costuras.*
- Botones: **Abrir Vina** (tinta, → `/app/`) · **Ver el código** (contorno, → `#codigo`).
- Línea mono a 12 px: `Gratis y de código abierto · Sin cuenta · Tus proyectos se guardan en tu navegador`.
- **El patrón**, a la derecha, en una caja de 720×540 que a 1366 px ocupa x 620–1340 e y 84–624
  (la cota del dobladillo va **dentro** de la caja): el delantero y la manga
  del DXF real de María dibujados en tinta de 1,25 px sobre el papel de la página (§ 5.1), con
  línea de costura discontinua, hilo con flechas, piquetes, una pinza, los rótulos en mono
  (`DELANTERO · ×1 · AL DOBLEZ`, `MANGA · ×2`, `CAMISA_BASE_v4 · T38 · mm` con el subrayado de
  marcador en oro) y una cota en señal (`328 mm · dobladillo`).
- **El visor 3D**, bajo la línea mono, como recuadro de 520×300 con borde de pelo y esquinas de 4 px
  arriba, fondo `#2a2825→#1f1d1a`, indicador mono `● Simulando · WebGPU` arriba a la izquierda, y
  dentro la grabación real de la tela cayendo (§ 5.2). Queda **cortado por el pliegue**: a 1366×768
  asoman ≥ 160 px. El patrón entero cabe sobre el pliegue.
- El fondo del hero lleva la rejilla del lienzo (tinta al 5,5 % cada 100 px y al 2,8 % cada 20 px).
- En móvil el orden es texto → patrón (420 px de alto) → visor (240 px).

### 3.3 Fig 0.1 · El taller (bloque 2)

Eyebrow mono `Fig 0.1 · El taller`. H2 **Tal como se abre. Sin cuenta, sin instalar.** Entradilla:
*Un lienzo de papel con tu patrón, un visor 3D con el avatar, y las herramientas de siempre en el
orden de siempre.* Figura: captura real del 2D con el patrón de María a 1280 px de ancho y 620 px de
alto (recorte por arriba), borde de pelo, sin sombra; en móvil, el recorte del lienzo con las
piezas. Pie mono a 12 px: `Patrón real importado de un DXF · pieza seleccionada con su cota` y a la
derecha `Chromium · 1600 × 1000`. Debajo, tres columnas separadas por línea de pelo, sin tarjeta ni
icono:

- **Trazado** — *Pluma, rectángulo, pinzas, piquetes y márgenes de costura. Las cotas se escriben
  donde miden.*
- **Costura** — *Coser piezas automáticamente o borde a borde. Las costuras se ven en el 2D y se
  cierran en el 3D.*
- **Caída** — *Tela simulada en tiempo real sobre el avatar, con WebGPU dentro del navegador. Mapas
  de ajuste desde el primer fotograma.*

Cada frase nombra algo que el código hace hoy (Pluma, Rectángulo, pinzas, piquetes, margen, cotas
vivas; `autoDetectSeams` y costura manual; solver WebGPU y `FitMapToggle`).

### 3.4 Formatos (bloque 3, sobre `--papel-hundido`)

Eyebrow `Formatos`. H2 **Abre tu DXF y míralo caer.** Entradilla: *Lo que trazas en el lienzo es lo
que lee la cortadora. Importa el patrón que ya tienes y expórtalo como salió.* Dos filas con línea
de pelo, rótulo en sans y lista en mono:

- **Lee** — `DXF-AAMA · DXF-ASTM · Gerber · SVG · ZPRJ (CLO)`
- **Escribe** — `DXF-AAMA · DXF por tallas · PDF de corte · BOM (CSV) · glTF · USDZ · OBJ · FBX`

Verificado contra `src/utils/dxf/` (`formatDetector`, `formatProfiles`, `exportAAMA`),
`src/utils/formats/` (`gerberImport`, `svgImport`, `zprjImport`), `src/utils/export/`
(`pdfCuttingExport`, `bomExport`, `gltfExporter`, `usdzExporter`, `objExporter`, `fbxExporter`) y
la herramienta `exportMultiSizeDXF`. Si un formato deja de existir, sale de la fila.

### 3.5 Fig 0.2 · El copiloto (bloque 4)

Eyebrow `Fig 0.2 · El copiloto`. H2 **Un copiloto que habla de costuras.** Entradilla: *Pídele que
añada una pinza, que audite los márgenes o que cosa las piezas: usa las mismas herramientas que tú,
y cada cambio se puede deshacer. Con tu propia clave de API.* Figura: captura real de la barra de
comandos abierta sobre el patrón (560 px de alto, recorte centrado al 30 %). Pie: `Cada verbo del
taller está en la barra: coser, vestir, escalar, marcar, exportar` · `Fig 0.2`. Las tres acciones
nombradas existen (`addDart`, `auditSeamAllowances`, `autoDetectSeams`) y el `ToolResult` lleva
`rollback`; «con tu propia clave de API» es la condición real del copiloto.

### 3.6 Código (bloque 5, sección oscura: fondo `--tinta`, texto `--papel`)

Eyebrow `Código` en `--papel-60`. H2 **Abierto, y se queda abierto.** Entradilla: *Vina es software
libre bajo licencia MIT. El código, los tests y las decisiones de diseño están en el repositorio.*
Botones: **Abrir Vina** (papel sobre tinta) · **Ver el código** (contorno papel al 35 %, →
`https://github.com/sssamuelll/vina`). Debajo, en mono a 13 px: `github.com/sssamuelll/vina · MIT ·
v0.11`, con `MIT` sobre un plano de oro al 18 %. La versión la escribe Vite en build desde
`package.json` (un `transformIndexHtml` de tres líneas que sustituye `%VINA_VERSION%`).

### 3.7 Pie (bloque 6)

Una banda con línea de pelo arriba: `© 2026 Vina · Patronaje y simulación 3D en el navegador` a la
izquierda y los cuatro enlaces a la derecha, todo a 13 px en `--tinta-70`.

## 4. La piel

Todo vive en `home/tokens.css` y `home/home.css`. Nada de `var(--x, fallback)`, ningún color
literal fuera de `tokens.css` (misma ley que el contrato § 1, aplicada a la home).

### 4.1 Tokens

Los contrastes son cálculo WCAG 2 del informe; **se confirman con herramienta y con APCA en F1**
y el resultado se escribe en el comentario del token, como en `src/styles/tokens.css`.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--papel` | `#F4EFE6` | fondo de página | tinta encima 14,97:1 |
| `--papel-hundido` | `#EBE7DE` (tinta al 4 %) | banda de formatos | — |
| `--tinta` | `#1E1B18` | texto, botón primario, sección Código | papel encima 14,97:1 |
| `--tinta-70` | `#5E5B56` | entradillas, pies, navegación | 5,90:1 sobre papel |
| `--tinta-50` | `#89857F` | solo ≥ 24 px o decorativo | 3,20:1 sobre papel |
| `--hairline` | `rgba(30,27,24,.12)` | bordes de 1 px, separadores, marcos | — |
| `--senal` | `#C0472B` | cota del hero, foco, relleno con texto claro, texto ≥ 24 px | blanco encima 5,03:1; como texto 4,39:1 |
| `--senal-texto` | `#B34228` | enlaces y texto pequeño en color | 4,92:1 sobre papel |
| `--oro` | `#F0D08A` | plano bajo tinta: marcador, muesca, `MIT`, la tela | como texto 1,30:1 — prohibido |
| `--gris` | `#9C958A` | reglas y adornos sobre papel; texto solo sobre tinta | 2,59:1 sobre papel — prohibido como texto |
| `--papel-60` | `#9E9A94` | texto secundario sobre `--tinta` | 6,12:1 |
| `--visor` | `#2a2825 → #1f1d1a` | fondo del recuadro 3D | — |
| `--font-sans` | `'Inter Variable', Inter, system-ui, sans-serif` | todo el texto | — |
| `--font-mono` | `'JetBrains Mono Variable', ui-monospace, monospace` | eyebrows, cotas, formatos, línea de condiciones | — |

Sin índigo, sin violeta, sin cian, sin degradados de color (el único degradado es el fondo del
visor, de un gris cálido a otro). Sin sombras: la única separación es la línea de pelo. Radios: 4 px
en marcos y figuras, 3 px en la cota, píldora (999 px) solo en los botones.

### 4.2 Tipografía

| Elemento | 1366 | 1440 | ≥ 1600 | 390 | Familia · peso | Tracking · interlínea |
|---|---|---|---|---|---|---|
| H1 | 48 | 56 | 64 | 36 | Inter · 500 | −0,03 em · 1,05 |
| H2 | 32 | 36 | 40 | 28 | Inter · 500 | −0,02 em · 1,1 |
| H3 (columnas) | 20 | 22 | 24 | 20 | Inter · 500 | −0,01 em · 1,2 |
| Entradilla | 17 | 18 | 18 | 17 | Inter · 400 · `--tinta-70` | 0 · 1,5 |
| Cuerpo | 16 | 16 | 16 | 16 | Inter · 400 | 0 · 1,5 |
| Pie, leyenda | 13 | 13 | 13 | 13 | `--tinta-70` | 0 · 1,45 |
| Eyebrow | 12 | 12 | 12 | 11 | JetBrains Mono · 500 · mayúsculas | +0,04 em · 1,2 |
| Cotas, formatos, condiciones | 12–14 | 12–14 | 14 | 12–13 | JetBrains Mono · 400 | 0 · 1,4–1,6 |
| Botón | 15 | 15 | 15 | 15 | Inter · 500 · caja de oración | 0 · alto 44 px |
| Navegación | 14 | 14 | 14 | — | Inter · 400 | 0 |

Escala por pasos con enteros (no `clamp()`): a 1366 un `clamp` lineal da 50,15 px. Mayúsculas solo
en la mono y solo a ≤ 12 px. `font-feature-settings: "cv01","ss03"` en Inter (la «a» y la «l» que usa
Linear). `font-variant-numeric: tabular-nums` en todo lo mono. `text-wrap: balance` en H1 y H2.

### 4.3 Layout

Contenedor `min(1280px, 100% − 48px)`; en móvil `100% − 32px`. Cabecera 56 px. Hero: rejilla de
520 px + 56 px + resto con 28 px de aire arriba; H1 a 84 px del borde superior; caja del patrón de
720×540 desde y = 84; visor a ≈ 446 px. **Regla del pliegue:** a 1366×768 la caja del patrón
entera está sobre los 630 px (termina en 624) y del visor asoman ≥ 160 px; lo fija el e2e (§ 8). Secciones con
96 px de padding vertical (64 en móvil). Figuras a 1280 px con borde de pelo, sin sombra. Página
total ≈ 3.960 px en escritorio, ≈ 4.300 en móvil.

### 4.4 Movimiento

| Qué | Duración · curva | Condición |
|---|---|---|
| Hover y foco de enlaces y botones | 150–200 ms · `cubic-bezier(.23,1,.32,1)` · solo `color`, `opacity`, `transform` | `@media (hover:hover) and (pointer:fine)` |
| Pulsación de botón | `scale(.97)` · 160 ms · ease-out | siempre |
| Entrada de secciones al hacer scroll | 300–400 ms · `opacity` + `translateY(8px)` · una vez · `@starting-style`, o `animation-timeline: view()` dentro de `@supports` | solo `prefers-reduced-motion: no-preference` |
| Vídeo del hero | bucle ≤ 6 s · `muted playsinline loop preload="none" poster` | visible en viewport, sin `saveData`, sin reducción de movimiento; si no, el póster |
| Titulares, fondos, cursor, parallax | no se animan | — |

Nada por encima de 300 ms salvo el vídeo. Todo `:hover` tiene `:focus-visible` con `outline` de
2 px en `--senal` y `outline-offset: 3px`.

## 5. Activos reales

La maqueta tiene dos cosas provisionales. Ninguna se publica así.

### 5.1 El patrón del hero — `home/img/patron.svg`

Se genera con `scripts/home/dxf-a-svg.mjs` (ejecutado con `tsx`) a partir de
`tests/fixtures/garments/maria_patrones_samuel_2M.dxf` usando el parser del repo
(`src/utils/dxf/parser.ts` + `importPipeline.ts`): contornos como `<path>` en `--ink`
(`#2b2d33`) de 1,25 px con relleno blanco, línea de costura discontinua, hilo con flechas, piquetes
como ticks, rótulos en mono. Se eligen dos piezas (delantero y manga) y se escala a la caja
720×600. El script es determinista y el SVG se commitea; el script queda para regenerarlo.

### 5.2 La tela cayendo — `home/media/caida.{mp4,webm}` + `caida-poster.avif`

Grabación real del taller con el mismo DXF: vestir avatar, simular, 6 s de bucle, sin cromo (solo
el visor). Requiere WebGPU: se graba en Chrome con `--enable-unsafe-webgpu` en esta Mac o en la
máquina de Samuel; Playwright headless no sirve. Presupuesto: H.264 ≤ 1,5 MB y AV1 ≤ 1 MB a 1040×600,
sin audio; póster AVIF ≤ 100 KB. **Si al publicar la grabación no está, la v1 sale con el póster
real y `hero.js` no se incluye**; el vídeo entra en un PR posterior sin tocar el layout.

### 5.3 Figuras — `home/img/fig-01@{1x,2x}.avif`, `fig-02@{1x,2x}.avif`

Capturas del taller con el DXF de María a 1600×1000 y `deviceScaleFactor: 2` vía
`scripts/capturas-ui.mjs` (build de producción, WASM basta). Fig 0.1: pieza seleccionada con su
cota. Fig 0.2: la barra de comandos abierta. Recorte para móvil (`fig-01-movil`) con las piezas.

### 5.4 Marca — `home/img/logo.svg`, favicons, OG

`logo.svg` = `vina-studio-logo-sin-studio.svg` del paquete, sin cambios. Favicons en `public/`
(compartidos con el taller): `favicon.ico` 32, `icon.svg` con `@media (prefers-color-scheme: dark)`
(piquete tinta / piquete papel), `apple-touch-icon.png` 180 sobre papel, `manifest.webmanifest` con
192/512 *maskable*. `public/og.png` 1200×630 renderizada con Playwright desde `home/og.html`
(papel, piquete, H1). El paquete de María queda en el repo como registro:
`design-handoff/vina-studio-2026-08-06/` con los tres SVG, `HANDOFF.md` y `LEEME.md` (el `.zip`
completo, con los `.dc.html`, se queda fuera: 1,6 MB y necesita su runtime).

### 5.5 Fuentes — `home/fonts/`

`inter-latin-wght.woff2` (≈ 48 KB) y `jetbrains-mono-latin-wght.woff2` (≈ 40 KB), tomadas de los
paquetes `@fontsource-variable/inter` y `@fontsource-variable/jetbrains-mono` (mismo subconjunto
`latin` que sirve Google, que cubre á é í ó ú ü ñ ¿ ¡ « » — €), con sus `LICENSE` (OFL) al lado.
`@font-face` inline en el `<head>`, `preload` solo de Inter, `font-display: swap` con fallback
`local("Arial")` ajustado con `size-adjust`/`ascent-override`/`descent-override` generados con
Capsize sobre el fichero exacto → CLS 0.

## 6. Arquitectura

### 6.1 Ficheros

```
index.html                 ← la home (nueva)
app/index.html             ← el taller (el index.html actual, movido; su <script src="/src/main.tsx"> sigue valiendo)
home/tokens.css
home/home.css
home/hero.js               ← ≤ 3 KB, opcional (§ 5.2)
home/og.html
home/fonts/…  home/img/…  home/media/…
scripts/home/dxf-a-svg.mjs
scripts/home/og.mjs
public/favicon.ico  public/icon.svg  public/apple-touch-icon.png  public/manifest.webmanifest  public/og.png
tests/e2e/home.spec.ts
tests/e2e/home-peso-baseline.json
tests/repo/home-tokens.test.ts
```

### 6.2 Vite

```ts
build: {
  outDir: './dist',
  rollupOptions: {
    input: {
      inicio: resolve(__dirname, 'index.html'),
      app: resolve(__dirname, 'app/index.html'),
    },
    output: { manualChunks(id) { if (id.includes('node_modules/three/')) return 'three'; } },
  },
},
```

Vite conserva la ruta anidada: `dist/index.html` + `dist/app/index.html` con `dist/assets/`
compartido. La home referencia `home/home.css` con `<link rel="stylesheet">` (Vite lo procesa y
hashea) y las fuentes por `url()` desde el CSS. En dev, `/` sirve la home y `/app/` el taller.

### 6.3 Servidores

- **nginx (servidor, fuera del repo; lo aplica Samuel al publicar):**
  ```nginx
  location = /          { try_files /index.html =404; }
  location ^~ /app/     { try_files $uri /app/index.html; }
  location ^~ /assets/  { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
  location /            { try_files $uri $uri/ =404; }
  ```
  `/app` sin barra → 301 a `/app/`. Sin el cambio, `/app/` sigue sirviéndose porque el fichero existe.
- **`server/index.ts`** (prod local): `/` → `index.html`; bajo `/app/` el fallback SPA es
  `app/index.html`; el resto, 404.
- **`scripts/deploy-prod.sh`:** el bundle se lee de `dist/app/index.html`; el `curl` de
  comprobación va a `/app/` (y otro a `/` que espera `Traza el patrón`).

### 6.4 Migración del taller a `/app/`

- 69 specs de `tests/e2e/` hacen `goto('/')`: reemplazo mecánico a `goto('/app/')` (y sus variantes
  `goto('/?…')`), verificado con `grep -rn "goto('/" tests/e2e` en cero.
- Auditar en `src/` cualquier `location.href = '/'`, `href="/"` o `window.open('/')` y las rutas de
  los workers (Vite las resuelve por `import.meta.url`; se comprueba en build).
- Los assets absolutos (`/wasm/`, `/hdri/`, `/textures/`, `/default-avatar.glb`) no cambian.
- `og:url` y `canonical` de la home apuntan a `https://vina.sdar.dev/`.

## 7. Accesibilidad, idioma y buscadores

`<html lang="es">`; `<span lang="en">` en «WebGPU». Un solo `<h1>`; landmarks `header/nav/main/footer`;
enlace «Saltar al contenido» como primer foco. Contrastes por encima de 4,5:1 en todo texto (§ 4.1)
y APCA Lc ≥ 75 en cuerpo (se mide en F1). Objetivos de puntero ≥ 24×24 px. `meta viewport`
`width=device-width, initial-scale=1` sin más. Todo `:hover` con `:focus-visible`. Sin `alert`, sin
modal, sin nada que tape el primer viewport.

`<title>Vina — Patronaje y simulación 3D en el navegador</title>` (≈ 50 car.); `meta description`
de 120–150 car. («Un CAD de patronaje que se abre en el navegador: patrón 2D editable, tela simulada
en tiempo real y un copiloto que entiende de pinzas y costuras. Gratis y de código abierto.»);
`canonical`; `og:title`, `og:description`, `og:image` 1200×630 con `og:image:width/height`,
`twitter:card = summary_large_image`; JSON-LD `WebApplication` con `applicationCategory:
"DesignApplication"`, `operatingSystem: "Web"`, `offers { price: 0 }`, `isAccessibleForFree: true`,
`license` y `sameAs` (GitHub), **sin valoraciones**; `robots.txt` y `sitemap.xml` con una URL.

## 8. Verificación

- **`tests/e2e/home.spec.ts`** (Playwright, contra `vite preview` del build): título y `lang`;
  un solo `h1` con el texto exacto; los dos «Abrir Vina» llevan a `/app/` y `/app/` responde con el
  taller; «Ver el código» lleva al repo; cero errores de consola; cero peticiones a terceros; **regla
  del pliegue** a 1366×768 (caja del patrón dentro de y ≤ 630; caja del visor con `top` ≤ 470); en
  390×844 el orden texto → patrón → visor y sin scroll horizontal; axe con `wcag2a`, `wcag2aa`,
  `wcag22aa` (añadir `@axe-core/playwright`). Las capturas `toHaveScreenshot` a 1366/1440/390 son
  **opt-in** (`HOME_SNAPSHOTS=1`) porque las referencias dependen de la máquina y el deploy sale de
  Windows.
- **Trinquete de peso** en el mismo spec: suma de bytes transferidos por tipo (`response.body()`)
  en la carga de `/` a 1366; falla si el total o cualquier tipo supera
  `tests/e2e/home-peso-baseline.json`, que solo baja (`HOME_PESO_UPDATE=1 … --retries=0 --workers=1`).
  Techos iniciales: documento ≤ 25 KB, CSS ≤ 20 KB, JS ≤ 15 KB (0 en la carga si no hay vídeo),
  fuentes ≤ 100 KB y ≤ 2 ficheros, imágenes ≤ 300 KB, vídeo 0 en la carga, total ≤ 500 KB.
- **`tests/repo/home-tokens.test.ts`** (vitest): parsea `home/tokens.css`, recalcula los
  contrastes de § 4.1 y falla si bajan del umbral; comprueba que en `home/home.css` `--oro` y
  `--gris` nunca aparecen como `color:` ni bajo texto claro; que no hay `var(--x, fallback)` ni hex
  fuera de `tokens.css`; y que las únicas familias son Inter y JetBrains Mono.
- **Lighthouse**: gate manual en `scripts/deploy-prod.sh`, en la máquina de Samuel (`lhci autorun`,
  `preset: desktop`, `categories:performance ≥ 0.95`, LCP ≤ 1.200 ms, CLS ≤ 0,01). En esta Mac no
  se corre: una tanda llevó el swap a 6,3 GB.
- Gates de siempre antes de commitear: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| La grabación 3D no está lista al publicar | La v1 sale con el póster real; el layout no cambia (§ 5.2). |
| El SVG del DXF sale feo (curvas rotas, piezas mal escaladas) | El script elige piezas por nombre y área; se revisa la maqueta a 1366 antes de commitear; como último recurso, el SVG dibujado a mano de la maqueta con los rótulos reales. |
| Mover el taller a `/app/` rompe un e2e o un enlace interno | Reemplazo con `grep` en cero, suite e2e completa antes del PR, auditoría de `href="/"` en `src/`. |
| El título en español no cabe en dos líneas a 48 px | Cabe (maqueta a 1366: dos líneas en 520 px). Si cambia el copy, se vuelve a medir. |
| La página hereda el `index.html` del taller (lang en, viewport bloqueado, Google Fonts) | No: tiene el suyo. El del taller es seguimiento (§ 10). |
| Contrastes calculados y no medidos | F1 los mide con herramienta y APCA y los escribe en el token; el test de tokens los defiende. |

## 10. Fuera de alcance y seguimientos

- `index.html` del taller: `lang="es"`, `viewport` sin `user-scalable=no` (o justificar en el fichero
  por qué bloquea el zoom sobre el lienzo), fuentes autoalojadas en vez de Google Fonts.
- `/en/` con `hreflang` cuando exista.
- Cita de María (D11).
- Demo interactiva con WASM detrás de un botón «Probar la caída».
- Pedir clave de PageSpeed Insights y medir la home publicada con datos de campo.
- Los `.dc.html` del paquete de María (exploración de identidad e interfaz): no se incorporan al
  repo; el HANDOFF y los SVG sí (§ 5.4).

## 11. Referencias

- `docs/reports/2026-09-27-homepage-competencia-y-referentes.md` y sus cinco notas en
  `docs/reports/2026-09-27-homepage-investigacion/`.
- Paquete de marca: `Vina_Studio.zip` (correo de María, 2026-08-06) → `design-handoff/vina-studio-2026-08-06/`.
- `docs/superpowers/specs/2026-09-24-cromo-callado-design.md` (la piel del taller, que la home no toca).
- `.claude/skills/contrato-de-interfaz/SKILL.md` (leyes de tokens, estado, idioma; aplicadas aquí a otra superficie).
- Maquetas aprobadas: `docs/superpowers/specs/assets/2026-09-28-homepage-{hero-c-1366,pagina-1366,pagina-390}.png` y `2026-09-28-homepage-maqueta.html`.

## 12. Enmienda del 2026-09-29 — lo que dicen los datos

Al planificar la implementación se midió el DXF de María y el repo, y tres cosas del cuerpo de
este documento no eran ciertas. Esta sección manda sobre el cuerpo donde choquen. Decidido con
Samuel el 2026-09-29.

**El patrón es una camiseta, y el DXF no tiene pinza.** `maria_patrones_samuel_2M.dxf` trae cinco
piezas sin nombre (`PATRONES PARA SAMUEL-1` a `-5`, formato AAMA): delantero y espalda de
520 × 594 mm, dos mangas de 381 × 282 mm y una tira de cuello. Todas con `outlineIsCutLine: true`
y margen 0. De ahí:

- § 3.2 y § 5.1: los rótulos del hero son `DELANTERO · ×1`, `MANGA · ×2` y
  `PATRONES PARA SAMUEL · AAMA · mm` (el nombre sale del DXF). Fuera `AL DOBLEZ` (el delantero
  está entero), fuera `CAMISA_BASE_v4 · T38` (inventado en la maqueta).
- Sin pinza (no existe) y sin línea de costura discontinua: el contorno ES la línea de corte, y
  dibujar la de costura sería inventar un margen.
- La cota es la medida real del dobladillo del delantero, **520 mm**, calculada por el script; no
  los 328 mm de la maqueta.
- El delantero es `SAMUEL-5` (escote central de 51 mm frente a 12 mm de la espalda, `SAMUEL-3`).
- La caja del patrón es 720 × 540 (§ 3.2 y § 4.3); el 720 × 600 de § 5.1 era un resto.

**El SVG del hero va incrustado en el HTML, no como `<img>`.** Un SVG en `<img>` no hereda la
fuente ni los tokens de la página: sus rótulos saldrían en la mono del sistema. Un plugin de Vite
de pocas líneas sustituye `<!-- incluir: home/img/patron.svg -->` por el fichero, y el SVG no lleva
colores literales, solo clases. Los tokens de la home ganan `--ink` y `--ink-2` (la tinta del
lienzo del taller, para el trazo), `--blanco` (relleno de pieza y texto sobre `--senal`) y los del
visor y la rejilla, para que `home.css` no tenga ni un literal.

**Imágenes en WebP, no AVIF.** En la máquina de trabajo no hay codificador AVIF (ni `sharp`, ni
`ffmpeg`, ni `avifenc`), y Chromium codifica WebP de serie (`canvas.convertToBlob`). Se generan en
WebP con el mismo script de Playwright, sin dependencias nativas nuevas. El presupuesto de peso de
§ 8 no cambia.

**El repo es privado.** `sssamuelll/vina` estaba en PRIVATE al planificar. El copy de «código
abierto» y los enlaces al repo se implementan tal cual; Samuel lo hace público antes de publicar
la home. Sin eso, la home no se despliega.

**`scripts/home/og.mjs` se funde en `scripts/home/activos.mjs`**, que genera figuras, póster,
favicons, manifest y OG en una sola pasada contra el build.

**Al implementar (2026-09-29).** Seis decisiones que salieron de medir la página ya construida:

- **La meta description es otra.** Queda «CAD de patronaje en el navegador: patrón 2D editable,
  tela simulada en tiempo real y un copiloto que entiende de costuras. Gratis y de código
  abierto.» (150 caracteres). La frase de § 7 medía 174 contra su propio rango de 120–150, y el
  e2e fija ese rango.
- **Fuera la animación de entrada al hacer scroll de § 4.4.** Con `animation-timeline: view()` el
  texto se queda desvaído donde el lector deje de bajar: axe midió 12 fallos de contraste en
  `#taller` con opacidad 0,16. Gana que se lea sobre que se mueva.
- **Los enlaces de la cabecera y del pie tienen `min-height: 24px`.** Medían 21 y 18,8 px contra
  los 24 × 24 de § 7; un e2e mide cada enlace y cada botón visibles.
- **El recorte de la Fig 0.2 se ancla a la paleta de comandos, no «centrado al 30 %».** La paleta
  abre hacia arriba desde la barra de abajo, y el recorte al 30 % dejaba fuera su campo de
  búsqueda y el grupo Exportar.
- **Las `@font-face` viven en `home/home.css`, no en línea en el head (§ 5.5),** con un `preload`
  de Inter en el head: el preload ya da el descubrimiento temprano.
- **El póster del hero salió del tier WASM** (headless no tiene WebGPU) y trae una franja negra
  dentada en la costura lateral derecha de la camiseta. Es salida real del solver y del render,
  sin retocar; necesita su propio issue y una mirada antes de publicar.

Plan: `docs/superpowers/plans/2026-09-29-homepage.md`.
