# Interfaz en papel — P3b: la cota de lo que se pone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El piquete y el punto, al ponerse, enseñan su cota abierta sobre el borde y se terminan de poner ahí mismo. El modal del piquete desaparece.

**Architecture:**
- **El chip que se escribe en vivo.** Una `Cota` gana dos avisos opcionales: `alEscribir`, en cada tecla, para el fantasma, y `alCerrar`, cuando se cierra la edición.
  - La escalera del sujeto recibe `loQueSePone` y lo pone arriba de todo: es lo más reciente.
  - `PatternEditor` abre el chip una vez por sesión, igual que ya abre el del tramo congelado.
- **El piquete.**
  - `useNotchTool` guarda solo qué piquete se está terminando de poner; lo demás se mide del contorno vivo en cada render, como pide #1124.
  - Sus cotas, Distancia y Profundidad, salen de `cotas/loQueSePone.ts`.
  - Confirmar escribe por `confirmRefine` y deja la sesión abierta. La cierra el chip.
- **El punto.**
  - `usePointTool` abre una sesión con la pieza de antes del clic y un lote de deshacer.
  - Mover el punto es volver a ponerlo desde esa pieza, con un verbo nuevo de `useEditPattern`: `reinsertarPunto`.
- **El arrastre de las puntas.** Con Seleccionar, las puntas de un piquete ya no se agarran ni se pintan, por la misma lista de Q (`esInternaEditable`). El middleware de piezas vinculadas reenvía el ancla y las opciones del piquete.

**Tech Stack:** React + Redux Toolkit, Vitest + Testing Library (jsdom), Playwright (e2e contra el Vite de 5174).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3):
- § 5.1, la tabla de superficies por acción: Piquete 4, Punto 3;
- § 5.2, sobre el objeto: «Piquete recién puesto» y «Punto recién puesto»;
- § 5.4, la frase;
- § 11, la fila P3.

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, en sentence case, sin «¡» ni «por favor».
  - Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md`: pieza, borde, esquina, piquete, punto, profundidad.
  - Los `aria-label` también van en español.
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - colores solo de los tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin colores literales;
  - todo `:hover` lleva su `:focus-visible`;
  - todo lo que flota es papel;
  - no se añade ningún `z-index` literal;
  - los atajos se escriben con una sola notación, la de `shortcutDisplay.ts`.
- **Superficies.** Toda superficie nueva declara `data-superficie` (`tests/repo/superficies-declaradas.test.ts`). El chip ya es `cabina`.
- **La caja negra** ve todo gesto nuevo (`pushJournal`).
- **Gates:**
  - el typecheck es `npx tsc -b --noEmit`;
  - nada de `--no-verify`;
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador;
  - cada tarea cierra con la suite entera (`npm run test`).
- **Trinquetes.** Sus líneas base solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`. A mano, nunca.
- **E2e en curso.** Mientras corre un e2e no se edita nada de la app: el Vite de 5174 recarga.
- **Ids y archivos.** Los ids se crean con `newId()`, y `git add` va con rutas explícitas.
- **Microcopy**, fijado con solace-wren el 06-10:
  - la frase de la línea al pie, mientras está abierta la cota de lo que se pone: «Escribe la distancia · Enter fija · Esc no lo mueve» (51 caracteres; el hueco del piquete es de 55);
  - los campos: «Distancia» y «Profundidad»;
  - junto a la distancia se lee «de 520 mm»;
  - el desenlace del punto que cae sobre otro: «Ya hay un punto ahí; el nuevo se queda donde estaba»;
  - el piquete sobre una pieza bloqueada usa el aviso de Punto tal cual.

## Review Focus

1. **El segundo clic con la cota abierta**, poniendo piquetes uno tras otro. Al soltar el foco, el chip cierra la sesión sin escribir. El clic nuevo pone otro piquete y abre su cota. → Task 1 (blur) y Task 5 (e2e).
2. **La pieza bloqueada.** El piquete no se pone y avisa como Punto. «Ajustar distancia…» no se ofrece sobre ella. Punto ya avisaba, y no abre cota ni lote. → Tasks 2 y 3.
3. **El borde curvo**, como la sisa de María, de 77 a 127 comandos. La distancia del punto se mide por el arco y el punto cae sobre la curva (`arcToNativeT`). → Task 3: el oráculo mide el vértice nuevo con el anillo.
4. **Deshacer.** Después de poner el punto y moverlo con su cota, un solo Ctrl+Z lo quita entero. Con el piquete, el primer Ctrl+Z lo devuelve al clic y el segundo lo quita, como con el modal. → Task 3 (lote) y Task 5 (e2e).
5. **Un número fuera de rango.**
   - La distancia del piquete por encima del perímetro marca el campo inválido y sigue editando. Por debajo, envuelve al lado siguiente, como el modal.
   - El punto tiene de techo el lado. El 0, o el largo exacto del lado, cae sobre una esquina y lo dice.
   → Tasks 2 y 3.

## Decisiones de este plan

1. **La profundidad se queda en el chip** como segundo campo del grupo, Distancia · Profundidad.
   - Hoy el modal es la única puerta para la profundidad de un piquete ya puesto: «Ajustes de piquete» de Propiedades escribe el próximo (`PieceProperties.tsx:255`).
   - Cada fase se publica con todas sus puertas. P3c la pasará a la etiqueta del piquete.
   - Rango de 1 a 30, el de § 5.2.
2. **La cota de lo que se pone vive lo que dura su edición.**
   - Se abre sola tras el clic, o con «Ajustar distancia…».
   - Enter, Esc, Tab al salir del último campo y el blur del siguiente clic la cierran.
   - Nunca descansa en reposo, así que un Ctrl+Z del lienzo no la encuentra viva: dentro del campo, el Ctrl+Z es del campo.
3. **Muere con su objeto.** Si el piquete ya no está, confirmar no escribe y la sesión se cierra, como en toda cota (`aplicarCota`). Se va la rama que lo volvía a poner (`useNotchTool.ts:426-442`).
4. **Qué esquina, y el largo.**
   - La esquina es la del ancla del piquete: la más cercana, en cualquier sentido (`computeNotchAnchor`). El punto usa la misma, calculada sobre la pieza de antes del clic.
   - «de N mm» es el lado desde esa esquina hasta la siguiente, en el sentido en que se cuenta.
   - El techo del piquete sigue siendo el perímetro, como en el modal (#1124). El del punto es el lado: pasar de la esquina siguiente lo pondría en otro lado.
5. **Una entrada de deshacer por punto.**
   - Poner el punto y terminar de ponerlo es un solo gesto: «Es terminar de poner el punto, no editar uno que ya existía» (§ 5.2).
   - Sin el lote, la regla de 500 ms de `undoMiddleware` fundía o no las dos escrituras según la velocidad de la usuaria.
   - El piquete conserva sus dos entradas: son acciones distintas, añadir y actualizar.
6. **El punto arrastrado también trae su cota.** El arrastre de Punto no tiene lectura en vivo (el del piquete sí: su píldora), así que sin cota no se sabe dónde quedó. El piquete abre su cota solo tras el clic, como el modal.
7. **La pieza bloqueada no recibe piquetes.** Punto ya avisaba (`useEditPattern.ts:398`). Piquete escribía sobre ella, y la cota de lo que se pone habría escrito sobre una pieza bloqueada.
8. **Las puntas de un piquete ya no se arrastran con Seleccionar.**
   - Ni se agarran ni se pintan, por `esInternaEditable`, la lista de Q.
   - Hoy ese arrastre escribía `path` y dejaba `notchAnchor` desfasado. El siguiente cambio del contorno devolvía el piquete a su sitio (`reanchorNotches`).
   - La lista también deja fuera los dobleces de pliegue, con el mismo defecto.
   - Para mover un piquete está «Ajustar distancia…».
9. **El hermano de las piezas vinculadas.**
   - `syncUpdateInternalLine` reenviaba solo `path`. La instancia recibe ahora ancla y opciones.
   - El espejo recibe solo las opciones. Su ancla se suelta a propósito (`mirrorInternalsX`).
10. **Lo que se borra:**
    - `NotchPrecisionModal` (tsx, css y test), el `inerte` de la línea al pie con su test (#1125), el e2e 1099, el caso del modal en `emplazamiento-modales` y la línea punteada de la marca.
    - La marca conserva el círculo de la esquina y el fantasma. La línea de cota hace de hilo.
11. **Trinquetes.**
    - El estado «modal del piquete» del contraste pasa a llamarse «cota del piquete». La clave vieja queda huérfana en el JSON, que no se edita a mano.
    - Superficies gana «poner punto (P)».
12. **Rama.** `feat/interfaz-en-papel-p3b`, que sale de `main` (`65674c40`).

---

### Task 1: El chip que se escribe en vivo

**Files:**
- Modify: `src/components/PatternEditor/cotas/cotas.ts`: `Cota` gana `alEscribir` y `alCerrar`; `kind` gana `'profundidad'`; `CotaUpdate` gana `piquete` y `punto`.
- Modify: `src/components/PatternEditor/cotas/parseMedida.ts`: `formatMedida` añade la referencia también en mm.
- Modify: `src/components/PatternEditor/cotas/CotaChip.tsx`:
  - llama a los dos avisos;
  - enseña la referencia en mm;
  - un grupo de `borde` se coloca por fuera, como un chip suelto.
- Modify: `src/components/PatternEditor/cotas/CotaLines.tsx`: sin hilo para `profundidad`.
- Modify: `src/components/PatternEditor/cotas/sujeto.ts`: `loQueSePone` va primero.
- Modify: `src/components/PatternEditor/fraseDeLaFase.ts`: la frase de lo que se pone.
- Test: `src/components/PatternEditor/cotas/__tests__/CotaChip.loQueSePone.test.tsx` (nuevo), `parseMedida.test.ts`, `sujeto.test.ts`, `src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts`.

**Interfaces:**
- Produces:
  - `Cota.alEscribir?(valueMm: number | null): void`
  - `Cota.alCerrar?(): void`
  - `Cota['kind']` incluye `'profundidad'`
  - `CotaUpdate` incluye `{ kind: 'piquete'; distanciaMm: number; profundidadMm: number }` y `{ kind: 'punto'; distanciaMm: number }`
  - `SujetoInput.loQueSePone?: readonly Cota[] | null`
  - `FaseDeLaHerramienta.loQueSePone?: boolean`
  - `LO_QUE_SE_PONE` (frase exportada)

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/PatternEditor/cotas/__tests__/CotaChip.loQueSePone.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CotaChip, { AgruparCotas } from '../CotaChip';
import { COTA_OFFSET_PX } from '../cotasGeometry';
import type { Cota } from '../cotas';

/**
 * La cota de lo que se pone (spec 2026-10-02 § 5.2): el chip avisa cada tecla
 * —el lienzo enseña dónde quedará— y avisa una sola vez cuando la edición se
 * cierra, por Enter, Esc, Tab al salir o el blur del siguiente clic.
 */
afterEach(cleanup);

const distancia = (over: Partial<Cota> = {}): Cota => ({
  id: 'piquete-distancia', grupo: 'piquete', kind: 'borde', label: 'Distancia', valueMm: 60, unit: 'mm',
  min: 0, max: 1000, referenceLabel: 'de 300 mm', primary: true, scrub: false,
  a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});
const profundidad = (over: Partial<Cota> = {}): Cota => ({
  id: 'piquete-profundidad', grupo: 'piquete', kind: 'profundidad', label: 'Profundidad', valueMm: 8, unit: 'mm',
  min: 1, max: 30, primary: true, scrub: false,
  a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});

function monta(cotas: Cota[], onCommit = vi.fn()) {
  const noop = { onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(), onScrubCancel: vi.fn() };
  render(
    <AgruparCotas cotas={cotas} pan2D={{ x: 0, y: 0 }} zoom2D={1}>
      <div className="cotas">
        {cotas.map(c => <CotaChip key={c.id} cota={c} left={0} top={0} zoom2D={1} onCommit={onCommit} {...noop} />)}
      </div>
    </AgruparCotas>,
  );
  return onCommit;
}
const abre = () => fireEvent.click(screen.getByRole('button'));
const campo = (nombre: string) => screen.getByRole('textbox', { name: nombre }) as HTMLInputElement;

describe('la cota de lo que se pone', () => {
  it('cada tecla válida llega a alEscribir; una inválida o fuera de rango lo limpia con null', () => {
    const alEscribir = vi.fn();
    monta([distancia({ alEscribir }), profundidad()]);
    abre();
    fireEvent.change(campo('Distancia'), { target: { value: '120' } });
    fireEvent.change(campo('Distancia'), { target: { value: '120,5' } });
    fireEvent.change(campo('Distancia'), { target: { value: 'x' } });
    fireEvent.change(campo('Distancia'), { target: { value: '5000' } });
    expect(alEscribir.mock.calls.map(c => c[0])).toEqual([120, 120.5, null, null]);
  });

  it('las flechas también mueven lo que se ve', () => {
    const alEscribir = vi.fn();
    monta([distancia({ alEscribir }), profundidad()]);
    abre();
    fireEvent.keyDown(campo('Distancia'), { key: 'ArrowUp' });
    expect(alEscribir).toHaveBeenLastCalledWith(61);
  });

  it.each([['Enter'], ['Escape']])('%s cierra la edición y avisa una sola vez', (key) => {
    const alCerrar = vi.fn();
    monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.keyDown(campo('Distancia'), { key });
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('el blur del siguiente clic también la cierra', () => {
    const alCerrar = vi.fn();
    monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.blur(campo('Distancia'));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('Tab entre los dos campos no cierra: confirma la distancia y pasa a la profundidad', () => {
    const alCerrar = vi.fn();
    const onCommit = monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.change(campo('Distancia'), { target: { value: '90' } });
    fireEvent.keyDown(campo('Distancia'), { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'piquete-distancia' }), 90, 'tab');
    expect(alCerrar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(campo('Profundidad'));
  });

  it('junto a la distancia se lee cuánto mide el lado, en reposo y al escribir', () => {
    monta([distancia(), profundidad()]);
    expect(screen.getByRole('button').textContent).toBe('60 mm de 300 mm · 8 mm');
    abre();
    expect(campo('Distancia').closest('label')!.textContent).toContain('mm de 300 mm');
  });

  it('el grupo de un borde va por fuera de la pieza, como un chip suelto', () => {
    monta([distancia(), profundidad()]);
    // Punto medio (30, 0) más `outward` (0, −1) por el aire calibrado.
    expect(screen.getByRole('button').style.top).toBe(`${-COTA_OFFSET_PX}px`);
  });
});
```

En `src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts`, al final:

```ts
describe('formatMedida con referencia en mm (P3b)', () => {
  it('la referencia acompaña también a una distancia: «de 520 mm»', () => {
    expect(formatMedida(156, 'mm', 'de 520 mm')).toBe('156 mm de 520 mm');
    expect(formatMedida(156, 'mm')).toBe('156 mm');
  });
});
```

(si el archivo no importa `formatMedida`, añadirlo al import de `../parseMedida`).

En `src/components/PatternEditor/cotas/__tests__/sujeto.test.ts`, dentro del `describe('cotasDelSujeto'`:

```ts
  it('lo que se pone gana a todo: es lo más reciente (spec 2026-10-02 § 5.2)', () => {
    const puesta = { id: 'piquete-distancia', kind: 'borde', label: 'Distancia', valueMm: 60, unit: 'mm', min: 0, max: 400,
      primary: true, a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null } as const;
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['a'], loQueSePone: [puesta] });
    expect(s.cotas).toEqual([puesta]);
    expect(s.esPieza).toBe(false);
    expect(s.disabled).toBe(false);
  });
```

En `src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts`:
- añadir `[{ activeTool: 'notch', loQueSePone: true }, 55]` a `PRESUPUESTO`;
- añadir `{ activeTool: 'notch', loQueSePone: true }` a `TODAS`;
- añadir:

```ts
describe('la cota de lo que se pone (spec 2026-10-02 § 5.2)', () => {
  it('con la cota abierta, la frase dice cómo terminar de ponerlo, con cualquier herramienta', () => {
    for (const activeTool of ['notch', 'point', 'select'] as const) {
      expect(fraseDeLaFase({ ...base, activeTool, loQueSePone: true })).toBe(LO_QUE_SE_PONE);
    }
    expect(LO_QUE_SE_PONE).toBe('Escribe la distancia · Enter fija · Esc no lo mueve');
  });
});
```

(importar `LO_QUE_SE_PONE` de `../fraseDeLaFase`).

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/cotas/__tests__/CotaChip.loQueSePone.test.tsx src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.test.ts src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts`
Expected: FAIL. `alEscribir`/`alCerrar` no se llaman, «60 mm · 8 mm» no lleva «de 300 mm», el grupo queda en `top: 0px`, `loQueSePone` se ignora y `LO_QUE_SE_PONE` no existe.

- [ ] **Step 3: Implementar**

`cotas.ts`. En `Cota`, después de `scrub?`:

```ts
  /**
   * Lo que se pone (spec 2026-10-02 § 5.2): el piquete y el punto recién
   * puestos —y el piquete de «Ajustar distancia…»— enseñan su cota abierta.
   * Cada tecla llega aquí con el número, o `null` si el borrador no vale,
   * para que el lienzo enseñe dónde quedará antes de Enter, como el modal.
   */
  alEscribir?(valueMm: number | null): void;
  /**
   * La edición se cerró: Enter, Esc, Tab al salir del último campo o el blur
   * del siguiente clic. La cota de lo que se pone vive lo que dura su
   * edición. En un grupo lo lleva la primera cota, que es la que monta el chip.
   */
  alCerrar?(): void;
```

`kind`: `'ancho' | 'alto' | 'tramo-largo' | 'tramo-angulo' | 'borde' | 'margen' | 'profundidad'`.

`CotaUpdate`, al final de la unión:

```ts
  /**
   * El piquete con su cota abierta (spec 2026-10-02 § 5.2). Lo escribe
   * `useNotchTool.confirmRefine`, que ya regenera el path desde el ancla; la
   * distancia y la profundidad viajan juntas porque el path sale de las dos.
   */
  | { kind: 'piquete'; distanciaMm: number; profundidadMm: number }
  /** El punto recién puesto: moverlo es volver a ponerlo, y eso lo hace `usePointTool`. */
  | { kind: 'punto'; distanciaMm: number };
```

`parseMedida.ts`, en `formatMedida`:

```ts
  const referencia = referenceLabel ? ` ${referenceLabel}` : '';
  return unit === 'deg' ? `${texto}°${referencia}` : `${texto} mm${referencia}`;
```

`CotaChip.tsx`:
- `referenciaVisible` deja de mirar la unidad: `cota.referenceLabel ? ' ' + cota.referenceLabel : ''`. Antes, `grep -rn "referenceLabel:" src` para confirmar que ninguna cota en mm la trae hoy.
- En el campo suelto con referencia: `<span>{(cota.unit === 'mm' ? ' mm' : '°') + referenciaVisible(cota)}</span>`.
- En el agrupado: `<span>{(campo.unit === 'mm' ? 'mm' : '°') + referenciaVisible(campo)}</span>`.
- `onChange` del input:

```tsx
        onChange={(e) => {
          setDraft(e.target.value); setDirty(true); setInvalid(false);
          const v = parseMedida(e.target.value);
          campo.alEscribir?.(v !== null && v >= campo.min && v <= campo.max ? v : null);
        }}
```

- En la rama de las flechas:

```tsx
            const nuevo = acota(base + paso, campoActivo);
            setDraft(aTexto(nuevo));
            setDirty(true);
            setInvalid(false);
            campoActivo.alEscribir?.(nuevo);
```

- `cerrar`:

```tsx
  const cerrar = (foco: 'boton' | 'siguiente' | 'anterior' | null) => {
    cerrado.current = true;
    focoAlCerrar.current = foco;
    setEditing(false);
    cota.alCerrar?.();
  };
```

- `AgruparCotas`: `...(campos.length > 1 && cota.kind !== 'borde' ? { …punto medio… } : chipScreenPosition(cota, pan2D, zoom2D))`, con una línea de comentario: la distancia sobre un borde vive fuera de la pieza, como su chip suelto, y el par del tramo se queda en su punto medio.

`CotaLines.tsx`: en el filtro, `&& c.kind !== 'profundidad'`. Comentario: la profundidad no tiene hilo; se mide hacia dentro del piquete.

`sujeto.ts`. En `SujetoInput`:

```ts
  /**
   * La cota de lo que se pone (spec 2026-10-02 § 5.2): el piquete o el punto
   * que se está terminando de poner. Vive en el estado local de su
   * herramienta, como el tramo en curso, y llega ya armada.
   */
  loQueSePone?: readonly Cota[] | null;
```

Al principio de `cotasDelSujeto`, después de `nada`:

```ts
  // Lo que se está poniendo gana a todo: es lo más reciente, y sus cotas
  // cierran el gesto que lo puso.
  if (input.loQueSePone && input.loQueSePone.length > 0) {
    return {
      piece: null,
      caliente: false,
      cotas: [...input.loQueSePone],
      lectura: null,
      lecturaApagada: false,
      bordeLeido: null,
      disabled: false,
      esPieza: false,
    };
  }
```

`fraseDeLaFase.ts`:

```ts
/** La cota de lo que se pone está abierta (spec 2026-10-02 § 5.2). Cabe en el hueco del piquete (55). */
export const LO_QUE_SE_PONE = 'Escribe la distancia · Enter fija · Esc no lo mueve';
```

En `FaseDeLaHerramienta`: `loQueSePone?: boolean;`, con un comentario de una línea. Primera línea de `fraseDeLaFase`: `if (f.loQueSePone) return LO_QUE_SE_PONE;`.

- [ ] **Step 4: Correrlos y verlos pasar**

Run: el mismo comando del Step 2.
Expected: PASS.

- [ ] **Step 5: Suite entera, lint y commit**

Run: `npx tsc -b --noEmit && npm run test > .superpowers/sdd/p3b-t1.log 2>&1; tail -5 .superpowers/sdd/p3b-t1.log && npm run lint && node scripts/ui-contract-lint.mjs`
Expected: todo en verde.

```bash
git add src/components/PatternEditor/cotas/cotas.ts src/components/PatternEditor/cotas/parseMedida.ts src/components/PatternEditor/cotas/CotaChip.tsx src/components/PatternEditor/cotas/CotaLines.tsx src/components/PatternEditor/cotas/sujeto.ts src/components/PatternEditor/fraseDeLaFase.ts src/components/PatternEditor/cotas/__tests__/CotaChip.loQueSePone.test.tsx src/components/PatternEditor/cotas/__tests__/parseMedida.test.ts src/components/PatternEditor/cotas/__tests__/sujeto.test.ts src/components/PatternEditor/__tests__/fraseDeLaFase.test.ts
git commit -m "feat(cotas): el chip de lo que se pone avisa cada tecla y su cierre, y gana a todo sujeto"
```

---

### Task 2: El piquete sin modal

**Files:**
- Create: `src/components/PatternEditor/cotas/loQueSePone.ts` (`Cuenta`, `largoDelLado`, `cotasDelPiquete`).
- Test: `src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts` (nuevo).
- Modify: `src/components/PatternEditor/useNotchTool.ts`:
  - la sesión guarda ids y se mide en vivo;
  - `confirmRefine` deja la sesión abierta;
  - `previewRefine(null)`;
  - el candado.
- Modify: `src/components/PatternEditor/PatternEditor.tsx`:
  - `loQueSePone`, el efecto que abre el chip y la rama `piquete` de `aplicarCota`;
  - la frase;
  - fuera el modal, el `inerte` y el import muerto de `DEFAULT_NOTCH_OPTIONS`.
- Modify: `src/components/PatternEditor/actionCuration.ts`: «Ajustar distancia…» con `notLocked`.
- Modify: `src/components/PatternEditor/renderers/overlays/NotchToolOverlay.tsx`: fuera la línea punteada.
- Modify: `src/components/PatternEditor/SeccionDelPatron.tsx`: fuera `inerte`.
- Modify: comentarios de `src/shortcuts/ShortcutProvider.tsx:84-94` y `src/utils/superficieModal.ts:15-18`.
- Delete:
  - `src/components/PatternEditor/NotchPrecisionModal.tsx`;
  - `src/components/PatternEditor/NotchPrecisionModal.css`;
  - `src/components/PatternEditor/__tests__/NotchPrecisionModal.test.tsx`;
  - `src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx`.
- Modify tests:
  - `useNotchTool.toolOptions.test.ts`;
  - `1124-el-piquete-no-confirma-un-numero-falso.test.tsx`;
  - `PatternEditor.notchExactDistance.test.tsx`;
  - `actionCuration.notchExactDistance.test.ts`;
  - `src/shortcuts/__tests__/1173-un-modal-retira-los-atajos.test.tsx`;
  - `src/styles/__tests__/zIndexScale.test.ts`;
  - `tests/repo/lo-que-flota-es-papel.test.ts`;
  - `tests/repo/superficies-declaradas.test.ts`.

**Interfaces:**
- Consumes (Task 1): `Cota.alEscribir`, `Cota.alCerrar`, `CotaUpdate` `piquete`, `SujetoInput.loQueSePone`, `FaseDeLaHerramienta.loQueSePone`.
- Produces:
  - `NotchRefineState` gana `sesion: number`, y su `notch` es la línea viva.
  - `previewRefine(distanceMm: number | null)`
  - `confirmRefine(distanceMm: number, depthMm: number)`: escribe y deja la sesión abierta.
  - `cancelRefine()` cierra la sesión.
  - `Cuenta = { refPoint: Point2D; direction: 'cw' | 'ccw' }`
  - `largoDelLado(outline: PathCommand[], cuenta: Cuenta): number | null`
  - `cotasDelPiquete(r: NotchRefineState, piece: PatternPiece, enVivo: { alEscribir(mm: number | null): void; alCerrar(): void }): Cota[]`

- [ ] **Step 1: Los tests de `loQueSePone.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { largoDelLado, cotasDelPiquete } from '../loQueSePone';
import type { NotchRefineState } from '../../useNotchTool';
import type { PathCommand, PatternPiece } from '../../../../types/types';

/** La cota del piquete recién puesto (spec 2026-10-02 § 5.2): dos campos, un grupo, por fuera del borde. */
const rect: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
  { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const pieza: PatternPiece = {
  id: 'p', name: 'p', outline: rect, internals: [], position: { x: 10, y: 20 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
};
const refinando = (over: Partial<NotchRefineState> = {}): NotchRefineState => ({
  pieceId: 'p',
  notch: {
    id: 'n', type: 'notch', path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
    notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 60, metric: 2 },
    notchOptions: { shape: 'slit', length: 8, width: 3, angle: 0, count: 1 },
  },
  source: 'placement', refWorld: { x: 10, y: 20 }, notchWorld: { x: 70, y: 20 },
  maxDistanceMm: 1000, previewWorld: null, sesion: 1, ...over,
});

describe('largoDelLado', () => {
  it('de la esquina de referencia a la siguiente, en el sentido de la cuenta', () => {
    expect(largoDelLado(rect, { refPoint: { x: 0, y: 0 }, direction: 'cw' })).toBeCloseTo(300, 6);
    expect(largoDelLado(rect, { refPoint: { x: 0, y: 0 }, direction: 'ccw' })).toBeCloseTo(200, 6);
  });
  it('sin otra esquina, el perímetro', () => {
    const circulo: PathCommand[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      circulo.push({ type: i === 0 ? 'M' : 'L', values: [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] });
    }
    circulo.push({ type: 'Z', values: [] });
    const lado = 2 * 50 * Math.sin(Math.PI / 36);
    expect(largoDelLado(circulo, { refPoint: { x: 100, y: 50 }, direction: 'cw' })).toBeCloseTo(36 * lado, 3);
  });
});

describe('cotasDelPiquete', () => {
  const enVivo = () => ({ alEscribir: vi.fn(), alCerrar: vi.fn() });

  it('dos campos en un grupo: Distancia, con el largo del lado, y Profundidad de 1 a 30', () => {
    const cotas = cotasDelPiquete(refinando(), pieza, enVivo());
    expect(cotas.map(c => [c.label, c.valueMm, c.min, c.max, c.unit])).toEqual([
      ['Distancia', 60, 0, 1000, 'mm'],
      ['Profundidad', 8, 1, 30, 'mm'],
    ]);
    expect(cotas[0].referenceLabel).toBe('de 300 mm');
    expect(cotas.map(c => c.grupo)).toEqual(['piquete', 'piquete']);
    expect(cotas.map(c => c.kind)).toEqual(['borde', 'profundidad']);
    expect(cotas.every(c => c.scrub === false)).toBe(true);
  });

  it('cada campo escribe con el valor de ahora del otro', () => {
    const [d, p] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect(d.apply(90)).toEqual({ kind: 'piquete', distanciaMm: 90, profundidadMm: 8 });
    expect(p.apply(12)).toEqual({ kind: 'piquete', distanciaMm: 60, profundidadMm: 12 });
  });

  it('el hilo va de la esquina al piquete, o al fantasma mientras se escribe, y por fuera de la pieza', () => {
    const [d] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect([d.a, d.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(d.outward.y).toBeLessThan(0);
    const [conFantasma] = cotasDelPiquete(refinando({ previewWorld: { x: 110, y: 20 } }), pieza, enVivo());
    expect(conFantasma.b).toEqual({ x: 110, y: 20 });
  });

  it('solo la distancia mueve el fantasma; el cierre lo lleva la primera, que es la que monta el chip', () => {
    const v = enVivo();
    const [d, p] = cotasDelPiquete(refinando(), pieza, v);
    expect(d.alEscribir).toBe(v.alEscribir);
    expect(d.alCerrar).toBe(v.alCerrar);
    expect(p.alEscribir).toBeUndefined();
    expect(p.alCerrar).toBeUndefined();
  });

  it('sin ancla no hay cota', () => {
    const r = refinando();
    expect(cotasDelPiquete({ ...r, notch: { ...r.notch, notchAnchor: undefined } }, pieza, enVivo())).toEqual([]);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts`
Expected: FAIL; el módulo no existe, y `NotchRefineState` no tiene `sesion`.

- [ ] **Step 3: Escribir `loQueSePone.ts`**

```ts
import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { buildRing, projectToRing } from '../../../utils/geometry/outlineRing';
import { computeBoundingBox, bboxPivot } from '../../../utils/geometry/transform';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { detectCorners } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { NotchRefineState } from '../useNotchTool';
import { normalHaciaFuera, type Cota } from './cotas';
import { formatMedida } from './parseMedida';

/**
 * La cota de lo que se pone (spec 2026-10-02 § 5.2): el piquete y el punto,
 * al ponerse, enseñan la distancia a la esquina sobre el borde y se terminan
 * de poner ahí mismo. Sustituye al modal del piquete.
 */

/** Desde qué esquina y hacia dónde se cuenta: lo que guarda un `notchAnchor`. */
export interface Cuenta {
  refPoint: Point2D;
  direction: 'cw' | 'ccw';
}

/**
 * Cuánto mide el lado sobre el que se cuenta: de la esquina de referencia a la
 * siguiente, en el sentido de la cuenta. Es el «de 520 mm» que se lee junto
 * al número. `null` sin anillo o con varios subtrazos; sin otra esquina, el
 * perímetro.
 */
export function largoDelLado(outline: PathCommand[], cuenta: Cuenta): number | null {
  const built = buildRing(outline, 2);
  if (!built.ok || built.value.subpathCount > 1) return null;
  const ring = built.value;
  const total = ring.totalMm;
  if (total < 1e-9) return null;
  const desde = projectToRing(ring, cuenta.refPoint).distanceMm;
  const tramos = detectCorners(outline)
    .map(esquina => {
      const s = projectToRing(ring, esquina).distanceMm;
      const d = cuenta.direction === 'cw' ? s - desde : desde - s;
      return ((d % total) + total) % total;
    })
    .filter(d => d > 1e-6);
  return tramos.length > 0 ? Math.min(...tramos) : total;
}

/** El centro de la caja de la pieza, para saber cuál es su lado de fuera (como `cotasDelLado`). */
export function centroDe(piece: PatternPiece): Point2D {
  const bbox = computeBoundingBox([piece], [piece.id]);
  return bbox ? bboxPivot(bbox) : pieceLocalToPattern({ x: 0, y: 0 }, piece);
}

/**
 * El piquete recién puesto, o el de «Ajustar distancia…»: Distancia y
 * Profundidad en un solo chip. La distancia mueve el fantasma con cada tecla;
 * la profundidad se queda aquí hasta que P3c le dé su etiqueta, porque hoy es
 * su única puerta para un piquete ya puesto. Cada campo escribe con el valor
 * de ahora del otro: el path sale de los dos.
 */
export function cotasDelPiquete(
  r: NotchRefineState,
  piece: PatternPiece,
  enVivo: { alEscribir(mm: number | null): void; alCerrar(): void },
): Cota[] {
  const anchor = r.notch.notchAnchor;
  if (!anchor) return [];
  const profundidad = r.notch.notchOptions?.length ?? DEFAULT_NOTCH_OPTIONS.length;
  const lado = largoDelLado(piece.outline, anchor);
  const b = r.previewWorld ?? r.notchWorld;
  const comun = {
    grupo: 'piquete',
    primary: true,
    scrub: false,
    a: r.refWorld,
    b,
    outward: normalHaciaFuera(r.refWorld, b, centroDe(piece)),
  };
  return [
    {
      ...comun,
      id: 'piquete-distancia',
      kind: 'borde',
      label: 'Distancia',
      valueMm: anchor.distanceMm,
      unit: 'mm',
      min: 0,
      // El perímetro, medido del contorno vivo (#1124): más allá envolvería.
      max: r.maxDistanceMm,
      ...(lado !== null ? { referenceLabel: `de ${formatMedida(lado, 'mm')}` } : {}),
      alEscribir: enVivo.alEscribir,
      alCerrar: enVivo.alCerrar,
      apply: (mm) => ({ kind: 'piquete', distanciaMm: mm, profundidadMm: profundidad }),
    },
    {
      ...comun,
      id: 'piquete-profundidad',
      kind: 'profundidad',
      label: 'Profundidad',
      valueMm: profundidad,
      unit: 'mm',
      // Los de § 5.2: los del panel de hoy, para que ningún valor guardado quede fuera.
      min: 1,
      max: 30,
      apply: (mm) => ({ kind: 'piquete', distanciaMm: anchor.distanceMm, profundidadMm: mm }),
    },
  ];
}
```

- [ ] **Step 4: La sesión de `useNotchTool`. Primero, los tests que cambian**

En `useNotchTool.toolOptions.test.ts`, `describe('useNotchTool — click-then-refine …')`:
- **'click commits the notch AND opens refine state pre-filled with the anchor'**:
  - `syncCommittedNotch(h)` antes de leer `refining`;
  - el mismo `expect` de `maxDistanceMm` (400);
  - además, `expect(h.result.current.refining!.sesion).toBeGreaterThan(0)`.
- **'confirmRefine re-positions the notch exactly: new distance + new depth'**:
  - el último `expect` pasa a `expect(h.result.current.refining).not.toBeNull()`;
  - y `expect(h.result.current.refining!.previewWorld ?? null).toBeNull()`, con el comentario: la sesión sigue, porque Tab pasa a la profundidad y la cierra el chip.
- **'confirm after the committed line vanished (undo) RE-CREATES …'** se reescribe:

```ts
  it('la cota muere con su piquete: sin la línea, confirmar no escribe ni lo vuelve a poner', () => {
    // El modal se quedaba abierto mientras un Ctrl+Z borraba la línea y por
    // eso la volvía a poner. La cota no descansa abierta: dentro del campo,
    // el Ctrl+Z es del campo, y una cota sin objeto no escribe (aplicarCota).
    const h = setup(); // la pieza nunca recibe el piquete: la forma de «la línea se fue»
    act(() => { h.result.current.confirmRefine(42, 10); });
    expect(h.onUpdateNotch).not.toHaveBeenCalled();
    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    expect(h.result.current.refining).toBeNull();
  });
```

- **'previewRefine exposes …'**: `syncCommittedNotch(h)` primero. Al final, el fantasma se borra:

```ts
    act(() => { h.result.current.previewRefine(null); });
    expect(h.result.current.refining!.previewWorld ?? null).toBeNull();
```

- **'leaving the notch tool cancels the refine state …'**: `syncCommittedNotch(h)` antes del primer `expect`.
- Nuevo test, en su propio `describe`:

```ts
describe('useNotchTool — la pieza bloqueada (maria-204)', () => {
  it('no recibe piquetes, ni por clic ni por arrastre, y no abre cota', () => {
    const store = configureStore({ reducer: { tools: toolReducer } });
    const onAddNotch = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(Provider, { store, children });
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, [{ ...makeSquare(), locked: true }], onAddNotch),
      { wrapper },
    );
    act(() => { result.current.handleMouseDown(fakeEvent(30, 0)); });
    act(() => { result.current.handleMouseUp(fakeEvent(30, 0)); });
    expect(onAddNotch).not.toHaveBeenCalled();
    expect(result.current.refining).toBeNull();
  });
});
```

En `1124-el-piquete-no-confirma-un-numero-falso.test.tsx`, el título 'recalcula el techo cuando el contorno encoge con el modal abierto' pasa a '… con la cota abierta'. Lo demás no cambia: el techo y el ancla se miden igual.

En `actionCuration.notchExactDistance.test.ts`, un caso más, con el molde del primero y `piece: { …, locked: true }`: «no se ofrece sobre una pieza bloqueada».

`PatternEditor.notchExactDistance.test.tsx`. Se reescribe el `it`, con el mismo montaje:

```tsx
  it('«Ajustar distancia…» abre la cota del piquete, lista para teclear', () => {
    const { store, view } = montar();
    const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
    fireEvent.contextMenu(svg, { clientX: 42, clientY: 4 });
    fireEvent.click(screen.getByRole('button', { name: /Ajustar distancia/ }));

    const distancia = screen.getByRole('textbox', { name: 'Distancia' }) as HTMLInputElement;
    expect(distancia.value).toBe('42');
    expect(document.activeElement).toBe(distancia);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.container.querySelector('.notch-refine-marker')).not.toBeNull();

    // Enter con otra distancia mueve el piquete y cierra la cota.
    fireEvent.change(distancia, { target: { value: '60' } });
    fireEvent.keyDown(distancia, { key: 'Enter' });
    const linea = store.getState().project.pieces[0].internals[0];
    expect(linea.notchAnchor?.distanceMm).toBeCloseTo(60, 6);
    expect(linea.path[0].values[0]).toBeCloseTo(60, 6);
    expect(screen.queryByRole('textbox', { name: 'Distancia' })).toBeNull();
    expect(view.container.querySelector('.notch-refine-marker')).toBeNull();
  });
```

El montaje (`configureStore` + `loadProject` + `render`) se saca a una función `montar()` que devuelve `{ store, view }`.

`src/shortcuts/__tests__/1173-un-modal-retira-los-atajos.test.tsx`. El caso 'CONTROL: el panel del piquete NO es modal, y el lienzo sigue vivo detrás' se reescribe contra el chip:
- se monta el grupo Distancia · Profundidad con el arnés de `CotaChip.loQueSePone.test.tsx`, se abre, y el atajo de control del caso sigue disparando;
- el chip no lleva `aria-modal`.

Fuera el import del modal. El primer caso, el del diálogo no modal de prueba, no cambia.

`src/styles/__tests__/zIndexScale.test.ts:100`, `tests/repo/lo-que-flota-es-papel.test.ts:55,89` y `tests/repo/superficies-declaradas.test.ts:57`: fuera las entradas de `NotchPrecisionModal`.

Borrar `__tests__/NotchPrecisionModal.test.tsx` y `__tests__/1125-pie-inerte-tras-el-modal.test.tsx`. El chip no atrapa el foco, y desde él el Tab va a la línea al pie a propósito (`CotaChip.tsx:157-165`). Lo que sobrevive del test del modal ya está en los de `CotaChip`:
- campo vacío = inválido;
- fuera de rango = inválido;
- vista previa solo con un valor válido;
- Esc y Enter no salen del campo.

- [ ] **Step 5: Correrlos y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/useNotchTool.toolOptions.test.ts src/components/PatternEditor/__tests__/1124-el-piquete-no-confirma-un-numero-falso.test.tsx src/components/PatternEditor/__tests__/PatternEditor.notchExactDistance.test.tsx src/components/PatternEditor/__tests__/actionCuration.notchExactDistance.test.ts src/shortcuts/__tests__/1173-un-modal-retira-los-atajos.test.tsx src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts`
Expected: FAIL:
- `sesion` no existe;
- `confirmRefine` cierra la sesión y vuelve a poner la línea;
- `previewRefine(null)` no es válido;
- el piquete entra en la pieza bloqueada;
- «Ajustar distancia…» abre el diálogo y no el chip.

- [ ] **Step 6: Implementar `useNotchTool`**

- `NotchRefineState`:
  - `notch` documentado como la línea viva;
  - `+ sesion: number` («cuenta las sesiones: el chip se abre una vez por sesión, no por render»).
- `RefineGuardado` deja de ser `Omit<…>`:

```ts
/**
 * Lo que de verdad se guarda: qué piquete y desde cuándo. Todo lo demás —el
 * ancla, la esquina, el piquete, el techo— se mide del contorno vivo en cada
 * render (#1124): que el tipo no lo admita es lo que impide fotografiarlo.
 */
interface RefineGuardado {
  pieceId: string;
  lineId: string;
  source: 'placement' | 'existing';
  previewWorld?: Point2D | null;
  sesion: number;
}
```

- `const sesiones = useRef(0);`, junto a `refining`.
- `const dispatch = useDispatch();`, más los imports `useDispatch` y `showInfoToast` (el mismo origen que en `useEditPattern.ts`).
- Al principio de `onCommit`, después de `if (!piece) return;`:

```ts
    if (piece.locked) {
      // El candado (maria-204) vale para todo lo que edita la pieza: Punto ya
      // lo respetaba y Piquete escribía. Mismo aviso que los demás verbos.
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return;
    }
```

- En la rama del clic: `setRefining({ pieceId: piece.id, lineId: notch.id, source: 'placement', sesion: ++sesiones.current })`.
- En `refineExisting` (después de comprobar que resuelve): `setRefining({ pieceId, lineId: liveLine.id, source: 'existing', sesion: ++sesiones.current })`.
- `confirmRefine`:

```ts
  /** Escribe la distancia y la profundidad. La sesión sigue: Tab pasa a la profundidad, y la cierra el chip. */
  const confirmRefine = useCallback((distanceMm: number, depthMm: number) => {
    if (!refining) return;
    const piece = pieces.find(p => p.id === refining.pieceId);
    const liveLine = piece?.internals.find(l => l.id === refining.lineId);
    // La cota muere con su piquete, como toda cota (`aplicarCota`): un deshacer
    // que se lo llevó no se contesta volviéndolo a poner.
    if (!piece || liveLine?.type !== 'notch' || !liveLine.notchAnchor) { setRefining(null); return; }
    const resolved = resolveNotchAnchor(piece.outline, { ...liveLine.notchAnchor, distanceMm });
    if (!resolved) {
      // Si el contorno cambió bajo la cota, el refPoint ya no cae sobre él:
      // confirmar que no coloca tiene que decirlo (#1124, hermano).
      noPasoNada('notch:ancla-perdida', { pieceId: piece.id, notchId: liveLine.id });
      setRefining(null);
      return;
    }
    // La distancia que se PERSISTE es la que el anillo usó de verdad (#1124):
    // el aviso lee este mismo campo.
    const editedAnchor = { ...liveLine.notchAnchor, distanceMm: resolved.distanceMm };
    const opts: NotchOptions = { ...(liveLine.notchOptions ?? effectiveOptions), length: depthMm };
    onUpdateNotch?.(piece.id, liveLine.id, generateNotchPath(resolved.point, resolved.normal, opts), editedAnchor, opts);
    setRefining(prev => (prev ? { ...prev, previewWorld: null } : prev));
  }, [refining, pieces, effectiveOptions, onUpdateNotch]);
```

- `previewRefine`:

```ts
  /** Dónde quedará con lo que se está tecleando; `null` borra el fantasma. */
  const previewRefine = useCallback((distanceMm: number | null) => {
    setRefining(prev => {
      if (!prev) return prev;
      if (distanceMm === null) return { ...prev, previewWorld: null };
      const piece = pieces.find(p => p.id === prev.pieceId);
      const line = piece?.internals.find(l => l.id === prev.lineId);
      if (!piece || !line?.notchAnchor) return prev;
      const resolved = resolveNotchAnchor(piece.outline, { ...line.notchAnchor, distanceMm });
      return { ...prev, previewWorld: resolved ? pieceLocalToPattern(resolved.point, piece) : null };
    });
  }, [pieces]);
```

- `refiningConTecho` se rehace sobre la línea viva:

```ts
  const refiningConTecho = useMemo<NotchRefineState | null>(() => {
    if (!refining) return null;
    const piece = pieces.find(p => p.id === refining.pieceId);
    const notch = piece?.internals.find(l => l.id === refining.lineId);
    if (!piece || notch?.type !== 'notch' || !notch.notchAnchor) return null;
    const resolved = resolveNotchAnchor(piece.outline, notch.notchAnchor);
    if (!resolved) return null;
    return {
      pieceId: piece.id,
      notch,
      source: refining.source,
      sesion: refining.sesion,
      previewWorld: refining.previewWorld,
      refWorld: pieceLocalToPattern(notch.notchAnchor.refPoint, piece),
      notchWorld: pieceLocalToPattern(resolved.point, piece),
      maxDistanceMm: outlinePerimeter(piece.outline, notch.notchAnchor.metric ?? 1),
    };
  }, [refining, pieces]);
```

  Se quitan los comentarios y JSDoc que hablan del «modal», y los que siguen se reescriben con la cota.

- [ ] **Step 7: Conectar `PatternEditor`**

- Imports: `cotasDelPiquete` de `./cotas/loQueSePone`. Fuera `NotchPrecisionModal` y, si queda sin uso, `DEFAULT_NOTCH_OPTIONS`.
- Justo antes de `sujetoSinLado`:

```ts
  // La cota de lo que se pone (spec 2026-10-02 § 5.2): el piquete recién puesto,
  // o el de «Ajustar distancia…», con su chip abierto. Las herramientas viven
  // en refs para que `aplicarCota` y las cotas no se rehagan en cada render.
  const notchRef = useRef(notchTool);
  notchRef.current = notchTool;
  const piquetePuesto = notchTool.refining;
  const piezaDelPiquete = piquetePuesto ? pieces.find(p => p.id === piquetePuesto.pieceId) : undefined;
  const loQueSePone = useMemo(() => {
    if (piquetePuesto && piezaDelPiquete) {
      return cotasDelPiquete(piquetePuesto, piezaDelPiquete, {
        alEscribir: (mm) => notchRef.current.previewRefine(mm),
        alCerrar: () => notchRef.current.cancelRefine(),
      });
    }
    return null;
  }, [piquetePuesto, piezaDelPiquete]);
```

- `cotasDelSujeto({ …, loQueSePone })`, y `loQueSePone` va en sus dependencias.
- Junto al efecto del tramo congelado:

```ts
  // La cota de lo que se pone se abre sola, una vez por sesión: el clic que
  // puso el piquete deja el número listo para teclear, como lo dejaba el modal.
  const claveDeLoQueSePone = piquetePuesto ? `piquete:${piquetePuesto.sesion}` : '';
  const loQueSePoneVisto = useRef('');
  useEffect(() => {
    if (loQueSePoneVisto.current === claveDeLoQueSePone) return;
    loQueSePoneVisto.current = claveDeLoQueSePone;
    if (!claveDeLoQueSePone) return;
    const abrio = cotasRef.current?.abrirPrimero() ?? false;
    pushJournal('gesture', 'cota:loQueSePone', { clave: claveDeLoQueSePone, abrio });
    // Sin chip, la sesión no tendría quien la cerrara.
    if (!abrio) notchRef.current.cancelRefine();
  }, [claveDeLoQueSePone]);
```

- `aplicarCota`, antes de la rama `nodo`:

```ts
    } else if (update.kind === 'piquete') {
      // Lo escribe la herramienta, que sabe regenerar el path desde el ancla.
      notchRef.current.confirmRefine(update.distanciaMm, update.profundidadMm);
```

- `fraseDeLaFase({ …, loQueSePone: loQueSePone !== null })`.
- Fuera `inerte={…}` de `<SeccionDelPatron>`, con su comentario, y fuera el montaje de `<NotchPrecisionModal>`.

- [ ] **Step 8: El resto de lo que se va**

- `actionCuration.ts:317`: `gate: (ctx) => ctx.internalLine?.type === 'notch' && !!ctx.internalLine.notchAnchor && notLocked(ctx),`.
- `NotchToolOverlay.tsx`: en `refineMarker` quedan el círculo y el punto de la esquina, y el fantasma (`previewWorld`); la `<line>` punteada se va. Comentarios: «la esquina desde la que cuenta la cota del piquete» y «dónde quedará con lo que se está tecleando». `grep -rn "notch-refine-marker\|strokeDasharray" src/components/PatternEditor/renderers/__tests__`; si algún test mira la línea, se ajusta.
- `SeccionDelPatron.tsx`: fuera la prop `inerte`, su efecto y su dependencia en el `useEffect` del menú «Más».
- `ShortcutProvider.tsx:84-94` y `superficieModal.ts:15-18`: el comentario nombra la cota del piquete, que no es modal, en lugar de `NotchPrecisionModal`.
- `git rm src/components/PatternEditor/NotchPrecisionModal.tsx src/components/PatternEditor/NotchPrecisionModal.css src/components/PatternEditor/__tests__/NotchPrecisionModal.test.tsx src/components/PatternEditor/__tests__/1125-pie-inerte-tras-el-modal.test.tsx`
- `grep -rn "NotchPrecisionModal\|notch-precision-modal\|inerte" src tests/repo`: no queda nada vivo. Los e2e son de la Task 5.

- [ ] **Step 9: Correr los tests de la tarea y verlos pasar**

Run: el mismo comando del Step 5 más `npx vitest run src/components/PatternEditor/__tests__/1061-soltar-lejos-del-borde.test.tsx src/components/PatternEditor/__tests__/useNotchTool.distancia.test.tsx src/components/PatternEditor/__tests__/useNotchTool.refineExisting.test.tsx src/components/PatternEditor/renderers/__tests__`
Expected: PASS. Si 1061 o la distancia leen `refining` sin sincronizar la línea, se sincroniza con su propio patrón: es la forma viva de Redux.

- [ ] **Step 10: Suite entera, lint y commit**

Run: `npx tsc -b --noEmit && npm run test > .superpowers/sdd/p3b-t2.log 2>&1; tail -5 .superpowers/sdd/p3b-t2.log && npm run lint && node scripts/ui-contract-lint.mjs`
Expected: todo en verde. Si un contador baja: `node scripts/ui-contract-lint.mjs --update`, y se commitea el baseline.

```bash
git add src/components/PatternEditor/cotas/loQueSePone.ts src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts src/components/PatternEditor/useNotchTool.ts src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/actionCuration.ts src/components/PatternEditor/renderers/overlays/NotchToolOverlay.tsx src/components/PatternEditor/SeccionDelPatron.tsx src/shortcuts/ShortcutProvider.tsx src/utils/superficieModal.ts src/components/PatternEditor/__tests__/useNotchTool.toolOptions.test.ts src/components/PatternEditor/__tests__/1124-el-piquete-no-confirma-un-numero-falso.test.tsx src/components/PatternEditor/__tests__/PatternEditor.notchExactDistance.test.tsx src/components/PatternEditor/__tests__/actionCuration.notchExactDistance.test.ts src/shortcuts/__tests__/1173-un-modal-retira-los-atajos.test.tsx src/styles/__tests__/zIndexScale.test.ts tests/repo/lo-que-flota-es-papel.test.ts tests/repo/superficies-declaradas.test.ts
git commit -m "feat(piquete): sin modal — la cota del piquete se escribe sobre el borde, con su profundidad"
```

(Los borrados ya van en el índice desde el `git rm` del Step 8.)

---

### Task 3: El punto con su cota

**Files:**
- Modify: `src/components/PatternEditor/useEditPattern.ts`:
  - `addPointOnSegment` acepta un token y devuelve el contorno escrito;
  - verbo nuevo, `reinsertarPunto`.
- Modify: `src/components/PatternEditor/usePointTool.ts`: la sesión `puesto`, con el lote de deshacer, y `moverPuesto`/`terminarPuesto`.
- Modify: `src/components/PatternEditor/cotas/loQueSePone.ts`: `dondeCaeElPunto` y `cotaDelPunto`.
- Modify: `src/components/PatternEditor/noPasoNada.ts`: `'point:sobre-un-punto'`.
- Modify: `src/components/PatternEditor/PatternEditor.tsx`:
  - el verbo pasa a la herramienta;
  - la cota del punto entra en `loQueSePone`;
  - la clave de la sesión;
  - la rama `punto` de `aplicarCota`.
- Test: `src/components/PatternEditor/__tests__/usePointTool.puesto.test.tsx` (nuevo), `loQueSePone.test.ts` y `useEditPattern.test.tsx`.

**Interfaces:**
- Consumes (Tasks 1-2): `Cuenta`, `largoDelLado`, `centroDe`, `CotaUpdate` `punto`, `SujetoInput.loQueSePone`.
- Produces:
  - `addPointOnSegment(commandIndex: number, t: number, pieceId?: string, undoBatchToken?: UndoBatchToken): PathCommand[] | null`
  - `reinsertarPunto(base: PatternPiece, commandIndex: number, t: number, undoBatchToken?: UndoBatchToken): PathCommand[] | null`
  - `PuntoPuesto` (en `usePointTool.ts`)
  - `usePointTool(...)` devuelve también `puesto: PuntoPuesto | null`, `moverPuesto(distanciaMm: number): void` y `terminarPuesto(): void`
  - `dondeCaeElPunto(outline: PathCommand[], cuenta: Cuenta, distanciaMm: number): { commandIndex: number; nativeT: number } | 'sobre-un-punto' | null`
  - `cotaDelPunto(p: PuntoPuesto, viva: PatternPiece, alCerrar: () => void): Cota`

- [ ] **Step 1: Los tests de la geometría**

En `loQueSePone.test.ts`:

```ts
import { dondeCaeElPunto, cotaDelPunto } from '../loQueSePone';
import { splitSegmentAt, getAnchor } from '../../nodeEditorUtils';
import { buildRing, projectToRing } from '../../../../utils/geometry/outlineRing';
import type { PuntoPuesto } from '../../usePointTool';

describe('dondeCaeElPunto', () => {
  const esquina = { x: 0, y: 0 };
  it('en un lado recto, la fracción nativa del comando', () => {
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 120)).toEqual({ commandIndex: 1, nativeT: expect.closeTo(0.4, 9) });
  });
  it('en sentido contrario cuenta hacia atrás, por el cierre', () => {
    // Del (0,0) hacia atrás está el cierre Z, de (0,200) a (0,0): 50 mm antes del final.
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'ccw' }, 50)).toEqual({ commandIndex: 4, nativeT: expect.closeTo(0.75, 9) });
  });
  it('sobre un punto que ya existe no hay sitio nuevo', () => {
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 300)).toBe('sobre-un-punto');
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 0)).toBe('sobre-un-punto');
  });
  it('en una curva, el punto cae a esa distancia medida por el arco, no por el parámetro', () => {
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [40, -60, 160, -60, 200, 0] },
      { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    const donde = dondeCaeElPunto(curva, { refPoint: esquina, direction: 'cw' }, 70);
    if (donde === null || donde === 'sobre-un-punto') throw new Error('sin sitio');
    const partida = splitSegmentAt(curva, donde.commandIndex, donde.nativeT);
    const vertice = getAnchor(partida[donde.commandIndex])!;
    const anillo = buildRing(partida, 2);
    if (!anillo.ok) throw new Error('sin anillo');
    expect(projectToRing(anillo.value, vertice).distanceMm).toBeCloseTo(70, 2);
  });
});

describe('cotaDelPunto', () => {
  const puesto: PuntoPuesto = {
    pieceId: 'p', base: pieza, cuenta: { refPoint: { x: 0, y: 0 }, direction: 'cw' },
    distanciaMm: 60, ladoMm: 300, vertice: { x: 60, y: 0 }, esperado: rect, sesion: 1,
  };
  it('la distancia a la esquina, con el lado de techo y el largo junto al número', () => {
    const alCerrar = vi.fn();
    const c = cotaDelPunto(puesto, pieza, alCerrar);
    expect([c.label, c.valueMm, c.min, c.max, c.referenceLabel]).toEqual(['Distancia', 60, 0, 300, 'de 300 mm']);
    expect([c.a, c.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(c.outward.y).toBeLessThan(0);
    expect(c.alCerrar).toBe(alCerrar);
    expect(c.apply(120)).toEqual({ kind: 'punto', distanciaMm: 120 });
  });
});
```

- [ ] **Step 2: Los tests de la herramienta y del verbo**

Primero se lee `src/components/PatternEditor/__tests__/usePointTool.test.tsx` y se copia su arnés (store con `tools` y `editor`, `fakeEvent`, la pieza cuadrada de 100). A ese store se le añade un middleware que guarda las acciones:

```ts
const acciones: Array<{ type: string; payload?: unknown }> = [];
const captura: Middleware = () => next => action => { acciones.push(action as { type: string }); return next(action); };
```

`verbs` reales sobre la pieza:

```ts
const addPointOnSegment = vi.fn((k: number, t: number) => splitSegmentAt(square.outline, k, t));
const reinsertarPunto = vi.fn((base: PatternPiece, k: number, t: number) => splitSegmentAt(base.outline, k, t));
```

Tests de `src/components/PatternEditor/__tests__/usePointTool.puesto.test.tsx`:

1. **'el clic pone el punto y abre su cota: a la esquina más cercana, con el lado de techo'**
   - Clic en (30, 0).
   - `addPointOnSegment` se llama con `(1, ≈0.3, 'p1', token)`, y el token es un string.
   - Queda `puesto`: `distanciaMm ≈ 30`, `ladoMm 100`, `cuenta.refPoint (0,0)`, `direction 'cw'` y `esperado` = lo devuelto.
2. **'mover es volver a ponerlo desde la pieza de antes, en el mismo lote'**
   - `rerender` con la pieza cuyo `outline` es `puesto.esperado` (la forma viva).
   - `moverPuesto(70)`.
   - `reinsertarPunto` se llama con `(square, 1, ≈0.7, el mismo token)`, `puesto.distanciaMm` pasa a 70 y `puesto.vertice` a (70, 0).
3. **'sobre un punto que ya existe no se mueve y lo dice'**
   - `moverPuesto(100)`.
   - `reinsertarPunto` no se llama, y `noPasoNada` emite `'point:sobre-un-punto'` (`suscribirNoPasoNada`).
4. **'si el contorno vivo ya no es el que se escribió, la cota se va sin escribir'**
   - `rerender` con otro contorno, `moverPuesto(70)`.
   - Nada escrito, `puesto` en `null` y el lote cerrado.
5. **'terminar cierra el lote una sola vez'**
   - `terminarPuesto()`: hay una acción `undo/endBatch` con el token.
   - Un segundo `terminarPuesto()` no añade otra.
6. **'el arrastre también deja su cota'**
   - Press en (30, 0) y release en (60, 0), pasado el umbral, con el patrón de `usePointTool.distancia.test.tsx`.
   - `puesto.distanciaMm ≈ 60`.
7. **'una pieza bloqueada: el verbo avisa, y no hay cota ni lote'**
   - Pieza con `locked: true`.
   - `addPointOnSegment` se llama sin token (cuarto argumento `undefined`), `puesto` es `null` y no hay `undo/beginBatch`.
8. **'curva por puntos y bezier no abren cota'**
   - `setToolOption` a `curvePoints`, clic.
   - `puesto` es `null`.
9. **'salir de Punto cierra la cota'**
   - Con `puesto`, `setActiveTool('select')`.
   - `puesto` es `null` y hay `undo/endBatch`.

En `useEditPattern.test.tsx`, con el arnés de los tests de `addPointOnSegment` (líneas ~544-583):

```ts
  it('reinsertarPunto parte de la pieza de antes: un solo vértice de más, y los bordes reindexados como en una sola inserción', () => {
    // Pieza con `edges` (el borde de arriba es el comando 1).
    // 1) addPointOnSegment(1, 0.3) → la viva tiene 6 comandos.
    // 2) reinsertarPunto(base, 1, 0.7) → la viva sigue con 6, con el vértice nuevo en x=70 y sin el de x=30,
    //    y sus `edges` iguales a los de reindexEdges(base.edges, base.outline, splitSegmentAt(base.outline, 1, 0.7)).
  });
```

El cuerpo se escribe con el arnés real de ese archivo: la tienda, `renderHook` y `getState`.

- [ ] **Step 3: Correrlos y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/usePointTool.puesto.test.tsx src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts src/components/PatternEditor/__tests__/useEditPattern.test.tsx`
Expected: FAIL: `dondeCaeElPunto`, `cotaDelPunto`, `puesto`, `reinsertarPunto` y la razón nueva no existen.

- [ ] **Step 4: Implementar**

`noPasoNada.ts`: `'point:sobre-un-punto'` en `RAZONES`, y en `MENSAJES`: `'point:sobre-un-punto': 'Ya hay un punto ahí; el nuevo se queda donde estaba',`.

`loQueSePone.ts`, añadir:

```ts
import { pointAt } from '../../../utils/geometry/outlineRing'; // junto a buildRing/projectToRing
import { getEdgeEndpoints } from '../../../utils/geometry/path';
import { arcToNativeT } from '../../../utils/geometry/arcToNative';
import type { PuntoPuesto } from '../usePointTool';

/**
 * Dónde cae el punto a `distanciaMm` de la esquina, contado por el arco
 * (métrica 2), como lo pide `splitSegmentAt`: comando y parámetro NATIVO. En
 * una sisa, la fracción de arco y la de De Casteljau no coinciden.
 * `'sobre-un-punto'` si cae encima de un vértice (partir ahí lo duplicaría);
 * `null` si no cae en ningún comando.
 */
export function dondeCaeElPunto(
  outline: PathCommand[],
  cuenta: Cuenta,
  distanciaMm: number,
): { commandIndex: number; nativeT: number } | 'sobre-un-punto' | null {
  const built = buildRing(outline, 2);
  if (!built.ok) return null;
  const ring = built.value;
  const desde = projectToRing(ring, cuenta.refPoint).distanceMm;
  const at = pointAt(ring, cuenta.direction === 'cw' ? desde + distanciaMm : desde - distanciaMm);
  const comando = outline[at.commandIndex];
  const extremos = getEdgeEndpoints(outline, at.commandIndex);
  if (!comando || !extremos || comando.type === 'M') return null;
  if (at.tLocal < 1e-6 || at.tLocal > 1 - 1e-6) return 'sobre-un-punto';
  return { commandIndex: at.commandIndex, nativeT: arcToNativeT(comando, extremos.start, at.tLocal) };
}

/**
 * El punto recién puesto (spec 2026-10-02 § 5.2): «una cota con la distancia a
 * la esquina, escribible, que vive hasta el siguiente clic o Esc». Es
 * terminar de ponerlo, no editar un punto que ya existía. El techo es el
 * lado: pasar de la esquina siguiente lo pondría en otro.
 */
export function cotaDelPunto(p: PuntoPuesto, viva: PatternPiece, alCerrar: () => void): Cota {
  const a = pieceLocalToPattern(p.cuenta.refPoint, viva);
  const b = pieceLocalToPattern(p.vertice, viva);
  return {
    id: 'punto-distancia',
    kind: 'borde',
    label: 'Distancia',
    valueMm: p.distanciaMm,
    unit: 'mm',
    min: 0,
    max: p.ladoMm,
    referenceLabel: `de ${formatMedida(p.ladoMm, 'mm')}`,
    primary: true,
    scrub: false,
    a,
    b,
    outward: normalHaciaFuera(a, b, centroDe(viva)),
    alCerrar,
    apply: (mm) => ({ kind: 'punto', distanciaMm: mm }),
  };
}
```

`useEditPattern.ts`:

```ts
  const addPointOnSegment = useCallback(
    (commandIndex: number, t: number, pieceId?: string, undoBatchToken?: UndoBatchToken): PathCommand[] | null => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return null;
      const outline = splitSegmentAt(piece.outline, commandIndex, t);
      escribirContorno(piece, outline, undoBatchToken);
      return outline;
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  /**
   * Vuelve a poner el punto recién puesto en otro sitio del mismo contorno
   * (spec 2026-10-02 § 5.2): parte de la pieza de ANTES del clic, así que es lo
   * mismo que si el clic hubiera caído ahí. No deja un vértice de más, y los
   * piquetes se re-anclan desde el contorno original. El candado se mira en la
   * pieza viva.
   */
  const reinsertarPunto = useCallback(
    (base: PatternPiece, commandIndex: number, t: number, undoBatchToken?: UndoBatchToken): PathCommand[] | null => {
      const viva = getPiece(base.id);
      if (!viva || guardLocked(viva)) return null;
      const outline = splitSegmentAt(base.outline, commandIndex, t);
      // El reductor reindexa los bordes solo cuando cambia el número de
      // comandos, y aquí no cambia: el contorno vivo ya tiene el punto del clic.
      escribirContorno({ ...base, edges: reindexEdges(base.edges, base.outline, outline) }, outline, undoBatchToken);
      return outline;
    },
    [getPiece, escribirContorno, guardLocked],
  );
```

`reinsertarPunto` va en el objeto que devuelve el hook. El import de `reindexEdges` viene de `../../utils/edgeReindex`; antes se confirma la ruta con `grep -rn "export function reindexEdges" src`.

`usePointTool.ts`:
- imports:
  - `useDispatch`, `useRef`;
  - `beginUndoBatch`, `endUndoBatch`, `isUndoBatchTokenActive` y `type UndoBatchToken` de `../../store/undoMiddleware`;
  - `computeNotchAnchor` de `../../utils/notchAnchor`;
  - `getAnchor` (ya viene `extractNodes`… de `./nodeEditorUtils`);
  - `largoDelLado`, `dondeCaeElPunto` y `type Cuenta` de `./cotas/loQueSePone`;
  - `pushJournal`.
- `verbs`:

```ts
  verbs: {
    addPointOnSegment: (commandIndex: number, t: number, pieceId?: string, undoBatchToken?: UndoBatchToken) => PathCommand[] | null | void;
    /** Opcional para los arneses viejos: sin él, el punto se pone y no trae cota. */
    reinsertarPunto?: (base: PatternPiece, commandIndex: number, t: number, undoBatchToken?: UndoBatchToken) => PathCommand[] | null;
    convertSegment: (commandIndex: number, toCurve: boolean, pieceId?: string) => void;
    convertSegmentToPoints: (commandIndex: number, pieceId?: string) => void;
  },
```

- tipo exportado:

```ts
/**
 * El punto que se está terminando de poner (spec 2026-10-02 § 5.2). `base` es
 * la pieza de antes del clic: mover el punto es volver a ponerlo desde ella.
 */
export interface PuntoPuesto {
  pieceId: string;
  base: PatternPiece;
  cuenta: Cuenta;
  distanciaMm: number;
  /** El lado desde la esquina, en el sentido de la cuenta: el techo de la cota. */
  ladoMm: number;
  /** El vértice puesto, en coordenadas locales. */
  vertice: Point2D;
  /** El contorno que se escribió: si el vivo ya no es este, el punto ya no es el nuestro. */
  esperado: PathCommand[];
  sesion: number;
}
```

- estado, junto a `hover`:

```ts
  const dispatch = useDispatch();
  const [puesto, setPuesto] = useState<PuntoPuesto | null>(null);
  const loteRef = useRef<UndoBatchToken | null>(null);
  const sesiones = useRef(0);

  /** Cierra la cota y su lote de deshacer: poner y terminar de poner es una sola entrada. */
  const terminarPuesto = useCallback(() => {
    const lote = loteRef.current;
    loteRef.current = null;
    if (lote && isUndoBatchTokenActive(lote)) endUndoBatch(dispatch, lote);
    setPuesto(null);
  }, [dispatch]);
```

- en `onCommit`, la rama `point` (el clic y el arrastre) llama a `poner(commandIndex, nativeT)` en lugar de `verbs.addPointOnSegment(...)`:

```ts
    // Poner el punto abre su cota: un lote de deshacer para el punto y todo
    // lo que se escriba en ella. La pieza bloqueada la avisa el verbo.
    const poner = (commandIndex: number, nativeT: number) => {
      terminarPuesto();
      if (piece.locked) { verbs.addPointOnSegment(commandIndex, nativeT, piece.id); return; }
      const lote = beginUndoBatch(dispatch, 'Poner punto');
      const escrito = verbs.addPointOnSegment(commandIndex, nativeT, piece.id, lote);
      const vertice = escrito ? getAnchor(escrito[commandIndex]) : null;
      const ancla = vertice ? computeNotchAnchor(piece.outline, vertice, 2) : null;
      const ladoMm = ancla ? largoDelLado(piece.outline, ancla) : null;
      if (!escrito || !vertice || !ancla || ladoMm === null) { endUndoBatch(dispatch, lote); return; }
      loteRef.current = lote;
      setPuesto({
        pieceId: piece.id, base: piece,
        cuenta: { refPoint: ancla.refPoint, direction: ancla.direction },
        distanciaMm: ancla.distanceMm, ladoMm, vertice, esperado: escrito,
        sesion: ++sesiones.current,
      });
    };
```

  En sus dependencias entran `terminarPuesto` y `dispatch`.

- `moverPuesto`:

```ts
  /** Lo que escribe la cota del punto: volver a ponerlo a esa distancia de la esquina. */
  const moverPuesto = useCallback((distanciaMm: number) => {
    const p = puesto;
    if (!p || !verbs.reinsertarPunto) return;
    const viva = pieces.find(pc => pc.id === p.pieceId);
    // ponytail: la vida del punto se mide por el contorno que escribimos. Un
    // cambio de la pieza que no toque el contorno (moverla desde la IA con la
    // cota abierta) se perdería al volver a ponerlo desde la pieza de antes.
    if (!viva || viva.outline !== p.esperado) {
      pushJournal('gesture', 'punto:puesto-perdido', { pieceId: p.pieceId });
      terminarPuesto();
      return;
    }
    const donde = dondeCaeElPunto(p.base.outline, p.cuenta, distanciaMm);
    if (donde === null) { noPasoNada('point:sin-comando', { pieceId: p.pieceId }); return; }
    if (donde === 'sobre-un-punto') { noPasoNada('point:sobre-un-punto', { pieceId: p.pieceId, distanciaMm }); return; }
    const lote = loteRef.current && isUndoBatchTokenActive(loteRef.current) ? loteRef.current : undefined;
    const escrito = verbs.reinsertarPunto(p.base, donde.commandIndex, donde.nativeT, lote);
    const vertice = escrito ? getAnchor(escrito[donde.commandIndex]) : null;
    if (!escrito || !vertice) return;
    setPuesto({ ...p, distanciaMm, vertice, esperado: escrito });
  }, [puesto, pieces, verbs, terminarPuesto]);
```

- el efecto de `activeTool`, al salir de Punto, también `terminarPuesto()`. Y un efecto de desmontaje: `useEffect(() => () => { const l = loteRef.current; if (l && isUndoBatchTokenActive(l)) endUndoBatch(dispatch, l); }, [dispatch]);`
- el `return` gana `puesto`, `moverPuesto` y `terminarPuesto`.

`PatternEditor.tsx`:
- `usePointTool(…, { …, reinsertarPunto: editPatternTool.reinsertarPunto })`.
- `const pointRef = useRef(pointToolHook); pointRef.current = pointToolHook;`, junto a `notchRef`.
- en `loQueSePone`, después del piquete:

```ts
    const puntoPuesto = pointToolHook.puesto;
    const piezaDelPunto = puntoPuesto ? pieces.find(p => p.id === puntoPuesto.pieceId) : undefined;
    if (puntoPuesto && piezaDelPunto) {
      return [cotaDelPunto(puntoPuesto, piezaDelPunto, () => pointRef.current.terminarPuesto())];
    }
```

  (`puntoPuesto` y `pieces` entran en las dependencias.)
- la clave: `piquetePuesto ? \`piquete:${…}\` : pointToolHook.puesto ? \`punto:${pointToolHook.puesto.sesion}\` : ''`; si `!abrio`, también `pointRef.current.terminarPuesto()`.
- `aplicarCota`: `} else if (update.kind === 'punto') { pointRef.current.moverPuesto(update.distanciaMm);`.

- [ ] **Step 5: Correrlos y verlos pasar**

Run: el comando del Step 3 más `npx vitest run src/components/PatternEditor/__tests__/usePointTool.test.tsx src/components/PatternEditor/__tests__/usePointTool.distancia.test.tsx src/components/PatternEditor/__tests__/no-paso-nada.test.ts`
Expected: PASS. Los tests viejos de Punto siguen verdes: sus verbos devuelven `undefined` y no abren cota.

- [ ] **Step 6: Suite entera, lint y commit**

Run: `npx tsc -b --noEmit && npm run test > .superpowers/sdd/p3b-t3.log 2>&1; tail -5 .superpowers/sdd/p3b-t3.log && npm run lint && node scripts/ui-contract-lint.mjs`

```bash
git add src/components/PatternEditor/useEditPattern.ts src/components/PatternEditor/usePointTool.ts src/components/PatternEditor/cotas/loQueSePone.ts src/components/PatternEditor/noPasoNada.ts src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/__tests__/usePointTool.puesto.test.tsx src/components/PatternEditor/cotas/__tests__/loQueSePone.test.ts src/components/PatternEditor/__tests__/useEditPattern.test.tsx
git commit -m "feat(punto): el punto recién puesto trae su cota a la esquina, y se termina de poner en un solo deshacer"
```

---

### Task 4: Las puntas de un piquete no se arrastran; la pieza vinculada recibe el ancla

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:1032-1036`: solo se arma con `esInternaEditable(ilLine)`.
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:351`: solo se pintan los extremos de una interna editable.
- Modify: `src/store/linkedEditingMiddleware.ts`: `syncUpdateInternalLine` reenvía `notchAnchor` (instancia) y `notchOptions` (las dos).
- Test: `src/store/__tests__/linkedEditingMiddleware.test.ts` y el test de `PieceRenderer` que pinta `internal-line-endpoints` (se busca con `grep -rln "internal-line-endpoints" src`; si no hay, uno nuevo, `renderers/__tests__/PieceRenderer.puntasDelPiquete.test.tsx`, con el arnés del test de `PieceRenderer` más cercano).

**Interfaces:**
- Consumes: `esInternaEditable` (`src/types/types.ts:857`).

- [ ] **Step 1: Escribir los tests que fallan**

`linkedEditingMiddleware.test.ts`, con el arnés del archivo (dos piezas vinculadas, instancia y espejo):
- **'una instancia recibe el ancla y las opciones del piquete, no solo el path'**: `updateInternalLine` con `path`, `notchAnchor` y `notchOptions` sobre la fuente. La pareja termina con el mismo `notchAnchor` y las mismas `notchOptions`.
- **'un espejo recibe las opciones pero no el ancla, que se suelta a propósito (mirrorInternalsX)'**: las mismas `notchOptions` y `notchAnchor` `undefined`.

`PieceRenderer`:
- **'un piquete seleccionado no enseña puntas que agarrar (una sola lista con Q)'**: con `selectedInternalLine` sobre un piquete, `container.querySelector('.internal-line-endpoints')` es `null`.
- El control: con una línea de tipo `reference` sí las enseña.

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run src/store/__tests__/linkedEditingMiddleware.test.ts <test de PieceRenderer>`
Expected: FAIL. La pareja conserva su ancla vieja y el piquete pinta sus puntas.

- [ ] **Step 3: Implementar**

`useEditorInteractions.ts`:

```ts
          const ilLine = ilPiece.internals.find(l => l.id === selectedInternalLine.lineId);
          // Un piquete o un doblez de pliegue no se agarra por sus puntas: su
          // path sale de un ancla o de una entidad, y arrastrarlo dejaba el
          // ancla desfasada (P3b). La misma lista que Q (`esInternaEditable`).
          if (ilLine && esInternaEditable(ilLine)) {
```

(import de `esInternaEditable` desde `../../types/types`).

`PieceRenderer.tsx:351`: `{isWholeLineSelected && piezaEditadaEnQ !== piece.id && esInternaEditable(line) && (() => {`, con una frase en el comentario de encima: lo que no se agarra no se pinta.

`linkedEditingMiddleware.ts`:

```ts
function syncUpdateInternalLine(
  dispatch: Dispatch,
  source: PatternPiece,
  partner: PatternPiece,
  payload: { pieceId: string; lineId: string; path: PathCommand[]; notchAnchor?: InternalLine['notchAnchor']; notchOptions?: InternalLine['notchOptions'] },
) {
  // La forma del piquete viaja entera: sin sus opciones, la pareja guarda una
  // profundidad que ya no dibuja. El ancla solo a la instancia: el espejo la
  // suelta a propósito, como `mirrorInternalsX`.
  const opciones = payload.notchOptions ? { notchOptions: payload.notchOptions } : {};
```

- la rama `instance` despacha `{ …, path: payload.path, ...(payload.notchAnchor ? { notchAnchor: payload.notchAnchor } : {}), ...opciones }`;
- la de espejo, `{ …, path: mirroredPath, ...opciones }`;
- el llamador de `runCascade` le pasa el `payload` completo (se revisa su cast en `:146`).

- [ ] **Step 4: Verlos pasar, suite entera, lint y commit**

Run: el comando del Step 2, y luego `npx tsc -b --noEmit && npm run test > .superpowers/sdd/p3b-t4.log 2>&1; tail -5 .superpowers/sdd/p3b-t4.log && npm run lint && node scripts/ui-contract-lint.mjs`

```bash
git add src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/renderers/PieceRenderer.tsx src/store/linkedEditingMiddleware.ts src/store/__tests__/linkedEditingMiddleware.test.ts <test de PieceRenderer>
git commit -m "fix(piquete): sus puntas no se arrastran con Seleccionar, y la pieza vinculada recibe su ancla y su forma"
```

---

### Task 5: E2e, trinquetes y notas

**Files:**
- Create: `tests/e2e/la-cota-de-lo-que-se-pone.spec.ts`.
- Modify: `scripts/deploy-prod.sh`: el spec nuevo, en la lista del gate, después de `la-cabina-de-la-pieza.spec.ts`.
- Modify: `tests/e2e/linea-al-pie.spec.ts:154-166`: la sonda del clic es el chip, no el modal.
- Modify: `tests/e2e/emplazamiento-modales.spec.ts`: fuera el caso del modal del piquete (`:166-229`) y los ayudantes que queden muertos.
- Modify: `tests/e2e/contraste-del-cromo.spec.ts:199-214`: «cota del piquete».
- Modify: `tests/e2e/superficies-por-accion.spec.ts`: más «poner punto (P)».
- Delete: `tests/e2e/1099-modal-piquete-junto-a-la-pieza.spec.ts`.
- Modify: `tests/e2e/contraste-baseline.json` y `tests/e2e/superficies-baseline.json`, solo por `*_UPDATE=1`.
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`: la nota del plan de P3b, al final de § 5.2.

- [ ] **Step 1: Escribir el e2e**

`tests/e2e/la-cota-de-lo-que-se-pone.spec.ts`, con el molde de `la-cabina-de-la-pieza.spec.ts`: `abrirAppVacia`, `addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200)` y `clickAt` en coordenadas de patrón. El borde de arriba va de (100, 100) a (400, 100), y la esquina de referencia es la de (100, 100).

```ts
const campo = (page: Page, nombre: 'Distancia' | 'Profundidad') =>
  page.locator(`input.cota--editando[aria-label="${nombre}"]`);
const piquetes = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { project: { pieces: Array<{ internals: Array<{ type: string; notchAnchor?: { distanceMm: number }; notchOptions?: { length: number } }> }> } } } })
    .__VINA_STORE__.getState().project.pieces[0].internals.filter(l => l.type === 'notch'));
const contorno = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> } } } })
    .__VINA_STORE__.getState().project.pieces[0].outline);
```

Casos:
1. **'el clic pone el piquete con su cota abierta; Enter lo lleva a la distancia escrita'**
   - Piquete con `Shift+N`, `clickAt({ x: 160, y: 100 })`.
   - `campo('Distancia')` está enfocado y vale «60»; no hay ningún `[role="dialog"]`.
   - Se escribe «150» y Enter: `piquetes()[0].notchAnchor.distanceMm` ≈ 150 y el campo desaparece.
2. **'Esc lo deja donde se hizo clic; el segundo clic pone otro y abre el suyo'**
   - Clic en (160, 100), «150» y Esc. La distancia sigue ≈ 60.
   - Clic en (300, 100): hay dos piquetes y el campo vuelve a estar abierto. Su valor es ≈ 100: la esquina más cercana es la de (400, 100).
3. **'«Ajustar distancia…» abre la misma cota, con la profundidad a un Tab'**
   - Se pone uno y Esc. Seleccionar (`z`), clic derecho sobre el piquete en (160, 100) y «Ajustar distancia…».
   - «90», Tab, «12» y Enter: distancia ≈ 90 y `notchOptions.length` 12.
4. **'las puntas de un piquete seleccionado no se arrastran'**
   - Se pone uno y Esc. Seleccionar, y se despacha `editor/selectInternalLine` con su id.
   - Se arrastra desde su punta interior, (160, 108), hasta (200, 140).
   - El `path` del piquete no cambia.
5. **'el punto trae su cota; Enter lo mueve, y un Ctrl+Z lo quita entero'**
   - Punto: se despachan `editor/setActiveTool` y `tools/setActiveTool2D`, `'point'`.
   - `clickAt({ x: 160, y: 100 })`: el contorno pasa de 5 a 6 comandos y `campo('Distancia')` vale «60».
   - «120» y Enter: hay un vértice en x = 120 locales y ninguno en 60, y siguen siendo 6 comandos.
   - Ctrl+Z con el foco en el lienzo (se aparca el ratón y se pulsa sobre el svg sin hacer clic): 5 comandos.
6. **'en Split, la cota cae dentro de la hoja'**
   - Viewport de 1366 × 643, vista Split (dispatch con el patrón de `contraste-del-cromo.spec.ts`).
   - Se pone un piquete. `elementFromPoint` en el centro del campo devuelve el propio campo.

- [ ] **Step 2: Correrlo con el Vite caliente**

Run: `npx playwright test tests/e2e/la-cota-de-lo-que-se-pone.spec.ts --workers=1`
Expected: 6/6. Si un clic no cae sobre el borde, se mide con `elementFromPoint` antes de tocar coordenadas (memoria «clic e2e cae en chrome invisible»).

- [ ] **Step 3: Los e2e que nombraban el modal**

- `linea-al-pie.spec.ts`: la sonda pasa a ser `page.locator('input.cota--editando[aria-label="Distancia"]')`. El comentario cambia: Esc deja el piquete donde se hizo clic.
- `emplazamiento-modales.spec.ts`: fuera el `test('NotchPrecisionModal: …')`. Con `grep` dentro del archivo se borran `sembrarRectangulo`, `VentanaConStore` y el párrafo del encabezado `:15-17`, si nadie más los usa.
- `contraste-del-cromo.spec.ts`: el test pasa a 'la cota del piquete y el modal de conexión'. La sonda es el campo, el estado se registra como `registrar('cota del piquete', page)`, Esc, y el campo queda con `toHaveCount(0)`.
- `superficies-por-accion.spec.ts`, después de 'poner piquete (⇧N)':

```ts
  test('poner punto (P)', async ({ page }) => {
    registrar('poner punto (P)', await medirAccion(page, [
      async () => {
        await dispatch(page, 'editor/setActiveTool', 'point');
        await dispatch(page, 'tools/setActiveTool2D', 'point');
        await page.waitForTimeout(300);
      },
      () => clickAt(page, { x: 120, y: 320 }),
    ]));
  });
```

  (con la tecla que muestre `shortcuts/defaults.ts` para `point`; si no es P, se usa la suya en el nombre).
- `git rm tests/e2e/1099-modal-piquete-junto-a-la-pieza.spec.ts`. Lo que medía, que lo puesto no se sale de la hoja en Split, lo mide el caso 6.

- [ ] **Step 4: Las líneas base, solo por el camino de fijar**

Run, con el Vite caliente y sin tocar la app mientras tanto:
- `CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`
- `SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1`

Expected:
- «cota del piquete» queda en 0;
- «poner punto (P)» y «poner piquete (⇧N)» quedan en ≤ 4, la meta (§ 5.1: 3 y 4);
- `git diff tests/e2e/*-baseline.json` no sube ningún estado que ya existía.

Después: `npx playwright test tests/e2e/linea-al-pie.spec.ts tests/e2e/emplazamiento-modales.spec.ts tests/e2e/contraste-del-cromo.spec.ts tests/e2e/superficies-por-accion.spec.ts --workers=2`, en verde.

- [ ] **Step 5: El gate, la spec y el commit**

- `scripts/deploy-prod.sh`: `tests/e2e/la-cota-de-lo-que-se-pone.spec.ts \`, después de `la-cabina-de-la-pieza.spec.ts`. El archivo sigue en LF y `bash -n scripts/deploy-prod.sh` pasa.
- La spec, al final de § 5.2:

> **Nota del plan de P3b (2026-10-06).** Lo que se pone trae su cota abierta: el piquete, con Distancia y Profundidad, y el punto, con su Distancia. Junto al número se lee el largo del lado («de 520 mm»). La profundidad se queda en el chip hasta que P3c le dé su etiqueta, porque hoy es la única puerta para la de un piquete ya puesto. El chip vive lo que dura su edición: Enter fija, Esc no lo mueve, y el siguiente clic lo cierra. Poner un punto y terminar de ponerlo es una sola entrada de deshacer. Las puntas de un piquete ya no se arrastran con Seleccionar, porque dejaban su ancla desfasada; para moverlo está «Ajustar distancia…». La pieza bloqueada no recibe piquetes. El modal desaparece.

```bash
git add tests/e2e/la-cota-de-lo-que-se-pone.spec.ts scripts/deploy-prod.sh tests/e2e/linea-al-pie.spec.ts tests/e2e/emplazamiento-modales.spec.ts tests/e2e/contraste-del-cromo.spec.ts tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-baseline.json tests/e2e/superficies-baseline.json docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(e2e): la cota de lo que se pone entra al gate; los trinquetes miden el chip del piquete y el punto"
```

---

## Después de las tareas

1. **Revisión final** con un subagente Opus, sobre el paquete de `review-package`, con este plan, la spec y el Review Focus. Se le prohíbe por escrito commitear, hacer push o desplegar.
2. **Un solo pase de arreglos.** Cada arreglo lleva su test en rojo antes, y la suite entera en verde.
3. **Ensayo del deploy**, `bash scripts/deploy-prod.sh --ensayo`, en verde.
4. **Capturas**, por CDP, a 1366 × 643 y en Split: la cota del piquete escribiendo con su fantasma, la del punto y «Ajustar distancia…».
5. **Push, PR, merge y deploy**, solo con la orden de Samuel.
