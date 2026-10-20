# La interfaz en papel — P2b (la línea al pie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la herramienta activa se diga en una franja del marco al pie de la ventana —su nombre y su tecla, todas sus opciones como botones a un clic y una frase que cabe en una línea—, que la tarjeta de la esquina desaparezca, y que la hoja pase a ser papel.

**Architecture:** `AppShell` monta la línea al pie como tercera fila de la ventana (después de `.canvas-area`), con una ranura vacía para la sección del patrón. `PatternEditor` la llena por portal con `SeccionDelPatron`, porque la frase sale del estado local de sus herramientas (fases de la Pluma, de Coser, de Abrir la pieza…). Las opciones se pintan con `ToolOptionControls.tsx` reescrito: botones segmentados, número con Restar y Sumar, interruptor, color y, con más de ocho alternativas, lista. La frase es una función pura (`fraseDeLaFase.ts`) que sustituye al `<text>` de SVG de `HintText.tsx`. Cuando no caben, las opciones que sobran pasan a «Más», un menú de papel colgado de `<body>`.

**Tech Stack:** React 18 + TypeScript, Redux Toolkit, CSS con custom properties, Vitest (jsdom + lectura de fuentes), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` — § 3 (leyes 3, 4 y 6), § 5.1 (cuentas por acción), § 5.2 (rangos del piquete), § 5.3 (la línea al pie), § 5.4 (la frase), § 7.2 (el ámbito de papel: la hoja lo gana cuando se va la tira), § 8 (lo que se borra: la tarjeta y las líneas «Editando: …»), § 9 (vocabulario `pie`, trinquetes), § 10 (enmienda del contrato: la excepción de la tira), § 11 (fila P2) y § 12 (la pantalla de María).

**Rama:** `feat/interfaz-en-papel-p2b`, desde `main` en `ff6ec1aa` (P1b y P2a ya mergeadas y desplegadas). Este plan es su primer commit.

**Sin ensayo previo.** P0, P1b y P2a se ensayaron enteras antes de entregar el plan. Esta vez Samuel pidió velocidad («dale con todo papa, échale pichón que vamos a sacar el producto pronto»), así que el plan se ejecuta en línea justo después de escrito, con TDD en cada tarea y la revisión independiente al final. Lo que el código real contradiga se decide en el ledger como `Ruling:`. Los anchos en píxeles de este plan (presupuestos de la frase, lo que mide cada control) son estimaciones a 6,2 px por carácter: los e2e de la Task 3 y la Task 4 los miden en Chrome, y mandan ellos.

## Global Constraints

- **La línea al pie** (§ 5.3): una franja al pie de la ventana, de lado a lado, del material y del alto de la barra superior (`--bg-deeper`, `--top-bar-h`: 36 px a 1366). Está siempre, con cualquier herramienta y en cualquier vista. De izquierda a derecha: quién (icono, nombre y tecla de la herramienta activa del patrón), sus opciones, la frase. No empuja ni se mueve: es una fila de la ventana, la hoja termina encima, y la marca de escala y los márgenes están en el mismo sitio con cualquier herramienta.
- **Las opciones son botones, no listas** (§ 5.3): todas las alternativas a la vista y a un clic; las siete formas del piquete como siete botones con su dibujo; la cantidad como «1 2 3»; un número con sus botones de menos y más. Lista desplegable solo con más de ocho alternativas. Cambiar una opción se refleja al instante en lo que se va a poner. El ancho del piquete gana aquí su sitio, y los rangos son los del panel: profundidad de 1 a 30 mm, ancho de 1 a 20 mm (§ 5.2).
- **Cómo se reparte el ancho** (§ 5.3): la herramienta ocupa lo que necesita; dentro de la sección del patrón se recorta primero la frase, que conserva al menos 200 px; las opciones que aun así no quepan pasan a un botón «Más» al final. A 1366 px y en Split, las cuatro opciones del piquete caben enteras con su frase.
- **La frase** (§ 5.4): una línea en `--text-secondary`, después de las opciones. Recibe `desenlace` (4 s), `falta` y la frase de la fase, con esa prioridad; un desenlace entra resaltado. Región viva (`aria-live="polite"`) montada siempre. No se calla por haber usado algo una vez. Cabe en una línea, y ninguna tecla pierde su único anuncio. Ganan frase Punto, Piquete, Medir y Tijeras. Las líneas «Editando: …» de `sujeto.ts` se van. El texto de cada frase se fija con el glosario y la skill `solace-wren` (Task 2 trae la tabla).
- **La hoja gana el ámbito de papel** (§ 7.2): `.pattern-editor` lleva `data-material="papel"` cuando se va la tira, que es la última superficie oscura que vivía encima.
- **Superficies** (§ 9): la línea al pie es `ambiente`; sus opciones, `pie` (cuentan cuando aparecen); la frase, `pista`. El vocabulario gana `pie` y pierde `tira`. El menú «Más» es `menu`. Todo portal nace papel.
- **Textos nuevos**, en español de Venezuela, sentence case, sin «¡» ni «por favor»: «Herramienta activa» (el grupo, para el lector de pantalla; se conserva el de la tarjeta), «Más» (el botón de las opciones plegadas), «Más opciones de <herramienta>» (su menú), «Restar» y «Sumar» (los botones de un número), «Margen del próximo clic (mm)», «Forma» (antes «Forma del piquete»), «1», «2», «3» (antes «Uno», «Dos», «Tres»), «Ancho (mm)», y las frases de la Task 2.
- Ningún color escrito a mano (R3 no sube), ningún `var(--x, respaldo)` (R1), ninguna referencia a un token que no existe (R2), ningún `z-index` literal (R8), todo `:hover` con su `:focus-visible` (R5). Dentro del papel no se pinta con `--bg-surface`, `--bg-base` ni `--bg-deeper`. `scripts/ui-contract-baseline.json` solo con `node scripts/ui-contract-lint.mjs --update`, en la tarea que bajó el contador.
- Typecheck: `npx tsc -b --noEmit` (nunca `tsc --noEmit` a secas). Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Sin `--no-verify`.
- `git add` con rutas explícitas; nunca `git add -A` ni `git add .`. Los borrados, con `git rm`; los movimientos, con `git mv`. `.maria-avatar.mjs` no se commitea. Los mensajes de commit terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- E2E: el servidor de `http://localhost:5174` tiene que ser el de ESTE árbol de trabajo (`npx vite --port 5174 --strictPort`, y `curl -s http://localhost:5174/app/ | grep -o "<title>[^<]*</title>"` devuelve `<title>Vina — Patronaje y simulación 3D</title>`). Siempre `--workers=2` o menos. Mientras corre un e2e no se edita ningún archivo que la app importe. `page.screenshot` se cuelga en esta app después de «fonts loaded» (2026-10-04): los e2e miden geometría, y las capturas salen por CDP (`Page.captureScreenshot`).
- Cada cosa que cambia lo que se ve se mira a 1366 × 643, que es el Chrome de María, y en Split (§ 12).
- Toda superficie nueva nace instrumentada (`pushJournal('ui', …)`): las opciones ya pasan por Redux, que la bitácora registra entera (`journalMiddleware.ts`); el plegado en «Más» y su menú, no.
- Línea base de un trinquete: solo con su variable `*_UPDATE=1` y `--retries=0 --workers=1`. Nunca a mano.
- No se hace push, ni PR, ni deploy sin que Samuel lo diga. El deploy es local: `bash scripts/deploy-prod.sh`; `--ensayo` corre todo menos el envío, y cualquier otro argumento se ignora y despliega.

## Review Focus

Lo que la spec da por hecho y ningún caso feliz prueba. Cada línea tiene su test en la tarea que se indica.

1. **Una ventana más estrecha que la de María** (1280 px, 1100 px): la línea al pie no se desborda, las opciones que no caben pasan a «Más», la frase conserva sus 200 px, y lo plegado se alcanza también con el teclado. → Task 4 (unitario con medidas de mentira; e2e a 1100 con Desplazar contorno).
2. **Escribir en un campo de la línea al pie**: las letras no cambian de herramienta, y la sección sigue siendo contexto 2D de los atajos (si no, una tecla del 3D se dispararía con el foco en un botón del pie). → Task 3 (unitario: `data-shortcut-context="2d"`; los campos ya están exentos en `ShortcutProvider`).
3. **Cambiar a 3D**: la sección del patrón se va (no hay hoja que explicar) y la franja se queda, en el mismo sitio y con el mismo alto. → Task 3 (e2e en las tres vistas).
4. **Una posición de la barra de IA guardada antes de P2b**, encima de donde ahora está la línea al pie: al cargar, la barra sube por encima de la línea. → Task 3 (unitario de `barPosition`).
5. **El modal del piquete abierto** (vive hasta P3): la sección no recibe el foco ni deja cambiar una opción por debajo, y su menú «Más» se cierra. → Task 3 (unitario de #1125, con botones de verdad) y Task 4 (el menú se cierra con `inerte`).

## Decisiones de este plan

Lo que la spec no decide y este plan sí. Cada una con lo que cuesta si está mal.

1. **La sección del patrón se pinta por portal desde `PatternEditor`.** La frase depende del estado local de una docena de herramientas; subirlo al store sería un trabajo de arquitectura que la spec no pide. `AppShell` solo deja la ranura. Si mañana la frase se quiere fuera de `PatternEditor`, es mover un cálculo, no un componente. La sección del 3D (P5) entrará igual, por su propia ranura.
2. **En 3D la sección del patrón no se pinta.** Las opciones de una hoja que no se ve son ruido; la franja se queda (el marco no salta) y espera a su sección del 3D en P5.
3. **Todo número es un campo con Restar y Sumar**, también los que hoy son deslizadores (§ 5.3). El campo `control: 'slider' | 'input'` de `ToolOption` se borra con sus 18 usos: ya no lo lee nadie. Los botones de paso no entran en el orden del teclado: con el foco en el campo, las flechas hacen lo mismo.
4. **«Margen del próximo clic» se escribe al teclear**, acotado a 0-50 mm, como las demás opciones (§ 5.3: «se refleja al instante»). Hasta hoy se confirmaba con Enter o al salir del campo (#1100). Lo que cuesta: teclear «18,5» pasa por 1 y 18 en el camino; es el margen del próximo clic, no el de ninguna pieza.
5. **El piquete:** el dibujo de cada forma sale de `generateNotchPath`, la misma geometría que pinta el lienzo; «Forma» y no «Forma del piquete» (el nombre de la herramienta está al lado); cantidad «1 2 3»; profundidad de 1 a 30 y ancho de 1 a 20 (los del panel). El orden es el de la spec: forma, cantidad, profundidad, ancho.
6. **El tamaño del próximo rectángulo pasa a su frase** («un clic crea uno de 300 × 150 mm»): era la única línea de la tarjeta que no empezaba por «Editando:».
7. **Copy** (Task 2, con `solace-wren`): las frases largas se acortan para que quepan junto a sus opciones, conservando todas las teclas. Cuatro avisos de `noPasoNada` cambian: el de Tijeras decía «arrastra de borde a borde» y la herramienta usa dos clics; el del pespunte decía «en la tira»; dos del piquete eran demasiado largos para caber junto a sus cuatro opciones. Si María no entiende una frase, se cambia en un sitio: `fraseDeLaFase.ts`.
8. **`--surface-overlay-border-flush` y `--surface-overlay-shadow-sheet` se van con la tira**, su único consumidor (§ 7.5 daba `-sheet` a P6). Lo que cuesta si está mal: nada, P6 tendría un token menos que borrar.
9. **La barra de IA se queda encima de la línea al pie**: `barPosition.ts` mide `.linea-al-pie` como ya mide `.top-bar`. `--band-bar` no cambia: la distancia de la barra al borde de la hoja es la misma; se va en P2c.
10. **«Más» se abre hacia arriba, cuelga de `<body>` y es papel**, como «Mostrar» en la barra superior. Escape lo cierra y también llega al lienzo, como con «Mostrar»: la escalera de Escape es de P2c.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/tools/types.ts` | `choices[].icon`; se borra `control` | 1 |
| `src/tools/definitions/notch.tsx` | forma con dibujo, cantidad «1 2 3», profundidad 1-30, ancho 1-20 | 1 |
| `src/tools/definitions/{dart,extendTrim,offsetOutline,rectangle,topstitchFree,topstitchSeamline,topstitchSegment,trace,triangle,trimPlace}.tsx` | fuera `control: 'input'` | 1 |
| `src/components/PatternEditor/ToolOptionControls.tsx` (+ `.css`, nuevo) | los controles de una opción, en botones | 1 |
| `src/styles/layout.css` | el interruptor del pie comparte reglas con el de la barra; `.linea-al-pie` | 1, 3 |
| `src/components/PatternEditor/fraseDeLaFase.ts` (nuevo) | la frase de la fase y su prioridad | 2 |
| `src/components/PatternEditor/noPasoNada.ts` | cuatro avisos | 2 |
| `src/components/PatternEditor/SeccionDelPatron.tsx` (+ `.css`, nuevos) | quién, opciones, frase; «Más» | 3, 4 |
| `src/components/PatternEditor/cuantasCaben.ts` (nuevo) | cuántas opciones caben | 4 |
| `src/components/shell/herramientaParaMostrar.ts` (nuevo) | nombre e icono de cualquier herramienta (sale de `LeftDock.tsx`) | 3 |
| `src/components/shell/AppShell.tsx` | la línea al pie y su ranura | 3 |
| `src/components/PatternEditor/PatternEditor.tsx` | el portal, la frase, la hoja en papel; fuera la tarjeta y `HintText` | 3 |
| `src/components/PatternEditor/cotas/sujeto.ts` | fuera `lineaDeSujeto` | 3 |
| `src/components/PatternEditor/cotas/CotaChip.tsx` | Tab desde el último chip va a la línea al pie | 3 |
| `src/components/shell/barPosition.ts` | la barra de IA no baja de la línea al pie | 3 |
| `src/styles/tokens.css` | fuera `-border-flush` y `-shadow-sheet`; comentario de `--ink-hint` | 3 |
| Borrados | `ToolStrip2D.tsx`, `ToolStrip2D.css`, `renderers/HintText.tsx` y sus 7 tests | 3 |
| `tests/e2e/linea-al-pie.spec.ts` (desde `emplazamiento-tira.spec.ts`) | la red de la línea al pie | 3, 4 |
| `tests/e2e/contraste-del-cromo.spec.ts` y las tres líneas base | trinquetes | 5 |
| `.claude/skills/contrato-de-interfaz/SKILL.md`, la spec | enmiendas | 5 |

---

### Task 1: Las opciones son botones

**Files:**
- Modify: `src/tools/types.ts:45-60`
- Modify: `src/tools/definitions/notch.tsx`
- Modify: `src/tools/definitions/{dart,extendTrim,offsetOutline,rectangle,topstitchFree,topstitchSeamline,topstitchSegment,trace,triangle,trimPlace}.tsx` (solo la línea o el trozo `control: 'input',`)
- Rewrite: `src/components/PatternEditor/ToolOptionControls.tsx`
- Create: `src/components/PatternEditor/ToolOptionControls.css`
- Modify: `src/styles/layout.css:58-84` (selectores del interruptor)
- Test: Create `src/components/PatternEditor/__tests__/ToolOptionControls.test.tsx`, Create `src/tools/__tests__/piquete-al-pie.test.tsx`, Modify `src/tools/__tests__/donde-se-teclea-un-numero.test.tsx`, Modify `src/tools/__tests__/idiomaDeOpciones.test.ts`, Modify `src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx` (provisional: se borra en la Task 3)

**Interfaces:**
- Consumes: `ToolOption` de `src/tools/types.ts`; `generateNotchPath`, `DEFAULT_NOTCH_OPTIONS` de `src/utils/notches.ts`.
- Produces: `Control({ opcion, valor, alCambiar }: { opcion: ToolOption; valor: unknown; alCambiar: (v: unknown) => void })`, que devuelve `<div className="opcion-del-pie">…</div>`. Ids: `opcion-<id>` en el campo (número), en el grupo de botones (`role="group"`, nombrado por `opcion-<id>-rotulo`), en el interruptor, en la lista y en el color. Botones de paso con `aria-label` «Restar» y «Sumar» y `tabIndex={-1}`. `ToolOption.choices[].icon?: React.FC<{ size?: number }>`. `ToolOption.control` deja de existir.

- [ ] **Step 1: Escribe los tests que fallan**

`src/components/PatternEditor/__tests__/ToolOptionControls.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Control } from '../ToolOptionControls';
import type { ToolOption } from '../../../tools/types';

/**
 * Las opciones de una herramienta en la línea al pie (spec 2026-10-02 «la
 * interfaz en papel» § 5.3): «las opciones son botones, no listas». Todas las
 * alternativas a la vista y a un clic; una lista solo con más de ocho; un
 * número con sus botones de menos y más.
 */
afterEach(cleanup);

const Dibujo: React.FC<{ size?: number }> = () => <svg data-testid="dibujo" />;

function pintar(opcion: ToolOption, valor: unknown = opcion.value) {
  const alCambiar = vi.fn();
  render(<Control opcion={opcion} valor={valor} alCambiar={alCambiar} />);
  return alCambiar;
}

const lista: ToolOption = {
  id: 'tipo', label: 'Tipo', type: 'select', value: 'a',
  choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }],
};
const cantidad: ToolOption = {
  id: 'count', label: 'Cantidad', type: 'select', value: 1,
  choices: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }],
};
const profundidad: ToolOption = { id: 'length', label: 'Profundidad (mm)', type: 'number', value: 8, min: 1, max: 30, step: 1 };

describe('hasta ocho alternativas son botones', () => {
  it('un botón por alternativa, todas a la vista, y la elegida marcada', () => {
    pintar(lista, 'b');
    const grupo = screen.getByRole('group', { name: 'Tipo' });
    expect(grupo.id).toBe('opcion-tipo');
    expect(within(grupo).getByRole('button', { name: 'Opción A' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(grupo).getByRole('button', { name: 'Opción B' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('un clic da el valor con su tipo: un número sigue siendo número', () => {
    const alCambiar = pintar(cantidad);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(alCambiar).toHaveBeenLastCalledWith(2);
  });

  it('un valor guardado como texto marca igual su botón (la lista vieja guardaba "2")', () => {
    pintar(cantidad, '2');
    expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('con dibujo, el botón enseña el dibujo y se llama como su alternativa', () => {
    const forma: ToolOption = {
      id: 'shape', label: 'Forma', type: 'select', value: 'slit',
      choices: [{ label: 'Recta', value: 'slit', icon: Dibujo }, { label: 'En T', value: 't-notch', icon: Dibujo }],
    };
    pintar(forma);
    const recta = screen.getByRole('button', { name: 'Recta' });
    expect(recta.querySelector('[data-testid="dibujo"]')).not.toBeNull();
    expect(recta.textContent).toBe('');
    expect(recta.getAttribute('title')).toBe('Recta');
  });

  it('con más de ocho, una lista desplegable que devuelve el valor con su tipo', () => {
    const nueve: ToolOption = {
      id: 'avio', label: 'Avío', type: 'select', value: 1,
      choices: Array.from({ length: 9 }, (_, i) => ({ label: `Avío ${i}`, value: i })),
    };
    const alCambiar = pintar(nueve);
    const desplegable = screen.getByLabelText('Avío');
    expect(desplegable.tagName).toBe('SELECT');
    expect(desplegable.id).toBe('opcion-avio');
    fireEvent.change(desplegable, { target: { value: '3' } });
    expect(alCambiar).toHaveBeenLastCalledWith(3);
  });
});

describe('un número es un campo con sus botones de menos y más', () => {
  it('el campo se rotula y se teclea; Restar y Sumar van a su lado', () => {
    pintar(profundidad);
    const campo = screen.getByLabelText('Profundidad (mm)');
    expect(campo.getAttribute('type')).toBe('number');
    expect(campo.id).toBe('opcion-length');
    expect(screen.getByRole('button', { name: 'Restar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sumar' })).toBeTruthy();
  });

  it('Sumar y Restar mueven un paso', () => {
    const alCambiar = pintar(profundidad, 8);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: 'Restar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(7);
  });

  it('en el borde del rango, el botón que se saldría está apagado', () => {
    pintar(profundidad, 30);
    expect((screen.getByRole('button', { name: 'Sumar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Restar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('con paso de 0,1 no deja colas de coma flotante en el store', () => {
    const fina: ToolOption = { id: 'f', label: 'Fina', type: 'number', value: 0.2, min: 0, max: 5, step: 0.1 };
    const alCambiar = pintar(fina, 0.2);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(0.3);
  });

  it('los botones de paso no entran en el orden del teclado: con el foco en el campo, las flechas hacen lo mismo', () => {
    pintar(profundidad);
    expect(screen.getByRole('button', { name: 'Sumar' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Restar' }).getAttribute('tabindex')).toBe('-1');
  });
});

describe('interruptor y color', () => {
  it('el interruptor es un botón con su marca, sin texto encendido/apagado', () => {
    const alCambiar = pintar({ id: 'showAngle', label: 'Mostrar el ángulo', type: 'toggle', value: false });
    const boton = screen.getByRole('button', { name: 'Mostrar el ángulo' });
    expect(boton.id).toBe('opcion-showAngle');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(boton);
    expect(alCambiar).toHaveBeenLastCalledWith(true);
  });

  it('el color es el selector del navegador, rotulado', () => {
    pintar({ id: 'threadColor', label: 'Color del hilo', type: 'color', value: '#333333' });
    const color = screen.getByLabelText('Color del hilo');
    expect(color.getAttribute('type')).toBe('color');
    expect(color.id).toBe('opcion-threadColor');
  });
});
```

`src/tools/__tests__/piquete-al-pie.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { toolRegistry } from '../index';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';

/**
 * El piquete en la línea al pie (spec 2026-10-02 § 5.3 y § 5.2): forma,
 * cantidad, profundidad y ancho, ANTES del clic, como botones a un clic. El
 * ancho hoy solo estaba en Propiedades; los rangos son los del panel, más
 * amplios que los de la herramienta, para que ningún valor guardado quede
 * fuera.
 */
afterEach(cleanup);

const opciones = toolRegistry.getTool('notch')!.options!;
const de = (id: string) => opciones.find((o) => o.id === id)!;

describe('el piquete al pie', () => {
  it('las cuatro, en el orden de la spec', () => {
    expect(opciones.map((o) => o.id)).toEqual(['shape', 'count', 'length', 'width']);
  });

  it('el ancho gana su sitio, con el rango del panel (1 a 20 mm)', () => {
    expect(de('width')).toMatchObject({ type: 'number', label: 'Ancho (mm)', min: 1, max: 20, value: DEFAULT_NOTCH_OPTIONS.width });
  });

  it('la profundidad toma el rango del panel (1 a 30 mm)', () => {
    expect(de('length')).toMatchObject({ type: 'number', label: 'Profundidad (mm)', min: 1, max: 30, value: DEFAULT_NOTCH_OPTIONS.length });
  });

  it('la cantidad se lee «1 2 3» y nace en la de fábrica', () => {
    expect(de('count').choices!.map((c) => c.label)).toEqual(['1', '2', '3']);
    expect(de('count').value).toBe(DEFAULT_NOTCH_OPTIONS.count);
  });

  it('las siete formas traen su dibujo, y los siete dibujos son distintos', () => {
    const formas = de('shape').choices!;
    expect(formas).toHaveLength(7);
    const trazos = formas.map((c) => {
      const Icono = c.icon!;
      const { container, unmount } = render(<Icono size={16} />);
      const d = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d')).join(' | ');
      unmount();
      return d;
    });
    expect(new Set(trazos).size).toBe(7);
  });
});
```

En `src/tools/__tests__/donde-se-teclea-un-numero.test.tsx` (ya importa `render` y `Control`), reemplaza el segundo caso del primer `describe`:

```tsx
  it('todas son campo escrito, no deslizador', () => {
    const deslizadores = opcionesEnMilimetros()
      .filter(({ opcion }) => opcion.control !== 'input')
      .map(({ tool, opcion }) => `${tool}.${opcion.id} «${opcion.label}» (paso ${opcion.step ?? 1})`);

    expect(
      deslizadores,
      'estas piden un número en milímetros y solo se pueden arrastrar',
    ).toEqual([]);
  });
```

por:

```tsx
  it('todas se teclean: en la línea al pie un número es un campo (spec 2026-10-02 § 5.3)', () => {
    const sinCampo = opcionesEnMilimetros()
      .filter(({ opcion }) => {
        const { container, unmount } = render(<Control opcion={opcion} valor={opcion.value} alCambiar={() => {}} />);
        const hayCampo = container.querySelector('input[type="number"]') !== null;
        unmount();
        return !hayCampo;
      })
      .map(({ tool, opcion }) => `${tool}.${opcion.id} «${opcion.label}»`);

    expect(sinCampo, 'estas piden un número en milímetros y no se pueden teclear').toEqual([]);
  });
```

y en las dos opciones de prueba del segundo `describe`, borra `, control: 'input'` (la de `distance`, `value: 10, min: 1, max: 200, step: 1, control: 'input',` → `value: 10, min: 1, max: 200, step: 1,`; la de `x`, `type: 'number', value: 1, control: 'input',` → `type: 'number', value: 1,`).

En `src/tools/__tests__/idiomaDeOpciones.test.ts`, reemplaza la entrada `notch`:

```ts
  notch: {
    shape: [
      'Forma del piquete',
      'Recta',
      'En T',
      'V hacia adentro',
      'V hacia afuera',
      'En U',
      'Almena',
      'Rombo',
    ],
    length: ['Profundidad (mm)'],
    count: ['Cantidad', 'Uno', 'Dos', 'Tres'],
  },
```

por:

```ts
  // En la línea al pie el nombre de la herramienta está al lado: «Forma» basta.
  // La cantidad se lee «1 2 3» (spec 2026-10-02 § 5.3), y el ancho gana su sitio.
  notch: {
    shape: ['Forma', 'Recta', 'En T', 'V hacia adentro', 'V hacia afuera', 'En U', 'Almena', 'Rombo'],
    count: ['Cantidad', '1', '2', '3'],
    length: ['Profundidad (mm)'],
    width: ['Ancho (mm)'],
  },
```

En `src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx` (provisional, hasta la Task 3): en `CON_OPCIONES` borra `, control: 'input'` de la opción `medida`; reemplaza el primer caso por:

```tsx
  it('pinta un control por cada opción declarada, de cada tipo', () => {
    montar('__tira_con_opciones');
    expect(screen.getByLabelText('Un número').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Una medida').getAttribute('type')).toBe('number');
    expect(screen.getByRole('group', { name: 'Una lista' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Un interruptor' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Un color').getAttribute('type')).toBe('color');
  });
```

en el segundo, `fireEvent.change(screen.getByLabelText('Una lista'), { target: { value: 'b' } });` por `fireEvent.click(screen.getByRole('button', { name: 'Opción B' }));`; y en el de los ids, `expect(screen.getByLabelText('Una lista').id).toBe('opcion-lista');` por `expect(screen.getByRole('group', { name: 'Una lista' }).id).toBe('opcion-lista');`.

- [ ] **Step 2: Corre los tests y míralos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/ToolOptionControls.test.tsx src/tools/__tests__/piquete-al-pie.test.tsx src/tools/__tests__/donde-se-teclea-un-numero.test.tsx src/tools/__tests__/idiomaDeOpciones.test.ts src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx`
Expected: FAIL. Los de botones no encuentran `group` (la lista de hoy es un `<select>`); los de número no encuentran «Restar» ni «Sumar»; el piquete tiene tres opciones y no cuatro; `idiomaDeOpciones` espera «Forma» y ve «Forma del piquete».

- [ ] **Step 3: El tipo y el piquete**

En `src/tools/types.ts`, reemplaza:

```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: { label: string; value: any }[];
  /** Control a pintar cuando `type: 'number'`. Omisión `'slider'`: nada de lo
   *  que hoy se pinta cambia. `'input'` pinta un `<input type="number">` —
   *  milímetros no son opacidades. */
  control?: 'slider' | 'input';
}
```

por:

```ts
  /** Las alternativas de un `select`. Con `icon`, su botón en la línea al pie
   *  enseña el dibujo y se llama como la alternativa (spec 2026-10-02 § 5.3:
   *  «las siete formas del piquete como siete botones con su dibujo»). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: { label: string; value: any; icon?: React.FC<{ size?: number }> }[];
}
```

Borra `control: 'input'` de las definiciones. Las que lo tienen en su propia línea y las que lo tienen en medio de un objeto de una línea (las de pespunte):

```bash
sed -i "/^\s*control: 'input',\s*$/d; s/control: 'input', //" src/tools/definitions/*.tsx
grep -rn "control:" src/tools src/components/PatternEditor --include=*.ts --include=*.tsx
```

Expected del `grep`: ninguna línea.

En `src/tools/definitions/notch.tsx`, reemplaza las importaciones:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
```

por:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
import type { NotchShape } from '../../types/types';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../utils/notches';
```

y, debajo de `NotchIcon`, añade:

```tsx
/**
 * El dibujo de cada forma, para su botón en la línea al pie (spec 2026-10-02
 * § 5.3). Sale de `generateNotchPath`, la misma geometría que pinta el lienzo,
 * así que el botón no puede prometer otra forma. El borde cruza a media altura
 * y la pieza queda abajo: lo que entra baja, lo que sale sube.
 */
function dibujoDeForma(shape: NotchShape): React.FC<{ size?: number }> {
  const d = generateNotchPath({ x: 9, y: 9 }, { x: 0, y: 1 }, { ...DEFAULT_NOTCH_OPTIONS, shape, length: 6, width: 6, count: 1 })
    .map((c) => `${c.type}${c.values.join(',')}`)
    .join(' ');
  const Dibujo: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 9H17" opacity={0.45} />
      <path d={d} />
    </svg>
  );
  return Dibujo;
}
```

Reemplaza el comentario y el arreglo `options` entero:

```tsx
  // Option ids use the canonical NotchOptions field names (shape/length/count)
  // so they land in toolOptions.notch with the keys useNotchTool reads (G6).
  options: [
```

…hasta su `],` de cierre, por:

```tsx
  // Los ids son los nombres de NotchOptions (shape/count/length/width): caen en
  // toolOptions.notch con las claves que lee useNotchTool (G6). El orden es el
  // de la spec 2026-10-02 § 5.3: forma, cantidad, profundidad y ancho.
  options: [
    {
      id: 'shape',
      label: 'Forma',
      type: 'select',
      value: DEFAULT_NOTCH_OPTIONS.shape,
      choices: [
        { label: 'Recta', value: 'slit', icon: dibujoDeForma('slit') },
        { label: 'En T', value: 't-notch', icon: dibujoDeForma('t-notch') },
        { label: 'V hacia adentro', value: 'v-internal', icon: dibujoDeForma('v-internal') },
        { label: 'V hacia afuera', value: 'v-external', icon: dibujoDeForma('v-external') },
        { label: 'En U', value: 'u-notch', icon: dibujoDeForma('u-notch') },
        { label: 'Almena', value: 'castle', icon: dibujoDeForma('castle') },
        { label: 'Rombo', value: 'diamond', icon: dibujoDeForma('diamond') },
      ],
    },
    {
      id: 'count',
      label: 'Cantidad',
      type: 'select',
      value: DEFAULT_NOTCH_OPTIONS.count,
      choices: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
    // Los rangos del panel de Propiedades (spec § 5.2): un rango por opción, y
    // así ningún valor guardado queda fuera.
    {
      id: 'length',
      label: 'Profundidad (mm)',
      type: 'number',
      value: DEFAULT_NOTCH_OPTIONS.length,
      min: 1,
      max: 30,
      step: 1,
    },
    {
      id: 'width',
      label: 'Ancho (mm)',
      type: 'number',
      value: DEFAULT_NOTCH_OPTIONS.width,
      min: 1,
      max: 20,
      step: 1,
    },
  ],
```

y en `parameterHints` añade, detrás de `count`:

```ts
      width: 'Notch width in millimeters (default 3)',
```

- [ ] **Step 4: Los controles**

Reescribe `src/components/PatternEditor/ToolOptionControls.tsx` entero:

```tsx
import { useState } from 'react';
import type { ToolOption } from '../../tools/types';
import './ToolOptionControls.css';

/**
 * Los controles de una opción de herramienta, para la línea al pie (spec
 * 2026-10-02 «la interfaz en papel» § 5.3): botones, no listas. Todas las
 * alternativas a la vista y a un clic; una lista desplegable solo con más de
 * ocho. Un número es un campo con sus botones de menos y más. Cada control
 * conserva `id="opcion-<id>"`, que usan los e2e.
 *
 * Se pintan igual en la línea al pie, que es marco, que dentro del menú «Más»,
 * que es papel: sus colores salen de tokens que el ámbito de papel redefine
 * (ToolOptionControls.css).
 */

/** Hasta ocho alternativas van como botones; con más, lista (spec § 5.3). */
const MAX_BOTONES = 8;

function acotar(opcion: ToolOption, n: number): number {
  const conMinimo = opcion.min != null ? Math.max(opcion.min, n) : n;
  return opcion.max != null ? Math.min(opcion.max, conMinimo) : conMinimo;
}

/** Al paso de 0,1, 0,2 + 0,1 no puede llegar al store como 0,30000000000000004. */
function redondearAlPaso(n: number, paso: number): number {
  const decimales = (String(paso).split('.')[1] ?? '').length;
  return Number(n.toFixed(decimales));
}

/**
 * Un número: un campo con borrador local y sus botones de menos y más. El
 * borrador deja vaciar el campo y escribir «300» tecla a tecla sin que un
 * campo vacío llegue al store como 0; lo que llega va acotado al rango
 * declarado, y al salir del campo se vuelve a leer el valor guardado. Los
 * botones de paso no entran en el orden del teclado: con el foco en el campo,
 * las flechas hacen lo mismo.
 */
function Numero({ id, opcion, valor, alCambiar }: {
  id: string;
  opcion: ToolOption;
  valor: number;
  alCambiar: (v: unknown) => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const paso = opcion.step ?? 1;
  const dar = (n: number) => alCambiar(acotar(opcion, redondearAlPaso(n, paso)));
  return (
    <span className="opcion-del-pie__numero">
      <button
        type="button"
        className="opcion-del-pie__paso"
        aria-label="Restar"
        tabIndex={-1}
        disabled={opcion.min != null && valor <= opcion.min}
        onClick={() => dar(valor - paso)}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        className="opcion-del-pie__campo"
        min={opcion.min}
        max={opcion.max}
        step={paso}
        value={borrador ?? String(valor)}
        onChange={(e) => {
          const texto = e.target.value;
          setBorrador(texto);
          if (texto === '' || Number.isNaN(Number(texto))) return;
          alCambiar(acotar(opcion, Number(texto)));
        }}
        onBlur={() => setBorrador(null)}
      />
      <button
        type="button"
        className="opcion-del-pie__paso"
        aria-label="Sumar"
        tabIndex={-1}
        disabled={opcion.max != null && valor >= opcion.max}
        onClick={() => dar(valor + paso)}
      >
        +
      </button>
    </span>
  );
}

/** Las alternativas, una por botón; con su dibujo si la opción lo trae. */
function Botones({ id, opcion, valor, alCambiar }: {
  id: string;
  opcion: ToolOption;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  return (
    <span id={id} className="opcion-del-pie__botones" role="group" aria-labelledby={`${id}-rotulo`}>
      {(opcion.choices ?? []).map((c) => {
        const Dibujo = c.icon;
        // String() a los dos lados: la lista de antes guardaba la cantidad como "2".
        const activo = String(c.value) === String(valor);
        return (
          <button
            key={String(c.value)}
            type="button"
            className={`opcion-del-pie__boton${activo ? ' opcion-del-pie__boton--activo' : ''}`}
            aria-pressed={activo}
            aria-label={Dibujo ? c.label : undefined}
            title={Dibujo ? c.label : undefined}
            onClick={() => alCambiar(c.value)}
          >
            {Dibujo ? <Dibujo size={16} /> : c.label}
          </button>
        );
      })}
    </span>
  );
}

export function Control({
  opcion,
  valor,
  alCambiar,
}: {
  opcion: ToolOption;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  const id = `opcion-${opcion.id}`;

  switch (opcion.type) {
    case 'number':
      return (
        <div className="opcion-del-pie">
          <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
          <Numero id={id} opcion={opcion} valor={Number(valor)} alCambiar={alCambiar} />
        </div>
      );

    case 'select': {
      const choices = opcion.choices ?? [];
      if (choices.length > MAX_BOTONES) {
        return (
          <div className="opcion-del-pie">
            <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
            <select
              id={id}
              className="opcion-del-pie__lista"
              value={String(valor)}
              onChange={(e) => alCambiar(choices.find((c) => String(c.value) === e.target.value)?.value ?? e.target.value)}
            >
              {choices.map((c) => (
                <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="opcion-del-pie">
          <span id={`${id}-rotulo`} className="opcion-del-pie__rotulo">{opcion.label}</span>
          <Botones id={id} opcion={opcion} valor={valor} alCambiar={alCambiar} />
        </div>
      );
    }

    case 'toggle':
      // Sin texto encendido/apagado: el estado va en la marca y en
      // aria-pressed. Por ley de estado no puede depender solo del tono.
      return (
        <div className="opcion-del-pie">
          <button
            id={id}
            type="button"
            className={`opcion-del-pie__interruptor${valor ? ' opcion-del-pie__interruptor--activo' : ''}`}
            aria-pressed={Boolean(valor)}
            onClick={() => alCambiar(!valor)}
          >
            <span className="opcion-del-pie__marca" aria-hidden="true" />
            {opcion.label}
          </button>
        </div>
      );

    case 'color':
      return (
        <div className="opcion-del-pie">
          <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
          <input id={id} type="color" className="opcion-del-pie__color" value={String(valor)} onChange={(e) => alCambiar(e.target.value)} />
        </div>
      );

    default:
      return null;
  }
}
```

Crea `src/components/PatternEditor/ToolOptionControls.css`:

```css
/* Las opciones de una herramienta en la línea al pie (spec 2026-10-02 § 5.3):
   rótulo y control en una fila. Se pintan en el marco (la línea al pie) y en
   el papel (el menú «Más»), así que solo usan tokens que valen en los dos: ni
   un fondo del marco ni un color a mano (lo vigila
   tests/repo/lo-que-flota-es-papel.test.ts). El interruptor comparte las
   reglas del grupo del patrón de la barra superior (layout.css). */
.opcion-del-pie { flex: none; display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: var(--text-sm); }
.opcion-del-pie__rotulo { color: var(--text-secondary); }

.opcion-del-pie__botones { display: inline-flex; gap: 1px; padding: 2px; border: var(--hairline); border-radius: var(--radius-sm); }
.opcion-del-pie__boton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: var(--text-tertiary);
  font: inherit;
  cursor: pointer;
}
/* La elegida cambia RELLENO, no solo tono (ley de estado). */
.opcion-del-pie__boton--activo { background: var(--bg-elevated); color: var(--text-primary); }

.opcion-del-pie__numero { display: inline-flex; align-items: center; }
.opcion-del-pie__campo {
  width: 44px;
  height: 24px;
  padding: 0 6px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
  appearance: textfield;
}
/* Los botones de menos y más ya están al lado: fuera las flechitas del navegador. */
.opcion-del-pie__campo::-webkit-inner-spin-button,
.opcion-del-pie__campo::-webkit-outer-spin-button { appearance: none; margin: 0; }
.opcion-del-pie__paso {
  width: 20px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.opcion-del-pie__paso:disabled { color: var(--text-disabled); cursor: default; }

.opcion-del-pie__lista {
  height: 24px;
  max-width: 180px;
  padding: 0 6px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font: inherit;
}
.opcion-del-pie__color { width: 28px; height: 24px; padding: 0 2px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }

/* hover y focus-visible en UNA línea cada uno: R5 los empareja línea a línea. */
.opcion-del-pie__boton:hover, .opcion-del-pie__paso:hover { color: var(--text-primary); }
.opcion-del-pie__boton:focus-visible, .opcion-del-pie__paso:focus-visible, .opcion-del-pie__campo:focus-visible, .opcion-del-pie__lista:focus-visible, .opcion-del-pie__color:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

En `src/styles/layout.css`, el interruptor del pie toma las reglas del de la barra superior. Reemplaza:

```css
.grupo-del-patron__interruptor,
.grupo-del-patron__plegado {
```

por:

```css
/* `.opcion-del-pie__interruptor` es el interruptor de una opción en la línea
   al pie (ToolOptionControls.tsx): un solo estilo de interruptor en el marco. */
.grupo-del-patron__interruptor,
.grupo-del-patron__plegado,
.opcion-del-pie__interruptor {
```

y las cinco reglas que siguen:

```css
.grupo-del-patron__interruptor--activo { color: var(--text-primary); }
.grupo-del-patron__marca {
```

por:

```css
.grupo-del-patron__interruptor--activo, .opcion-del-pie__interruptor--activo { color: var(--text-primary); }
.grupo-del-patron__marca, .opcion-del-pie__marca {
```

```css
.grupo-del-patron__interruptor--activo .grupo-del-patron__marca { background: currentColor; }
.grupo-del-patron__interruptor:hover, .grupo-del-patron__plegado:hover { color: var(--text-primary); }
.grupo-del-patron__interruptor:focus-visible, .grupo-del-patron__plegado:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; color: var(--text-primary); }
```

por:

```css
.grupo-del-patron__interruptor--activo .grupo-del-patron__marca, .opcion-del-pie__interruptor--activo .opcion-del-pie__marca { background: currentColor; }
.grupo-del-patron__interruptor:hover, .grupo-del-patron__plegado:hover, .opcion-del-pie__interruptor:hover { color: var(--text-primary); }
.grupo-del-patron__interruptor:focus-visible, .grupo-del-patron__plegado:focus-visible, .opcion-del-pie__interruptor:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; color: var(--text-primary); }
```

- [ ] **Step 5: Corre los tests y míralos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/ToolOptionControls.test.tsx src/tools/__tests__/piquete-al-pie.test.tsx src/tools/__tests__/donde-se-teclea-un-numero.test.tsx src/tools/__tests__/idiomaDeOpciones.test.ts src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx src/tools/__tests__`
Expected: PASS.

Run: `npx tsc -b --noEmit && node scripts/ui-contract-lint.mjs`
Expected: sin errores; ningún contador sube.

- [ ] **Step 6: Commit**

```bash
git add src/tools/types.ts src/tools/definitions/*.tsx src/components/PatternEditor/ToolOptionControls.tsx src/components/PatternEditor/ToolOptionControls.css src/styles/layout.css src/components/PatternEditor/__tests__/ToolOptionControls.test.tsx src/tools/__tests__/piquete-al-pie.test.tsx src/tools/__tests__/donde-se-teclea-un-numero.test.tsx src/tools/__tests__/idiomaDeOpciones.test.ts src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx
git commit -m "feat(pie): las opciones son botones; el piquete gana el ancho y su dibujo"
```

---

### Task 2: La frase

**Files:**
- Create: `src/components/PatternEditor/fraseDeLaFase.ts`
- Modify: `src/components/PatternEditor/noPasoNada.ts:12-16, 56-62`
- Test: Create `src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts`, Modify `src/components/PatternEditor/__tests__/no-paso-nada.test.ts`

**Interfaces:**
- Consumes: `ModoShift` (`./useShiftSostenido`), `PointToolMode` (`./usePointTool`), `AngleReference`, `ABSOLUTE_REFERENCE`, `angleReferenceLabel` (`./angleReference`), `formatMedida` (`./cotas/parseMedida`), `displayShortcut`, `displayModifierKey` (`../shell/shortcutDisplay`).
- Produces: `fraseDeLaFase(f: FaseDeLaHerramienta): string | null`; `interface FaseDeLaHerramienta` (los campos de `HintTextProps` sin `pieces`, más `rectanguloPorDefecto?`, `tijerasEmpezadas?`, `medidaEmpezada?`, `modoDelPunto?`); `fraseDelPie(desenlace: string | null, falta: string | null, fase: string | null): FraseDelPie | null`; `interface FraseDelPie { texto: string; tipo: 'desenlace' | 'falta' | 'fase' }`.

Las frases, decididas con `solace-wren` (glosario de `docs/specs/2026-07-16-ui-copy-es-glosario.md`; « · » entre gestos; sin punto final). Presupuesto a 1366 px, por lo que dejan las opciones de cada herramienta: sin opciones, ~150 caracteres; Línea interna ~85; Piquete ~55; Tijeras ~85; Abrir la pieza ~65; los pespuntes ~40. Lo que cambia:

| Herramienta y fase | Antes | Ahora |
|---|---|---|
| Pluma, sin puntos | (en el centro de la hoja, y solo sin piezas) «Clic para añadir puntos · arrastra para curvar · …» | Clic pone el primer punto · arrastra para curvar |
| Pluma, con puntos | Clic añade · arrastra para curvar · Tab escribe largo y ángulo · clic en el primer punto cierra · Enter o doble clic termina: pieza con tres puntos, trazo con dos · Esc deja el trazo · Retroceso quita el último | Tab escribe la medida · clic en el primer punto cierra · Enter termina: pieza con tres puntos, trazo con dos · Retroceso quita un punto · Esc deja el trazo |
| Línea interna, con puntos | Clic añade · arrastra para curvar · Tab escribe largo y ángulo · doble clic o Enter termina · clic en el primer punto cierra · Retroceso quita el último · Esc descarta | Tab escribe la medida · Enter termina · Retroceso quita un punto · Esc descarta |
| Rectángulo | Arrastra para dibujar · un clic crea con el último tamaño · … (y en la tarjeta «Un clic crea 300 × 150 mm · arrastra para dibujar») | Arrastra para dibujar · un clic crea uno de 300 × 150 mm · escribe en sus cotas para cambiarlo · Esc cancela |
| Punto (nueva) | — | Clic en un borde añade un punto · arrastra por el borde para elegir dónde / Clic en un tramo lo convierte en curva por puntos / Clic en un tramo lo convierte en curva bezier |
| Piquete (nueva) | — | Clic en el borde donde va el piquete |
| Medir (nueva) | — | Clic en dos puntos para medir la distancia / Clic en el segundo punto · Esc lo suelta |
| Tijeras (nueva) | — | Clic en el contorno donde empieza el corte / Clic donde termina el corte, en otro borde · Esc cancela |
| Pespunte sobre costura | Clic en un borde para pespuntear todo su largo | Clic en un borde lo pespuntea entero |
| Pespunte por tramo | Clic en dos puntos del mismo borde para el tramo de pespunte | Clic en dos puntos del mismo borde |
| Desplazar contorno | Elige distancia y dirección en la tira · Enter aplica el desplazamiento | Enter aplica el desplazamiento |
| Poner avío | Clic en un borde pone el avío elegido · con «Repartidos por el borde» pone la cantidad que digas, repartida | Clic en un borde pone el avío elegido |
| Abrir la pieza, al cerrar el corte | Clic en el contorno otra vez para cerrar el corte · Esc cancela | Clic en el contorno para cerrar el corte · Esc cancela |
| Abrir la pieza, antes de arrastrar | Mueve el ratón para abrir · Tab cambia entre girar y separar | Mueve el ratón para abrir · Tab: girar o separar |
| Abrir la pieza, la prueba | Enter la abre de verdad · Esc descarta y deja volver a probar | Enter la abre de verdad · Esc descarta la prueba |

Las demás no cambian. Los avisos (`noPasoNada.ts`) que cambian:

| Razón | Antes | Ahora |
|---|---|---|
| `tijeras:corte-no-cruza` | La línea de corte tiene que entrar por un lado y salir por otro; arrastra de borde a borde | El corte tiene que cruzar la pieza; marca el final en otro borde |
| `pespunte:desplazamiento-no-cabe` | El desplazamiento no cabe en ese borde; reduce la distancia en la tira | El pespunte no cabe; reduce la separación |
| `notch:sin-sitio` | No cabe un piquete ahí; prueba un poco más adentro del borde | El piquete no cabe ahí; prueba más adentro del borde |
| `notch:ancla-perdida` | El contorno cambió y el piquete perdió su esquina de referencia; colócalo otra vez con un clic | El contorno cambió; marca el piquete otra vez con un clic |

- [ ] **Step 1: Escribe los tests que fallan**

`src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fraseDeLaFase, fraseDelPie, type FaseDeLaHerramienta } from '../fraseDeLaFase';
import { displayModifierKey } from '../../shell/shortcutDisplay';

/**
 * La frase de la línea al pie (spec 2026-10-02 «la interfaz en papel» § 5.4).
 * Sustituye a los tests de `HintText` (un `<text>` de SVG al pie del lienzo
 * hasta P2b) con el mismo criterio: se asevera el SIGNIFICADO que la frase
 * tiene que transmitir, no su redacción, que afina `solace-wren`. Lo que sí se
 * fija con exactitud son las teclas: ninguna puede perder su único anuncio.
 */
const base: FaseDeLaHerramienta = { activeTool: 'select', penNodesLength: 0, nodeEditorIsEditing: false };
const frase = (f: Partial<FaseDeLaHerramienta>) => fraseDeLaFase({ ...base, ...f }) ?? '';
const shift = displayModifierKey('⇧');

describe('coser', () => {
  it('en reposo contrasta el clic (el lado entero) con el arrastre (un tramo)', () => {
    const f = frase({ activeTool: 'seam', seamPhase: 'idle' });
    expect(f).toMatch(/clic/i);
    expect(f).toMatch(/arrastr/i);
    expect(f).toMatch(/entero/i);
    expect(f).toMatch(/tramo/i);
  });

  it('sosteniendo la primera mitad pide la otra pieza y nombra la salida', () => {
    const f = frase({ activeTool: 'seam', seamPhase: 'holdingA' });
    expect(f).toMatch(/otra pieza/i);
    expect(f).toMatch(/esc/i);
  });
});

describe('editar costuras', () => {
  it('dice que el clic revela con qué está cosido', () => {
    expect(frase({ activeTool: 'seamEdit' })).toMatch(/cosid/i);
  });

  it('sin ninguna costura, invita a coser primero (#1098)', () => {
    expect(frase({ activeTool: 'seamEdit', hasSeams: false })).toMatch(/cose primero/i);
  });
});

describe('la línea interna', () => {
  it('sin trazo dice dónde empezar y que hay enganche', () => {
    const f = frase({ activeTool: 'internalShape', internalShapeNodesLength: 0 });
    expect(f).toMatch(/pieza/i);
    expect(f).toMatch(/esquina|borde|engancha/i);
  });

  it('con trazo nombra sus cuatro teclas: Tab, Enter, Retroceso y Esc', () => {
    const f = frase({ activeTool: 'internalShape', internalShapeNodesLength: 2 });
    expect(f).toMatch(/\bTab\b/);
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/Retroceso/);
    expect(f).toMatch(/\bEsc\b/);
  });
});

describe('la pluma', () => {
  it('sin puntos dice cómo empezar, haya piezas o no (antes solo lo decía en una hoja vacía)', () => {
    const f = frase({ activeTool: 'pen', penNodesLength: 0 });
    expect(f).toMatch(/clic/i);
    expect(f).toMatch(/arrastr/i);
  });

  it('con puntos nombra Tab, cerrar, Enter, Retroceso y Esc, y qué deja Enter', () => {
    const f = frase({ activeTool: 'pen', penNodesLength: 2 });
    expect(f).toMatch(/\bTab\b/);
    expect(f).toMatch(/cierra/i);
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/Retroceso/);
    expect(f).toMatch(/\bEsc\b/);
    expect(f).toMatch(/trazo con dos/i);
  });
});

describe('el rectángulo', () => {
  it('dice con qué tamaño crea un clic, que sus cotas se escriben y que se arrastra', () => {
    const f = frase({ activeTool: 'rectangle', rectanguloPorDefecto: { width: 300, height: 150 } });
    expect(f).toContain('300 × 150 mm');
    expect(f).toMatch(/cotas/i);
    expect(f).toMatch(/arrastr/i);
  });
});

describe('las cotas', () => {
  it('con cotas visibles, Seleccionar y Transformar nombran la cota, el arrastre y Tab', () => {
    for (const activeTool of ['select', 'transform'] as const) {
      const f = frase({ activeTool, cotasVisibles: true });
      expect(f).toMatch(/escribirla/i);
      expect(f).toMatch(/arrástrala/i);
      expect(f).toMatch(/\bTab\b/);
    }
  });

  it('Transformar sin cotas no tiene frase: lo que le falta lo dice `falta`', () => {
    expect(fraseDeLaFase({ ...base, activeTool: 'transform' })).toBeNull();
  });
});

describe('el hilo (#1107)', () => {
  it('se arrastra dentro de la pieza y Shift engancha 0°, 45° y 90°', () => {
    const f = frase({ activeTool: 'grainline' });
    expect(f).toMatch(/pieza/i);
    expect(f).toMatch(/arrastr/i);
    expect(f).toMatch(/shift|⇧/i);
    expect(f).toMatch(/0°/);
    expect(f).toMatch(/90°/);
  });
});

describe('desplazar contorno y extender / recortar (#1178)', () => {
  it('Desplazar contorno dice que Enter aplica, y ya no habla de la tira', () => {
    const f = frase({ activeTool: 'offsetOutline' });
    expect(f).toMatch(/\bEnter\b/);
    expect(f).toMatch(/aplica/i);
    expect(f).not.toMatch(/tira/i);
  });

  it('extender, sin extremo: cómo empezar', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: false })).toMatch(/extend/i);
  });

  it('extender, con extremo: Enter confirma', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: true })).toMatch(/\bEnter\b/);
  });

  it('recortar, sin punto: cómo empezar, sin hablar de extender', () => {
    const f = frase({ activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: false });
    expect(f).toMatch(/recort/i);
    expect(f).not.toMatch(/extend/i);
  });

  it('recortar, con punto: el clic decide el lado', () => {
    expect(frase({ activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: true })).toMatch(/lado|Enter/);
  });
});

describe('Shift anuncia la otra guía (spec 2026-09-23 § 4.2)', () => {
  it('con Shift y un borde que elegir, dice cómo llegar a él', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al borde`);
  });

  it('con el borde activo, dice cómo volver al eje', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'borde', segundoMarco: 'border' }))
      .toBe(`${shift} dos veces: al borde · una vez: al eje`);
  });

  it('desde el segundo tramo el otro marco es el tramo', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: 'segment' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al tramo`);
  });

  it('sin segundo marco, o sin Shift, la frase de la herramienta', () => {
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'hoja', segundoMarco: null })).toMatch(/\bTab\b/);
    expect(frase({ activeTool: 'pen', penNodesLength: 2, modoShift: 'suelto', segundoMarco: 'border' })).toMatch(/\bTab\b/);
  });

  it('también en la Línea interna y en Editar patrón; el Hilo no cambia', () => {
    expect(frase({ activeTool: 'internalShape', internalShapeNodesLength: 1, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe(`${shift}: al eje · ${shift} dos veces: al borde`);
    expect(frase({ activeTool: 'editPattern', modoShift: 'borde', segundoMarco: 'border' }))
      .toBe(`${shift} dos veces: al borde · una vez: al eje`);
    expect(frase({ activeTool: 'grainline', modoShift: 'hoja', segundoMarco: 'border' })).toMatch(/hilo/i);
  });

  it('con el editor de nodos abierto, solo su frase', () => {
    expect(frase({ activeTool: 'editPattern', nodeEditorIsEditing: true, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe('Editando nodos · arrastra para mover · Esc para salir');
  });
});

describe('las cuatro que estrenan frase (spec § 5.4)', () => {
  it('Punto dice qué hace el clic en cada uno de sus tres modos', () => {
    expect(frase({ activeTool: 'point', modoDelPunto: 'point' })).toMatch(/añade un punto/i);
    expect(frase({ activeTool: 'point', modoDelPunto: 'curvePoints' })).toMatch(/curva por puntos/i);
    expect(frase({ activeTool: 'point', modoDelPunto: 'bezier' })).toMatch(/bezier/i);
    expect(frase({ activeTool: 'point' }), 'sin modo, el de fábrica').toMatch(/añade un punto/i);
  });

  it('Piquete dice dónde se hace clic', () => {
    expect(frase({ activeTool: 'notch' })).toMatch(/borde/i);
  });

  it('Medir: dos puntos, y con el primero puesto, cómo soltarlo', () => {
    expect(frase({ activeTool: 'measure' })).toMatch(/dos puntos/i);
    expect(frase({ activeTool: 'measure', medidaEmpezada: true })).toMatch(/\bEsc\b/);
  });

  it('Tijeras: dos clics en el contorno (no se arrastra), y Esc para empezar de nuevo', () => {
    const empieza = frase({ activeTool: 'scissors' });
    expect(empieza).toMatch(/empieza/i);
    expect(empieza).not.toMatch(/arrastr/i);
    const termina = frase({ activeTool: 'scissors', tijerasEmpezadas: true });
    expect(termina).toMatch(/termina/i);
    expect(termina).toMatch(/\bEsc\b/);
  });
});

/** Cada herramienta 2D con frase, en cada una de sus fases. */
const TODAS: Array<Partial<FaseDeLaHerramienta>> = [
  { activeTool: 'select' }, { activeTool: 'select', cotasVisibles: true }, { activeTool: 'transform', cotasVisibles: true },
  { activeTool: 'select', nodeEditorIsEditing: true }, { activeTool: 'editPattern' },
  { activeTool: 'point', modoDelPunto: 'point' }, { activeTool: 'point', modoDelPunto: 'curvePoints' }, { activeTool: 'point', modoDelPunto: 'bezier' },
  { activeTool: 'pen' }, { activeTool: 'pen', penNodesLength: 2 },
  { activeTool: 'internalShape' }, { activeTool: 'internalShape', internalShapeNodesLength: 2 },
  { activeTool: 'rectangle', rectanguloPorDefecto: { width: 300, height: 150 } }, { activeTool: 'circle' }, { activeTool: 'triangle' },
  { activeTool: 'grainline' },
  { activeTool: 'scissors' }, { activeTool: 'scissors', tijerasEmpezadas: true },
  { activeTool: 'measure' }, { activeTool: 'measure', medidaEmpezada: true },
  { activeTool: 'seam', seamPhase: 'idle' }, { activeTool: 'seam', seamPhase: 'holdingA' },
  { activeTool: 'seamEdit', hasSeams: false }, { activeTool: 'seamEdit', hasSeams: true },
  { activeTool: 'seamAllowance', saDefaultWidthMm: 10 }, { activeTool: 'notch' },
  { activeTool: 'topstitchSeamline', topstitchMode: 'seamline' }, { activeTool: 'topstitchSegment', topstitchMode: 'segment' },
  { activeTool: 'topstitchFree', topstitchMode: 'free' }, { activeTool: 'topstitchEdit', topstitchMode: 'edit' },
  { activeTool: 'hand' }, { activeTool: 'measureCurve' }, { activeTool: 'compareCurves' }, { activeTool: 'offsetOutline' },
  { activeTool: 'extendTrim', extendTrimMode: 'extend' }, { activeTool: 'extendTrim', extendTrimMode: 'extend', extendTrimArmed: true },
  { activeTool: 'extendTrim', extendTrimMode: 'trim' }, { activeTool: 'extendTrim', extendTrimMode: 'trim', extendTrimArmed: true },
  ...['idle', 'drawingSlash', 'slashComplete', 'selectingHalf', 'halfConfirmed', 'awaitingDrag', 'spreading', 'spreadPreview']
    .map((slashPhase) => ({ activeTool: 'slashAndSpread' as const, slashPhase })),
  { activeTool: 'trimPlace' },
  { activeTool: 'walkSeam', walkSeamPhase: 'idle' }, { activeTool: 'walkSeam', walkSeamPhase: 'stationary' }, { activeTool: 'walkSeam', walkSeamPhase: 'walking' },
];

describe('cada frase, en español y en una línea', () => {
  // Regla dura del glosario: cero mezcla de idiomas en una superficie.
  const DELATORES = /\b(click|drag|to move|to exit|to apply|across|corner type|editing|nodes|width)\b/i;

  it.each(TODAS.map((f) => [`${f.activeTool} ${JSON.stringify(f)}`, f] as const))('%s', (_, f) => {
    const texto = fraseDeLaFase({ ...base, ...f });
    expect(texto, 'sin frase').toBeTruthy();
    expect(texto).not.toMatch(DELATORES);
    expect(texto, 'la tira ya no existe').not.toMatch(/\btira\b/i);
    expect(texto!.length, `«${texto}» no cabe en una línea ni sin opciones`).toBeLessThanOrEqual(150);
    expect(texto!.endsWith('.'), 'es una etiqueta: sin punto final').toBe(false);
  });

  it('las de las herramientas con muchas opciones caben en su hueco', () => {
    // Estimado a 1366 px y 6,2 px por carácter; el e2e de la línea al pie lo mide de verdad.
    const PRESUPUESTO: Array<[Partial<FaseDeLaHerramienta>, number]> = [
      [{ activeTool: 'internalShape', internalShapeNodesLength: 2 }, 85],
      [{ activeTool: 'notch' }, 55],
      [{ activeTool: 'scissors', tijerasEmpezadas: true }, 85],
      [{ activeTool: 'topstitchSeamline', topstitchMode: 'seamline' }, 40],
      [{ activeTool: 'topstitchSegment', topstitchMode: 'segment' }, 40],
      ...['drawingSlash', 'awaitingDrag', 'spreadPreview'].map((slashPhase) => [{ activeTool: 'slashAndSpread' as const, slashPhase }, 65] as [Partial<FaseDeLaHerramienta>, number]),
    ];
    const largas = PRESUPUESTO
      .map(([f, max]) => [fraseDeLaFase({ ...base, ...f }) ?? '', max] as const)
      .filter(([texto, max]) => texto.length > max)
      .map(([texto, max]) => `${texto.length}/${max} «${texto}»`);
    expect(largas).toEqual([]);
  });
});

describe('la prioridad de la frase (spec § 5.4)', () => {
  it('el desenlace gana a lo que falta, y lo que falta a la frase de la fase', () => {
    expect(fraseDelPie('se murió', 'falta', 'fase')).toEqual({ texto: 'se murió', tipo: 'desenlace' });
    expect(fraseDelPie(null, 'falta', 'fase')).toEqual({ texto: 'falta', tipo: 'falta' });
    expect(fraseDelPie(null, null, 'fase')).toEqual({ texto: 'fase', tipo: 'fase' });
    expect(fraseDelPie(null, null, null)).toBeNull();
  });
});
```

En `src/components/PatternEditor/__tests__/no-paso-nada.test.ts`, al final del `describe` que contiene `'dice qué hacer, no solo qué falló'`, añade:

```ts
  it('las Tijeras usan dos clics: su aviso no puede decir «arrastra»', () => {
    expect(mensajeDe('tijeras:corte-no-cruza')).not.toMatch(/arrastr/i);
  });

  it('ningún aviso nombra la tira: su sitio es la línea al pie desde P2b', () => {
    expect(RAZONES.filter((r) => /\btira\b/i.test(mensajeDe(r)))).toEqual([]);
  });

  it('los del piquete caben junto a sus cuatro opciones (spec 2026-10-02 § 5.3)', () => {
    const largos = RAZONES.filter((r) => r.startsWith('notch:') && mensajeDe(r).length > 65);
    expect(largos.map((r) => `${r}: ${mensajeDe(r).length}`)).toEqual([]);
  });
```

- [ ] **Step 2: Corre los tests y míralos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts src/components/PatternEditor/__tests__/no-paso-nada.test.ts`
Expected: FAIL. `fraseDeLaFase.test.ts` no encuentra el módulo; en `no-paso-nada` fallan los tres casos nuevos (dice «arrastra», nombra la tira, `notch:ancla-perdida` mide 96).

- [ ] **Step 3: La función de la frase**

Crea `src/components/PatternEditor/fraseDeLaFase.ts`:

```ts
import type { Tool2D } from '../../types/types';
import { DEFAULT_SEAM_ALLOWANCE } from '../../utils/defaults';
import { formatMedida } from './cotas/parseMedida';
import { displayModifierKey, displayShortcut } from '../shell/shortcutDisplay';
import type { ModoShift } from './useShiftSostenido';
import type { PointToolMode } from './usePointTool';
import { ABSOLUTE_REFERENCE, angleReferenceLabel, type AngleReference } from './angleReference';

/** Arrastrar con Shift endereza a la hoja (Hilo y Editar patrón). La notación
 *  del modificador sale de `shortcutDisplay`: ⇧ en macOS, Shift+ fuera. */
const SHIFT_ENDEREZA = `${displayShortcut('⇧')}arrastrar: 0°/45°/90°`;

/** Las herramientas con las dos guías de Shift (spec 2026-09-23). */
const CON_DOS_GUIAS = new Set<Tool2D>(['pen', 'internalShape', 'editPattern']);

const COTAS = 'Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta';

/**
 * Con Shift pulsado, la frase de la Pluma, la Línea interna y `Q` la sustituye
 * una corta que dice cómo llegar a la otra guía (spec 2026-09-23 § 4.2). Los
 * marcos se nombran como en la píldora.
 */
function fraseDeShift(modo: ModoShift, segundo: AngleReference['kind']): string {
  const shift = displayModifierKey('⇧');
  const eje = angleReferenceLabel(ABSOLUTE_REFERENCE);
  const otro = angleReferenceLabel({ kind: segundo, baseDeg: 0 });
  return modo === 'borde'
    ? `${shift} dos veces: ${otro} · una vez: ${eje}`
    : `${shift}: ${eje} · ${shift} dos veces: ${otro}`;
}

/** Lo que la frase necesita saber de la herramienta activa y de su gesto. */
export interface FaseDeLaHerramienta {
  activeTool: Tool2D;
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  /** Fase del gesto de coser (#199, #1029): 'holdingA' sosteniendo la primera mitad. */
  seamPhase?: 'idle' | 'holdingA';
  topstitchMode?: string;
  walkSeamPhase?: string;
  /** Fase de «Abrir la pieza»: cinco clics y ninguno se adivina, así que va una a una. */
  slashPhase?: string;
  /** El margen que pone un clic dentro de la pieza (editor.defaultSeamAllowanceWidth). */
  saDefaultWidthMm?: number;
  /** Puntos del trazo de línea interna en curso: 0 = sin trazo. */
  internalShapeNodesLength?: number;
  /** Hay cotas vivas sobre lo seleccionado (spec 2026-08-30 § 7). */
  cotasVisibles?: boolean;
  /** Hay al menos una costura. Sin ninguna, el clic de Editar costuras no hace nada (#1098). */
  hasSeams?: boolean;
  /** Modo de Extender / recortar (#1178). */
  extendTrimMode?: 'extend' | 'trim';
  /** Hay un extremo o un punto de recorte elegido, esperando su confirmación (#1178). */
  extendTrimArmed?: boolean;
  /** Shift en la herramienta activa: suelto, una vez (el eje) o dos (el borde). */
  modoShift?: ModoShift;
  /** El marco de Shift dos veces, si hay uno distinto del eje que elegir. */
  segundoMarco?: AngleReference['kind'] | null;
  /** El tamaño con que un clic crea el rectángulo (spec 2026-08-30 § 3.1). */
  rectanguloPorDefecto?: { width: number; height: number };
  /** Tijeras: el primer punto del corte ya está puesto. */
  tijerasEmpezadas?: boolean;
  /** Medir: el primer punto ya está puesto. */
  medidaEmpezada?: boolean;
  /** Punto: lo que hace el clic, la alternativa elegida de su opción. */
  modoDelPunto?: PointToolMode;
}

/**
 * La frase de la fase (spec 2026-10-02 «la interfaz en papel» § 5.4): lo único
 * que le explica a María cómo se usa la herramienta activa, en la línea al pie.
 * Una sola, en una línea; `null` si no hay nada que decir. Ninguna tecla pierde
 * su único anuncio: si un gesto no cabe, se cae el gesto, no la tecla. Hasta
 * P2b esto era `HintText.tsx`, un `<text>` de SVG al pie de la hoja.
 */
export function fraseDeLaFase(f: FaseDeLaHerramienta): string | null {
  const tool = f.activeTool;
  // El editor de nodos tiene su propia frase, y gana: dos a la vez se pisaban.
  if (f.nodeEditorIsEditing) return 'Editando nodos · arrastra para mover · Esc para salir';
  if (f.modoShift && f.modoShift !== 'suelto' && f.segundoMarco && CON_DOS_GUIAS.has(tool)) {
    return fraseDeShift(f.modoShift, f.segundoMarco);
  }

  switch (tool) {
    // María [12:48]: «cuál es la diferencia… no está bien definido para qué es
    // cada comando». La respuesta es corta y no estaba escrita (#1103).
    case 'select':
      return f.cotasVisibles
        ? COTAS
        : 'Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva';
    case 'transform':
      return f.cotasVisibles ? COTAS : null;
    // Y [34:24]: «por qué este punto es redondo y este cuadrado». La forma SÍ
    // dice el tipo: faltaba decir cuál es cuál.
    case 'editPattern':
      return `Cuadrado es esquina · redondo es punto de curva · rombo es extremo abierto · arrastra para mover · ${SHIFT_ENDEREZA}`;
    case 'point':
      if (f.modoDelPunto === 'curvePoints') return 'Clic en un tramo lo convierte en curva por puntos';
      if (f.modoDelPunto === 'bezier') return 'Clic en un tramo lo convierte en curva bezier';
      return 'Clic en un borde añade un punto · arrastra por el borde para elegir dónde';
    // Con dos puntos Enter NO cierra ninguna pieza: deja un trazo (spec de
    // trazos § 3.1). Decir «cierra la pieza» prometía lo que no pasa.
    case 'pen':
      return f.penNodesLength > 0
        ? 'Tab escribe la medida · clic en el primer punto cierra · Enter termina: pieza con tres puntos, trazo con dos · Retroceso quita un punto · Esc deja el trazo'
        : 'Clic pone el primer punto · arrastra para curvar';
    case 'internalShape':
      return (f.internalShapeNodesLength ?? 0) === 0
        ? 'Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan'
        : 'Tab escribe la medida · Enter termina · Retroceso quita un punto · Esc descarta';
    case 'rectangle': {
      const r = f.rectanguloPorDefecto;
      const tam = r ? `uno de ${formatMedida(r.width, 'mm').replace(' mm', '')} × ${formatMedida(r.height, 'mm')}` : 'con el último tamaño';
      return `Arrastra para dibujar · un clic crea ${tam} · escribe en sus cotas para cambiarlo · Esc cancela`;
    }
    case 'circle':
      return 'Arrastra para dibujar · un clic crea con el último radio · escribe en sus cotas para cambiarlo · Esc cancela';
    case 'triangle':
      return 'Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela';
    case 'grainline':
      return `Arrastra dentro de la pieza para el hilo · ${SHIFT_ENDEREZA}`;
    case 'scissors':
      return f.tijerasEmpezadas
        ? 'Clic donde termina el corte, en otro borde · Esc cancela'
        : 'Clic en el contorno donde empieza el corte';
    case 'measure':
      return f.medidaEmpezada ? 'Clic en el segundo punto · Esc lo suelta' : 'Clic en dos puntos para medir la distancia';
    case 'seam':
      return f.seamPhase === 'holdingA'
        ? 'Ahora marca en la otra pieza · clic en vacío o Esc suelta'
        : 'Clic cose el lado entero · arrastre cose solo un tramo';
    case 'seamEdit':
      return f.hasSeams === false ? 'No hay costuras: cose primero con N' : 'Clic en un lado para ver con qué está cosido';
    case 'seamAllowance':
      return `Pasa por un borde para leer su margen · clic para escribirlo · pieza entera: ${formatMedida(f.saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE, 'mm')} · esquina: su tipo`;
    case 'notch':
      return 'Clic en el borde donde va el piquete';
    case 'topstitchSeamline':
    case 'topstitchSegment':
    case 'topstitchFree':
    case 'topstitchEdit': {
      const frases: Record<string, string> = {
        seamline: 'Clic en un borde lo pespuntea entero',
        segment: 'Clic en dos puntos del mismo borde',
        free: 'Clic añade puntos · Enter confirma · Retroceso deshace · Esc cancela',
        edit: 'Clic en un pespunte para seleccionarlo y editarlo',
      };
      return frases[f.topstitchMode ?? 'seamline'] ?? frases.seamline;
    }
    case 'hand':
      return 'Arrastra para mover la vista · el botón del medio del ratón hace lo mismo sin salir de la herramienta que estés usando';
    case 'measureCurve':
      return 'Clic en un borde para leer su largo siguiendo la curva · clic en otro cambia de borde';
    case 'compareCurves':
      return 'Clic en un borde y después en otro para ver la diferencia de largo';
    // `canExecute` de Desplazar tenía un solo consumidor: el propio Enter. Sin
    // esta frase, nada enseñaba que esa tecla existe (#1178).
    case 'offsetOutline':
      return 'Enter aplica el desplazamiento';
    case 'extendTrim':
      if (f.extendTrimMode === 'trim') {
        return f.extendTrimArmed
          ? 'Clic del lado que quieres conservar, o Enter conserva el lado más cercano · Esc cancela'
          : 'Clic sobre un borde para marcar dónde recortar';
      }
      return f.extendTrimArmed
        ? 'Clic otra vez, o Enter, confirma el extremo · Esc cancela'
        : 'Clic en el extremo de un borde para extenderlo';
    // Por fases, porque los cinco clics en una línea no caben. OJO con Esc:
    // solo en `spreadPreview` vuelve UN paso (`useSlashAndSpreadTool.ts`); en
    // las demás es un reinicio, y por eso ninguna otra lo nombra.
    case 'slashAndSpread': {
      const frases: Record<string, string> = {
        idle: 'Clic en el contorno de la pieza para empezar el corte',
        drawingSlash: 'Clic en el contorno para cerrar el corte · Esc cancela',
        slashComplete: 'Clic en la mitad que quieres mover',
        selectingHalf: 'Clic otra vez en esa mitad para confirmarla',
        halfConfirmed: 'Clic en una punta del corte: esa se queda quieta',
        awaitingDrag: 'Mueve el ratón para abrir · Tab: girar o separar',
        spreading: 'Suelta cuando esté como la quieres',
        spreadPreview: 'Enter la abre de verdad · Esc descarta la prueba',
      };
      return frases[f.slashPhase ?? 'idle'] ?? frases.idle;
    }
    case 'trimPlace':
      return 'Clic en un borde pone el avío elegido';
    case 'walkSeam': {
      const frases: Record<string, string> = {
        idle: 'Clic en un borde para recorrer la costura · Shift+clic para par manual',
        stationary: 'Shift+clic en otro borde para par manual · o auto-emparejado por la costura',
        walking: 'Recorre el borde con el cursor · clic reinicia · Esc limpia',
      };
      return frases[f.walkSeamPhase ?? 'idle'] ?? frases.idle;
    }
    default:
      return null;
  }
}

/** La frase que enseña la línea al pie, con su clase de mensaje. */
export interface FraseDelPie {
  texto: string;
  tipo: 'desenlace' | 'falta' | 'fase';
}

/**
 * La prioridad de la frase (spec § 5.4): el gesto que murió sin dejar nada
 * (`desenlace`, 4 s), lo que a la herramienta le falta para trabajar, y la
 * frase de la fase.
 */
export function fraseDelPie(desenlace: string | null, falta: string | null, fase: string | null): FraseDelPie | null {
  if (desenlace) return { texto: desenlace, tipo: 'desenlace' };
  if (falta) return { texto: falta, tipo: 'falta' };
  return fase ? { texto: fase, tipo: 'fase' } : null;
}
```

En `src/components/PatternEditor/noPasoNada.ts`, reemplaza en la cabecera:

```ts
 * Canal: bitácora siempre, tira para las accionables, toast nunca. Un gesto
 * que no pasó nada se repite cinco veces en tres segundos, y serían cinco
 * toasts encima del lienzo; la tira ya tiene sus ranuras de texto y no
 * interrumpe.
```

por:

```ts
 * Canal: bitácora siempre, la frase de la línea al pie para las accionables,
 * toast nunca. Un gesto que no pasó nada se repite cinco veces en tres
 * segundos, y serían cinco toasts encima del lienzo; la frase ya está ahí y no
 * interrumpe.
```

y los cuatro mensajes:

```ts
  'notch:sin-sitio': 'No cabe un piquete ahí; prueba un poco más adentro del borde',
```
→
```ts
  'notch:sin-sitio': 'El piquete no cabe ahí; prueba más adentro del borde',
```

```ts
  'notch:ancla-perdida': 'El contorno cambió y el piquete perdió su esquina de referencia; colócalo otra vez con un clic',
  'tijeras:corte-no-cruza': 'La línea de corte tiene que entrar por un lado y salir por otro; arrastra de borde a borde',
```
→
```ts
  'notch:ancla-perdida': 'El contorno cambió; marca el piquete otra vez con un clic',
  'tijeras:corte-no-cruza': 'El corte tiene que cruzar la pieza; marca el final en otro borde',
```

```ts
  'pespunte:desplazamiento-no-cabe': 'El desplazamiento no cabe en ese borde; reduce la distancia en la tira',
```
→
```ts
  'pespunte:desplazamiento-no-cabe': 'El pespunte no cabe; reduce la separación',
```

y, en el `catch` de `noPasoNada`, el comentario `// El gesto ya ocurrió; la tira es decoración del desenlace y no puede` → `// El gesto ya ocurrió; la frase es decoración del desenlace y no puede`.

- [ ] **Step 4: Corre los tests y míralos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts src/components/PatternEditor/__tests__/no-paso-nada.test.ts && npx tsc -b --noEmit`
Expected: PASS; typecheck limpio (si un `case` del `switch` no es miembro de `Tool2D`, el typecheck lo dice: se borra ese `case`, que tampoco tenía rama en `HintText`, y se anota como Ruling).

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/fraseDeLaFase.ts src/components/PatternEditor/noPasoNada.ts src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts src/components/PatternEditor/__tests__/no-paso-nada.test.ts
git commit -m "feat(pie): la frase de la fase, en una línea y con todas sus teclas"
```

---

### Task 3: La línea al pie

**Files:**
- Create: `src/components/shell/herramientaParaMostrar.ts`
- Create: `src/components/PatternEditor/SeccionDelPatron.tsx`, `src/components/PatternEditor/SeccionDelPatron.css`
- Modify: `src/components/shell/LeftDock.tsx:12-25, 76`
- Modify: `src/components/shell/AppShell.tsx:124, 333-356`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (importaciones, props, frase, raíz, `HintText` y tarjeta fuera)
- Modify: `src/components/PatternEditor/cotas/sujeto.ts` (fuera `lineaDeSujeto`)
- Modify: `src/components/PatternEditor/cotas/CotaChip.tsx:145-150`
- Modify: `src/components/shell/barPosition.ts`
- Modify: `src/styles/layout.css` (`.linea-al-pie`), `src/styles/tokens.css:144-150, 251-254, 352`
- Delete: `src/components/PatternEditor/ToolStrip2D.tsx`, `ToolStrip2D.css`, `renderers/HintText.tsx`, `__tests__/ToolStrip2D.test.tsx`, `renderers/__tests__/HintText.{desplazarYRecortar,hilo,legibilidad,lineaInterna,sew,shift}.test.tsx`
- Move: `src/components/PatternEditor/__tests__/1125-tira-inerte-tras-el-modal.test.tsx` → `1125-pie-inerte-tras-el-modal.test.tsx`; `tests/e2e/emplazamiento-tira.spec.ts` → `tests/e2e/linea-al-pie.spec.ts`
- Test: Create `src/components/PatternEditor/__tests__/SeccionDelPatron.test.tsx`; Modify `src/components/shell/__tests__/unifiedBarPosition.test.ts`, `tests/repo/superficies-declaradas.test.ts`, `tests/repo/lo-que-flota-es-papel.test.ts`, `tests/repo/reposo-lo-que-sobra.test.ts`, `tests/repo/el-gate-corre-los-trinquetes.test.ts`, `src/styles/__tests__/zIndexScale.test.ts`, `src/styles/__tests__/tipografia-del-cromo.test.ts`, `src/components/PatternEditor/__tests__/{circulo,triangulo}-nace-con-gesto.test.ts`, `src/components/PatternEditor/cotas/__tests__/{CotaChip.test.tsx,sujeto.test.ts,sujeto.margen.test.ts,sujeto.lado.test.ts,sujeto.internas.test.ts,sujeto.trazo.test.ts,tramoEnCurso.test.ts,vecinosDelNodo.test.ts}`; e2e `tests/e2e/{1100-margen-en-el-borde,maria-195-siguiente-punto,trazos,linea-interna-gramatica,emplazamiento-lienzo-2d,las-siete-puertas,supr-con-algo-delante}.spec.ts`, `tests/e2e/helpers/superficies.ts`, `scripts/deploy-prod.sh`

**Interfaces:**
- Consumes: `Control` (Task 1); `fraseDeLaFase`, `fraseDelPie`, `FraseDelPie` (Task 2); `faltaSujeto` y el `desenlace` de `PatternEditor`.
- Produces: `herramientaParaMostrar(id: string): DockToolDef | undefined` (`src/components/shell/herramientaParaMostrar.ts`); `SeccionDelPatron` (default export) con props `{ frase: FraseDelPie | null; inerte?: boolean; onClearMeasurements?: () => void; hasMeasurements?: boolean }`, raíz `div.seccion-del-patron[role=group][aria-label="Herramienta activa"][data-shortcut-context="2d"]`, hijos `.seccion-del-patron__quien` (con `__nombre` y `__tecla`), `.seccion-del-patron__opciones[data-superficie="pie"]` (cada control es un `.opcion-del-pie` hijo directo) y `.seccion-del-patron__frase[aria-live="polite"]` con `.seccion-del-patron__texto[data-superficie="pista"]`. `PatternEditor` gana la prop `ranuraDelPie?: HTMLElement | null`. En el DOM: `.linea-al-pie` > `.linea-al-pie__patron`.

- [ ] **Step 1: Escribe los tests que fallan**

`src/components/PatternEditor/__tests__/SeccionDelPatron.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { setActiveTool, setDefaultSAWidth } from '../../../store/editorSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import type { Tool2D } from '../../../types/types';
import { ShortcutProvider, DEFAULT_SHORTCUTS } from '../../../shortcuts';
import { displayShortcutBinding } from '../../shell/shortcutDisplay';
import SeccionDelPatron from '../SeccionDelPatron';
import type { FraseDelPie } from '../fraseDeLaFase';

/**
 * La sección del patrón de la línea al pie (spec 2026-10-02 § 5.3 y § 5.4):
 * hereda los casos de la tarjeta de la esquina (`ToolStrip2D`, borrada en
 * P2b) y mide lo nuevo: el nombre del margen, las superficies `pie` y
 * `pista`, la prioridad de la frase y el contexto de los atajos.
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const CON_OPCIONES: ToolDefinition = {
  id: '__pie_con_opciones',
  name: 'Herramienta de prueba',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    { id: 'lista', label: 'Una lista', type: 'select', value: 'a', choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }] },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
  ],
};
const SIN_OPCIONES: ToolDefinition = { id: '__pie_sin_opciones', name: 'Herramienta pelada', context: '2d', icon: IconoVacio };
toolRegistry.registerTool(CON_OPCIONES);
toolRegistry.registerTool(SIN_OPCIONES);

afterEach(cleanup);

function crearStore(activeTool: string) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool(activeTool as Tool2D));
  return store;
}

function montar(
  activeTool: string,
  props: { frase?: FraseDelPie | null; onClearMeasurements?: () => void; hasMeasurements?: boolean } = {},
) {
  const store = crearStore(activeTool);
  const utils = render(
    <Provider store={store}>
      <SeccionDelPatron
        frase={props.frase ?? null}
        onClearMeasurements={props.onClearMeasurements}
        hasMeasurements={props.hasMeasurements}
      />
    </Provider>,
  );
  return { store, ...utils };
}

describe('quién', () => {
  it('sin opciones sigue presente con el nombre: la puerta no se pierde', () => {
    montar('__pie_sin_opciones');
    expect(screen.getByRole('group', { name: 'Herramienta activa' })).toBeTruthy();
    expect(screen.getByText('Herramienta pelada')).toBeTruthy();
  });

  it('una del margen se llama como en el margen', () => {
    montar('seamAllowance');
    expect(screen.getByText('Margen de costura')).toBeTruthy();
  });

  it('enseña la tecla efectiva, en un kbd', () => {
    const store = crearStore('notch');
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <SeccionDelPatron frase={null} />
        </ShortcutProvider>
      </Provider>,
    );
    const def = DEFAULT_SHORTCUTS.find((s) => s.id === 'tool.notch')!;
    const esperado = displayShortcutBinding({ key: def.key, ctrl: def.ctrl, shift: def.shift, alt: def.alt });
    expect(esperado).not.toBe('');
    expect(screen.getByText(esperado).tagName).toBe('KBD');
  });
});

describe('las opciones', () => {
  it('un control por opción, y cada cambio despacha setToolOption', () => {
    const { store } = montar('__pie_con_opciones');
    fireEvent.click(screen.getByRole('button', { name: 'Opción B' }));
    fireEvent.change(screen.getByLabelText('Un número'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Un interruptor' }));
    const v = store.getState().tools.toolOptions.__pie_con_opciones;
    expect(v.lista).toBe('b');
    expect(v.numero).toBe(7);
    expect(v.interruptor).toBe(true);
  });

  it('con opciones hay UNA superficie «pie», y cada control es su hijo directo; sin opciones, ninguna', () => {
    const { container } = montar('__pie_con_opciones');
    const pie = container.querySelectorAll('[data-superficie="pie"]');
    expect(pie).toHaveLength(1);
    expect([...pie[0].children].filter((h) => h.classList.contains('opcion-del-pie'))).toHaveLength(3);
    cleanup();
    expect(montar('__pie_sin_opciones').container.querySelector('[data-superficie="pie"]')).toBeNull();
  });

  it('con el rectángulo no pinta Ancho ni Alto: son cotas sobre la pieza', () => {
    const { container } = montar('rectangle');
    expect(screen.queryByLabelText('Ancho')).toBeNull();
    expect(screen.queryByLabelText('Alto')).toBeNull();
    expect(screen.getByText('Rectángulo')).toBeTruthy();
    expect(container.querySelector('[data-superficie="pie"]')).toBeNull();
  });

  it('#1100 — «Margen del próximo clic» escribe el margen del próximo clic, acotado, y refleja el store', () => {
    const { store } = montar('seamAllowance');
    const campo = screen.getByLabelText('Margen del próximo clic (mm)') as HTMLInputElement;
    expect(campo.value).toBe(String(store.getState().editor.defaultSeamAllowanceWidth));
    fireEvent.change(campo, { target: { value: '18.5' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(18.5);
    fireEvent.change(campo, { target: { value: '80' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(50);
    fireEvent.blur(campo);
    act(() => { store.dispatch(setDefaultSAWidth(12)); });
    expect(campo.value).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(12.5);
  });

  it('#1100 — las demás herramientas no enseñan ni tocan el margen del próximo clic', () => {
    const { store } = montar('__pie_sin_opciones');
    const antes = store.getState().editor.defaultSeamAllowanceWidth;
    expect(screen.queryByLabelText('Margen del próximo clic (mm)')).toBeNull();
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(antes);
  });

  it('Borrar mediciones: con Medir está, apagado sin mediciones; con mediciones, borra', () => {
    const borrar = vi.fn();
    montar('measure', { onClearMeasurements: borrar, hasMeasurements: false });
    expect((screen.getByRole('button', { name: 'Borrar mediciones' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    montar('measure', { onClearMeasurements: borrar, hasMeasurements: true });
    fireEvent.click(screen.getByRole('button', { name: 'Borrar mediciones' }));
    expect(borrar).toHaveBeenCalledTimes(1);
  });
});

describe('la frase', () => {
  it('la de la fase es una «pista» llana; lo que falta, con relleno; el desenlace, con su riel', () => {
    for (const tipo of ['fase', 'falta', 'desenlace'] as const) {
      const { container } = montar('__pie_sin_opciones', { frase: { texto: `una ${tipo}`, tipo } });
      const texto = container.querySelector('[data-superficie="pista"]')!;
      expect(texto.textContent).toBe(`una ${tipo}`);
      expect(texto.classList.contains(`seccion-del-patron__texto--${tipo}`)).toBe(true);
      expect(texto.getAttribute('title'), 'recortada, entera en el título').toBe(`una ${tipo}`);
      cleanup();
    }
  });

  it('la región viva está montada siempre, también sin frase (los lectores anuncian cambios dentro de una región que ya existía)', () => {
    const { container } = montar('__pie_sin_opciones', { frase: null });
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('[data-superficie="pista"]')).toBeNull();
  });
});

describe('el teclado', () => {
  it('es contexto 2D de los atajos: con el foco en un botón del pie, las teclas siguen siendo las del patrón', () => {
    const { container } = montar('__pie_con_opciones');
    expect(container.querySelector('.seccion-del-patron')!.getAttribute('data-shortcut-context')).toBe('2d');
  });

  it('el selector devuelve una referencia estable cuando no hay valores guardados', () => {
    const avisos: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { avisos.push(args.map(String).join(' ')); });
    montar('__pie_sin_opciones');
    spy.mockRestore();
    expect(avisos.filter((a) => a.includes('Selector unknown returned a different result'))).toEqual([]);
  });
});
```

Mueve y reescribe el test de #1125:

```bash
git mv src/components/PatternEditor/__tests__/1125-tira-inerte-tras-el-modal.test.tsx src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx
```

Contenido entero de `src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { setActiveTool } from '../../../store/editorSlice';
import SeccionDelPatron from '../SeccionDelPatron';

afterEach(cleanup);

/**
 * Issue #1125 — «la tira de opciones 2D sigue alcanzable por teclado detrás
 * del modal de piquete».
 *
 * `NotchPrecisionModal` no usa `createPortal`, no atrapa el foco y no marca
 * nada como inerte. Hasta P2b la tarjeta vivía debajo, en su misma esquina, y
 * Shift+Tab desde el campo del modal llevaba el foco a controles invisibles.
 * Desde P2b las opciones viven en la línea al pie, a la vista, pero el modal
 * sigue sin atrapar el foco hasta que P3 lo borre: con él abierto, la sección
 * del patrón se declara inerte y nadie cambia una opción del piquete por
 * debajo del que se está ajustando.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F9.
 */
const pintar = (inerte: boolean) => {
  store.dispatch(setActiveTool('notch'));
  return render(
    <Provider store={store}>
      <SeccionDelPatron frase={null} inerte={inerte} />
    </Provider>,
  );
};

describe('#1125 — la sección del patrón no recibe foco cuando hay un modal encima', () => {
  it('en reposo es alcanzable por teclado', () => {
    const seccion = pintar(false).container.querySelector('.seccion-del-patron');
    expect(seccion, 'la sección no se pintó').not.toBeNull();
    expect(seccion!.hasAttribute('inert'), 'la sección nace inerte y no debería').toBe(false);
  });

  it('con el modal abierto queda inerte', () => {
    const seccion = pintar(true).container.querySelector('.seccion-del-patron');
    expect(seccion!.hasAttribute('inert'), 'la sección sigue alcanzable por teclado').toBe(true);
  });

  it('inerte en el contenedor, no en cada botón: no se olvida ninguno', () => {
    // `inert` implica aria-hidden en los navegadores, pero jsdom no lo simula:
    // lo que se fija es que el atributo esté en el CONTENEDOR. Con el piquete
    // hay botones de verdad (sus formas), así que el recorrido no pasa vacío.
    const botones = pintar(true).container.querySelectorAll('.seccion-del-patron button');
    expect(botones.length, 'sin botones el test pasaría en vacío').toBeGreaterThan(0);
    for (const b of botones) {
      expect(b.closest('[inert]'), 'hay un botón fuera del subárbol inerte').not.toBeNull();
    }
  });
});
```

En `src/components/shell/__tests__/unifiedBarPosition.test.ts`, en los dos casos de «falls back to bottom-center», cambia `y: 900 - 58 - 24` por `y: 900 - 40 - 58 - 24` (a 1600 px la línea al pie mide `clamp(36px, 2,5vw, 48px)` = 40). Y añade al final del archivo:

```ts
describe('la barra no tapa la línea al pie (spec 2026-10-02 § 5.3)', () => {
  it('con la línea montada, no baja de su borde de arriba', () => {
    setViewport(1366, 643);
    localStorage.clear();
    const linea = document.createElement('div');
    linea.className = 'linea-al-pie';
    linea.getBoundingClientRect = () => ({ top: 607, bottom: 643, left: 0, right: 1366, width: 1366, height: 36, x: 0, y: 607, toJSON: () => ({}) });
    document.body.appendChild(linea);
    try {
      expect(clampPosition(400, 9999).y).toBe(607 - 58 - 16);
      expect(loadPosition().y).toBe(607 - 58 - 24);
    } finally {
      linea.remove();
    }
  });

  it('sin la línea montada (el primer render) la calcula como --top-bar-h: una posición guardada antes de P2b no queda debajo', () => {
    setViewport(1366, 643);
    localStorage.setItem(KEY, JSON.stringify({ x: 400, y: 643 - 58 - 24 }));
    expect(loadPosition().y).toBe(643 - 36 - 58 - 16);
  });
});
```

En `tests/repo/superficies-declaradas.test.ts`: en `VOCABULARIO` cambia `'tira', 'pista',` por `'pie', 'pista',`; en `MARCAS` borra las filas de `ToolStrip2D.tsx` y de `HintText.tsx`, y añade, detrás de la de `Dock.tsx`:

```ts
  // La línea al pie (spec 2026-10-02 § 5.3): marco. Lo que aparece en ella
  // son las opciones (`pie`) y la frase (`pista`), que pinta la sección del
  // patrón por portal.
  ['src/components/shell/AppShell.tsx', 'ambiente', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'pie', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'pista', 1],
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, en la cabecera cambia `Fuera a propósito: la barra de IA y la tira (pasan en P2), la fila, que` por `Fuera a propósito: la barra de IA (pasa en P2c), la fila, que`, y en `RAICES`, detrás de la del margen:

```ts
  // La hoja: tampoco flota, es el papel (P2b, cuando se fue la tira)
  ['src/components/PatternEditor/PatternEditor.tsx', 1],
```

En `tests/repo/reposo-lo-que-sobra.test.ts`, reemplaza el segundo caso:

```ts
  it('la tira, la fila y la barra de IA sobran, y salen ordenadas', () => {
    expect(loQueSobra(['tira', 'pista', 'fila', 'barra'], false)).toEqual(['barra', 'fila', 'tira']);
  });
```

por:

```ts
  it('las opciones al pie y la barra de IA sobran en reposo, y salen ordenadas', () => {
    expect(loQueSobra(['pie', 'pista', 'barra'], false)).toEqual(['barra', 'pie']);
  });
```

En `tests/repo/el-gate-corre-los-trinquetes.test.ts`, detrás del caso de P2a:

```ts
  it('y la red de la línea al pie (P2b), que sustituye a la de la tira', () => {
    const specs = specsDelGate();
    expect(specs).toContain('tests/e2e/linea-al-pie.spec.ts');
    expect(specs).not.toContain('tests/e2e/emplazamiento-tira.spec.ts');
  });
```

En `src/styles/__tests__/zIndexScale.test.ts`, borra la fila `{ archivo: 'src/components/PatternEditor/ToolStrip2D.css', … nota: 'tira de herramienta 2D' },`.

En `src/styles/__tests__/tipografia-del-cromo.test.ts`, en `PERMITIDOS`, cambia `'src/components/PatternEditor/ToolStrip2D.css': ['.tool-strip__shortcut'],` por `'src/components/PatternEditor/SeccionDelPatron.css': ['.seccion-del-patron__tecla'],`.

En `src/components/PatternEditor/__tests__/circulo-nace-con-gesto.test.ts`, añade `import { fraseDeLaFase } from '../fraseDeLaFase';` a las importaciones y reemplaza los dos casos que leen `HintText.tsx`:

```ts
  it('tiene su línea de ayuda en la pista', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    expect(hint, 'el círculo no instruye a nadie').toMatch(/circle/);
  });

  it('la pista está en español y no promete lo que no hace', () => {
    const hint = lee('src/components/PatternEditor/renderers/HintText.tsx');
    const bloque = hint.match(/circle[^}]{0,400}/s)?.[0] ?? '';
    expect(bloque).not.toMatch(/\b(drag|click|draw|shape)\b/i);
    expect(bloque, 'promete el arco, que ya no existe').not.toMatch(/arco/i);
  });
```

por:

```ts
  it('tiene su frase en la línea al pie', () => {
    expect(fraseDeLaFase({ activeTool: 'circle', penNodesLength: 0, nodeEditorIsEditing: false }), 'el círculo no instruye a nadie').toBeTruthy();
  });

  it('la frase está en español y no promete lo que no hace', () => {
    const frase = fraseDeLaFase({ activeTool: 'circle', penNodesLength: 0, nodeEditorIsEditing: false }) ?? '';
    expect(frase).not.toMatch(/\b(drag|click|draw|shape)\b/i);
    expect(frase, 'promete el arco, que ya no existe').not.toMatch(/arco/i);
  });
```

y lo mismo en `triangulo-nace-con-gesto.test.ts` (con `'triangle'`, «el triángulo no instruye a nadie», y sin la línea del arco).

En `src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`, el último caso: el nombre `'Tab desde el último chip sale del grupo hacia la tira de herramienta'` → `'Tab desde el último chip sale del grupo hacia la línea al pie'`, y `<div className="tool-strip"><select aria-label="Tipo"><option>a</option></select></div>` → `<div className="seccion-del-patron"><select aria-label="Tipo"><option>a</option></select></div>`.

- [ ] **Step 2: Corre los tests y míralos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/SeccionDelPatron.test.tsx src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx src/components/shell/__tests__/unifiedBarPosition.test.ts tests/repo src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`
Expected: FAIL. `SeccionDelPatron` no existe; la barra baja hasta 643 − 58 − 16; el vocabulario no tiene `pie` y `AppShell.tsx` no declara `ambiente`; `PatternEditor.tsx` no lleva `data-material`; la lista del gate todavía nombra `emplazamiento-tira`; Tab sale a `.tool-strip`.

- [ ] **Step 3: El nombre de cualquier herramienta, para el margen y para el pie**

Crea `src/components/shell/herramientaParaMostrar.ts`:

```ts
import { toolRegistry } from '../../tools';
import { getDockToolById, type DockIcon, type DockToolDef } from './dock2dTools';

/**
 * Cómo se enseña una herramienta: del catálogo del margen si es una de las
 * suyas, y si no (Transformar, con A, o una que solo abren el menú o los
 * comandos) del registro de herramientas, con su nombre en español. La usan el
 * margen, para la activa que no está en él, y la línea al pie, para nombrar la
 * activa (spec 2026-10-02 § 4.3 y § 5.3). El grupo solo lo lee el margen.
 */
export function herramientaParaMostrar(id: string): DockToolDef | undefined {
  const delCatalogo = getDockToolById(id);
  if (delCatalogo) return delCatalogo;
  const def = toolRegistry.getTool(id);
  // El icono del registro solo acepta `size` numérico; quien lo pinta siempre le pasa 16.
  return def ? { id, icon: def.icon as DockIcon, label: def.name, grupo: 'editar' } : undefined;
}
```

En `src/components/shell/LeftDock.tsx`: borra la función `herramientaDeFuera` entera (con su comentario, líneas 12-25), cambia `import { toolRegistry } from '../../tools';` por `import { herramientaParaMostrar } from './herramientaParaMostrar';`, y en el cuerpo `herramientaDeFuera(activeTool)` por `herramientaParaMostrar(activeTool)`.

- [ ] **Step 4: La sección del patrón**

Crea `src/components/PatternEditor/SeccionDelPatron.tsx`:

```tsx
import { Fragment, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setDefaultSAWidth } from '../../store/editorSlice';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from '../shell/shortcutDisplay';
import { herramientaParaMostrar } from '../shell/herramientaParaMostrar';
import { Control } from './ToolOptionControls';
import type { FraseDelPie } from './fraseDeLaFase';
import './SeccionDelPatron.css';

/** Referencia estable: un `?? {}` dentro del selector re-renderiza en bucle. */
const SIN_VALORES: Record<string, unknown> = {};

/**
 * Opciones que no van al pie porque su puerta son las cotas sobre la pieza
 * (spec 2026-08-30 § 6): Ancho y Alto del rectángulo siguen en `toolSlice`
 * como el tamaño del próximo clic, y la frase lo dice.
 */
const OCULTAS: Record<string, ReadonlySet<string>> = {
  rectangle: new Set(['width', 'height']),
};

/**
 * «Margen del próximo clic» no es una opción del registro: escribe
 * `editor.defaultSeamAllowanceWidth`, que el reducer acota a [0, 50].
 */
const MARGEN_DEL_PROXIMO_CLIC: ToolOption = {
  id: 'margenDelProximoClic',
  label: 'Margen del próximo clic (mm)',
  type: 'number',
  value: 10,
  min: 0,
  max: 50,
  step: 0.5,
};

/** Las tres que dejan mediciones: su borrado tiene puerta aquí, junto a sus mandos (Medir, D3). */
const DEJAN_MEDICIONES = new Set(['measure', 'measureCurve', 'compareCurves']);

/**
 * La sección del patrón de la línea al pie (spec 2026-10-02 «la interfaz en
 * papel» § 5.3 y § 5.4): quién (el icono, el nombre y la tecla de la
 * herramienta activa), sus opciones como botones, y la frase. Sustituye a la
 * tarjeta de la esquina (`ToolStrip2D`, § 8). `PatternEditor` la pinta por
 * portal en la ranura de la línea al pie, porque la frase sale del estado de
 * sus herramientas.
 *
 * Es contexto 2D de los atajos: con el foco en un botón de aquí, las teclas
 * siguen siendo las del patrón, como cuando la tarjeta vivía dentro de la hoja.
 */
export default function SeccionDelPatron({
  frase,
  inerte = false,
  onClearMeasurements,
  hasMeasurements = false,
}: {
  frase: FraseDelPie | null;
  /** Hay un modal encima (el del piquete, hasta P3): la sección no recibe el foco (#1125). */
  inerte?: boolean;
  onClearMeasurements?: () => void;
  hasMeasurements?: boolean;
}) {
  const dispatch = useDispatch();
  const raiz = useRef<HTMLDivElement>(null);
  const registroDeAtajos = useShortcutRegistry();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const margenDelProximoClic = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const valores = useSelector((s: RootState) => s.tools.toolOptions[activeTool] ?? SIN_VALORES);

  // `inert` no existe en los tipos de React 18: se pone en el DOM a mano, en el
  // contenedor y no en cada control, para que no se olvide ninguno (#1125).
  useEffect(() => {
    raiz.current?.toggleAttribute('inert', inerte);
  }, [inerte]);

  const alCambiar = useCallback(
    (optionId: string, value: unknown) => dispatch(setToolOption({ toolId: activeTool, optionId, value })),
    [dispatch, activeTool],
  );

  const quien = herramientaParaMostrar(activeTool);
  const Icono = quien?.icon;
  const nombre = quien?.label ?? activeTool;
  // El atajo EFECTIVO, no el de fábrica: el registro guarda los de la usuaria.
  const combo = registroDeAtajos?.getBinding(`tool.${activeTool}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;

  const ocultas = OCULTAS[activeTool];
  const controles: Array<{ clave: string; nodo: ReactNode }> = (toolRegistry.getTool(activeTool)?.options ?? [])
    .filter((o) => !ocultas?.has(o.id))
    .map((o) => ({
      clave: o.id,
      nodo: <Control opcion={o} valor={valores[o.id] ?? o.value} alCambiar={(v) => alCambiar(o.id, v)} />,
    }));
  if (activeTool === 'seamAllowance') {
    controles.push({
      clave: MARGEN_DEL_PROXIMO_CLIC.id,
      nodo: (
        <Control
          opcion={MARGEN_DEL_PROXIMO_CLIC}
          valor={margenDelProximoClic}
          alCambiar={(v) => dispatch(setDefaultSAWidth(Number(v)))}
        />
      ),
    });
  }
  if (DEJAN_MEDICIONES.has(activeTool)) {
    controles.push({
      clave: 'borrarMediciones',
      nodo: (
        <div className="opcion-del-pie">
          <button
            type="button"
            className="opcion-del-pie__accion"
            onClick={onClearMeasurements}
            disabled={!hasMeasurements || !onClearMeasurements}
          >
            Borrar mediciones
          </button>
        </div>
      ),
    });
  }

  return (
    <div ref={raiz} className="seccion-del-patron" role="group" aria-label="Herramienta activa" data-shortcut-context="2d">
      <span className="seccion-del-patron__quien">
        {Icono && <Icono size={16} />}
        <span className="seccion-del-patron__nombre">{nombre}</span>
        {atajo && <kbd className="seccion-del-patron__tecla">{atajo}</kbd>}
      </span>
      {controles.length > 0 && (
        <div className="seccion-del-patron__opciones" data-superficie="pie">
          {controles.map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
        </div>
      )}
      {/* La región viva va montada SIEMPRE y solo cambia su contenido: los
          lectores de pantalla anuncian cambios DENTRO de una región que ya
          existía (el precedente es ToastContainer.tsx). */}
      <div className="seccion-del-patron__frase" aria-live="polite">
        {frase && (
          <span
            className={`seccion-del-patron__texto seccion-del-patron__texto--${frase.tipo}`}
            data-superficie="pista"
            title={frase.texto}
          >
            {frase.texto}
          </span>
        )}
      </div>
    </div>
  );
}
```

Crea `src/components/PatternEditor/SeccionDelPatron.css`:

```css
/* La sección del patrón de la línea al pie (spec 2026-10-02 «la interfaz en
   papel» § 5.3): quién, las opciones y la frase, en ese orden, el de la barra
   de opciones de Illustrator. Vive en el marco: tinta clara de `:root` sobre
   --bg-deeper. Los controles están en ToolOptionControls.css. */
.seccion-del-patron {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  column-gap: 16px;
  padding: 0 var(--sp-3);
  font-size: var(--text-sm);
}
.seccion-del-patron__quien { flex: none; display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.seccion-del-patron__nombre { color: var(--text-primary); font-size: var(--text-ui); font-weight: var(--weight-semibold); white-space: nowrap; }
.seccion-del-patron__tecla { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-tertiary); }
.seccion-del-patron__opciones {
  flex: none;
  display: flex;
  align-items: center;
  column-gap: 12px;
  /* Recorta lo que todavía no se midió, pero deja asomar el anillo de foco,
     como el grupo del patrón en la barra superior (layout.css). */
  overflow: clip;
  overflow-clip-margin: 3px;
}
/* La frase cede primero (spec § 5.3): lo que no quepa se corta con puntos
   suspensivos, y queda entero en el título y en la región viva. */
.seccion-del-patron__frase { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.seccion-del-patron__texto { display: block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-secondary); }
/* Lo que falta (#1117) se distingue por RELLENO y el desenlace por su riel,
   los dos a plena tinta: ley de estado, no solo el tono. */
.seccion-del-patron__texto--falta { display: inline-block; vertical-align: middle; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--accent-subtle); color: var(--text-primary); }
.seccion-del-patron__texto--desenlace { padding-left: 8px; border-left: 2px solid var(--accent); color: var(--text-primary); }

/* Borrar mediciones: una acción, no una opción. Se pinta también dentro del
   menú «Más», que es papel: solo tokens que valen en los dos materiales. */
.opcion-del-pie__accion { height: 24px; padding: 0 10px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font: inherit; cursor: pointer; }
.opcion-del-pie__accion:disabled { color: var(--text-disabled); cursor: default; }
.opcion-del-pie__accion:hover { background: var(--bg-elevated); }
.opcion-del-pie__accion:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 5: La línea al pie y su ranura**

En `src/styles/layout.css`, detrás del bloque `.canvas-area__3d { … }` y antes del comentario `/* unified-bar-slot removed … */`, añade:

```css
/* La línea al pie (spec 2026-10-02 «la interfaz en papel» § 5.3): marco, del
   material y el alto de la barra superior, de lado a lado y siempre. Es una
   fila de la ventana, no flota: la hoja termina encima y nada la empuja. La
   sección del patrón la pinta PatternEditor por portal en su ranura
   (SeccionDelPatron.css); la del 3D llega en P5. */
.linea-al-pie {
  height: var(--top-bar-h);
  flex-shrink: 0;
  display: flex;
  background: var(--bg-deeper);
  border-top: 1px solid var(--border);
  color: var(--text-primary);
}
.linea-al-pie__patron { flex: 1 1 auto; min-width: 0; display: flex; }
```

En `src/components/shell/AppShell.tsx`, detrás de `const [dxfDragActive, setDxfDragActive] = useState(false);` añade:

```tsx
  // La ranura de la línea al pie donde PatternEditor pinta la sección del
  // patrón. Por estado y no por ref: el portal necesita el nodo ya montado.
  const [ranuraDelPie, setRanuraDelPie] = useState<HTMLDivElement | null>(null);
```

cambia

```tsx
          <PatternEditor
            onImportDXF={() => dxfInputRef.current?.click()}
            onOpenPanel={openPanel}
          />
```

por

```tsx
          <PatternEditor
            onImportDXF={() => dxfInputRef.current?.click()}
            onOpenPanel={openPanel}
            ranuraDelPie={ranuraDelPie}
          />
```

y, entre el cierre de `.canvas-area` y `<UnifiedBar`, es decir, reemplaza:

```tsx
      </div>
      <UnifiedBar
```

por:

```tsx
      </div>
      {/* La línea al pie (spec 2026-10-02 § 5.3): la tercera fila de la
          ventana. Marco, de lado a lado y siempre; la sección del patrón la
          llena PatternEditor por portal, porque su frase sale del estado de
          sus herramientas. */}
      <div className="linea-al-pie" data-superficie="ambiente">
        <div ref={setRanuraDelPie} className="linea-al-pie__patron" />
      </div>
      <UnifiedBar
```

- [ ] **Step 6: `PatternEditor` llena la ranura, y la hoja es papel**

En `src/components/PatternEditor/PatternEditor.tsx`:

1. Importaciones. Añade `import { createPortal } from 'react-dom';` detrás de la primera línea. Cambia `import ToolStrip2D from './ToolStrip2D';` por `import SeccionDelPatron from './SeccionDelPatron';` y añade detrás `import { fraseDeLaFase, fraseDelPie } from './fraseDeLaFase';`. Cambia `import { usePointTool } from './usePointTool';` por `import { usePointTool, type PointToolMode } from './usePointTool';`. Borra `import HintText from './renderers/HintText';`.

2. Props. Reemplaza:

```tsx
  /** Opens a named ContextPanel (e.g. 'Properties'); wired by AppShell. */
  onOpenPanel?: (name: string) => void;
}

export default function PatternEditor({ onImportDXF, onOpenPanel }: PatternEditorProps) {
```

por:

```tsx
  /** Opens a named ContextPanel (e.g. 'Properties'); wired by AppShell. */
  onOpenPanel?: (name: string) => void;
  /** La ranura de la línea al pie donde se pinta la sección del patrón (spec
   *  2026-10-02 § 5.3); la pone AppShell. Sin ella (tests) no se pinta. */
  ranuraDelPie?: HTMLElement | null;
}

export default function PatternEditor({ onImportDXF, onOpenPanel, ranuraDelPie }: PatternEditorProps) {
```

3. Los dos comentarios que hablan de la tira. Reemplaza:

```tsx
  // Las cuatro herramientas que toman el sujeto de la selección lo dicen en la
  // tira antes del clic, en vez de morirse mudas (#1117).
```

por:

```tsx
  // Las cuatro herramientas que toman el sujeto de la selección lo dicen en la
  // línea al pie antes del clic, en vez de morirse mudas (#1117).
```

```tsx
  // Va a la tira y no a un toast: el mismo gesto se repite cinco veces en tres
  // segundos y serían cinco toasts encima del lienzo.
```

por:

```tsx
  // Va a la frase de la línea al pie y no a un toast: el mismo gesto se repite
  // cinco veces en tres segundos y serían cinco toasts encima del lienzo.
```

```tsx
  // La tira pinta el nombre de la herramienta activa en su cabecera. Sin esto,
  // fallar un piquete y pasarse a Hilo dentro de los 4 s deja «Hilo» arriba y
  // el mensaje del piquete debajo: el aviso queda atribuido a la herramienta
  // equivocada. Es el mismo defecto que este canal vino a arreglar, al reves.
```

por:

```tsx
  // La línea al pie nombra la herramienta activa junto a la frase. Sin esto,
  // fallar un piquete y pasarse a Hilo dentro de los 4 s deja «Hilo» al lado
  // del mensaje del piquete: el aviso queda atribuido a la herramienta
  // equivocada. Es el mismo defecto que este canal vino a arreglar, al revés.
```

4. La frase. Detrás de `const pantallaVacia = shouldShowEmptyState(…);` (justo antes del `return (`), añade:

```tsx
  // La frase de la línea al pie (spec 2026-10-02 § 5.4), de la fase de la
  // herramienta activa. El desenlace y lo que falta le ganan (`fraseDelPie`).
  const fase = fraseDeLaFase({
    activeTool,
    penNodesLength: pen.nodes.length,
    nodeEditorIsEditing: isNodeEditing,
    seamPhase: seamTool.phase,
    topstitchMode: topstitchTool.mode,
    walkSeamPhase: walkSeamTool.mobileEdge ? 'walking' : walkSeamTool.stationaryEdge ? 'stationary' : 'idle',
    slashPhase: slashAndSpreadTool.phase,
    saDefaultWidthMm: seamAllowanceTool.widthMm,
    internalShapeNodesLength: internalShapeTool.nodes.length,
    cotasVisibles: sujeto.cotas.length > 0,
    hasSeams: seams.length > 0,
    extendTrimMode: (toolOptions?.extendTrim?.mode as 'extend' | 'trim') ?? 'extend',
    extendTrimArmed: extendTrimTool.selectedSnap !== null,
    modoShift: shiftActivo?.modo,
    segundoMarco,
    rectanguloPorDefecto: defaultRect,
    tijerasEmpezadas: scissorsTool.startPoint !== null,
    medidaEmpezada: measureTool.currentStart !== null,
    modoDelPunto: (toolOptions?.point?.mode as PointToolMode | undefined) ?? 'point',
  });
```

5. La raíz. `<div className="pattern-editor">` → `<div className="pattern-editor" data-material="papel">` y, en la línea de antes, el comentario:

```tsx
    // La hoja es papel desde P2b (spec 2026-10-02 § 7.2): se fue la tira, la
    // última superficie oscura que vivía encima. Lo que se dibuja del patrón,
    // dentro del <svg>, sigue con --ink-*.
```

6. Borra el bloque de `HintText` del `<svg>` entero, desde `        <HintText` hasta su `        />` de cierre (las 18 líneas con `activeTool={activeTool}` … `segundoMarco={segundoMarco}`), y la línea en blanco que lo sigue.

7. Reemplaza el bloque de la tarjeta:

```tsx
      {/* La tira ya no cede la esquina a nadie. La cedía porque `NextPointPanel`
          vivía en ella; los chips del tramo en curso viven sobre el trazo, que
          es donde está el gesto, así que no hay nada que esquivar (#1129). */}
      <ToolStrip2D
        lineaDeSujeto={sujeto.lineaDeSujeto}
        onClearMeasurements={measureTool.clear}
        hasMeasurements={measureTool.measurements.length > 0 || !!measureTool.selectedEdge || !!measureTool.comparison}
        falta={falta}
        desenlace={desenlace}
        /* El modal de piquete no usa portal ni atrapa el foco, y la tira vive
           en su misma esquina: se declara inerte mientras esté abierto (#1125). */
        inerte={Boolean(notchTool.refining?.notch.notchAnchor)}
      />
```

por:

```tsx
      {/* La sección del patrón de la línea al pie (spec 2026-10-02 § 5.3):
          vive en el marco, al pie de la ventana, pero su frase sale del estado
          de las herramientas de aquí, así que se pinta por portal en la ranura
          que deja AppShell. En 3D no hay hoja que explicar: la franja se queda
          y su sección del 3D llega en P5. */}
      {ranuraDelPie && editor.viewMode !== '3d' && createPortal(
        <SeccionDelPatron
          frase={fraseDelPie(desenlace, falta, fase)}
          onClearMeasurements={measureTool.clear}
          hasMeasurements={measureTool.measurements.length > 0 || !!measureTool.selectedEdge || !!measureTool.comparison}
          // El modal del piquete no usa portal ni atrapa el foco: mientras está
          // abierto, la sección se declara inerte (#1125). Se va en P3.
          inerte={Boolean(notchTool.refining?.notch.notchAnchor)}
        />,
        ranuraDelPie,
      )}
```

- [ ] **Step 7: Las líneas «Editando: …» se van**

En `src/components/PatternEditor/cotas/sujeto.ts`:
- borra de `interface Sujeto` el campo y su comentario: `  /** La línea de la tira que nombra qué se edita; \`null\` si no hay nada que decir. */` y `  lineaDeSujeto: string | null;`;
- `const nada = (linea: string | null): Sujeto => ({` → `const nada = (): Sujeto => ({`, y dentro borra `    lineaDeSujeto: linea,`;
- borra el bloque `const lineaRect = …;` (las tres líneas desde `  const lineaRect = input.activeTool === 'rectangle'`);
- cambia toda llamada `nada(lineaRect)` y `nada(null)` por `nada()`;
- borra las siete líneas `lineaDeSujeto: …` de los `return` (las que empiezan por `      lineaDeSujeto:`, `          lineaDeSujeto:`, `        lineaDeSujeto:` y `    lineaDeSujeto:`, incluida la de dos líneas de las internas: `lineaDeSujeto: segmentIndex === undefined` con sus dos líneas siguientes);
- en `refinarAlLado`, borra el comentario de cinco líneas que empieza por `// «Tramo», no «lado»` y la línea `lineaDeSujeto: 'Editando: el tramo seleccionado',`;
- si `formatMedida` queda sin uso, borra su importación.

En los tests del sujeto, el caso de varias líneas de `sujeto.margen.test.ts`:

```ts
    expect(cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5) }, def).lineaDeSujeto)
      .toBe('Editando: este borde');
    expect(cotasDelSujeto({ ...base }, def).lineaDeSujeto).toBeNull();
```

se borra entero; y las demás aserciones son de una línea:

```bash
sed -i '/lineaDeSujeto/d' src/components/PatternEditor/cotas/__tests__/sujeto.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.margen.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.lado.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.internas.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.trazo.test.ts src/components/PatternEditor/cotas/__tests__/tramoEnCurso.test.ts src/components/PatternEditor/cotas/__tests__/vecinosDelNodo.test.ts
grep -rn "lineaDeSujeto" src
```

Expected del `grep`: ninguna línea. En `sujeto.test.ts`, el primer caso pasa a llamarse `'rectángulo sin selección: sin cotas'` (su tamaño lo dice ahora la frase, `fraseDeLaFase.test.ts`).

- [ ] **Step 8: Tab desde el último chip, la barra de IA, los tokens y los borrados**

En `src/components/PatternEditor/cotas/CotaChip.tsx`, reemplaza:

```tsx
      // Borde del grupo: hacia adelante sale a la tira (el siguiente control del
      // lienzo); hacia atrás se queda en el botón. Sin esto Tab se comía un paso.
      const fuera = destino === 'siguiente'
        ? document.querySelector<HTMLElement>('.tool-strip input, .tool-strip select, .tool-strip button')
        : null;
```

por:

```tsx
      // Borde del grupo: hacia adelante sale a la línea al pie (el siguiente
      // control de la herramienta); hacia atrás se queda en el botón. Sin esto
      // Tab se comía un paso. Restar y Sumar no cuentan: no están en el orden
      // del teclado.
      const fuera = destino === 'siguiente'
        ? document.querySelector<HTMLElement>('.seccion-del-patron input, .seccion-del-patron select, .seccion-del-patron button:not([tabindex="-1"])')
        : null;
```

En `src/components/shell/barPosition.ts`, detrás de `topBarBottom()`, añade:

```ts
/** Top edge of the foot line (spec 2026-10-02 «la interfaz en papel» § 5.3),
 *  so the bar never covers it. Before the shell mounts (the first render,
 *  tests) it is computed from the same clamp as `--top-bar-h`, which is also
 *  the foot line's height. */
function lineaAlPieTop(): number {
  const el = document.querySelector('.linea-al-pie');
  if (el) return el.getBoundingClientRect().top;
  return window.innerHeight - Math.min(48, Math.max(36, window.innerWidth * 0.025));
}
```

en `clampPosition`, `const maxY = window.innerHeight - BAR_HEIGHT - 16;` → `const maxY = lineaAlPieTop() - BAR_HEIGHT - 16;`, y en `loadPosition`, `y: window.innerHeight - BAR_HEIGHT - 24,` → `y: lineaAlPieTop() - BAR_HEIGHT - 24,`.

En `src/styles/tokens.css`:
- el comentario de `--ink-hint`:

```css
  /* Tinta de texto instructivo dibujado SOBRE el papel (pistas al pie del
   * lienzo). NO usar --text-* aquí todavía: la hoja no lleva el ámbito de
   * papel hasta P2, y fuera de él --text-* es la tinta del marco, que sobre el
   * papel queda invisible (1.05:1 medido el 2026-08-14). Éste da 5,32:1
   * sobre --canvas-2d y 5,85:1 sobre --piece-fill-2d. Lo verifica
   * HintText.legibilidad.test.tsx. */
```

→

```css
  /* Tinta de texto instructivo dibujado SOBRE el papel: la marca de escala y
   * la pantalla vacía. Da 5,32:1 sobre --canvas-2d y 5,85:1 sobre
   * --piece-fill-2d; lo verifica contrasteDeTokens.ts. La frase de la
   * herramienta vive desde P2b en la línea al pie, que es marco. */
```

- borra las cuatro líneas de los tokens de la tira:

```css
  /* Bordes → tono (cotas vivas, spec 2026-08-30 § 9): la tira y la fila se
   * separan por sombra, no por línea. Una sola sombra de flote. */
  --surface-overlay-border-flush: 1px solid transparent;
  --surface-overlay-shadow-sheet: var(--surface-overlay-shadow);
```

- y en el bloque `[data-material="papel"]`, la línea `  --surface-overlay-shadow-sheet: var(--surface-overlay-shadow);`.

Borra lo que se va:

```bash
git rm src/components/PatternEditor/ToolStrip2D.tsx src/components/PatternEditor/ToolStrip2D.css src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/__tests__/ToolStrip2D.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.desplazarYRecortar.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.hilo.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.legibilidad.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.lineaInterna.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.sew.test.tsx src/components/PatternEditor/renderers/__tests__/HintText.shift.test.tsx
grep -rn "ToolStrip2D\|HintText\|tool-strip\|surface-overlay-border-flush\|surface-overlay-shadow-sheet" src scripts tests/repo
```

Expected del `grep`: solo comentarios históricos (ninguna importación ni selector vivo). Lo que quede en código vivo se arregla antes de seguir.

- [ ] **Step 9: Corre la suite y los gates**

Run: `npx vitest run src/components/PatternEditor src/components/shell src/styles src/tools tests/repo`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde. Si `node scripts/ui-contract-lint.mjs` informa contadores más bajos (R3, R5: se fueron `ToolStrip2D.css` y sus literales), `node scripts/ui-contract-lint.mjs --update`.

- [ ] **Step 10: Los e2e que medían la tarjeta y la frase en el SVG**

Mueve la red de la tira:

```bash
git mv tests/e2e/emplazamiento-tira.spec.ts tests/e2e/linea-al-pie.spec.ts
```

Contenido entero de `tests/e2e/linea-al-pie.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista, reposo, centroDePieza } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, st } from './helpers/lienzo';

/**
 * La línea al pie (spec 2026-10-02 «la interfaz en papel» § 5.3 y § 5.4),
 * medida en la pantalla de María (1366 × 643, en Split): una franja del
 * marco, de lado a lado y siempre, con el nombre y la tecla de la herramienta,
 * sus opciones como botones y la frase entera en una línea. Sustituye a la red
 * de la tarjeta de la esquina (`emplazamiento-tira.spec.ts`, hasta P2b).
 *
 * jsdom no calcula layout: las cajas, `elementFromPoint` y si un texto se
 * recorta solo existen aquí. Sin capturas: en esta app `page.screenshot` se
 * cuelga después de «fonts loaded» (2026-10-04).
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

const MARIA = { width: 1366, height: 643 };

/** Las doce de fábrica, con el nombre que enseña el margen. */
const DEL_MARGEN = [
  'Seleccionar', 'Editar patrón', 'Punto', 'Pluma', 'Línea interna', 'Rectángulo',
  'Tijeras', 'Medir', 'Coser', 'Editar costuras', 'Margen de costura', 'Piquete',
];

async function medirPie(page: Page) {
  return page.evaluate(() => {
    const linea = document.querySelector('.linea-al-pie')!;
    const pie = linea.getBoundingClientRect();
    const texto = document.querySelector<HTMLElement>('.seccion-del-patron__texto');
    return {
      pie: { left: pie.left, right: pie.right, top: pie.top, bottom: pie.bottom, height: pie.height },
      barraAlto: document.querySelector('.top-bar')!.getBoundingClientRect().height,
      areaBottom: document.querySelector('.canvas-area')!.getBoundingClientRect().bottom,
      ventana: { w: window.innerWidth, h: window.innerHeight },
      fondo: getComputedStyle(linea).backgroundColor,
      fondoBarra: getComputedStyle(document.querySelector('.top-bar')!).backgroundColor,
      seccion: document.querySelector('.seccion-del-patron') !== null,
      nombre: document.querySelector('.seccion-del-patron__nombre')?.textContent ?? null,
      frase: texto ? { texto: texto.textContent ?? '', recortada: texto.scrollWidth > texto.clientWidth + 1 } : null,
      margenLeft: document.querySelector('nav.margen')?.getBoundingClientRect().left ?? null,
      hojaPapel: document.querySelector('.pattern-editor')?.getAttribute('data-material') ?? null,
    };
  });
}

test('al pie, de lado a lado, con el material y el alto de la barra superior, en las tres vistas; la hoja termina encima y es papel', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  for (const vista of ['2D', 'Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await page.waitForTimeout(300);
    const r = await medirPie(page);
    expect(r.pie.left, `${vista}: no empieza en el borde`).toBe(0);
    expect(r.pie.right, `${vista}: no llega al otro borde`).toBe(r.ventana.w);
    expect(Math.round(r.pie.bottom), `${vista}: no está al pie`).toBe(r.ventana.h);
    expect(Math.round(r.pie.height), `${vista}: no tiene el alto de la barra superior`).toBe(Math.round(r.barraAlto));
    expect(r.fondo, `${vista}: no es del material de la barra superior`).toBe(r.fondoBarra);
    expect(r.areaBottom, `${vista}: la hoja se mete debajo`).toBeLessThanOrEqual(r.pie.top + 0.5);
    // En 3D no hay hoja que explicar: la sección del patrón se va, la franja no.
    expect(r.seccion, `${vista}: la sección del patrón`).toBe(vista !== '3D');
  }
  expect((await medirPie(page)).hojaPapel, 'la hoja no lleva el ámbito de papel').toBe('papel');
});

test('cada herramienta del margen dice su nombre y su frase entera en una línea, y el margen no se mueve', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);
  const antes = await medirPie(page);
  const malas: string[] = [];
  for (const nombre of DEL_MARGEN) {
    await page.locator(`nav.margen .dock__tool[aria-label^="${nombre}"]`).first().click();
    await expect(page.locator('.seccion-del-patron__nombre')).toHaveText(nombre);
    await page.waitForTimeout(150);
    const r = await medirPie(page);
    if (!r.frase) malas.push(`${nombre}: sin frase`);
    else if (r.frase.recortada) malas.push(`${nombre}: «${r.frase.texto}» no cabe`);
    if (r.margenLeft !== antes.margenLeft) malas.push(`${nombre}: el margen se movió`);
  }
  expect(malas).toEqual([]);
});

test('mientras dibuja, la frase de la Pluma y la de la Línea interna también caben', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  await reposo(page);

  await activarHerramienta(page, 'h', 'pen');
  const svg = await page.locator('svg.pattern-svg').boundingBox();
  if (!svg) throw new Error('no svg');
  await page.mouse.click(svg.x + svg.width - 60, svg.y + 60);
  await expect.poll(async () => (await medirPie(page)).frase?.texto ?? '').toMatch(/Tab/);
  expect((await medirPie(page)).frase!.recortada, 'la frase de la Pluma con un punto no cabe').toBe(false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await activarHerramienta(page, 'g', 'internalShape');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await medirPie(page)).frase?.texto ?? '').toMatch(/Tab/);
  expect((await medirPie(page)).frase!.recortada, 'la frase de la Línea interna con un punto no cabe').toBe(false);
  await page.keyboard.press('Escape');
});

test('las opciones del piquete son botones a un clic, y lo que se escoge es lo que se pone', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await abrirAppVacia(page);
  await addPiece(page, 'piquete-pie', { x: 120, y: 120 }, 300, 400);
  await cambiarVista(page, 'Split');
  await reposo(page);
  await page.locator('nav.margen .dock__tool[aria-label^="Piquete"]').first().click();
  await expect(page.locator('.seccion-del-patron__nombre')).toHaveText('Piquete');

  const pie = page.locator('.seccion-del-patron');
  await pie.getByRole('button', { name: 'En T' }).click();
  await pie.getByRole('group', { name: 'Cantidad' }).getByRole('button', { name: '2' }).click();
  await pie.getByLabel('Profundidad (mm)').locator('xpath=..').getByRole('button', { name: 'Sumar' }).click();
  await expect(pie.getByLabel('Ancho (mm)'), 'el ancho no tiene sitio').toBeVisible();
  await expect.poll(async () => (await st(page)).tools.toolOptions.notch)
    .toMatchObject({ shape: 't-notch', count: 2, length: 9 });
  expect((await medirPie(page)).frase!.recortada, 'la frase no cabe junto a las cuatro opciones').toBe(false);

  // Se pone uno: el clic tiene que caer sobre el contorno, así que se prueban
  // varios puntos del lado izquierdo, como en emplazamiento-modales. Esc deja
  // el piquete donde se hizo clic (el modal vive hasta P3).
  const modal = page.locator('.notch-precision-modal');
  for (const y of [320, 260, 380, 220, 420]) {
    await clickAt(page, { x: 120, y });
    await page.waitForTimeout(250);
    if (await modal.isVisible()) break;
  }
  await expect(modal, 'ningún clic sobre el borde puso el piquete').toBeVisible();
  await page.keyboard.press('Escape');
  const piquetes = (await st(page)).project.pieces
    .find((p) => p.id === 'piquete-pie')!.internals
    .filter((l: { type: string }) => l.type === 'notch') as Array<{ notchOptions?: Record<string, unknown> }>;
  expect(piquetes.at(-1)?.notchOptions).toMatchObject({ shape: 't-notch', count: 2, length: 9 });
});

test('las cotas se ocultan mientras se arrastra la pieza y vuelven al soltar', async ({ page }) => {
  await page.setViewportSize(MARIA);
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.keyboard.press('s');
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.keyboard.press('z');
  await page.mouse.click(box.x + 320, box.y + 320);
  const ancho = page.getByRole('button', { name: /^Ancho de la pieza:/ });
  await expect(ancho).toBeVisible();
  await page.mouse.move(box.x + 320, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 6 });
  await expect(ancho).toHaveCount(0);
  await page.mouse.up();
  await expect(ancho).toBeVisible();
});
```

(El último caso es el segundo de `emplazamiento-tira.spec.ts`, sin cambios salvo el viewport en el propio test.)

Si `st(page)` no tipa `internals` (`EstadoLienzo` de `helpers/lienzo.ts`), el filtro castea lo justo; si el typecheck de los e2e lo rechaza, se lee con `page.evaluate` sobre `__VINA_STORE__` como hace `barra-superior.spec.ts`.

En `tests/e2e/1100-margen-en-el-borde.spec.ts`, reemplaza:

```ts
    // Otra vez al borde, y de ahí a la tira (fuera del <svg>): la costura de #1132.
    await page.mouse.move(s.x, s.y, { steps: 6 });
    await expect(lectura).toBeVisible();
    const tira = await page.locator('.tool-strip').boundingBox();
    expect(tira).not.toBeNull();
    await page.mouse.move(tira!.x + 12, tira!.y + 12, { steps: 8 });
    await expect(lectura).toHaveCount(0);
```

por:

```ts
    // Otra vez al borde, y de ahí a la línea al pie (fuera del <svg>): la costura de #1132.
    await page.mouse.move(s.x, s.y, { steps: 6 });
    await expect(lectura).toBeVisible();
    const pie = await page.locator('.linea-al-pie').boundingBox();
    expect(pie).not.toBeNull();
    await page.mouse.move(pie!.x + 300, pie!.y + 12, { steps: 8 });
    await expect(lectura).toHaveCount(0);
```

En `tests/e2e/maria-195-siguiente-punto.spec.ts`, el caso `'los chips del tramo NO le roban la esquina a la tira, que es por lo que murió el panel'`: el nombre → `'los chips del tramo no le quitan la voz a la línea al pie, que es por lo que murió el panel'`; el comentario → `// \`NextPointPanel\` obligaba a esconder la tarjeta de la herramienta mientras estaba abierto: los dos vivían en la misma esquina. Los chips viven sobre el trazo, y la herramienta se nombra en la línea al pie.`; y la aserción final:

```ts
    await expect(
      page.locator('.tool-strip'),
      'la tira se escondió con el tramo congelado: eso era del panel viejo',
    ).toBeVisible();
```

→

```ts
    await expect(
      page.locator('.seccion-del-patron'),
      'la línea al pie perdió su sección con el tramo congelado: eso era del panel viejo',
    ).toBeVisible();
    await expect(page.locator('.seccion-del-patron__nombre')).toHaveText('Pluma');
```

En `tests/e2e/trazos.spec.ts`, borra la línea `    await expect(page.locator('.tool-strip')).toContainText('Editando: el tramo seleccionado');`.

En `tests/e2e/linea-interna-gramatica.spec.ts`: `await page.selectOption('#opcion-nodeType', 'curvePoints');` → `await page.locator('#opcion-nodeType').getByRole('button', { name: 'Curva por puntos' }).click();`, y `await page.selectOption('#opcion-nodeType', 'straight');` → `await page.locator('#opcion-nodeType').getByRole('button', { name: 'Recta' }).click();`.

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, en `'F2 — la pista de la herramienta se lee entera'`, reemplaza el `page.evaluate` y sus tres `expect` por:

```ts
    const medida = await page.evaluate(() => {
      const pista = document.querySelector<HTMLElement>('.seccion-del-patron__texto');
      if (!pista) return null;
      const rp = pista.getBoundingClientRect();
      // Desde P2b la frase vive en la línea al pie: lo que hay encima de ella,
      // en su centro, tiene que ser ella misma.
      const encima = document.elementFromPoint(rp.left + Math.min(rp.width / 2, 40), rp.top + rp.height / 2);
      return {
        texto: (pista.textContent ?? '').trim(),
        tapada: encima && pista.contains(encima) ? null : (encima as HTMLElement | null)?.className?.toString() ?? 'nada',
        recortada: pista.scrollWidth > pista.clientWidth + 1,
        fueraPorDerecha: Math.round(Math.max(0, rp.right - window.innerWidth)),
      };
    });

    expect(medida, 'no encontré la frase de la herramienta en la línea al pie').not.toBeNull();
    expect(medida!.tapada, `algo tapa la frase "${medida!.texto}"`).toBeNull();
    expect(medida!.recortada, `la frase "${medida!.texto}" no cabe en una línea`).toBe(false);
    expect(medida!.fueraPorDerecha, 'la frase se sale del viewport por la derecha').toBe(0);
```

En `tests/e2e/las-siete-puertas.spec.ts`, en `'y la pista cabe en la pantalla en TODAS sus fases'`, el comentario de entrada pasa a `// La primera redacción metía los cinco pasos en una línea: 883 px de ancho arrancando en x = −101. Desde P2b la frase vive en la línea al pie: tiene que estar, y caber entera, en todas las fases.`; `medirPista`:

```ts
    const medirPista = () => page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('.seccion-del-patron__texto');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return {
        txt: t.textContent ?? '', left: Math.round(r.left), right: Math.round(r.right),
        vw: window.innerWidth, recortada: t.scrollWidth > t.clientWidth + 1,
      };
    });
```

y el cuerpo del bucle:

```ts
      const p = await medirPista();
      if (!p) fuera.push(`paso ${i}: sin frase`);
      else if (p.left < 0 || p.right > p.vw || p.recortada) {
        fuera.push(`paso ${i}: "${p.txt.slice(0, 45)}…" ${p.left}→${p.right} de ${p.vw}${p.recortada ? ', recortada' : ''}`);
      }
```

En `tests/e2e/supr-con-algo-delante.spec.ts`, el comentario `/** Vive \`disabled\` mientras no haya mediciones (\`ToolStrip2D.tsx\`). Sale gratis` → `/** Vive \`disabled\` mientras no haya mediciones (la línea al pie, \`SeccionDelPatron.tsx\`). Sale gratis`.

En `tests/e2e/helpers/superficies.ts`: `const CON_FIRMA = ['pista', 'tira', 'toast'];` → `const CON_FIRMA = ['pista', 'toast'];`.

En `scripts/deploy-prod.sh`: `  tests/e2e/emplazamiento-tira.spec.ts \` → `  tests/e2e/linea-al-pie.spec.ts \`.

- [ ] **Step 11: Corre los e2e de la tarea**

Con el servidor de este árbol en 5174 (Global Constraints):

Run: `npx playwright test tests/e2e/linea-al-pie.spec.ts tests/e2e/1100-margen-en-el-borde.spec.ts tests/e2e/maria-195-siguiente-punto.spec.ts tests/e2e/trazos.spec.ts tests/e2e/linea-interna-gramatica.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts tests/e2e/las-siete-puertas.spec.ts tests/e2e/supr-con-algo-delante.spec.ts tests/e2e/marca-de-escala.spec.ts tests/e2e/margen-de-herramientas.spec.ts tests/e2e/barra-superior.spec.ts --workers=2 --retries=0`
Expected: PASS. Si una frase sale recortada, se acorta en `fraseDeLaFase.ts` (y su tabla de la Task 2) y se anota como Ruling; si un clic de un e2e cae en la línea al pie (la hoja mide 36 px menos de alto), se mueve el clic, no la línea.

- [ ] **Step 12: Commit**

```bash
git add src/components/shell/herramientaParaMostrar.ts src/components/shell/LeftDock.tsx src/components/shell/AppShell.tsx src/components/shell/barPosition.ts src/components/PatternEditor/SeccionDelPatron.tsx src/components/PatternEditor/SeccionDelPatron.css src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/cotas/sujeto.ts src/components/PatternEditor/cotas/CotaChip.tsx src/styles/layout.css src/styles/tokens.css src/components/PatternEditor/__tests__/SeccionDelPatron.test.tsx src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx src/components/PatternEditor/__tests__/circulo-nace-con-gesto.test.ts src/components/PatternEditor/__tests__/triangulo-nace-con-gesto.test.ts src/components/PatternEditor/cotas/__tests__ src/components/shell/__tests__/unifiedBarPosition.test.ts src/styles/__tests__/zIndexScale.test.ts src/styles/__tests__/tipografia-del-cromo.test.ts tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts tests/repo/reposo-lo-que-sobra.test.ts tests/repo/el-gate-corre-los-trinquetes.test.ts tests/e2e/linea-al-pie.spec.ts tests/e2e/1100-margen-en-el-borde.spec.ts tests/e2e/maria-195-siguiente-punto.spec.ts tests/e2e/trazos.spec.ts tests/e2e/linea-interna-gramatica.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts tests/e2e/las-siete-puertas.spec.ts tests/e2e/supr-con-algo-delante.spec.ts tests/e2e/helpers/superficies.ts scripts/deploy-prod.sh
git add scripts/ui-contract-baseline.json   # solo si el Step 9 lo bajó
git commit -m "feat(pie): la línea al pie sustituye a la tarjeta; la hoja es papel"
```

---

### Task 4: «Más»

**Files:**
- Create: `src/components/PatternEditor/cuantasCaben.ts`
- Modify: `src/components/PatternEditor/SeccionDelPatron.tsx`, `src/components/PatternEditor/SeccionDelPatron.css`
- Test: Create `src/components/PatternEditor/__tests__/cuantasCaben.test.ts`, Create `src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx`; Modify `tests/repo/superficies-declaradas.test.ts`, `tests/repo/lo-que-flota-es-papel.test.ts`, `src/styles/__tests__/zIndexScale.test.ts`, `tests/e2e/linea-al-pie.spec.ts`

**Interfaces:**
- Consumes: `SeccionDelPatron` (Task 3), sus clases `.seccion-del-patron`, `.seccion-del-patron__quien`, `.seccion-del-patron__opciones` y `.opcion-del-pie`.
- Produces: `cuantasCaben(anchos: readonly number[], hueco: number, separacion: number, anchoMas: number): number`. En el DOM: `button.seccion-del-patron__mas` («Más», `aria-expanded`, `aria-controls="seccion-del-patron-mas"`) dentro de `.seccion-del-patron__opciones`; su menú `#seccion-del-patron-mas.seccion-del-patron__menu[role=group][aria-label="Más opciones de <nombre>"][data-superficie=menu][data-material=papel][data-shortcut-context=2d]`, colgado de `<body>`. Bitácora: `ui/linea-al-pie` `{ herramienta, aLaVista, total, hueco }` cuando cambia cuántas caben; `ui/mas` `{ abierto, herramienta }` al abrir y cerrar.

- [ ] **Step 1: Escribe los tests que fallan**

`src/components/PatternEditor/__tests__/cuantasCaben.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cuantasCaben } from '../cuantasCaben';

/** Cuántas opciones quedan a la vista en la línea al pie (spec 2026-10-02 § 5.3). */
describe('cuantasCaben', () => {
  it('si caben todas, todas: sin «Más»', () => {
    expect(cuantasCaben([100, 100, 100], 320, 10, 64)).toBe(3);
  });

  it('cabe justo, con su aire entre medias', () => {
    expect(cuantasCaben([100, 100, 100], 320, 10, 64)).toBe(3);
    expect(cuantasCaben([100, 100, 100], 319, 10, 64)).toBeLessThan(3);
  });

  it('si no caben, las primeras que quepan junto a «Más»', () => {
    // «Más» 64 + 100 + 10 = 174 ≤ 300; + 100 + 10 = 284 ≤ 300; + 100 + 10 = 394 > 300.
    expect(cuantasCaben([100, 100, 100, 100], 300, 10, 64)).toBe(2);
  });

  it('con un hueco menor que «Más», ninguna a la vista: todas en el menú', () => {
    expect(cuantasCaben([100, 100], 50, 10, 64)).toBe(0);
  });

  it('sin opciones, cero', () => {
    expect(cuantasCaben([], 500, 10, 64)).toBe(0);
  });
});
```

`src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import type { Tool2D } from '../../../types/types';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import SeccionDelPatron from '../SeccionDelPatron';

/**
 * «Más» (spec 2026-10-02 § 5.3): con la frase en sus 200 px, las opciones que
 * no caben pasan a un botón al final, y desde ahí siguen a un clic. jsdom no
 * mide: aquí se le dan medidas de mentira (cada control 150 px, «quién» 100,
 * la sección 600) y un `ResizeObserver` que existe. El navegador de verdad lo
 * mide `linea-al-pie.spec.ts`.
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const TRES: ToolDefinition = {
  id: '__pie_tres',
  name: 'Herramienta ancha',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    { id: 'lista', label: 'Una lista', type: 'select', value: 'a', choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }] },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
  ],
};
toolRegistry.registerTool(TRES);

const ancho = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const hueco = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const RO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('opcion-del-pie')) return 150;
      if (this.classList.contains('seccion-del-patron__quien')) return 100;
      return 0;
    },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) { return this.classList.contains('seccion-del-patron') ? 600 : 0; },
  });
  clearJournal();
});

afterEach(() => {
  cleanup();
  if (ancho) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ancho);
  if (hueco) Object.defineProperty(Element.prototype, 'clientWidth', hueco);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
});

function montar() {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool('__pie_tres' as Tool2D));
  render(<Provider store={store}><SeccionDelPatron frase={null} /></Provider>);
  return store;
}

// Hueco para las opciones: 600 − 100 de «quién» − 200 de la frase = 300. Con
// «Más» (64) cabe una de 150; las otras dos se pliegan.
describe('lo que no cabe pasa a «Más»', () => {
  it('a la vista, la primera y «Más»; las otras dos, a un clic', () => {
    const store = montar();
    expect(screen.getByLabelText('Un número')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Opción B' })).toBeNull();
    const mas = screen.getByRole('button', { name: 'Más' });
    expect(mas.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(mas);
    const menu = screen.getByRole('group', { name: 'Más opciones de Herramienta ancha' });
    expect(menu.parentElement, 'el menú cuelga de <body>').toBe(document.body);
    expect(menu.getAttribute('data-material')).toBe('papel');
    expect(menu.getAttribute('data-superficie')).toBe('menu');
    fireEvent.click(within(menu).getByRole('button', { name: 'Opción B' }));
    expect(store.getState().tools.toolOptions.__pie_tres.lista).toBe('b');
    expect(within(menu).getByRole('button', { name: 'Un interruptor' })).toBeTruthy();
  });

  it('abierto, el foco entra al menú; Escape lo cierra y vuelve a «Más»', () => {
    montar();
    const mas = screen.getByRole('button', { name: 'Más' });
    fireEvent.click(mas);
    const menu = screen.getByRole('group', { name: /^Más opciones de/ });
    expect(menu.contains(document.activeElement), 'el foco se quedó fuera del menú').toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /^Más opciones de/ })).toBeNull();
    expect(document.activeElement).toBe(mas);
  });

  it('deja rastro en la bitácora: cuántas quedaron a la vista, y el menú al abrir y cerrar', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    const ui = getJournal().events.filter((e) => e.kind === 'ui').map((e) => [e.name, e.data]);
    expect(ui).toContainEqual(['linea-al-pie', { herramienta: '__pie_tres', aLaVista: 1, total: 3, hueco: 300 }]);
    expect(ui).toContainEqual(['mas', { abierto: true, herramienta: '__pie_tres' }]);
    expect(ui).toContainEqual(['mas', { abierto: false, herramienta: '__pie_tres' }]);
  });

  it('con un modal encima, el menú se cierra (#1125)', () => {
    const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
    store.dispatch(setActiveTool('__pie_tres' as Tool2D));
    const { rerender } = render(<Provider store={store}><SeccionDelPatron frase={null} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(screen.getByRole('group', { name: /^Más opciones de/ })).toBeTruthy();
    rerender(<Provider store={store}><SeccionDelPatron frase={null} inerte /></Provider>);
    expect(screen.queryByRole('group', { name: /^Más opciones de/ })).toBeNull();
  });
});
```

En `tests/repo/superficies-declaradas.test.ts`, detrás de las dos filas de `SeccionDelPatron.tsx`: `  ['src/components/PatternEditor/SeccionDelPatron.tsx', 'menu', 1],`.

En `tests/repo/lo-que-flota-es-papel.test.ts`: en `RAICES`, detrás de la de `FilaDeCapas.tsx`, `  ['src/components/PatternEditor/SeccionDelPatron.tsx', 1],`; en `PINTA`, cambia `['src/styles/layout.css', ['.grupo-del-patron__menu']],` por `['src/styles/layout.css', ['.grupo-del-patron__menu', '.opcion-del-pie']],` y añade detrás:

```ts
  // El menú «Más» de la línea al pie y los controles que lleva dentro
  ['src/components/PatternEditor/SeccionDelPatron.css', ['.seccion-del-patron__menu', '.opcion-del-pie']],
  ['src/components/PatternEditor/ToolOptionControls.css', '*'],
```

En `src/styles/__tests__/zIndexScale.test.ts`, en `SITIOS_GLOBALES`, detrás de la del menú de «Mostrar»:

```ts
  { archivo: 'src/components/PatternEditor/SeccionDelPatron.css', patron: /\.seccion-del-patron__menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú «Más» de la línea al pie: cuelga de <body>' },
```

- [ ] **Step 2: Corre los tests y míralos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/cuantasCaben.test.ts src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx tests/repo src/styles/__tests__/zIndexScale.test.ts`
Expected: FAIL. `cuantasCaben` no existe; no hay botón «Más»; `SeccionDelPatron.tsx` no marca `menu` ni `data-material`; el `z-index` del menú no existe.

- [ ] **Step 3: Cuántas caben**

Crea `src/components/PatternEditor/cuantasCaben.ts`:

```ts
/**
 * Cuántas opciones de la herramienta quedan a la vista en la línea al pie
 * (spec 2026-10-02 «la interfaz en papel» § 5.3: «se recorta primero la frase,
 * que conserva al menos 200 px; las opciones que aun así no quepan pasan a un
 * botón «Más» al final»).
 *
 * `anchos`, los de cada control en su orden; `hueco`, lo que la sección deja a
 * las opciones después de reservar el mínimo de la frase; `separacion`, el
 * aire entre dos controles; `anchoMas`, lo que ocupa «Más». Si caben todas,
 * todas. Si no, las primeras que quepan junto a «Más», que se lleva el resto.
 */
export function cuantasCaben(anchos: readonly number[], hueco: number, separacion: number, anchoMas: number): number {
  const todas = anchos.reduce((s, a) => s + a, 0) + separacion * Math.max(0, anchos.length - 1);
  if (todas <= hueco) return anchos.length;
  let usado = anchoMas;
  let cuantas = 0;
  for (const ancho of anchos) {
    if (usado + separacion + ancho > hueco) break;
    usado += separacion + ancho;
    cuantas += 1;
  }
  return cuantas;
}
```

- [ ] **Step 4: «Más» en la sección del patrón**

En `src/components/PatternEditor/SeccionDelPatron.tsx`:

1. Importaciones: `import { Fragment, useCallback, useEffect, useRef, type ReactNode } from 'react';` → `import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';`; añade `import { createPortal } from 'react-dom';`, `import { ChevronUp } from 'lucide-react';`, `import { pushJournal } from '../../utils/telemetry/journal';` y `import { cuantasCaben } from './cuantasCaben';`.

2. Detrás de `const DEJAN_MEDICIONES = …;`, añade:

```tsx
/** Lo que la frase conserva antes de que las opciones se plieguen en «Más» (spec § 5.3). */
const FRASE_MIN_PX = 200;
/** Lo que se reserva para «Más» al decidir cuántas caben. */
const ANCHO_MAS_PX = 64;

/**
 * ¿Cuántas opciones caben a la vista? Se decide midiendo, como el plegado de la
 * barra superior: con todas a la vista se mide cada una y se guarda; plegadas
 * ya no se pueden medir, así que se decide con lo guardado. Una herramienta
 * nueva, o la fuente de verdad recién cargada, se vuelven a medir con todas a
 * la vista: el efecto de diseño corre antes de pintar, así que ese paso no
 * llega a verse. Sin `ResizeObserver` (jsdom) caben todas.
 */
function useCuantasCaben(raiz: RefObject<HTMLDivElement>, herramienta: string, total: number): number {
  const [medida, setMedida] = useState({ herramienta, cuantas: total });
  const anchos = useRef<{ herramienta: string; lista: number[] } | null>(null);
  const anotado = useRef('');
  const cuantas = medida.herramienta === herramienta ? Math.min(medida.cuantas, total) : total;

  const medir = useCallback(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fila = el.querySelector<HTMLElement>('.seccion-del-patron__opciones');
    const quien = el.querySelector<HTMLElement>('.seccion-del-patron__quien');
    if (!fila || !quien) return;
    const controles = Array.from(fila.children).filter(
      (h): h is HTMLElement => h instanceof HTMLElement && h.classList.contains('opcion-del-pie'),
    );
    if (controles.length === total) anchos.current = { herramienta, lista: controles.map((c) => c.offsetWidth) };
    if (!anchos.current || anchos.current.herramienta !== herramienta || anchos.current.lista.length !== total) return;
    const css = getComputedStyle(el);
    const hueco = el.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0)
      - quien.offsetWidth - 2 * (parseFloat(css.columnGap) || 0) - FRASE_MIN_PX;
    const k = cuantasCaben(anchos.current.lista, hueco, parseFloat(getComputedStyle(fila).columnGap) || 0, ANCHO_MAS_PX);
    // La caja negra ve cuántas quedaron a la vista y con qué hueco: un «no
    // encuentro el ancho» en la máquina de María se lee ahí.
    const clave = `${herramienta}:${k}`;
    if (anotado.current !== clave) {
      anotado.current = clave;
      pushJournal('ui', 'linea-al-pie', { herramienta, aLaVista: k, total, hueco: Math.round(hueco) });
    }
    setMedida((m) => (m.herramienta === herramienta && m.cuantas === k ? m : { herramienta, cuantas: k }));
  }, [raiz, herramienta, total]);

  useLayoutEffect(() => { medir(); }, [medir, cuantas]);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    return () => ro.disconnect();
  }, [raiz, medir]);

  // Con la fuente de verdad cargada los rótulos cambian de ancho y la franja
  // no: el observador no se enteraría. Se vuelve a medir con todas a la vista.
  useEffect(() => {
    let vivo = true;
    void document.fonts?.ready.then(() => {
      if (!vivo) return;
      anchos.current = null;
      setMedida((m) => ({ ...m, cuantas: Number.POSITIVE_INFINITY }));
    });
    return () => { vivo = false; };
  }, []);

  return cuantas;
}
```

3. En el cuerpo del componente, detrás del bloque que arma `controles` (el último `if (DEJAN_MEDICIONES…)`), añade:

```tsx
  const cuantas = useCuantasCaben(raiz, activeTool, controles.length);
  const plegadas = controles.slice(cuantas);
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, bottom: 0 });
  const masRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Otra herramienta, un modal encima, o que vuelvan a caber todas: el menú se
  // cierra con su botón.
  useEffect(() => { setAbierto(false); }, [activeTool, inerte]);
  useEffect(() => { if (plegadas.length === 0) setAbierto(false); }, [plegadas.length]);

  // Abrir y cerrar quedan en la bitácora. Abierto, el foco entra al menú:
  // cuelga de <body>, y Tab desde «Más» no llegaría (como «Mostrar»).
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'mas', { abierto, herramienta: activeTool });
    if (abierto) menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input, select')?.focus();
  }, [abierto, activeTool]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (masRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current?.contains(document.activeElement)) masRef.current?.focus();
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [abierto]);
```

4. En el JSX, el bloque de las opciones pasa a:

```tsx
      {controles.length > 0 && (
        <div className="seccion-del-patron__opciones" data-superficie="pie">
          {controles.slice(0, cuantas).map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
          {plegadas.length > 0 && (
            <button
              ref={masRef}
              type="button"
              className="seccion-del-patron__mas"
              aria-expanded={abierto}
              aria-controls="seccion-del-patron-mas"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                // Hacia arriba: la línea al pie está en el borde de la ventana.
                setAncla({ left: r.left, bottom: window.innerHeight - r.top + 4 });
                setAbierto((a) => !a);
              }}
            >
              Más
              <ChevronUp size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
```

y, detrás del `<div className="seccion-del-patron__frase" …>…</div>`, dentro de la raíz:

```tsx
      {abierto && plegadas.length > 0 && createPortal(
        <div
          ref={menuRef}
          id="seccion-del-patron-mas"
          className="seccion-del-patron__menu"
          role="group"
          aria-label={`Más opciones de ${nombre}`}
          data-superficie="menu"
          data-material="papel"
          data-shortcut-context="2d"
          style={{ left: ancla.left, bottom: ancla.bottom }}
        >
          {plegadas.map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
        </div>,
        document.body,
      )}
```

En `src/components/PatternEditor/SeccionDelPatron.css`, añade al final:

```css
/* «Más» (spec § 5.3): las opciones que no caben, a un clic. Como «Mostrar» en
   la barra superior. */
.seccion-del-patron__mas { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; background: transparent; border: var(--hairline); border-radius: var(--radius-sm); color: var(--text-secondary); font: inherit; cursor: pointer; }
.seccion-del-patron__mas:hover { color: var(--text-primary); }
.seccion-del-patron__mas:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; color: var(--text-primary); }
/* Su menú cuelga de <body> y es papel (contrato § 2: todo portal nace papel).
   Se abre hacia arriba, sobre la hoja. */
.seccion-del-patron__menu {
  position: fixed;
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 10px 12px;
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
  color: var(--text-primary);
  font-size: var(--text-sm);
}
```

- [ ] **Step 5: Corre los tests y míralos pasar**

Run: `npx vitest run src/components/PatternEditor tests/repo src/styles`
Expected: PASS.

Run: `npx tsc -b --noEmit && npm run lint && npm run lint:ui`
Expected: limpio; ningún contador sube.

- [ ] **Step 6: El e2e de «Más»**

En `tests/e2e/linea-al-pie.spec.ts`, añade `dispatch` a la importación de `./helpers/lienzo`, en el caso del piquete añade, detrás de `await expect(page.locator('.seccion-del-patron__nombre')).toHaveText('Piquete');`:

```ts
  // A 1366 en Split las cuatro caben enteras con su frase (spec § 5.3): sin «Más».
  await expect(page.locator('.seccion-del-patron__mas')).toHaveCount(0);
```

y añade el caso:

```ts
test('en una ventana estrecha, lo que no cabe pasa a «Más»: la frase conserva sus 200 px y todo sigue a un clic, también con el teclado', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await abrirAppVacia(page);
  await addPiece(page, 'desplazar-pie', { x: 120, y: 120 }, 300, 400);
  await dispatch(page, 'editor/selectPiece', 'desplazar-pie');
  await activarHerramienta(page, 'r', 'offsetOutline');

  const mas = page.locator('.seccion-del-patron__mas');
  await expect(mas, 'a 1100 px las cuatro opciones de Desplazar contorno no caben y no hay «Más»').toBeVisible();
  const r = await page.evaluate(() => {
    const frase = document.querySelector('.seccion-del-patron__frase')!.getBoundingClientRect();
    const boton = document.querySelector('.seccion-del-patron__mas')!.getBoundingClientRect();
    return { frase: frase.width, fraseLeft: frase.left, masRight: boton.right };
  });
  expect(r.frase, 'la frase se quedó con menos de 200 px').toBeGreaterThanOrEqual(199);
  expect(r.masRight, '«Más» se mete en la frase').toBeLessThanOrEqual(r.fraseLeft);

  await mas.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('group', { name: /^Más opciones de/ });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-material', 'papel');
  expect(await menu.evaluate((m) => m.contains(document.activeElement)), 'abierto con el teclado, el foco se quedó fuera').toBe(true);
  const caja = await menu.boundingBox();
  const lineaTop = await page.locator('.linea-al-pie').evaluate((e) => e.getBoundingClientRect().top);
  expect(caja!.y + caja!.height, 'el menú no se abre hacia arriba').toBeLessThanOrEqual(lineaTop);
  // Lo plegado se toca: nada lo tapa.
  const tapados = await menu.evaluate((m) => [...m.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), input, select')]
    .filter((b) => {
      const c = b.getBoundingClientRect();
      const encima = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return !encima || !b.contains(encima);
    })
    .map((b) => b.textContent?.trim() || b.id));
  expect(tapados).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(mas).toBeFocused();
});
```

Run: `npx playwright test tests/e2e/linea-al-pie.spec.ts --workers=2 --retries=0`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/cuantasCaben.ts src/components/PatternEditor/SeccionDelPatron.tsx src/components/PatternEditor/SeccionDelPatron.css src/components/PatternEditor/__tests__/cuantasCaben.test.ts src/components/PatternEditor/__tests__/SeccionDelPatron.mas.test.tsx tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts src/styles/__tests__/zIndexScale.test.ts tests/e2e/linea-al-pie.spec.ts
git commit -m "feat(pie): lo que no cabe pasa a «Más», a un clic y con el teclado"
```

---

### Task 5: Los trinquetes, el gate y el contrato

**Files:**
- Modify: `tests/e2e/contraste-del-cromo.spec.ts`, `tests/e2e/contraste-baseline.json`, `tests/e2e/reposo-baseline.json`, `tests/e2e/superficies-baseline.json`
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2, § 3)
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (§ 5.3, nota)

- [ ] **Step 1: Los dos estados nuevos del contraste**

En `tests/e2e/contraste-del-cromo.spec.ts`, añade `reposo` ya importado y, al final:

```ts
test('la línea al pie: las opciones del piquete y el menú «Más»', async ({ page }) => {
  // Desde P2b las opciones de la herramienta viven en el marco, al pie, y lo
  // que no cabe flota en un menú de papel.
  await addPiece(page, 'piquete-pie', { x: 120, y: 120 }, 300, 400);
  await reposo(page);
  await activarHerramienta(page, 'Shift+N', 'notch');
  await expect(page.locator('.seccion-del-patron [data-superficie="pie"]')).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('línea al pie con el piquete', page);

  await page.setViewportSize({ width: 1100, height: 700 });
  await dispatch(page, 'editor/selectPiece', 'piquete-pie');
  await activarHerramienta(page, 'r', 'offsetOutline');
  await page.locator('.seccion-del-patron__mas').click();
  await expect(page.getByRole('group', { name: /^Más opciones de/ })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú «Más» de la línea al pie', page);
});
```

Run: `npx playwright test tests/e2e/contraste-del-cromo.spec.ts --workers=1 --retries=0`
Expected: FAIL: «"línea al pie con el piquete" no está en tests/e2e/contraste-baseline.json: fíjalo con CONTRASTE_UPDATE=1» (y lo mismo con el menú). El log de `registrar` tiene que decir `0 texto(s) bajo AA` en los dos; si dice otra cosa, se arregla el color antes de seguir (la línea base de un estado nuevo nace en 0).

- [ ] **Step 2: Las tres líneas base**

```bash
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
git diff tests/e2e/*-baseline.json
```

Expected: contraste gana los dos estados en 0 y nada sube; en reposo se va la tira (2D con patrón 2 → 1, Split 3 → 2, la vacía 3 → 2; 3D igual); en superficies ningún número sube (`fijarBaseline` solo baja) y los que bajan, bajan por la tira.

- [ ] **Step 3: El contrato y la spec**

En `.claude/skills/contrato-de-interfaz/SKILL.md`, § 2:

1. El punto «Hasta su fase siguen…»:

```markdown
- **Hasta su fase siguen con el overlay oscuro de `:root`:** la barra de IA y
  la tira (P2), los paneles (P4, que los pasa a `chrome` a ras) y el cromo del
  3D (P5). La fila dejó el lienzo en P2: sus seis interruptores viven en la
  barra superior, que es marco, y solo su menú plegado («Mostrar») flota y es
  papel. El margen de herramientas lleva el ámbito desde P2; la hoja lo gana
  cuando se vaya la tira, y el escenario en P5.
```

→

```markdown
- **Hasta su fase siguen con el overlay oscuro de `:root`:** la barra de IA
  (P2c), los paneles (P4, que los pasa a `chrome` a ras) y el cromo del 3D
  (P5). La fila dejó el lienzo en P2a: sus seis interruptores viven en la
  barra superior, que es marco, y solo su menú plegado («Mostrar») flota y es
  papel. La tira murió en P2b: sus opciones viven en la línea al pie, que es
  marco, y solo su menú «Más» flota y es papel. El margen de herramientas
  lleva el ámbito desde P2a y la hoja desde P2b; el escenario lo gana en P5.
```

2. La trampa:

```markdown
> **La trampa que ya nos costó una vez, a medio cerrar:** los `--text-*`
> cambian con el material. Dentro de `data-material="papel"` son tinta
> oscura; fuera, la del marco. La hoja del lienzo todavía no lleva el ámbito
> (lo gana en P2): ahí un `--text-*` da 1,05:1, invisible. Lo que se dibuja
> del patrón, dentro del `<svg>`, va con `--ink-*`.
```

→

```markdown
> **La trampa que ya nos costó una vez, cerrada en P2b:** los `--text-*`
> cambian con el material. Dentro de `data-material="papel"` son tinta
> oscura; fuera, la del marco. La hoja lleva el ámbito desde P2b, así que lo
> que vive sobre ella puede usar `--text-*`; lo que está en el marco (la barra
> superior, la línea al pie, los paneles) recibe la tinta clara. Lo que se
> dibuja del patrón, dentro del `<svg>`, sigue con `--ink-*`, que no cambia
> con el material.
```

3. El bloque de `--surface-overlay-border-flush` (desde `> **Y \`--surface-overlay-border-flush\`**` hasta `> para que no se vuelva regla tácita.`) →

```markdown
> **Las cotas van sobre el patrón por definición:** son parte del objeto,
> como los tiradores del transform box, no un panel
> (`docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` § 9-10). La
> tira de herramienta, el otro `overlay` que no se iba, murió en P2b con su
> borde `-flush` y su sombra `-sheet`: su sitio es la línea al pie, que es
> marco y no una excepción (spec 2026-10-02 § 10).
```

En § 3, detrás del punto «El selector de vista y los márgenes no se mueven…», añade:

```markdown
- **La línea al pie es una fila de la ventana.** Marco, de lado a lado y
  siempre, con el alto de la barra superior; la hoja termina encima y nada la
  empuja. Las opciones de la herramienta viven ahí, como botones; lo que no
  cabe pasa a «Más». Lo mide `linea-al-pie.spec.ts`.
```

En `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, al final de § 5.3 (detrás del párrafo «**No empuja ni se mueve.** …»), añade:

```markdown
**Nota del plan de P2b (2026-10-04).** La sección del patrón la pinta
`PatternEditor` por portal en una ranura de la línea al pie, porque la frase
sale del estado de sus herramientas; en 3D no se pinta (la franja se queda y
espera a la sección del 3D, P5). Todo número es un campo con «Restar» y
«Sumar», que no entran en el orden del teclado: con el foco en el campo, las
flechas hacen lo mismo. «Margen del próximo clic» se escribe al teclear, como
las demás opciones. Las formas del piquete se dibujan con la geometría del
lienzo (`generateNotchPath`). Las frases y los avisos que cambian están en el
plan (`docs/superpowers/plans/2026-10-04-interfaz-en-papel-p2b.md`, Task 2).
```

- [ ] **Step 4: El gate entero**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
bash scripts/deploy-prod.sh --ensayo
```

Expected: todo verde; el ensayo corre la lista e2e entera del gate (34 specs) sin flaky, la home y el build, y no envía nada. Si un e2e del gate que no tocó esta fase cae porque un clic suyo cae ahora en la línea al pie (la hoja mide 36 px menos de alto), se mueve el clic y se anota como Ruling.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/contraste-del-cromo.spec.ts tests/e2e/contraste-baseline.json tests/e2e/reposo-baseline.json tests/e2e/superficies-baseline.json .claude/skills/contrato-de-interfaz/SKILL.md docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(pie): trinquetes de P2b; el contrato y la spec dicen dónde viven las opciones"
```

## Capturas

Para que Samuel decida mirando, antes de la PR: con el servidor de este árbol, un script por CDP (`Page.captureScreenshot`, como en P2a; `page.screenshot` se cuelga) captura a 1366 × 643 en Split, con el DXF de María: el reposo, el piquete con sus cuatro opciones, la Pluma dibujando, y a 1100 × 700 Desplazar contorno con «Más» abierto. Van a `docs/reports/ui-audit-2026-10-02-hoy/capturas/p2b/` con una página `p2b-en-la-app.html` al lado (carpeta fuera de git).
