import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { buildRing, distanceAt, pointAt, advance } from '../outlineRing';
import { outlinePerimeter, resolveNotchAnchor } from '../../notchAnchor';

// ─── Figuras ──────────────────────────────────────────────────────────────
//
// Las cúbicas son las cuatro que se midieron para decidir el diseño del plan
// (docs/superpowers/plans/2026-08-12-tanda-2a-cimientos-de-medicion.md). Van
// con su longitud de arco real, obtenida por integración numérica a 2·10⁶
// muestras — un oráculo EXTERNO. Sin él, comparar la función consigo misma
// dejaría pasar una parametrización por cuerda internamente consistente.

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, h] },
  { type: 'L', values: [0, h] },
  { type: 'Z', values: [] },
];

const cubic = (c1: Point2D, c2: Point2D, end: Point2D): PathCommand[] => [
  { type: 'M', values: [0, 0] },
  { type: 'C', values: [c1.x, c1.y, c2.x, c2.y, end.x, end.y] },
];

const CURVAS = {
  sisa:     { cmds: cubic({ x: 20, y: 60 }, { x: 60, y: 110 }, { x: 110, y: 130 }), arcoReal: 175.559 },
  escote:   { cmds: cubic({ x: 30, y: 40 }, { x: 90, y: 50 }, { x: 140, y: 20 }),   arcoReal: 154.896 },
  cadera:   { cmds: cubic({ x: 40, y: 30 }, { x: 20, y: 90 }, { x: 60, y: 130 }),   arcoReal: 146.135 },
  costado:  { cmds: cubic({ x: 5, y: 100 }, { x: 8, y: 200 }, { x: 10, y: 300 }),   arcoReal: 300.178 },
};

// Un comando de cada tipo. Los de hoy (notchAnchor.test.ts) solo ejercitan
// M/L/Z, y el comportamiento heredado tiene detalles que solo salen con el
// comando delante: S/T caen al `default` de flattenPath y se vuelven cuerda,
// H/V conservan el cursor, y Z añade el punto inicial solo si el hueco supera
// 0.001. Un reimplementador que no los vea los pasa por alto.
const todosLosComandos: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [50, 0] },
  { type: 'H', values: [80] },
  { type: 'V', values: [40] },
  { type: 'C', values: [90, 60, 70, 80, 50, 90] },
  { type: 'Q', values: [30, 100, 10, 80] },
  { type: 'S', values: [5, 50, 0, 30] },
  { type: 'T', values: [0, 10] },
  { type: 'Z', values: [] },
];

const conArco: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'A', values: [100, 100, 0, 0, 1, 100, 100] },
  { type: 'Z', values: [] },
];

const dosSubpaths: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'M', values: [100, 0] },
  { type: 'L', values: [110, 0] },
];

const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('se esperaba ok:true');
  return r.value;
};

// ─── v1: no mover los datos de María ──────────────────────────────────────

describe('v1 — reproduce la métrica con la que están guardados los piquetes', () => {
  // outlinePerimeter y resolveNotchAnchor son la superficie pública del anillo
  // viejo. Atar el contrato a ELLAS y no a la representación interna prueba
  // justo lo que importa — que un piquete guardado caiga donde caía — sin
  // congelar detalles de implementación que nadie prometió.

  it('el perímetro coincide EXACTAMENTE con el de hoy, en un rectángulo', () => {
    const cmds = rect(100, 200);
    expect(ok(buildRing(cmds, 1)).totalMm).toBe(outlinePerimeter(cmds));
  });

  it('coincide exactamente también con curvas, que es donde el aplanado importa', () => {
    for (const { cmds } of Object.values(CURVAS)) {
      expect(ok(buildRing(cmds, 1)).totalMm).toBe(outlinePerimeter(cmds));
    }
  });

  it('coincide con un contorno que usa todos los tipos de comando', () => {
    expect(ok(buildRing(todosLosComandos, 1)).totalMm).toBe(outlinePerimeter(todosLosComandos));
  });

  it('un piquete guardado cae donde cae hoy, hasta el último decimal', () => {
    const cmds = rect(100, 200);
    const ring = ok(buildRing(cmds, 1));
    for (const distanceMm of [0, 17.3, 99.999, 150, 47.28461]) {
      const viejo = resolveNotchAnchor(cmds, {
        refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm,
      });
      expect(viejo).not.toBeNull();
      const nuevo = pointAt(ring, distanceMm);
      expect(nuevo.point.x).toBe(viejo!.point.x);
      expect(nuevo.point.y).toBe(viejo!.point.y);
    }
  });

  it('mide los puentes falsos entre subpaths, porque hoy los mide', () => {
    // M(0,0) L(10,0) M(100,0) L(110,0) da 220 hoy: los dos tramos (10+10) más
    // los dos puentes inexistentes (90 de ida y 110 del wrap). Es incorrecto,
    // y v1 lo replica IGUAL — su única razón de ser es no mover los datos.
    // El contrato de identidad de subpath es de v2, no de v1.
    expect(ok(buildRing(dosSubpaths, 1)).totalMm).toBe(outlinePerimeter(dosSubpaths));
  });

  it('acepta los arcos como los acepta hoy: tratados como cuerda, sin protestar', () => {
    expect(ok(buildRing(conArco, 1)).totalMm).toBe(outlinePerimeter(conArco));
  });
});

// ─── v2: medir de verdad ──────────────────────────────────────────────────

describe('v2 — la métrica correcta', () => {
  it('cierra el contorno: un rectángulo 100×200 mide 600, no 500', () => {
    expect(ok(buildRing(rect(100, 200), 2)).totalMm).toBeCloseTo(600, 6);
  });

  it('mide el ARCO de las curvas, no su poligonal ni su cuerda', () => {
    // Se mide el arco del COMANDO de curva, no el total del anillo: el anillo
    // cierra siempre (igual que v1), así que en estas figuras abiertas su
    // total incluye además la cuerda de vuelta al origen. Apoyarse en que
    // coincidían era apoyarse en el bug del cierre (#1029).
    for (const [nombre, { cmds, arcoReal }] of Object.entries(CURVAS)) {
      const ring = ok(buildRing(cmds, 2));
      const arco = distanceAt(ring, { commandIndex: 1, tLocal: 1 });
      expect(arco, `${nombre}: se esperaba el arco real`).toBeCloseTo(arcoReal, 2);
    }
  });

  it('y por eso NO coincide con v1, que subestima el arco de las curvas', () => {
    // Se comparan los arcos DEL COMANDO de la curva, no los totales del
    // contorno: estas figuras son `M + C` sin `Z`, y v1 cierra siempre por
    // wrap-around mientras que v2 solo cierra con un `Z` explícito. Comparar
    // los totales sería comparar un contorno cerrado con uno abierto — el
    // primer intento de este test lo hacía y era una contradicción, no un
    // fallo de la implementación.
    //
    // Si los arcos coincidieran, el versionado no haría nada y sobraría toda
    // la tanda. La diferencia tiene cota por los dos lados: medida entre
    // 0,02% y 0,25% en curvas de patronaje. Un v2 que devolviera v1
    // desplazado 1e-12 pasaría un test de "distintos" y hay que cazarlo.
    const arcoDelComando = (cmds: PathCommand[], m: 1 | 2) =>
      distanceAt(ok(buildRing(cmds, m)), { commandIndex: 1, tLocal: 1 });

    // El costado va aparte: es casi recto, y en una recta el aplanado y el
    // arco coinciden. Exigirle una diferencia mínima sería exigir que la
    // métrica vieja falle donde no falla.
    for (const [nombre, { cmds, arcoReal }] of Object.entries(CURVAS)) {
      const v1 = arcoDelComando(cmds, 1);
      const v2 = arcoDelComando(cmds, 2);
      expect(v2, `${nombre}: v2 mide el arco real`).toBeCloseTo(arcoReal, 2);
      expect(v2, `${nombre}: v2 nunca es menor — el aplanado corta esquinas`)
        .toBeGreaterThanOrEqual(v1);

      if (nombre === 'costado') continue;
      const pct = (v2 - v1) / v2 * 100;
      expect(pct, `${nombre}: la diferencia debe ser real, no un epsilon`).toBeGreaterThan(0.005);
      expect(pct, `${nombre}: y no puede ser enorme, o algo está mal`).toBeLessThan(1);
    }
  });

  it('en una curva casi recta las dos métricas coinciden, y eso es correcto', () => {
    // El complemento del test de arriba: v1 no es "mala en todas partes",
    // es mala donde hay curvatura. Sin este caso, alguien podría "arreglar"
    // v1 metiéndole un sesgo constante y el test anterior seguiría verde.
    const arco = (m: 1 | 2) =>
      distanceAt(ok(buildRing(CURVAS.costado.cmds, m)), { commandIndex: 1, tLocal: 1 });
    expect(arco(1)).toBeCloseTo(arco(2), 3);
  });

  it('rechaza los arcos A con un resultado tipado, sin lanzar', () => {
    // Lanzar tumbaría el lienzo: ningún consumidor de resolveNotchAnchor
    // captura excepciones (notchReanchor.ts:49, useNotchTool.ts:207,
    // gradingEngine.ts:252). El error viaja como valor.
    const r = buildRing(conArco, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('arc-unsupported');
      expect(r.commandIndex).toBe(1);
    }
  });

  it('no mide a través de un salto entre subpaths', () => {
    // Lo que este test defiende es la AUSENCIA DE PUENTES, no un total.
    // Cada subpath cierra sobre sí mismo — los dos son tramos de 10mm, así
    // que ida y vuelta son 20 cada uno: 40. v1 da 220 porque sí puentea.
    const ring = ok(buildRing(dosSubpaths, 2));
    expect(ring.totalMm).toBeLessThan(ok(buildRing(dosSubpaths, 1)).totalMm);
    expect(ring.totalMm).toBeCloseTo(40, 6);
    // Y ningún punto del anillo cae en el hueco de 90mm entre los dos.
    for (let d = 0; d < ring.totalMm; d += 1) {
      const { x } = pointAt(ring, d).point;
      expect(x <= 10.001 || x >= 99.999, `puente en d=${d}: x=${x}`).toBe(true);
    }
  });

  it('sabe cuántos subpaths tiene', () => {
    expect(ok(buildRing(dosSubpaths, 2)).subpathCount).toBe(2);
    expect(ok(buildRing(rect(10, 10), 2)).subpathCount).toBe(1);
  });
});

// ─── La vuelta, que hoy no existe en ninguna parte ────────────────────────

describe('ida y vuelta — contra un oráculo externo, no contra sí misma', () => {
  it('distanceAt(pointAt(d)) devuelve d, en recta', () => {
    const ring = ok(buildRing(rect(100, 200), 2));
    for (const d of [0, 50, 100, 250, 599.9]) {
      const p = pointAt(ring, d);
      expect(distanceAt(ring, { commandIndex: p.commandIndex, tLocal: p.tLocal })).toBeCloseTo(d, 2);
    }
  });

  it('y en curva, que es donde la parametrización por t de Bézier fallaría', () => {
    const ring = ok(buildRing(CURVAS.cadera.cmds, 2));
    for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const d = ring.totalMm * frac;
      const p = pointAt(ring, d);
      expect(distanceAt(ring, { commandIndex: p.commandIndex, tLocal: p.tLocal })).toBeCloseTo(d, 2);
    }
  });

  it('la mitad de la longitud cae a la mitad del ARCO, no en el t=0.5 de la curva', () => {
    // Éste es el test que separa una parametrización de verdad de un
    // `s = t·L` con inversa `t = s/L`, que hace round-trip perfecto y mide mal.
    // En la cadera en S, el t nativo 0.5 y el punto a media longitud caen en
    // sitios distintos; se compara contra la integración numérica.
    const { cmds } = CURVAS.cadera;
    const ring = ok(buildRing(cmds, 2));
    // La mitad del ARCO DE LA CURVA, dicho explícitamente. Antes se escribía
    // `ring.totalMm / 2`, que solo coincidía porque el anillo no cerraba;
    // decirlo así deja de depender de una propiedad accidental de la figura.
    const mitad = pointAt(ring, CURVAS.cadera.arcoReal / 2);

    const P = [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 20, y: 90 }, { x: 60, y: 130 }];
    const en = (t: number) => {
      const u = 1 - t;
      return {
        x: u*u*u*P[0].x + 3*u*u*t*P[1].x + 3*u*t*t*P[2].x + t*t*t*P[3].x,
        y: u*u*u*P[0].y + 3*u*u*t*P[1].y + 3*u*t*t*P[2].y + t*t*t*P[3].y,
      };
    };
    // Integración numérica: hasta qué t se acumula la mitad del arco.
    const N = 200000;
    let acc = 0, prev = en(0), tMitad = 0;
    for (let i = 1; i <= N; i++) {
      const cur = en(i / N);
      acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      prev = cur;
      if (acc >= CURVAS.cadera.arcoReal / 2 && tMitad === 0) tMitad = i / N;
    }
    const esperado = en(tMitad);
    expect(mitad.point.x).toBeCloseTo(esperado.x, 1);
    expect(mitad.point.y).toBeCloseTo(esperado.y, 1);
    // Y NO es el t=0.5 nativo: si lo fuera, la parametrización sería falsa.
    const nativo = en(0.5);
    expect(Math.hypot(mitad.point.x - nativo.x, mitad.point.y - nativo.y)).toBeGreaterThan(0.5);
  });
});

// ─── El anillo es cíclico ─────────────────────────────────────────────────

describe('advance — el sentido lo fija quien mide, no la geometría', () => {
  const ring = ok(buildRing(rect(250, 250), 2));   // perímetro 1000

  it('cruzar el cero por delante mide corto', () => {
    expect(advance(ring, 990, 10, 'cw')).toBeCloseTo(20, 6);
  });

  it('el mismo par en el otro sentido mide largo — no devuelve la mínima', () => {
    expect(advance(ring, 990, 10, 'ccw')).toBeCloseTo(980, 6);
  });

  it('no moverse es cero', () => {
    expect(advance(ring, 100, 100, 'cw')).toBe(0);
  });
});
