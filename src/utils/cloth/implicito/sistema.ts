/**
 * El sistema de un cuadro del motor implícito (spec 2026-10-13 §4.2.1): la tela en el patrón (membrana y
 * placa), las masas, los obstáculos y el estado. El cuadro minimiza
 *   G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contacto,  con y = x_t + h·v_t + h²·g.
 */
import { Costuras, type PuntoDeCostura } from './costuras';
import { aMarcoDelHilo, type MallaDeTela } from './malla';
import { Membrana } from './membrana';
import { masCercano, type Obstaculo } from './obstaculos';
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
  costuras?: { puntos: readonly PuntoDeCostura[] };
}

/** Un vértice en contacto: obstáculo k, su normal y la penetración p0 = separación − distancia al empezar el paso. */
export interface ContactoActivo {
  i: number;
  k: number;
  nx: number;
  ny: number;
  nz: number;
  p0: number;
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

  constructor(malla: MallaDeTela, tela: TelaFisica, op: OpcionesSistema = {}) {
    this.n = malla.x.length / 3;
    this.tela = telaSI(tela);
    this.aj = { ...AJUSTES_IMPLICITO, ...op.ajustes };
    this.obstaculos = op.obstaculos ?? [];
    this.sep = separacion(this.tela);
    this.tris = malla.tris;
    const uv = aMarcoDelHilo(malla.patron, op.hilo);
    const reposo = prepararReposo(uv, malla.tris, this.tela.densidad, malla.piezaDeTri);
    this.coef = reposo.coef;
    this.masa = reposo.masa;
    this.fijo = malla.fijos ? Uint8Array.from(malla.fijos) : new Uint8Array(this.n);
    this.membrana = new Membrana(malla.tris, this.coef, this.tela);
    this.placa = new Placa(uv, malla.tris, this.tela);
    this.x = Float64Array.from(malla.x);
    this.costuras = new Costuras(op.costuras?.puntos ?? [], malla.x, this.aj.kCostura);
    this.xt = Float64Array.from(malla.x);
    this.v = new Float64Array(3 * this.n);
    this.vPedida = new Float64Array(3 * this.n);
  }

  /** La coordenada d de y = x_t + h·v + h²·g del vértice i; un empotrado no se mueve. */
  prediccion(i: number, d: number): number {
    const q = 3 * i + d;
    if (this.fijo[i]) return this.xt[q];
    const { h, gravedad } = this.aj;
    return this.xt[q] + h * this.v[q] + (d === 1 ? h * h * gravedad : 0);
  }

  /** Inercia, aire y contacto del vértice i en las posiciones x. */
  energiaVertice(i: number, x: Float64Array): number {
    const { h, aire, kContacto } = this.aj, m = this.masa[i];
    let E = 0;
    for (let d = 0; d < 3; d++) {
      const q = x[3 * i + d];
      E += (m / (2 * h * h)) * (q - this.prediccion(i, d)) ** 2 + ((aire * m) / (2 * h)) * (q - this.xt[3 * i + d]) ** 2;
    }
    const c = masCercano(this.obstaculos, x[3 * i], x[3 * i + 1], x[3 * i + 2]);
    const p = c === null ? 0 : this.sep - c.d;
    return p > 0 ? E + 0.5 * kContacto * p * p : E;
  }

  energiaElastica(x: Float64Array = this.x): number {
    return this.membrana.energia(x) + this.placa.energia(x) + this.costuras.energia(x);
  }

  /** G(x) del cuadro en curso. */
  energiaIncremental(x: Float64Array = this.x): number {
    let E = this.energiaElastica(x);
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

  /** Lo que pasa entre un cuadro y el siguiente: las costuras se cierran un cuadro más. */
  alTerminarCuadro(): void {
    this.costuras.avanzarCierre();
  }

  /** Los vértices libres que están a menos de la separación de un obstáculo, en las posiciones actuales. */
  contactosActuales(): ContactoActivo[] {
    const lista: ContactoActivo[] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i]) continue;
      const c = masCercano(this.obstaculos, this.x[3 * i], this.x[3 * i + 1], this.x[3 * i + 2]);
      if (c !== null && this.sep - c.d > 0) lista.push({ i, k: c.k, nx: c.nx, ny: c.ny, nz: c.nz, p0: this.sep - c.d });
    }
    return lista;
  }

  /**
   * out = −∇G en las posiciones actuales, con el contacto linealizado ½·kContacto·(p0 − n·Δx)² de cada
   * vértice de `contactos` (exacto al empezar el paso, con x = x_t). Los empotrados quedan en cero. Pide
   * `linealizar` antes.
   */
  residuo(contactos: readonly ContactoActivo[], out: Float64Array): void {
    this.gradienteElastico(out);
    const { h, aire, kContacto } = this.aj;
    for (let i = 0; i < this.n; i++) {
      const m = this.masa[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        out[q] = -(out[q] + (m / (h * h)) * (this.x[q] - this.prediccion(i, d)) + ((aire * m) / h) * (this.x[q] - this.xt[q]));
      }
    }
    for (const c of contactos) {
      out[3 * c.i] += kContacto * c.p0 * c.nx;
      out[3 * c.i + 1] += kContacto * c.p0 * c.ny;
      out[3 * c.i + 2] += kContacto * c.p0 * c.nz;
    }
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  }
}
