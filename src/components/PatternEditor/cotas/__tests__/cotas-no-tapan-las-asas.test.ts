import { describe, it, expect } from 'vitest';
import {
  separarChips,
  cajasDeAsas,
  ALTO_CHIP_PX,
  anchoEstimadoDeChip,
  type ChipPuesto,
  type Estorbo,
} from '../cotasGeometry';
import { computeHandlePositions } from '../../../../utils/geometry/transform';
import type { Cota } from '../cotas';

/**
 * Medido en el navegador el 2026-09-04, con una pieza de 140×100 mm seleccionada
 * en `select` a zoom 1:
 *
 *   asa 'e'      (rect 6×6 en 257-263 × 247-253)  ← la tapa el chip "100 mm"
 *                                                    (56×22 en 250-306 × 239-261)
 *   asa 'rotate' (circle 8×8 en 186-194 × 171-179) ← la tapa el chip "140 mm"
 *                                                    (56×22 en 162-218 × 171-193)
 *
 * `document.elementFromPoint` en el centro de esas dos asas devuelve
 * `button.cota`, no el `rect`/`circle` del transform box. Y el gesto lo
 * confirma, con el A/B de apagar los chips:
 *
 *   asa este:     con chips 260 → 260   ·  sin chips 260 → 320
 *   rotación:     con chips   0° → 0°   ·  sin chips   0° → 90°
 *
 * Y el gesto robado **no se pierde: se convierte en un scrub del chip**. Tirar
 * 60 px hacia el este de lo que parece el asa este deja el ancho clavado en 140
 * y sube el ALTO de 100 a 160 mm (medido: bbox 120,200→260,360). O sea que
 * María tira a la derecha para ensanchar y la pieza le crece hacia abajo — su
 * queja literal de #198 ("necesito que se mueva solo lo arrastrado")
 * resucitada por otra superficie, y esta vez escribiendo una medida que ella
 * no pidió.
 *
 * O sea: **desde que existen las cotas, María no puede rotar una pieza ni
 * estirarla por el este, y al intentarlo le cambia la medida equivocada.** El
 * e2e `maria-198-resize-con-ancla` cazaba la mitad (el este) y llevaba días en
 * rojo leído como "matemática de resize rota"; la matemática está bien, lo que
 * falla es quién recibe el clic. La rotación es el hermano que nadie reportó.
 *
 * El arreglo NO es apagar los chips: se perdería escribir la medida clicándola,
 * que es justo lo que las cotas vivas vienen a dar.
 *
 * Tampoco es corregir el aire de `chipScreenPosition` —hoy `COTA_OFFSET_PX`
 * mide hasta el CENTRO del chip, así que el del alto empieza 10 px DENTRO del
 * borde que mide—, aunque eso sea un defecto real y aparte. Se descartó porque
 * **no alcanza**: con el aire corregido el chip del alto se va a 278-334 y
 * suelta el asa este, pero el del ancho aterriza en 160-182 y el asa de giro
 * vive en 171-179, o sea que la rotación seguiría rota. El asa de giro cuelga
 * de un brazo, fuera de la banda del offset; ningún ajuste del offset la
 * alcanza. Y mover el aire desplaza TODOS los chips de una superficie que
 * María acaba de aprobar, para arreglar la mitad.
 *
 * Lo que se hace es el mecanismo que ya existe: `separarChips` desliza cada
 * chip por la tangente de su propia cota hasta encontrar hueco. Las asas entran
 * a esa misma pasada como estorbos fijos. Solo se mueve el chip que de verdad
 * estorba, y sirve para cualquier asa futura sin saber dónde está.
 */

const cota = (over: Partial<Cota> = {}): Cota => ({
  id: 'c1',
  kind: 'ancho',
  label: '140 mm',
  valueMm: 140,
  unit: 'mm',
  min: 1,
  max: 1000,
  primary: true,
  a: { x: 0, y: 0 },
  b: { x: 140, y: 0 },
  outward: { x: 0, y: -1 },
  apply: () => null,
  ...over,
});

const caja = (left: number, top: number, texto: string) => {
  const ancho = anchoEstimadoDeChip(texto);
  return {
    left: left - ancho / 2,
    right: left + ancho / 2,
    top: top - ALTO_CHIP_PX / 2,
    bottom: top + ALTO_CHIP_PX / 2,
  };
};

const seSolapan = (a: Estorbo, b: Estorbo) =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

describe('un chip de cota nunca se queda encima de un asa del transform box', () => {
  it('el caso medido: el chip del ancho suelta el asa de rotación', () => {
    // El asa de giro vive en (190, 175) de pantalla; el chip del ancho nace
    // centrado en (190, 182) — encima de ella.
    const estorbos: Estorbo[] = [{ left: 182, top: 167, right: 198, bottom: 183 }];
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
    ];

    const [puesto] = separarChips(items, estorbos);
    expect(seSolapan(caja(puesto.left, puesto.top, '140 mm'), estorbos[0])).toBe(false);
  });

  it('el caso medido: el chip del alto suelta el asa este', () => {
    // Asa 'e' centrada en (260, 250); el chip del alto nace en (278, 250).
    const estorbos: Estorbo[] = [{ left: 252, top: 242, right: 268, bottom: 258 }];
    const items: ChipPuesto[] = [
      {
        cota: cota({ id: 'c2', kind: 'alto', label: '100 mm', a: { x: 260, y: 200 }, b: { x: 260, y: 300 }, outward: { x: 1, y: 0 } }),
        left: 278, top: 250, texto: '100 mm',
      },
    ];

    const [puesto] = separarChips(items, estorbos);
    expect(seSolapan(caja(puesto.left, puesto.top, '100 mm'), estorbos[0])).toBe(false);
  });

  it('las nueve asas de una pieza seleccionada quedan libres a la vez', () => {
    const bbox = { x: 120, y: 200, width: 140, height: 100 };
    const estorbos = cajasDeAsas(computeHandlePositions(bbox, 1), { x: 0, y: 0 }, 1);

    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
      {
        cota: cota({ id: 'c2', kind: 'alto', label: '100 mm', a: { x: 260, y: 200 }, b: { x: 260, y: 300 }, outward: { x: 1, y: 0 } }),
        left: 278, top: 250, texto: '100 mm',
      },
    ];

    const puestos = separarChips(items, estorbos);
    for (const [i, p] of puestos.entries()) {
      const propia = caja(p.left, p.top, items[i].texto!);
      for (const e of estorbos) {
        expect(seSolapan(propia, e), `el chip ${items[i].cota.label} sigue pisando un asa`).toBe(false);
      }
    }
  });

  it('el chip se desliza por su tangente, no se despega de su hilo', () => {
    // El del ancho mide un borde horizontal: solo puede moverse en x.
    const estorbos: Estorbo[] = [{ left: 182, top: 167, right: 198, bottom: 183 }];
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
    ];

    const [p] = separarChips(items, estorbos);
    expect(p.top, 'se despegó del hilo que lo ancla').toBeCloseTo(182, 6);
    expect(p.left).not.toBeCloseTo(190, 6);
  });

  it('un chip que no estorba a nadie no se mueve ni un píxel', () => {
    const estorbos: Estorbo[] = [{ left: 0, top: 0, right: 16, bottom: 16 }];
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 400, top: 400, texto: '140 mm' },
    ];

    expect(separarChips(items, estorbos)).toEqual([{ left: 400, top: 400 }]);
  });

  it('sin estorbos se comporta exactamente igual que antes', () => {
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
      { cota: cota({ id: 'c2', a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
    ];
    expect(separarChips(items, [])).toEqual(separarChips(items));
  });

  it('es determinista', () => {
    const estorbos: Estorbo[] = [{ left: 182, top: 167, right: 198, bottom: 183 }];
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
    ];
    expect(separarChips(items, estorbos)).toEqual(separarChips(items, estorbos));
  });

  it('los chips siguen sin pisarse entre ellos cuando además hay asas', () => {
    const estorbos: Estorbo[] = [{ left: 182, top: 167, right: 198, bottom: 183 }];
    const items: ChipPuesto[] = [
      { cota: cota({ a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
      { cota: cota({ id: 'c2', a: { x: 120, y: 200 }, b: { x: 260, y: 200 } }), left: 190, top: 182, texto: '140 mm' },
    ];
    const [a, b] = separarChips(items, estorbos);
    expect(seSolapan(caja(a.left, a.top, '140 mm'), caja(b.left, b.top, '140 mm'))).toBe(false);
  });
});

describe('cajasDeAsas — las asas en coordenadas de pantalla', () => {
  it('devuelve una caja por asa', () => {
    const handles = computeHandlePositions({ x: 120, y: 200, width: 140, height: 100 }, 1);
    expect(cajasDeAsas(handles, { x: 0, y: 0 }, 1)).toHaveLength(handles.length);
  });

  it('la caja rodea el asa: la contiene con aire por los cuatro lados', () => {
    const handles = computeHandlePositions({ x: 120, y: 200, width: 140, height: 100 }, 1);
    const e = handles.find((h) => h.id === 'e')!;
    const cajas = cajasDeAsas(handles, { x: 0, y: 0 }, 1);
    const suya = cajas[handles.indexOf(e)];

    expect(suya.left).toBeLessThan(e.pos.x);
    expect(suya.right).toBeGreaterThan(e.pos.x);
    expect(suya.top).toBeLessThan(e.pos.y);
    expect(suya.bottom).toBeGreaterThan(e.pos.y);
    // Cubre de sobra el rect de 6 px que pinta TransformHandlesOverlay.
    expect(suya.right - suya.left).toBeGreaterThanOrEqual(6);
  });

  it('usa el mismo mapeo pantalla que chipScreenPosition: pan + patrón × zoom', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 100 }, 1);
    const se = handles.find((h) => h.id === 'se')!; // (100, 100) en patrón
    const cajas = cajasDeAsas(handles, { x: 30, y: 7 }, 2);
    const suya = cajas[handles.indexOf(se)];

    const cx = (suya.left + suya.right) / 2;
    const cy = (suya.top + suya.bottom) / 2;
    expect(cx).toBeCloseTo(30 + 100 * 2, 6);
    expect(cy).toBeCloseTo(7 + 100 * 2, 6);
  });

  it('el tamaño de la caja es de PANTALLA: no crece con el zoom', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 100 }, 1);
    const a = cajasDeAsas(handles, { x: 0, y: 0 }, 1)[0];
    const b = cajasDeAsas(handles, { x: 0, y: 0 }, 8)[0];
    expect(b.right - b.left).toBeCloseTo(a.right - a.left, 6);
  });

  it('sin asas no hay estorbos', () => {
    expect(cajasDeAsas([], { x: 0, y: 0 }, 1)).toEqual([]);
  });
});
