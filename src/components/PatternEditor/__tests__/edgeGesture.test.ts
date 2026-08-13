import { describe, it, expect } from 'vitest';
import { resolveEdgeCommit, type EdgeTarget } from '../edgeGesture';

const press = (t: number): EdgeTarget => ({
  pieceId: 'p1',
  edgeIndex: 1,
  edgeRange: [1, 2],
  t,
  point: { x: 0, y: 0 },
});

describe('resolveEdgeCommit', () => {
  it('bajo umbral es CLIC, aunque el t haya cambiado', () => {
    const c = resolveEdgeCommit(press(0.3), 0.9, false);
    expect(c.kind).toBe('click');
  });

  it('sobre umbral con recorrido real de t es ARRASTRE', () => {
    const c = resolveEdgeCommit(press(0.2), 0.7, true);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.2, 5);
    expect(c.range[1]).toBeCloseTo(0.7, 5);
  });

  it('ordena el rango cuando arrastra hacia atrás', () => {
    const c = resolveEdgeCommit(press(0.8), 0.3, true);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.3, 5);
    expect(c.range[1]).toBeCloseTo(0.8, 5);
  });

  it('cruzó el umbral en pantalla pero el t colapsó: cae a CLIC, no al vacío', () => {
    // arrastró perpendicular al borde — cruzó el umbral, cero avance de t
    const c = resolveEdgeCommit(press(0.5), 0.505, true);
    expect(c.kind).toBe('click');
  });

  it('soltar fuera del borde (releaseT null) es CLIC', () => {
    const c = resolveEdgeCommit(press(0.5), null, true);
    expect(c.kind).toBe('click');
  });

  it('colapsa el arranque al extremo: t < 0.01 pasa a 0', () => {
    const c = resolveEdgeCommit(press(0.004), 0.6, true);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBe(0);
  });

  it('colapsa el final al extremo: t > 0.99 pasa a 1', () => {
    const c = resolveEdgeCommit(press(0.4), 0.997, true);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[1]).toBe(1);
  });

  it('el objetivo del commit es SIEMPRE el del press', () => {
    const p = press(0.1);
    const c = resolveEdgeCommit(p, 0.9, true);
    expect(c.target).toBe(p);
  });

  it('cruzado el umbral, volver cerca del punto de partida NO lo devuelve a clic', () => {
    // Borde curvo: el cursor está a 1 px del press en PANTALLA, pero el arco
    // recorrido es medio borde. Manda el arco. (spec § 6, conflicto 2)
    const c = resolveEdgeCommit(press(0.2), 0.8, true);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range).toEqual([0.2, 0.8]);
  });

  // ─── El sentido del recorrido (familia DISTANCIA, tanda 2b) ──────────────
  // `range` va ordenado, que es lo correcto para un TRAMO: un tramo no tiene
  // sentido de recorrido. Una DISTANCIA sí lo tiene — el signo es la
  // `direction` del ancla (spec § 3.2) — y del rango ordenado no se recupera.

  it('el commit de arrastre conserva el t del release, sin ordenar', () => {
    const c = resolveEdgeCommit(press(0.8), 0.2, true);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range).toEqual([0.2, 0.8]);
    expect(c.releaseT).toBe(0.2);
  });

  it('conserva el release aunque el press se colapse a un extremo', () => {
    // Aquí es donde el rango ordenado deja de bastar: press.t = 0.005 colapsa
    // a 0 dentro de `range`, así que mirando solo el rango no hay forma de
    // saber cuál de sus dos bordes era el press.
    const c = resolveEdgeCommit(press(0.005), 0.6, true);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range).toEqual([0, 0.6]);
    expect(c.releaseT).toBe(0.6);
    expect(c.target.t).toBe(0.005);
  });

  it('el release conservado es el crudo, sin el colapso a extremo', () => {
    // range[1] se colapsa a 1; releaseT sigue diciendo dónde soltó de verdad.
    const c = resolveEdgeCommit(press(0.3), 0.997, true);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[1]).toBe(1);
    expect(c.releaseT).toBe(0.997);
  });

  // ─── La dirección se fija al CRUZAR el umbral, no al soltar ──────────────
  // Spec § 3.2, literal: "la fijan los primeros 4 px de recorrido proyectados
  // sobre el borde". El signo final es otra cosa, y difiere en el caso que
  // más importa: arrancar hacia un lado y volverse antes de soltar.

  it('conserva el t del primer cruce del umbral', () => {
    const c = resolveEdgeCommit(press(0.5), 0.7, true, 0.55);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.firstDragT).toBe(0.55);
  });

  it('el primer cruce y el release pueden apuntar a lados CONTRARIOS', () => {
    // Arranca hacia arriba (0.5 → 0.55) y se vuelve más allá del press
    // (→ 0.3). La dirección es la del arranque; el rango es el del release.
    const c = resolveEdgeCommit(press(0.5), 0.3, true, 0.55);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.firstDragT).toBe(0.55);
    expect(c.releaseT).toBe(0.3);
    expect(c.range).toEqual([0.3, 0.5]);
    // Quien lea la dirección del signo final se equivocaría de sentido aquí:
    expect(Math.sign(c.releaseT - c.target.t)).not.toBe(Math.sign(c.firstDragT! - c.target.t));
  });

  it('sin primer cruce registrado devuelve null, no adivina', () => {
    // Los llamadores de la tanda 1 no lo pasan. Inventarlo desde el release
    // sería justo el bug que este campo existe para evitar.
    const c = resolveEdgeCommit(press(0.2), 0.8, true);
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.firstDragT).toBeNull();
  });
});
