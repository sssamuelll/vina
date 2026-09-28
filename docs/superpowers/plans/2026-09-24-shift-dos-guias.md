# Shift: dos guías (hoja y borde) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shift una vez endereza a la hoja (como hoy) y Shift dos veces endereza al borde —la referencia de la píldora—, con las dos guías visibles, en la Pluma, la Línea interna y Editar patrón (`Q`).

**Architecture:** Una sola función pura (`guiasShift` en `restriccionShift.ts`) decide el punto enderezado y las dos guías que se pintan; la usan las tres herramientas y el overlay, así que aviso y resultado no pueden discrepar (maria-196). `useShiftSostenido` pasa de booleano a modo (`suelto | hoja | borde`) detectando el doble toque. `Q` congela su marco (el lado que llega al punto agarrado, o el propio lado) al empezar el arrastre.

**Tech Stack:** React 19 + TypeScript, Redux Toolkit, Vitest + Testing Library (jsdom), Playwright (e2e, Chromium).

**Spec:** `docs/superpowers/specs/2026-09-23-shift-hoja-y-borde-design.md`

## Global Constraints

- Rama `feat/shift-dos-guias` desde `main` (con #1209).
- Typecheck con `npx tsc -b --noEmit` (build mode), nunca `tsc --noEmit` pelado.
- Contrato de interfaz: invocar la skill `contrato-de-interfaz` antes de tocar lo visual; colores solo por token (`--accent-2d`, `--ink-on-light-3`), sin `var(--x, fallback)`, sin z-index; `node scripts/ui-contract-lint.mjs` no puede subir ningún contador.
- Copy en español de Venezuela, sentence case, sin «¡» ni «por favor»; nombres de teclas solo vía `src/components/shell/shortcutDisplay.ts`.
- Tiempos del doble toque: toque ≤ `SHIFT_TOQUE_MS = 300` ms sin ratón; segunda pulsación ≤ `SHIFT_DOBLE_MS = 400` ms tras soltar el toque.
- Solo Shift: ninguna combinación con Alt, Ctrl, Cmd ni letras (spec § 3.5).
- `Q`: solo los arrastres de punto y de lado de `useEditPattern`; Seleccionar, Editar curva y extremos de trazos e internas quedan fuera (spec § 7).
- Nada de lo que ya prueba `shift-endereza-a-la-hoja.test.tsx` / `.spec.ts` se cambia para que pase.
- Gates antes de cada commit de código: `npx tsc -b --noEmit`, `npx vitest run <tests tocados>`, `npx eslint <archivos tocados>`; al final la suite entera y `npm run lint:ui`.

## Review Focus

1. **Un toque de Shift dentro del chip de Tab o del chat, y luego Shift en el lienzo** → tiene que ser la hoja, no el borde: el toque en un campo no cuenta. (Test en la Tarea 1: el toque con el foco en un `<input>` no arma el doble.)
2. **Una pieza con arcos (`A`) en `Q`** → `buildRing` no la acepta; Shift dos veces tiene que caer a la hoja sin romper el arrastre. (Test en la Tarea 3: `arrivingReference` devuelve el eje, y en la Tarea 6 el arrastre con borde sobre esa pieza endereza a la hoja.)
3. **Esquina con anclas gemelas en `Q`** (DXF de María: dos comandos en el mismo punto) → el lado que llega es el primero no degenerado, no el tramo de largo cero entre gemelas. (Test en la Tarea 3.)
4. **Shift dos veces con el primer tramo libre de la Pluma** (sin borde) → el mismo punto que Shift una vez y una sola guía; la pista no ofrece nada que elegir. (Tests en las Tareas 4 y 8.)
5. **Perder el foco entre el toque y la segunda pulsación** (Alt+Tab a otra ventana) → al volver, Shift es la hoja. (Test en la Tarea 1.)

---

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/components/PatternEditor/gestureConstants.ts` | `SHIFT_TOQUE_MS`, `SHIFT_DOBLE_MS` | 1 |
| `src/components/PatternEditor/useShiftSostenido.ts` | modo `suelto/hoja/borde` + doble toque | 1 |
| `src/components/PatternEditor/__tests__/useShiftSostenido.test.tsx` (nuevo) | el modo, con reloj falso | 1 |
| `src/components/PatternEditor/restriccionShift.ts` | `restringirA45`, `guiasShift`, tipos `GuiaShift`/`GuiasShift` | 2 |
| `src/components/PatternEditor/__tests__/restriccionShift.test.ts` | geometría del marco girado | 2 |
| `src/components/PatternEditor/angleReference.ts` | `arrivingReference`, `chordReference` | 3 |
| `src/components/PatternEditor/__tests__/marcoDelLado.test.ts` (nuevo) | marcos de `Q` | 3 |
| `src/components/PatternEditor/usePenTool.ts` | modo + guías en la Pluma | 4 |
| `src/components/PatternEditor/usePolyPenTool.ts` | modo + guías en la Línea interna | 5 |
| `src/components/PatternEditor/useEditPattern.ts` | marco congelado + guías en `Q` | 6 |
| `src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx` (nuevo) | las tres herramientas con el borde | 4, 5, 6 |
| `src/components/PatternEditor/renderers/overlays/GuiasShiftOverlay.tsx` (nuevo) | los dos rayos | 7 |
| `src/components/PatternEditor/renderers/overlays/__tests__/GuiasShiftOverlay.test.tsx` (nuevo) | tokens y montaje | 7 |
| `src/components/shell/shortcutDisplay.ts` | `displayModifierKey` | 8 |
| `src/components/PatternEditor/renderers/HintText.tsx` | pistas con Shift | 8 |
| `src/components/PatternEditor/renderers/__tests__/HintText.shift.test.tsx` (nuevo) | la tabla del § 4.2 | 8 |
| `src/components/PatternEditor/PatternEditor.tsx` | cablea guías y modo | 7, 8 |
| `tests/e2e/shift-endereza-a-la-hoja.spec.ts` | borde en navegador real + ancho de la pista | 9 |
| docs (spec, enmienda § 3.4, informe § 9) | registro | 10 |

---

### Task 1: el modo de Shift y el doble toque

**Files:**
- Modify: `src/components/PatternEditor/gestureConstants.ts` (al final)
- Modify: `src/components/PatternEditor/useShiftSostenido.ts` (entero)
- Create: `src/components/PatternEditor/__tests__/useShiftSostenido.test.tsx`

**Interfaces:**
- Produces: `export type ModoShift = 'suelto' | 'hoja' | 'borde'`; `useShiftSostenido(alCambiar: (modo: ModoShift) => void): { modoRef: { readonly current: ModoShift }; sincronizar: (shiftKey: boolean) => void }`; `SHIFT_TOQUE_MS`, `SHIFT_DOBLE_MS`.

- [ ] **Step 1: tests que fallan**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useShiftSostenido, type ModoShift } from '../useShiftSostenido';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = ''; });

const tecla = (type: 'keydown' | 'keyup', o: { shiftKey?: boolean; repeat?: boolean; target?: EventTarget } = {}) =>
  act(() => {
    const e = new KeyboardEvent(type, { key: 'Shift', bubbles: true, shiftKey: o.shiftKey ?? type === 'keydown', repeat: o.repeat ?? false });
    (o.target ?? window).dispatchEvent(e);
  });
const esperar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function montar() {
  const avisos: ModoShift[] = [];
  const hook = renderHook(() => useShiftSostenido(m => avisos.push(m)));
  return { modo: () => hook.result.current.modoRef.current, sincronizar: hook.result.current.sincronizar, avisos };
}

describe('useShiftSostenido — el modo', () => {
  it('Shift una vez es la hoja, y soltar lo suelta', () => {
    const { modo, avisos } = montar();
    tecla('keydown');
    expect(modo()).toBe('hoja');
    tecla('keyup');
    expect(modo()).toBe('suelto');
    expect(avisos).toEqual(['hoja', 'suelto']);
  });

  it('un toque y otra pulsación enseguida es el borde, mientras se mantenga', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(80); tecla('keyup'); esperar(150);
    tecla('keydown');
    expect(modo()).toBe('borde');
    tecla('keyup');
    expect(modo()).toBe('suelto');
  });

  it('una pulsación larga no es un toque', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(800); tecla('keyup'); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('un Shift+clic no es un toque', () => {
    const { modo } = montar();
    tecla('keydown');
    act(() => { window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    esperar(60); tecla('keyup'); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('pasado el plazo, la segunda pulsación vuelve a ser la hoja', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(80); tecla('keyup'); esperar(401);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('la autorrepetición no es otra pulsación', () => {
    const { modo, avisos } = montar();
    tecla('keydown'); esperar(50);
    tecla('keydown', { repeat: true }); tecla('keydown', { repeat: true });
    expect(modo()).toBe('hoja');
    expect(avisos).toEqual(['hoja']);
  });

  it('soltar una Shift con la otra pulsada no suelta', () => {
    const { modo } = montar();
    tecla('keydown');
    tecla('keyup', { shiftKey: true });
    expect(modo()).toBe('hoja');
  });

  it('perder el foco olvida sin avisar, y el toque de antes ya no cuenta', () => {
    const { modo, avisos } = montar();
    tecla('keydown'); esperar(80); tecla('keyup');
    act(() => { window.dispatchEvent(new Event('blur')); });
    esperar(50);
    tecla('keydown');
    expect(modo()).toBe('hoja');
    expect(avisos).toEqual(['hoja', 'suelto', 'hoja']);
  });

  it('un toque dentro de un campo no arma el doble', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { modo } = montar();
    tecla('keydown', { target: input }); esperar(80); tecla('keyup', { target: input }); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('con un modal delante el lienzo no escucha', () => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    const { modo } = montar();
    tecla('keydown');
    expect(modo()).toBe('suelto');
  });

  it('sincronizar con el ratón: Shift que el teclado no vio es la hoja', () => {
    const { modo, sincronizar, avisos } = montar();
    act(() => sincronizar(true));
    expect(modo()).toBe('hoja');
    act(() => sincronizar(false));
    expect(modo()).toBe('suelto');
    expect(avisos).toEqual([]);
  });
});
```

- [ ] **Step 2: correrlos y ver que fallan**

Run: `npx vitest run src/components/PatternEditor/__tests__/useShiftSostenido.test.tsx`
Expected: FAIL (`modoRef` no existe: el hook devuelve un ref booleano).

- [ ] **Step 3: implementar**

En `gestureConstants.ts`, al final:

```ts
/**
 * Shift dos veces (spec 2026-09-23 § 3.1): un TOQUE es pulsar y soltar Shift
 * en menos de esto sin pulsar el ratón entre medias. Un Shift+clic no es un
 * toque, ni lo es mantener Shift mientras se traza.
 */
export const SHIFT_TOQUE_MS = 300;

/** Tras un toque, la siguiente pulsación antes de esto es «dos veces». */
export const SHIFT_DOBLE_MS = 400;
```

`useShiftSostenido.ts` entero:

```ts
import { useCallback, useEffect, useRef } from 'react';
import { isEditableTarget } from '../../utils/editableTarget';
import { hayModalDelante } from '../../utils/superficieModal';
import { SHIFT_DOBLE_MS, SHIFT_TOQUE_MS } from './gestureConstants';

/** Sin Shift, Shift una vez (la hoja) o Shift dos veces (el borde). */
export type ModoShift = 'suelto' | 'hoja' | 'borde';

/**
 * Qué Shift está pulsado AHORA —ninguno, una vez o dos—, y un aviso cuando
 * cambia.
 *
 * (conservar los párrafos del comentario actual sobre María 10-09 [07:35], el
 * modificador, los filtros de campo y modal, la captura y el `blur`)
 *
 * Shift dos veces (spec 2026-09-23 § 3.1 y § 3.5): un toque —pulsar y soltar en
 * menos de `SHIFT_TOQUE_MS`, sin ratón entre medias— seguido de otra pulsación
 * antes de `SHIFT_DOBLE_MS` es el BORDE mientras se mantiene. Es la única
 * segunda tecla que existe en todos los teclados y no es atajo de sistema en
 * ninguno: Alt+Shift y Ctrl+Shift cambian el idioma o el teclado en Windows.
 */
export function useShiftSostenido(alCambiar: (modo: ModoShift) => void) {
  const modoRef = useRef<ModoShift>('suelto');
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;
  const pulsadoEnRef = useRef<number | null>(null);
  const conRatonRef = useRef(false);
  const toqueEnRef = useRef<number | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || isEditableTarget(e.target) || hayModalDelante()) return;
      const ahora = Date.now();
      if (e.shiftKey) {
        // Autorrepetición, o la otra Shift con una ya pulsada: es la misma pulsación.
        if (modoRef.current !== 'suelto') return;
        const doble = toqueEnRef.current !== null && ahora - toqueEnRef.current <= SHIFT_DOBLE_MS;
        toqueEnRef.current = null;
        pulsadoEnRef.current = ahora;
        conRatonRef.current = false;
        modoRef.current = doble ? 'borde' : 'hoja';
      } else {
        if (modoRef.current === 'suelto') return;
        const inicio = pulsadoEnRef.current;
        toqueEnRef.current = inicio !== null && !conRatonRef.current && ahora - inicio <= SHIFT_TOQUE_MS
          ? ahora : null;
        pulsadoEnRef.current = null;
        modoRef.current = 'suelto';
      }
      alCambiarRef.current(modoRef.current);
    };
    // Un clic con Shift pulsado lo gasta: soltar después no es un toque.
    const raton = () => { if (modoRef.current !== 'suelto') conRatonRef.current = true; };
    const olvidar = () => {
      modoRef.current = 'suelto';
      pulsadoEnRef.current = null;
      toqueEnRef.current = null;
      conRatonRef.current = false;
    };
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('keyup', tecla, true);
    window.addEventListener('mousedown', raton, true);
    window.addEventListener('blur', olvidar);
    return () => {
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('keyup', tecla, true);
      window.removeEventListener('mousedown', raton, true);
      window.removeEventListener('blur', olvidar);
    };
  }, []);

  /**
   * Lo que dice el ratón (`e.shiftKey`) corrige al teclado sin avisar —el
   * handler que llama ya va a pintar—: si Shift no está, suelto; si está y el
   * teclado no lo vio (pulsado con la ventana sin foco), la hoja. El ratón
   * nunca arma el borde: eso solo lo sabe el teclado.
   */
  const sincronizar = useCallback((shiftKey: boolean) => {
    if (!shiftKey) {
      if (modoRef.current !== 'suelto') { modoRef.current = 'suelto'; pulsadoEnRef.current = null; }
      return;
    }
    if (modoRef.current === 'suelto') { modoRef.current = 'hoja'; pulsadoEnRef.current = null; }
  }, []);

  return { modoRef: modoRef as { readonly current: ModoShift }, sincronizar };
}
```

Los tres hooks que lo usan dejan de compilar aquí; se arreglan en las Tareas 4–6. Para no romper el árbol entre commits, en este mismo paso cambiar sus llamadas al mínimo que compila y mantiene el comportamiento de hoy:

- `usePenTool.ts`: `const { modoRef, sincronizar } = useShiftSostenido((modo) => { const shift = modo !== 'suelto'; …cuerpo actual… });`; `shiftRef.current = e.shiftKey` → `sincronizar(e.shiftKey)`; lecturas `shiftRef.current` → `modoRef.current !== 'suelto'`; deps `shiftRef` → `modoRef, sincronizar`.
- `usePolyPenTool.ts` y `useEditPattern.ts`: lo mismo.

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/useShiftSostenido.test.tsx src/components/PatternEditor/__tests__/shift-endereza-a-la-hoja.test.tsx && npx tsc -b --noEmit`
Expected: PASS los dos archivos; typecheck limpio.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/gestureConstants.ts src/components/PatternEditor/useShiftSostenido.ts src/components/PatternEditor/__tests__/useShiftSostenido.test.tsx src/components/PatternEditor/usePenTool.ts src/components/PatternEditor/usePolyPenTool.ts src/components/PatternEditor/useEditPattern.ts
git commit -m "feat(2d): Shift sabe si va una vez o dos (doble toque)"
```

---

### Task 2: la geometría del marco girado y las dos guías

**Files:**
- Modify: `src/components/PatternEditor/restriccionShift.ts`
- Modify: `src/components/PatternEditor/__tests__/restriccionShift.test.ts` (añadir al final)

**Interfaces:**
- Consumes: `AngleReference`, `normalizeAngle`, `relativeAngle` de `angleReference.ts`.
- Produces: `restringirA45(desde, cursor, baseDeg = 0): Point2D`; `restringirAHoja45` (igual que hoy, delega); `enderezarDesplazamiento(delta, baseDeg = 0)`; `interface GuiaShift { desde: Point2D; angleDeg: number }`; `interface GuiasShift { punto: Point2D; activa: GuiaShift | null; tenue: GuiaShift | null }`; `guiasShift(desde, cursor, referencia: AngleReference, borde: boolean): GuiasShift`.

- [ ] **Step 1: tests que fallan** (añadir a `restriccionShift.test.ts`)

```ts
import { restringirA45, guiasShift, enderezarDesplazamiento } from '../restriccionShift';
import { relativeAngle, type AngleReference } from '../angleReference';

// El costado de la escena firmada: dirección 1:3 recorrida en el sentido
// corregido (deja la pieza a +90°), el de `borderReference`.
const COSTADO: AngleReference = { kind: 'border', baseDeg: polarOf({ x: 0, y: 0 }, { x: -60, y: -180 }).angleDeg };
const DESDE = { x: 430, y: 240 };
const CURSOR = { x: 291, y: 276 };

describe('restringirA45 — un marco girado', () => {
  it('con base 0 es exactamente la hoja', () => {
    expect(restringirA45(DESDE, CURSOR, 0)).toEqual(restringirAHoja45(DESDE, CURSOR));
  });

  it('desde el costado, el rumbo de 86° al borde sale a 90,0° exactos', () => {
    const p = restringirA45(DESDE, CURSOR, COSTADO.baseDeg);
    expect(relativeAngle(polarOf(DESDE, p).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('una base múltiplo de 45° usa los vectores exactos de la hoja', () => {
    expect(restringirA45({ x: 0, y: 0 }, { x: 100, y: 3 }, 90)).toEqual({ x: 100, y: 0 });
  });

  it('el desplazamiento de Q gira con la misma base', () => {
    const d = enderezarDesplazamiento({ x: CURSOR.x - DESDE.x, y: CURSOR.y - DESDE.y }, COSTADO.baseDeg);
    expect(relativeAngle(polarOf({ x: 0, y: 0 }, d).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });
});

describe('guiasShift — el punto y lo que se pinta salen de lo mismo', () => {
  it('Shift una vez: activa la hoja, tenue el borde', () => {
    const g = guiasShift(DESDE, CURSOR, COSTADO, false);
    expect(g.punto).toEqual(restringirAHoja45(DESDE, CURSOR));
    expect(g.activa).toEqual({ desde: DESDE, angleDeg: 180 });
    expect(relativeAngle(g.tenue!.angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('Shift dos veces invierte: activa el borde, tenue la hoja', () => {
    const g = guiasShift(DESDE, CURSOR, COSTADO, true);
    expect(relativeAngle(g.activa!.angleDeg, COSTADO)).toBeCloseTo(90, 9);
    expect(g.tenue).toEqual({ desde: DESDE, angleDeg: 180 });
    expect(relativeAngle(polarOf(DESDE, g.punto).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('marcos coincidentes: una sola guía', () => {
    expect(guiasShift(DESDE, CURSOR, { kind: 'absolute', baseDeg: 0 }, true).tenue).toBeNull();
    expect(guiasShift(DESDE, CURSOR, { kind: 'border', baseDeg: -90 }, false).tenue).toBeNull();
  });

  it('con el cursor sobre el origen no hay dirección que pintar', () => {
    expect(guiasShift(DESDE, DESDE, COSTADO, true)).toEqual({ punto: DESDE, activa: null, tenue: null });
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/__tests__/restriccionShift.test.ts`
Expected: FAIL (`restringirA45` / `guiasShift` no exportados).

- [ ] **Step 3: implementar** — `restriccionShift.ts` queda así (conservar el comentario de cabecera y el de `restringirAHoja45`):

```ts
import type { Point2D } from '../../types/types';
import { normalizeAngle, type AngleReference } from './angleReference';

const D = Math.SQRT1_2;
const DIRECCIONES_HOJA: readonly Point2D[] = [
  { x: 1, y: 0 }, { x: D, y: -D }, { x: 0, y: -1 }, { x: -D, y: -D },
  { x: -1, y: 0 }, { x: -D, y: D }, { x: 0, y: 1 }, { x: D, y: D },
];

/** ¿Da el marco las mismas ocho direcciones que la hoja? */
function esDeLaHoja(baseDeg: number): boolean {
  const resto = ((baseDeg % 45) + 45) % 45;
  return resto < 1e-9 || 45 - resto < 1e-9;
}

/**
 * Las ocho direcciones del marco (convención de `polarPoint`: θ → (cos θ, −sin θ)).
 * Un marco alineado con la hoja reusa sus vectores escritos: la horizontal
 * sigue saliendo con la `y` idéntica a la del origen.
 */
function direcciones(baseDeg: number): readonly Point2D[] {
  if (esDeLaHoja(baseDeg)) return DIRECCIONES_HOJA;
  return Array.from({ length: 8 }, (_, k) => {
    const rad = ((baseDeg + 45 * k) * Math.PI) / 180;
    return { x: Math.cos(rad), y: -Math.sin(rad) };
  });
}

function masCercana(dx: number, dy: number, dirs: readonly Point2D[]): { u: Point2D; largo: number } {
  let u = dirs[0];
  let largo = -Infinity;
  for (const d of dirs) {
    const p = dx * d.x + dy * d.y;
    if (p > largo) { largo = p; u = d; }
  }
  return { u, largo };
}

/** El punto sobre la dirección del marco `baseDeg` más cercana al rumbo, a la distancia de la proyección. */
export function restringirA45(desde: Point2D, cursor: Point2D, baseDeg = 0): Point2D {
  const dx = cursor.x - desde.x;
  const dy = cursor.y - desde.y;
  if (Math.hypot(dx, dy) < 1e-9) return { ...desde };
  const { u, largo } = masCercana(dx, dy, direcciones(baseDeg));
  return { x: desde.x + largo * u.x, y: desde.y + largo * u.y };
}

export function restringirAHoja45(desde: Point2D, cursor: Point2D): Point2D {
  return restringirA45(desde, cursor, 0);
}

const ORIGEN: Point2D = { x: 0, y: 0 };

export function enderezarDesplazamiento(delta: Point2D, baseDeg = 0): Point2D {
  return restringirA45(ORIGEN, delta, baseDeg);
}

/** Un rayo desde `desde`, con el ángulo de `polarPoint`. */
export interface GuiaShift { desde: Point2D; angleDeg: number }

/**
 * Lo que decide Shift en un instante: dónde cae el punto, y las dos guías que
 * se pintan —la activa, por donde va la línea, y la tenue, adonde iría si se
 * cambiara de guía ahora—. `null` donde no hay nada que pintar.
 */
export interface GuiasShift { punto: Point2D; activa: GuiaShift | null; tenue: GuiaShift | null }

const anguloDe = (u: Point2D) => normalizeAngle((Math.atan2(-u.y, u.x) * 180) / Math.PI);

/**
 * La ÚNICA fuente del punto enderezado y de las guías (spec 2026-09-23 § 5.1):
 * la usan las herramientas para colocar y el overlay para pintar, así que el
 * aviso y el resultado no pueden discrepar (maria-196).
 */
export function guiasShift(desde: Point2D, cursor: Point2D, referencia: AngleReference, borde: boolean): GuiasShift {
  const marco = borde ? referencia.baseDeg : 0;
  const punto = restringirA45(desde, cursor, marco);
  const dx = cursor.x - desde.x;
  const dy = cursor.y - desde.y;
  if (Math.hypot(dx, dy) < 1e-9) return { punto, activa: null, tenue: null };
  const activa = { desde, angleDeg: anguloDe(masCercana(dx, dy, direcciones(marco)).u) };
  if (esDeLaHoja(referencia.baseDeg)) return { punto, activa, tenue: null };
  const otro = borde ? 0 : referencia.baseDeg;
  return { punto, activa, tenue: { desde, angleDeg: anguloDe(masCercana(dx, dy, direcciones(otro)).u) } };
}
```

Ciclo de imports: `angleReference.ts` no importa `restriccionShift.ts` (solo `polyPenGeometry`), así que no hay ciclo.

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/restriccionShift.test.ts src/components/PatternEditor/__tests__/shift-endereza-a-la-hoja.test.tsx && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/restriccionShift.ts src/components/PatternEditor/__tests__/restriccionShift.test.ts
git commit -m "feat(2d): guiasShift — el punto y las dos guías de Shift, de una sola fuente"
```

---

### Task 3: los marcos de `Q` — el lado que llega y la recta del lado

**Files:**
- Modify: `src/components/PatternEditor/angleReference.ts` (añadir tras `borderReference`)
- Create: `src/components/PatternEditor/__tests__/marcoDelLado.test.ts`

**Interfaces:**
- Consumes: `buildRing`, `tangentAt` (privado del mismo archivo), `pieceLocalToPattern`, `polarOf`.
- Produces: `arrivingReference(piece: PatternPiece, commandIndex: number): AngleReference`; `chordReference(piece: PatternPiece, fromLocal: Point2D, toLocal: Point2D): AngleReference`. Ambos en espacio de PATRÓN; el eje (`ABSOLUTE_REFERENCE`) cuando no hay lado.

- [ ] **Step 1: tests que fallan**

```ts
import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { arrivingReference, chordReference, ABSOLUTE_REFERENCE } from '../angleReference';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { polarOf } from '../polyPenGeometry';

const pieza = (outline: PathCommand[], rotation = 0): PatternPiece => ({
  id: 'p', name: 'P', outline, internals: [], position: { x: 200, y: 150 }, rotation, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
} as unknown as PatternPiece);

const DELANTERO: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
];

describe('arrivingReference — el lado que llega al punto', () => {
  it('al punto 2 llega el costado inclinado', () => {
    const r = arrivingReference(pieza(DELANTERO), 2);
    expect(r.kind).toBe('border');
    expect(r.baseDeg).toBeCloseTo(polarOf({ x: 200, y: 0 }, { x: 260, y: 180 }).angleDeg, 9);
  });

  it('al punto del M llega el lado de cierre', () => {
    expect(arrivingReference(pieza(DELANTERO), 0).baseDeg).toBeCloseTo(90, 9);
  });

  it('en una esquina con anclas gemelas salta el tramo de largo cero', () => {
    const gemelas: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    expect(arrivingReference(pieza(gemelas), 2).baseDeg).toBeCloseTo(0, 9);
  });

  it('en una pieza girada el marco gira con ella', () => {
    const p = pieza(DELANTERO, 30);
    const esperado = polarOf(pieceLocalToPattern({ x: 200, y: 0 }, p), pieceLocalToPattern({ x: 260, y: 180 }, p)).angleDeg;
    expect(arrivingReference(p, 2).baseDeg).toBeCloseTo(esperado, 9);
  });

  it('un contorno con arcos no tiene lado: cae al eje', () => {
    const conArco: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'A', values: [50, 50, 0, 0, 1, 100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'Z', values: [] },
    ];
    expect(arrivingReference(pieza(conArco), 2)).toEqual(ABSOLUTE_REFERENCE);
  });
});

describe('chordReference — la recta del lado', () => {
  it('es la dirección de su ancla de salida a la de llegada', () => {
    expect(chordReference(pieza(DELANTERO), { x: 200, y: 0 }, { x: 260, y: 180 }).baseDeg)
      .toBeCloseTo(polarOf({ x: 200, y: 0 }, { x: 260, y: 180 }).angleDeg, 9);
  });

  it('un lado de largo cero no tiene recta', () => {
    expect(chordReference(pieza(DELANTERO), { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual(ABSOLUTE_REFERENCE);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/__tests__/marcoDelLado.test.ts`
Expected: FAIL (funciones no exportadas).

- [ ] **Step 3: implementar** en `angleReference.ts` (añadir `PatternPiece` al import de tipos):

```ts
/** Una dirección local como referencia en espacio de patrón: una pieza girada gira su marco. */
function referenceAlong(piece: PatternPiece, atLocal: Point2D, dirLocal: Point2D): AngleReference {
  if (Math.hypot(dirLocal.x, dirLocal.y) < 1e-9) return ABSOLUTE_REFERENCE;
  const from = pieceLocalToPattern(atLocal, piece);
  const to = pieceLocalToPattern({ x: atLocal.x + dirLocal.x, y: atLocal.y + dirLocal.y }, piece);
  return { kind: 'border', baseDeg: normalizeAngle(polarOf(from, to).angleDeg) };
}

/**
 * El lado que LLEGA a un ancla del contorno: el marco del borde al arrastrar
 * ese punto en `Q` (spec 2026-09-23 § 3.4). A 0° el lado se alarga sin cambiar
 * de inclinación; a 90° el punto sale en perpendicular a él. Para el ancla del
 * `M` llega el lado de cierre. Un tramo de largo cero entre anclas gemelas no
 * es un lado: se busca el que llega desde OTRO punto. Un lado curvo aporta su
 * tangente de llegada. Sin lado (arcos, pieza degenerada), el eje: Shift dos
 * veces endereza entonces como Shift una vez.
 */
export function arrivingReference(piece: PatternPiece, commandIndex: number): AngleReference {
  const command = piece.outline[commandIndex];
  if (!command || command.values.length < 2) return ABSOLUTE_REFERENCE;
  const anchor = { x: command.values[command.values.length - 2], y: command.values[command.values.length - 1] };
  const built = buildRing(piece.outline, 2);
  if (!built.ok) return ABSOLUTE_REFERENCE;
  const arriving = built.value.segments.find(s => samePoint(s.to, anchor) && !samePoint(s.from, anchor));
  return arriving ? referenceAlong(piece, anchor, tangentAt(arriving, 1)) : ABSOLUTE_REFERENCE;
}

/** La recta de un lado, de su ancla de salida a la de llegada: el marco al arrastrar el lado en `Q`. */
export function chordReference(piece: PatternPiece, fromLocal: Point2D, toLocal: Point2D): AngleReference {
  return referenceAlong(piece, fromLocal, { x: toLocal.x - fromLocal.x, y: toLocal.y - fromLocal.y });
}
```

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/marcoDelLado.test.ts src/components/PatternEditor/__tests__/ && npx tsc -b --noEmit`
Expected: PASS. Si el test del arco no llega a `buildRing` (p. ej. `samePoint` casa antes), revisar que `buildRing` devuelve `ok: false` con `A`; si devuelve ok con el arco aproximado, el test cambia a «el marco es el del lado recto que llega», y se anota en el commit.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/angleReference.ts src/components/PatternEditor/__tests__/marcoDelLado.test.ts
git commit -m "feat(2d): el marco de Q — el lado que llega al punto y la recta del lado"
```

---

### Task 4: la Pluma con dos guías

**Files:**
- Modify: `src/components/PatternEditor/usePenTool.ts`
- Create: `src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx`

**Interfaces:**
- Consumes: `guiasShift`, `GuiasShift` (Tarea 2); `useShiftSostenido`, `ModoShift` (Tarea 1).
- Produces: `usePenTool(...)` devuelve además `guias: GuiasShift | null` y `modoShift: ModoShift`.

- [ ] **Step 1: tests que fallan** (archivo nuevo; la cabecera cita la spec y el § 1)

```tsx
// @vitest-environment jsdom
/**
 * Shift dos veces endereza al BORDE (spec 2026-09-23): la referencia de la
 * píldora. Shift una vez sigue siendo la hoja (firma B del 23-09). Escena: el
 * delantero de la firma, costado inclinado 1:3. Zoom 1, paneo 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePenTool } from '../usePenTool';
import { polarOf } from '../polyPenGeometry';
import { relativeAngle } from '../angleReference';

afterEach(cleanup);

const DELANTERO = {
  id: 'delantero', name: 'Delantero', internals: [], position: { x: 200, y: 150 }, rotation: 0, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
  ] as PathCommand[],
} as unknown as PatternPiece;

/** Punto medio del costado: local (230,90) → patrón (430,240). */
const COSTADO = { x: 430, y: 240 };
const RUMBO = { x: 291, y: 276 };

const ev = (x: number, y: number, shiftKey = false, detail = 1) => ({
  button: 0, clientX: x, clientY: y, shiftKey, detail,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

const tecla = (type: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', shiftKey: type === 'keydown' })); });
/** Un toque y la segunda pulsación, mantenida: en el mismo milisegundo, dentro de los plazos. */
const dosVeces = () => { tecla('keydown'); tecla('keyup'); tecla('keydown'); };

describe('Pluma — Shift dos veces endereza al borde', () => {
  function setup(pieces: PatternPiece[] = [DELANTERO]) {
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, vi.fn(), pieces));
    const tool = () => hook.result.current;
    const click = (p: { x: number; y: number }, conShift = false) => act(() => {
      tool().handleMouseDown(ev(p.x, p.y, conShift));
      tool().handleMouseUp();
    });
    const move = (p: { x: number; y: number }, conShift = false) => act(() => tool().handleMouseMove(ev(p.x, p.y, conShift)));
    return { tool, click, move };
  }

  it('desde el costado, la píldora lee 90,0° al borde y la goma va por la perpendicular', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    const l = tool().lastPointDistance!;
    expect(l.reference.kind).toBe('border');
    expect(relativeAngle(l.angleDeg, l.reference)).toBeCloseTo(90, 9);
    expect(tool().modoShift).toBe('borde');
  });

  it('las dos guías: con una vez manda la hoja; con dos, el borde', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    tecla('keydown');
    expect(tool().guias!.activa!.angleDeg).toBe(180);
    const borde = tool().guias!.tenue!.angleDeg;
    tecla('keyup');
    tecla('keydown');
    expect(tool().guias!.activa!.angleDeg).toBeCloseTo(borde, 9);
    expect(tool().guias!.tenue!.angleDeg).toBe(180);
  });

  it('el clic con el borde activo coloca el nodo sobre la perpendicular', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    const [a, b] = tool().nodes.map(n => n.anchor);
    const ref = tool().lastPointDistance?.reference;
    expect(relativeAngle(polarOf(a, b).angleDeg, { kind: 'border', baseDeg: polarOf({ x: 0, y: 0 }, { x: -60, y: -180 }).angleDeg })).toBeCloseTo(90, 9);
    expect(ref?.kind).toBe('segment');
  });

  it('el segundo tramo con el borde sale a escuadra con el primero', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    move({ x: 300, y: 400 }, true);
    const l = tool().lastPointDistance!;
    expect(l.reference.kind).toBe('segment');
    expect(Math.abs(relativeAngle(l.angleDeg, l.reference))).toBeCloseTo(90, 9);
  });

  it('soltar Shift devuelve la goma al ratón', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    tecla('keyup');
    expect(tool().lastPointDistance!.position).toEqual(RUMBO);
    expect(tool().guias).toBeNull();
  });

  it('primer tramo libre: dos veces da lo mismo que una, y una sola guía', () => {
    const { tool, click, move } = setup([]);
    click({ x: 100, y: 100 });
    move({ x: 200, y: 108 });
    tecla('keydown');
    const hoja = tool().lastPointDistance!.position;
    tecla('keyup');
    tecla('keydown');
    expect(tool().lastPointDistance!.position).toEqual(hoja);
    expect(tool().guias!.tenue).toBeNull();
  });

  it('arrastrando un manejador no hay guías', () => {
    const { tool, move } = setup();
    act(() => tool().handleMouseDown(ev(COSTADO.x, COSTADO.y)));
    dosVeces();
    move({ x: COSTADO.x + 40, y: COSTADO.y + 40 }, true);
    expect(tool().guias).toBeNull();
  });

  it('Tab con el borde congela la dirección enderezada', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    act(() => tool().openNextPoint());
    const np = tool().nextPoint!;
    expect(relativeAngle(np.angleDeg, np.reference)).toBeCloseTo(90, 9);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx`
Expected: FAIL (`modoShift`/`guias` indefinidos; la píldora lee 71,6° y no 90).

- [ ] **Step 3: implementar** en `usePenTool.ts`:

1. Imports: quitar `restringirAHoja45`; añadir `import { guiasShift, type GuiasShift } from './restriccionShift';`, `import { useShiftSostenido, type ModoShift } from './useShiftSostenido';`, y `type AngleReference` en el import de `./angleReference`.
2. `PenState.shift: boolean` → `modoShift: ModoShift` (comentario: «Shift: suelto, la hoja (una vez) o el borde (dos veces)»); `EMPTY` con `modoShift: 'suelto'`.
3. Subir `nodesToCommands` (el `useCallback` de hoy, sin cambios) y el memo `angleReference` por encima de `enderezar`, y añadir su espejo:

```ts
  const angleReference = useMemo(() => referenceForNext(nodesToCommands(state.nodes, false), indice),
    [state.nodes, nodesToCommands, indice]);
  // Los callbacks leen el marco de la render vigente, como leen `nodesRef`.
  const angleReferenceRef = useRef<AngleReference>(angleReference);
  angleReferenceRef.current = angleReference;
```

   y borrar el memo de más abajo (el que alimenta `lastPointDistance`, que ahora usa este).
4. Sustituir `enderezar`:

```ts
  /**
   * Con Shift y un nodo del que partir, las guías (spec 2026-09-23): la hoja
   * con una vez, el borde —la referencia de la píldora— con dos. Si no, `null`.
   */
  const guiasPara = useCallback(
    (nodes: PenNode[], cursor: Point2D, modo: ModoShift, referencia: AngleReference): GuiasShift | null =>
      modo !== 'suelto' && nodes.length > 0
        ? guiasShift(nodes[nodes.length - 1].anchor, cursor, referencia, modo === 'borde')
        : null,
    [],
  );
  const enderezar = useCallback(
    (nodes: PenNode[], cursor: Point2D, modo: ModoShift, referencia: AngleReference): Point2D | null =>
      guiasPara(nodes, cursor, modo, referencia)?.punto ?? null,
    [guiasPara],
  );
```

5. El hook de Shift:

```ts
  const { modoRef, sincronizar } = useShiftSostenido((modo) => {
    if (nodesRef.current.length === 0) return;
    const cursor = cursorRef.current;
    setHover(modo !== 'suelto' || pressRef.current?.moved || !cursor ? null : resolveSnap(indice, cursor, radio()));
    setState(prev => (prev.modoShift === modo ? prev : { ...prev, modoShift: modo }));
  });
```

6. `destinoDe` gana el marco: firma `(nodes, raton, modo: ModoShift, referencia: AngleReference, enganche: Point2D | null)`, y dentro `const guia = enderezar(nodes, raton, modo, referencia);`.
7. En la render: `siguiente = … destinoDe(state.nodes, state.cursorPos, state.modoShift, angleReference, hover?.point ?? null)`, y justo debajo de `destino`:

```ts
  // Las guías se pintan mientras hay algo que enderezar: con la pareja
  // congelada o arrastrando manejadores la goma no va por ninguna.
  const guias = state.cursorPos && !state.isClosed && !state.isDragging && !state.nextPoint
    ? guiasPara(state.nodes, state.cursorPos, state.modoShift, angleReference)
    : null;
```

8. `handleMouseDown`: `shiftRef.current = e.shiftKey;` → `sincronizar(e.shiftKey); const modo = modoRef.current;`; la guía: `modo !== 'suelto' && e.detail >= 2 && nodes.length > 0 ? nodes[nodes.length - 1].anchor : enderezar(nodes, pt, modo, angleReferenceRef.current)`; bitácora: `...(guia ? { shift: true, ...(modo === 'borde' ? { borde: true } : {}) } : {})`; estado: `modoShift: modo` en vez de `shift: e.shiftKey`. Deps: cambiar `shiftRef` por `modoRef, sincronizar`.
9. `handleMouseMove`: `shiftRef.current = e.shiftKey;` → `sincronizar(e.shiftKey);`; `const conGuia = modoRef.current !== 'suelto' && nodesRef.current.length > 0;`; en los dos `return` del `setState`, `modoShift: modoRef.current` en vez de `shift: e.shiftKey`.
10. `openNextPoint`: `destinoDe(nodes, raton, modoRef.current, angleReferenceRef.current, resolveSnap(indice, raton, radio())?.point ?? null)`.
11. `return`: añadir `guias,` y `modoShift: state.modoShift,` (con comentario: «Las dos guías de Shift, para `GuiasShiftOverlay`, y el modo, para la pista»).

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx src/components/PatternEditor/__tests__/shift-endereza-a-la-hoja.test.tsx src/components/PatternEditor/__tests__/ -t "Pluma|pen|Pen" && npx tsc -b --noEmit`
Expected: PASS, incluidos todos los de la Pluma que ya existían.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/usePenTool.ts src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx
git commit -m "feat(2d): la Pluma endereza al borde con Shift dos veces"
```

---

### Task 5: la Línea interna con dos guías

**Files:**
- Modify: `src/components/PatternEditor/usePolyPenTool.ts`
- Modify: `src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx` (añadir un `describe`)

**Interfaces:**
- Consumes: igual que la Tarea 4.
- Produces: `usePolyPenTool(...)` devuelve además `guias: GuiasShift | null` y `modoShift: ModoShift`.

- [ ] **Step 1: tests que fallan** (añadir al archivo; reusa `DELANTERO`, `COSTADO`, `RUMBO`, `ev`, `tecla`, `dosVeces`)

```tsx
import { usePolyPenTool } from '../usePolyPenTool';

describe('Línea interna — Shift dos veces endereza al borde', () => {
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePolyPenTool(1, { x: 0, y: 0 }, { nodeType: 'straight', pieces: [DELANTERO], onComplete }));
    const tool = () => hook.result.current;
    const click = (p: { x: number; y: number }, conShift = false) => act(() => {
      tool().handleMouseDown(ev(p.x, p.y, conShift));
      tool().handleMouseUp(ev(p.x, p.y, conShift));
    });
    const move = (p: { x: number; y: number }, conShift = false) => act(() => tool().handleMouseMove(ev(p.x, p.y, conShift)));
    return { tool, click, move, onComplete };
  }

  it('la goma va por la perpendicular al costado', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    expect(relativeAngle(polarOf(COSTADO, tool().previewPoint!).angleDeg, tool().angleReference)).toBeCloseTo(90, 9);
    expect(tool().guias!.tenue!.angleDeg).toBe(180);
    expect(tool().modoShift).toBe('borde');
  });

  it('el nodo cae sobre la perpendicular y la línea termina con dos nodos', () => {
    const { tool, click, move, onComplete } = setup();
    click(COSTADO);
    move(RUMBO);
    dosVeces();
    click(RUMBO, true);
    tecla('keyup');
    act(() => { tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })); });
    const [, comandos] = onComplete.mock.calls[0];
    const [m, l] = comandos as PathCommand[];
    const a = { x: m.values[0], y: m.values[1] };
    const b = { x: l.values[0], y: l.values[1] };
    expect(relativeAngle(polarOf(a, b).angleDeg, { kind: 'border', baseDeg: polarOf({ x: 0, y: 0 }, { x: -60, y: -180 }).angleDeg })).toBeCloseTo(90, 9);
  });

  it('una vez es la hoja, como hoy', () => {
    const { tool, click, move } = setup();
    click(COSTADO);
    move(RUMBO);
    tecla('keydown');
    expect(tool().previewPoint!.y).toBe(COSTADO.y);
    expect(tool().guias!.activa!.angleDeg).toBe(180);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx -t "Línea interna"`
Expected: FAIL.

- [ ] **Step 3: implementar** en `usePolyPenTool.ts`:

1. Imports: quitar `restringirAHoja45`; añadir `guiasShift, type GuiasShift` y `useShiftSostenido, type ModoShift`; `type AngleReference` desde `./angleReference`.
2. `ViewState` gana `guias: GuiasShift | null` y `modoShift: ModoShift`; `EMPTY` con `guias: null, modoShift: 'suelto'`.
3. Marco del borde con caché por identidad (los nodos cambian de identidad en cada nodo nuevo; el índice, con las piezas):

```ts
  // `referenceForNodes` proyecta sobre el anillo de la anfitriona: no se
  // rehace por evento de ratón, solo cuando cambian los nodos o el índice.
  const marcoRef = useRef<{ nodes: PolyPenNode[]; indice: typeof indice; ref: AngleReference } | null>(null);
  const marcoDe = useCallback((nodes: PolyPenNode[]): AngleReference => {
    const c = marcoRef.current;
    if (c && c.nodes === nodes && c.indice === indice) return c.ref;
    const ref = referenceForNodes(nodes);
    marcoRef.current = { nodes, indice, ref };
    return ref;
  }, [indice, referenceForNodes]);
```

4. El hook de Shift: `const { modoRef, sincronizar } = useShiftSostenido(() => { …cuerpo de hoy… });` (el cuerpo no cambia: re-publica con el modo vigente).
5. Sustituir `enderezar`:

```ts
  /**
   * Con Shift y un nodo del que partir, las guías (spec 2026-09-23): la hoja
   * con una vez, el borde con dos. El cierre sobre el primer nodo va por
   * delante: cerrar es otro gesto.
   */
  const guiasPara = useCallback((world: Point2D | null): GuiasShift | null => {
    const nodes = nodesRef.current;
    const modo = modoRef.current;
    if (modo === 'suelto' || !world || nodes.length === 0) return null;
    return guiasShift(nodes[nodes.length - 1].point, world, marcoDe(nodes), modo === 'borde');
  }, [modoRef, marcoDe]);
  const enderezar = useCallback((world: Point2D | null): Point2D | null => guiasPara(world)?.punto ?? null, [guiasPara]);
```

6. `hoverPara`: `if (!shiftRef.current || …)` → `if (modoRef.current === 'suelto' || nodes.length === 0) return resolveSnap(world, true);`; deps `modoRef`.
7. `publish`: añadir `guias: press?.moved || nextPointRef.current ? null : guiasPara(lastWorldRef.current),` y `modoShift: modoRef.current,`; deps `guiasPara, modoRef`.
8. `handleMouseDown` y `handleMouseMove`: `shiftRef.current = e.shiftKey;` → `sincronizar(e.shiftKey);`; bitácora del press: `...(guia ? { shift: true, ...(modoRef.current === 'borde' ? { borde: true } : {}) } : {})`; deps.
9. `return`: `guias: view.guias,` y `modoShift: view.modoShift,`.

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/ && npx tsc -b --noEmit`
Expected: PASS (todo el directorio: la Línea interna tiene muchos tests de gramática que no pueden cambiar).

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/usePolyPenTool.ts src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx
git commit -m "feat(2d): la Línea interna endereza al borde con Shift dos veces"
```

---

### Task 6: `Q` con el marco congelado del lado

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts`
- Modify: `src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx` (añadir un `describe`)

**Interfaces:**
- Consumes: `arrivingReference`, `chordReference` (Tarea 3); `guiasShift` (Tarea 2); `ModoShift` (Tarea 1).
- Produces: `useEditPattern(...)` devuelve además `guias: GuiasShift | null` y `modoShift: ModoShift`.

- [ ] **Step 1: tests que fallan**

Arnés: el mismo que el `describe` de Editar patrón de `shift-endereza-a-la-hoja.test.tsx` (tienda con `projectReducer`, `restoreState` con la pieza, `renderHook(() => useEditPattern(1, {x:0,y:0}), { wrapper })`, `enterEdit`). Copiarlo tal cual a este archivo con la pieza `DELANTERO`.

```tsx
describe('Editar patrón — Shift dos veces endereza respecto al lado', () => {
  // (arnés copiado: setupQ(pieza) → { tool, store, down(p, shift), move(p, shift), up() })
  const local = (store: ReturnType<typeof setupQ>['store']) => store.getState().project.pieces[0].outline;
  const cruz = (a: {x:number;y:number}, b: {x:number;y:number}) => a.x * b.y - a.y * b.x;

  it('arrastrar el final del costado lo alarga sin cambiar su inclinación', () => {
    const { store, down, move, up } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 480, y: 380 }, true);
    up();
    const [x, y] = local(store)[2].values;
    expect(cruz({ x: x - 200, y }, { x: 60, y: 180 })).toBeCloseTo(0, 6);
    expect(y).toBeGreaterThan(180);
  });

  it('el marco se congela: dos pasos en perpendicular quedan sobre la misma recta', () => {
    const { store, down, move } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 520, y: 312 }, true);
    const p1 = { x: local(store)[2].values[0], y: local(store)[2].values[1] };
    move({ x: 580, y: 294 }, true);
    const p2 = { x: local(store)[2].values[0], y: local(store)[2].values[1] };
    // Perpendicular a la dirección ORIGINAL (60,180): el producto escalar con ella no cambia.
    const dot = (p: {x:number;y:number}) => (p.x - 260) * 60 + (p.y - 180) * 180;
    expect(dot(p1)).toBeCloseTo(0, 6);
    expect(dot(p2)).toBeCloseTo(0, 6);
  });

  it('arrastrar el costado a 90° lo desplaza en paralelo', () => {
    const { store, down, move, up } = setupQ(DELANTERO);
    down({ x: 430, y: 240 });
    dosVeces();
    move({ x: 480, y: 230 }, true);
    up();
    const o = local(store);
    const a = { x: o[1].values[0], y: o[1].values[1] };
    const b = { x: o[2].values[0], y: o[2].values[1] };
    expect(cruz({ x: b.x - a.x, y: b.y - a.y }, { x: 60, y: 180 })).toBeCloseTo(0, 6);
    expect(a.x).toBeGreaterThan(200);
  });

  it('cambiar a dos veces a mitad del arrastre, con la mano quieta, cambia de marco', () => {
    const { store, down, move } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    tecla('keydown');
    move({ x: 480, y: 380 }, true);
    expect(local(store)[2].values[0]).toBeCloseTo(260, 6); // la hoja: vertical
    tecla('keyup');
    tecla('keydown');
    const [x, y] = local(store)[2].values;
    expect(cruz({ x: x - 200, y }, { x: 60, y: 180 })).toBeCloseTo(0, 6);
  });

  it('expone las guías mientras dura el arrastre, desde la posición inicial', () => {
    const { tool, down, move, up } = setupQ(DELANTERO);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 480, y: 380 }, true);
    expect(tool().guias!.activa!.desde).toEqual({ x: 460, y: 330 });
    expect(tool().guias!.tenue).not.toBeNull();
    up();
    expect(tool().guias).toBeNull();
  });

  it('en una pieza con arcos, dos veces endereza a la hoja sin romper', () => {
    const conArco = { ...DELANTERO, outline: [
      { type: 'M', values: [0, 0] }, { type: 'A', values: [50, 50, 0, 0, 1, 200, 0] },
      { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
    ] } as unknown as PatternPiece;
    const { store, down, move } = setupQ(conArco);
    down({ x: 460, y: 330 });
    dosVeces();
    move({ x: 470, y: 400 }, true);
    expect(store.getState().project.pieces[0].outline[2].values[0]).toBeCloseTo(260, 6);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx -t "Editar patrón"`
Expected: FAIL.

- [ ] **Step 3: implementar** en `useEditPattern.ts`:

1. Imports: `enderezarDesplazamiento` → `guiasShift, type GuiasShift`; `useShiftSostenido, type ModoShift`; `import { arrivingReference, chordReference, type AngleReference } from './angleReference';`.
2. `OutlineDrag` gana, obligatorio:

```ts
  /**
   * El marco del borde, congelado al empezar (spec 2026-09-23 § 3.4): desde
   * dónde salen las guías —la posición inicial del punto agarrado, o el
   * punto del lado donde se pulsó— y respecto a qué lado, en espacio de patrón.
   */
  marco: { desde: Point2D; referencia: AngleReference };
```

3. Dos helpers al final del módulo, junto a `findFromNode`:

```ts
/** El marco de un punto agarrado: el lado que le llega. */
function marcoDelPunto(piece: PatternPiece, position: Point2D, commandIndex: number) {
  return { desde: pieceLocalToPattern(position, piece), referencia: arrivingReference(piece, commandIndex) };
}

/** El marco de un lado agarrado: su propia recta, desde donde se pulsó. */
function marcoDelTramo(piece: PatternPiece, nodes: EditableNode[], commandIndex: number, pulsado: Point2D) {
  const toIndex = piece.outline[commandIndex]?.type === 'Z' ? 0 : commandIndex;
  const to = nodes.find(n => n.ref.commandIndex === toIndex)?.position;
  const from = findFromNode(nodes, commandIndex)?.position;
  return {
    desde: pulsado,
    referencia: to && from ? chordReference(piece, from, to) : { kind: 'absolute' as const, baseDeg: 0 },
  };
}
```

4. Los cuatro sitios que arman `dragRef.current` con `type: 'node' | 'segment'` añaden `marco`:
   - `enterEditActuando`, punto: `marco: marcoDelPunto(piece, startPositions.get(nodeHit.commandIndex) ?? pieceLocalToPattern… ` → usar la posición del nodo: `marcoDelPunto(piece, nodes.find(n => n.ref.commandIndex === nodeHit.commandIndex)!.position, nodeHit.commandIndex)`.
   - `enterEditActuando`, lado: `marco: marcoDelTramo(piece, nodes, segmentHit.commandIndex, pieceLocalToPattern(localPt, piece))`.
   - `handleMouseDown`, punto: `marco: marcoDelPunto(piece, state.nodes.find(n => n.ref.commandIndex === idx)!.position, idx)`.
   - `handleMouseDown`, lado: `marco: marcoDelTramo(piece, state.nodes, idx, toPattern(e))`.
5. Estado nuevo en el hook:

```ts
  const [guias, setGuias] = useState<GuiasShift | null>(null);
  const [modoShift, setModoShift] = useState<ModoShift>('suelto');
  /** Solo re-renderiza si lo que se pinta cambió. */
  const publicarGuias = useCallback((g: GuiasShift | null) => {
    setGuias(prev => (mismasGuias(prev, g) ? prev : g));
  }, []);
```

   con, en el módulo:

```ts
function mismaGuia(a: GuiaShift | null, b: GuiaShift | null): boolean {
  return a === b || (!!a && !!b && a.angleDeg === b.angleDeg && a.desde.x === b.desde.x && a.desde.y === b.desde.y);
}
function mismasGuias(a: GuiasShift | null, b: GuiasShift | null): boolean {
  return a === b || (!!a && !!b && mismaGuia(a.activa, b.activa) && mismaGuia(a.tenue, b.tenue));
}
```

   (importar `type GuiaShift` también).
6. El hook de Shift:

```ts
  const { modoRef, sincronizar } = useShiftSostenido((modo) => {
    setModoShift(modo);
    const drag = dragRef.current;
    if (!drag || drag.type === 'marquee' || !drag.lastMouse || !state.editingPieceId) return;
    const piece = getPiece(state.editingPieceId);
    if (piece) aplicarArrastre(piece, drag, drag.lastMouse, modo);
  });
```

7. `aplicarArrastre(piece, drag, mouse, modo: ModoShift)` — sustituir el bloque del delta:

```ts
      const enHoja = {
        x: screenToPatternLength(pantalla.x, zoom),
        y: screenToPatternLength(pantalla.y, zoom),
      };
      // Con Shift el desplazamiento se endereza en espacio de patrón —la hoja,
      // o el lado congelado al empezar— ANTES de pasarlo al marco de la
      // pieza: en una pieza girada la hoja no gira con ella, y el lado ya va
      // girado en su referencia. Las guías salen del mismo cálculo.
      let enPatron = enHoja;
      if (modo !== 'suelto') {
        const { desde, referencia } = drag.marco;
        const g = guiasShift(desde, { x: desde.x + enHoja.x, y: desde.y + enHoja.y }, referencia, modo === 'borde');
        enPatron = { x: g.punto.x - desde.x, y: g.punto.y - desde.y };
        publicarGuias(g);
      } else {
        publicarGuias(null);
      }
      const { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);
```

   Deps: añadir `publicarGuias`.
8. `handleMouseDown`: `shiftRef.current = e.shiftKey;` → `sincronizar(e.shiftKey); setModoShift(modoRef.current);`. `handleMouseMove` (rama de arrastre): `sincronizar(e.shiftKey); setModoShift(modoRef.current); aplicarArrastre(piece, drag, { x: e.clientX, y: e.clientY }, modoRef.current);`. Deps: `shiftRef` → `modoRef, sincronizar`.
9. Limpiar las guías donde el arrastre termina: al principio de `handleMouseUp` (`setGuias(null);`), en `exitEdit` y en el efecto de resync donde hoy hace `dragRef.current = null`.
10. `return`: añadir `guias,` y `modoShift,`.

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/__tests__/ && npx tsc -b --noEmit`
Expected: PASS, incluidos `useEditPattern.*.test.tsx` y el `describe` de Editar patrón de `shift-endereza-a-la-hoja.test.tsx`.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/__tests__/shift-hoja-y-borde.test.tsx
git commit -m "feat(2d): Q endereza respecto al lado con Shift dos veces, con el marco congelado"
```

---

### Task 7: las guías en el lienzo

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/GuiasShiftOverlay.tsx`
- Create: `src/components/PatternEditor/renderers/overlays/__tests__/GuiasShiftOverlay.test.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (import junto a `PolyPenToolOverlay`; montaje justo antes de `{!isDraggingPiece && (<ToolOverlay`)

**Interfaces:**
- Consumes: `GuiasShift` (Tarea 2); `pen.guias`, `internalShapeTool.guias`, `editPatternTool.guias` (Tareas 4–6).
- Produces: `export default function GuiasShiftOverlay(props: { guias: GuiasShift | null; zoom2D: number })`; atributo `data-guia-shift="activa" | "tenue"` en cada `<line>` (lo lee el e2e).

- [ ] **Step 0:** invocar la skill `contrato-de-interfaz` (obligatorio antes de tocar lo visual).

- [ ] **Step 1: test que falla**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import GuiasShiftOverlay from '../GuiasShiftOverlay';

afterEach(cleanup);
const enSvg = (ui: React.ReactElement) => render(<svg>{ui}</svg>);

describe('GuiasShiftOverlay', () => {
  it('pinta la activa con el acento y la tenue con tinta de construcción', () => {
    const { container } = enSvg(<GuiasShiftOverlay zoom2D={2} guias={{
      punto: { x: 10, y: 0 },
      activa: { desde: { x: 0, y: 0 }, angleDeg: 0 },
      tenue: { desde: { x: 0, y: 0 }, angleDeg: 18 },
    }} />);
    const activa = container.querySelector('[data-guia-shift="activa"]')!;
    const tenue = container.querySelector('[data-guia-shift="tenue"]')!;
    expect(activa.getAttribute('stroke')).toBe('var(--accent-2d)');
    expect(tenue.getAttribute('stroke')).toBe('var(--ink-on-light-3)');
    expect(activa.getAttribute('stroke-width')).toBe(String(1 / 2));
    expect(container.querySelector('g')!.getAttribute('pointer-events')).toBe('none');
    // Un rayo largo en píxeles de pantalla, pasado a patrón con el zoom.
    expect(Number(activa.getAttribute('x2'))).toBeCloseTo(2000 / 2, 6);
  });

  it('sin guías, o sin dirección, no pinta nada', () => {
    expect(enSvg(<GuiasShiftOverlay zoom2D={1} guias={null} />).container.querySelector('line')).toBeNull();
    expect(enSvg(<GuiasShiftOverlay zoom2D={1} guias={{ punto: { x: 0, y: 0 }, activa: null, tenue: null }} />)
      .container.querySelector('line')).toBeNull();
  });

  it('una sola guía cuando los marcos coinciden', () => {
    const { container } = enSvg(<GuiasShiftOverlay zoom2D={1} guias={{
      punto: { x: 10, y: 0 }, activa: { desde: { x: 0, y: 0 }, angleDeg: 0 }, tenue: null,
    }} />);
    expect(container.querySelectorAll('line')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/renderers/overlays/__tests__/GuiasShiftOverlay.test.tsx`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: implementar**

```tsx
import type { GuiaShift, GuiasShift } from '../../restriccionShift';
import { polarPoint } from '../../polyPenGeometry';
import { screenToPatternLength } from '../../../../utils/geometry';

/** Largo de cada rayo, en píxeles de pantalla: cruza el lienzo visible a cualquier zoom. */
const LARGO_PX = 2000;

interface Props {
  guias: GuiasShift | null;
  zoom2D: number;
}

/**
 * Las guías de Shift (spec 2026-09-23 § 4.1): la activa, por donde va la línea,
 * con el acento de la goma; la tenue, adonde iría si se cambiara de guía ahora,
 * con la tinta de construcción que se queda detrás. Solo rayos: el punto y los
 * ángulos los decide `guiasShift`, la misma función con la que la herramienta
 * coloca (maria-196).
 */
export default function GuiasShiftOverlay({ guias, zoom2D }: Props) {
  if (!guias?.activa) return null;
  const largo = screenToPatternLength(LARGO_PX, zoom2D);
  const rayo = (g: GuiaShift, cual: 'activa' | 'tenue') => {
    const fin = polarPoint(g.desde, largo, g.angleDeg);
    return (
      <line
        data-guia-shift={cual}
        x1={g.desde.x} y1={g.desde.y} x2={fin.x} y2={fin.y}
        stroke={cual === 'activa' ? 'var(--accent-2d)' : 'var(--ink-on-light-3)'}
        strokeWidth={1 / zoom2D}
        strokeDasharray={`${2 / zoom2D} ${4 / zoom2D}`}
      />
    );
  };
  return (
    <g pointerEvents="none">
      {guias.tenue && rayo(guias.tenue, 'tenue')}
      {rayo(guias.activa, 'activa')}
    </g>
  );
}
```

En `PatternEditor.tsx`: `import GuiasShiftOverlay from './renderers/overlays/GuiasShiftOverlay';` y, antes del `return` del componente (junto a los demás derivados de herramientas):

```tsx
  // Shift de la herramienta activa: sus guías, para el lienzo y la pista.
  const shiftActivo = activeTool === 'pen' ? { modo: pen.modoShift, guias: pen.guias }
    : activeTool === 'internalShape' ? { modo: internalShapeTool.modoShift, guias: internalShapeTool.guias }
    : activeTool === 'editPattern' ? { modo: editPatternTool.modoShift, guias: editPatternTool.guias }
    : null;
```

y el montaje, justo antes de `{!isDraggingPiece && (` del `ToolOverlay` (debajo de los nodos de las herramientas):

```tsx
          {/* Las guías de Shift van por debajo de los overlays de herramienta:
              los nodos y el anillo de enganche se leen encima. */}
          <GuiasShiftOverlay guias={shiftActivo?.guias ?? null} zoom2D={zoom2D} />
```

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/renderers/overlays/__tests__/GuiasShiftOverlay.test.tsx && npx tsc -b --noEmit && node scripts/ui-contract-lint.mjs`
Expected: PASS; el trinquete sin contadores al alza.

- [ ] **Step 5: commit**

```bash
git add src/components/PatternEditor/renderers/overlays/GuiasShiftOverlay.tsx src/components/PatternEditor/renderers/overlays/__tests__/GuiasShiftOverlay.test.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(2d): las dos guías de Shift se ven en el lienzo"
```

---

### Task 8: la pista del pie (ley de puertas)

**Files:**
- Modify: `src/components/shell/shortcutDisplay.ts`
- Modify: `src/components/PatternEditor/renderers/HintText.tsx`
- Create: `src/components/PatternEditor/renderers/__tests__/HintText.shift.test.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (props de `<HintText>`)

**Interfaces:**
- Consumes: `shiftActivo` (Tarea 7), `ModoShift`.
- Produces: `displayModifierKey(glyph: '⇧' | '⌘' | '⌥', isMac?: boolean): string`; `HintText` gana `modoShift?: ModoShift` y `hayOtroMarco?: boolean`.

- [ ] **Step 1: tests que fallan**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HintText from '../HintText';
import { displayModifierKey } from '../../../shell/shortcutDisplay';

afterEach(cleanup);
const pie = (props: Partial<React.ComponentProps<typeof HintText>>) =>
  render(<svg><HintText activeTool="pen" pieces={[]} penNodesLength={2} nodeEditorIsEditing={false} {...props} /></svg>)
    .container.textContent;

describe('displayModifierKey — la tecla sola', () => {
  it('⇧ en macOS y Shift fuera, sin el + de combinar', () => {
    expect(displayModifierKey('⇧', true)).toBe('⇧');
    expect(displayModifierKey('⇧', false)).toBe('Shift');
  });
});

describe('HintText — Shift anuncia la otra guía', () => {
  it('con Shift y un segundo marco, la pista dice cómo llegar al borde', () => {
    expect(pie({ modoShift: 'hoja', hayOtroMarco: true })).toBe('Shift: a la hoja · Shift dos veces: al borde');
  });

  it('con el borde activo, dice cómo volver a la hoja', () => {
    expect(pie({ modoShift: 'borde', hayOtroMarco: true })).toBe('Shift dos veces: al borde · una vez: a la hoja');
  });

  it('sin segundo marco no hay nada que elegir: la pista de la herramienta', () => {
    expect(pie({ modoShift: 'hoja', hayOtroMarco: false })).toContain('Clic añade');
  });

  it('también en la Línea interna y en Editar patrón', () => {
    expect(pie({ activeTool: 'internalShape', internalShapeNodesLength: 1, modoShift: 'hoja', hayOtroMarco: true }))
      .toBe('Shift: a la hoja · Shift dos veces: al borde');
    expect(pie({ activeTool: 'editPattern', modoShift: 'borde', hayOtroMarco: true }))
      .toBe('Shift dos veces: al borde · una vez: a la hoja');
  });

  it('el Hilo no cambia', () => {
    expect(pie({ activeTool: 'grainline', modoShift: 'hoja', hayOtroMarco: true })).toContain('para el hilo');
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/HintText.shift.test.tsx`
Expected: FAIL.

- [ ] **Step 3: implementar**

En `shortcutDisplay.ts`, tras `displayShortcut`:

```ts
/**
 * El nombre de una tecla modificadora SOLA, para frases como «Shift dos
 * veces»: `displayShortcut('⇧')` da «Shift+», que es para combinar.
 */
export function displayModifierKey(glyph: '⇧' | '⌘' | '⌥', isMac: boolean = IS_MAC): string {
  return isMac ? glyph : displayShortcut(glyph, false).replace(/\+$/, '');
}
```

En `HintText.tsx`:

```tsx
import { displayModifierKey, displayShortcut } from '../../shell/shortcutDisplay';
import type { ModoShift } from '../useShiftSostenido';

/** Con Shift pulsado, la pista de la Pluma, la Línea interna y `Q` la
 *  sustituye una corta (spec 2026-09-23 § 4.2): las de la Pluma y la Línea
 *  interna ya no caben en su laptop, y lo añadido caería en lo que no se ve. */
const SHIFT = displayModifierKey('⇧');
const PISTA_HOJA = `${SHIFT}: a la hoja · ${SHIFT} dos veces: al borde`;
const PISTA_BORDE = `${SHIFT} dos veces: al borde · una vez: a la hoja`;
const CON_DOS_GUIAS = new Set<Tool2D>(['pen', 'internalShape', 'editPattern']);
```

Props nuevas en `HintTextProps`:

```ts
  /** Shift en la herramienta activa: suelto, la hoja o el borde. */
  modoShift?: ModoShift;
  /** Hay una segunda guía que elegir (el borde no coincide con la hoja). */
  hayOtroMarco?: boolean;
```

En el cuerpo, antes del `return`:

```tsx
  const pistaShift = modoShift && modoShift !== 'suelto' && hayOtroMarco && CON_DOS_GUIAS.has(activeTool)
    ? (modoShift === 'borde' ? PISTA_BORDE : PISTA_HOJA)
    : null;
```

y: el bloque de `internalShape` pasa a `activeTool === 'internalShape' && !pistaShift`; el de la Pluma, `activeTool === 'pen' && penNodesLength > 0 && !pistaShift`; el de `editPattern`, `activeTool === 'editPattern' && !nodeEditorIsEditing && !pistaShift`; y se añade `{pistaShift && <Pie>{pistaShift}</Pie>}` tras el de `editPattern`.

En `PatternEditor.tsx`, en `<HintText …>`:

```tsx
          modoShift={shiftActivo?.modo}
          // En `Q` antes de agarrar, el lado aún no se conoce: la pista anuncia la opción.
          hayOtroMarco={activeTool === 'editPattern' && !editPatternTool.guias ? true : !!shiftActivo?.guias?.tenue}
```

- [ ] **Step 4: correr**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/ src/components/shell/ && npx tsc -b --noEmit && node scripts/ui-contract-lint.mjs`
Expected: PASS (incluido `HintText.legibilidad.test.tsx`).

- [ ] **Step 5: commit**

```bash
git add src/components/shell/shortcutDisplay.ts src/components/PatternEditor/renderers/HintText.tsx src/components/PatternEditor/renderers/__tests__/HintText.shift.test.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(2d): la pista del pie anuncia Shift dos veces"
```

---

### Task 9: e2e — el borde en un navegador real, y que la pista cabe

**Files:**
- Modify: `tests/e2e/shift-endereza-a-la-hoja.spec.ts` (nuevo `test.describe` al final; ya está en el gate de `scripts/deploy-prod.sh`)

- [ ] **Step 1: escribir los casos**

```ts
/** Un toque y la segunda pulsación, mantenida (spec 2026-09-23 § 3.1). */
async function dosVecesShift(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Shift');
}

const MARIA = { width: 1366, height: 643 };

test.describe('Shift dos veces endereza al borde', () => {
  test.setTimeout(120_000);

  test('Línea interna desde el costado: la perpendicular exacta, con las dos guías a la vista', async ({ page }) => {
    await waitForApp(page);
    await delantero(page);
    await activarHerramienta(page, 'g', 'internalShape');
    await clickAt(page, { x: 430, y: 240 });
    await mover(page, { x: 291, y: 276 });
    await dosVecesShift(page);
    await expect(pildora(page)).toContainText(/90[.,]0° al borde/);
    await expect(page.locator('[data-guia-shift="activa"]')).toHaveCount(1);
    await expect(page.locator('[data-guia-shift="tenue"]')).toHaveCount(1);
    expect(await page.locator('[data-guia-shift="activa"]').getAttribute('stroke')).toBe('var(--accent-2d)');

    const destino = await toScreen(page, { x: 291, y: 276 });
    await page.mouse.click(destino.x, destino.y);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const [m, l] = ((await st(page)).project.pieces[0].internals as Array<{ path: Cmd[] }>)[0].path;
    // Perpendicular al costado (60,180) en local: el producto escalar es cero.
    const d = { x: l.values[0] - m.values[0], y: l.values[1] - m.values[1] };
    expect(d.x * 60 + d.y * 180).toBeCloseTo(0, 3);
  });

  test('Editar patrón: dos veces alarga el costado sin cambiar su inclinación', async ({ page }) => {
    await waitForApp(page);
    await delantero(page);
    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 300, y: 240 });
    const a = await toScreen(page, { x: 460, y: 330 });
    const b = await toScreen(page, { x: 480, y: 380 });
    await dosVecesShift(page);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);

    const [x, y] = ((await st(page)).project.pieces[0].outline as Cmd[])[2].values;
    expect((x - 200) * 180 - y * 60, 'el costado cambió de inclinación').toBeCloseTo(0, 3);
    expect(y).toBeGreaterThan(180);
  });

  test.describe('la pista cabe en su laptop, con la notación larga (Windows)', () => {
    test.use({ viewport: MARIA });

    test('Shift y Shift dos veces, en Split a 1366×643', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
      });
      await waitForApp(page);
      await dispatch(page, 'editor/setViewMode', 'split');
      await delantero(page);
      await activarHerramienta(page, 'g', 'internalShape');
      await clickAt(page, { x: 430, y: 240 });
      await mover(page, { x: 291, y: 276 });

      const pista = page.locator('svg.pattern-svg > text[y="98%"]');
      const cabe = async (texto: string) => {
        await expect(pista).toHaveText(texto);
        const { largo, ancho } = await pista.evaluate((t) => ({
          largo: (t as SVGTextElement).getComputedTextLength(),
          ancho: (t.ownerSVGElement as SVGSVGElement).getBoundingClientRect().width,
        }));
        expect(largo, `«${texto}» mide ${largo} px en un lienzo de ${ancho}`).toBeLessThan(ancho);
      };

      await page.keyboard.down('Shift');
      await cabe('Shift: a la hoja · Shift dos veces: al borde');
      await page.keyboard.up('Shift');
      await dosVecesShift(page);
      await cabe('Shift dos veces: al borde · una vez: a la hoja');
      await page.keyboard.up('Shift');
    });
  });
});
```

Antes de dar el selector de la pista por bueno, comprobar en el DOM que `HintText` pinta un `<text>` hijo directo del `svg.pattern-svg` con `y="98%"`; si cuelga de un `<g>`, ajustar el selector a `svg.pattern-svg text[y="98%"]`.

- [ ] **Step 2: correr**

Run: `npx playwright test tests/e2e/shift-endereza-a-la-hoja.spec.ts --workers=1`
Expected: PASS los 8 (5 viejos + 3 nuevos).

- [ ] **Step 3: commit**

```bash
git add tests/e2e/shift-endereza-a-la-hoja.spec.ts
git commit -m "test(e2e): Shift dos veces endereza al borde, y la pista cabe en su laptop"
```

---

### Task 10: el registro

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-shift-hoja-y-borde-design.md` (estado; § 5.1 y § 5.4 según lo construido)
- Modify: `docs/superpowers/specs/2026-09-08-contexto-y-control-numerico-design.md` (enmienda al § 3.4)
- Modify: `docs/reports/2026-09-10-reunion-maria.md` (§ 9, «lo que queda»)

- [ ] **Step 1:** Spec: estado «implementada el 24-09 (rama `feat/shift-dos-guias`)»; § 5.1: `restringirAHoja45` se queda como el caso de la hoja (delega en `restringirA45`), porque en cada llamada dice qué quiere; § 5.4: el overlay es `GuiasShiftOverlay.tsx`, montado una vez en `PatternEditor.tsx` por debajo del `ToolOverlay`, no dentro de los tres overlays.
- [ ] **Step 2:** Enmienda al § 3.4 del contrato del 08-09, bajo la enmienda del 23-09: «**Enmienda del 24-09 — Shift dos veces, al borde.** Shift una vez sigue siendo la hoja (firma B). Shift dos veces —un toque y, enseguida, mantener— endereza respecto a la referencia de la píldora (firma D2), en la Pluma, la Línea interna y `Q`, con las dos guías a la vista. La tecla es Shift y no Alt ni Ctrl porque Vina funciona con cualquier teclado y esas dos, con Shift, son atajos de Windows para cambiar de idioma o de teclado (spec 2026-09-23 § 3.5). La precedencia no cambia: cerrar > Shift (hoja o borde) > enganche > ratón.»
- [ ] **Step 3:** Informe § 9, «Lo que queda hecho / pendiente»: una línea — «El ideal de su nota (las dos guías) está hecho el 24-09 con Shift dos veces; pendiente enseñárselo en su máquina y comprobar allí el riesgo de teclas especiales de Windows (spec § 3.5).»
- [ ] **Step 4: commit**

```bash
git add docs/superpowers/specs/2026-09-23-shift-hoja-y-borde-design.md docs/superpowers/specs/2026-09-08-contexto-y-control-numerico-design.md docs/reports/2026-09-10-reunion-maria.md
git commit -m "docs: Shift dos veces, al borde — enmienda al § 3.4 y registro"
```

---

## Cierre

- [ ] `npx tsc -b --noEmit && npx vitest run && npm run lint && npm run lint:ui`
- [ ] E2e: `npx playwright test tests/e2e/shift-endereza-a-la-hoja.spec.ts tests/e2e/linea-interna-gramatica.spec.ts tests/e2e/trazos.spec.ts tests/e2e/1102-la-pluma-engancha.spec.ts tests/e2e/maria-195-siguiente-punto.spec.ts tests/e2e/medidas-escritas-gramatica.spec.ts --workers=2`
- [ ] Revisión de la rama entera (agente revisor en frío) y arreglos.
- [ ] PR, merge; los gates del deploy.
