import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../../sistema';
import { ESTADO_MEMBRANA } from '../../membrana';
import { escenaCostura, escenaCusick, escenaEsfera, escenaPunta, TELA_DE_LABORATORIO } from '../../banco/escenas';
import { azar } from '../../__tests__/ayudas';
import { empaquetar, NINGUNA, type PaqueteGpu } from '../empaquetar';

/** Lo que gradElem y prepCostura escriben en cada ranura de aporte (un vec3 por ranura), desde el estado linealizado. */
function ranuras(s: SistemaTela): Float64Array {
  const nt = s.tris.length / 3, cs = s.costuras, out = new Float64Array(3 * (15 * nt + 3 * cs.n));
  const em = s.membrana.estado, c = s.coef, kC = s.tela.kCizalla, { bisDeTri, K, estado: ep } = s.placa;
  for (let t = 0; t < nt; t++) {
    const e = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
    const gu = em[e + 8], gv = em[e + 9];
    const ks = kC * (em[e] * em[e + 3] + em[e + 1] * em[e + 4] + em[e + 2] * em[e + 5]);
    for (let j = 0; j < 3; j++) {
      for (let d = 0; d < 3; d++) {
        const fu = em[e + d], fv = em[e + 3 + d];
        out[3 * (3 * t + j) + d] = A0 * (gu * c[o + j] * fu + gv * c[o + 3 + j] * fv + ks * (c[o + j] * fv + c[o + 3 + j] * fu));
      }
    }
    const th = [0, 1, 2].map((k) => (bisDeTri[3 * t + k] < 0 ? 0 : ep[13 * bisDeTri[3 * t + k]]));
    for (let k = 0; k < 3; k++) {
      const h = bisDeTri[3 * t + k];
      if (h < 0) continue;
      const w = K[9 * t + 3 * k] * th[0] + K[9 * t + 3 * k + 1] * th[1] + K[9 * t + 3 * k + 2] * th[2];
      for (let r = 0; r < 4; r++) for (let d = 0; d < 3; d++) out[3 * (3 * nt + 12 * t + 4 * k + r) + d] = w * ep[13 * h + 1 + 3 * r + d];
    }
  }
  for (let e = 0; e < cs.n; e++) {
    const w = cs.pesos(e), o = 6 * e, g = cs.estado[o + 3];
    for (let m = 0; m < 3; m++) for (let d = 0; d < 3; d++) out[3 * (15 * nt + 3 * e + m) + d] = w[m] * g * cs.estado[o + d];
  }
  return out;
}

/** Los bloques en franjas armados desde los códigos, como `ensamblar` en la GPU (9 por posición, fila mayor). */
function franjas(s: SistemaTela, p: PaqueteGpu): Float64Array {
  const vals = new Float64Array(9 * p.nq), M = new Float64Array(9);
  for (let b = 0; b < p.nb; b++) {
    M.fill(0);
    const i = p.u32.blqFila[b], j = p.u32.blqCol[b];
    for (let k = p.u32.blqOff[b]; k < p.u32.blqOff[b + 1]; k++) {
      const cod = p.u32.blqCod[k];
      if (cod >= 0x80000000) s.placa.sumarBloque(cod - 0x80000000, i, j, M);
      else if (cod >= 0x40000000) {
        const k = cod - 0x40000000;
        s.costuras.sumarBloque(k >>> 4, (k >>> 2) & 3, k & 3, M);
      } else s.membrana.sumarBloque(cod >>> 4, (cod >>> 2) & 3, cod & 3, M);
    }
    vals.set(M, 9 * p.u32.posDe[b]);
  }
  return vals;
}

describe('el paquete de la tela para la GPU', () => {
  const e = escenaCusick(20);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
  const r = azar(41);
  for (let q = 0; q < s.x.length; q++) s.x[q] += 0.003 * r();
  s.linealizar();
  const p = empaquetar(s);

  it('los aportes de cada vértice suman el gradiente elástico', () => {
    const slot = ranuras(s), g = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      for (let k = p.u32.aporOff[i]; k < p.u32.aporOff[i + 1]; k++) for (let d = 0; d < 3; d++) g[3 * i + d] += slot[3 * p.u32.aporIdx[k] + d];
    }
    s.gradienteElastico(esperado);
    for (let q = 0; q < g.length; q++) expect(g[q]).toBeCloseTo(esperado[q], 9);
  });

  it('la matriz en franjas de 32, armada desde los códigos, da H·p', () => {
    const vals = franjas(s, p), v = Float64Array.from({ length: 3 * s.n }, () => r());
    const Ap = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      const f = i >> 5, carril = i & 31;
      for (let k = 0; k < p.u32.franjaAncho[f]; k++) {
        const q = p.u32.franjaBase[f] + 32 * k + carril, j = p.u32.colSell[q];
        if (j === NINGUNA) continue;
        for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) Ap[3 * i + a] += vals[9 * q + 3 * a + c] * v[3 * j + c];
      }
    }
    s.hessianaPor(v, esperado);
    for (let q = 0; q < Ap.length; q++) expect(Ap[q]).toBeCloseTo(esperado[q], 6);
  });

  it('diag apunta al bloque (i, i) de cada fila', () => {
    for (let i = 0; i < s.n; i++) expect(p.u32.colSell[p.u32.diag[i]]).toBe(i);
  });

  it('sin pandeo (Infinity) y con compresión gratis (0) las cargas quedan finitas', () => {
    for (const pandeo of [Infinity, 0]) {
      const s2 = new SistemaTela(e.malla, { ...TELA_DE_LABORATORIO, pandeo }, { obstaculos: e.obstaculos });
      expect(empaquetar(s2).f32.pcr.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('el paquete de una prenda cosida', () => {
  const e = escenaCostura(30);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { costuras: e.costuras, franja: e.franja, ajustes: { contactoPropio: false } });
  const r = azar(43);
  for (let q = 0; q < s.x.length; q++) s.x[q] += 0.003 * r();
  s.linealizar();
  const p = empaquetar(s);

  it('los aportes de cada vértice suman el gradiente elástico, con las costuras', () => {
    const slot = ranuras(s), g = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      for (let k = p.u32.aporOff[i]; k < p.u32.aporOff[i + 1]; k++) for (let d = 0; d < 3; d++) g[3 * i + d] += slot[3 * p.u32.aporIdx[k] + d];
    }
    s.gradienteElastico(esperado);
    for (let q = 0; q < g.length; q++) expect(g[q]).toBeCloseTo(esperado[q], 9);
  });

  it('la matriz en franjas, armada desde los códigos, da H·p con las costuras', () => {
    const vals = franjas(s, p), v = Float64Array.from({ length: 3 * s.n }, () => r());
    const Ap = new Float64Array(3 * s.n), esperado = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) {
      const f = i >> 5, carril = i & 31;
      for (let k = 0; k < p.u32.franjaAncho[f]; k++) {
        const q = p.u32.franjaBase[f] + 32 * k + carril, j = p.u32.colSell[q];
        if (j === NINGUNA) continue;
        for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) Ap[3 * i + a] += vals[9 * q + 3 * a + c] * v[3 * j + c];
      }
    }
    s.hessianaPor(v, esperado);
    for (let q = 0; q < Ap.length; q++) expect(Ap[q]).toBeCloseTo(esperado[q], 6);
  });

  it('lleva el largo de cada punto y dónde encender cada bisagra de costura', () => {
    expect(p.nc).toBe(s.costuras.n);
    expect(Array.from(p.f32.cl)).toEqual(Array.from(Float32Array.from(s.costuras.L)));
    expect(Array.from(p.u32.costuraK)).toEqual(s.placa.costura.map((c) => c.o));
  });

  it('lleva las puntadas como la CPU: qué punto se cose, de cuál depende cada vértice y cuáles sostiene (E8)', () => {
    const c = s.costuras;
    expect(Array.from(p.u32.cSoldable)).toEqual(Array.from(c.soldable));
    expect(Array.from(p.u32.dependeDe)).toEqual(Array.from(c.dependeDe, (e) => (e < 0 ? NINGUNA : e)));
    expect(Array.from(p.u32.cInversa)).toEqual(Array.from(c.inversa));
    for (let i = 0; i < s.n; i++) {
      const esperado = [...Array(c.n).keys()].filter((e) => c.soldable[e] && (c.b0[e] === i || c.b1[e] === i));
      expect(Array.from(p.u32.depIdx.subarray(p.u32.depOff[i], p.u32.depOff[i + 1]))).toEqual(esperado);
    }
    expect(Array.from(p.f32.ccos)).toEqual(Array.from(c.cosido));
    expect(Array.from(p.f32.cdes)).toEqual(Array.from(Float32Array.from(c.desfase)));
  });
});

describe('el paquete con un cuerpo', () => {
  it('lleva el BVH del cuerpo tal cual', () => {
    const e = escenaEsfera();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, ajustes: { contactoPropio: false } });
    const p = empaquetar(s), o = e.obstaculos[0];
    if (o.tipo !== 'cuerpo') throw new Error('la escena trae un cuerpo');
    const bvh = o.cuerpo.bvh;
    expect(p.ncu).toBe(bvh.nodeCount);
    expect(Array.from(p.u32.cuSalto)).toEqual(Array.from(bvh.skip));
    expect(Array.from(p.f32.cuTri)).toEqual(Array.from(bvh.triVerts));
    expect(Array.from(p.f32.cuPv)).toEqual(Array.from(bvh.vertexPseudonormals));
  });

  it('con dos cuerpos se niega', () => {
    const e = escenaEsfera();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: [...e.obstaculos, ...e.obstaculos], ajustes: { contactoPropio: false } });
    expect(() => empaquetar(s)).toThrow(/un solo cuerpo/);
  });

  it('con un cuerpo, la rejilla lleva también sus vértices', () => {
    const e = escenaPunta();
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
    const p = empaquetar(s), o = e.obstaculos[0];
    if (o.tipo !== 'cuerpo') throw new Error('la escena trae un cuerpo');
    expect(p.nvb).toBe(o.cuerpo.vertices.length / 3);
    expect(p.np).toBe(s.n + p.nvb);
    expect(Array.from(p.f32.cuNormales)).toEqual(Array.from(Float32Array.from(o.cuerpo.normales)));
  });
});

describe('el paquete con contacto propio', () => {
  const e = escenaCostura(30);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { costuras: e.costuras, franja: e.franja });
  const p = empaquetar(s);

  it('lleva los compañeros de costura de cada vértice, como la CPU', () => {
    for (let i = 0; i < s.n; i++) expect(Array.from(p.u32.exIdx.subarray(p.u32.exOff[i], p.u32.exOff[i + 1]))).toEqual(s.excluidos[i]);
  });

  it('la rejilla tiene al menos dos celdas por punto y la capacidad de pares es la pedida', () => {
    expect(p.propio).toBe(true);
    expect(p.nceldas & (p.nceldas - 1)).toBe(0);
    expect(p.nceldas).toBeGreaterThanOrEqual(2 * p.np);
    expect(empaquetar(s, { maxPares: 8 }).maxPares).toBe(8);
  });
});
