/**
 * La memoria de la GPU y el WGSL del motor implícito (spec 2026-10-13 §4.2.2). El WGSL se genera para cada
 * escena: tamaños, desplazamientos, ajustes y obstáculos van como constantes. La física es la de paso.ts,
 * en el mismo orden; el cuadro entero cabe en un pase de cómputo y las sumas se reducen en la GPU.
 */
import type { Obstaculo } from '../obstaculos';
import type { SistemaTela } from '../sistema';
import type { PaqueteGpu } from './empaquetar';

/** Hilos por grupo de trabajo. */
export const WG = 128;

/** Los escalares del cuadro, en la zona SC de `red`. */
export const ESC = {
  RZ: 0, RZ0: 1, ALFA: 2, BETA: 3, HECHO: 4, ACTIVO: 5, NUEVOS: 6, ALFA_LS: 7, PROBANDO: 8,
  CUADRO: 9, QUIETUD: 10, QMAX: 11, ITER: 12, DG: 13, ALFA_FINAL: 14,
} as const;
const N_ESC = 16;

/** Las entradas de cómputo, en el orden en que las despacha un cuadro. */
export const ENTRADAS = [
  'inicio', 'prepTri', 'prepHinge', 'gradElem', 'ensamblar', 'residuo', 'sumarInicio', 'spmv', 'sumarAlfa',
  'actualizar', 'sumarBeta', 'nuevaP', 'anticipar', 'armarRonda2', 'prepBusqueda', 'posPrueba', 'anguloPrueba',
  'difTri', 'decidir', 'aplicar', 'cerrarCuadro',
] as const;

export interface Distribucion {
  /** por vértice, en f32: inicio de cada arreglo */
  vf: { XT: number; V: number; R: number; Z: number; AP: number; DX: number; XP: number; MASA: number; EV0: number; PINV: number; CONT: number; total: number };
  /** por elemento, en f32 */
  tf: { COEF: number; KP: number; PCR: number; TRI: number; E0: number; HD: number; THP: number; CONTRIB: number; total: number };
  /** dónde empieza cada arreglo de índices de `PaqueteGpu['u32']` */
  iu: Record<keyof PaqueteGpu['u32'], number> & { total: number };
  /** tres zonas de sumas parciales, los escalares y la historia de la quietud */
  red: { PA: number; PB: number; PC: number; SC: number; HISTO: number; HIST: number; total: number };
  /** grupos de trabajo por vértice, triángulo, bisagra y bloque */
  gv: number;
  gt: number;
  gh: number;
  gb: number;
}

export function distribuir(p: PaqueteGpu, cuadrosDeHistoria: number): Distribucion {
  const { n, nt, nh } = p;
  const vf = { XT: 0, V: 3 * n, R: 6 * n, Z: 9 * n, AP: 12 * n, DX: 15 * n, XP: 18 * n, MASA: 21 * n, EV0: 22 * n, PINV: 23 * n, CONT: 32 * n, total: 37 * n };
  const tf = {
    COEF: 0, KP: 7 * nt, PCR: 16 * nt, TRI: 18 * nt, E0: 32 * nt, HD: 33 * nt,
    THP: 33 * nt + 16 * nh, CONTRIB: 33 * nt + 17 * nh, total: 78 * nt + 17 * nh,
  };
  const iu = { total: 0 } as Distribucion['iu'];
  for (const k of Object.keys(p.u32) as Array<keyof PaqueteGpu['u32']>) {
    iu[k] = iu.total;
    iu.total += p.u32[k].length;
  }
  const gv = Math.ceil(n / WG), gt = Math.ceil(nt / WG), gh = Math.ceil(nh / WG), gb = Math.ceil(p.nb / WG);
  const zona = Math.max(gv, gt, gh, 1);
  const red = { PA: 0, PB: zona, PC: 2 * zona, SC: 3 * zona, HISTO: 3 * zona + N_ESC, HIST: cuadrosDeHistoria, total: 3 * zona + N_ESC + cuadrosDeHistoria };
  return { vf, tf, iu, red, gv, gt, gh, gb };
}

/** Bytes de cada búfer, en el orden de las ligaduras del WGSL. */
export function tamanosDeBufer(d: Distribucion, p: PaqueteGpu): Record<'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv', number> {
  return { pos: 12 * p.n, vf: 4 * d.vf.total, tf: 4 * d.tf.total, iu: 4 * d.iu.total, red: 4 * d.red.total, vals: 48 * Math.max(p.nq, 1), pv: 16 * p.n };
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
    if (o.tipo === 'cuerpo') throw new Error('wgsl: el cuerpo llega a la GPU en la parte 2 de la entrega 4');
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
fn obstaculoK(p: vec3<f32>, k: u32) -> vec4<f32> {
${obs.map((_, k) => `  if (k == ${k}u) { return obstaculo${k}(p); }`).join('\n')}
  return vec4<f32>(1e30, 0.0, 1.0, 0.0);
}
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
@group(0) @binding(5) var<storage, read_write> vals: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> pv: array<vec4<f32>>;

const N = ${u(p.n)};
const NT = ${u(p.nt)};
const NH = ${u(p.nh)};
const NB = ${u(p.nb)};
const NQ = ${u(Math.max(p.nq, 1))};
const GV = ${u(d.gv)};
const GT = ${u(d.gt)};
const NINGUNA = 0xffffffffu;
const O_XT = ${u(vf.XT)}; const O_V = ${u(vf.V)}; const O_R = ${u(vf.R)}; const O_Z = ${u(vf.Z)}; const O_AP = ${u(vf.AP)};
const O_DX = ${u(vf.DX)}; const O_XP = ${u(vf.XP)}; const O_MASA = ${u(vf.MASA)}; const O_EV0 = ${u(vf.EV0)};
const O_PINV = ${u(vf.PINV)}; const O_CONT = ${u(vf.CONT)};
const O_COEF = ${u(tf.COEF)}; const O_KP = ${u(tf.KP)}; const O_PCR = ${u(tf.PCR)}; const O_TRI = ${u(tf.TRI)};
const O_E0 = ${u(tf.E0)}; const O_HD = ${u(tf.HD)}; const O_THP = ${u(tf.THP)}; const O_CONTRIB = ${u(tf.CONTRIB)};
const I_TRIS = ${u(iu.tris)}; const I_BIS = ${u(iu.bisagras)}; const I_HOT = ${u(iu.bisDeTri)}; const I_FIJO = ${u(iu.fijo)};
const I_AOFF = ${u(iu.aporOff)}; const I_AIDX = ${u(iu.aporIdx)}; const I_BOFF = ${u(iu.blqOff)}; const I_BCOD = ${u(iu.blqCod)};
const I_BFILA = ${u(iu.blqFila)}; const I_BCOL = ${u(iu.blqCol)}; const I_FBASE = ${u(iu.franjaBase)};
const I_FANCHO = ${u(iu.franjaAncho)}; const I_COLE = ${u(iu.colSell)}; const I_POSDE = ${u(iu.posDe)}; const I_DIAG = ${u(iu.diag)};
const R_PA = ${u(red.PA)}; const R_PB = ${u(red.PB)}; const R_PC = ${u(red.PC)}; const R_SC = ${u(red.SC)};
const R_HISTO = ${u(red.HISTO)}; const HIST = ${u(red.HIST)};
${Object.entries(ESC).map(([k, v]) => `const E_${k} = ${u(v)};`).join('\n')}
const H = ${f(aj.h)};
const AIRE = ${f(aj.aire)};
const KC = ${f(aj.kContacto)};
const GRAV = ${f(aj.gravedad)};
const SEP = ${f(s.sep)};
const TOL2 = ${f(aj.tolCG * aj.tolCG)};
const MGH = ${f(Math.max(p.pesoTotal * aj.h, 1e-30))};
const KU = ${f(tela.kTrama)};
const KV = ${f(tela.kUrdimbre)};
const KS = ${f(tela.kCizalla)};
const BUSQUEDA = ${aj.busqueda};
const I3 = mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);

${wgslObstaculos(s.obstaculos)}

fn ld(o: u32, i: u32) -> vec3<f32> { let b = o + 3u * i; return vec3<f32>(vf[b], vf[b + 1u], vf[b + 2u]); }
fn st(o: u32, i: u32, a: vec3<f32>) { let b = o + 3u * i; vf[b] = a.x; vf[b + 1u] = a.y; vf[b + 2u] = a.z; }
fn ldx(i: u32) -> vec3<f32> { return vec3<f32>(pos[3u * i], pos[3u * i + 1u], pos[3u * i + 2u]); }
fn stx(i: u32, a: vec3<f32>) { pos[3u * i] = a.x; pos[3u * i + 1u] = a.y; pos[3u * i + 2u] = a.z; }
fn ldc(s: u32) -> vec3<f32> { let b = O_CONTRIB + 3u * s; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn stc(s: u32, a: vec3<f32>) { let b = O_CONTRIB + 3u * s; tf[b] = a.x; tf[b + 1u] = a.y; tf[b + 2u] = a.z; }
fn hg(e: u32, r: u32) -> vec3<f32> { let b = O_HD + 16u * e + 1u + 3u * r; return vec3<f32>(tf[b], tf[b + 1u], tf[b + 2u]); }
fn outer(a: vec3<f32>, b: vec3<f32>) -> mat3x3<f32> { return mat3x3<f32>(a * b.x, a * b.y, a * b.z); }
fn ld9(q: u32) -> mat3x3<f32> { return transpose(mat3x3<f32>(vals[q].xyz, vals[NQ + q].xyz, vals[2u * NQ + q].xyz)); }

// la ley de membrana.ts: ψ, ψ' y ψ'' con pandeo
fn ley(eps: f32, k: f32, pcr: f32) -> vec3<f32> {
  let ecr = pcr / k;
  if (eps >= -ecr) { return vec3<f32>(0.5 * k * eps * eps, k * eps, k); }
  return vec3<f32>(0.5 * k * ecr * ecr + pcr * (-eps - ecr), -pcr, 0.0);
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

// inercia, aire y contacto del vértice i en x (sistema.ts, energiaVertice)
fn energiaVertice(i: u32, x: vec3<f32>) -> f32 {
  let m = vf[O_MASA + i];
  let dy = x - prediccion(i);
  let dt = x - ld(O_XT, i);
  var e = m / (2.0 * H * H) * dot(dy, dy) + AIRE * m / (2.0 * H) * dot(dt, dt);
  let p = SEP - masCercano(x).c.x;
  if (p > 0.0) { e += 0.5 * KC * p * p; }
  return e;
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

// el bloque (i, j) de la placa del triángulo t (placa.ts, sumarBloque)
fn bloquePlaca(t: u32, i: u32, j: u32) -> mat3x3<f32> {
  var gi = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  var gj = array<vec3<f32>, 3>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    let h = iu[I_HOT + 3u * t + k];
    if (h == NINGUNA) { continue; }
    for (var r = 0u; r < 4u; r++) {
      let v = iu[I_BIS + 4u * h + r];
      if (v == i) { gi[k] = hg(h, r); }
      if (v == j) { gj[k] = hg(h, r); }
    }
  }
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var k = 0u; k < 3u; k++) {
    for (var l = 0u; l < 3u; l++) { M += tf[O_KP + 9u * t + 3u * k + l] * outer(gi[k], gj[l]); }
  }
  return M;
}

var<workgroup> sh: array<f32, ${WG}>;
var<workgroup> wBandera: u32;

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

// 1. x_t, los contactos de partida y la energía de cada vértice al empezar
@compute @workgroup_size(${WG}) fn inicio(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i == 0u) {
    red[R_SC + E_ACTIVO] = 1.0;
    red[R_SC + E_ITER] = 0.0;
    red[R_SC + E_NUEVOS] = 0.0;
  }
  if (i >= N) { return; }
  let x = ldx(i);
  st(O_XT, i, x);
  let o = O_CONT + 5u * i;
  let c = masCercano(x);
  let p0 = SEP - c.c.x;
  if (p0 > 0.0 && iu[I_FIJO + i] == 0u) {
    vf[o] = 1.0; vf[o + 1u] = c.c.y; vf[o + 2u] = c.c.z; vf[o + 3u] = c.c.w; vf[o + 4u] = p0;
  } else {
    vf[o] = 0.0;
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

// 5. cada bloque de la matriz, sumando los elementos que lo tocan; se guarda en franjas de 32 filas
@compute @workgroup_size(${WG}) fn ensamblar(@builtin(global_invocation_id) g: vec3<u32>) {
  let b = g.x;
  if (b >= NB) { return; }
  let i = iu[I_BFILA + b];
  let j = iu[I_BCOL + b];
  var M = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
  for (var s = iu[I_BOFF + b]; s < iu[I_BOFF + b + 1u]; s++) {
    let cod = iu[I_BCOD + s];
    if (cod >= 0x80000000u) { M += bloquePlaca(cod - 0x80000000u, i, j); }
    else { M += bloqueMembrana(cod >> 4u, (cod >> 2u) & 3u, cod & 3u); }
  }
  let q = iu[I_POSDE + b];
  let Mt = transpose(M);
  vals[q] = vec4<f32>(Mt[0], 0.0);
  vals[NQ + q] = vec4<f32>(Mt[1], 0.0);
  vals[2u * NQ + q] = vec4<f32>(Mt[2], 0.0);
}

// 6. el residuo, el precondicionador de bloques y el arranque del gradiente conjugado (Δ = 0)
@compute @workgroup_size(${WG}) fn residuo(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    var grad = vec3<f32>(0.0);
    for (var s = iu[I_AOFF + i]; s < iu[I_AOFF + i + 1u]; s++) { grad += ldc(iu[I_AIDX + s]); }
    let m = vf[O_MASA + i];
    // en x = x_t: −(m/h²)·(x − y) = (m/h)·v + m·g, y el aire todavía no empuja
    var r = -grad + (m / H) * ld(O_V, i) + vec3<f32>(0.0, m * GRAV, 0.0);
    var B = ld9(iu[I_DIAG + i]) + (m / (H * H) + AIRE * m / H) * I3;
    let o = O_CONT + 5u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      r += KC * vf[o + 4u] * nn;
      B += KC * outer(nn, nn);
    }
    if (iu[I_FIJO + i] != 0u) { r = vec3<f32>(0.0); }
    let Bi = inversa3(B);
    for (var a = 0u; a < 3u; a++) {
      for (var c = 0u; c < 3u; c++) { vf[O_PINV + 9u * i + 3u * a + c] = Bi[c][a]; }
    }
    let z = Bi * r;
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

// 7. gradiente conjugado: A·p con la matriz en franjas, la diagonal de la inercia y el contacto
@compute @workgroup_size(${WG}) fn spmv(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
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
      let pj = pv[j];
      ap += vec3<f32>(dot(vals[q], pj), dot(vals[NQ + q], pj), dot(vals[2u * NQ + q], pj));
    }
    let m = vf[O_MASA + i];
    let p = pv[i].xyz;
    ap += (m / (H * H) + AIRE * m / H) * p;
    let o = O_CONT + 5u * i;
    if (vf[o] > 0.5) {
      let nn = vec3<f32>(vf[o + 1u], vf[o + 2u], vf[o + 3u]);
      ap += KC * dot(nn, p) * nn;
    }
    if (iu[I_FIJO + i] != 0u) { ap = vec3<f32>(0.0); }
    st(O_AP, i, ap);
    pap = dot(p, ap);
  }
  let total = reducirSuma(l.x, pap);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarAlfa() {
  if (red[R_SC + E_ACTIVO] < 0.5) { return; }
  var pap = 0.0;
  for (var k = 0u; k < GV; k++) { pap += red[R_PA + k]; }
  if (red[R_SC + E_HECHO] > 0.5 || !(pap > 0.0)) {
    red[R_SC + E_ALFA] = 0.0;
    red[R_SC + E_HECHO] = 1.0;
    return;
  }
  red[R_SC + E_ALFA] = red[R_SC + E_RZ] / pap;
  red[R_SC + E_ITER] = red[R_SC + E_ITER] + 1.0;
}

@compute @workgroup_size(${WG}) fn actualizar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  var rz = 0.0;
  if (i < N) {
    let alfa = red[R_SC + E_ALFA];
    st(O_DX, i, ld(O_DX, i) + alfa * pv[i].xyz);
    let r = ld(O_R, i) - alfa * ld(O_AP, i);
    st(O_R, i, r);
    let o = O_PINV + 9u * i;
    let z = vec3<f32>(
      vf[o] * r.x + vf[o + 1u] * r.y + vf[o + 2u] * r.z,
      vf[o + 3u] * r.x + vf[o + 4u] * r.y + vf[o + 5u] * r.z,
      vf[o + 6u] * r.x + vf[o + 7u] * r.y + vf[o + 8u] * r.z);
    st(O_Z, i, z);
    rz = dot(r, z);
  }
  let total = reducirSuma(l.x, rz);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn sumarBeta() {
  if (red[R_SC + E_ACTIVO] < 0.5 || red[R_SC + E_HECHO] > 0.5) { return; }
  var rzn = 0.0;
  for (var k = 0u; k < GV; k++) { rzn += red[R_PA + k]; }
  if (rzn <= TOL2 * red[R_SC + E_RZ0]) {
    red[R_SC + E_HECHO] = 1.0;
    return;
  }
  red[R_SC + E_BETA] = rzn / red[R_SC + E_RZ];
  red[R_SC + E_RZ] = rzn;
}

@compute @workgroup_size(${WG}) fn nuevaP(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  if (!bandera(l.x, E_ACTIVO)) { return; }
  let i = g.x;
  if (i >= N) { return; }
  pv[i] = vec4<f32>(ld(O_Z, i) + red[R_SC + E_BETA] * pv[i].xyz, 0.0);
}

// 8. anticipación: los vértices que el paso metería en un obstáculo entran al sistema
@compute @workgroup_size(${WG}) fn anticipar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var nuevo = 0.0;
  if (i < N) {
    let o = O_CONT + 5u * i;
    if (iu[I_FIJO + i] == 0u && vf[o] < 0.5) {
      let x = ldx(i);
      let c = masCercano(x + ld(O_DX, i));
      if (SEP - c.c.x > 0.0) {
        vf[o] = 1.0; vf[o + 1u] = c.c.y; vf[o + 2u] = c.c.z; vf[o + 3u] = c.c.w;
        vf[o + 4u] = SEP - obstaculoK(x, c.k).x;
        nuevo = 1.0;
      }
    }
  }
  let total = reducirSuma(l.x, nuevo);
  if (l.x == 0u) { red[R_PA + w.x] = total; }
}

@compute @workgroup_size(1) fn armarRonda2() {
  var s = 0.0;
  for (var k = 0u; k < GV; k++) { s += red[R_PA + k]; }
  red[R_SC + E_NUEVOS] = s;
  red[R_SC + E_ACTIVO] = select(0.0, 1.0, s > 0.5);
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
    let xp = ld(O_XT, i) + red[R_SC + E_ALFA_LS] * ld(O_DX, i);
    st(O_XP, i, xp);
    de = energiaVertice(i, xp) - vf[O_EV0 + i];
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

@compute @workgroup_size(1) fn decidir() {
  if (red[R_SC + E_PROBANDO] < 0.5) { return; }
  var dg = 0.0;
  for (var k = 0u; k < GV; k++) { dg += red[R_PB + k]; }
  for (var k = 0u; k < GT; k++) { dg += red[R_PC + k]; }
  red[R_SC + E_DG] = dg;
  if (dg <= 0.0) { red[R_SC + E_PROBANDO] = 0.0; } else { red[R_SC + E_ALFA_LS] = 0.5 * red[R_SC + E_ALFA_LS]; }
}

// 10. el paso aceptado, la velocidad y la quietud (quietud.ts)
@compute @workgroup_size(${WG}) fn aplicar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let i = g.x;
  var mv = 0.0;
  var vmax = 0.0;
  if (i < N) {
    var alfa = 1.0;
    if (BUSQUEDA) { alfa = select(0.0, red[R_SC + E_ALFA_LS], red[R_SC + E_PROBANDO] < 0.5); }
    let dx = alfa * ld(O_DX, i);
    stx(i, ld(O_XT, i) + dx);
    st(O_V, i, dx / H);
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
}

@compute @workgroup_size(1) fn cerrarCuadro() {
  var s = 0.0;
  var mx = 0.0;
  for (var k = 0u; k < GV; k++) {
    s += red[R_PA + k];
    mx = max(mx, red[R_PB + k]);
  }
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
`;
}
