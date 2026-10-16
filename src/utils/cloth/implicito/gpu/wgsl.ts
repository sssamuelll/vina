/**
 * La memoria de la GPU y el WGSL del motor implícito (spec 2026-10-13 §4.2.2). El WGSL se genera para cada
 * escena: tamaños, desplazamientos, ajustes y obstáculos van como constantes. La física es la de paso.ts,
 * en el mismo orden; el cuadro entero cabe en un pase de cómputo y las sumas se reducen en la GPU.
 */
import { ALCANCE_MAXIMO, celdaDeLaRejilla, celdaDeRegion } from '../contactoPropio';
import { EPS_FRICCION, HOLGURA_DE_APOYO, VELOCIDAD_DE_DESPEGUE } from '../contactos';
import { CIERRE_POR_CUADRO, CUADROS_DE_PUNTADA, LARGO_CERRADO, MUESTRAS_DE_PUNTADA } from '../costuras';
import { RADIO_DE_BUSQUEDA, type Obstaculo } from '../obstaculos';
import type { SistemaTela } from '../sistema';
import type { PaqueteGpu } from './empaquetar';
import { wgslCuerpoCercano, wgslPuntoMasCercano } from './wgslCuerpo';
import { wgslPropio } from './wgslPropio';

/** Hilos por grupo de trabajo. */
export const WG = 128;

/** Los escalares del cuadro, en la zona SC de `red`. */
export const ESC = {
  RZ: 0, RZ0: 1, HECHO: 4, ACTIVO: 5, PROYECTADOS: 6, ALFA_LS: 7, PROBANDO: 8,
  CUADRO: 9, QUIETUD: 10, QMAX: 11, ITER: 12, DG: 13, ALFA_FINAL: 14, COSIDA: 15, RZ_IMPAR: 16,
} as const;
const N_ESC = 32;

/** Las entradas de cómputo, en el orden en que las despacha un cuadro. */
export const ENTRADAS = [
  'encoger', 'ubicar', 'inicio', 'prepTri', 'prepHinge', 'gradElem', 'prepCostura', 'ensamblar',
  'limpiarPares', 'limpiarCeldas', 'anotarRegiones', 'hashContar', 'scanCBloques', 'scanCTotales', 'scanCSumar', 'hashLlenar',
  'limpiarPuntas', 'paresDeTriangulo', 'limpiarVertices', 'contarEntradas', 'scanVBloques', 'scanVTotales', 'scanVSumar', 'llenarEntradas',
  'residuo', 'sumarInicio', 'aportePares', 'spmv', 'actualizar', 'nuevaP', 'expandirP',
  'prepBusqueda', 'posPrueba', 'anguloPrueba', 'difTri', 'difCostura', 'difPares', 'decidir', 'aplicar',
  'cerrarCuadro', 'cerrarCosturas', 'revisarCosido', 'coser',
] as const;

/** Desplazamientos seguidos para los tamaños dados, en el orden de las claves, y el total. */
function zonas<K extends string>(tamanos: Record<K, number>): Record<K, number> & { total: number } {
  const o: Record<string, number> = {};
  let total = 0;
  for (const k of Object.keys(tamanos) as K[]) {
    o[k] = total;
    total += tamanos[k];
  }
  o.total = total;
  return o as Record<K, number> & { total: number };
}

type ZonaVf = 'XT' | 'V' | 'R' | 'Z' | 'AP' | 'DX' | 'XP' | 'MASA' | 'EV0' | 'PINV' | 'CONT' | 'RN' | 'DC';
type ZonaTf =
  | 'COEF' | 'KP' | 'PCR' | 'TRI' | 'E0' | 'HD' | 'THP' | 'CONTRIB' | 'CS' | 'CL' | 'CST' | 'CE0' | 'CKH' | 'CCOS' | 'CDES'
  | 'CUN' | 'CUT' | 'CUNT' | 'CUPA' | 'CUPV' | 'CUV' | 'CUVN' | 'SOST' | 'HP' | 'OFFC' | 'ORD4' | 'PAR' | 'OFFV' | 'ENT' | 'SCB'
  | 'APORTE';
/** el búfer atómico del contacto propio: cuentas y cursores de la rejilla y de las listas, los pares y los desbordes */
type ZonaAt = 'CNTC' | 'CURC' | 'VREG' | 'CNTV' | 'CURV' | 'NPAR' | 'DESB';
/** las sumas parciales de cada reducción, los escalares y la historia de la quietud */
type ZonaRed = 'PA' | 'PB' | 'PC' | 'PD' | 'PE' | 'SC' | 'HISTO';

export interface Distribucion {
  /** por vértice, en f32: inicio de cada arreglo */
  vf: Record<ZonaVf, number> & { total: number };
  /** por elemento, en f32 */
  tf: Record<ZonaTf, number> & { total: number };
  /** dónde empieza cada arreglo de índices de `PaqueteGpu['u32']` */
  iu: Record<keyof PaqueteGpu['u32'], number> & { total: number };
  /** las zonas de sumas parciales, los escalares y la historia de la quietud */
  red: Record<ZonaRed, number> & { total: number; HIST: number };
  /** en u32 atómicos */
  at: Record<ZonaAt, number> & { total: number };
  /** grupos de trabajo por vértice, triángulo, bisagra, bloque, punto de costura y bisagra de costura */
  gv: number;
  gt: number;
  gh: number;
  gb: number;
  gc: number;
  gch: number;
  /** grupos por par, por celda de la rejilla, por punto de la rejilla y por vértice del cuerpo */
  gp: number;
  /** grupos que recorren los pares en cada iteración (aportePares) */
  gpa: number;
  gcel: number;
  gpnt: number;
  gvb: number;
}

export function distribuir(p: PaqueteGpu, cuadrosDeHistoria: number): Distribucion {
  const { n, nt, nh } = p;
  const vf = zonas<ZonaVf>({ XT: 3 * n, V: 3 * n, R: 3 * n, Z: 3 * n, AP: 3 * n, DX: 3 * n, XP: 3 * n, MASA: n, EV0: n, PINV: 9 * n, CONT: 6 * n, RN: n, DC: n });
  const tf = zonas<ZonaTf>({
    COEF: 7 * nt, KP: 9 * nt, PCR: 2 * nt, TRI: 14 * nt, E0: nt, HD: 16 * nh, THP: nh, CONTRIB: 45 * nt + 9 * p.nc,
    CS: p.nc, CL: p.nc, CST: 5 * p.nc, CE0: p.nc, CKH: p.nch, CCOS: p.nc, CDES: 3 * p.nc,
    CUN: p.f32.cuNodos.length, CUT: p.f32.cuTri.length, CUNT: p.f32.cuNt.length, CUPA: p.f32.cuPa.length, CUPV: p.f32.cuPv.length,
    CUV: 3 * p.nvb, CUVN: 3 * p.nvb, SOST: 2 * p.nvb, HP: p.np, OFFC: p.nceldas + 1, ORD4: 4 * p.np, PAR: 14 * p.maxPares, OFFV: n + 1, ENT: 4 * p.maxPares,
    SCB: Math.max(Math.ceil(p.nceldas / WG), Math.ceil(n / WG)) + 1,
    // el aporte de cada par activo a A·p, por cada uno de sus cuatro vértices (aportePares)
    APORTE: 12 * p.maxPares,
  });
  const iu = { total: 0 } as Distribucion['iu'];
  for (const k of Object.keys(p.u32) as Array<keyof PaqueteGpu['u32']>) {
    iu[k] = iu.total;
    iu.total += p.u32[k].length;
  }
  const gv = Math.ceil(n / WG), gt = Math.ceil(nt / WG), gh = Math.ceil(nh / WG), gb = Math.ceil(p.nb / WG);
  const gc = Math.ceil(p.nc / WG), gch = Math.ceil(p.nch / WG);
  const gp = Math.ceil(p.maxPares / WG), gcel = Math.ceil(p.nceldas / WG), gpnt = Math.ceil(p.np / WG), gvb = Math.ceil(p.nvb / WG);
  const gpa = Math.min(gp, 256);
  const zona = Math.max(gv, gt, gh, gc, gp, 1);
  const red = { ...zonas<ZonaRed>({ PA: zona, PB: zona, PC: zona, PD: zona, PE: zona, SC: N_ESC, HISTO: cuadrosDeHistoria }), HIST: cuadrosDeHistoria };
  const at = zonas<ZonaAt>({ CNTC: p.nceldas, CURC: p.nceldas, VREG: p.nceldas, CNTV: n, CURV: n, NPAR: 1, DESB: 1 });
  return { vf, tf, iu, red, at, gv, gt, gh, gb, gc, gch, gp, gpa, gcel, gpnt, gvb };
}

/** Bytes de cada búfer, en el orden de las ligaduras del WGSL. */
export function tamanosDeBufer(d: Distribucion, p: PaqueteGpu): Record<'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv' | 'at', number> {
  return {
    pos: 12 * p.n, vf: 4 * d.vf.total, tf: 4 * d.tf.total, iu: 4 * d.iu.total, red: 4 * d.red.total, vals: 36 * Math.max(p.nq, 1), pv: 16 * p.n,
    at: 4 * d.at.total,
  };
}

function flotante(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`wgsl: constante no finita (${v})`);
  return v.toExponential(8);
}

const entero = (v: number): string => `${v >>> 0}u`;

/** La misma distancia que obstaculos.ts: `masCercano(p)` y `obstaculoK(p, k)` devuelven (d, normal). */
export function wgslObstaculos(obs: readonly Obstaculo[]): string {
  const f = flotante;
  const cuerpos = obs.map((o, k) => {
    if (o.tipo === 'cuerpo') return `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> { return cuerpoCercano(p, RADIO_B); }`;
    return o.tipo === 'plano'
      ? `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> { return vec4<f32>(p.y - ${f(o.altura)}, 0.0, 1.0, 0.0); }`
      : `fn obstaculo${k}(p: vec3<f32>) -> vec4<f32> {
  let radio = ${f(o.radio)};
  let tapa = ${f(o.tapa)};
  let r = length(p.xz);
  var rad = vec2<f32>(1.0, 0.0);
  if (r > 1e-12) { rad = p.xz / r; }
  if (r <= radio && p.y >= tapa) { return vec4<f32>(p.y - tapa, 0.0, 1.0, 0.0); }
  if (r > radio && p.y <= tapa) { return vec4<f32>(r - radio, rad.x, 0.0, rad.y); }
  if (r > radio && p.y > tapa) {
    let a = r - radio;
    let b = p.y - tapa;
    let d = sqrt(a * a + b * b);
    return vec4<f32>(d, a / d * rad.x, b / d, a / d * rad.y);
  }
  if (tapa - p.y < radio - r) { return vec4<f32>(-(tapa - p.y), 0.0, 1.0, 0.0); }
  return vec4<f32>(-(radio - r), rad.x, 0.0, rad.y);
}`;
  });
  return `${cuerpos.join('\n')}
struct Cercano { c: vec4<f32>, k: u32 }
fn masCercano(p: vec3<f32>) -> Cercano {
  var m = Cercano(vec4<f32>(1e30, 0.0, 1.0, 0.0), NINGUNA);
${obs.map((_, k) => `  { let c = obstaculo${k}(p); if (c.x < m.c.x) { m = Cercano(c, ${k}u); } }`).join('\n')}
  return m;
}`;
}

/** El WGSL del motor para la escena del sistema `s`, ya empaquetada y distribuida. */
export function wgslDelMotor(s: SistemaTela, p: PaqueteGpu, d: Distribucion): string {
  const f = flotante, u = entero, { aj, tela } = s, { vf, tf, iu, red } = d;
  return /* wgsl */ `// El motor implícito de la tela (spec 2026-10-13 §4.2.2), generado por gpu/wgsl.ts para esta escena.
@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> vf: array<f32>;
@group(0) @binding(2) var<storage, read_write> tf: array<f32>;
@group(0) @binding(3) var<storage, read> iu: array<u32>;
@group(0) @binding(4) var<storage, read_write> red: array<f32>;
// los bloques de la matriz: el elemento (fila r, columna c) del bloque q en (3·r + c)·NQ + q
@group(0) @binding(5) var<storage, read_write> vals: array<f32>;
@group(0) @binding(6) var<storage, read_write> pv: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> at: array<atomic<u32>>;

const N = ${u(p.n)};
const NT = ${u(p.nt)};
const NH = ${u(p.nh)};
const NB = ${u(p.nb)};
const NQ = ${u(Math.max(p.nq, 1))};
const GV = ${u(d.gv)};
const GT = ${u(d.gt)};
const NINGUNA = 0xffffffffu;
${Object.entries(vf).filter(([k]) => k !== 'total').map(([k, v]) => `const O_${k} = ${u(v)};`).join(' ')}
${Object.entries(tf).filter(([k]) => k !== 'total').map(([k, v]) => `const O_${k} = ${u(v)};`).join(' ')}
const I_TRIS = ${u(iu.tris)}; const I_BIS = ${u(iu.bisagras)}; const I_HOT = ${u(iu.bisDeTri)}; const I_FIJO = ${u(iu.fijo)};
const I_AOFF = ${u(iu.aporOff)}; const I_AIDX = ${u(iu.aporIdx)}; const I_BOFF = ${u(iu.blqOff)}; const I_BCOD = ${u(iu.blqCod)}; const I_BRAN = ${u(iu.blqRanura)};
const I_BFILA = ${u(iu.blqFila)}; const I_BCOL = ${u(iu.blqCol)}; const I_FBASE = ${u(iu.franjaBase)};
const I_FANCHO = ${u(iu.franjaAncho)}; const I_COLE = ${u(iu.colSell)}; const I_POSDE = ${u(iu.posDe)}; const I_DIAG = ${u(iu.diag)};
const R_PA = ${u(red.PA)}; const R_PB = ${u(red.PB)}; const R_PC = ${u(red.PC)}; const R_SC = ${u(red.SC)};
const R_HISTO = ${u(red.HISTO)}; const HIST = ${u(red.HIST)}; const R_PD = ${u(red.PD)};
const NC = ${u(p.nc)};
const NCH = ${u(p.nch)};
const GC = ${u(d.gc)};
const I_CV = ${u(iu.costura)}; const I_CK = ${u(iu.costuraK)};
const KCOST = ${f(aj.kCostura)};
const NCU = ${u(p.ncu)};
const I_CUS = ${u(iu.cuSalto)};
const RADIO_B = ${f(RADIO_DE_BUSQUEDA)};
const CIERRE = ${f(CIERRE_POR_CUADRO)};
const CIERRE_MAX = ${f(aj.cierreMaximo)};
const LCERRADO = ${f(LARGO_CERRADO)};
// E8: las puntadas (costuras.ts, coser y expandir)
const UMBRAL_P = ${f(CUADROS_DE_PUNTADA * aj.cierreMaximo)};
const MUESTRAS_P = ${u(MUESTRAS_DE_PUNTADA)};
const I_SOLD = ${u(iu.cSoldable)}; const I_DEPDE = ${u(iu.dependeDe)}; const I_INV = ${u(iu.cInversa)};
const I_DOFF = ${u(iu.depOff)}; const I_DIDX = ${u(iu.depIdx)};
// la primera ranura de aporte de las costuras, después de las de la membrana y la placa
const SLOT_C = 15u * NT;
${Object.entries(ESC).map(([k, v]) => `const E_${k} = ${u(v)};`).join('\n')}
const H = ${f(aj.h)};
const AIRE = ${f(aj.aire)};
const KC = ${f(aj.kContacto)};
const KCP = ${f(aj.kPropio ?? aj.kContacto)};
const GRAV = ${f(aj.gravedad)};
const SEP = ${f(s.sep)};
// E10: el apoyo en el cuerpo (contactos.ts)
const HOLGURA = ${f(HOLGURA_DE_APOYO)};
const DESPEGUE = ${f(VELOCIDAD_DE_DESPEGUE)};
const TOL2 = ${f(aj.tolCG * aj.tolCG)};
const MGH = ${f(Math.max(p.pesoTotal * aj.h, 1e-30))};
const KU = ${f(tela.kTrama)};
const KV = ${f(tela.kUrdimbre)};
const KS = ${f(tela.kCizalla)};
// sin tope, uno que nunca se llega a tocar
const TOPE_P = ${f(Math.min(tela.topePandeo, 3e38))};
const BUSQUEDA = ${aj.busqueda};
const MU_C = ${f(tela.friccionCuerpo)};
const WG = ${u(WG)};
const PROPIO = ${p.propio};
const NP = ${u(p.np)};
const NVB = ${u(p.nvb)};
const NCELDAS = ${u(p.nceldas)};
const MAXP = ${u(p.maxPares)};
const GP = ${u(d.gp)};
const GPA = ${u(d.gpa)};
const R_PE = ${u(red.PE)};
const I_EXO = ${u(iu.exOff)}; const I_EXI = ${u(iu.exIdx)};
${Object.entries(d.at).filter(([k]) => k !== 'total').map(([k, v]) => `const A_${k} = ${u(v)};`).join(' ')}
const SEPP = ${f(p.sepPropia)};
const ALCANCE = ${f(ALCANCE_MAXIMO)};
// la celda de la rejilla de puntos y la de las regiones de rapidez (contactoPropio.ts)
const CELDA = ${f(celdaDeLaRejilla(p.sepPropia, p.aristaMedia))};
const CREG = ${f(celdaDeRegion(p.sepPropia, p.aristaMedia))};
const ARISTA = ${f(p.aristaMedia)};
const MU_T = ${f(tela.friccionTela)};
const EPS_F = ${f(EPS_FRICCION)};
const I3 = mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);

${wgslPuntoMasCercano()}

${wgslCuerpoCercano()}

${wgslPropio()}

${wgslObstaculos(s.obstaculos)}

fn ld(o: u32, i: u32) -> vec3<f32> { let b = o + 3u * i; return vec3<f32>(vf[b], vf[b + 1u], vf[b + 2u]); }
fn st(o: u32, i: u32, a: vec3<f32>) { let b = o + 3u * i; vf[b] = a.x; vf[b + 1u] = a.y; vf[b + 2u] = a.z; }
fn ldx(i: u32) -> vec3<f32> { return vec3<f32>(pos[3u * i], pos[3u * i + 1u], pos[3u * i + 2u]); }
fn stx(i: u32, a: vec3<f32>) { pos[3u * i] = a.x; pos[3u * i + 1u] = a.y; pos[3u * i + 2u] = a.z; }
fn ldc(s: u32) -> vec3<f32> { let b = O_CONTRIB + 3u * s; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn stc(s: u32, a: vec3<f32>) { let b = O_CONTRIB + 3u * s; tf[b] = a.x; tf[b + 1u] = a.y; tf[b + 2u] = a.z; }
fn hg(e: u32, r: u32) -> vec3<f32> { let b = O_HD + 16u * e + 1u + 3u * r; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn outer(a: vec3<f32>, b: vec3<f32>) -> mat3x3<f32> { return mat3x3<f32>(a * b.x, a * b.y, a * b.z); }
fn ld9(q: u32) -> mat3x3<f32> {
  return mat3x3<f32>(
    vec3<f32>(vals[q], vals[3u * NQ + q], vals[6u * NQ + q]),
    vec3<f32>(vals[NQ + q], vals[4u * NQ + q], vals[7u * NQ + q]),
    vec3<f32>(vals[2u * NQ + q], vals[5u * NQ + q], vals[8u * NQ + q]));
}

// la ley de membrana.ts: ψ, ψ' y ψ'' con pandeo y su tope
fn ley(eps: f32, k: f32, pcr: f32) -> vec3<f32> {
  let ecr = pcr / k;
  if (eps >= -ecr) { return vec3<f32>(0.5 * k * eps * eps, k * eps, k); }
  let meseta = 0.5 * k * ecr * ecr + pcr * (-eps - ecr);
  let t = max(TOPE_P, ecr);
  if (eps >= -t) { return vec3<f32>(meseta, -pcr, 0.0); }
  return vec3<f32>(meseta + 0.5 * k * (eps + t) * (eps + t), -pcr + k * (eps + t), k);
}

fn inversa3(m: mat3x3<f32>) -> mat3x3<f32> {
  let a = m[0]; let b = m[1]; let c = m[2];
  let r0 = cross(b, c); let r1 = cross(c, a); let r2 = cross(a, b);
  let det = dot(a, r0);
  if (abs(det) < 1e-30) { return mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0)); }
  return transpose(mat3x3<f32>(r0, r1, r2)) * (1.0 / det);
}

fn prediccion(i: u32) -> vec3<f32> {
  if (iu[I_FIJO + i] != 0u) { return ld(O_XT, i); }
  return ld(O_XT, i) + H * ld(O_V, i) + vec3<f32>(0.0, H * H * GRAV, 0.0);
}

// inercia y aire del vértice i en x (sistema.ts, energiaVertice)
fn energiaVertice(i: u32, x: vec3<f32>) -> f32 {
  let m = vf[O_MASA + i];
  let dy = x - prediccion(i);
  let dt = x - ld(O_XT, i);
  return m / (2.0 * H * H) * dot(dy, dy) + AIRE * m / (2.0 * H) * dot(dt, dt);
}

// la fricción de Coulomb suavizada (contactos.ts, rigidezDeFriccion)
fn rigidez(mu: f32, lambda: f32, vt: f32) -> f32 {
  if (mu > 0.0 && lambda > 0.0) { return mu * lambda / (max(vt, EPS_F) * H); }
  return 0.0;
}

fn tangencial(v: vec3<f32>, n: vec3<f32>) -> f32 { return length(v - dot(v, n) * n); }

// la rigidez normal del par (en PAR, desde o): la del cuerpo para una punta del cuerpo, que no tiene cuarto vértice, y
// la del contacto propio para dos capas de tela (contactoPropio.ts, ParPropio.k)
fn rigidezDelPar(o: u32) -> f32 { return select(KCP, KC, tf[o + 3u] < 0.0); }

// E10: el apoyo del vértice en CONT, desde o: [apoyado, normal, fuerza de apoyo del último cuadro, kt]
fn normalDeApoyo(o: u32) -> vec3<f32> { return vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]); }

// la fricción del apoyo con u = x − x_t (contactos.ts, energiaDeFriccion)
fn energiaFriccion(o: u32, u: vec3<f32>) -> f32 {
  let n = normalDeApoyo(o);
  let t = u - dot(n, u) * n;
  return 0.5 * vf[o + 5u] * dot(t, t);
}

// el ángulo entre caras y su gradiente (placa.ts, anguloYGradiente)
struct Bisagra { th: f32, ga: vec3<f32>, gb: vec3<f32>, gc: vec3<f32>, gd: vec3<f32> }
fn bisagra(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> Bisagra {
  let z = vec3<f32>(0.0);
  let ed = b - a;
  let e2 = dot(ed, ed);
  if (e2 < 1e-16) { return Bisagra(0.0, z, z, z, z); }
  let el = sqrt(e2);
  let n1 = cross(a - c, b - c);
  let n2 = cross(b - d, a - d);
  let n1s = dot(n1, n1);
  let n2s = dot(n2, n2);
  if (n1s < 1e-24 || n2s < 1e-24) { return Bisagra(0.0, z, z, z, z); }
  let u1 = n1 / sqrt(n1s);
  let u2 = n2 / sqrt(n2s);
  let th = atan2(dot(cross(u1, u2), ed) / el, clamp(dot(u1, u2), -1.0, 1.0));
  let g1 = n1 / n1s;
  let g2 = n2 / n2s;
  let cb = dot(c - b, ed) / el; let db = dot(d - b, ed) / el; let ac = dot(a - c, ed) / el; let ad = dot(a - d, ed) / el;
  return Bisagra(th, -(g1 * cb + g2 * db), -(g1 * ac + g2 * ad), -g1 * el, -g2 * el);
}

fn soloAngulo(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> f32 {
  let ed = b - a;
  let e2 = dot(ed, ed);
  if (e2 < 1e-16) { return 0.0; }
  let n1 = cross(a - c, b - c);
  let n2 = cross(b - d, a - d);
  let n1s = dot(n1, n1);
  let n2s = dot(n2, n2);
  if (n1s < 1e-24 || n2s < 1e-24) { return 0.0; }
  let u1 = n1 / sqrt(n1s);
  let u2 = n2 / sqrt(n2s);
  return atan2(dot(cross(u1, u2), ed) / sqrt(e2), clamp(dot(u1, u2), -1.0, 1.0));
}

// el bloque (li, lj) de la membrana del triángulo t (membrana.ts, sumarBloque)
fn bloqueMembrana(t: u32, li: u32, lj: u32) -> mat3x3<f32> {
  let o = O_COEF + 7u * t;
  let ai = tf[o + li]; let bi = tf[o + 3u + li]; let aj = tf[o + lj]; let bj = tf[o + 3u + lj];
  let b = O_TRI + 14u * t;
  let fu = vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]);
  let fv = vec3<f32>(tf[b + 3u], tf[b + 4u], tf[b + 5u]);
  var nu = vec3<f32>(0.0);
  if (tf[b + 6u] > 1e-12) { nu = fu / tf[b + 6u]; }
  var nv = vec3<f32>(0.0);
  if (tf[b + 7u] > 1e-12) { nv = fv / tf[b + 7u]; }
  let Hu = (tf[b + 10u] - tf[b + 12u]) * outer(nu, nu) + tf[b + 12u] * I3;
  let Hv = (tf[b + 11u] - tf[b + 13u]) * outer(nv, nv) + tf[b + 13u] * I3;
  return tf[o + 6u] * (ai * aj * Hu + bi * bj * Hv + KS * outer(ai * fv + bi * fu, aj * fv + bj * fu));
}

// el bloque (i, j) de la placa del triángulo t (placa.ts, sumarBloque); ranuras dice dónde están i y j en cada
// bisagra (empaquetar.ts, blqRanura)
fn bloquePlaca(t: u32, ranuras: u32) -> mat3x3<f32> {
  var gi = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  var gj = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    let h = iu[I_HOT + 3u * t + k];
    if (h == NINGUNA) { continue; }
    let ri = (ranuras >> (6u * k)) & 7u;
    let rj = (ranuras >> (6u * k + 3u)) & 7u;
    if (ri < 4u) { gi[k] = hg(h, ri); }
    if (rj < 4u) { gj[k] = hg(h, rj); }
  }
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    for (var l = 0u; l < 3u; l++) { M += tf[O_KP + 9u * t + 3u * k + l] * outer(gi[k], gj[l]); }
  }
  return M;
}

fn pesoCostura(e: u32, m: u32) -> f32 {
  let s = tf[O_CS + e];
  if (m == 0u) { return 1.0; }
  if (m == 1u) { return -(1.0 - s); }
  return -s;
}

fn sepCostura(e: u32, a: vec3<f32>, b0: vec3<f32>, b1: vec3<f32>) -> vec3<f32> {
  let s = tf[O_CS + e];
  return a - (1.0 - s) * b0 - s * b1;
}

// el bloque (li, lj) del punto de costura e (costuras.ts, sumarBloque): c1 = g en todas las ramas de linealizar
fn bloqueCostura(e: u32, li: u32, lj: u32) -> mat3x3<f32> {
  let o = O_CST + 5u * e;
  let d = vec3<f32>(tf[o], tf[o + 1u], tf[o + 2u]);
  return pesoCostura(e, li) * pesoCostura(e, lj) * (tf[o + 3u] * I3 + tf[o + 4u] * outer(d, d));
}

// E8: el vértice i está cosido (costuras.ts, dependeDe y cosido)
fn cosidoV(i: u32) -> bool {
  let e = iu[I_DEPDE + i];
  return e != NINGUNA && tf[O_CCOS + e] > 0.5;
}

// E8: el punto e lleva su resorte: no está cosido ni es uno de vuelta entre dos vértices cosidos (costuras.ts, activo)
fn activa(e: u32) -> bool {
  if (tf[O_CCOS + e] > 0.5) { return false; }
  let b = I_CV + 3u * e;
  return !(iu[I_INV + e] != 0u && cosidoV(iu[b + 1u]) && cosidoV(iu[b + 2u]));
}

// E8: el desfase del punto e
fn des(e: u32) -> vec3<f32> {
  let o = O_CDES + 3u * e;
  return vec3<f32>(tf[o], tf[o + 1u], tf[o + 2u]);
}

// E8: la posición y el p de un vértice, desde los que no dependen, por una cadena de hasta tres niveles (costuras.ts,
// avanzarPuntadas y expandir); solo leen vértices que no dependen, así que no chocan con quien escribe un cosido
fn xE0(v: u32) -> vec3<f32> { return ldx(v); }
fn xE1(v: u32) -> vec3<f32> {
  if (!cosidoV(v)) { return ldx(v); }
  let e = iu[I_DEPDE + v];
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  return (1.0 - s) * xE0(iu[b + 1u]) + s * xE0(iu[b + 2u]) + des(e);
}
fn xE2(v: u32) -> vec3<f32> {
  if (!cosidoV(v)) { return ldx(v); }
  let e = iu[I_DEPDE + v];
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  return (1.0 - s) * xE1(iu[b + 1u]) + s * xE1(iu[b + 2u]) + des(e);
}
fn pE0(v: u32) -> vec3<f32> { return pv[v].xyz; }
fn pE1(v: u32) -> vec3<f32> {
  if (!cosidoV(v)) { return pv[v].xyz; }
  let e = iu[I_DEPDE + v];
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  return (1.0 - s) * pE0(iu[b + 1u]) + s * pE0(iu[b + 2u]);
}
fn pE2(v: u32) -> vec3<f32> {
  if (!cosidoV(v)) { return pv[v].xyz; }
  let e = iu[I_DEPDE + v];
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  return (1.0 - s) * pE1(iu[b + 1u]) + s * pE1(iu[b + 2u]);
}

// E8: A·p del vértice v con lo de los vértices cosidos que cuelgan de él, hasta tres niveles (costuras.ts, restringir)
fn arbolA3(v: u32) -> vec3<f32> { return ld(O_AP, v); }
fn arbolA2(v: u32) -> vec3<f32> {
  var t = ld(O_AP, v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    t += (wm.x + wm.y) * arbolA3(iu[I_CV + 3u * e]);
  }
  return t;
}
fn arbolA1(v: u32) -> vec3<f32> {
  var t = ld(O_AP, v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    t += (wm.x + wm.y) * arbolA2(iu[I_CV + 3u * e]);
  }
  return t;
}
fn arbolA0(v: u32) -> vec3<f32> {
  var t = ld(O_AP, v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    t += (wm.x + wm.y) * arbolA1(iu[I_CV + 3u * e]);
  }
  return t;
}

// E8: el peso del vértice i en el punto cosido e, como b0 y como b1 (costuras.ts, restringir)
fn pesoMaestro(i: u32, e: u32) -> vec2<f32> {
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  return vec2<f32>(select(0.0, 1.0 - s, iu[b + 1u] == i), select(0.0, s, iu[b + 2u] == i));
}

var<workgroup> sh: array<f32, ${WG}>;
var<workgroup> wBandera: u32;
var<workgroup> wEscalar: f32;

// una bandera de red[] leída de forma uniforme en el grupo: permite salir antes de una reducción
fn bandera(lid: u32, k: u32) -> bool {
  if (lid == 0u) { wBandera = select(0u, 1u, red[R_SC + k] > 0.5); }
  return workgroupUniformLoad(&wBandera) == 1u;
}

fn reducirSuma(lid: u32, v: f32) -> f32 {
  sh[lid] = v;
  workgroupBarrier();
  for (var paso = ${WG / 2}u; paso > 0u; paso = paso / 2u) {
    if (lid < paso) { sh[lid] = sh[lid] + sh[lid + paso]; }
    workgroupBarrier();
  }
  let t = sh[0];
  workgroupBarrier();
  return t;
}

fn reducirMax(lid: u32, v: f32) -> f32 {
  sh[lid] = v;
  workgroupBarrier();
  for (var paso = ${WG / 2}u; paso > 0u; paso = paso / 2u) {
    if (lid < paso) { sh[lid] = max(sh[lid], sh[lid + paso]); }
    workgroupBarrier();
  }
  let t = sh[0];
  workgroupBarrier();
  return t;
}

// 0. E8: el desfase de cada puntada baja un cuadro con la ley de E7 (costuras.ts, avanzarPuntadas)
@compute @workgroup_size(${WG}) fn encoger(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NC || tf[O_CCOS + e] < 0.5) { return; }
  let o = O_CDES + 3u * e;
  let d = des(e);
  let m = length(d);
  let nuevo = max(m * CIERRE, m - CIERRE_MAX);
  var f = 0.0;
  if (nuevo >= LCERRADO) { f = nuevo / m; }
  let dn = f * d;
  tf[o] = dn.x; tf[o + 1u] = dn.y; tf[o + 2u] = dn.z;
}

// 0b. E8: cada vértice cosido va a su punto más el desfase, por la cadena desde los que no dependen
@compute @workgroup_size(${WG}) fn ubicar(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NC || tf[O_CCOS + e] < 0.5) { return; }
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  stx(iu[b], (1.0 - s) * xE2(iu[b + 1u]) + s * xE2(iu[b + 2u]) + des(e));
}

// la cota de la distancia de cada vértice al cuerpo (en DC): la distancia que dio la última búsqueda (hasta el radio de
// búsqueda), menos lo que el vértice se movió desde entonces. Con ella, el vértice que no puede tocar el cuerpo no lo busca
// (inicio y aplicar), sin cambiar nada: la distancia no baja más que lo que el vértice se mueve
const MARGEN_DC = 1e-5;

// 1. x_t, el apoyo de cada vértice en el cuerpo con su fricción (sistema.ts, armarApoyos) y la inercia al empezar
@compute @workgroup_size(${WG}) fn inicio(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i == 0u) {
    red[R_SC + E_ACTIVO] = 1.0;
    red[R_SC + E_ITER] = 0.0;
  }
  if (i >= N) { return; }
  let x = ldx(i);
  st(O_XT, i, x);
  let o = O_CONT + 6u * i;
  // la fuerza de apoyo del cuadro anterior: negativa, su restricción jalaba hacia el cuerpo y este cuadro se suelta
  let lambda = vf[o + 4u];
  vf[o] = 0.0;
  if (iu[I_FIJO + i] == 0u && !cosidoV(i) && lambda >= 0.0 && vf[O_DC + i] < SEP + HOLGURA + MARGEN_DC) {
    let c = masCercano(x);
    vf[O_DC + i] = min(c.c.x, RADIO_B);
    let n = c.c.yzw;
    let v = ld(O_V, i);
    let vn = dot(v, n);
    if (c.c.x < SEP + HOLGURA && vn <= DESPEGUE) {
      vf[o] = 1.0; vf[o + 1u] = n.x; vf[o + 2u] = n.y; vf[o + 3u] = n.z;
      // nunca menos que el peso que carga sobre el cuerpo (sistema.ts, armarApoyos)
      vf[o + 5u] = rigidez(MU_C, max(lambda, -vf[O_MASA + i] * GRAV * n.y), length(v - vn * n));
    }
  }
  vf[O_EV0 + i] = energiaVertice(i, x);
}

// 2. la membrana linealizada de cada triángulo (la disposición de membrana.ts)
@compute @workgroup_size(${WG}) fn prepTri(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let o = O_COEF + 7u * t;
  // con diferencias desde el primer vértice: Σ a_k = 0 y así no se restan números grandes
  let p0 = ldx(iu[I_TRIS + 3u * t]);
  let d1 = ldx(iu[I_TRIS + 3u * t + 1u]) - p0;
  let d2 = ldx(iu[I_TRIS + 3u * t + 2u]) - p0;
  let fu = tf[o + 1u] * d1 + tf[o + 2u] * d2;
  let fv = tf[o + 4u] * d1 + tf[o + 5u] * d2;
  let su = length(fu);
  let sv = length(fv);
  let lu = ley(su - 1.0, KU, tf[O_PCR + 2u * t]);
  let lv = ley(sv - 1.0, KV, tf[O_PCR + 2u * t + 1u]);
  var gu = 0.0;
  if (su > 1e-12) { gu = lu.y / su; }
  var gv = 0.0;
  if (sv > 1e-12) { gv = lv.y / sv; }
  let b = O_TRI + 14u * t;
  tf[b] = fu.x; tf[b + 1u] = fu.y; tf[b + 2u] = fu.z;
  tf[b + 3u] = fv.x; tf[b + 4u] = fv.y; tf[b + 5u] = fv.z;
  tf[b + 6u] = su; tf[b + 7u] = sv; tf[b + 8u] = gu; tf[b + 9u] = gv;
  // la rigidez del hilo en la hessiana es k también en la meseta de pandeo (membrana.ts)
  tf[b + 10u] = KU; tf[b + 11u] = KV; tf[b + 12u] = max(gu, 0.0); tf[b + 13u] = max(gv, 0.0);
  let gam = dot(fu, fv);
  tf[O_E0 + t] = tf[o + 6u] * (lu.x + lv.x + 0.5 * KS * gam * gam);
}

// 3. el ángulo y su gradiente en cada bisagra
@compute @workgroup_size(${WG}) fn prepHinge(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NH) { return; }
  let b = I_BIS + 4u * e;
  let r = bisagra(ldx(iu[b]), ldx(iu[b + 1u]), ldx(iu[b + 2u]), ldx(iu[b + 3u]));
  let o = O_HD + 16u * e;
  tf[o] = r.th;
  tf[o + 1u] = r.ga.x; tf[o + 2u] = r.ga.y; tf[o + 3u] = r.ga.z;
  tf[o + 4u] = r.gb.x; tf[o + 5u] = r.gb.y; tf[o + 6u] = r.gb.z;
  tf[o + 7u] = r.gc.x; tf[o + 8u] = r.gc.y; tf[o + 9u] = r.gc.z;
  tf[o + 10u] = r.gd.x; tf[o + 11u] = r.gd.y; tf[o + 12u] = r.gd.z;
}

// 4. los aportes de cada triángulo al gradiente y su energía al empezar (membrana + placa)
@compute @workgroup_size(${WG}) fn gradElem(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let o = O_COEF + 7u * t;
  let A0 = tf[o + 6u];
  let b = O_TRI + 14u * t;
  let fu = vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]);
  let fv = vec3<f32>(tf[b + 3u], tf[b + 4u], tf[b + 5u]);
  let gu = tf[b + 8u];
  let gv = tf[b + 9u];
  let ks = KS * dot(fu, fv);
  for (var j = 0u; j < 3u; j++) {
    let aj = tf[o + j];
    let bj = tf[o + 3u + j];
    stc(3u * t + j, A0 * (gu * aj * fu + gv * bj * fv + ks * (aj * fv + bj * fu)));
  }
  var th = vec3<f32>(0.0);
  for (var k = 0u; k < 3u; k++) {
    let h = iu[I_HOT + 3u * t + k];
    if (h != NINGUNA) { th[k] = tf[O_HD + 16u * h]; }
  }
  var eplaca = 0.0;
  for (var k = 0u; k < 3u; k++) {
    let o9 = O_KP + 9u * t + 3u * k;
    let w = tf[o9] * th.x + tf[o9 + 1u] * th.y + tf[o9 + 2u] * th.z;
    eplaca += 0.5 * th[k] * w;
    let h = iu[I_HOT + 3u * t + k];
    if (h == NINGUNA) { continue; }
    for (var r = 0u; r < 4u; r++) { stc(3u * NT + 12u * t + 4u * k + r, w * hg(h, r)); }
  }
  tf[O_E0 + t] += eplaca;
}

// 4b. cada punto de costura linealizado en x_t (costuras.ts, linealizar), su energía y sus aportes al gradiente
@compute @workgroup_size(${WG}) fn prepCostura(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NC) { return; }
  let b = I_CV + 3u * e;
  let d = sepCostura(e, ldx(iu[b]), ldx(iu[b + 1u]), ldx(iu[b + 2u]));
  let r = length(d);
  let L = tf[O_CL + e];
  // E8: el punto cosido o que quedó entre puntadas no lleva resorte
  let act = activa(e);
  var gg = 0.0;
  var c2 = 0.0;
  if (!act) {
  } else if (L == 0.0) {
    gg = KCOST;
  } else if (r > L) {
    let q = L / r;
    gg = KCOST * (1.0 - q);
    c2 = KCOST * q / (r * r);
  }
  let o = O_CST + 5u * e;
  tf[o] = d.x; tf[o + 1u] = d.y; tf[o + 2u] = d.z; tf[o + 3u] = gg; tf[o + 4u] = c2;
  var e0 = 0.0;
  if (act && r > L) { e0 = 0.5 * KCOST * (r - L) * (r - L); }
  tf[O_CE0 + e] = e0;
  for (var m = 0u; m < 3u; m++) { stc(SLOT_C + 3u * e + m, pesoCostura(e, m) * gg * d); }
}

// 5. cada bloque de la matriz, sumando los elementos que lo tocan; se guarda en franjas de 32 filas
@compute @workgroup_size(${WG}) fn ensamblar(@builtin(global_invocation_id) g: vec3<u32>) {
  let b = g.x;
  if (b >= NB) { return; }
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var s = iu[I_BOFF + b]; s < iu[I_BOFF + b + 1u]; s++) {
    let cod = iu[I_BCOD + s];
    if (cod >= 0x80000000u) { M += bloquePlaca(cod - 0x80000000u, iu[I_BRAN + s]); }
    else if (cod >= 0x40000000u) { let k = cod - 0x40000000u; M += bloqueCostura(k >> 4u, (k >> 2u) & 3u, k & 3u); }
    else { M += bloqueMembrana(cod >> 4u, (cod >> 2u) & 3u, cod & 3u); }
  }
  let q = iu[I_POSDE + b];
  for (var r = 0u; r < 3u; r++) {
    for (var c = 0u; c < 3u; c++) { vals[(3u * r + c) * NQ + q] = M[c][r]; }
  }
}

// 6. el residuo, el precondicionador de bloques y el arranque del gradiente conjugado (Δ = 0)
struct ResiduoB { r: vec3<f32>, B: mat3x3<f32> }

// −∇G y el bloque diagonal del vértice i en x = x_t, antes de las puntadas
fn residuoDe(i: u32) -> ResiduoB {
  var grad = vec3<f32>(0.0);
  for (var s = iu[I_AOFF + i]; s < iu[I_AOFF + i + 1u]; s++) { grad += ldc(iu[I_AIDX + s]); }
  let m = vf[O_MASA + i];
  // en x = x_t: −(m/h²)·(x − y) = (m/h)·v + m·g, y el aire todavía no empuja
  var r = -grad + (m / H) * ld(O_V, i) + vec3<f32>(0.0, m * GRAV, 0.0);
  var B = ld9(iu[I_DIAG + i]) + (m / (H * H) + AIRE * m / H) * I3;
  let o = O_CONT + 6u * i;
  if (vf[o] > 0.5) {
    // E10: el apoyo no empuja (lo fija su restricción) y en x = x_t su fricción todavía no; entra al bloque
    // (sistema.ts, residuo y sumarBloquesDeContacto)
    let nn = normalDeApoyo(o);
    B += vf[o + 5u] * (I3 - outer(nn, nn));
  }
  if (PROPIO) {
    for (var s = u32(tf[O_OFFV + i]); s < u32(tf[O_OFFV + i + 1u]); s++) {
      let ent = u32(tf[O_ENT + s]);
      let o = O_PAR + 14u * (ent >> 2u);
      if (tf[o + 13u] < 0.5) { continue; }
      let wk = tf[o + 4u + (ent & 3u)];
      let nn = v3tf(o + 8u);
      let kt = tf[o + 12u];
      let kp = rigidezDelPar(o);
      // en x = x_t el par empuja con k·p0 y su fricción todavía no (sistema.ts, residuo)
      r += wk * kp * tf[o + 11u] * nn;
      B += wk * wk * ((kp - kt) * outer(nn, nn) + kt * I3);
    }
  }
  return ResiduoB(r, B);
}

// E8: el residuo y el bloque del vértice v con lo de los vértices cosidos que cuelgan de él, hasta tres niveles
// (costuras.ts, restringir y restringirBloques)
fn arbolR3(v: u32) -> ResiduoB { return residuoDe(v); }
fn arbolR2(v: u32) -> ResiduoB {
  var t = residuoDe(v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    let h = arbolR3(iu[I_CV + 3u * e]);
    t.r += (wm.x + wm.y) * h.r;
    t.B += (wm.x * wm.x + wm.y * wm.y) * h.B;
  }
  return t;
}
fn arbolR1(v: u32) -> ResiduoB {
  var t = residuoDe(v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    let h = arbolR2(iu[I_CV + 3u * e]);
    t.r += (wm.x + wm.y) * h.r;
    t.B += (wm.x * wm.x + wm.y * wm.y) * h.B;
  }
  return t;
}
fn arbolR0(v: u32) -> ResiduoB {
  var t = residuoDe(v);
  for (var k = iu[I_DOFF + v]; k < iu[I_DOFF + v + 1u]; k++) {
    let e = iu[I_DIDX + k];
    if (tf[O_CCOS + e] < 0.5) { continue; }
    let wm = pesoMaestro(v, e);
    let h = arbolR1(iu[I_CV + 3u * e]);
    t.r += (wm.x + wm.y) * h.r;
    t.B += (wm.x * wm.x + wm.y * wm.y) * h.B;
  }
  return t;
}

@compute @workgroup_size(${WG}) fn residuo(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    var r = vec3<f32>(0.0);
    var B = I3;
    // E8: lo de cada vértice cosido pasa a sus dos vértices del otro lado (costuras.ts, restringir y restringirBloques)
    if (!cosidoV(i)) {
      let t = arbolR0(i);
      r = t.r;
      B = t.B;
    }
    if (iu[I_FIJO + i] != 0u) { r = vec3<f32>(0.0); }
    // E10: el apoyo guarda la normal de su residuo sin filtrar, para su fuerza al terminar, y filtra r y z (paso.ts)
    let o = O_CONT + 6u * i;
    let apoyo = vf[o] > 0.5;
    let nn = normalDeApoyo(o);
    if (apoyo) {
      vf[O_RN + i] = dot(nn, r);
      r = r - dot(nn, r) * nn;
    }
    let Bi = inversa3(B);
    for (var a = 0u; a < 3u; a++) {
      for (var c = 0u; c < 3u; c++) { vf[O_PINV + 9u * i + 3u * a + c] = Bi[c][a]; }
    }
    var z = Bi * r;
    if (apoyo) { z = z - dot(nn, z) * nn; }
    st(O_R, i, r);
    st(O_Z, i, z);
    pv[i] = vec4<f32>(z, 0.0);
    st(O_DX, i, vec3<f32>(0.0));
    rz = dot(r, z);
  }
  let total = reducirSuma(l.x, rz);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarInicio() {
  if (red[R_SC + E_ACTIVO] < 0.5) { return; }
  var s = 0.0;
  for (var k = 0u; k < GV; k++) { s += red[R_PA + k]; }
  red[R_SC + E_RZ] = s;
  red[R_SC + E_RZ0] = s;
  red[R_SC + E_HECHO] = 0.0;
}

// 7. gradiente conjugado: A·p con la matriz en franjas, la diagonal de la inercia y el contacto. Cada iteración son
// cuatro despachos (aportePares, spmv, actualizar, nuevaP; y expandirP con costuras): α y β los calcula cada grupo con
// las sumas parciales del despacho anterior. rᵀz va en dos lugares que se alternan por iteración, para que nadie lo
// lea mientras se escribe; al terminar (tolerancia o pᵀAp ≤ 0) ACTIVO se apaga y las iteraciones que quedan no trabajan
fn lugarRz(siguiente: bool) -> u32 {
  let impar = ((u32(red[R_SC + E_ITER]) - 1u) & 1u) == 1u;
  return R_SC + select(E_RZ, E_RZ_IMPAR, impar != siguiente);
}

@compute @workgroup_size(${WG}) fn spmv(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  // la iteración cuenta al empezar: los demás despachos de esta iteración la leen y nadie la escribe en ellos
  if (i == 0u) { red[R_SC + E_ITER] = red[R_SC + E_ITER] + 1.0; }
  var pap = 0.0;
  if (i < N) {
    let f = i >> 5u;
    let carril = i & 31u;
    let base = iu[I_FBASE + f];
    let ancho = iu[I_FANCHO + f];
    var ap = vec3<f32>(0.0);
    for (var k = 0u; k < ancho; k++) {
      let q = base + 32u * k + carril;
      let j = iu[I_COLE + q];
      if (j == NINGUNA) { continue; }
      let pj = pv[j].xyz;
      ap += vec3<f32>(
        vals[q] * pj.x + vals[NQ + q] * pj.y + vals[2u * NQ + q] * pj.z,
        vals[3u * NQ + q] * pj.x + vals[4u * NQ + q] * pj.y + vals[5u * NQ + q] * pj.z,
        vals[6u * NQ + q] * pj.x + vals[7u * NQ + q] * pj.y + vals[8u * NQ + q] * pj.z);
    }
    let m = vf[O_MASA + i];
    let p = pv[i].xyz;
    ap += (m / (H * H) + AIRE * m / H) * p;
    // E10: del apoyo, solo su fricción en el plano tangente
    let o = O_CONT + 6u * i;
    if (vf[o] > 0.5) {
      let nn = normalDeApoyo(o);
      ap += vf[o + 5u] * (p - dot(nn, p) * nn);
    }
    if (PROPIO) {
      // la lista lleva solo los pares activos, y aportePares ya calculó lo de cada uno para cada vértice
      for (var s = u32(tf[O_OFFV + i]); s < u32(tf[O_OFFV + i + 1u]); s++) { ap += v3tf(O_APORTE + 3u * u32(tf[O_ENT + s])); }
    }
    if (iu[I_FIJO + i] != 0u) { ap = vec3<f32>(0.0); }
    st(O_AP, i, ap);
    pap = dot(p, ap);
  }
  let total = reducirSuma(l.x, pap);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(${WG}) fn actualizar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  // α = rᵀz / pᵀAp, con las sumas parciales de spmv; con pᵀAp ≤ 0 el gradiente conjugado termina (paso.ts)
  if (l.x == 0u) {
    var pap = 0.0;
    for (var k = 0u; k < GV; k++) { pap += red[R_PA + k]; }
    var a = 0.0;
    if (pap > 0.0) { a = red[lugarRz(false)] / pap; } else if (w.x == 0u) { red[R_SC + E_HECHO] = 1.0; }
    wEscalar = a;
  }
  let alfa = workgroupUniformLoad(&wEscalar);
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    // el de un vértice cosido es el de sus dos vértices: p ya llega expandido (expandirP)
    st(O_DX, i, ld(O_DX, i) + alfa * pv[i].xyz);
    if (!cosidoV(i)) {
      // E8: A·p de cada vértice cosido pasa a sus dos vértices del otro lado (costuras.ts, restringir)
      var ap = arbolA0(i);
      if (iu[I_FIJO + i] != 0u) { ap = vec3<f32>(0.0); }
      // E10: el apoyo sigue la normal de su residuo sin filtrar y filtra A·p y z (paso.ts, gradienteConjugado)
      let oc = O_CONT + 6u * i;
      let apoyo = vf[oc] > 0.5;
      let nn = normalDeApoyo(oc);
      if (apoyo) {
        let an = dot(nn, ap);
        vf[O_RN + i] = vf[O_RN + i] - alfa * an;
        ap = ap - an * nn;
      }
      let r = ld(O_R, i) - alfa * ap;
      st(O_R, i, r);
      let o = O_PINV + 9u * i;
      var z = vec3<f32>(
        vf[o] * r.x + vf[o + 1u] * r.y + vf[o + 2u] * r.z,
        vf[o + 3u] * r.x + vf[o + 4u] * r.y + vf[o + 5u] * r.z,
        vf[o + 6u] * r.x + vf[o + 7u] * r.y + vf[o + 8u] * r.z);
      if (apoyo) { z = z - dot(nn, z) * nn; }
      st(O_Z, i, z);
      rz = dot(r, z);
    }
  }
  let total = reducirSuma(l.x, rz);
  if (l.x == 0u) { red[R_PB + w.x] = total; }
}

// β = rᵀz nuevo / rᵀz anterior, con las sumas parciales de actualizar; termina por la tolerancia (paso.ts)
@compute @workgroup_size(${WG}) fn nuevaP(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  if (l.x == 0u) {
    var rzn = 0.0;
    for (var k = 0u; k < GV; k++) { rzn += red[R_PB + k]; }
    let fin = red[R_SC + E_HECHO] > 0.5 || rzn <= TOL2 * red[R_SC + E_RZ0];
    var b = -1.0;
    if (!fin) { b = rzn / red[lugarRz(false)]; }
    if (w.x == 0u) {
      if (fin) {
        red[R_SC + E_HECHO] = 1.0;
        red[R_SC + E_ACTIVO] = 0.0;
      } else {
        red[lugarRz(true)] = rzn;
      }
    }
    wEscalar = b;
  }
  let beta = workgroupUniformLoad(&wEscalar);
  let i = g.x;
  if (beta < 0.0 || i >= N) { return; }
  pv[i] = vec4<f32>(ld(O_Z, i) + beta * pv[i].xyz, 0.0);
}

// E8: el vértice cosido entra al producto con lo de sus dos vértices (costuras.ts, expandir)
@compute @workgroup_size(${WG}) fn expandirP(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NC || red[R_SC + E_ACTIVO] < 0.5 || tf[O_CCOS + e] < 0.5) { return; }
  let b = I_CV + 3u * e;
  let s = tf[O_CS + e];
  pv[iu[b]] = vec4<f32>((1.0 - s) * pE2(iu[b + 1u]) + s * pE2(iu[b + 2u]), 0.0);
}

// 9. búsqueda en línea: α = 1, ½, … mientras G suba; se compara la suma de las diferencias por elemento
@compute @workgroup_size(1) fn prepBusqueda() {
  red[R_SC + E_ALFA_LS] = 1.0;
  red[R_SC + E_PROBANDO] = 1.0;
}

@compute @workgroup_size(${WG}) fn posPrueba(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let i = g.x;
  var de = 0.0;
  if (i < N) {
    let u = red[R_SC + E_ALFA_LS] * ld(O_DX, i);
    let xp = ld(O_XT, i) + u;
    st(O_XP, i, xp);
    de = energiaVertice(i, xp) - vf[O_EV0 + i];
    // la fricción del apoyo (E10), sin consultar el obstáculo
    let o = O_CONT + 6u * i;
    if (vf[o] > 0.5) { de += energiaFriccion(o, u); }
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PB + w.x] = total; }
}

@compute @workgroup_size(${WG}) fn anguloPrueba(@builtin(global_invocation_id) g: vec3<u32>) {
  let e = g.x;
  if (e >= NH || red[R_SC + E_PROBANDO] < 0.5) { return; }
  let b = I_BIS + 4u * e;
  tf[O_THP + e] = soloAngulo(ld(O_XP, iu[b]), ld(O_XP, iu[b + 1u]), ld(O_XP, iu[b + 2u]), ld(O_XP, iu[b + 3u]));
}

@compute @workgroup_size(${WG}) fn difTri(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let t = g.x;
  var de = 0.0;
  if (t < NT) {
    let o = O_COEF + 7u * t;
    let p0 = ld(O_XP, iu[I_TRIS + 3u * t]);
    let d1 = ld(O_XP, iu[I_TRIS + 3u * t + 1u]) - p0;
    let d2 = ld(O_XP, iu[I_TRIS + 3u * t + 2u]) - p0;
    let fu = tf[o + 1u] * d1 + tf[o + 2u] * d2;
    let fv = tf[o + 4u] * d1 + tf[o + 5u] * d2;
    let gam = dot(fu, fv);
    var e = tf[o + 6u] * (ley(length(fu) - 1.0, KU, tf[O_PCR + 2u * t]).x + ley(length(fv) - 1.0, KV, tf[O_PCR + 2u * t + 1u]).x + 0.5 * KS * gam * gam);
    var th = vec3<f32>(0.0);
    for (var k = 0u; k < 3u; k++) {
      let h = iu[I_HOT + 3u * t + k];
      if (h != NINGUNA) { th[k] = tf[O_THP + h]; }
    }
    for (var k = 0u; k < 3u; k++) {
      for (var q = 0u; q < 3u; q++) { e += 0.5 * tf[O_KP + 9u * t + 3u * k + q] * th[k] * th[q]; }
    }
    de = e - tf[O_E0 + t];
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PC + w.x] = total; }
}

@compute @workgroup_size(${WG}) fn difCostura(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let e = g.x;
  var de = 0.0;
  if (e < NC) {
    let b = I_CV + 3u * e;
    let r = length(sepCostura(e, ld(O_XP, iu[b]), ld(O_XP, iu[b + 1u]), ld(O_XP, iu[b + 2u])));
    let L = tf[O_CL + e];
    var en = 0.0;
    if (activa(e) && r > L) { en = 0.5 * KCOST * (r - L) * (r - L); }
    de = en - tf[O_CE0 + e];
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PD + w.x] = total; }
}

@compute @workgroup_size(1) fn decidir() {
  if (red[R_SC + E_PROBANDO] < 0.5) { return; }
  var dg = 0.0;
  for (var k = 0u; k < GV; k++) { dg += red[R_PB + k]; }
  for (var k = 0u; k < GT; k++) { dg += red[R_PC + k]; }
  for (var k = 0u; k < GC; k++) { dg += red[R_PD + k]; }
  if (PROPIO) { for (var k = 0u; k < GP; k++) { dg += red[R_PE + k]; } }
  red[R_SC + E_DG] = dg;
  if (dg <= 0.0) { red[R_SC + E_PROBANDO] = 0.0; } else { red[R_SC + E_ALFA_LS] = 0.5 * red[R_SC + E_ALFA_LS]; }
}

// 10. el paso aceptado, la velocidad, la proyección (E10, sistema.ts, proyectar) y la quietud (quietud.ts)
@compute @workgroup_size(${WG}) fn aplicar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var mv = 0.0;
  var vmax = 0.0;
  var proyectado = 0.0;
  if (i < N) {
    var alfa = 1.0;
    if (BUSQUEDA) { alfa = select(0.0, red[R_SC + E_ALFA_LS], red[R_SC + E_PROBANDO] < 0.5); }
    let dx = alfa * ld(O_DX, i);
    var x = ld(O_XT, i) + dx;
    var v = dx / H;
    // la fuerza de apoyo del cuadro: la de la restricción (−n·r sin filtrar), o la que frena al proyectado
    let o = O_CONT + 6u * i;
    var lambda = 0.0;
    if (vf[o] > 0.5) { lambda = -vf[O_RN + i]; }
    var cota = vf[O_DC + i] - length(dx);
    if (iu[I_FIJO + i] == 0u && !cosidoV(i) && cota < SEP + MARGEN_DC) {
      let c = masCercano(x);
      cota = min(c.c.x, RADIO_B);
      if (c.c.x < SEP) {
        let n = c.c.yzw;
        x = x + (SEP - c.c.x) * n;
        let vn = dot(v, n);
        if (vn < 0.0) {
          v = v - vn * n;
          lambda = max(lambda, vf[O_MASA + i] * -vn / H);
        }
        proyectado = 1.0;
        cota = 0.0;
      }
    }
    vf[O_DC + i] = cota;
    vf[o + 4u] = lambda;
    stx(i, x);
    st(O_V, i, v);
    if (iu[I_FIJO + i] == 0u) {
      // la quietud mira la velocidad que pide el paso, no la aceptada (quietud.ts)
      let rapidez = length(ld(O_DX, i)) / H;
      mv = vf[O_MASA + i] * rapidez;
      vmax = rapidez;
    }
  }
  let a = reducirSuma(l.x, mv);
  if (l.x == 0u) { red[R_PA + w.x] = a; }
  let b = reducirMax(l.x, vmax);
  if (l.x == 0u) { red[R_PB + w.x] = b; }
  let c = reducirSuma(l.x, proyectado);
  if (l.x == 0u) { red[R_PC + w.x] = c; }
}

@compute @workgroup_size(1) fn cerrarCuadro() {
  var s = 0.0;
  var mx = 0.0;
  var proyectados = 0.0;
  for (var k = 0u; k < GV; k++) {
    s += red[R_PA + k];
    mx = max(mx, red[R_PB + k]);
    proyectados += red[R_PC + k];
  }
  red[R_SC + E_PROYECTADOS] = proyectados;
  let q = s / MGH;
  red[R_SC + E_QUIETUD] = q;
  red[R_SC + E_QMAX] = mx / (abs(GRAV) * H);
  var alfa = 1.0;
  if (BUSQUEDA) { alfa = select(0.0, red[R_SC + E_ALFA_LS], red[R_SC + E_PROBANDO] < 0.5); }
  red[R_SC + E_ALFA_FINAL] = alfa;
  let c = u32(red[R_SC + E_CUADRO]);
  if (c < HIST) { red[R_HISTO + c] = q; }
  red[R_SC + E_CUADRO] = red[R_SC + E_CUADRO] + 1.0;
}

// 11. las costuras se cierran un cuadro más; cuando todas llegan a 0, la flexión las cruza (sistema.ts, alTerminarCuadro)
@compute @workgroup_size(${WG}) fn cerrarCosturas(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let e = g.x;
  var abierta = 0.0;
  if (e < NC) {
    let L0 = tf[O_CL + e];
    var L = max(L0 * CIERRE, L0 - CIERRE_MAX);
    if (L < LCERRADO) { L = 0.0; }
    tf[O_CL + e] = L;
    abierta = L;
    // E8: se cose el punto soldable que quedó a menos del umbral de su punto (costuras.ts, coser)
    if (iu[I_SOLD + e] != 0u && tf[O_CCOS + e] < 0.5) {
      let b = I_CV + 3u * e;
      let xa = ldx(iu[b]);
      let d = sepCostura(e, xa, ldx(iu[b + 1u]), ldx(iu[b + 2u]));
      if (length(d) <= UMBRAL_P) {
        // la línea hasta su punto no puede entrar en un obstáculo (sistema.ts, cruzaUnObstaculo)
        var cruza = false;
        for (var k = 1u; k < MUESTRAS_P; k++) {
          if (masCercano(xa - (f32(k) / f32(MUESTRAS_P)) * d).c.x < -SEP) { cruza = true; }
        }
        if (!cruza) {
          tf[O_CCOS + e] = 1.0;
          let o = O_CDES + 3u * e;
          tf[o] = d.x; tf[o + 1u] = d.y; tf[o + 2u] = d.z;
        }
      }
    }
  }
  let m = reducirMax(l.x, abierta);
  if (l.x == 0u) { red[R_PD + w.x] = m; }
}

@compute @workgroup_size(1) fn revisarCosido() {
  if (NC == 0u) { return; }
  var m = 0.0;
  for (var k = 0u; k < GC; k++) { m = max(m, red[R_PD + k]); }
  if (m == 0.0) { red[R_SC + E_COSIDA] = 1.0; }
}

// escribir la rigidez de una bisagra de costura en K una y otra vez da lo mismo (placa.ts, activarCosturas)
@compute @workgroup_size(${WG}) fn coser(@builtin(global_invocation_id) g: vec3<u32>) {
  let c = g.x;
  if (c >= NCH || red[R_SC + E_COSIDA] < 0.5) { return; }
  tf[O_KP + iu[I_CK + c]] = tf[O_CKH + c];
}
`;
}
