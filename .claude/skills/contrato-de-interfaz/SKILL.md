---
name: contrato-de-interfaz
description: Usar SIEMPRE antes de escribir o modificar cualquier interfaz de Vina — un componente, un panel, un botón, un menú, un modal, un toast, un color, un tamaño de fuente, un z-index, una cadena visible o un atajo. También al revisar UI, al arreglar un bug visual, o cuando el pedido diga rediseñar, maquetar, estilizar, "que se vea mejor", "ponle un panel", "agrega un botón". Trae las seis leyes del contrato de interfaz y el comando que las verifica.
---

# Contrato de interfaz de Vina

## Por qué existe esto

La auditoría del 2026-08-14 midió la interfaz y encontró **siete materiales para
la misma idea de "cosa que flota", 17 estilos de botón en una sola pantalla, 15
valores de z-index, cuatro acentos y 21 tamaños de fuente**.

La causa NO fue falta de gusto ni falta de tokens. Fue esto:

> **Ya existían ocho contratos escritos y los ocho se rodeaban.**
> `tokens.css`, el glosario de copy, `shortcutDisplay.ts`, `ContextPanel`,
> `.icon-btn`, los 59 iconos de `tools/definitions/`, `PanelErrorBoundary`,
> el campo `nameEs`. Todos correctos. Ninguno consultado.

Si estás leyendo esto es porque vas a tocar la interfaz. **Consulta antes de
escribir, no después.** Escribir un noveno contrato no arregla nada; lo que
falta es que alguien lo mire antes de decidir.

Informe completo: `docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md`

---

## Antes de escribir una línea

Estas cuatro preguntas cubren el 90% de la deriva medida:

1. **¿Es un color, un radio, una sombra o un tamaño?** → sale de
   `src/styles/tokens.css`. Si no existe el token, **defínelo ahí**, no en tu
   componente.
2. **¿Es una superficie que flota sobre el lienzo?** → usa un material entero
   (§2). No inventes el tuyo.
3. **¿Es texto que ve la usuaria?** → español, y el término sale del glosario
   `docs/specs/2026-07-16-ui-copy-es-glosario.md`.
4. **¿Es una función nueva?** → ¿por dónde entra? Si solo se llega por la
   paleta de comandos, no está terminada (§6).

---

## 1. Ley de tokens — que romper sea ruidoso

- **PROHIBIDO `var(--x, fallback)`.** Sin excepciones. Si el token existe, el
  fallback sobra; si no existe, tiene que romper en pantalla el mismo día.
  Esta regla sola habría evitado los nueve nombres de token fantasma que la
  auditoría encontró referenciados 63 veces, todos resolviendo en silencio a un
  hex escrito a mano.
- **Un solo archivo de definición**: `src/styles/tokens.css`.
- **Un nombre por concepto.** Antes de crear `--text-color`, busca: ya existe
  `--text-primary`. Antes de `--accent-color`: ya existe `--accent`.
- **Ningún color literal en un componente.** Ni hex, ni `rgba()`, ni en CSS ni
  en `style={{}}`.

## 2. Ley de materiales — dos, usados enteros

No se mezclan piezas de dos materiales. Se usa uno completo.

| Material | Cuándo | Tokens |
|---|---|---|
| **`chrome`** | acoplado a una canaleta; opaco; **sin sombra** | `--surface-chrome-bg`, `-border`, `-radius`, `-shadow` (= none) |
| **`overlay`** | flota de verdad sobre el documento y se va; casi opaco (0,96), línea de pelo, sombra corta en dos capas; **sin blur** | `--surface-overlay-bg`, `-border` (= `--hairline`), `-radius`, `-shadow`, `-blur` (= none) |

> **Enmienda 2026-09-26 (cromo callado, spec 2026-09-24 § 4.4):** los dos
> roles siguen existiendo y se usan enteros, pero están hechos del MISMO
> material y solo los distingue la sombra. El blur se retiró: con un fondo al
> 92 % solo desenfocaba el 8 % que se transparentaba, y a cambio creaba los
> contextos de apilamiento que recortaron `ConnectionModal` (párrafo de abajo).
> `--surface-overlay-blur` sigue existiendo como token y vale `none`, para que
> nadie lo reponga a mano. Se dice aquí para que no parezca fusión por descuido.

Más una familia de **tinta**, que no es superficie: `--ink-*` es lo que se
dibuja **sobre el papel** del lienzo 2D.

> **La trampa que ya nos costó una vez:** los `--text-*` son la tinta del cromo
> **oscuro**. Aplicados sobre el crema del lienzo dan 1.05:1 de contraste — o
> sea, invisibles. Si tu texto va dentro del `<svg>` del lienzo, usa `--ink-*`.

Variantes declaradas (no inventes más): `--surface-overlay-radius-pill` para
barras con forma de cápsula, y `--surface-overlay-bg-recessed` para el reposo de
la barra de IA.

> **Y `--surface-overlay-border-flush`** (bordes → tono: la sombra en capas
> `--surface-overlay-shadow-sheet` separa, el borde queda para los campos). La
> usan la tira de herramienta del lienzo 2D y los chips de cota
> (`docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` § 9-10).
> **Excepción dicha:** la tira es un `overlay` que NO se va — está mientras hay
> herramienta 2D activa, bajo la regla (28 px) y nunca sobre ella. Y las cotas
> van sobre el patrón por definición: son parte del objeto, como los tiradores
> del transform box, no un panel. Lo pidió Samuel el 2026-08-30; queda escrito
> para que no se vuelva regla tácita.

> **Nota 2026-09-26:** ya no hay blur, así que un overlay ya NO establece
> contexto de apilamiento por sí mismo; lo que sigue vale para cualquier
> superficie que declare `transform`, `filter` u `opacity < 1`. El patrón del
> portal sigue siendo el correcto para todo modal.
>
> **Estas dos leyes pelean, y hay que saberlo antes de escribir (medido el
> 2026-08-15).** `--surface-overlay-blur` es un `backdrop-filter`, y un
> `backdrop-filter` hace **dos cosas** que no tienen nada que ver con verse
> bonito: establece **contexto de apilamiento** y captura el **bloque
> contenedor** de sus descendientes `position: fixed`.
>
> O sea: **nada `position: fixed` puede escapar desde dentro de una superficie
> `overlay`.** Ni por z-index, ni por `inset: 0`.
>
> Lo que costó: `ConnectionModal` se renderiza dentro del div de la barra de IA
> (vía `ConnectionsList` → `AgentSettings`). Pedía `inset: 0` con `--z-modal`, y
> en un viewport de 1280×720 se recortaba a **558×359** dentro del panel de la
> barra — botones de guardar fuera de vista, velo que no oscurecía nada, y el
> 1100 topado en `--z-bar`. Los 6889 tests unitarios en verde: jsdom no calcula
> layout.
>
> **La regla:** antes de darle a una superficie un rol alto de la escala
> (`--z-menu` para arriba), pregunta **desde dónde se renderiza**, no solo qué
> valor declara. Si su árbol pasa por la barra de IA, un panel o un menú
> —cualquier cosa con material `overlay`— el valor es decorativo y hace falta
> `createPortal(..., document.body)`. `ToolTooltip` y `ConnectionModal` ya lo
> hacen; es el patrón a copiar.
>
> Y al revés: una superficie con material `overlay` **ya es** contexto de
> apilamiento. No le agregues `isolation: isolate` "para aislarla" — no hace
> nada nuevo.

## 3. Ley de emplazamiento

- El cromo se **acopla en canaletas**; el documento tiene área segura.
- Solo tres cosas pueden taparlo: menús transitorios, toasts y la paleta.
- Un panel nuevo NO se abre encima de la regla ni del patrón.
- Nada de `z-index` literal. Si necesitas una capa, es que falta un rol.
- **`isolation: isolate` no hace lo que parece.** Un elemento con `position` (no
  `static`) y `z-index` numérico **ya es** contexto de apilamiento; agregarle
  `isolation` al MISMO elemento solo afecta a sus hijos, nunca a cómo su propio
  z-index compite con sus hermanos. Para aislar de verdad un racimo, la
  declaración va en el **ancestro común**, no en cada competidor. Esta premisa
  falsa se implementó entera en 26 sitios antes de que alguien la midiera; el
  registro está en la enmienda de
  `docs/superpowers/specs/2026-08-14-fase-3-4-emplazamiento-paneles-design.md`.
- **Aislar tiene un costo simétrico:** lo de adentro deja de poder escapar. Si
  aíslas un contenedor, todo modal, menú contextual o toast que se renderice
  dentro pierde su rol global. Decidir qué se aísla y qué tiene permitido salir
  es diseño, no una mecánica que se aplique en lote.

## 4. Ley de estado

- **`seleccionado` > `hover` > `reposo`**, siempre, en peso visual. Ya estuvo al
  revés en el dock: la herramienta apenas rozada se veía más seleccionada que la
  activa.
- El estado seleccionado **no puede depender solo del tono**. Un icono de 16px
  que solo cambia de color no comunica nada, y falla para quien no distingue
  colores. Cambia también el relleno.
- **Todo lo que tenga `:hover` tiene `:focus-visible`.** El repo llegó a tener
  76 contra 6.
- `outline: none` solo es legal si la misma regla pone otra señal en su lugar.
- Nada de `confirm()` / `alert()` / `prompt()`. Existe el sistema de Toast
  (`showToast`, `showErrorToast`, `showUndoToast` en `copilotUISlice`). Para algo
  destructivo, prefiere **actuar y ofrecer deshacer** antes que preguntar.

## 5. Ley de idioma y atajos

- Español de Venezuela. Sentence case. Sin "¡", sin "por favor".
- Un término por concepto — el glosario manda: pieza, costura, margen, piquete,
  pinza, tramo.
- Los `aria-label` **también** van en español.
- Los términos de motor (WebGPU, WASM, fps, DXF) no se traducen; sus mensajes sí.
- **Una sola notación de atajo**, vía `shortcutDisplay.ts`. Y si un atajo está en
  `src/shortcuts/defaults.ts`, el catálogo que lo muestra tiene que declararlo
  igual: `notch` tenía Shift+N registrado y el dock no lo mostraba, así que para
  la usuaria no existía.
- **Mono = un dato cuya alineación carácter a carácter significa algo**
  (regla, cotas, píldora de medida, `kbd`). Toda la prosa del cromo va en
  `--font-sans`: el estado, los rótulos del dock, el estado vacío, el valor de
  una opción. Una sola familia de cada: Inter y JetBrains Mono, nada más se
  carga (`index.html`). Lo fija `tipografia-del-cromo.test.ts`, selector por
  selector. (Enmienda 2026-09-26; la revisión del 04-09 § 8 decía «Schibsted +
  mono», que no era lo que el código hacía.)

## 6. Ley de puertas

**Una función que se despacha tiene una puerta visible en el shell.** Si solo se
llega por la paleta de comandos o por un atajo que nadie muestra, no está
terminada. Piquete estuvo así: sin botón, con atajo invisible.

---

## Verificación — no es opcional

```bash
node scripts/ui-contract-lint.mjs        # ocho reglas, ~1 s
node scripts/ui-contract-lint.mjs --list R1   # ver los sitios de una regla
```

Es un **trinquete**: falla si un contador SUBE. Corre también en el hook de
pre-commit y en los gates de deploy.

- Si tu cambio hace subir un contador, **arréglalo**. No toques
  `scripts/ui-contract-baseline.json` para taparlo.
- Si tu cambio hace BAJAR un contador (lo esperable al arreglar deriva), corre
  `node scripts/ui-contract-lint.mjs --update` y commitea el baseline nuevo.

Para lo que el linter estático no ve —contraste real, foco visible, oclusiones,
cuántos materiales hay de verdad en pantalla— existe el censo contra la app viva:

```bash
npm run audit:ui        # requiere el server de dev corriendo
```

Y dos trinquetes más, en navegador, con su línea base en JSON que **solo baja**
(spec 2026-09-24 § 3.4 y § 7). El techo efectivo de un estado es el mayor de
la meta y la línea base: por debajo de la meta el diseño puede mover
superficies; por encima, solo se baja. Con reintentos, un fallo a mitad de un
grupo serial escribe medidas parciales: por eso `--retries=0`.

```bash
npx playwright test tests/e2e/superficies-por-accion.spec.ts   # ≤ 4 componentes que aparecen o cambian por acción
npx playwright test tests/e2e/contraste-del-cromo.spec.ts      # ningún texto del cromo bajo AA sobre su fondo real
```

Una superficie nueva **declara** qué es con `data-superficie` (vocabulario en
`tests/repo/superficies-declaradas.test.ts`); sin marca, el trinquete no la ve.
Para bajar un techo:

```bash
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
```

y se commitea el JSON. Nunca se editan a mano.

> **La suite unitaria es CIEGA al apilamiento.** jsdom no calcula layout: no
> tiene `elementFromPoint` y `getBoundingClientRect()` devuelve 0. Un modal
> enterrado bajo una barra, un panel recortado, un tooltip que tapa un toast —
> todo eso pasa los tests en verde. Ya ocurrió: la Ola 1 de la Fase 3+4 llevó
> dentro una regresión de apilamiento con 6889 tests pasando.
>
> Si tocas z-index, `isolation`, `position`, `overflow` o `backdrop-filter`,
> **la prueba es un navegador**, y la forma de que quede fijada es un e2e que
> mida el resultado, no el valor declarado. El patrón está en
> `tests/e2e/emplazamiento-modales.spec.ts`: recorre los ancestros buscando
> contextos de apilamiento y pregunta con `elementFromPoint` quién pinta
> encima de quién.

---

## Lo que NO se hace en Vina

Vina es una herramienta profesional densa, no una landing page. Estos consejos
son correctos en otro contexto y **incorrectos aquí**:

- "Más whitespace" — María trabaja horas viendo el patrón; menos densidad es
  menos patrón en pantalla.
- Fotos de fondo, parallax, secciones que se apilan al hacer scroll.
- Cambiar la tipografía "para que se vea premium".
- Cambiar el set de iconos por diferenciarse: que el icono se **reconozca** vale
  más.

Si el pedido del usuario contradice algo de aquí, **manda el usuario** — pero
dilo en una línea antes de hacerlo, para que la excepción quede dicha y no se
vuelva la próxima regla tácita.
