/**
 * El ancla dice con qué se midió — Task 2 de la tanda 2a (#1029).
 *
 * La decisión que estos tests protegen: los piquetes que María ya tiene
 * guardados se midieron con el contorno aplanado a 12 subdivisiones, y NO se
 * pueden mover. Así que el ancla gana un campo que declara su métrica, la
 * ausencia significa "la vieja", y cada escritor tiene una política explícita.
 * El que se olvide crea datos que mienten sobre sí mismos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InternalLine, NotchAnchor, PathCommand, PatternPiece } from '../../types/types';
import { computeNotchAnchor, resolveNotchAnchor } from '../notchAnchor';
import { reanchorTransformedNotches, reanchorNotches } from '../notchReanchor';
import { createMirrorNotchLine } from '../seam/notchMirror';
import { gradePiece } from '../grading/gradingEngine';
import { parseVinaProject } from '../projectSchema';
import { importDXFContent } from '../dxf';

// ─── La figura y sus números medidos ──────────────────────────────────────
//
// Tres lados rectos y un costado curvo. El vértice (100,0) es el inicio del
// comando C, así que está a exactamente 100mm de arco del origen en ambas
// métricas: toda la divergencia que se mide abajo viene de la CURVA, no de
// dónde empieza a contarse.
const pieza: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [130, 60, 120, 140, 100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];
const ESQUINA = { x: 100, y: 0 };

// Oráculo EXTERNO: integración numérica a 4·10⁶ muestras sobre la cúbica,
// hecha aparte. Es el punto que está a 100mm de arco REAL de la esquina.
// Comparar contra esto y no contra la propia función es lo que hace que el
// test signifique algo.
const ORACULO = { x: 118.836588243, y: 97.200374786 };

// El punto que la métrica vieja devuelve hoy para esa misma ancla, congelado
// con todos sus decimales. No es "lo que debería dar": es lo que da, y la
// tanda promete que va a seguir dándolo.
const V1_CONGELADO = { x: 118.76376055960233, y: 97.2295406667279 };

const anclaVieja: NotchAnchor = { refPoint: ESQUINA, direction: 'cw', distanceMm: 100 };
const anclaNueva: NotchAnchor = { ...anclaVieja, metric: 2 };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ─── 1. El contrato de la tanda ───────────────────────────────────────────

describe('un ancla sin métrica no se mueve — el contrato de la tanda', () => {
  it('resuelve en el MISMO punto que hoy, con diferencia cero', () => {
    const r = resolveNotchAnchor(pieza, anclaVieja);
    expect(r).not.toBeNull();
    expect(r!.point.x).toBe(V1_CONGELADO.x);
    expect(r!.point.y).toBe(V1_CONGELADO.y);
  });

  it('un metric basura degrada a la métrica vieja en vez de romper', () => {
    // Las gradeRules pasan por `.loose()` sin validar (patternPieceSchema),
    // así que un metric inválido PUEDE llegar hasta aquí. Que degrade a v1 es
    // la dirección conservadora: el piquete no se mueve.
    const basura = { ...anclaVieja, metric: 99 } as unknown as NotchAnchor;
    const r = resolveNotchAnchor(pieza, basura);
    expect(r).not.toBeNull();
    expect(r!.point.x).toBe(V1_CONGELADO.x);
    expect(r!.point.y).toBe(V1_CONGELADO.y);
  });
});

// ─── 2 y 3. La métrica nueva, y cuánto se separa de la vieja ──────────────

describe('un ancla con metric 2 se mide bien', () => {
  it('cae sobre el oráculo externo, no sobre el punto viejo', () => {
    const r = resolveNotchAnchor(pieza, anclaNueva);
    expect(r).not.toBeNull();
    expect(dist(r!.point, ORACULO)).toBeLessThan(1e-4);
  });

  it('la métrica vieja falla contra ese mismo oráculo por ~0,078mm', () => {
    // El test hermano del anterior: sin él, "v2 acierta" no dice nada sobre
    // si valía la pena. Este número ES la razón de la tanda.
    const r = resolveNotchAnchor(pieza, anclaVieja);
    expect(dist(r!.point, ORACULO)).toBeGreaterThan(0.05);
    expect(dist(r!.point, ORACULO)).toBeLessThan(0.11);
  });

  it('las dos métricas dan puntos separados por la cantidad calculada', () => {
    // Cota por los dos lados: un v2 que devolviera el punto de v1 desplazado
    // 10⁻¹² pasaría un test de "son distintos". Éste no.
    const v1 = resolveNotchAnchor(pieza, anclaVieja)!;
    const v2 = resolveNotchAnchor(pieza, anclaNueva)!;
    const sep = dist(v1.point, v2.point);
    expect(sep).toBeGreaterThan(0.06);
    expect(sep).toBeLessThan(0.10);
  });

  it('devuelve una normal unitaria, igual que la métrica vieja', () => {
    const r = resolveNotchAnchor(pieza, anclaNueva)!;
    expect(Math.hypot(r.normal.x, r.normal.y)).toBeCloseTo(1, 6);
    // Y apunta al mismo lado que la vieja: la normal es hacia dentro en ambas.
    const v1 = resolveNotchAnchor(pieza, anclaVieja)!;
    expect(r.normal.x * v1.normal.x + r.normal.y * v1.normal.y).toBeGreaterThan(0.99);
  });
});

// ─── El escritor común ────────────────────────────────────────────────────

describe('computeNotchAnchor — un ancla nueva se mide bien por defecto', () => {
  it('estampa metric 2 sin que nadie se lo pida', () => {
    const a = computeNotchAnchor(pieza, { x: 100, y: 100 });
    expect(a).not.toBeNull();
    expect(a!.metric).toBe(2);
  });

  it('se le puede pedir la métrica vieja, y entonces no estampa nada', () => {
    // Ausencia = 1. Estampar `metric: 1` sería redundante y crearía dos
    // representaciones del mismo hecho.
    const a = computeNotchAnchor(pieza, { x: 100, y: 100 }, 1);
    expect(a).not.toBeNull();
    expect(a!.metric).toBeUndefined();
  });

  it('un ancla recién creada con metric 2 se resuelve donde se pidió', () => {
    // El viaje completo: medir un punto y volver a él. Si computeNotchAnchor
    // midiera con v2 pero resolveNotchAnchor leyera con v1, el piquete
    // aparecería desplazado justo al crearlo.
    const objetivo = resolveNotchAnchor(pieza, anclaNueva)!.point;
    const a = computeNotchAnchor(pieza, objetivo)!;
    const vuelta = resolveNotchAnchor(pieza, a)!;
    expect(dist(vuelta.point, objetivo)).toBeLessThan(1e-3);
  });

  it('en un contorno con arco A cae a la métrica vieja en vez de fallar', () => {
    // v2 no sabe medir 'A' y devuelve arc-unsupported. Medir con la vieja y
    // no estampar nada es honesto; tumbar la app no.
    const conArco: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'A', values: [50, 50, 0, 0, 1, 100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const a = computeNotchAnchor(conArco, { x: 50, y: 0 });
    expect(a).not.toBeNull();
    expect(a!.metric).toBeUndefined();
  });
});

// ─── El schema, que es donde el campo se borraba en silencio ──────────────

const proyectoCon = (anchor?: NotchAnchor) => ({
  id: 'proj-1',
  name: 'p',
  pieces: [{
    id: 'piece-1',
    name: 'Pieza',
    outline: pieza,
    internals: [{
      id: 'notch-1',
      type: 'notch' as const,
      path: [{ type: 'M' as const, values: [0, 0] }, { type: 'L' as const, values: [0, 5] }],
      ...(anchor ? { notchAnchor: anchor } : {}),
    }],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
  }],
  seams: [],
  fabrics: [{ id: 'f', name: 'C', color: '#fff', weight: 150, stretch: 0.1, stiffness: 0.3, friction: 0.5 }],
  avatar: {
    id: 'a', name: 'D', modelUrl: '/models/avatar.glb',
    measurements: { height: 170, chest: 90, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 },
  },
  createdAt: 1000,
  updatedAt: 1000,
});

const anclaDe = (r: ReturnType<typeof parseVinaProject>): NotchAnchor | undefined => {
  if (!r.ok) throw new Error(`no parseó: ${JSON.stringify(r.error)}`);
  return r.project.pieces[0].internals[0].notchAnchor;
};

describe('el schema conserva la métrica — el borrado silencioso', () => {
  it('un proyecto viejo sin el campo carga y sigue sin él', () => {
    expect(anclaDe(parseVinaProject(proyectoCon(anclaVieja)))).toEqual(anclaVieja);
    expect(anclaDe(parseVinaProject(proyectoCon(anclaVieja)))!.metric).toBeUndefined();
  });

  it('metric 2 SOBREVIVE a guardar y volver a cargar', () => {
    // El test que caza el fallo real: notchAnchorSchema es un z.object sin
    // .loose() — el .loose() está en el padre y no se propaga al objeto
    // anidado. Zod borra las claves desconocidas de un objeto estricto, así
    // que sin declarar el campo el versionado no sobrevive un round-trip.
    const primera = parseVinaProject(proyectoCon(anclaNueva));
    expect(anclaDe(primera)!.metric).toBe(2);
    const segunda = parseVinaProject(JSON.parse(JSON.stringify(
      { ...proyectoCon(anclaNueva), pieces: (primera as { ok: true; project: { pieces: unknown[] } }).project.pieces },
    )));
    expect(anclaDe(segunda)!.metric).toBe(2);
  });

  it('rechaza un metric que no sea 1 ni 2', () => {
    for (const malo of [0, 3, 2.5, -1, 'dos', null]) {
      const r = parseVinaProject(proyectoCon({ ...anclaVieja, metric: malo } as unknown as NotchAnchor));
      expect(r.ok, `metric=${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
  });

  it('acepta metric 1 explícito', () => {
    expect(anclaDe(parseVinaProject(proyectoCon({ ...anclaVieja, metric: 1 })))!.metric).toBe(1);
  });
});

// ─── Los escritores que HEREDAN en vez de estrenar ────────────────────────

const piquete = (anchor: NotchAnchor): InternalLine => ({
  id: 'n1',
  type: 'notch',
  path: [{ type: 'M', values: [118, 97] }, { type: 'L', values: [113, 97] }],
  notchAnchor: anchor,
});

describe('reanclar tras transformar conserva la métrica del ancla que recomputa', () => {
  // El caso peligroso: recomputar con v2 un ancla vieja la movería, que es
  // justo lo que la decisión prohíbe.
  const escalar = (f: number) => (p: { x: number; y: number }) => ({ x: p.x * f, y: p.y * f });
  const piezaEscalada = pieza.map(c => ({ ...c, values: c.values.map(v => v * 2) }));

  it('una vieja sigue siendo vieja', () => {
    const out = reanchorTransformedNotches([piquete(anclaVieja)], pieza, piezaEscalada, escalar(2));
    expect(out[0].notchAnchor!.metric).toBeUndefined();
  });

  it('una nueva sigue siendo nueva', () => {
    const out = reanchorTransformedNotches([piquete(anclaNueva)], pieza, piezaEscalada, escalar(2));
    expect(out[0].notchAnchor!.metric).toBe(2);
  });

  it('reanchorNotches también la conserva al seguir una esquina movida', () => {
    const movida: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [105, 0] },
      { type: 'C', values: [135, 60, 125, 140, 105, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ];
    const out = reanchorNotches([piquete(anclaNueva)], movida, pieza);
    expect(out[0].notchAnchor!.metric).toBe(2);
  });
});

describe('el espejo hereda la métrica del piquete de origen', () => {
  const destino: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ];
  const mapped = { point: { x: 100, y: 100 }, normal: { x: -1, y: 0 } };

  it('el espejo de un piquete viejo sigue siendo viejo', () => {
    const l = createMirrorNotchLine(destino, mapped, { notchAnchor: anclaVieja });
    expect(l.notchAnchor).toBeDefined();
    expect(l.notchAnchor!.metric).toBeUndefined();
  });

  it('el espejo de uno nuevo lleva metric 2', () => {
    const l = createMirrorNotchLine(destino, mapped, { notchAnchor: anclaNueva });
    expect(l.notchAnchor!.metric).toBe(2);
  });

  it('el espejo de uno sin ancla estrena la métrica nueva', () => {
    const l = createMirrorNotchLine(destino, mapped, {});
    expect(l.notchAnchor!.metric).toBe(2);
  });
});

// ─── Graduación y DXF ─────────────────────────────────────────────────────

describe('graduar conserva la métrica y escala la distancia', () => {
  const conPiquete = (anchor: NotchAnchor): PatternPiece => ({
    id: 'p1', name: 'P', outline: pieza, internals: [piquete(anchor)],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, active: true, createdAt: 1, updatedAt: 1,
  });
  const base = { chest: 90 }, doble = { chest: 180 };

  it('ausente sigue ausente, y distanceMm escala por el factor', () => {
    const g = gradePiece(conPiquete(anclaVieja), base, doble, 'chest');
    expect(g.internals[0].notchAnchor!.metric).toBeUndefined();
    expect(g.internals[0].notchAnchor!.distanceMm).toBeCloseTo(200, 6);
  });

  it('metric 2 sigue siendo 2', () => {
    const g = gradePiece(conPiquete(anclaNueva), base, doble, 'chest');
    expect(g.internals[0].notchAnchor!.metric).toBe(2);
  });
});

describe('DXF: un patrón recién importado se mide con la métrica nueva', () => {
  it('los piquetes del patrón de María llevan metric 2 al importarse', () => {
    // Importar es MEDIR, no preservar: nada viejo se está conservando aquí.
    // Si esto se estampara como v1, cada importación futura arrastraría el
    // error de 12 subdivisiones para siempre.
    const dxf = readFileSync(
      resolve(__dirname, '../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf'),
      'utf8',
    );
    const { pieces } = importDXFContent(dxf, { unit: 'auto', autoDetect: true });
    const anclas = pieces.flatMap(p => p.internals
      .filter(l => l.type === 'notch' && l.notchAnchor)
      .map(l => l.notchAnchor!));

    expect(anclas.length).toBeGreaterThan(0);
    expect(anclas.every(a => a.metric === 2)).toBe(true);
  });
});
