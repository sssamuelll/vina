/**
 * El sistema de un cuadro del motor implícito (spec 2026-10-13 §4.2.1): la tela en el patrón (membrana y
 * placa), las masas, los obstáculos y el estado. El cuadro minimiza
 *   G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contacto,  con y = x_t + h·v_t + h²·g.
 */
import { energiaDePlano, rigidezDeFriccion, type PlanoDeContacto } from './contactos';
import { Costuras, type BisagraDeCostura, type PuntoDeCostura } from './costuras';
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
   * Los vértices que el paso dx metería en un obstáculo entran con el plano tangente en el punto adonde iban
   * (§4.2.1, paso 4). Su fricción usa la normal que frena en un cuadro la penetración que el paso traía,
   * λ = m·p/h²: sin ella, la tela que llega a un plano inclinado resbalaba sin fricción el primer cuadro.
   * Devuelve cuántos.
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
  }

  /** B[9i..9i+8] += el bloque de cada plano del cuadro. */
  sumarBloquesDeContacto(B: Float64Array): void {
    const kc = this.aj.kContacto;
    for (const c of this.contactos) {
      const n = [c.nx, c.ny, c.nz], o = 9 * c.i;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += (kc - c.kt) * n[a] * n[b] + (a === b ? c.kt : 0);
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
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  }
}
