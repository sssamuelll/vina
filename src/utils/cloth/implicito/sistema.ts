/**
 * El sistema de un cuadro del motor implícito (spec 2026-10-13 §4.2.1): la tela en el patrón (membrana y
 * placa), las masas, los obstáculos y el estado. El cuadro minimiza
 *   G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contacto,  con y = x_t + h·v_t + h²·g.
 */
import { ALCANCE_MAXIMO, energiaDelPar, RejillaDeTriangulos, separacionPropia, type ParPropio } from './contactoPropio';
import { energiaDePlano, rigidezDeFriccion, type PlanoDeContacto } from './contactos';
import { Costuras, type BisagraDeCostura, type PuntoDeCostura } from './costuras';
import { puntoMasCercano, type PuntoEnTriangulo } from './cuerpo';
import { aMarcoDelHilo, type MallaDeTela } from './malla';
import { CAPAS_DEL_MARGEN, FLEXION_DEL_MARGEN } from './margen';
import { Membrana } from './membrana';
import { masCercano, RADIO_DE_BUSQUEDA, type Obstaculo } from './obstaculos';
import { Placa } from './placa';
import { prepararReposo } from './reposo';
import { separacion, telaSI, type TelaFisica, type TelaSI } from './tela';

export interface AjustesImplicito {
  /** s por cuadro */
  h: number;
  /** m/s², en y */
  gravedad: number;
  /** amortiguamiento del aire, proporcional a la masa (1/s) */
  aire: number;
  /** rigidez del contacto con los obstáculos (N/m) */
  kContacto: number;
  /**
   * rigidez de cada punto de costura (N/m). Con 1000, una costura que sostiene 1 N/m de tela con puntos cada
   * 5 mm queda abierta 5 µm; el banco de la camiseta la confirma (spec §5: «el resorte de costura se elige
   * con el banco»).
   */
  kCostura: number;
  /** capas de la franja del margen: multiplica su masa (margen.ts) */
  capasDelMargen: number;
  /** multiplica la flexión de la franja del margen (margen.ts) */
  flexionDelMargen: number;
  /** la tela contra sí misma y las puntas del cuerpo contra la tela (§4.3.2) */
  contactoPropio: boolean;
  /** iteraciones de gradiente conjugado por ronda */
  maxCG: number;
  /** tolerancia relativa: se para cuando rᵀz ≤ tolCG²·r0ᵀz0 */
  tolCG: number;
  /** agrega los contactos que el paso va a crear y resuelve otra vez (§4.2.1, paso 4) */
  anticipar: boolean;
  /** búsqueda en línea sobre G (§4.2.1, paso 5) */
  busqueda: boolean;
}

export const AJUSTES_IMPLICITO: AjustesImplicito = {
  h: 1 / 60,
  gravedad: -9.81,
  aire: 1,
  kContacto: 2000,
  kCostura: 1000,
  capasDelMargen: CAPAS_DEL_MARGEN,
  flexionDelMargen: FLEXION_DEL_MARGEN,
  contactoPropio: true,
  maxCG: 50,
  tolCG: 1e-4,
  anticipar: true,
  busqueda: true,
};

export interface OpcionesSistema {
  ajustes?: Partial<AjustesImplicito>;
  obstaculos?: Obstaculo[];
  /** dirección de la urdimbre en el dibujo; por defecto, vertical (§4.1.2) */
  hilo?: readonly [number, number];
  /** los puntos de costura de la prenda (costuras.ts) */
  costuras?: { puntos: readonly PuntoDeCostura[]; bisagras?: readonly BisagraDeCostura[] };
  /** 1 = el triángulo está en la franja del margen (prenda.ts, franjaDePrenda) */
  franja?: Uint8Array;
}

export class SistemaTela {
  readonly n: number;
  readonly tela: TelaSI;
  readonly aj: AjustesImplicito;
  readonly obstaculos: Obstaculo[];
  /** distancia que la tela guarda a los obstáculos (m) */
  readonly sep: number;
  readonly tris: Uint32Array;
  readonly coef: Float64Array;
  readonly masa: Float64Array;
  readonly fijo: Uint8Array;
  readonly membrana: Membrana;
  readonly placa: Placa;
  readonly costuras: Costuras;
  /** la flexión cruza las costuras desde que cierran */
  private cosida = false;
  /** posiciones */
  readonly x: Float64Array;
  /** posiciones al empezar el paso */
  readonly xt: Float64Array;
  /** velocidades */
  readonly v: Float64Array;
  /**
   * la velocidad que pidió el último paso de Newton (Δ/h), antes de que la búsqueda en línea lo recorte: es
   * la que mide la quietud, porque una tela trabada (α = 0) no se mueve pero sigue pidiendo moverse
   */
  readonly vPedida: Float64Array;
  /** los planos de contacto del cuadro en curso (E4): los de x_t y los anticipados */
  contactos: PlanoDeContacto[] = [];
  private readonly enContacto: Uint8Array;
  /** separación entre dos capas de la tela (m) */
  readonly sepPropia: number;
  /** los pares del contacto propio del cuadro en curso: candidatos y activos (contactoPropio.ts) */
  paresPropios: ParPropio[] = [];
  private readonly rejilla: RejillaDeTriangulos;
  /** por vértice: él y sus compañeros de costura, cuyos triángulos no cuentan para su contacto propio */
  private readonly excluidos: number[][];
  private readonly punto: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
  /** por cuerpo, 1 = ese vértice del cuerpo sostenía la tela el cuadro anterior */
  private readonly sostiene = new Map<object, Uint8Array>();

  constructor(malla: MallaDeTela, tela: TelaFisica, op: OpcionesSistema = {}) {
    this.n = malla.x.length / 3;
    this.tela = telaSI(tela);
    this.aj = { ...AJUSTES_IMPLICITO, ...op.ajustes };
    this.obstaculos = op.obstaculos ?? [];
    this.sep = separacion(this.tela);
    this.tris = malla.tris;
    const uv = aMarcoDelHilo(malla.patron, op.hilo);
    const franja = op.franja;
    const capas = franja ? Float64Array.from(franja, (f) => (f ? this.aj.capasDelMargen : 1)) : undefined;
    const flexion = franja ? Float64Array.from(franja, (f) => (f ? this.aj.flexionDelMargen : 1)) : undefined;
    const reposo = prepararReposo(uv, malla.tris, this.tela.densidad, malla.piezaDeTri, capas);
    this.coef = reposo.coef;
    this.masa = reposo.masa;
    this.fijo = malla.fijos ? Uint8Array.from(malla.fijos) : new Uint8Array(this.n);
    this.membrana = new Membrana(malla.tris, this.coef, this.tela);
    this.placa = new Placa(uv, malla.tris, this.tela, { costura: op.costuras?.bisagras, factor: flexion });
    this.x = Float64Array.from(malla.x);
    this.costuras = new Costuras(op.costuras?.puntos ?? [], malla.x, this.aj.kCostura);
    this.xt = Float64Array.from(malla.x);
    this.v = new Float64Array(3 * this.n);
    this.vPedida = new Float64Array(3 * this.n);
    this.enContacto = new Uint8Array(this.n);
    this.sepPropia = separacionPropia(this.tela.grosor);
    // la celda de la rejilla: la arista media del patrón, y nunca menos de dos separaciones
    let largo = 0;
    for (let t = 0; t < malla.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const a = malla.tris[3 * t + k], b = malla.tris[3 * t + ((k + 1) % 3)];
        largo += Math.hypot(uv[2 * b] - uv[2 * a], uv[2 * b + 1] - uv[2 * a + 1]);
      }
    }
    this.rejilla = new RejillaDeTriangulos(Math.max(2 * this.sepPropia, largo / Math.max(1, malla.tris.length)));
    this.excluidos = Array.from({ length: this.n }, (_, i) => [i]);
    for (let e = 0; e < this.costuras.n; e++) {
      const [a, b0, b1] = this.costuras.vertices(e);
      for (const b of [b0, b1]) {
        if (!this.excluidos[a].includes(b)) this.excluidos[a].push(b);
        if (!this.excluidos[b].includes(a)) this.excluidos[b].push(a);
      }
    }
  }

  /** La coordenada d de y = x_t + h·v + h²·g del vértice i; un empotrado no se mueve. */
  prediccion(i: number, d: number): number {
    const q = 3 * i + d;
    if (this.fijo[i]) return this.xt[q];
    const { h, gravedad } = this.aj;
    return this.xt[q] + h * this.v[q] + (d === 1 ? h * h * gravedad : 0);
  }

  /** Inercia y aire del vértice i en las posiciones x. */
  energiaVertice(i: number, x: Float64Array): number {
    const { h, aire } = this.aj, m = this.masa[i];
    let E = 0;
    for (let d = 0; d < 3; d++) {
      const q = x[3 * i + d];
      E += (m / (2 * h * h)) * (q - this.prediccion(i, d)) ** 2 + ((aire * m) / (2 * h)) * (q - this.xt[3 * i + d]) ** 2;
    }
    return E;
  }

  /** Los planos del cuadro en x, de un solo lado, con su fricción (contactos.ts). */
  energiaContactos(x: Float64Array): number {
    const kc = this.aj.kContacto;
    let E = 0;
    for (const c of this.contactos) {
      const q = 3 * c.i;
      E += energiaDePlano(c, kc, x[q] - this.xt[q], x[q + 1] - this.xt[q + 1], x[q + 2] - this.xt[q + 2]);
    }
    for (const par of this.paresPropios) if (par.activo) E += energiaDelPar(par, kc, x, this.xt);
    return E;
  }

  energiaElastica(x: Float64Array = this.x): number {
    return this.membrana.energia(x) + this.placa.energia(x) + this.costuras.energia(x);
  }

  /** G(x) del cuadro en curso. */
  energiaIncremental(x: Float64Array = this.x): number {
    let E = this.energiaElastica(x) + this.energiaContactos(x);
    for (let i = 0; i < this.n; i++) E += this.energiaVertice(i, x);
    return E;
  }

  /** Linealiza la membrana y la placa en las posiciones actuales. */
  linealizar(): void {
    this.membrana.linealizar(this.x);
    this.placa.linealizar(this.x);
    this.costuras.linealizar(this.x);
  }

  /** out = ∇E elástica, del último `linealizar`. */
  gradienteElastico(out: Float64Array): void {
    out.fill(0);
    this.membrana.gradiente(out);
    this.placa.gradiente(out);
    this.costuras.gradiente(out);
  }

  /** out = H·p elástica de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    out.fill(0);
    this.membrana.hessianaPor(p, out);
    this.placa.hessianaPor(p, out);
    this.costuras.hessianaPor(p, out);
  }

  /** out = los bloques 3×3 de la diagonal de la hessiana elástica (9 por vértice, fila mayor). */
  bloquesDiagonales(out: Float64Array): void {
    out.fill(0);
    this.membrana.sumarBloquesDiagonales(out);
    this.placa.sumarBloquesDiagonales(out);
    this.costuras.sumarBloquesDiagonales(out);
  }

  /** Lo que pasa entre un cuadro y el siguiente: las costuras se cierran un cuadro más, y al cerrar, la flexión las cruza. */
  alTerminarCuadro(): void {
    this.costuras.avanzarCierre();
    if (!this.cosida && this.costuras.n > 0 && this.costuras.cerradas()) {
      this.placa.activarCosturas();
      this.cosida = true;
    }
  }

  /**
   * Los planos de los vértices libres a menos de la separación de un obstáculo en x_t (§4.2.1, E4), con la
   * fricción de la normal λ = kc·p0 y la velocidad tangencial del cuadro anterior.
   */
  armarContactos(): void {
    this.contactos = [];
    this.enContacto.fill(0);
    const { kContacto, h } = this.aj, mu = this.tela.friccionCuerpo;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q], this.x[q + 1], this.x[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || this.sep - c.d <= 0) continue;
      const p0 = this.sep - c.d;
      const vn = c.nx * this.v[q] + c.ny * this.v[q + 1] + c.nz * this.v[q + 2];
      const vt = Math.hypot(this.v[q] - vn * c.nx, this.v[q + 1] - vn * c.ny, this.v[q + 2] - vn * c.nz);
      this.contactos.push({ i, nx: c.nx, ny: c.ny, nz: c.nz, p0, kt: rigidezDeFriccion(mu, kContacto * p0, vt, h) });
      this.enContacto[i] = 1;
    }
  }

  /**
   * Los pares del contacto propio en x_t (§4.3.2, E3): cada vértice libre contra los triángulos de tela a menos
   * de la separación entre capas más el alcance del cuadro (salvo los suyos y los de sus compañeros de costura),
   * y cada vértice del cuerpo contra los triángulos de tela que tiene encima. Entra activo el que ya está dentro
   * de la separación, con la fricción de la tela contra sí misma.
   */
  armarParesPropios(): void {
    this.paresPropios = [];
    if (!this.aj.contactoPropio) return;
    const { x, v, tris, punto: q } = this, sep = this.sepPropia, { kContacto: kc, h, gravedad } = this.aj, mu = this.tela.friccionTela;
    let vmax = 0;
    for (let i = 0; i < this.n; i++) vmax = Math.max(vmax, Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]));
    const radio = sep + Math.min(ALCANCE_MAXIMO, 2 * vmax * h + Math.abs(gravedad) * h * h);
    this.rejilla.armar(x, tris, radio);
    const agregar = (vs: number[], ws: number[], nx: number, ny: number, nz: number, s0: number, separacionDelPar: number) => {
      const p0 = separacionDelPar - s0;
      let kt = 0;
      if (p0 > 0) {
        let vx = 0, vy = 0, vz = 0;
        for (let k = 0; k < vs.length; k++) {
          vx += ws[k] * v[3 * vs[k]];
          vy += ws[k] * v[3 * vs[k] + 1];
          vz += ws[k] * v[3 * vs[k] + 2];
        }
        const vn = vx * nx + vy * ny + vz * nz;
        kt = rigidezDeFriccion(mu, kc * p0, Math.hypot(vx - vn * nx, vy - vn * ny, vz - vn * nz), h);
      }
      this.paresPropios.push({ v: vs, w: ws, nx, ny, nz, p0, kt, activo: p0 > 0 });
    };
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2], fuera = this.excluidos[i];
      for (const t of this.rejilla.cercanos(px, py, pz)) {
        const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
        if (fuera.includes(a) || fuera.includes(b) || fuera.includes(c)) continue;
        puntoMasCercano(px, py, pz, x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * c], x[3 * c + 1], x[3 * c + 2], q);
        const ex = px - q.x, ey = py - q.y, ez = pz - q.z, d = Math.hypot(ex, ey, ez);
        if (d >= radio || d < 1e-9) continue;
        agregar([i, a, b, c], [1, -q.wa, -q.wb, -q.wc], ex / d, ey / d, ez / d, d, sep);
      }
    }
    for (const o of this.obstaculos) {
      if (o.tipo !== 'cuerpo') continue;
      const yv = o.cuerpo.vertices, yn = o.cuerpo.normales;
      const antes = this.sostiene.get(o.cuerpo), ahora = new Uint8Array(yv.length / 3);
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < this.n; i++) {
        x0 = Math.min(x0, x[3 * i]);
        x1 = Math.max(x1, x[3 * i]);
        y0 = Math.min(y0, x[3 * i + 1]);
        y1 = Math.max(y1, x[3 * i + 1]);
        z0 = Math.min(z0, x[3 * i + 2]);
        z1 = Math.max(z1, x[3 * i + 2]);
      }
      for (let b = 0; b < yv.length / 3; b++) {
        const yx = yv[3 * b], yy = yv[3 * b + 1], yz = yv[3 * b + 2];
        if (yx < x0 - radio || yx > x1 + radio || yy < y0 - radio || yy > y1 + radio || yz < z0 - radio || yz > z1 + radio) continue;
        for (const t of this.rejilla.cercanos(yx, yy, yz)) {
          const t0 = tris[3 * t], t1 = tris[3 * t + 1], t2 = tris[3 * t + 2];
          if (this.fijo[t0] && this.fijo[t1] && this.fijo[t2]) continue;
          puntoMasCercano(yx, yy, yz, x[3 * t0], x[3 * t0 + 1], x[3 * t0 + 2], x[3 * t1], x[3 * t1 + 1], x[3 * t1 + 2], x[3 * t2], x[3 * t2 + 1], x[3 * t2 + 2], q);
          // una punta que atraviesa la tela cae dentro de un triángulo (rasgo 0); si el punto más cercano es un borde o un
          // vértice de la tela, el vértice del cuerpo está al costado y s no mide nada
          if (q.rasgo !== 0 || Math.hypot(yx - q.x, yy - q.y, yz - q.z) >= radio) continue;
          // la tela queda del lado de afuera del cuerpo, a la separación del cuerpo y no a la de dos capas: s = n·(punto de
          // la tela − y) ≥ sep. El par rescata la tela que una punta del cuerpo atravesó: entra cuando el vértice cruzó
          // la tela (s < 0) y sigue mientras la sostiene (s < sep). Sobre un cuerpo liso el apoyo lo dan los planos de
          // los vértices de tela; si estos pares entraran antes (o anticipados), competirían con ellos por el mismo
          // contacto: el centro de un triángulo plano queda más cerca del cuerpo que sus vértices, y la tela temblaba
          // sobre los vértices del cuerpo o la búsqueda en línea rechazaba el paso entero
          const nx = yn[3 * b], ny = yn[3 * b + 1], nz = yn[3 * b + 2];
          const s0 = nx * (q.x - yx) + ny * (q.y - yy) + nz * (q.z - yz);
          if (!(s0 < 0 || (antes?.[b] && s0 < this.sep))) continue;
          ahora[b] = 1;
          agregar([t0, t1, t2], [q.wa, q.wb, q.wc], nx, ny, nz, s0, this.sep);
        }
      }
      this.sostiene.set(o.cuerpo, ahora);
    }
  }

  /**
   * Los vértices que el paso dx metería en un obstáculo entran con el plano tangente en el punto adonde iban
   * (§4.2.1, paso 4). Su fricción usa la normal que frena en un cuadro la penetración que el paso traía,
   * λ = m·p/h²: sin ella, la tela que llega a un plano inclinado resbalaba sin fricción el primer cuadro.
   * Activa también los pares del contacto propio que el paso iba a cruzar. Devuelve cuántos.
   */
  anticiparContactos(dx: Float64Array): number {
    let nuevos = 0;
    const { h } = this.aj, mu = this.tela.friccionCuerpo;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i] || this.enContacto[i]) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q] + dx[q], this.x[q + 1] + dx[q + 1], this.x[q + 2] + dx[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || this.sep - c.d <= 0) continue;
      // la penetración en x_t respecto del plano tangente en el punto adonde iba: sep − d + n·dx
      const p0 = this.sep - c.d + (c.nx * dx[q] + c.ny * dx[q + 1] + c.nz * dx[q + 2]);
      const lambda = (this.masa[i] * (this.sep - c.d)) / (h * h);
      const vn = c.nx * this.v[q] + c.ny * this.v[q + 1] + c.nz * this.v[q + 2];
      const vt = Math.hypot(this.v[q] - vn * c.nx, this.v[q + 1] - vn * c.ny, this.v[q + 2] - vn * c.nz);
      this.contactos.push({ i, nx: c.nx, ny: c.ny, nz: c.nz, p0, kt: rigidezDeFriccion(mu, lambda, vt, h) });
      this.enContacto[i] = 1;
      nuevos++;
    }
    // los pares que el paso cruzaría, medidos sobre su plano fijo: también el que pasaría de un lado al otro
    for (const par of this.paresPropios) {
      if (par.activo) continue;
      let un = 0;
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        un += par.w[k] * (par.nx * dx[q] + par.ny * dx[q + 1] + par.nz * dx[q + 2]);
      }
      if (par.p0 - un > 0) {
        par.activo = true;
        nuevos++;
      }
    }
    return nuevos;
  }

  /** out += H·p de los planos del cuadro: kc·n·nᵀ + kt·(I − n·nᵀ). */
  sumarContactosPor(p: Float64Array, out: Float64Array): void {
    const kc = this.aj.kContacto;
    for (const c of this.contactos) {
      const q = 3 * c.i, pn = c.nx * p[q] + c.ny * p[q + 1] + c.nz * p[q + 2];
      out[q] += kc * pn * c.nx + c.kt * (p[q] - pn * c.nx);
      out[q + 1] += kc * pn * c.ny + c.kt * (p[q + 1] - pn * c.ny);
      out[q + 2] += kc * pn * c.nz + c.kt * (p[q + 2] - pn * c.nz);
    }
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      let qx = 0, qy = 0, qz = 0;
      for (let k = 0; k < par.v.length; k++) {
        const o = 3 * par.v[k];
        qx += par.w[k] * p[o];
        qy += par.w[k] * p[o + 1];
        qz += par.w[k] * p[o + 2];
      }
      const qn = par.nx * qx + par.ny * qy + par.nz * qz;
      const ax = kc * qn * par.nx + par.kt * (qx - qn * par.nx), ay = kc * qn * par.ny + par.kt * (qy - qn * par.ny), az = kc * qn * par.nz + par.kt * (qz - qn * par.nz);
      for (let k = 0; k < par.v.length; k++) {
        const o = 3 * par.v[k];
        out[o] += par.w[k] * ax;
        out[o + 1] += par.w[k] * ay;
        out[o + 2] += par.w[k] * az;
      }
    }
  }

  /** B[9i..9i+8] += el bloque de cada plano del cuadro. */
  sumarBloquesDeContacto(B: Float64Array): void {
    const kc = this.aj.kContacto;
    for (const c of this.contactos) {
      const n = [c.nx, c.ny, c.nz], o = 9 * c.i;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += (kc - c.kt) * n[a] * n[b] + (a === b ? c.kt : 0);
    }
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      const n = [par.nx, par.ny, par.nz];
      for (let k = 0; k < par.v.length; k++) {
        const o = 9 * par.v[k], w2 = par.w[k] * par.w[k];
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += w2 * ((kc - par.kt) * n[a] * n[b] + (a === b ? par.kt : 0));
      }
    }
  }

  /**
   * out = −∇G en las posiciones actuales, con cada plano del cuadro de dos lados, ½·kc·(p0 − n·u)², y su
   * fricción, ½·kt·|u − (n·u)·n|², con u = x − x_t: en la solución el plano no suelta (E4); en la búsqueda en
   * línea, sí. Los empotrados quedan en cero. Pide `linealizar` y `armarContactos` antes.
   */
  residuo(out: Float64Array): void {
    this.gradienteElastico(out);
    const { h, aire, kContacto: kc } = this.aj;
    for (let i = 0; i < this.n; i++) {
      const m = this.masa[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        out[q] = -(out[q] + (m / (h * h)) * (this.x[q] - this.prediccion(i, d)) + ((aire * m) / h) * (this.x[q] - this.xt[q]));
      }
    }
    for (const c of this.contactos) {
      const q = 3 * c.i;
      const ux = this.x[q] - this.xt[q], uy = this.x[q + 1] - this.xt[q + 1], uz = this.x[q + 2] - this.xt[q + 2];
      const un = c.nx * ux + c.ny * uy + c.nz * uz, f = kc * (c.p0 - un);
      out[q] += f * c.nx - c.kt * (ux - un * c.nx);
      out[q + 1] += f * c.ny - c.kt * (uy - un * c.ny);
      out[q + 2] += f * c.nz - c.kt * (uz - un * c.nz);
    }
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      let ux = 0, uy = 0, uz = 0;
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        ux += par.w[k] * (this.x[q] - this.xt[q]);
        uy += par.w[k] * (this.x[q + 1] - this.xt[q + 1]);
        uz += par.w[k] * (this.x[q + 2] - this.xt[q + 2]);
      }
      const un = par.nx * ux + par.ny * uy + par.nz * uz, f = kc * (par.p0 - un);
      const fx = f * par.nx - par.kt * (ux - un * par.nx), fy = f * par.ny - par.kt * (uy - un * par.ny), fz = f * par.nz - par.kt * (uz - un * par.nz);
      for (let k = 0; k < par.v.length; k++) {
        const q = 3 * par.v[k];
        out[q] += par.w[k] * fx;
        out[q + 1] += par.w[k] * fy;
        out[q + 2] += par.w[k] * fz;
      }
    }
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  }
}
