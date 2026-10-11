# Home de Vina, el taller abierto · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la home de Vina en inglés en `/` y en español en `/es/`, con tres bloques nuevos (lo que hace hoy con prueba en el código, lo que falta, cómo se hace con un diario), la oferta de mandar un patrón por correo, y un README que sale de los mismos datos.

**Architecture:** La home sigue siendo HTML estático sin JavaScript, construido por Vite como dos entradas (`index.html`, `es/index.html`). Las dos páginas salen de una plantilla (`home/plantilla.html`) más un archivo de copy por idioma y tres archivos de datos (`home/datos/`), generadas por `scripts/home/paginas.mjs` y commiteadas; un test de repo falla si se desactualizan. Los mismos datos escriben dos secciones del README. La piel (`home/tokens.css`, tipografía, hero) no cambia.

**Tech Stack:** Vite 6 (dos entradas HTML, plugin `incluirEnHome`), Node 22 (scripts `.mjs`), Vitest (tests de repo), Playwright 1.58 (`playwright.home.config.ts` contra `vite preview`), Git Bash en Windows.

**Spec:** `docs/superpowers/specs/2026-10-10-home-taller-abierto-design.md` (sucede al del 2026-09-28 en todo menos la piel).

**Worktree:** `/d/Desktop/projects/vina/.claude/worktrees/taller-abierto`, rama `feat/home-taller-abierto`. Todos los comandos se corren desde ahí, por la ruta `D:` (no por la junction de `C:\Users\simon\Desktop`: Vite falla a través de ella).

## Global Constraints

- Cero `<script>` en las páginas salvo el JSON-LD; cero peticiones a terceros; ≤ 2 ficheros de fuente (Inter Variable y JetBrains Mono Variable, autoalojadas).
- `home/home.css`: sin `var(--x, fallback)`, sin colores literales, sin `box-shadow`, sin `clamp()`; solo `var(--font-sans)` / `var(--font-mono)`. Lo defiende `tests/repo/home-tokens.test.ts`, que no se toca.
- `home/tokens.css` no gana ni pierde un token.
- Copy: inglés y español de Venezuela en caja de oración; sin `!`, sin `¡`, sin «AI-powered», sin nombrar competidores. Los textos de § 3 del spec son los aprobados: se copian tal cual.
- ≤ 520 palabras visibles por página.
- Los `id` de bloque son `today`, `making`, `how`, `send` en los dos idiomas.
- Los dos botones de oferta llevan `mailto:vina@sdar.dev?subject=A%20pattern%20for%20Vina` (EN) y `mailto:vina@sdar.dev?subject=Un%20patr%C3%B3n%20para%20Vina` (ES).
- Rutas de activos relativas a la página: `./` en `index.html`, `../` en `es/index.html` (Vite las resuelve desde el fichero HTML).
- Gates antes de cada commit: el hook de pre-commit corre `npx tsc -b --noEmit` + lint-staged + el trinquete de UI; **nunca `--no-verify`**. Antes del PR: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.
- Línea base de `main` en `97e78e98` (medida 2026-10-10): 12 pruebas rojas listadas en § 12 del spec. Ni una más.
- Las 12 rojas también disparan el hook de pre-push (`.husky/pre-push` corre la suite entera): si bloquea el push, se reporta a Samuel; no se salta.

## Review Focus

1. **`/es/` carga sus activos.** Desde `/es/` una ruta `./home/...` apuntaría a `/es/home/...`. La página española tiene que salir con el papel de fondo y todas las imágenes cargadas. → Task 5, tests «sigue en papel» y «toda imagen carga» corren para las dos páginas.
2. **El asunto del `mailto:` español lleva una `ó`.** Mal codificado, el cliente de correo abre vacío o con basura. → Task 5, test «los dos botones de oferta abren el correo con el asunto».
3. **Un enlace que dice `#915` no dice nada en un lector de pantalla.** → Task 3 (la plantilla pone `aria-label` con el rótulo y la frase) y Task 5, test «cada enlace de las listas tiene nombre completo».
4. **Sin JavaScript la página se ve entera, incluidas las listas generadas.** → Task 5, el test sin JS cuenta las filas de las dos listas en las dos páginas.
5. **Las palabras crecen con tres bloques y el diario.** → Task 5, techo de 520 por página, medido.

## File Structure

```
home/datos/hoy.json                   ← Task 1 · lo que hace hoy, con rutas de prueba
home/datos/en-construccion.json       ← Task 1 · lo que falta, con enlace
home/datos/diario.json                ← Task 1 · cinco entradas, con PR
tests/repo/home-honestidad.test.ts    ← Task 1 · rutas existen, enlaces bien formados, PRs en el historial, README al día (Task 7 lo amplía)
scripts/home/dxf-a-svg.mjs            ← Task 2 · --idioma, dos SVG
home/img/patron.en.svg, patron.es.svg ← Task 2 (patron.svg se borra)
tests/repo/home-patron.test.ts        ← Task 2
home/copy/en.json, home/copy/es.json  ← Task 3 · el copy
home/plantilla.html                   ← Task 3 · la estructura
scripts/home/paginas.mjs              ← Task 3 · generador (--check)
tests/repo/home-paginas.test.ts       ← Task 3
index.html, es/index.html             ← Task 3 · generados
vite.config.ts, .gitattributes, public/sitemap.xml ← Task 3
home/home.css                         ← Task 4 · estilos de los bloques nuevos
tests/e2e/home.spec.ts                ← Task 5 · parametrizado por idioma
tests/e2e/home-peso-baseline.json     ← Task 5 (y Task 8 lo reajusta a mano)
server/rutas.ts, server/__tests__/rutas.test.ts ← Task 6
scripts/home/enlaces.mjs              ← Task 6 · HEAD a los enlaces externos
scripts/deploy-prod.sh                ← Task 6 · comprobaciones de / y /es/
scripts/home/readme.mjs               ← Task 7 · secciones del README
README.md, CONTRIBUTING.md, ROADMAP.md ← Task 7
docs/specs/LANDING-PAGE-*.md, docs/specs/ROADMAP.md ← Task 7 · se borran
docs/superpowers/specs/2026-09-28-homepage-design.md ← Task 7 · aviso de sucesión
home/og.html, scripts/home/activos.mjs ← Task 8 · OG por idioma, fig-02 con mapa de ajuste, --gpu
home/img/fig-02@{1x,2x}.webp, fig-02-movil.webp, caida-poster.webp, public/og.png, public/og-es.png ← Task 8
```

---

### Task 1: Los datos de la honestidad y su test

**Files:**
- Create: `home/datos/hoy.json`, `home/datos/en-construccion.json`, `home/datos/diario.json`
- Test: `tests/repo/home-honestidad.test.ts`

**Interfaces:**
- Produces: `hoy.json` = `{ columnas: Entrada[], filas: Fila[] }` con `Entrada = { id, titulo: {en, es}, texto: {en, es}, prueba: string[] }` y `Fila = Entrada & { mono: boolean }`; `en-construccion.json` = `{ id, texto: {en, es}, enlace, rotulo }[]`; `diario.json` = `{ fecha: 'YYYY-MM-DD', pr: number, texto: {en, es} }[]`. Los consumen Task 3 (plantilla) y Task 7 (README).

- [ ] **Step 1: Escribir el test que falla**

`tests/repo/home-honestidad.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
// @ts-expect-error — módulo .mjs sin tipos (lo crea Task 7; hasta entonces este import falla y es el rojo esperado)
import { generarSecciones, MARCAS } from '../../scripts/home/readme.mjs';

const json = (rel: string) => JSON.parse(readFileSync(rel, 'utf8'));
const hoy = json('home/datos/hoy.json') as { columnas: Entrada[]; filas: (Entrada & { mono: boolean })[] };
const enConstruccion = json('home/datos/en-construccion.json') as { id: string; texto: Texto; enlace: string; rotulo: string }[];
const diario = json('home/datos/diario.json') as { fecha: string; pr: number; texto: Texto }[];
type Texto = { en: string; es: string };
type Entrada = { id: string; titulo: Texto; texto: Texto; prueba: string[] };

const entradasHoy = [...hoy.columnas, ...hoy.filas];
const textos = (t: Texto) => [t.en, t.es];

describe('home/datos/hoy.json: cada afirmación tiene su prueba en el código', () => {
  it('tres columnas y tres filas, con id y texto en los dos idiomas', () => {
    expect(hoy.columnas.map((c) => c.id)).toEqual(['trazado', 'costura', 'caida']);
    expect(hoy.filas.map((f) => f.id)).toEqual(['lee', 'escribe', 'copiloto']);
    for (const e of entradasHoy) for (const t of [...textos(e.titulo), ...textos(e.texto)]) expect(t.trim().length).toBeGreaterThan(0);
  });
  it.each(entradasHoy.flatMap((e) => e.prueba.map((p) => [e.id, p])))('%s → %s existe', (_id, ruta) => {
    expect(existsSync(ruta as string), `${ruta} no existe: la afirmación se queda sin prueba`).toBe(true);
  });
  it('ninguna entrada se queda sin prueba', () => {
    for (const e of entradasHoy) expect(e.prueba.length, e.id).toBeGreaterThan(0);
  });
});

describe('home/datos/en-construccion.json: cada falta tiene a dónde ir', () => {
  it('seis puntos con texto en los dos idiomas', () => {
    expect(enConstruccion).toHaveLength(6);
    for (const e of enConstruccion) for (const t of textos(e.texto)) expect(t.trim().length).toBeGreaterThan(0);
  });
  it.each(enConstruccion.map((e) => [e.id, e.enlace, e.rotulo]))('%s → %s (%s)', (_id, enlace, rotulo) => {
    const issue = /^https:\/\/github\.com\/sssamuelll\/vina\/issues\/(\d+)$/.exec(enlace as string);
    const roadmap = /^https:\/\/github\.com\/sssamuelll\/vina\/blob\/main\/ROADMAP\.md#([\w-]+)$/.exec(enlace as string);
    expect(issue || roadmap, 'enlace a un issue del repo o a un ancla de ROADMAP.md').toBeTruthy();
    if (issue) expect(rotulo).toBe(`#${issue[1]}`);
    if (roadmap) {
      expect(rotulo).toBe('ROADMAP');
      const anclas = [...readFileSync('ROADMAP.md', 'utf8').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'));
      expect(anclas, `ancla #${roadmap[1]} en ROADMAP.md`).toContain(roadmap[1]);
    }
  });
  it('no promete nada que hoy.json ya da por hecho', () => {
    const hechos = entradasHoy.flatMap((e) => textos(e.texto)).join(' ').toLowerCase();
    for (const e of enConstruccion) {
      const primera = e.texto.en.split('.')[0].toLowerCase();
      expect(hechos.includes(primera), `«${primera}» está en las dos listas`).toBe(false);
    }
  });
});

describe('home/datos/diario.json: la historia que se cuenta existe', () => {
  const historial = execSync('git log --oneline origin/main', { encoding: 'utf8' });
  it('cinco entradas, de la más nueva a la más vieja', () => {
    expect(diario).toHaveLength(5);
    const fechas = diario.map((d) => d.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
    for (const d of diario) expect(d.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.each(diario.map((d) => [d.pr, d.fecha]))('el PR #%s está en el historial', (pr) => {
    expect(new RegExp(`Merge pull request #${pr}\\b|\\(#${pr}\\)`).test(historial), `#${pr} no está en git log origin/main`).toBe(true);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/repo/home-honestidad.test.ts`
Expected: FAIL, `ENOENT: no such file or directory, open 'home/datos/hoy.json'`.

- [ ] **Step 3: Escribir los tres archivos de datos**

`home/datos/hoy.json`:

```json
{
  "columnas": [
    {
      "id": "trazado",
      "titulo": { "en": "Drafting", "es": "Trazado" },
      "texto": {
        "en": "Pen, rectangle, notches and seam allowances, with the grainline drawn and the dimensions written where they measure. Darts come in with your DXF.",
        "es": "Pluma, rectángulo, piquetes y márgenes de costura, con el hilo dibujado y las cotas escritas donde miden. Las pinzas entran con tu DXF."
      },
      "prueba": ["src/components/shell/dock2dTools.ts", "src/utils/seam/tiposDeEsquina.ts", "src/utils/notchAnchor.ts", "src/utils/grainLine.ts", "src/utils/dartEntity.ts"]
    },
    {
      "id": "costura",
      "titulo": { "en": "Sewing", "es": "Costura" },
      "texto": {
        "en": "Sew pieces automatically or edge to edge, and watch the seams close in 3D.",
        "es": "Cose las piezas automáticamente o borde a borde, y mira las costuras cerrarse en el 3D."
      },
      "prueba": ["src/utils/seam/caminarCostura.ts", "src/copilot/action/tools/definitions/autoSewTools.ts", "src/utils/cloth"]
    },
    {
      "id": "caida",
      "titulo": { "en": "Drape", "es": "Caída" },
      "texto": {
        "en": "Fabric simulated in real time on the avatar, with WebGPU inside the browser. A fit map from the first frame.",
        "es": "Tela simulada en tiempo real sobre el avatar, con WebGPU dentro del navegador. Mapa de ajuste desde el primer fotograma."
      },
      "prueba": ["src/utils/cloth/gpu", "src/utils/cloth/fitMaps.ts", "public/wasm/xpbd_wasm_bg.wasm", "public/avatares"]
    }
  ],
  "filas": [
    {
      "id": "lee",
      "titulo": { "en": "Reads", "es": "Lee" },
      "mono": true,
      "texto": { "en": "DXF-AAMA · DXF-ASTM · Gerber and Lectra dialects", "es": "DXF-AAMA · DXF-ASTM · dialectos Gerber y Lectra" },
      "prueba": ["src/utils/dxf/formatProfiles.ts", "src/components/shell/AppShell.tsx"]
    },
    {
      "id": "escribe",
      "titulo": { "en": "Writes", "es": "Escribe" },
      "mono": true,
      "texto": { "en": "DXF-AAMA · PDF at 1:1 · BOM (CSV) · glTF · USDZ · 360° turn", "es": "DXF-AAMA · PDF a escala 1:1 · BOM (CSV) · glTF · USDZ · vuelta 360°" },
      "prueba": ["src/utils/export/uiExport.ts", "src/components/Viewport3D/renderSections/ExportSection.tsx", "src/components/shell/LogoMenu.tsx"]
    },
    {
      "id": "copiloto",
      "titulo": { "en": "Copilot", "es": "Copiloto" },
      "mono": false,
      "texto": {
        "en": "Ask it to add a dart or to audit the seam allowances. It uses the same tools you do, and every change can be undone. With your own key: Anthropic, OpenAI, DeepSeek or Ollama.",
        "es": "Pídele que añada una pinza o que audite los márgenes. Usa las mismas herramientas que tú y cada cambio se puede deshacer. Con tu propia llave: Anthropic, OpenAI, DeepSeek u Ollama."
      },
      "prueba": ["src/copilot/connections/registry.ts", "src/copilot/action/tools/definitions"]
    }
  ]
}
```

`home/datos/en-construccion.json`:

```json
[
  { "id": "escalado", "texto": { "en": "Real grading. Sizes scale in proportion today; rules per point come next.", "es": "Escalado de verdad. Hoy las tallas escalan en proporción; las reglas por punto vienen después." }, "enlace": "https://github.com/sssamuelll/vina/issues/915", "rotulo": "#915" },
  { "id": "marcada", "texto": { "en": "A marker you can export. The nesting panel estimates fabric use and stops there.", "es": "Una marcada que se pueda exportar. El panel de marcada estima el consumo de tela y ahí se queda." }, "enlace": "https://github.com/sssamuelll/vina/blob/main/ROADMAP.md#next", "rotulo": "ROADMAP" },
  { "id": "pinza", "texto": { "en": "A dart tool. Darts arrive with your DXF or through the copilot, not from the pen yet.", "es": "Una herramienta de pinza. Las pinzas llegan con tu DXF o por el copiloto, todavía no con la pluma." }, "enlace": "https://github.com/sssamuelll/vina/blob/main/ROADMAP.md#next", "rotulo": "ROADMAP" },
  { "id": "proyectos", "texto": { "en": "Project files. Your work lives in this browser until .vina files can be saved and opened.", "es": "Archivos de proyecto. Tu trabajo vive en este navegador hasta que los .vina se puedan guardar y abrir." }, "enlace": "https://github.com/sssamuelll/vina/issues/15", "rotulo": "#15" },
  { "id": "ingles", "texto": { "en": "The interface in English. The workshop speaks Spanish.", "es": "La interfaz en inglés. El taller habla español." }, "enlace": "https://github.com/sssamuelll/vina/issues/964", "rotulo": "#964" },
  { "id": "telas", "texto": { "en": "Fabrics measured from cloth. Thirty-two presets today.", "es": "Telas medidas sobre el tejido. Hoy hay treinta y dos preajustes." }, "enlace": "https://github.com/sssamuelll/vina/issues/1005", "rotulo": "#1005" }
]
```

`home/datos/diario.json`:

```json
[
  { "fecha": "2026-10-09", "pr": 1238, "texto": { "en": "Your own agent can work on the pattern open in Vina.", "es": "Tu propio agente puede trabajar en el patrón abierto en Vina." } },
  { "fecha": "2026-10-09", "pr": 1239, "texto": { "en": "The panels moved onto paper: one slot on the right, properties in two levels, the avatar in seven fields.", "es": "Los paneles pasaron al papel: una ranura a la derecha, propiedades en dos niveles, el avatar en siete campos." } },
  { "fecha": "2026-10-06", "pr": 1235, "texto": { "en": "A seam fix: the sleeve cap splits where each half measures its armhole.", "es": "Un arreglo de costura: la copa se parte donde cada mitad mide lo que su sisa." } },
  { "fecha": "2026-10-05", "pr": 1233, "texto": { "en": "The piece's cabin: a strip of four tools and one dimension at a time.", "es": "La cabina de la pieza: una barrita de cuatro herramientas y una cota a la vez." } },
  { "fecha": "2026-07-10", "pr": 934, "texto": { "en": "Real sewing on the avatar: a shirt forms and drapes for the first time.", "es": "Costura real sobre el avatar: una camisa se forma y cae por primera vez." } }
]
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/repo/home-honestidad.test.ts`
Expected: PASS, 1 fichero, todos los `it` en verde (el de ROADMAP acepta `#next` porque `## Next` ya existe).

- [ ] **Step 5: Commit**

```bash
git add home/datos tests/repo/home-honestidad.test.ts
git commit -m "feat(home): los datos de la honestidad, con prueba en el código y en el historial"
```

---

### Task 2: El patrón del hero en dos idiomas

**Files:**
- Modify: `scripts/home/dxf-a-svg.mjs`
- Create: `home/img/patron.en.svg`, `home/img/patron.es.svg` (generados); Delete: `home/img/patron.svg`
- Modify: `tests/repo/home-patron.test.ts`, `.gitattributes`

**Interfaces:**
- Produces: `generarPatronSvg(dxfTexto, idioma: 'en' | 'es') → { svg, dobladilloMm }`; ficheros `home/img/patron.<idioma>.svg`. Los incluye la plantilla de Task 3 con `<!-- incluir: home/img/patron.{{idioma}}.svg -->`.

- [ ] **Step 1: Ajustar el test para que exija los dos idiomas**

Sustituir `tests/repo/home-patron.test.ts` entero por:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sin tipos
import { generarPatronSvg } from '../../scripts/home/dxf-a-svg.mjs';

const dxf = readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8');
const ROTULOS = {
  en: { delantero: 'FRONT · ×1', manga: 'SLEEVE · ×2', cota: 'mm · hem', aria: 'The front and the sleeve of a T-shirt pattern' },
  es: { delantero: 'DELANTERO · ×1', manga: 'MANGA · ×2', cota: 'mm · dobladillo', aria: 'El delantero y la manga del patrón de una camiseta' },
} as const;

describe.each(['en', 'es'] as const)('patrón del hero (%s)', (idioma) => {
  const { svg, dobladilloMm } = generarPatronSvg(dxf, idioma);
  const r = ROTULOS[idioma];
  it('el fichero commiteado es exactamente lo que genera el script (determinista y al día)', () => {
    expect(readFileSync(`home/img/patron.${idioma}.svg`, 'utf8')).toBe(svg);
  });
  it('caja de 720×540', () => expect(svg).toMatch(/viewBox="0 0 720 540"/));
  it('dos piezas: delantero y una manga, rotuladas en su idioma', () => {
    expect(svg.match(/class="pieza"/g)).toHaveLength(2);
    expect(svg).toContain(r.delantero);
    expect(svg).toContain(r.manga);
  });
  it('rótulos que los datos no sostienen, fuera', () => {
    for (const falso of ['DOBLEZ', 'CAMISA', 'T38', 'pinza', 'FOLD']) expect(svg).not.toContain(falso);
  });
  it('elige el delantero por el escote más hondo (SAMUEL-5)', () => expect(svg).toContain('data-pieza="PATRONES PARA SAMUEL-5"'));
  it('la cota es la medida real del dobladillo del delantero', () => {
    expect(dobladilloMm).toBe(520);
    expect(svg).toContain(`${dobladilloMm} ${r.cota}`);
    expect(svg).not.toContain('328 mm');
  });
  it('el rótulo del archivo sale del DXF y no se traduce', () => expect(svg).toContain('PATRONES PARA SAMUEL · AAMA · mm'));
  it('la descripción accesible va en su idioma', () => expect(svg).toMatch(new RegExp(`aria-label="${r.aria}`)));
  it('sin colores literales', () => expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|fill="(?!none)|stroke="(?!none)/));
  it('cabe en su caja', () => {
    const nums = [...svg.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(720); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(540); }
  });
});

it('un idioma que no existe revienta en vez de salir mudo', () => {
  // @ts-expect-error — a propósito
  expect(() => generarPatronSvg(dxf, 'de')).toThrow(/idioma/);
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/repo/home-patron.test.ts`
Expected: FAIL en «el fichero commiteado…» (`ENOENT home/img/patron.en.svg`) y en los rótulos en inglés.

- [ ] **Step 3: Enseñarle el idioma al script**

En `scripts/home/dxf-a-svg.mjs`:

1. Debajo de `const f = …` añadir:

```js
const ROTULOS = {
  en: { delantero: 'FRONT · ×1', manga: 'SLEEVE · ×2', cota: 'hem',
        aria: (mm) => `The front and the sleeve of a T-shirt pattern, drawn in ink, with the hem measurement: ${mm} millimetres` },
  es: { delantero: 'DELANTERO · ×1', manga: 'MANGA · ×2', cota: 'dobladillo',
        aria: (mm) => `El delantero y la manga del patrón de una camiseta, trazados en tinta, con la medida del dobladillo: ${mm} milímetros` },
};
```

2. Cambiar la firma `export function generarPatronSvg(dxfTexto) {` por:

```js
export function generarPatronSvg(dxfTexto, idioma) {
  const r = ROTULOS[idioma];
  if (!r) throw new Error(`idioma desconocido: ${idioma} (en | es)`);
```

3. En el array del SVG, sustituir las cuatro cadenas rotuladas:
   - `aria-label="El delantero y la manga del patrón de una camiseta, trazados en tinta, con la medida del dobladillo: ${dobladilloMm} milímetros"` → `aria-label="${r.aria(dobladilloMm)}"`
   - `>DELANTERO · ×1</text>` → `>${r.delantero}</text>`
   - `>MANGA · ×2</text>` → `>${r.manga}</text>`
   - `${dobladilloMm} mm · dobladillo</text></g>` → `${dobladilloMm} mm · ${r.cota}</text></g>`

4. Sustituir el bloque `if (process.argv[1] …)` del final por:

```js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dxf = readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8');
  for (const idioma of ['en', 'es']) {
    const { svg, dobladilloMm } = generarPatronSvg(dxf, idioma);
    writeFileSync(`home/img/patron.${idioma}.svg`, svg);
    console.log(`home/img/patron.${idioma}.svg · ${dobladilloMm} mm`);
  }
}
```

5. En el comentario de cabecera, `home/img/patron.svg` → `home/img/patron.{en,es}.svg`.

- [ ] **Step 4: Generar los dos SVG y borrar el viejo**

Run: `npm run home:patron && git rm -q home/img/patron.svg && ls home/img/patron.*.svg`
Expected: dos líneas `home/img/patron.en.svg · 520 mm` y `…es.svg · 520 mm`; `ls` lista los dos ficheros.

- [ ] **Step 5: `.gitattributes`**

Sustituir la línea `home/img/patron.svg text eol=lf` por `home/img/patron.*.svg text eol=lf` (la regla `home/img/*.svg` de abajo ya los cubre; se deja la línea por el comentario que la explica).

- [ ] **Step 6: Verlo pasar**

Run: `npx vitest run tests/repo/home-patron.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 7: Commit**

```bash
git add scripts/home/dxf-a-svg.mjs home/img/patron.en.svg home/img/patron.es.svg tests/repo/home-patron.test.ts .gitattributes
git commit -m "feat(home): el patrón del hero se rotula en inglés y en español"
```

(`index.html` todavía incluye `patron.svg`, que ya no existe: el build queda roto hasta Task 3, a propósito. No se despliega entre tareas.)

---

### Task 3: Copy, plantilla y generador de las dos páginas

**Files:**
- Create: `home/copy/en.json`, `home/copy/es.json`, `home/plantilla.html`, `scripts/home/paginas.mjs`, `es/index.html`
- Modify: `index.html` (pasa a ser generado), `vite.config.ts`, `.gitattributes`, `public/sitemap.xml`, `package.json` (script `home:paginas`)
- Test: `tests/repo/home-paginas.test.ts`

**Interfaces:**
- Consumes: `home/datos/*.json` (Task 1), `home/img/patron.<idioma>.svg` (Task 2).
- Produces: `generarPagina(idioma) → string` y `PAGINAS` en `scripts/home/paginas.mjs`; `node scripts/home/paginas.mjs` escribe los dos HTML; `--check` sale con 1 si difieren. Clases y `id` que usan Task 4 (CSS) y Task 5 (e2e): `.idioma`, `#today`, `#making`, `#how`, `#send`, `.lista`, `.diario`, `.fecha`, `.btn-oferta`, `.fig-ajuste`, `img.fig-02`, `section.cierre`.

- [ ] **Step 1: El test que falla**

`tests/repo/home-paginas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sin tipos
import { generarPagina, PAGINAS } from '../../scripts/home/paginas.mjs';

const en = JSON.parse(readFileSync('home/copy/en.json', 'utf8')) as Record<string, string>;
const es = JSON.parse(readFileSync('home/copy/es.json', 'utf8')) as Record<string, string>;

describe('el copy de la home', () => {
  it('los dos idiomas tienen exactamente las mismas claves', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('sin exclamaciones ni «AI-powered»', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(v, k).not.toMatch(/[!¡]/);
      expect(v.toLowerCase(), k).not.toContain('ai-powered');
    }
  });
  it('el H1 y la descripción son los del spec', () => {
    expect(en.h1).toBe('Draft the pattern, watch it drape.');
    expect(es.h1).toBe('Traza el patrón, mira la caída.');
    for (const d of [en.descripcion, es.descripcion]) {
      expect([...d].length).toBeGreaterThanOrEqual(120);
      expect([...d].length).toBeLessThanOrEqual(150);
    }
  });
});

describe.each(Object.keys(PAGINAS) as ('en' | 'es')[])('la página %s', (idioma) => {
  const html = generarPagina(idioma);
  const salida = (PAGINAS as Record<string, { salida: string; raiz: string; url: string }>)[idioma];
  it('el fichero commiteado es el generado', () => expect(readFileSync(salida.salida, 'utf8')).toBe(html));
  it('no queda ninguna marca sin sustituir', () => expect(html).not.toMatch(/\{\{[#/]?\w+\}\}/));
  it('lleva su lang, su canonical y las tres alternativas', () => {
    expect(html).toContain(`<html lang="${idioma}">`);
    expect(html).toContain(`<link rel="canonical" href="${salida.url}">`);
    expect(html).toContain('hreflang="en" href="https://vina.sdar.dev/"');
    expect(html).toContain('hreflang="es" href="https://vina.sdar.dev/es/"');
    expect(html).toContain('hreflang="x-default" href="https://vina.sdar.dev/"');
  });
  it('incluye el SVG de su idioma y los activos con la raíz correcta', () => {
    expect(html).toContain(`<!-- incluir: home/img/patron.${idioma}.svg -->`);
    expect(html).toContain(`href="${salida.raiz}home/home.css"`);
    expect(html).toContain(`src="${salida.raiz}home/img/logo.svg"`);
    expect(html).not.toContain(idioma === 'es' ? 'src="./home/' : 'src="../home/');
  });
  it('los dos botones de oferta abren el correo con el asunto', () => {
    const asunto = idioma === 'en' ? 'A%20pattern%20for%20Vina' : 'Un%20patr%C3%B3n%20para%20Vina';
    expect(html.match(new RegExp(`href="mailto:vina@sdar\\.dev\\?subject=${asunto}"`, 'g'))).toHaveLength(2);
  });
  it('tiene los cuatro bloques y las listas enteras', () => {
    for (const id of ['today', 'making', 'how', 'send']) expect(html).toContain(`<section id="${id}"`);
    expect(html.match(/<li class="falta">/g)).toHaveLength(6);
    expect(html.match(/<li class="entrada">/g)).toHaveLength(5);
    expect(html.match(/<div class="fila">/g)).toHaveLength(3);
  });
  it('cada enlace de las listas tiene nombre completo para el lector de pantalla', () => {
    const enlaces = [...html.matchAll(/<a class="mono" href="[^"]+" aria-label="([^"]+)">([^<]+)<\/a>/g)];
    expect(enlaces).toHaveLength(11);
    for (const [, nombre, visible] of enlaces) {
      expect(nombre, visible).toContain(visible);
      expect(nombre.length, visible).toBeGreaterThan(visible.length + 10);
    }
  });
  it('un solo script, el JSON-LD, en su idioma', () => {
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain(`"inLanguage":"${idioma}"`);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/repo/home-paginas.test.ts`
Expected: FAIL, `Cannot find module '../../scripts/home/paginas.mjs'`.

- [ ] **Step 3: El copy**

`home/copy/en.json`:

```json
{
  "titulo": "Vina — Pattern making and 3D simulation in the browser",
  "descripcion": "A pattern-making CAD that opens in the browser: editable 2D pattern, real-time cloth on an avatar, and a copilot. Free, open source, in the making.",
  "ogDescripcion": "Draft the pattern, watch it drape. A pattern-making CAD in the browser, free and open source.",
  "saltar": "Skip to content",
  "navPrincipal": "Main",
  "navPie": "Footer",
  "navHoy": "Today",
  "navFalta": "In the making",
  "navComo": "How it's made",
  "navEnvia": "Send a pattern",
  "idiomaOtro": "Español",
  "idiomaOtroCodigo": "es",
  "abrir": "Open Vina",
  "h1": "Draft the pattern, watch it drape.",
  "entradilla": "Vina is a pattern-making CAD that opens in the browser: an editable 2D pattern, fabric simulated in real time on an avatar, and a copilot that knows a dart from a notch.",
  "enviar": "Send a pattern",
  "asunto": "A%20pattern%20for%20Vina",
  "condiciones": "Free · Open source · No account · In the making",
  "posterAlt": "The T-shirt's fabric falling onto the avatar in the 3D viewer",
  "simulando": "Simulating · ",
  "hoyEyebrow": "Fig 0.1 · The workshop",
  "hoyH2": "What it does today",
  "hoyIntro": "A paper canvas with your pattern, a 3D viewer with the avatar, and the usual tools in the usual order. The interface speaks Spanish for now.",
  "fig01Alt": "Vina's 2D canvas with a T-shirt pattern and one piece selected, showing its dimension",
  "fig01Pie": "A real pattern imported from a DXF · the selected piece with its dimension",
  "fig01Dispositivo": "Chromium · 1600 × 1000",
  "fig02Alt": "The avatar wearing the T-shirt in the 3D viewer, with the fit map on",
  "fig02Pie": "The fit map on the avatar · tighter in red, looser in blue",
  "fig02Rotulo": "Fig 0.2",
  "faltaEyebrow": "In the making",
  "faltaH2": "What isn't there yet",
  "faltaIntro": "You'd find it in the workshop anyway. Better to read it here first.",
  "comoEyebrow": "How it's made",
  "comoH2": "In the open, one decision at a time",
  "comoIntro": "Each change starts as a written design, gets a review, and lands with its tests. The specs, the research and the mistakes are in the repository, so the history tells itself.",
  "diarioRotulo": "From the workshop diary",
  "verCodigo": "See the code",
  "leerNotas": "Read the design notes",
  "enviaEyebrow": "Send a pattern",
  "enviaH2": "Bring your pattern, I'll drape it",
  "enviaIntro": "Email me a DXF. I'll return it sewn and draped in Vina, with its fit map, and I'll tell you where Vina fell short. Every pattern that comes in is a test the workshop hasn't passed yet. A few each month, in the order they arrive.",
  "enviaCondiciones": "vina@sdar.dev · DXF-AAMA or DXF-ASTM · I read and reply myself",
  "pie": "© 2026 Vina · Pattern making and 3D simulation in the browser"
}
```

`home/copy/es.json`:

```json
{
  "titulo": "Vina — Patronaje y simulación 3D en el navegador",
  "descripcion": "CAD de patronaje en el navegador: patrón 2D editable, tela simulada en tiempo real y un copiloto que entiende de costuras. Gratis y de código abierto.",
  "ogDescripcion": "Traza el patrón, mira la caída. Un CAD de patronaje en el navegador, gratis y de código abierto.",
  "saltar": "Saltar al contenido",
  "navPrincipal": "Principal",
  "navPie": "Pie",
  "navHoy": "Hoy",
  "navFalta": "En construcción",
  "navComo": "Cómo se hace",
  "navEnvia": "Envía un patrón",
  "idiomaOtro": "English",
  "idiomaOtroCodigo": "en",
  "abrir": "Abrir Vina",
  "h1": "Traza el patrón, mira la caída.",
  "entradilla": "Vina es un CAD de patronaje que se abre en el navegador: patrón 2D editable, tela simulada en tiempo real sobre un avatar y un copiloto que distingue una pinza de un piquete.",
  "enviar": "Enviar un patrón",
  "asunto": "Un%20patr%C3%B3n%20para%20Vina",
  "condiciones": "Gratis · Código abierto · Sin cuenta · En construcción",
  "posterAlt": "La tela de la camiseta cayendo sobre el avatar en el visor 3D",
  "simulando": "Simulando · ",
  "hoyEyebrow": "Fig 0.1 · El taller",
  "hoyH2": "Lo que hace hoy",
  "hoyIntro": "Un lienzo de papel con tu patrón, un visor 3D con el avatar y las herramientas de siempre en el orden de siempre.",
  "fig01Alt": "El lienzo 2D de Vina con el patrón de una camiseta y una pieza seleccionada con su cota",
  "fig01Pie": "Patrón real importado de un DXF · pieza seleccionada con su cota",
  "fig01Dispositivo": "Chromium · 1600 × 1000",
  "fig02Alt": "El avatar con la camiseta puesta en el visor 3D, con el mapa de ajuste activo",
  "fig02Pie": "El mapa de ajuste sobre el avatar · más tenso en rojo, más suelto en azul",
  "fig02Rotulo": "Fig 0.2",
  "faltaEyebrow": "En construcción",
  "faltaH2": "Lo que todavía no está",
  "faltaIntro": "Lo encontrarías en el taller de todas formas. Mejor leerlo aquí primero.",
  "comoEyebrow": "Cómo se hace",
  "comoH2": "En abierto, una decisión a la vez",
  "comoIntro": "Cada cambio empieza como un diseño escrito, pasa por revisión y entra con sus pruebas. Los specs, la investigación y los errores están en el repositorio, así que la historia se cuenta sola.",
  "diarioRotulo": "Del diario del taller",
  "verCodigo": "Ver el código",
  "leerNotas": "Leer las notas de diseño",
  "enviaEyebrow": "Envía un patrón",
  "enviaH2": "Trae tu patrón, yo lo visto",
  "enviaIntro": "Mándame un DXF por correo. Te lo devuelvo cosido y caído en Vina, con su mapa de ajuste, y te digo dónde Vina se quedó corta. Cada patrón que llega es una prueba que el taller todavía no ha pasado. Unos pocos al mes, en el orden en que llegan.",
  "enviaCondiciones": "vina@sdar.dev · DXF-AAMA o DXF-ASTM · leo y respondo yo mismo",
  "pie": "© 2026 Vina · Patronaje y simulación 3D en el navegador"
}
```

- [ ] **Step 4: La plantilla**

`home/plantilla.html` (las marcas `{{x}}` las llena `paginas.mjs`; `{{#lista}}…{{/lista}}` se repite por entrada; `{{raiz}}` es `./` o `../`; `WebGPU` lleva `lang="en"` solo cuando la página no es inglesa, por eso `{{webgpu}}`):

```html
<!doctype html>
<!-- Generado por scripts/home/paginas.mjs desde home/plantilla.html, home/copy/{{idioma}}.json y home/datos/. No editar a mano. -->
<html lang="{{idioma}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{titulo}}</title>
  <meta name="description" content="{{descripcion}}">
  <link rel="canonical" href="{{url}}">
  <link rel="alternate" hreflang="en" href="https://vina.sdar.dev/">
  <link rel="alternate" hreflang="es" href="https://vina.sdar.dev/es/">
  <link rel="alternate" hreflang="x-default" href="https://vina.sdar.dev/">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{{url}}">
  <meta property="og:title" content="{{titulo}}">
  <meta property="og:description" content="{{ogDescripcion}}">
  <meta property="og:image" content="https://vina.sdar.dev/{{ogImagen}}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="{{ogLocale}}">
  <meta property="og:locale:alternate" content="{{ogLocaleOtro}}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="{{raiz}}home/fonts/inter-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="{{raiz}}home/tokens.css">
  <link rel="stylesheet" href="{{raiz}}home/home.css">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebApplication","name":"Vina","url":"{{url}}",
   "applicationCategory":"DesignApplication","operatingSystem":"Web","inLanguage":"{{idioma}}",
   "offers":{"@type":"Offer","price":0,"priceCurrency":"USD"},"isAccessibleForFree":true,
   "license":"https://opensource.org/licenses/MIT","sameAs":["https://github.com/sssamuelll/vina"]}
  </script>
</head>
<body>
<a class="saltar" href="#contenido">{{saltar}}</a>
<header class="cabecera"><div class="wrap">
  <a href="{{url}}" class="marca"><img class="logo" src="{{raiz}}home/img/logo.svg" alt="Vina" width="48" height="28"></a>
  <nav aria-label="{{navPrincipal}}">
    <a href="#today">{{navHoy}}</a><a href="#making">{{navFalta}}</a><a href="#how">{{navComo}}</a><a href="#send">{{navEnvia}}</a>
    <a class="idioma" href="{{otraUrl}}" hreflang="{{idiomaOtroCodigo}}" lang="{{idiomaOtroCodigo}}">{{idiomaOtro}}</a>
    <a class="pill" href="/app/">{{abrir}}</a>
  </nav>
</div></header>

<main id="contenido">
<section class="hero"><div class="wrap">
  <div class="texto">
    <h1>{{h1}}</h1>
    <p class="lead">{{entradilla}}</p>
    <div class="cta"><a class="btn btn-primario" href="/app/">{{abrir}}</a><a class="btn btn-contorno btn-oferta" href="mailto:vina@sdar.dev?subject={{asunto}}">{{enviar}}</a></div>
    <p class="meta mono">{{condiciones}}</p>
  </div>
  <div class="hero-visor">
    <img class="visor-poster" src="{{raiz}}home/img/caida-poster.webp" alt="{{posterAlt}}" width="520" height="300" decoding="async">
    <p class="indicador mono"><i aria-hidden="true"></i>{{simulando}}{{webgpu}}</p>
  </div>
  <div class="hero-patron"><!-- incluir: home/img/patron.{{idioma}}.svg --></div>
</div></section>

<section id="today"><div class="wrap">
  <p class="eyebrow mono">{{hoyEyebrow}}</p>
  <h2>{{hoyH2}}</h2>
  <p class="intro">{{hoyIntro}}</p>
  <figure class="fig"><picture>
    <source media="(max-width: 720px)" srcset="{{raiz}}home/img/fig-01-movil.webp">
    <img class="fig-01" src="{{raiz}}home/img/fig-01@1x.webp" srcset="{{raiz}}home/img/fig-01@1x.webp 1x, {{raiz}}home/img/fig-01@2x.webp 2x" alt="{{fig01Alt}}" width="1280" height="620" loading="lazy" decoding="async">
  </picture><figcaption class="figcap mono"><span>{{fig01Pie}}</span><span>{{fig01Dispositivo}}</span></figcaption></figure>
  <div class="cols">
{{#columnas}}    <div><h3>{{titulo}}</h3><p>{{texto}}</p></div>
{{/columnas}}  </div>
  <figure class="fig fig-ajuste"><picture>
    <source media="(max-width: 720px)" srcset="{{raiz}}home/img/fig-02-movil.webp">
    <img class="fig-02" src="{{raiz}}home/img/fig-02@1x.webp" srcset="{{raiz}}home/img/fig-02@1x.webp 1x, {{raiz}}home/img/fig-02@2x.webp 2x" alt="{{fig02Alt}}" width="1280" height="560" loading="lazy" decoding="async">
  </picture><figcaption class="figcap mono"><span>{{fig02Pie}}</span><span>{{fig02Rotulo}}</span></figcaption></figure>
  <dl class="filas">
{{#filas}}    <div class="fila"><dt>{{titulo}}</dt><dd class="{{clase}}">{{texto}}</dd></div>
{{/filas}}  </dl>
</div></section>

<section id="making"><div class="wrap">
  <p class="eyebrow mono">{{faltaEyebrow}}</p>
  <h2>{{faltaH2}}</h2>
  <p class="intro">{{faltaIntro}}</p>
  <ul class="lista">
{{#enConstruccion}}    <li class="falta"><span>{{texto}}</span><a class="mono" href="{{enlace}}" aria-label="{{rotulo}} · {{texto}}">{{rotulo}}</a></li>
{{/enConstruccion}}  </ul>
</div></section>

<section id="how"><div class="wrap">
  <p class="eyebrow mono">{{comoEyebrow}}</p>
  <h2>{{comoH2}}</h2>
  <p class="intro">{{comoIntro}}</p>
  <p class="rotulo-lista mono">{{diarioRotulo}}</p>
  <ul class="lista diario">
{{#diario}}    <li class="entrada"><span class="fecha mono">{{fecha}}</span><span>{{texto}}</span><a class="mono" href="https://github.com/sssamuelll/vina/pull/{{pr}}" aria-label="PR #{{pr}} · {{texto}}">#{{pr}}</a></li>
{{/diario}}  </ul>
</div></section>

<section class="cierre" aria-label="{{verCodigo}}"><div class="wrap">
  <p class="repo mono">github.com/sssamuelll/vina · <em>MIT</em> · v%VITE_VINA_VERSION%</p>
  <div class="cta"><a class="btn btn-primario" href="https://github.com/sssamuelll/vina">{{verCodigo}}</a><a class="btn btn-contorno" href="https://github.com/sssamuelll/vina/tree/main/docs/superpowers/specs">{{leerNotas}}</a></div>
</div></section>

<section id="send" class="formatos"><div class="wrap">
  <p class="eyebrow mono">{{enviaEyebrow}}</p>
  <h2>{{enviaH2}}</h2>
  <p class="intro">{{enviaIntro}}</p>
  <div class="cta"><a class="btn btn-primario btn-oferta" href="mailto:vina@sdar.dev?subject={{asunto}}">{{enviar}}</a></div>
  <p class="meta mono">{{enviaCondiciones}}</p>
</div></section>
</main>

<footer class="pie"><div class="wrap">
  <span>{{pie}}</span>
  <nav aria-label="{{navPie}}"><a href="#today">{{navHoy}}</a><a href="#making">{{navFalta}}</a><a href="#how">{{navComo}}</a><a href="#send">{{navEnvia}}</a><a class="idioma" href="{{otraUrl}}" hreflang="{{idiomaOtroCodigo}}" lang="{{idiomaOtroCodigo}}">{{idiomaOtro}}</a></nav>
</div></footer>
</body>
</html>
```

- [ ] **Step 5: El generador**

`scripts/home/paginas.mjs`:

```js
#!/usr/bin/env node
/**
 * Las dos páginas de la home desde una plantilla, el copy de cada idioma y los datos
 * de home/datos/ (spec 2026-10-10 § 6.2). Los HTML se commitean; `--check` sale con 1
 * si difieren de lo generado (tests/repo/home-paginas.test.ts lo exige).
 *   node scripts/home/paginas.mjs            # escribe index.html y es/index.html
 *   node scripts/home/paginas.mjs --check    # solo compara
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const json = (rel) => JSON.parse(leer(rel));

export const PAGINAS = {
  en: { salida: 'index.html', raiz: './', url: 'https://vina.sdar.dev/', ogImagen: 'og.png', ogLocale: 'en_US' },
  es: { salida: 'es/index.html', raiz: '../', url: 'https://vina.sdar.dev/es/', ogImagen: 'og-es.png', ogLocale: 'es_VE' },
};

/** En una lista, `{{k}}` es `d[k][idioma]` si el dato es bilingüe, y `d[k]` si no. */
function valor(d, k, idioma) {
  if (!(k in d)) throw new Error(`la lista no tiene la clave «${k}»`);
  const v = d[k];
  return v && typeof v === 'object' && idioma in v ? v[idioma] : String(v);
}

export function generarPagina(idioma) {
  const p = PAGINAS[idioma];
  if (!p) throw new Error(`idioma desconocido: ${idioma}`);
  const otro = idioma === 'en' ? 'es' : 'en';
  const copy = json(`home/copy/${idioma}.json`);
  const hoy = json('home/datos/hoy.json');
  const listas = {
    columnas: hoy.columnas,
    filas: hoy.filas.map((f) => ({ ...f, clase: f.mono ? 'mono' : 'prosa' })),
    enConstruccion: json('home/datos/en-construccion.json'),
    diario: json('home/datos/diario.json'),
  };
  const vars = {
    ...copy, idioma, raiz: p.raiz, url: p.url, otraUrl: PAGINAS[otro].url,
    ogImagen: p.ogImagen, ogLocale: p.ogLocale, ogLocaleOtro: PAGINAS[otro].ogLocale,
    webgpu: idioma === 'en' ? 'WebGPU' : '<span lang="en">WebGPU</span>',
  };
  let html = leer('home/plantilla.html');
  html = html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, nombre, cuerpo) => {
    const datos = listas[nombre];
    if (!datos) throw new Error(`lista desconocida en la plantilla: ${nombre}`);
    return datos.map((d) => cuerpo.replace(/\{\{(\w+)\}\}/g, (_m, k) => valor(d, k, idioma))).join('');
  });
  html = html.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    if (!(k in vars)) throw new Error(`marca sin valor en el copy ${idioma}: ${k}`);
    return vars[k];
  });
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let desactualizados = 0;
  for (const [idioma, p] of Object.entries(PAGINAS)) {
    const html = generarPagina(idioma);
    const destino = path.join(REPO, p.salida);
    if (check) {
      if (!existsSync(destino) || readFileSync(destino, 'utf8') !== html) { console.error(`✗ ${p.salida} no es lo que genera la plantilla`); desactualizados++; }
      else console.log(`✓ ${p.salida} al día`);
    } else {
      mkdirSync(path.dirname(destino), { recursive: true });
      writeFileSync(destino, html);
      console.log(`✓ ${p.salida} · ${html.length} B`);
    }
  }
  if (desactualizados) { console.error('Corre: node scripts/home/paginas.mjs'); process.exit(1); }
}
```

- [ ] **Step 6: Generar, cablear Vite, el sitemap, `.gitattributes` y el script npm**

Run: `node scripts/home/paginas.mjs`
Expected: `✓ index.html · <n> B` y `✓ es/index.html · <n> B`; `git status` muestra `index.html` modificado y `es/index.html` nuevo.

`vite.config.ts`, en `input`, añadir tras `app:`:

```ts
        es: fileURLToPath(new URL('./es/index.html', import.meta.url)),
```

`.gitattributes`, debajo de `app/index.html text eol=lf`:

```
es/index.html text eol=lf
home/copy/*.json text eol=lf
home/datos/*.json text eol=lf
```

(`home/*.html` ya cubre la plantilla.)

`public/sitemap.xml` entero:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>https://vina.sdar.dev/</loc><xhtml:link rel="alternate" hreflang="en" href="https://vina.sdar.dev/"/><xhtml:link rel="alternate" hreflang="es" href="https://vina.sdar.dev/es/"/><xhtml:link rel="alternate" hreflang="x-default" href="https://vina.sdar.dev/"/></url>
<url><loc>https://vina.sdar.dev/es/</loc><xhtml:link rel="alternate" hreflang="en" href="https://vina.sdar.dev/"/><xhtml:link rel="alternate" hreflang="es" href="https://vina.sdar.dev/es/"/><xhtml:link rel="alternate" hreflang="x-default" href="https://vina.sdar.dev/"/></url>
</urlset>
```

`package.json`, en `scripts`, junto a `home:patron`:

```json
    "home:paginas": "node scripts/home/paginas.mjs",
```

- [ ] **Step 7: Verlo pasar y que el build salga**

Run: `npx vitest run tests/repo/home-paginas.test.ts tests/repo/home-tokens.test.ts && npm run build 2>&1 | tail -5 && ls dist/index.html dist/es/index.html && grep -c "<script" dist/index.html dist/es/index.html`
Expected: los dos tests en verde (el de tokens sigue leyendo `index.html` y encuentra solo `var(--font-…)`); el build termina con `✓ built in …`; existen los dos HTML; `grep -c` da `1` en cada uno (el JSON-LD).

- [ ] **Step 8: Mirar las dos páginas antes de seguir**

Run: `npx vite preview --port 4179 --strictPort & sleep 3; node -e "const {chromium}=require('playwright');const os=require('os'),path=require('path');(async()=>{const b=await chromium.launch();for(const [n,u] of [['en','/'],['es','/es/']]){const p=await b.newPage({viewport:{width:1366,height:768}});await p.goto('http://localhost:4179'+u,{waitUntil:'networkidle'});const f=path.join(os.tmpdir(),'home-'+n+'.png');await p.screenshot({path:f,fullPage:true});console.log(n,f,await p.title(),await p.evaluate(()=>getComputedStyle(document.body).backgroundColor))}await b.close()})()"; kill %1`
Expected: `en <ruta> Vina — Pattern making … rgb(244, 239, 230)` y `es <ruta> Vina — Patronaje … rgb(244, 239, 230)`. Abrir las dos rutas impresas con Read: los bloques nuevos salen sin estilo propio todavía (listas con viñetas por defecto); eso lo arregla Task 4. Lo que sí tiene que estar bien ya: el patrón con `FRONT · ×1` en la inglesa, las imágenes cargadas en la española.

- [ ] **Step 9: Commit**

```bash
git add home/copy home/plantilla.html scripts/home/paginas.mjs tests/repo/home-paginas.test.ts index.html es/index.html vite.config.ts .gitattributes public/sitemap.xml package.json
git commit -m "feat(home): la home en inglés en / y en español en /es/, generadas de una plantilla"
```

---

### Task 4: Los estilos de los bloques nuevos

**Files:**
- Modify: `home/home.css`

**Interfaces:**
- Consumes: las clases de la plantilla (Task 3).
- Produces: nada que consuma otra tarea; Task 5 mide el resultado.

- [ ] **Step 1: El test que vigila el CSS ya existe; comprobar que está verde antes de tocar**

Run: `npx vitest run tests/repo/home-tokens.test.ts`
Expected: PASS.

- [ ] **Step 2: Añadir los estilos**

En `home/home.css`:

1. Sustituir el bloque `/* Formatos */` entero por:

```css
/* Filas con rótulo (formatos y copiloto) y la banda hundida (la oferta) */
.formatos { background: var(--papel-hundido); }
.filas { margin-top: 40px; }
.fila { display: grid; grid-template-columns: 120px 1fr; column-gap: 24px; padding: 18px 0; border-top: 1px solid var(--hairline); font-size: 14px; }
.fila:last-child { border-bottom: 1px solid var(--hairline); }
.fila dt { font-weight: 500; color: var(--tinta); }
.fila dd { margin: 0; color: var(--tinta-70); }
.fila dd.prosa { font-size: 15px; max-width: 640px; }
.fig-ajuste { margin-top: 56px; }

/* Listas con línea de pelo: lo que falta y el diario. El enlace va a la derecha,
 * en mono y en señal; en móvil se apila bajo la frase. */
.rotulo-lista { margin-top: 40px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--tinta-70); font-weight: 500; }
.lista { margin-top: 20px; list-style: none; border-top: 1px solid var(--hairline); max-width: 860px; }
.lista li { display: grid; grid-template-columns: 1fr auto; column-gap: 24px; align-items: baseline; padding: 16px 0; border-bottom: 1px solid var(--hairline); font-size: 16px; }
.lista a { display: inline-flex; align-items: center; min-height: 24px; font-size: 13px; color: var(--senal-texto); }
.lista a:focus-visible, .lista a:hover { color: var(--tinta); }
.diario li { grid-template-columns: 104px 1fr auto; }
.fecha { font-size: 13px; color: var(--tinta-70); }
#making .lista { margin-top: 36px; }
#send .meta { margin-top: 18px; }
```

2. Sustituir el bloque `/* Código (sección oscura) */` por:

```css
/* Cierre (sección oscura): el repo y las dos puertas al código */
.cierre { background: var(--tinta); color: var(--papel); padding: 56px 0; }
.cierre .btn-primario { background: var(--papel); color: var(--tinta); }
.cierre .btn-contorno { border-color: color-mix(in srgb, var(--papel) 35%, transparent); color: var(--papel); }
.repo { font-size: 13px; color: var(--papel-60); }
.repo em { font-style: normal; color: var(--papel); background: color-mix(in srgb, var(--oro) 18%, transparent); padding: 2px 6px; }
.cierre .cta { margin-top: 22px; }
```

3. En la regla de móvil (`@media (max-width: 720px)`), sustituir `nav a:not(.pill) { display: none; }` por:

```css
  nav a:not(.pill):not(.idioma) { display: none; }
```

y añadir dentro del mismo bloque:

```css
  .lista li, .diario li { grid-template-columns: 1fr; row-gap: 6px; }
  .fig-ajuste { margin-top: 40px; }
```

4. En `.pie nav { gap: 20px; font-size: 13px; }` no cambia nada; el enlace `.idioma` hereda. En la cabecera, el `.idioma` queda entre los enlaces y la píldora por orden del HTML.

- [ ] **Step 3: Verlo seguir en verde y mirar**

Run: `npx vitest run tests/repo/home-tokens.test.ts && npm run build 2>&1 | tail -2`
Expected: PASS; build ok.

Repetir el Step 8 de Task 3 y mirar las dos capturas: las listas sin viñetas, enlaces en señal a la derecha, la sección oscura con la línea del repo y dos botones, la oferta sobre papel hundido, el enlace de idioma en la cabecera. Si algo se ve mal, se corrige aquí, no en Task 5.

- [ ] **Step 4: Commit**

```bash
git add home/home.css
git commit -m "feat(home): estilos de las listas, el diario, el cierre y la oferta"
```

---

### Task 5: El e2e por idioma y el trinquete de peso por página

**Files:**
- Modify: `tests/e2e/home.spec.ts` (entero), `tests/e2e/home-peso-baseline.json`

**Interfaces:**
- Consumes: las dos páginas construidas (Task 3, Task 4).
- Produces: `home-peso-baseline.json` con una entrada por URL: `{ "/": {...}, "/es/": {...} }`.

- [ ] **Step 1: Sustituir el spec entero**

`tests/e2e/home.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'http://localhost:4179';
const PAGINAS = [
  { url: '/', lang: 'en', titulo: 'Vina — Pattern making and 3D simulation in the browser', h1: 'Draft the pattern, watch it drape.',
    abrir: 'Open Vina', saltar: 'Skip to content', codigo: 'See the code', enviar: 'Send a pattern', idioma: 'Español', otra: '/es/',
    asunto: 'A%20pattern%20for%20Vina', comoH2: 'In the open, one decision at a time' },
  { url: '/es/', lang: 'es', titulo: 'Vina — Patronaje y simulación 3D en el navegador', h1: 'Traza el patrón, mira la caída.',
    abrir: 'Abrir Vina', saltar: 'Saltar al contenido', codigo: 'Ver el código', enviar: 'Enviar un patrón', idioma: 'English', otra: '/',
    asunto: 'Un%20patr%C3%B3n%20para%20Vina', comoH2: 'En abierto, una decisión a la vez' },
] as const;
const datos = (rel: string) => JSON.parse(readFileSync(rel, 'utf8'));
const N_FALTAN = (datos('home/datos/en-construccion.json') as unknown[]).length;
const N_DIARIO = (datos('home/datos/diario.json') as unknown[]).length;

async function cargar(page: Page, url: string) {
  const errores: string[] = [];
  const terceros: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGEN) && !r.url().startsWith('data:')) terceros.push(r.url()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return { errores, terceros };
}

for (const p of PAGINAS) {
  test.describe(`${p.url} a 1366×768`, () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('título, idioma, un solo h1, sin errores ni terceros', async ({ page }) => {
      const { errores, terceros } = await cargar(page, p.url);
      await expect(page).toHaveTitle(p.titulo);
      await expect(page.locator('html')).toHaveAttribute('lang', p.lang);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      expect(errores).toEqual([]);
      expect(terceros).toEqual([]);
    });

    test('las tres alternativas de idioma y el enlace a la otra página', async ({ page }) => {
      await cargar(page, p.url);
      for (const [l, href] of [['en', 'https://vina.sdar.dev/'], ['es', 'https://vina.sdar.dev/es/'], ['x-default', 'https://vina.sdar.dev/']]) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${l}"]`)).toHaveAttribute('href', href);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://vina.sdar.dev${p.url}`);
      const idioma = page.locator('header nav a.idioma');
      await expect(idioma).toHaveText(p.idioma);
      await expect(idioma).toHaveAttribute('href', `https://vina.sdar.dev${p.otra}`);
    });

    test('los «Abrir Vina» llevan al taller y los «Ver el código» al repo', async ({ page }) => {
      await cargar(page, p.url);
      const abrir = page.getByRole('link', { name: p.abrir });
      expect(await abrir.count()).toBeGreaterThanOrEqual(2);
      for (const href of await abrir.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/app/');
      await expect(page.locator('section.cierre').getByRole('link', { name: p.codigo })).toHaveAttribute('href', 'https://github.com/sssamuelll/vina');
      const r = await page.request.get('/app/');
      expect(r.status()).toBe(200);
      expect(await r.text()).toContain('/assets/');
    });

    // Review Focus 2
    test('los dos botones de oferta abren el correo con el asunto', async ({ page }) => {
      await cargar(page, p.url);
      const oferta = page.locator('a.btn-oferta');
      await expect(oferta).toHaveCount(2);
      for (const href of await oferta.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe(`mailto:vina@sdar.dev?subject=${p.asunto}`);
      await expect(oferta.first()).toHaveText(p.enviar);
    });

    // Review Focus 3
    test('cada enlace de las listas tiene nombre completo', async ({ page }) => {
      await cargar(page, p.url);
      const enlaces = page.locator('.lista a');
      await expect(enlaces).toHaveCount(N_FALTAN + N_DIARIO);
      for (const a of await enlaces.all()) {
        const visible = (await a.innerText()).trim();
        const nombre = (await a.getAttribute('aria-label')) ?? '';
        expect(nombre, visible).toContain(visible);
        expect(nombre.length, visible).toBeGreaterThan(visible.length + 10);
      }
    });

    test('regla del pliegue: el patrón entero arriba, el visor asoma', async ({ page }) => {
      await cargar(page, p.url);
      const patron = await page.locator('.hero-patron').boundingBox();
      const visor = await page.locator('.hero-visor').boundingBox();
      expect(patron!.y + patron!.height).toBeLessThanOrEqual(630);
      expect(visor!.y).toBeLessThanOrEqual(470);
      expect(768 - visor!.y).toBeGreaterThanOrEqual(160);
    });

    // Review Focus 5
    test('≤ 520 palabras visibles', async ({ page }) => {
      await cargar(page, p.url);
      const texto = await page.locator('body').innerText();
      expect(texto.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(520);
    });

    test('CLS ≈ 0', async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await cargar(page, p.url);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.01);
    });

    test('axe: WCAG 2.2 AA sin violaciones', async ({ page }) => {
      await cargar(page, p.url);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test('el primer foco es «Saltar al contenido» y todo foco se ve', async ({ page }) => {
      await cargar(page, p.url);
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toHaveText(p.saltar);
      await page.keyboard.press('Tab');
      const outline = await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');
    });

    test('ningún bloque se queda invisible: por ancla y al final de la página', async ({ page }) => {
      await cargar(page, `${p.url}#send`);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
    });

    test('la descripción cabe en el snippet: 120–150 caracteres', async ({ page }) => {
      await cargar(page, p.url);
      const d = (await page.locator('meta[name="description"]').getAttribute('content'))!;
      expect([...d].length).toBeGreaterThanOrEqual(120);
      expect([...d].length).toBeLessThanOrEqual(150);
    });

    test('todo objetivo de puntero mide ≥ 24×24 (§ 7)', async ({ page }) => {
      await cargar(page, p.url);
      const chicos: string[] = [];
      for (const el of await page.locator('a:visible, button:visible').all()) {
        const b = (await el.boundingBox())!;
        if (b.width < 24 || b.height < 24) chicos.push(`${(await el.innerText()).trim()} ${b.width.toFixed(1)}×${b.height.toFixed(1)}`);
      }
      expect(chicos).toEqual([]);
    });

    // Review Focus 1
    test('toda imagen carga y tiene alt', async ({ page }) => {
      const fallidas: string[] = [];
      page.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) fallidas.push(r.url()); });
      await cargar(page, p.url);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');
      expect(fallidas).toEqual([]);
      for (const img of await page.locator('main img').all()) {
        await expect(img).toHaveAttribute('alt', /.+/);
        expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }
      await expect(page.locator('img.fig-01')).toHaveCount(1);
      await expect(page.locator('img.fig-02')).toHaveCount(1);
      await expect(page.locator('img.visor-poster')).toHaveCount(1);
    });

    test.describe('con reducción de movimiento', () => {
      test.use({ contextOptions: { reducedMotion: 'reduce' } });
      test('todo visible sin hacer scroll', async ({ page }) => {
        await cargar(page, p.url);
        for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
      });
    });

    // Review Focus 1: la hoja de estilos llegó (desde /es/ una ruta relativa mal puesta la perdería).
    test.describe('con el sistema en oscuro', () => {
      test.use({ colorScheme: 'dark' });
      test('sigue en papel', async ({ page }) => {
        await cargar(page, p.url);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(244, 239, 230)');
      });
    });
  });

  // Review Focus 4
  test.describe(`${p.url} sin JavaScript`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1366, height: 768 } });
    test('la página se ve entera, listas incluidas', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.locator('h1')).toHaveText(p.h1);
      await expect(page.locator('.hero-patron svg .pieza')).toHaveCount(2);
      await expect(page.locator('#how h2')).toHaveText(p.comoH2);
      await expect(page.locator('#making li')).toHaveCount(N_FALTAN);
      await expect(page.locator('#how li')).toHaveCount(N_DIARIO);
    });
  });

  test.describe(`${p.url} móvil 390×844`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test('orden texto → patrón → visor, sin scroll horizontal, y el idioma sigue a mano', async ({ page }) => {
      const { errores } = await cargar(page, p.url);
      expect(errores).toEqual([]);
      const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
      expect(await y('h1')).toBeLessThan(await y('.hero-patron'));
      expect(await y('.hero-patron')).toBeLessThan(await y('.hero-visor'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expect(page.locator('header nav a:not(.pill):not(.idioma)').first()).toBeHidden();
      await expect(page.locator('header nav a.idioma')).toBeVisible();
    });
  });

  test.describe(`${p.url} tableta 768×1024`, () => {
    test.use({ viewport: { width: 768, height: 1024 } });
    test('el hero se apila: texto → patrón → visor, el patrón ≥ 300 px, sin scroll horizontal', async ({ page }) => {
      await cargar(page, p.url);
      const caja = async (sel: string) => (await page.locator(sel).boundingBox())!;
      expect((await caja('.hero-patron')).width).toBeGreaterThanOrEqual(300);
      expect((await caja('h1')).y).toBeLessThan((await caja('.hero-patron')).y);
      expect((await caja('.hero-patron')).y).toBeLessThan((await caja('.hero-visor')).y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
      const fig = await caja('img.fig-01');
      expect(fig.width / fig.height).toBeCloseTo(1280 / 620, 1);
    });
  });

  test.describe(`${p.url} pantalla de 320 px`, () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('sin scroll horizontal', async ({ page }) => {
      await cargar(page, p.url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
  });
}

const TECHOS = { document: 25_000, stylesheet: 20_000, script: 0, font: 100_000, image: 200_000, media: 0, total: 420_000 };
const BASELINE = 'tests/e2e/home-peso-baseline.json';

for (const p of PAGINAS) {
  test(`trinquete de peso de la carga de ${p.url} a 1366`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const bytes: Record<string, number> = {}; let fuentes = 0;
    const pendientes: Promise<void>[] = [];
    page.on('response', (r) => {
      pendientes.push((async () => {
        const tipo = r.request().resourceType();
        const n = (await r.body().catch(() => Buffer.alloc(0))).length;
        bytes[tipo] = (bytes[tipo] ?? 0) + n;
        if (tipo === 'font') fuentes++;
      })());
    });
    await page.goto(p.url, { waitUntil: 'networkidle' });
    await Promise.all(pendientes);
    const medido = { ...Object.fromEntries(Object.keys(TECHOS).map((k) => [k, bytes[k] ?? 0])), total: Object.values(bytes).reduce((a, b) => a + b, 0) };
    const todo = (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}) as Record<string, Record<string, number>>;
    if (process.env.HOME_PESO_UPDATE === '1') {
      // Solo baja (§ 10.1): subir un valor exige editarlo a mano en el JSON, a la vista del diff.
      const previo = todo[p.url] ?? {};
      todo[p.url] = Object.fromEntries(Object.entries(medido).map(([k, v]) => [k, k in previo ? Math.min(v, previo[k]) : v]));
      writeFileSync(BASELINE, JSON.stringify(todo, null, 2) + '\n');
      return;
    }
    const base = todo[p.url];
    expect(base, `${BASELINE} no tiene entrada para ${p.url}: HOME_PESO_UPDATE=1`).toBeTruthy();
    expect(fuentes).toBeLessThanOrEqual(2);
    for (const [k, techo] of Object.entries(TECHOS)) {
      expect(medido[k], `${k}: ${medido[k]} B`).toBeLessThanOrEqual(Math.min(techo, base[k] ?? techo));
    }
  });
}
```

- [ ] **Step 2: Verlo fallar por lo que tiene que fallar**

Run: `git rm -q tests/e2e/home-peso-baseline.json && npm run build && VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts --reporter=list 2>&1 | tail -25`
Expected: todo en verde salvo los dos trinquetes de peso, que fallan con `home-peso-baseline.json no tiene entrada para /`. (Si algo más falla, es de Task 3 o 4 y se arregla ahí; con el `fig-02` viejo, la prueba de imágenes pasa igual porque mide carga, no contenido.)

- [ ] **Step 3: Fijar la línea base nueva, una por URL**

Run: `HOME_PESO_UPDATE=1 VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts -g "trinquete" --retries=0 --workers=1 && cat tests/e2e/home-peso-baseline.json`
Expected: el JSON con `"/"` y `"/es/"`, cada uno con `script: 0`, `media: 0`, `font ≤ 88660`, `document ≤ 25000`, `total ≤ 420000`. Si `total` pasa de 420 000 o `document` de 25 000, la página se recorta antes de seguir (el techo de palabras lo impide de sobra: ≈ 18 KB de HTML).

- [ ] **Step 4: Verlo pasar entero**

Run: `VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts --reporter=list 2>&1 | tail -5`
Expected: `N passed` sin `failed`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/home.spec.ts tests/e2e/home-peso-baseline.json
git commit -m "test(home): el e2e corre en los dos idiomas y el peso se mide por página"
```

---

### Task 6: `/es/` en el servidor local, el deploy comprueba las dos páginas, los enlaces se verifican

**Files:**
- Modify: `server/rutas.ts`, `server/__tests__/rutas.test.ts`, `scripts/deploy-prod.sh`
- Create: `scripts/home/enlaces.mjs`

**Interfaces:**
- Produces: `node scripts/home/enlaces.mjs` sale con 1 si algún enlace externo de los datos no responde 200 (lo corre el deploy antes de enviar).

- [ ] **Step 1: Los tests de rutas que fallan**

Añadir a `server/__tests__/rutas.test.ts`, dentro del `describe`, y `'es/index.html'` al `Set` de `existe`:

```ts
  it('/es/ es la home en español', () => expect(r('/es/')).toEqual({ tipo: 'archivo', ruta: 'es/index.html' }));
  it('/es sin barra redirige', () => expect(r('/es')).toEqual({ tipo: 'redirigir', a: '/es/' }));
  it('una ruta profunda bajo /es/ es 404 (no es una SPA)', () => expect(r('/es/algo')).toEqual({ tipo: 'no-encontrado' }));
```

Run: `npx vitest run server/__tests__/rutas.test.ts`
Expected: FAIL en `/es sin barra redirige` (hoy devuelve `no-encontrado`); `/es/` pasa solo porque `existe` lo contiene, y `/es/algo` pasa ya. El rojo que importa es la redirección.

- [ ] **Step 2: La regla**

En `server/rutas.ts`, debajo de `if (rel === 'app') return …`:

```ts
  if (rel === 'es') return { tipo: 'redirigir', a: '/es/' };
  if (rel === 'es/') return { tipo: 'archivo', ruta: 'es/index.html' };
```

y en el comentario de la función: «`/` es la home en inglés y `/es/` la española».

Run: `npx vitest run server/__tests__/rutas.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 3: El verificador de enlaces**

`scripts/home/enlaces.mjs`:

```js
#!/usr/bin/env node
/** HEAD a cada enlace externo de home/datos/ (issues, ROADMAP, PRs). Lo corre
 *  scripts/deploy-prod.sh antes de enviar: un 404 público en «En construcción» para el deploy. */
import { readFileSync } from 'node:fs';
const json = (rel) => JSON.parse(readFileSync(rel, 'utf8'));
const urls = new Set([
  ...json('home/datos/en-construccion.json').map((e) => e.enlace),
  ...json('home/datos/diario.json').map((d) => `https://github.com/sssamuelll/vina/pull/${d.pr}`),
  'https://github.com/sssamuelll/vina/tree/main/docs/superpowers/specs',
]);
let rotos = 0;
for (const url of urls) {
  const limpio = url.split('#')[0];
  const r = await fetch(limpio, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  const ok = r && r.status === 200;
  console.log(`${ok ? '✓' : '✗'} ${r ? r.status : 'sin respuesta'} ${url}`);
  if (!ok) rotos++;
}
if (rotos) { console.error(`${rotos} enlace(s) roto(s)`); process.exit(1); }
```

Run: `node scripts/home/enlaces.mjs`
Expected: todas las líneas con `✓ 200`, salida 0. (Pide red. Un `✗` en un issue es un issue cerrado o renumerado: se corrige el dato, no el script.)

- [ ] **Step 4: El deploy**

En `scripts/deploy-prod.sh`:

1. En la sección `── Home ──`, antes de `puerto_libre 4179`, añadir:

```bash
  node scripts/home/paginas.mjs --check || { echo "✗ los HTML de la home no son los generados: node scripts/home/paginas.mjs" >&2; exit 1; }
  node scripts/home/enlaces.mjs || { echo "✗ un enlace público de la home no responde" >&2; exit 1; }
```

2. En `── Verificar ──`, sustituir las tres líneas que van de `CODE=$(curl -s -o /tmp/vina-deploy-home.html …` hasta `|| { echo "✗ $URL no sirve la home" >&2; exit 1; }` por:

```bash
CODE=$(curl -s -o /tmp/vina-deploy-home.html -w "%{http_code}" "$URL")
[ "$CODE" = "200" ] && grep -q "Draft the pattern" /tmp/vina-deploy-home.html \
  || { echo "✗ $URL no sirve la home en inglés" >&2; exit 1; }
CODE=$(curl -s -o /tmp/vina-deploy-home-es.html -w "%{http_code}" "${URL}es/")
[ "$CODE" = "200" ] && grep -q "Traza el patrón" /tmp/vina-deploy-home-es.html \
  || { echo "✗ ${URL}es/ no sirve la home en español" >&2; exit 1; }
```

y la línea final `echo "✓ ${URL}app/ → 200 y sirve $BUNDLE; $URL sirve la home"` por `echo "✓ ${URL}app/ → 200 y sirve $BUNDLE; $URL y ${URL}es/ sirven la home"`.

Run: `bash -n scripts/deploy-prod.sh && grep -n "Draft the pattern\|Traza el patrón\|paginas.mjs --check\|enlaces.mjs" scripts/deploy-prod.sh`
Expected: sin errores de sintaxis; cuatro líneas encontradas.

- [ ] **Step 5: Commit**

```bash
git add server/rutas.ts server/__tests__/rutas.test.ts scripts/home/enlaces.mjs scripts/deploy-prod.sh
git commit -m "feat(home): /es/ en el servidor local, el deploy comprueba las dos páginas y los enlaces públicos"
```

---

### Task 7: README, CONTRIBUTING, ROADMAP y los documentos viejos

**Files:**
- Create: `scripts/home/readme.mjs`
- Modify: `README.md` (entero), `CONTRIBUTING.md:21`, `ROADMAP.md`, `tests/repo/home-honestidad.test.ts`, `docs/superpowers/specs/2026-09-28-homepage-design.md:3`, `package.json`
- Delete: `docs/specs/LANDING-PAGE-SPEC.md`, `docs/specs/LANDING-PAGE-STRUCTURE.md`, `docs/specs/ROADMAP.md`

**Interfaces:**
- Produces: `generarSecciones() → { hoy: string, enConstruccion: string }` y `node scripts/home/readme.mjs [--check]`.

- [ ] **Step 1: El test que falla**

Añadir al final de `tests/repo/home-honestidad.test.ts`:

```ts
describe('el README dice lo mismo que la página', () => {
  it('las dos secciones marcadas son las generadas', () => {
    const md = readFileSync('README.md', 'utf8');
    const secciones = generarSecciones() as Record<string, string>;
    for (const [nombre, [inicio, fin]] of Object.entries(MARCAS as Record<string, [string, string]>)) {
      const dentro = md.split(inicio)[1]?.split(fin)[0];
      expect(dentro, `faltan las marcas ${inicio} … ${fin}`).toBeDefined();
      expect(dentro.trim()).toBe(secciones[nombre].trim());
    }
  });
  it('sin la insignia de un workflow apagado y con una imagen real', () => {
    const md = readFileSync('README.md', 'utf8');
    expect(md).not.toContain('actions/workflow/status');
    expect(md).toMatch(/!\[[^\]]+\]\(home\/img\/fig-02@1x\.webp\)/);
  });
  it('ROADMAP.md ya no enumera lo que hoy.json desmiente', () => {
    const rm = readFileSync('ROADMAP.md', 'utf8');
    expect(rm).not.toMatch(/Grade across a size run, nest for fabric consumption/);
    expect(rm).toContain('home/datos/hoy.json');
    for (const t of ['A marker you can export', 'A dart tool']) expect(rm).toContain(t);
  });
});
```

Run: `npx vitest run tests/repo/home-honestidad.test.ts`
Expected: FAIL, `Cannot find module '../../scripts/home/readme.mjs'`.

- [ ] **Step 2: El generador del README**

`scripts/home/readme.mjs`:

```js
#!/usr/bin/env node
/** Las secciones «What it does today» y «In the making» del README salen de home/datos/,
 *  los mismos datos que la página (spec 2026-10-10 § 8.1). `--check` sale con 1 si difieren. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const json = (rel) => JSON.parse(readFileSync(rel, 'utf8'));
export const MARCAS = {
  hoy: ['<!-- hoy -->', '<!-- /hoy -->'],
  enConstruccion: ['<!-- en-construccion -->', '<!-- /en-construccion -->'],
};

export function generarSecciones() {
  const hoy = json('home/datos/hoy.json');
  const falta = json('home/datos/en-construccion.json');
  const prueba = (rutas) => rutas.map((r) => `[\`${r.split('/').pop()}\`](${r})`).join(', ');
  const lineasHoy = [...hoy.columnas, ...hoy.filas].map((e) => `- **${e.titulo.en}.** ${e.texto.en} · ${prueba(e.prueba)}`);
  const lineasFalta = falta.map((e) => `- ${e.texto.en} · [${e.rotulo}](${e.enlace})`);
  return {
    hoy: `\n${lineasHoy.join('\n')}\n\nEach line links to the code that makes it true; a test fails if that code goes away (\`tests/repo/home-honestidad.test.ts\`).\n`,
    enConstruccion: `\n${lineasFalta.join('\n')}\n`,
  };
}

export function aplicar(md) {
  const secciones = generarSecciones();
  for (const [nombre, [inicio, fin]] of Object.entries(MARCAS)) {
    const re = new RegExp(`${inicio}[\\s\\S]*?${fin}`);
    if (!re.test(md)) throw new Error(`README.md sin las marcas ${inicio} … ${fin}`);
    md = md.replace(re, `${inicio}\n${secciones[nombre].trim()}\n${fin}`);
  }
  return md;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const actual = readFileSync('README.md', 'utf8');
  const nuevo = aplicar(actual);
  if (process.argv.includes('--check')) {
    if (actual !== nuevo) { console.error('✗ README.md desactualizado: node scripts/home/readme.mjs'); process.exit(1); }
    console.log('✓ README.md al día');
  } else {
    writeFileSync('README.md', nuevo);
    console.log('✓ README.md');
  }
}
```

`package.json`, junto a `home:paginas`:

```json
    "home:readme": "node scripts/home/readme.mjs",
```

- [ ] **Step 3: El README nuevo**

Sustituir `README.md` entero por (las dos secciones marcadas se rellenan en el Step 4):

````markdown
# Vina

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-6B4BFF?logo=webgpu&logoColor=white)](src/utils/cloth/gpu)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?logo=rust&logoColor=white)](crates/xpbd-wasm)

Pattern-making CAD in the browser: an editable 2D pattern, real-time cloth on an avatar, and a copilot that knows a dart from a notch. Free, MIT, in the making.

![The avatar wearing a T-shirt in Vina's 3D viewer, with the fit map on](home/img/fig-02@1x.webp)

**[vina.sdar.dev](https://vina.sdar.dev/)** · [vina.sdar.dev/es/](https://vina.sdar.dev/es/) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/specs/ARCHITECTURE.md)

## What it does today

<!-- hoy -->
<!-- /hoy -->

## In the making

<!-- en-construccion -->
<!-- /en-construccion -->

The workshop's interface is in Spanish. Contributor docs and code are in English.

## Send a pattern

Email a DXF (AAMA or ASTM) to **vina@sdar.dev**. You get it back sewn and draped in Vina, with its fit map, and an honest note on where Vina fell short. Every pattern that comes in is a test the workshop hasn't passed yet. A few each month, in the order they arrive.

## Quick start

```bash
git clone https://github.com/sssamuelll/vina.git
cd vina
npm install
npm run dev        # workshop at http://localhost:5173/app/ — the home is at /
npm test           # the unit suite
```

WebGPU runs in current Chrome, Edge and other Chromium browsers; without it the simulation falls back to the WASM tier. You only need Rust and `wasm-pack` to change the cloth solver in `crates/xpbd-wasm`.

## How it's made

Each change starts as a written design in [`docs/superpowers/specs/`](docs/superpowers/specs/), gets a review, and lands with its tests. The research behind the public pages is in [`docs/reports/`](docs/reports/). The commit gate is in [CONTRIBUTING.md](CONTRIBUTING.md); GitHub Actions stay off on purpose and releases are cut locally after the full gate ([`scripts/deploy-prod.sh`](scripts/deploy-prod.sh)).

The copilot runs with your own key (Anthropic, OpenAI, DeepSeek or a local Ollama). Your own agent can work on the pattern open in Vina through the MCP bridge: [`mcp/`](mcp/) and [`vina-studio`](studio/) on npm.

## Tech stack

React 18 · Redux Toolkit + Zustand · Three.js (WebGPU renderer) · Vite 6 · Rust + wasm-pack · Vitest + Playwright. TypeScript in strict mode throughout.

## Architecture at a glance

```
src/
├── components/   # React UI: shell, 2D PatternEditor, 3D Viewport
├── copilot/      # AI copilot: agentic loop, tools, knowledge
├── store/        # Redux slices + middleware
├── stores/       # Zustand state
├── utils/        # engines: cloth/, dxf/, grading/, nesting/, seam/, mesh/
└── workers/      # Web Worker pool (WASM + CPU solvers)

crates/xpbd-wasm/ # Rust XPBD cloth solver → public/wasm/
home/             # the public home: template, copy, data, assets
docs/             # specs, research, RFCs, historical plans
```

Full write-up in [docs/specs/ARCHITECTURE.md](docs/specs/ARCHITECTURE.md). The [docs index](docs/README.md) maps the rest.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the commit gate and conventions, then the [open issues](https://github.com/sssamuelll/vina/issues). The gate before a commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

## Language

The application is in Spanish, for professional pattern makers; an English interface is [in the making](https://github.com/sssamuelll/vina/issues/964). Project documentation and code are in English.

---

MIT Licensed.
````

- [ ] **Step 4: Rellenar las secciones, CONTRIBUTING, ROADMAP, los borrados y el aviso**

Run: `node scripts/home/readme.mjs && node scripts/home/readme.mjs --check`
Expected: `✓ README.md` y `✓ README.md al día`.

`CONTRIBUTING.md:21`: `Open \`http://localhost:5173\`.` → `Open \`http://localhost:5173/app/\` (the public home is at \`/\`).`

`ROADMAP.md`:
- En «Where we are», sustituir las cinco viñetas por:

```markdown
What works today is the list in the [README](README.md#what-it-does-today), generated from `home/datos/hoy.json` so the page and the repo say the same thing. The beachhead is still the professional pattern maker who already has a pattern and wants to see it in 3D.
```

- En «Next», añadir antes de «**Robust import.**»:

```markdown
- **A marker you can export.** The nesting panel estimates fabric use; writing the marker (PDF, PLT) is next.
- **A dart tool.** Darts arrive with a DXF or through the copilot; drawing them from the pen is next.
```

Borrados: `git rm -q docs/specs/LANDING-PAGE-SPEC.md docs/specs/LANDING-PAGE-STRUCTURE.md docs/specs/ROADMAP.md`.

`docs/superpowers/specs/2026-09-28-homepage-design.md`, línea 3, al principio del `> **Estado:**`: `> **Sucedido el 2026-10-10 por \`2026-10-10-home-taller-abierto-design.md\`; sigue rigiendo la piel (§ 4) y los activos de marca (§ 5.4, § 5.5).**` como línea nueva antes.

- [ ] **Step 5: Verlo pasar**

Run: `npx vitest run tests/repo/home-honestidad.test.ts && grep -rn "docs/specs/LANDING-PAGE\|docs/specs/ROADMAP.md" --include=*.md . | grep -v node_modules | grep -v "docs/superpowers/specs/2026-10-10" || echo "sin referencias colgando"`
Expected: PASS; «sin referencias colgando» (si algún `.md` enlazaba a los borrados, se le quita el enlace en el mismo commit).

- [ ] **Step 6: Commit**

```bash
git add README.md CONTRIBUTING.md ROADMAP.md scripts/home/readme.mjs tests/repo/home-honestidad.test.ts package.json docs/superpowers/specs/2026-09-28-homepage-design.md
git commit -m "docs(home): el README cuenta lo mismo que la página, desde los mismos datos"
```

(Los `git rm` ya están en el índice y entran en este commit.)

---

### Task 8: Los activos reales: OG por idioma, la figura del mapa de ajuste y el póster con WebGPU

**Files:**
- Modify: `home/og.html`, `scripts/home/activos.mjs`, `tests/e2e/home-peso-baseline.json` (a mano)
- Generated: `public/og.png`, `public/og-es.png`, `home/img/fig-02@{1x,2x}.webp`, `home/img/fig-02-movil.webp`, `home/img/caida-poster.webp` (y, sin cambios de contenido, favicons, manifest, fig-01)

**Interfaces:**
- Consumes: el build (Task 3), `home/copy/*.json` (Task 3).
- Produces: los ficheros de arriba. Se corre en la máquina de Samuel (GPU real para `--gpu`).

- [ ] **Step 1: `og.html` por parámetro**

Sustituir `home/og.html` por:

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./tokens.css"><link rel="stylesheet" href="./home.css">
<style>body{width:1200px;height:630px;margin:0;display:flex;flex-direction:column;justify-content:space-between;padding:72px 80px;box-sizing:border-box}
.og-h1{font-size:72px;line-height:1.05;font-weight:500;letter-spacing:-.03em;max-width:820px}.og-pie{font-size:22px;color:var(--tinta-70)}</style>
</head><body>
<img src="./img/logo.svg" alt="" style="height:56px;width:auto;align-self:flex-start">
<p class="og-h1" id="h1">Traza el patrón, mira la caída.</p>
<p class="og-pie mono" id="pie">vina.sdar.dev · Patronaje y simulación 3D en el navegador</p>
<script>const q=new URLSearchParams(location.search);if(q.get('h1'))h1.textContent=q.get('h1');if(q.get('pie'))pie.textContent=q.get('pie');if(q.get('lang'))document.documentElement.lang=q.get('lang');</script>
</body></html>
```

(Este `<script>` vive en `home/og.html`, que no se publica: solo lo abre Playwright por `file://`.)

- [ ] **Step 2: `activos.mjs`: OG por idioma, fig-02 con mapa de ajuste, `--gpu`**

1. Junto a `SIN_POSTER`, añadir:

```js
const GPU = process.argv.includes('--gpu'); // Chrome visible con WebGPU: solo en una máquina con GPU
const COPY = { en: JSON.parse(await readFile(path.join(REPO, 'home/copy/en.json'), 'utf8')), es: JSON.parse(await readFile(path.join(REPO, 'home/copy/es.json'), 'utf8')) };
const lanzar = () => chromium.launch(GPU ? { headless: false, args: ['--enable-unsafe-webgpu', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } : {});
```

y sustituir los dos `chromium.launch()` del fichero por `lanzar()`.

2. Sustituir el paso `── 2. OG ──` por:

```js
// ── 2. OG 1200×630 por idioma desde home/og.html por file:// ────────────────
const ctxOg = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const pOg = await ctxOg.newPage();
for (const [idioma, destino, pie] of [['en', 'public/og.png', 'vina.sdar.dev · Pattern making and 3D simulation in the browser'], ['es', 'public/og-es.png', 'vina.sdar.dev · Patronaje y simulación 3D en el navegador']]) {
  const q = new URLSearchParams({ h1: COPY[idioma].h1, pie, lang: idioma });
  await pOg.goto(`${pathToFileURL(path.join(REPO, 'home/og.html')).href}?${q}`, { waitUntil: 'load' });
  await pOg.evaluate(() => document.fonts.ready);
  const og = await pOg.screenshot();
  await writeFile(path.join(REPO, destino), og);
  console.log('✓', destino, og.length, 'B');
}
await ctxOg.close();
```

3. Sustituir el paso `── 6. fig-02 ──` entero (desde su comentario hasta `await context.close();`) por:

```js
// ── 6. fig-02: el avatar vestido con el mapa de ajuste, 1280×560 anclado al avatar ──
// Coser, vestir y simular en este mismo contexto a @2x; con --gpu la tela reposa en ~15 s.
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await clickViewMode('3D');
await settle(1500);
await page.evaluate(() => {
  window.__VINA_STORE__.dispatch({ type: 'renderSettings/setBackgroundColor', payload: '#2a2825' });
  window.__VINA_STORE__.dispatch({ type: 'renderSettings/setGroundVisible', payload: false });
});
async function comando(nombre) {
  await page.keyboard.press('Control+k'); await settle(600);
  await page.locator('.unified-bar__panel').getByText(nombre, { exact: true }).first().dispatchEvent('click');
  await settle(1500);
  await page.keyboard.press('Escape');
}
await comando('Coser piezas automáticamente');
if (!(await page.evaluate(() => window.__VINA_STORE__.getState().project.seams.length))) throw new Error('fig-02: «Coser piezas automáticamente» no cosió nada');
await comando('Vestir avatar');
await settle(GPU ? 15_000 : ESPERA);
await page.evaluate(() => window.__VINA_STORE__.dispatch({ type: 'simulation/setFitMapMode', payload: 'fit' }));
await settle(1500);
if ((await page.evaluate(() => window.__VINA_STORE__.getState().simulation.fitMapMode)) !== 'fit') throw new Error('fig-02: el mapa de ajuste no se activó');
await dismissToasts();
await page.addStyleTag({ content: 'body *{visibility:hidden!important}canvas{visibility:visible!important}' });
await settle(300);
const lienzo3d = page.locator('canvas').first();
const caja3d = await lienzo3d.boundingBox();
png = await lienzo3d.screenshot();
// Recorte 1280×560 (aspecto 2,29) centrado en x sobre el avatar, pegado arriba (cabeza a muslos).
const alto02 = Math.round(W * 560 / 1280);
const [cx, cy] = [Math.round((caja3d.width * DPR) / 2 - (W * DPR) / 2), 0];
await aWebp(page, png, 'home/img/fig-02@2x.webp', { recorte: { x: cx, y: cy, w: W * DPR, h: alto02 * DPR }, ancho: 2560, maxBytes: 90_000 });
await aWebp(page, png, 'home/img/fig-02@1x.webp', { recorte: { x: cx, y: cy, w: W * DPR, h: alto02 * DPR }, ancho: 1280, maxBytes: 45_000 });
// Móvil: el torso, al aspecto de la caja móvil (358×260 → 1,38).
const mh = alto02 * DPR, mw = Math.round(mh * 1.38);
await aWebp(page, png, 'home/img/fig-02-movil.webp', { recorte: { x: Math.round((caja3d.width * DPR) / 2 - mw / 2), y: 0, w: mw, h: mh }, ancho: 780, maxBytes: 30_000 });
await context.close();
```

4. En el paso 7 (póster), **borrar la definición `async function comando(nombre) { … }`** (ya existe desde el paso 6 y dos declaraciones en el mismo módulo son un error de sintaxis), sustituir `await settle(ESPERA);` por `await settle(GPU ? 20_000 : ESPERA);` y añadir, justo antes de `await aWebp(page, png, 'home/img/caida-poster.webp', …)`:

```js
if (GPU) console.log('mira la costura lateral derecha del póster antes de commitear: si hay franja negra, #1219 sigue y se arregla primero');
```

5. En el comentario de cabecera, añadir: `--gpu: Chrome visible con WebGPU (máquina con GPU): el póster y fig-02 salen del render real y en segundos, no en minutos.`

- [ ] **Step 3: Generar todo en la máquina de Samuel**

Run (terminal 1): `npm run build && npx vite preview --port 4179 --strictPort`
Run (terminal 2): `npm run home:activos -- --url=http://localhost:4179 --gpu 2>&1 | tail -20`
Expected: líneas `✓` para favicons, `public/og.png`, `public/og-es.png`, manifest, `fig-01@2x`, `fig-01@1x`, `fig-01-movil`, `fig-02@2x` (≤ 90 000 B), `fig-02@1x` (≤ 45 000 B), `fig-02-movil` (≤ 30 000 B), `caida-poster.webp` (≤ 60 000 B). Si `--gpu` no abre Chrome con WebGPU (sin `navigator.gpu`), el script sigue en WASM y tarda ~2,5 min; el póster de WASM NO se commitea (E12).

- [ ] **Step 4: Mirar los activos**

Abrir con Read: `home/img/fig-02@1x.webp` (el avatar vestido con el mapa de colores), `home/img/caida-poster.webp` (sin franja negra en la costura lateral derecha), `public/og.png` (H1 en inglés), `public/og-es.png` (H1 en español). Si el póster trae la franja: parar aquí, abrir el arreglo de #1219 como trabajo aparte, y no commitear el póster nuevo.

- [ ] **Step 5: El trinquete de peso, a mano y a la vista**

Run: `HOME_PESO_UPDATE=1 VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts -g "trinquete" --retries=0 --workers=1; git diff --stat tests/e2e/home-peso-baseline.json`
Expected: el JSON solo bajó o se quedó igual (la actualización no sube valores). Si `image` o `total` tienen que subir por la figura nueva: editar a mano los dos valores en el JSON con lo medido (el test lo imprime en el fallo: `image: <n> B`), sin pasar de los techos de `TECHOS`, y dejarlo a la vista del diff del commit.

Run: `VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts --reporter=list 2>&1 | tail -4`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add home/og.html scripts/home/activos.mjs public/og.png public/og-es.png public/favicon.ico public/icon-192.png public/icon-512.png public/apple-touch-icon.png public/manifest.webmanifest home/img tests/e2e/home-peso-baseline.json
git commit -m "feat(home): la figura del mapa de ajuste, el póster con WebGPU y el OG en los dos idiomas"
```

---

### Task 9: Los gates, la revisión y el PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Los gates de siempre, contra la línea base**

Run: `npx tsc -b --noEmit && npm run lint && npm run lint:ui && npx vitest run --reporter=dot 2>&1 | tail -6`
Expected: typecheck y lint limpios; el trinquete de UI sin contadores subidos; la suite con **las mismas 12 rojas de § 12 del spec y ninguna más** (comparar los nombres con la lista; cualquier roja nueva es de este trabajo y se arregla antes de seguir).

- [ ] **Step 2: La home contra el build, entera**

Run: `npm run build && VINA_E2E_BUILD=1 npx playwright test --config playwright.home.config.ts --reporter=list 2>&1 | tail -4 && node scripts/home/paginas.mjs --check && node scripts/home/readme.mjs --check && node scripts/home/enlaces.mjs | tail -3`
Expected: e2e en verde; los dos `--check` al día; enlaces con `✓ 200`.

- [ ] **Step 3: Mirar las dos páginas publicables**

Repetir el Step 8 de Task 3 a 1366 y a 390 (`viewport:{width:390,height:844}`) y abrir las cuatro capturas con Read. Contar: la inglesa y la española tienen los mismos bloques en el mismo orden; el patrón en su idioma; la figura del mapa de ajuste; el enlace de idioma visible en móvil.

- [ ] **Step 4: Push y PR**

Run: `git push -u origin feat/home-taller-abierto`
Expected: el hook de pre-push corre la suite entera (~5 min). **Si bloquea el push por las 12 rojas previas, no se usa `--no-verify`: se reporta a Samuel y él decide.**

Luego:

```bash
gh pr create --base main --head feat/home-taller-abierto --title "Home: el taller abierto, en inglés en / y en español en /es/" --body-file - <<'EOF'
## Qué cambia

- La home se lee en inglés en `/` y en español en `/es/`, con `hreflang` cruzado; las dos salen de una plantilla, un archivo de copy por idioma y tres archivos de datos (`home/datos/`), y un test de repo falla si los HTML commiteados se desactualizan.
- Tres bloques nuevos: **What it does today** (cada frase apunta a la ruta del código que la prueba), **In the making** (seis faltas con su issue o su línea del roadmap) y **How it's made** (un diario de cinco entradas con su PR). Fuera el bloque de formatos con promesas falsas (Gerber, SVG, ZPRJ, PDF de corte, DXF por tallas) y el bloque del copiloto como sección.
- La oferta: **Send a pattern**, por correo a `vina@sdar.dev`, sin formulario.
- README reescrito; sus dos listas salen de los mismos datos que la página. CONTRIBUTING y ROADMAP corregidos; tres documentos viejos de landing borrados.
- Figura 2 nueva (el avatar con el mapa de ajuste), póster regrabado con WebGPU, OG por idioma; `/es/` en el servidor local; el deploy comprueba las dos páginas y los enlaces públicos.

Spec: `docs/superpowers/specs/2026-10-10-home-taller-abierto-design.md`. Plan: `docs/superpowers/plans/2026-10-10-home-taller-abierto.md`.

## Antes de desplegar (Samuel)

- Alias `vina@sdar.dev` en Zoho.
- Permiso de María para su patrón en las figuras (hoy la página no la nombra).
- `gh repo edit` de la ficha del repo (spec § 8.3).
- `bash scripts/deploy-prod.sh` desde `main` tras el merge; Lighthouse a mano.

## Línea base

`main` en `97e78e98` traía 12 pruebas rojas (spec § 12), ninguna de la home; este PR no las toca y no añade ninguna.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: la URL del PR.
