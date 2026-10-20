# Interfaz en papel — P3c: la etiqueta de opción y la puerta de vuelta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lo que ya está puesto se vuelve a abrir sobre el objeto. Un piquete, una costura o una esquina del margen elegidos enseñan una etiqueta. Al clicarla abre los mismos controles de la línea al pie, pero para ese objeto.

**Architecture:**
- **La etiqueta.** `EtiquetaDeOpcion` es una pastilla de papel en la capa de las cotas.
  - Su menú cuelga de `<body>` y lleva los controles del pie (`Control`), como «Más».
  - Qué etiqueta hay, dónde va y qué dice lo calcula `etiquetaDeLaSeleccion`, una función pura sobre la selección del store.
  - `PatternEditor` la pinta y escribe sus cambios.
- **Un solo escritor por objeto.**
  - El piquete se reescribe desde su ancla con `reescribirPiquete`, que usan la cota de distancia y la etiqueta.
  - La costura se reescribe con `updateSeam`; la esquina, con `cornerTypes` por `updatePiece`.
- **La puerta de vuelta.**
  - Seleccionar ya elegía el piquete.
  - La esquina se elige con un clic en la punta del margen, donde hoy el clic deselecciona (`esquinaDelMargenEn`).
  - La costura la eligen Coser, al terminarla, y Editar costuras, con un clic en su lado.

**Tech Stack:** React + Redux Toolkit, Vitest + Testing Library (jsdom), Playwright. En este worktree, el Vite de los e2e escucha en el 5181 (`VINA_E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3):
- § 5.2: «Etiqueta de opción», la tabla de objetos y «La puerta de vuelta»;
- § 5.1: superficies por acción; la cabina cuenta 1 y la etiqueta es parte de ella (§ 9);
- § 5.3: «Coser (tipo de costura, hasta P3)»;
- § 5.4: la frase;
- § 11: la fila P3, «El tipo de esquina ya tiene puerta fuera de Propiedades».

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, en sentence case, sin «¡» ni «por favor». Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md` («Flat-felled» se queda, #1049). Los `aria-label` también van en español.
- **Microcopy fijado con solace-wren el 09-10 y aprobado por Samuel («perfecto»):**
  - Pastilla del piquete: el dibujo de la forma y `{forma} · {profundidad} × {ancho} mm`. Con cantidad mayor que 1, `{n} {forma en plural} · …`. Ejemplos: «Recta · 8 × 3 mm» y «2 rectas · 8 × 3 mm». Plurales: rectas, en T, V hacia adentro, V hacia afuera, en U, almenas, rombos.
  - Pastilla de la costura: el tipo («Normal», «Francesa», «Flat-felled», «Overlock»). Pastilla de la esquina: el tipo («Inglete», «Inglete doble», «Envolvente», «Cuadrada», «Sesgada», «Empatada», «Recorte espejado»).
  - Nombres del botón: «Piquete: {texto}», «Tipo de costura: {tipo}», «Tipo de esquina: {tipo}». Nombres del menú: «Opciones del piquete», «Tipo de costura», «Tipo de esquina».
  - Frases del pie con Seleccionar:
    - piquete: «Clic en la distancia para escribirla · la etiqueta cambia forma, cantidad y medidas · Esc suelta»;
    - costura: «Clic en la etiqueta para cambiar el tipo de costura · Esc suelta»;
    - esquina: «Clic en la etiqueta para cambiar el tipo de esquina · Esc suelta».
  - Editar costuras: «Clic en un lado para ver con qué está cosido y cambiar el tipo de costura».
  - Pieza bloqueada: el aviso que ya existe, «Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.».
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin colores literales;
  - todo `:hover` lleva su `:focus-visible`;
  - todo portal nace papel;
  - ningún `z-index` literal;
  - `data-botonera` donde Enter y Espacio son del botón;
  - Esc por la escalera (`usePeldanoDeEscape`).
- **Superficies.** La pastilla es `cabina`; su menú, `menu` (`tests/repo/superficies-declaradas.test.ts`).
- **La caja negra** ve abrir, cerrar, cambiar y elegir (`pushJournal`).
- **Gates:**
  - typecheck con `npx tsc -b --noEmit`;
  - nada de `--no-verify`;
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador;
  - cada tarea cierra con la suite entera (`npm run test`).
- **Trinquetes.** Sus líneas base solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`. A mano, nunca.
- **Ids y archivos.** Los ids se crean con `newId()`, y `git add` va con rutas explícitas.
- **Trabajo en paralelo con la entrega 1b de la IA** (sesión «Avatares feature», checkout principal, rama `feat/ia-superficie-1b`, Vite en el 5174):
  - aquí no se tocan `src/copilot/superficie/`, `src/utils/seam/notchMirror.ts`, `src/utils/autoSew/index.ts`, `src/store/undoMiddleware.ts` ni `src/store/index.ts`;
  - P3c no toca `src/store/`;
  - los e2e de aquí van en el 5181;
  - antes de correr la suite entera, o el gate, se le avisa a esa sesión por mensaje.
- **E2e en curso.** Mientras corre un e2e no se edita nada de la app: el Vite recarga.

## Review Focus

1. **Dos piezas juntas y la punta del margen.** El clic en la punta elige la esquina más cercana. El clic dentro de una pieza, aunque caiga junto a su vértice, sigue eligiendo la pieza. → Task 4 (unitario de `esquinaDelMargenEn` y e2e).
2. **Deshacer tras la etiqueta.** Un Ctrl+Z después de cambiar la forma de un piquete devuelve la forma de antes, y la pastilla lo enseña. → Task 6 (e2e).
3. **El piquete de una sisa.** En un borde curvo, cambiar la forma no lo mueve: el path sale de la misma ancla resuelta. → Task 3 (unitario sobre una curva).
4. **Teclado.** La pastilla con el foco abre con Enter, con el foco dentro del menú. Esc cierra el menú y devuelve el foco a la pastilla, y otro Esc suelta la selección. → Task 2 (unitario) y Task 6 (e2e).
5. **La pieza bloqueada.** La pastilla del piquete y la de la esquina se ven apagadas y avisan en vez de abrir. La de la costura no, porque el tipo no es geometría. → Tasks 2, 3 y 4.

## Decisiones de este plan

1. **Rama y aislamiento.** La rama es `feat/interfaz-en-papel-p3c`, desde `main` (`a71b0dbc`), en el worktree `.claude/worktrees/p3c` con su propio `npm ci`. Va en paralelo con la entrega 1b.
2. **El puerto de los e2e se escoge** (`VINA_E2E_PORT`, por defecto 5174), en `playwright.config.ts` y en `scripts/deploy-prod.sh`. Con `reuseExistingServer`, Playwright se queda con el primer Vite que responda: desde este worktree el ensayo habría validado el árbol de la 1b. `--strictPort` hace que un puerto ocupado falle en vez de mudarse.
3. **La etiqueta es el pie de ese objeto.** Su menú lleva los controles de la línea al pie (`Control`) y no inventa otro tipo de control.
   - Piquete: Forma (siete dibujos), Cantidad (1 2 3), Profundidad (1-30) y Ancho (1-20), los de `notchTool.options`.
   - Costura: un control, el tipo.
   - Esquina: un control, el tipo (siete alternativas, que caben como botones).
   - Cada control lleva el id `etiqueta-<id>`, para no chocar con los del pie.
4. **Dónde se ve.**
   - El piquete, con Seleccionar.
   - La esquina, con Seleccionar y con Margen.
   - La costura, con Seleccionar, Coser y Editar costuras.
   - Se calla mientras se arrastra, con el menú del clic derecho abierto o calibrando, como las cotas.
   - No se ve si su capa está oculta o si su objeto no se pinta: interruptores «Piquetes», «Margen» y «Costuras».
5. **La costura no se elige con un clic de Seleccionar**, aunque § 5.2 lo dice.
   - La firma de María #210 lo prohíbe: «eso solo debería verse al activar el menu de costuras… no debería mostrarse mientras editamos el patron». Lo fija `maria-207-hover.spec.ts`: con Seleccionar no se pinta ninguna costura.
   - Su puerta de vuelta es Editar costuras (B), que está en el margen y ya elige la costura con un clic en su lado. Lo que María dijo el 30-08, «si le doy a editar costuras no pasa absolutamente nada», deja de ser cierto: el clic trae la etiqueta.
   - Coser deja elegida la costura que acaba de hacer, así que su etiqueta sale al terminarla. Es el «“Tipo de costura” fuera del gesto de coser» del 30-08.
   - Con una costura elegida (por la lista de Propiedades, por ejemplo), Seleccionar enseña su etiqueta.
   - La nota de la spec lo dice, y Samuel puede revocarlo.
6. **El piquete elegido.**
   - Su distancia se queda en reposo: clic o Tab la abren, como las cotas de la pieza. Una cota que se abre sola se lleva las teclas (P3b, firma D3).
   - Escribe por su ancla (`'piqueteElegido'` → `reescribirPiquete`).
   - La profundidad sale del chip de lo que se pone, como prometió P3b: el chip es solo Distancia, y la profundidad de un piquete ya puesto vive en su etiqueta.
7. **La esquina con Seleccionar.**
   - Un clic izquierdo FUERA de toda pieza, cerca de un vértice con margen a la vista, elige esa esquina. Ahí hoy el clic deselecciona.
   - El radio cubre la punta (el margen más ancho de la pieza por √2) más 10 px.
   - Dentro de la pieza, el clic sigue siendo de la pieza.
   - Margen ya no abre Propiedades al clicar una esquina (`PatternEditor.tsx:322`): la elige y enseña su etiqueta.
   - El anillo de la esquina elegida se ve también con Seleccionar.
8. **«Tipo de costura» sale de la línea al pie.**
   - Coser deja de declararlo, y una costura nueva nace `standard` (Normal), en 2D y en 3D (`Sew3DTool` leía la opción de Coser).
   - Tijeras conserva el suyo (§ 5.3).
   - Una opción escrita en una etiqueta vale para ese objeto y nada más (§ 5.2, «Lo que no se recuerda»).
9. **Un término por concepto.** Hay una lista por concepto, y la importan todas las superficies que lo nombran:
   - `TIPOS_DE_COSTURA`, con los nombres del pie: se van «Estándar» y «Sobrecargada» de Propiedades;
   - `TIPOS_DE_ESQUINA`, que sale de `VertexPropertiesSection`;
   - `FORMAS_DE_PIQUETE`, los rótulos del pie: se van «Recto», «V interna», «V externa» y «Castillo» de Propiedades.
10. **Lo que no entra:**
    - las piezas vinculadas no copian `cornerTypes`, ni antes ni ahora (`linkedEditingMiddleware.ts:155-172`);
    - los nombres de deshacer siguen en inglés («Edit Seam», «Edit Piece»): nadie los enseña.
11. **Trinquetes.**
    - Superficies gana «elegir un piquete (Z)», «elegir una esquina del margen (Z)» y «abrir la etiqueta del piquete».
    - Contraste gana «etiqueta del piquete abierta».
    - «coser dos lados (N)» sube de 2 a 3 con la etiqueta. Es menos que la meta de 4, así que el techo efectivo lo admite.

## Archivos

| Archivo | Qué |
|---|---|
| `playwright.config.ts`, `scripts/deploy-prod.sh` | `VINA_E2E_PORT` (Task 1); el spec nuevo, al gate (Task 6). |
| `src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx` + `.css` (nuevos) | La pastilla y su menú. |
| `src/components/PatternEditor/etiquetas/etiquetas.ts` (nuevo) | `etiquetaDeLaSeleccion`, `presentarEtiqueta`, `posicionDeEtiqueta`, `claveDeEtiqueta`. |
| `src/components/PatternEditor/etiquetas/piquete.ts` (nuevo) | `reescribirPiquete`, `textoDelPiquete`. |
| `src/components/PatternEditor/cotas/loQueSePone.ts` | `cotaDelPiqueteElegido`; `cotasDelPiquete` sin Profundidad. |
| `src/components/PatternEditor/cotas/cotas.ts` | `CotaUpdate` gana `'piqueteElegido'`. |
| `src/components/PatternEditor/cotas/sujeto.ts` | El piquete elegido con Seleccionar trae su distancia. |
| `src/components/PatternEditor/PatternEditor.tsx` | Aplica `'piqueteElegido'`; pinta la etiqueta y escribe sus cambios; Margen ya no abre Propiedades; anillo de la esquina con Seleccionar; `etiqueta` a la frase. |
| `src/components/PatternEditor/useEditorInteractions.ts` | Seleccionar elige la esquina del margen. |
| `src/components/PatternEditor/fraseDeLaFase.ts` | Las frases de las tres etiquetas y la de Editar costuras. |
| `src/utils/seam/tiposDeCostura.ts`, `tiposDeEsquina.ts`, `esquinaDelMargen.ts`, `tramoCosido.ts` (nuevos) | Las listas, la esquina bajo el clic y el tramo cosido que se pinta. |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | Usa `tramoCosido`. |
| `src/tools/definitions/seam.tsx`, `scissors.tsx`, `notch.tsx` | Coser sin opciones; Tijeras con la lista; `FORMAS_DE_PIQUETE` exportado. |
| `src/components/PatternEditor/useFreeSewingTool.ts`, `src/components/Viewport3D/Sew3DTool.tsx` | La costura nueva nace `standard`. |
| `src/components/PropertiesPanel/SeamPropertiesPanel.tsx`, `PropertiesPanel.tsx`, `VertexPropertiesSection.tsx`, `PieceProperties.tsx` | Los rótulos, de las listas. |
| `tests/repo/superficies-declaradas.test.ts`, `tests/repo/lo-que-flota-es-papel.test.ts` | Las marcas nuevas. |
| `tests/e2e/la-puerta-de-vuelta.spec.ts` (nuevo), `la-cota-de-lo-que-se-pone.spec.ts`, `superficies-por-accion.spec.ts`, `contraste-del-cromo.spec.ts` | E2e y trinquetes. |
| `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, `.claude/skills/contrato-de-interfaz/SKILL.md` | La nota de P3c y la etiqueta en el contrato. |

---

### Task 1: El puerto de los e2e se escoge

**Files:**
- Modify: `playwright.config.ts:28,43-44`
- Modify: `scripts/deploy-prod.sh:92-115`

- [ ] **Step 1: El config lee el puerto**

En `playwright.config.ts`, antes de `export default`:

```ts
// El puerto de los e2e se escoge con VINA_E2E_PORT (5174 por defecto). Con
// `reuseExistingServer`, Playwright se queda con el primer servidor que
// responda en su puerto: dos árboles de trabajo con el mismo puerto validan uno
// el Vite del otro, en silencio. `--strictPort`: un puerto ocupado falla en vez
// de mudarse a otro donde nadie lo espera.
const PUERTO = Number(process.env.VINA_E2E_PORT ?? 5174);
```

y `baseURL: \`http://localhost:${PUERTO}\``, `command: \`npx vite --port ${PUERTO} --strictPort\``, `port: PUERTO`.

- [ ] **Step 2: El gate lo pasa a Playwright**

En `scripts/deploy-prod.sh`, justo antes del `if curl … 5174`:

```bash
# El puerto del gate se escoge con VINA_E2E_PORT (5174 por defecto) y viaja a
# Playwright por el entorno: un worktree con su propio Vite mide su árbol y no
# el del checkout de al lado (playwright.config.ts).
PUERTO="${VINA_E2E_PORT:-5174}"
export VINA_E2E_PORT="$PUERTO"
```

En ese bloque, cada `5174` pasa a `$PUERTO`: los tres `curl`, los mensajes, `npx vite --port "$PUERTO" --strictPort` y el `taskkill` del comentario.

- [ ] **Step 3: Verificar**

```bash
bash -n scripts/deploy-prod.sh && grep -n "5174" scripts/deploy-prod.sh   # solo el valor por defecto
npx vite --port 5181 --strictPort &      # en el worktree
curl -s http://localhost:5181/app/ | grep -o "<title>[^<]*"   # dice Vina
VINA_E2E_PORT=5181 npx playwright test tests/e2e/marca-de-escala.spec.ts --workers=1
```

Expected: el spec en verde contra el 5181. El Vite de la 1b, en el 5174, no se toca.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts scripts/deploy-prod.sh
git commit -m "chore(e2e): el puerto de los e2e se escoge con VINA_E2E_PORT"
```

---

### Task 2: La etiqueta de opción

**Files:**
- Create: `src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx`
- Create: `src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.css`
- Create: `src/components/PatternEditor/etiquetas/__tests__/EtiquetaDeOpcion.test.tsx`
- Modify: `tests/repo/superficies-declaradas.test.ts` (MARCAS)
- Modify: `tests/repo/lo-que-flota-es-papel.test.ts` (RAICES y PINTA)

**Interfaces:**
- Produces:

```ts
export type QueLlevaEtiqueta = 'piquete' | 'costura' | 'esquina';
export interface EtiquetaDeOpcionProps {
  que: QueLlevaEtiqueta;
  texto: string;                         // «Recta · 8 × 3 mm»
  Dibujo?: React.FC<{ size?: number }>;  // la forma del piquete
  nombre: string;                        // «Piquete: Recta · 8 × 3 mm»
  nombreDelMenu: string;                 // «Opciones del piquete»
  opciones: readonly ToolOption[];
  valores: Readonly<Record<string, unknown>>;
  alCambiar(opcion: string, valor: unknown): void;
  left: number; top: number;             // centro, en px de `.pattern-editor`
  apagada?: boolean;
  alPulsarApagada?(): void;
}
export default function EtiquetaDeOpcion(props: EtiquetaDeOpcionProps): JSX.Element;
```

- [ ] **Step 1: El test en rojo**

`src/components/PatternEditor/etiquetas/__tests__/EtiquetaDeOpcion.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EtiquetaDeOpcion, { type EtiquetaDeOpcionProps } from '../EtiquetaDeOpcion';
import { bajarLaEscalera } from '../../../../shortcuts/escaleraDeLoLlamado';
import type { ToolOption } from '../../../../tools/types';

const TIPO: ToolOption = {
  id: 'type', label: 'Tipo de costura', type: 'select', value: 'standard',
  choices: [{ label: 'Normal', value: 'standard' }, { label: 'Francesa', value: 'french' }],
};
const PROFUNDIDAD: ToolOption = { id: 'length', label: 'Profundidad (mm)', type: 'number', value: 8, min: 1, max: 30, step: 1 };

function pintar(extra: Partial<EtiquetaDeOpcionProps> = {}) {
  const alCambiar = vi.fn();
  render(
    <EtiquetaDeOpcion
      que="costura" texto="Normal" nombre="Tipo de costura: Normal" nombreDelMenu="Tipo de costura"
      opciones={[TIPO, PROFUNDIDAD]} valores={{ type: 'standard', length: 8 }}
      alCambiar={alCambiar} left={100} top={50} {...extra}
    />,
  );
  return { alCambiar, boton: screen.getByRole('button', { name: 'Tipo de costura: Normal' }) };
}
const menu = () => screen.queryByRole('group', { name: 'Tipo de costura' });

afterEach(cleanup);

describe('EtiquetaDeOpcion (spec 2026-10-02 § 5.2)', () => {
  it('es una pastilla de la cabina, de papel, con su valor y cerrada', () => {
    const { boton } = pintar();
    expect(boton.textContent).toContain('Normal');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    const raiz = boton.closest('[data-superficie="cabina"]');
    expect(raiz?.getAttribute('data-material')).toBe('papel');
    expect(raiz?.hasAttribute('data-botonera')).toBe(true);
    expect(menu()).toBeNull();
  });

  it('el clic abre en <body> un menú de papel con los controles del pie', () => {
    const { boton } = pintar();
    fireEvent.click(boton);
    const m = menu()!;
    expect(m.parentElement).toBe(document.body);
    expect(m.getAttribute('data-material')).toBe('papel');
    expect(m.getAttribute('data-superficie')).toBe('menu');
    expect(m.hasAttribute('data-botonera')).toBe(true);
    // Los ids no chocan con los del pie, que son `opcion-<id>`.
    expect(m.querySelector('#etiqueta-type')).not.toBeNull();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('elegir una alternativa escribe con el id de la opción, no el del control', () => {
    const { boton, alCambiar } = pintar();
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole('button', { name: 'Francesa' }));
    expect(alCambiar).toHaveBeenCalledWith('type', 'french');
  });

  it('un número llega acotado a su rango', () => {
    const { boton, alCambiar } = pintar();
    fireEvent.click(boton);
    fireEvent.change(screen.getByLabelText('Profundidad (mm)'), { target: { value: '45' } });
    expect(alCambiar).toHaveBeenLastCalledWith('length', 30);
  });

  it('Esc cierra el menú antes que la selección, y el foco vuelve a la pastilla', () => {
    const { boton } = pintar();
    fireEvent.click(boton, { detail: 0 });   // del teclado: el foco entra al menú
    expect(menu()!.contains(document.activeElement)).toBe(true);
    let quien: string | null = null;
    act(() => { quien = bajarLaEscalera(); });
    expect(quien).toBe('etiqueta');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(boton);
  });

  it('un clic fuera lo cierra', () => {
    const { boton } = pintar();
    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  it('apagada no abre: avisa', () => {
    const alPulsarApagada = vi.fn();
    const { boton } = pintar({ apagada: true, alPulsarApagada });
    fireEvent.click(boton);
    expect(alPulsarApagada).toHaveBeenCalledTimes(1);
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(menu()).toBeNull();
  });
});
```

Run: `npx vitest run src/components/PatternEditor/etiquetas`
Expected: FAIL (`Cannot find module '../EtiquetaDeOpcion'`).

- [ ] **Step 2: El componente**

`src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { ToolOption } from '../../../tools/types';
import { usePeldanoDeEscape } from '../../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../../utils/telemetry/journal';
import { Control } from '../ToolOptionControls';
import './EtiquetaDeOpcion.css';

export type QueLlevaEtiqueta = 'piquete' | 'costura' | 'esquina';

export interface EtiquetaDeOpcionProps { /* la de Interfaces, con sus comentarios */ }

/**
 * La etiqueta de opción (spec 2026-10-02 «la interfaz en papel» § 5.2):
 * blanca, con línea de pelo, texto en tinta y una flecha, junto al objeto
 * elegido. Al clicarla abre un menú con los MISMOS controles de la línea al
 * pie (`Control`), pero para ese objeto: es el pie de lo que ya está puesto.
 * El menú cuelga de <body>, como «Más», y se cierra con Esc antes que la
 * selección (`usePeldanoDeEscape`).
 */
export default function EtiquetaDeOpcion({
  que, texto, Dibujo, nombre, nombreDelMenu, opciones, valores, alCambiar, left, top, apagada = false, alPulsarApagada,
}: EtiquetaDeOpcionProps) {
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deTeclado = useRef(false);

  // Abrir y cerrar quedan en la bitácora. Abierto con el teclado, el foco
  // entra al menú (cuelga de <body>: Tab no llegaría); con el ratón se queda.
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'etiqueta', { que, abierto });
    if (abierto && deTeclado.current) {
      menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input, select')?.focus();
    }
  }, [abierto, que]);

  // Debajo de la pastilla; si no cabe, encima. Nunca fuera de la ventana.
  useLayoutEffect(() => {
    const boton = botonRef.current;
    const menu = menuRef.current;
    if (!abierto || !boton || !menu) return;
    const r = boton.getBoundingClientRect();
    const abajo = r.bottom + 4;
    setAncla({
      left: Math.max(16, Math.min(r.left, window.innerWidth - menu.offsetWidth - 16)),
      top: abajo + menu.offsetHeight + 16 <= window.innerHeight ? abajo : Math.max(16, r.top - 4 - menu.offsetHeight),
    });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [abierto]);

  usePeldanoDeEscape('etiqueta', 'menu', abierto, () => {
    if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierto(false);
  });

  // Con el ratón ningún botón se queda con el foco: Enter y Espacio son del
  // botón solo si se llegó con el teclado (contrato § 4, `data-botonera`).
  const noTomarElFoco = (e: { target: EventTarget; preventDefault(): void }) => {
    if ((e.target as Element).closest('button')) e.preventDefault();
  };

  return (
    <span
      className="etiqueta-de-opcion"
      data-superficie="cabina"
      data-material="papel"
      data-botonera
      style={{ left, top }}
      onMouseDown={noTomarElFoco}
    >
      <button
        ref={botonRef}
        type="button"
        className="etiqueta-de-opcion__boton"
        aria-label={nombre}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-disabled={apagada || undefined}
        onClick={(e) => {
          if (apagada) { alPulsarApagada?.(); return; }
          // Un clic del teclado (Enter, Espacio) llega con `detail` 0.
          deTeclado.current = e.detail === 0;
          setAbierto((a) => !a);
        }}
      >
        {Dibujo && <Dibujo size={16} />}
        <span className="etiqueta-de-opcion__texto">{texto}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {abierto && createPortal(
        <div
          ref={menuRef}
          className="etiqueta-de-opcion__menu"
          role="group"
          aria-label={nombreDelMenu}
          data-superficie="menu"
          data-material="papel"
          data-shortcut-context="2d"
          data-botonera
          onMouseDown={noTomarElFoco}
          style={{ left: ancla.left, top: ancla.top }}
        >
          {opciones.map((o) => (
            <Control
              key={o.id}
              opcion={{ ...o, id: `etiqueta-${o.id}` }}
              valor={valores[o.id] ?? o.value}
              alCambiar={(v) => {
                pushJournal('gesture', 'etiqueta:cambia', { que, opcion: o.id, valor: v });
                alCambiar(o.id, v);
              }}
            />
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
```

`EtiquetaDeOpcion.css` (tokens copiados de `.seccion-del-patron__menu` y de `CotaChip`; ningún literal):

```css
/* La etiqueta de opción (spec 2026-10-02 § 5.2): papel sobre la hoja, en la
   capa de las cotas. Su menú es el de «Más»: los controles del pie, en filas. */
.etiqueta-de-opcion {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.etiqueta-de-opcion__boton {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-family: var(--font-sans);
  /* el tamaño de letra de las cotas, por su token */
  white-space: nowrap;
  color: var(--text-primary);
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
  cursor: pointer;
}
.etiqueta-de-opcion__boton:hover:not([aria-disabled='true']) { background: var(--bg-elevated); }
.etiqueta-de-opcion__boton:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.etiqueta-de-opcion__boton[aria-disabled='true'] { color: var(--text-tertiary); cursor: not-allowed; }
.etiqueta-de-opcion__menu {
  position: fixed;
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 10px 12px;
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
}
.etiqueta-de-opcion__menu .opcion-del-pie__botones { flex-wrap: wrap; }
```

(El tamaño de letra y la altura de línea se leen de `cotas.css` y `SeccionDelPatron.css` al escribirlo: el mismo token, no un número.)

- [ ] **Step 3: Las marcas del repo**

- `tests/repo/superficies-declaradas.test.ts`, en MARCAS: `['src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx', 'cabina', 1]` y `[…, 'menu', 1]`.
- `tests/repo/lo-que-flota-es-papel.test.ts`, en RAICES: `['src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.tsx', 2]` (la pastilla y su menú). En PINTA: `['src/components/PatternEditor/etiquetas/EtiquetaDeOpcion.css', '*']`.

- [ ] **Step 4: En verde**

Run: `npx vitest run src/components/PatternEditor/etiquetas tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts && node scripts/ui-contract-lint.mjs`
Expected: 7/7 y los dos del repo en verde; ningún contador sube.

- [ ] **Step 5: Suite entera, avisando a la 1b, y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git add src/components/PatternEditor/etiquetas tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts
git commit -m "feat(lienzo): la etiqueta de opción, una pastilla que abre los controles del pie para un objeto"
```

---

### Task 3: El piquete elegido: su distancia y su etiqueta

**Files:**
- Create: `src/components/PatternEditor/etiquetas/piquete.ts`
- Create: `src/components/PatternEditor/etiquetas/etiquetas.ts` (con su rama del piquete; las otras dos llegan en las Tasks 4 y 5)
- Create: `src/components/PatternEditor/etiquetas/__tests__/piquete.test.ts`, `etiquetas.test.ts`
- Modify: `src/components/PatternEditor/cotas/cotas.ts:59` (`CotaUpdate`)
- Modify: `src/components/PatternEditor/cotas/loQueSePone.ts:55-114` (sin Profundidad; `cotaDelPiqueteElegido`)
- Modify: `src/components/PatternEditor/cotas/sujeto.ts:305-339`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (`aplicarCota`, la etiqueta, la frase)
- Modify: `src/components/PatternEditor/fraseDeLaFase.ts` (`etiqueta`)
- Modify: `src/tools/definitions/notch.tsx` (exporta `FORMAS_DE_PIQUETE`), `src/components/PropertiesPanel/PieceProperties.tsx:267-273`
- Modify: `src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts`

**Interfaces:**
- Consumes: `EtiquetaDeOpcion` (Task 2).
- Produces:

```ts
// etiquetas/piquete.ts
export function reescribirPiquete(piece: PatternPiece, line: InternalLine,
  cambio: { distanciaMm?: number; opciones?: Partial<NotchOptions> },
): Pick<InternalLine, 'path' | 'notchAnchor' | 'notchOptions'> | null;
export function textoDelPiquete(o: NotchOptions): string;
// etiquetas/etiquetas.ts
export interface EtiquetaInput { activeTool: Tool2D; pieces: PatternPiece[]; seams: Seam[];
  selectedInternalLine: InternalLineSelection | null; selectedSeamId: string | null; saSelection: SaSelection | null;
  showNotches: boolean; showSewingLines: boolean; showSeamAllowance: boolean;
  hiddenLayerIds: readonly number[]; layerLocked: Readonly<Record<number, boolean>>; callada: boolean; }
export type Etiqueta =
  | { que: 'piquete'; pieceId: string; lineId: string; opciones: NotchOptions; punto: Point2D; hacia: Point2D; separacionMm: number; apagada: boolean }
  | { que: 'costura'; seamId: string; tipo: Seam['type']; punto: Point2D; hacia: Point2D; separacionMm: number; apagada: false }
  | { que: 'esquina'; pieceId: string; vertexIndex: number; tipo: CornerType; punto: Point2D; hacia: Point2D; separacionMm: number; apagada: boolean };
export function etiquetaDeLaSeleccion(input: EtiquetaInput): Etiqueta | null;
export function presentarEtiqueta(e: Etiqueta): Pick<EtiquetaDeOpcionProps, 'texto' | 'Dibujo' | 'nombre' | 'nombreDelMenu' | 'opciones' | 'valores'>;
export function posicionDeEtiqueta(e: Etiqueta, pan: Point2D, zoom: number): { left: number; top: number };
export function claveDeEtiqueta(e: Etiqueta): string;
// cotas/loQueSePone.ts
export function cotaDelPiqueteElegido(piece: PatternPiece, line: InternalLine): Cota | null;
// cotas/cotas.ts
| { kind: 'piqueteElegido'; pieceId: string; lineId: string; distanciaMm: number }
// tools/definitions/notch.tsx
export const FORMAS_DE_PIQUETE: NonNullable<ToolOption['choices']>;
// fraseDeLaFase.ts
etiqueta?: 'piquete' | 'costura' | 'esquina' | null;
```

- [ ] **Step 1: Los tests en rojo**

`etiquetas/__tests__/piquete.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { InternalLine, PatternPiece } from '../../../../types/types';
import { resolveNotchAnchor } from '../../../../utils/notchAnchor';
import { generateNotchPath } from '../../../../utils/notches';
import { reescribirPiquete, textoDelPiquete } from '../piquete';

const rect = (): PatternPiece => ({ /* 300 × 200 en (100, 100), como `addPiece` */ } as PatternPiece);
const piquete = (distanceMm: number): InternalLine => ({
  id: 'n1', type: 'notch', path: [],
  notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm },
  notchOptions: { shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1 },
} as InternalLine);

describe('reescribirPiquete', () => {
  it('cambiar la forma no lo mueve: el path sale de la misma ancla', () => {
    const piece = rect();
    const r = reescribirPiquete(piece, piquete(60), { opciones: { shape: 't-notch' } })!;
    const ancla = resolveNotchAnchor(piece.outline, r.notchAnchor!)!;
    expect(r.notchOptions!.shape).toBe('t-notch');
    expect(r.notchOptions!.length).toBe(8);   // lo demás se conserva
    expect(r.path).toEqual(generateNotchPath(ancla.point, ancla.normal, r.notchOptions!));
    expect(r.notchAnchor!.distanceMm).toBeCloseTo(60);
  });

  it('la distancia mueve el ancla y el path', () => {
    const r = reescribirPiquete(rect(), piquete(60), { distanciaMm: 150 })!;
    expect(r.notchAnchor!.distanceMm).toBeCloseTo(150);
    expect(r.path[0].values[0]).toBeCloseTo(150);   // sobre el lado de arriba, local
  });

  it('en una curva (la sisa de María) cambiar la forma conserva el punto', () => {
    // Pieza con un borde C, ancla métrica 2 en mitad de la curva: el primer
    // punto del path nuevo coincide con el del viejo (mismo `resolveNotchAnchor`).
  });

  it('null si no es un piquete o si su ancla ya no cae en el contorno', () => {
    expect(reescribirPiquete(rect(), { ...piquete(60), type: 'line' } as InternalLine, { distanciaMm: 1 })).toBeNull();
    expect(reescribirPiquete(rect(), { ...piquete(60), notchAnchor: { refPoint: { x: 999, y: 999 }, direction: 'cw', distanceMm: 5 } } as InternalLine, {})).toBeNull();
  });
});

describe('textoDelPiquete (solace-wren, 09-10)', () => {
  const o = { shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1 } as const;
  it('una: la forma y las medidas', () => expect(textoDelPiquete(o)).toBe('Recta · 8 × 3 mm'));
  it('varias: cuántas y en plural', () => expect(textoDelPiquete({ ...o, count: 2 })).toBe('2 rectas · 8 × 3 mm'));
  it('los decimales con coma', () => expect(textoDelPiquete({ ...o, shape: 'v-internal', length: 12.5 })).toBe('V hacia adentro · 12,5 × 3 mm'));
});
```

`etiquetas/__tests__/etiquetas.test.ts`, la rama del piquete:

```ts
describe('etiquetaDeLaSeleccion — el piquete', () => {
  it('con Seleccionar y un piquete elegido: su etiqueta, hacia dentro de la pieza', () => {
    const e = etiquetaDeLaSeleccion(base({ activeTool: 'select', selectedInternalLine: { pieceId: 'p1', lineId: 'n1' } }))!;
    expect(e.que).toBe('piquete');
    expect(e.punto).toEqual({ x: 160, y: 100 });   // en patrón
    expect(e.hacia.y).toBeGreaterThan(0);           // hacia dentro: el borde de arriba
    expect(e.apagada).toBe(false);
  });
  it('con otra herramienta, nada', () => expect(etiquetaDeLaSeleccion(base({ activeTool: 'notch', selectedInternalLine: SEL }))).toBeNull());
  it('con los piquetes ocultos, nada', () => expect(etiquetaDeLaSeleccion(base({ activeTool: 'select', selectedInternalLine: SEL, showNotches: false }))).toBeNull());
  it('con la capa oculta, o callada (arrastre, menú), nada', () => { /* hiddenLayerIds: [1]; callada: true */ });
  it('con la pieza bloqueada, apagada', () => { /* locked: true → apagada: true */ });
  it('presentarEtiqueta: «Piquete: Recta · 8 × 3 mm», «Opciones del piquete», las cuatro opciones del pie y el dibujo de la forma', () => { /* … */ });
});
```

En `cotas/__tests__/sujeto.*` (el archivo que ya cubre la interna elegida):

```ts
it('el piquete elegido con Seleccionar trae su distancia, en reposo, que escribe por el ancla', () => {
  const s = cotasDelSujeto(entrada({ activeTool: 'select', selectedInternalLine: { pieceId: 'p1', lineId: 'n1' } }));
  expect(s.cotas.map(c => c.label)).toEqual(['Distancia']);
  expect(s.cotas[0].apply(150)).toEqual({ kind: 'piqueteElegido', pieceId: 'p1', lineId: 'n1', distanciaMm: 150 });
});
it('con otra herramienta el piquete elegido sigue sin cotas', () => { /* activeTool: 'notch' → [] */ });
```

En `cotas/__tests__/loQueSePone.test.ts`, el caso de las dos cotas pasa a una: `cotasDelPiquete(…)` devuelve solo «Distancia», y su `apply(90)` lleva la profundidad que el piquete ya tenía.

En `fraseDeLaFase` (su test): con `activeTool: 'select', etiqueta: 'piquete'` la frase es «Clic en la distancia para escribirla · la etiqueta cambia forma, cantidad y medidas · Esc suelta».

Run: `npx vitest run src/components/PatternEditor/etiquetas src/components/PatternEditor/cotas src/components/PatternEditor/__tests__/fraseDeLaFase*`
Expected: FAIL por lo que todavía no existe.

- [ ] **Step 2: `reescribirPiquete` y el texto**

`etiquetas/piquete.ts`:

```ts
import type { InternalLine, NotchOptions, PatternPiece } from '../../../types/types';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../../utils/notches';
import { FORMAS_DE_PIQUETE } from '../../../tools/definitions/notch';
import { formatMedida } from '../cotas/parseMedida';

/**
 * Un piquete ya puesto, reescrito desde su ancla: la distancia de su cota o
 * las opciones de su etiqueta (spec 2026-10-02 § 5.2). El path sale siempre
 * del ancla resuelta sobre el contorno vivo y de las opciones, como al
 * ponerlo: un solo escritor de su geometría. `null` si no es un piquete con
 * ancla, o si el ancla ya no cae en el contorno.
 */
export function reescribirPiquete(piece, line, cambio) {
  if (line.type !== 'notch' || !line.notchAnchor) return null;
  const pedida = { ...line.notchAnchor, distanceMm: cambio.distanciaMm ?? line.notchAnchor.distanceMm };
  const resuelta = resolveNotchAnchor(piece.outline, pedida);
  if (!resuelta) return null;
  const opciones: NotchOptions = { ...DEFAULT_NOTCH_OPTIONS, ...line.notchOptions, ...cambio.opciones };
  return {
    path: generateNotchPath(resuelta.point, resuelta.normal, opciones),
    // La que el anillo usó, no la cruda (#1124), como `confirmRefine`.
    notchAnchor: { ...line.notchAnchor, distanceMm: resuelta.distanceMm },
    notchOptions: opciones,
  };
}

const PLURAL: Record<NotchOptions['shape'], string> = {
  slit: 'rectas', 't-notch': 'en T', 'v-internal': 'V hacia adentro', 'v-external': 'V hacia afuera',
  'u-notch': 'en U', castle: 'almenas', diamond: 'rombos',
};
const numero = (mm: number) => formatMedida(mm, 'mm').replace(' mm', '');

/** «Recta · 8 × 3 mm»; con varias, «2 rectas · 8 × 3 mm» (solace-wren, 09-10). */
export function textoDelPiquete(o: NotchOptions): string {
  const medidas = `${numero(o.length)} × ${numero(o.width)} mm`;
  const n = Number(o.count ?? 1);
  if (n > 1) return `${n} ${PLURAL[o.shape]} · ${medidas}`;
  const forma = FORMAS_DE_PIQUETE.find(c => c.value === o.shape)?.label ?? o.shape;
  return `${forma} · ${medidas}`;
}
```

En `notch.tsx`, las siete alternativas pasan a `export const FORMAS_DE_PIQUETE = [ … ]` y la opción `shape` usa `choices: FORMAS_DE_PIQUETE`. `PieceProperties.tsx:267-273` pinta sus `<option>` desde esa lista: se van «Recto», «V interna», «V externa» y «Castillo».

- [ ] **Step 3: La cota de distancia y su escritura**

- `cotas.ts`: `CotaUpdate` gana `| { kind: 'piqueteElegido'; pieceId: string; lineId: string; distanciaMm: number }`, con su comentario: la escribe `PatternEditor` por `reescribirPiquete`; a diferencia de `'piquete'`, no hay sesión de herramienta detrás.
- `loQueSePone.ts`:
  - `cotasDelPiquete` devuelve solo Distancia. Se va `grupo`, porque el chip es de un campo, como el del punto. El comentario dice que la profundidad vive en la etiqueta desde P3c.
  - La función nueva:

```ts
/**
 * El piquete elegido con Seleccionar (spec 2026-10-02 § 5.2, la puerta de
 * vuelta): su distancia a la esquina, en reposo; clic o Tab la abren. Escribe
 * por el ancla, como la de lo que se pone. Lo demás está en su etiqueta.
 */
export function cotaDelPiqueteElegido(piece: PatternPiece, line: InternalLine): Cota | null {
  const anchor = line.notchAnchor;
  if (line.type !== 'notch' || !anchor) return null;
  const resuelta = resolveNotchAnchor(piece.outline, anchor);
  if (!resuelta) return null;
  const a = pieceLocalToPattern(anchor.refPoint, piece);
  const b = pieceLocalToPattern(resuelta.point, piece);
  const lado = largoDelLado(piece.outline, anchor);
  const built = buildRing(piece.outline, 2);
  const perimetro = built.ok ? built.value.totalMm : anchor.distanceMm;
  return {
    id: `${piece.id}-${line.id}-distancia`,   // state-encoded ID: la cota de esta línea
    kind: 'borde',
    label: 'Distancia',
    valueMm: anchor.distanceMm,
    unit: 'mm',
    min: 0,
    max: lado !== null ? Math.max(lado, anchor.distanceMm) : perimetro,
    ...(lado !== null ? { referenceLabel: `de ${formatMedida(lado, 'mm')}` } : {}),
    primary: true,
    scrub: false,
    a, b,
    outward: normalHaciaFuera(a, b, centroDe(piece)),
    apply: (mm) => ({ kind: 'piqueteElegido', pieceId: piece.id, lineId: line.id, distanciaMm: mm }),
  };
}
```

- `sujeto.ts`: en la rama de `selectedInternalLine`, después de `if (enQ && segmentIndex === undefined) return nada();`:

```ts
// El piquete elegido con Seleccionar enseña su distancia (P3c). En las
// demás herramientas, como antes, nada: su cota es la de lo que se pone.
if (line.type === 'notch') {
  const cota = input.activeTool === 'select' ? cotaDelPiqueteElegido(piece, line) : null;
  return { piece, caliente: false, cotas: cota ? [cota] : [], lectura: null, lecturaApagada: false,
    bordeLeido: null, disabled: Boolean(piece.locked) || Boolean(input.layerLocked[capa]), esPieza: false };
}
```

- `PatternEditor.tsx`, en `aplicarCota`, junto a `'piquete'`:

```ts
} else if (update.kind === 'piqueteElegido') {
  // Por el ancla, como al ponerlo: el path sale de la distancia y las opciones.
  const piece = pieces.find(p => p.id === update.pieceId);
  const line = piece?.internals.find(l => l.id === update.lineId);
  if (!piece || !line) return;
  const nuevo = reescribirPiquete(piece, line, { distanciaMm: update.distanciaMm });
  if (!nuevo) { noPasoNada('notch:ancla-perdida', { pieceId: piece.id, notchId: line.id }); return; }
  const accion = updateInternalLine({ pieceId: piece.id, lineId: line.id, ...nuevo });
  dispatch(token ? withUndoBatchToken(accion, token) : accion);
}
```

- [ ] **Step 4: La etiqueta del piquete en el lienzo**

`etiquetas/etiquetas.ts`, con la rama del piquete (las de la costura y la esquina devuelven `null` hasta sus tareas):
- **Cuándo hay etiqueta:** `selectedInternalLine` es un piquete con ancla que resuelve, `activeTool === 'select'`, `showNotches`, la capa no está oculta y no está `callada`.
- **Dónde va y cómo:**
  - `punto`: el del piquete sobre el borde, en patrón (`pieceLocalToPattern`).
  - `hacia`: la normal hacia dentro, girada con la pieza; se obtiene con `pieceLocalToPattern(punto + normal) − punto`, normalizado.
  - `separacionMm`: su profundidad, así la pastilla queda pasada la punta.
  - `apagada`: `piezaBloqueada`.
- **`posicionDeEtiqueta`:** `left = pan.x + punto.x·zoom + hacia.x·(separacionMm·zoom + 16)`; lo mismo para `top`.
- **`claveDeEtiqueta`:** `piquete:<pieceId>:<lineId>`. Va como `key` del componente, así que otra selección cierra el menú.
- **`presentarEtiqueta`:**
  - `texto`: `textoDelPiquete`;
  - `Dibujo`: el `icon` de su forma en `FORMAS_DE_PIQUETE`;
  - `nombre`: `Piquete: ${texto}`;
  - `nombreDelMenu`: «Opciones del piquete»;
  - `opciones`: `notchTool.options`;
  - `valores`: `{ shape, count, length, width }`.

En `PatternEditor.tsx`:

```tsx
const etiqueta = useMemo(() => etiquetaDeLaSeleccion({
  activeTool, pieces, seams, selectedInternalLine: editor.selectedInternalLine, selectedSeamId: editor.selectedSeamId,
  saSelection: editor.saSelection, showNotches, showSewingLines, showSeamAllowance, hiddenLayerIds, layerLocked,
  callada: isDraggingPiece || transformTool.isDragging || isDraggingEndpoint || ctxMenu.visible || calibrationMode !== null,
}), [/* las mismas */]);

const cambiarEtiqueta = useCallback((opcion: string, valor: unknown) => {
  if (etiqueta?.que !== 'piquete') return;   // las otras dos, en sus tareas
  const piece = pieces.find(p => p.id === etiqueta.pieceId);
  const line = piece?.internals.find(l => l.id === etiqueta.lineId);
  if (!piece || !line) return;
  const nuevo = reescribirPiquete(piece, line, { opciones: { [opcion]: valor } as Partial<NotchOptions> });
  if (!nuevo) { noPasoNada('notch:ancla-perdida', { pieceId: piece.id, notchId: line.id }); return; }
  dispatch(updateInternalLine({ pieceId: piece.id, lineId: line.id, ...nuevo }));
}, [etiqueta, pieces, dispatch]);
const avisarBloqueada = useCallback(() => dispatch(showInfoToast(
  'Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.')), [dispatch]);
```

y, justo después de `</AgruparCotas>`:

```tsx
{etiqueta && (
  <EtiquetaDeOpcion
    key={claveDeEtiqueta(etiqueta)}
    que={etiqueta.que}
    {...presentarEtiqueta(etiqueta)}
    {...posicionDeEtiqueta(etiqueta, pan2D, zoom2D)}
    apagada={etiqueta.apagada}
    alPulsarApagada={avisarBloqueada}
    alCambiar={cambiarEtiqueta}
  />
)}
```

La frase: `fase` gana `etiqueta: etiqueta?.que ?? null`. En `fraseDeLaFase`, `case 'select'`: `if (f.etiqueta === 'piquete') return 'Clic en la distancia para escribirla · la etiqueta cambia forma, cantidad y medidas · Esc suelta';` antes de `cotasVisibles`.

Un test de `PatternEditor` cierra el circuito. Con un piquete elegido y Seleccionar, la etiqueta «Piquete: Recta · 8 × 3 mm» está en el DOM. Abrirla y pulsar «En T» deja en el store `notchOptions.shape === 't-notch'`, y el `path` es el de `reescribirPiquete`.

- [ ] **Step 5: En verde, la suite y el commit**

Run: los de Step 1, luego `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` (aviso a la 1b antes).

```bash
git add src/components/PatternEditor/etiquetas src/components/PatternEditor/cotas src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/fraseDeLaFase.ts src/components/PatternEditor/__tests__ src/tools/definitions/notch.tsx src/components/PropertiesPanel/PieceProperties.tsx
git commit -m "feat(piquete): elegido con Seleccionar enseña su distancia y una etiqueta con forma, cantidad, profundidad y ancho"
```

---

### Task 4: La esquina del margen, con Seleccionar y con Margen

**Files:**
- Create: `src/utils/seam/tiposDeEsquina.ts`, `src/utils/seam/esquinaDelMargen.ts`
- Create: `src/utils/seam/__tests__/esquinaDelMargen.test.ts`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:1159-1179` (la rama del vacío)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:315-322` (Margen ya no abre Propiedades), `:1614` (el anillo también con Seleccionar), la rama `'esquina'` de `cambiarEtiqueta`
- Modify: `src/components/PatternEditor/etiquetas/etiquetas.ts` (rama de la esquina)
- Modify: `src/components/PropertiesPanel/VertexPropertiesSection.tsx:11-19`
- Modify: `src/components/PatternEditor/fraseDeLaFase.ts`
- Test: `src/components/PatternEditor/__tests__/useEditorInteractions.esquinaDelMargen.test.tsx`, `PatternEditor.margenEnElBorde.test.tsx`

**Interfaces:**
- Produces:

```ts
// src/utils/seam/tiposDeEsquina.ts
export const TIPOS_DE_ESQUINA: ReadonlyArray<{ value: CornerType; label: string }>;
export function tipoDeEsquina(piece: Pick<PatternPiece, 'cornerTypes' | 'defaultCornerType'>, vertexIndex: number): CornerType;
// src/utils/seam/esquinaDelMargen.ts
export function margenMasAncho(piece: PatternPiece): number;
export function esquinaDelMargenEn(pieces: readonly PatternPiece[], punto: Point2D, zoom: number, mostrarMargen: boolean): { pieceId: string; vertexIndex: number } | null;
```

- [ ] **Step 1: Los tests en rojo**

`src/utils/seam/__tests__/esquinaDelMargen.test.ts`. La pieza es 300 × 200 en (100, 100), con margen de 10, así que la esquina de arriba a la izquierda es el comando 0:
- `(93, 93)` a zoom 1: `{ pieceId, vertexIndex: 0 }`. Es la punta del margen, fuera del contorno.
- Con `mostrarMargen: false`, o con margen 0 en la pieza: `null`.
- Dos piezas separadas por 6 mm: el clic entre las dos esquinas elige la más cercana.
- La pieza girada 90°: el clic en la punta de su esquina la elige (`patternToPieceLocal`).
- `(140, 93)`, sobre el margen del borde y lejos de la esquina: `null`. El margen de un borde con Seleccionar sigue siendo vacío.

`useEditorInteractions.esquinaDelMargen.test.tsx` (con el molde de `useEditorInteractions.botonDerechoNoArmaExtremos.test.tsx`):
- Con Seleccionar, un mousedown izquierdo en el svg, fuera de la pieza y en la punta del margen, despacha `editor/selectSaVertices` con `{ pieceId, vertexIndex: 0 }` y no arma la goma.
- Con el botón derecho, el mismo sitio deselecciona como hoy.
- Con el margen oculto (`showSeamAllowance: false`), deselecciona y arma la goma como hoy.

`PatternEditor.margenEnElBorde.test.tsx`: junto al caso del borde, «la esquina con Margen tampoco abre Propiedades». El clic en el vértice deja `saSelection` de tipo vértice y `onOpenPanel` no se llama.

`etiquetas.test.ts`, la rama de la esquina:
- Con `saSelection` vértice, Seleccionar o Margen, y el margen a la vista, hay etiqueta `'esquina'`, con `tipo` `'mitered'` por defecto.
- `separacionMm` es el margen más ancho × √2, y `hacia` sale del centro de la pieza al vértice.
- Con Pluma, o con el margen oculto, `null`.
- Con la pieza bloqueada, sale apagada.
- `presentarEtiqueta` da «Tipo de esquina: Inglete», el menú «Tipo de esquina» y un control con las siete alternativas de `TIPOS_DE_ESQUINA`.

`fraseDeLaFase`: con `'select'` y `etiqueta: 'esquina'`, la frase es «Clic en la etiqueta para cambiar el tipo de esquina · Esc suelta».

- [ ] **Step 2: Las listas y la esquina bajo el clic**

`src/utils/seam/tiposDeEsquina.ts`: los siete de `VertexPropertiesSection.tsx:11-19`, en el mismo orden, y `tipoDeEsquina = cornerTypes?.[i] ?? defaultCornerType ?? 'mitered'`. `VertexPropertiesSection` importa la lista y borra la suya.

`src/utils/seam/esquinaDelMargen.ts`:

```ts
/** El margen más ancho de la pieza: el escalar, el de cada borde y el de cada tramo. */
export function margenMasAncho(piece: PatternPiece): number {
  const deBordes = (piece.edges ?? []).flatMap(e => [e.seamAllowanceWidth ?? 0, ...(e.seamAllowanceSpans ?? []).map(s => s.width)]);
  return Math.max(effectiveSeamAllowanceWidth(piece), 0, ...deBordes);
}

/**
 * La esquina del margen bajo un clic de Seleccionar (spec 2026-10-02 § 5.2, la
 * puerta de vuelta). La llama la rama del VACÍO: dentro del contorno neto el
 * clic es de la pieza. Solo donde el margen se ve, porque sin margen el tipo de
 * esquina no pinta nada. El radio cubre la punta (ancho·√2) más 10 px.
 * ponytail: radio con el margen más ancho de la pieza; si una esquina de margen
 * estrecho le roba el clic a una vecina, por esquina.
 */
export function esquinaDelMargenEn(pieces, punto, zoom, mostrarMargen) {
  if (!mostrarMargen) return null;
  let mejor: { pieceId: string; vertexIndex: number; dist: number } | null = null;
  for (const piece of pieces) {
    const margen = margenMasAncho(piece);
    if (!(margen > 0)) continue;
    const v = findNearestOutlineVertex(piece.outline, patternToPieceLocal(punto, piece), margen * Math.SQRT2 + 10 / zoom);
    if (v && (!mejor || v.dist < mejor.dist)) mejor = { pieceId: piece.id, vertexIndex: v.index, dist: v.dist };
  }
  return mejor && { pieceId: mejor.pieceId, vertexIndex: mejor.vertexIndex };
}
```

- [ ] **Step 3: Seleccionar la elige; Margen ya no abre Propiedades**

En `useEditorInteractions.ts`, en la rama del vacío, después de `if (trazoHit) { … }`:

```ts
// La esquina del margen se elige con un clic en su punta (spec 2026-10-02
// § 5.2, P3c): ahí el clic caía en el vacío y deseleccionaba. Solo el
// izquierdo: con el derecho, el vacío sigue soltando la selección.
if (e.button === 0 && !e.shiftKey) {
  const esquina = esquinaDelMargenEn(piezasVisibles, { x: clickX, y: clickY }, zoom2D, showSeamAllowance);
  if (esquina) {
    pushJournal('gesture', 'esquina:select', esquina);
    dispatch(selectSaVertices(esquina));
    return;
  }
}
```

`showSeamAllowance` y `hiddenLayerIds` se leen con `useSelector`, como `showTrazos`. `piezasVisibles` son las de `pieces` cuya capa no está oculta.

`PatternEditor.tsx`:
- `onSelectVertex` despacha solo `selectSaVertices`.
- El comentario de `:315-320` termina en «La esquina tampoco: su tipo está en su etiqueta (P3c)».
- `SeamAllowanceSelectionOverlay` se monta también con `activeTool === 'select' && editor.saSelection?.kind === 'vertex'`.
- La rama `'esquina'` de `cambiarEtiqueta`:

```ts
const piece = pieces.find(p => p.id === etiqueta.pieceId);
if (piece) dispatch(updatePiece({ ...piece, cornerTypes: { ...(piece.cornerTypes ?? {}), [etiqueta.vertexIndex]: valor as CornerType }, updatedAt: Date.now() }));
```

- [ ] **Step 4: La etiqueta de la esquina**

`etiquetas.ts`, la rama de la esquina:
- **Cuándo hay etiqueta:** `saSelection` es de tipo vértice con un solo ítem, `activeTool` es `'select'` o `'seamAllowance'`, `showSeamAllowance` está encendido, `margenMasAncho(piece) > 0`, la capa no está oculta y no está `callada`. El comando del índice es `M` o `L`.
- **Dónde va:**
  - `punto`: el vértice, en patrón.
  - `hacia`: del centro de la caja de la pieza (`centroDe`) al vértice, normalizado. ponytail: en una esquina cóncava apunta hacia dentro; la bisectriz, si molesta.
  - `separacionMm`: `margenMasAncho(piece) · √2`.
- **Qué dice:**
  - `tipo`: `tipoDeEsquina(piece, vertexIndex)`.
  - `apagada`: `piezaBloqueada`.
  - `presentarEtiqueta`: el `texto` es la etiqueta del tipo, `nombre` «Tipo de esquina: {texto}», el menú «Tipo de esquina». La opción es `{ id: 'cornerType', label: 'Tipo de esquina', type: 'select', value: 'mitered', choices: TIPOS_DE_ESQUINA }`.

`fraseDeLaFase`: la frase de la esquina en `'select'`. La de Margen no cambia: «esquina: su tipo» sigue siendo cierto.

- [ ] **Step 5: En verde, la suite y el commit**

```bash
git add src/utils/seam/tiposDeEsquina.ts src/utils/seam/esquinaDelMargen.ts src/utils/seam/__tests__/esquinaDelMargen.test.ts src/components/PatternEditor src/components/PropertiesPanel/VertexPropertiesSection.tsx
git commit -m "feat(margen): la esquina se elige con Seleccionar en su punta y su tipo sale en una etiqueta; Margen ya no abre Propiedades"
```

---

### Task 5: La costura: su etiqueta, y «Tipo de costura» sale del pie

**Files:**
- Create: `src/utils/seam/tiposDeCostura.ts`, `src/utils/seam/tramoCosido.ts`
- Modify: `src/components/PatternEditor/renderers/SeamRenderer.tsx:98-104` (usa `tramoCosido`)
- Modify: `src/tools/definitions/seam.tsx:29-42` (sin opciones), `src/tools/definitions/scissors.tsx:38-48` (la lista)
- Modify: `src/components/PatternEditor/useFreeSewingTool.ts:33-35`, `src/components/Viewport3D/Sew3DTool.tsx:130-133,224`
- Modify: `src/components/PropertiesPanel/SeamPropertiesPanel.tsx:117-129`, `src/components/PropertiesPanel/PropertiesPanel.tsx:28-34`
- Modify: `src/components/PatternEditor/etiquetas/etiquetas.ts` (rama de la costura), `PatternEditor.tsx` (rama `'costura'` de `cambiarEtiqueta`), `fraseDeLaFase.ts`
- Modify: `src/tools/__tests__/idiomaDeOpciones.test.ts:63-65,233-235`, `src/components/PatternEditor/__tests__/useFreeSewingTool.seamType.test.ts`

**Interfaces:**
- Produces:

```ts
// src/utils/seam/tiposDeCostura.ts
export const TIPOS_DE_COSTURA: ReadonlyArray<{ value: Seam['type']; label: string }>;
export function nombreDelTipoDeCostura(tipo: Seam['type']): string;
// src/utils/seam/tramoCosido.ts
export function tramoCosido(piece: PatternPiece, mitad: Seam['pieceA'], invertida?: boolean): Point2D[];
```

- [ ] **Step 1: Los tests en rojo**

- `idiomaDeOpciones.test.ts`:
  - `ESPERADO` pierde `seam`.
  - Un caso nuevo: «Coser no declara opciones: el tipo de costura vive en su etiqueta (P3c)», con `expect(toolRegistry.getTool('seam')!.options ?? []).toEqual([])`.
  - «los identificadores de los choices siguen en inglés» lee el `seamType` de `scissors`.
- `useFreeSewingTool.seamType.test.ts`: «la costura nueva nace Normal aunque quede un tipo viejo en toolOptions». Con `setToolOption({ toolId: 'seam', optionId: 'seamType', value: 'french' })`, la costura creada tiene `type: 'standard'`.
- `src/utils/seam/__tests__/tramoCosido.test.ts`: el tramo de una costura con rango `[0,25 ; 0,75]` sobre un lado recto de 200 mm va de 50 a 150 mm, desplazado por la `position` de la pieza. Es la misma cuenta que pintaba `SeamRenderer`.
- `etiquetas.test.ts`, la rama de la costura:
  - con `selectedSeamId` y Seleccionar, Coser o Editar costuras, y `showSewingLines`: etiqueta `'costura'`;
  - `punto` es el medio de su mitad A y `hacia` va hacia dentro de la pieza A; nunca está apagada;
  - con Pluma, con «Costuras» apagado o con la capa de A oculta: `null`;
  - `presentarEtiqueta` da «Tipo de costura: Normal», el menú «Tipo de costura» y el control con las cuatro alternativas.
- `fraseDeLaFase`:
  - costura con Seleccionar: «Clic en la etiqueta para cambiar el tipo de costura · Esc suelta»;
  - `seamEdit` con costuras: «Clic en un lado para ver con qué está cosido y cambiar el tipo de costura».
- Los de Propiedades que fijen «Estándar» o «Sobrecargada» pasan a «Normal» y «Flat-felled». Se encuentran con `grep -rn "Sobrecargada\|Estándar\|sobrecargada" src`.

- [ ] **Step 2: Las listas, el tramo y Coser sin opciones**

- `tiposDeCostura.ts`: Normal, Francesa, Flat-felled y Overlock, con su comentario (glosario #1049, un término por concepto).
  - `scissors.tsx` toma de ahí sus `choices`.
  - `SeamPropertiesPanel` pinta sus `<option>` de la lista.
  - `PropertiesPanel` pinta la insignia con `label.toLowerCase()`.
- `tramoCosido.ts` sale de `SeamRenderer.tsx:98-104` sin cambiar la cuenta: `resolveEdgePolyline`, más `slicePolylineByT` si hay rango, más la `position` de la pieza. Ignora el giro, como el renderer (#1068), y el comentario lo dice. `SeamRenderer` lo llama para `polyA` y `polyB`.
- `seam.tsx`:
  - pierde `options`;
  - el comentario apunta a P3c («Tipo de costura» vive en la etiqueta de la costura, § 5.3);
  - la descripción del copiloto que nombra «French seam» se queda: es de la herramienta, no de la opción.
- `useFreeSewingTool.ts` y `Sew3DTool.tsx`: fuera el `useSelector` del tipo. La costura se crea con `'standard'` y el comentario lo explica.

- [ ] **Step 3: La etiqueta de la costura**

`etiquetas.ts`, la rama de la costura:
- **Cuándo hay etiqueta:** con `selectedSeamId` cuya costura existe, `activeTool` en `{'select', 'seam', 'seamEdit'}`, `showSewingLines` encendido, la capa de A sin ocultar y nada `callada`.
- **Dónde va:**
  - `punto`: `samplePolyline(tramoCosido(pieceA, seam.pieceA), 0.5).point`. Con menos de dos puntos, `null`. ponytail: sin tramo resuelto no hay etiqueta; el renderer cae al medio del primer comando.
  - `hacia`: del punto al centro de la caja de A, normalizado.
  - `separacionMm`: 0, y `posicionDeEtiqueta` suma 24 px en vez de 16 para la costura, para no tapar sus largos.
- **Qué dice:** `tipo` es `seam.type`, y nunca está apagada.

`PatternEditor.tsx`, rama `'costura'`:

```ts
const seam = seams.find(s => s.id === etiqueta.seamId);
if (seam) dispatch(updateSeam({ ...seam, type: valor as Seam['type'] }));
```

Y `fraseDeLaFase`, las dos frases.

- [ ] **Step 4: En verde, la suite y el commit**

```bash
git add src/utils/seam/tiposDeCostura.ts src/utils/seam/tramoCosido.ts src/utils/seam/__tests__/tramoCosido.test.ts src/components/PatternEditor src/tools src/components/Viewport3D/Sew3DTool.tsx src/components/PropertiesPanel
git commit -m "feat(costura): su tipo sale en una etiqueta al elegirla; «Tipo de costura» deja la línea al pie de Coser"
```

---

### Task 6: E2e, trinquetes y notas

**Files:**
- Create: `tests/e2e/la-puerta-de-vuelta.spec.ts`
- Modify: `tests/e2e/la-cota-de-lo-que-se-pone.spec.ts:79-99` (la profundidad ya no está a un Tab)
- Modify: `tests/e2e/superficies-por-accion.spec.ts`, `tests/e2e/contraste-del-cromo.spec.ts`
- Modify: `tests/e2e/superficies-baseline.json`, `tests/e2e/contraste-baseline.json` (solo por `*_UPDATE=1`)
- Modify: `scripts/deploy-prod.sh` (el spec nuevo en la lista, después de `la-cota-de-lo-que-se-pone.spec.ts`)
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (nota de P3c al final de § 5.2)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2, la etiqueta)

- [ ] **Step 1: El e2e**

`tests/e2e/la-puerta-de-vuelta.spec.ts`, con el molde de `la-cota-de-lo-que-se-pone.spec.ts`:
- **Montaje:** viewport de 1366 × 768, `abrirAppVacia` y `addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200)`. El borde de arriba va de (100, 100) a (400, 100).
- **Ayudantes:**
  - `etiqueta(page, nombre)` = `page.getByRole('button', { name: nombre })`;
  - `menu(page, nombre)` = `page.getByRole('group', { name: nombre })`;
  - lectores del store para `internals`, `cornerTypes` y `seams`.

Casos:
1. **'el piquete se elige con Seleccionar: su distancia en reposo y su etiqueta'**
   - Shift+N, `clickAt({ x: 160, y: 100 })` y Esc: hay un piquete a 60.
   - `activarHerramienta(page, 'z', 'select')` y `clickAt({ x: 160, y: 104 })`.
   - Se ve `etiqueta('Piquete: Recta · 8 × 3 mm')`.
   - Se ve `button.cota[aria-label^="Distancia"]` y no hay ningún `input.cota--editando`: descansa.
   - Clic en la etiqueta, «En T» dentro de `menu('Opciones del piquete')`: `notchOptions.shape` vale `'t-notch'`, y la etiqueta dice «Piquete: En T · 8 × 3 mm».
   - «Sumar» en la fila de `#etiqueta-length`: `length` vale 9.
   - Ctrl+Z: `length` vuelve a 8 (Review Focus 2).
   - Esc cierra el menú y la etiqueta sigue. Otro Esc y la etiqueta ya no está.
2. **'la distancia del piquete elegido se escribe y mueve el ancla'**
   - Piquete puesto, Seleccionar y clic sobre él.
   - Clic en la cota en reposo, «150» y Enter: `notchAnchor.distanceMm` ≈ 150.
3. **'la esquina del margen se elige con Seleccionar en su punta y cambia de tipo'**
   - `dispatch(page, 'project/batchSetSeamAllowance', { pieceIds: ['p1'], width: 10 })` y Seleccionar.
   - `clickAt({ x: 93, y: 93 })`: se ve `etiqueta('Tipo de esquina: Inglete')`.
   - «Cuadrada» en `menu('Tipo de esquina')`: `cornerTypes[0]` vale `'squared'`.
   - Esc dos veces, y `clickAt({ x: 104, y: 104 })`, dentro de la pieza junto al vértice: la pieza queda seleccionada (`selectedPieceIds` = `['p1']`) y no hay etiqueta de esquina (Review Focus 1).
4. **'Margen: el clic en la esquina trae su etiqueta y no abre Propiedades'**
   - Con el margen de 10, `activarHerramienta(page, 'o', 'seamAllowance')` y `clickAt({ x: 100, y: 100 })`.
   - Se ve la etiqueta de la esquina y `.context-panel` tiene 0 elementos.
5. **'la costura recién cosida trae su etiqueta; Editar costuras la vuelve a traer; Seleccionar no pinta costuras'**
   - `activarHerramienta(page, 'n', 'seam')`, `clickAt({ x: 100, y: 200 })` y `clickAt({ x: 400, y: 200 })`: se ve `etiqueta('Tipo de costura: Normal')`.
   - «Francesa» en el menú: `seams[0].type` vale `'french'`.
   - Esc, para soltar. `activarHerramienta(page, 'b', 'seamEdit')` y `clickAt({ x: 100, y: 200 })`: se ve `etiqueta('Tipo de costura: Francesa')`.
   - Esc, `activarHerramienta(page, 'z', 'select')`: `.seam-connection` tiene 0 elementos (#210).
6. **'el teclado: Enter abre con el foco dentro, Esc lo devuelve'**
   - Piquete elegido; `etiqueta(…).focus()` y Enter: el foco está dentro de `menu('Opciones del piquete')`.
   - Esc: el menú no está y el foco está en la etiqueta (Review Focus 4).
7. **'en Split, la etiqueta cae dentro de la hoja'**
   - Viewport de 1366 × 643, `cambiarVista(page, 'Split')`, piquete elegido.
   - `elementFromPoint` en el centro de la etiqueta devuelve la etiqueta o un hijo suyo.

Si un clic no cae sobre el borde o la punta, se mide con `elementFromPoint` antes de tocar coordenadas.

- [ ] **Step 2: Correrlo contra el 5181**

Run: `VINA_E2E_PORT=5181 npx playwright test tests/e2e/la-puerta-de-vuelta.spec.ts --workers=1`
Expected: 7/7.

- [ ] **Step 3: El e2e que ponía la profundidad con Tab**

`la-cota-de-lo-que-se-pone.spec.ts`, caso 3, pasa a llamarse «“Ajustar distancia…” abre la misma cota». Se escribe «90» y Enter: la distancia queda ≈ 90. La profundidad ya no está a un Tab: se comprueba que solo existe el campo «Distancia». La profundidad la cubre el caso 1 de `la-puerta-de-vuelta`.

- [ ] **Step 4: Trinquetes**

`superficies-por-accion.spec.ts`, en el describe del rectángulo sembrado (300 × 400 en (120, 120)):
- **'elegir un piquete (Z)':** se pone un piquete con Shift+N en (120, 320), Esc y `activarHerramienta(page, 'z', 'select')`. La medida es `medirAccion(page, [() => clickAt(page, { x: 124, y: 320 })])`.
- **'elegir una esquina del margen (Z)':** primero `batchSetSeamAllowance` de 10 y Seleccionar. La medida es `[() => clickAt(page, { x: 113, y: 113 })]`.
- **'abrir la etiqueta del piquete':** el piquete ya elegido. La medida es `[() => page.getByRole('button', { name: /^Piquete:/ }).click()]`.

`contraste-del-cromo.spec.ts`: un test «la etiqueta del piquete, abierta» que, con el piquete elegido y su menú abierto, hace `registrar('etiqueta del piquete abierta', page)`.

Run, con el Vite caliente en el 5181 y sin tocar la app:
- `VINA_E2E_PORT=5181 SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1`
- `VINA_E2E_PORT=5181 CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`

Expected:
- los estados nuevos quedan en ≤ 4: elegir 2, abrir 1;
- «etiqueta del piquete abierta» queda en 0;
- `git diff tests/e2e/*-baseline.json` no sube ningún estado que ya existía.

- [ ] **Step 5: El gate, la spec, el contrato y el commit**

- `scripts/deploy-prod.sh`: `  tests/e2e/la-puerta-de-vuelta.spec.ts \` después de `la-cota-de-lo-que-se-pone.spec.ts`. El archivo sigue en LF, y `bash -n` y `tests/repo/el-gate-corre-los-trinquetes.test.ts` pasan.
- La spec, al final de § 5.2:

> **Nota del plan de P3c (2026-10-09).** La etiqueta de opción es una pastilla de papel que abre los mismos controles de la línea al pie, pero para ese objeto.
> - **El piquete** elegido con Seleccionar enseña su distancia en reposo y una etiqueta con forma, cantidad, profundidad y ancho. La profundidad deja el chip de lo que se pone.
> - **La esquina del margen** se elige con un clic de Seleccionar en la punta del margen, o con Margen, y su etiqueta da el tipo. Margen ya no abre Propiedades.
> - **La costura** enseña su tipo cuando está elegida: la deja elegida Coser al terminarla, y la elige Editar costuras con un clic en su lado. **La costura no se elige con Seleccionar:** la firma de María #210 pide que con Seleccionar no se pinte ninguna («solo debería verse al activar el menu de costuras»), así que su puerta de vuelta es Editar costuras.
> - **«Tipo de costura» sale de la línea al pie:** una costura nueva nace Normal y se cambia en su etiqueta. Tijeras conserva el suyo.
> - **Propiedades** usa los mismos nombres que el pie.

- `.claude/skills/contrato-de-interfaz/SKILL.md`, § 2, después de «Variantes declaradas»: «**La etiqueta de opción** (`PatternEditor/etiquetas/EtiquetaDeOpcion.tsx`, P3c) es la única pastilla de opciones sobre la hoja: es `cabina`, es papel, y su menú lleva los controles de la línea al pie (`Control`), no una lista nueva.»

```bash
git add tests/e2e/la-puerta-de-vuelta.spec.ts tests/e2e/la-cota-de-lo-que-se-pone.spec.ts tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-del-cromo.spec.ts tests/e2e/superficies-baseline.json tests/e2e/contraste-baseline.json scripts/deploy-prod.sh docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md .claude/skills/contrato-de-interfaz/SKILL.md
git commit -m "test(e2e): la puerta de vuelta entra al gate; los trinquetes miden elegir y abrir la etiqueta"
```

---

## Después de las tareas

1. **Revisión final** con un subagente Opus sobre el diff de la rama, con este plan, la spec y el Review Focus. Se le prohíbe por escrito commitear, hacer push, desplegar o correr `deploy-prod.sh`. Si muta, `git checkout --` tras cada mutación y `git status` limpio al entregar.
2. **Un solo pase de arreglos**, cada uno con su test en rojo antes y la suite entera en verde.
3. **Ensayo del deploy:** `VINA_E2E_PORT=5181 bash scripts/deploy-prod.sh --ensayo`, en verde. Antes se le avisa a la sesión de la 1b, porque no deben correr dos gates a la vez, y se mira la CPU.
4. **Capturas** por CDP, a 1366 × 643 y en Split: la etiqueta del piquete con su menú, la de la esquina y la de la costura recién cosida.
5. **Push, PR, merge y deploy**, solo con la orden de Samuel.
