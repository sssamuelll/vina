/**
 * El sistema de un cuadro del motor implícito (spec 2026-10-13 §4.2.1): la tela en el patrón (membrana y
 * placa), las masas, los obstáculos y el estado. El cuadro minimiza
 *   G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contacto,  con y = x_t + h·v_t + h²·g.
 */
import {
  celdaDeLaRejilla, celdaDeRegion, energiaDelPar, radioDeBusqueda, RegionesDeRapidez, RejillaDePuntos, separacionPropia, type ParPropio,
} from './contactoPropio';
import { energiaDeFriccion, HOLGURA_DE_APOYO, rigidezDeFriccion, VELOCIDAD_DE_DESPEGUE, type ApoyoEnCuerpo } from './contactos';
import { Costuras, MUESTRAS_DE_PUNTADA, type BisagraDeCostura, type PuntoDeCostura } from './costuras';
import { puntoMasCercano, type CuerpoRigido, type PuntoEnTriangulo } from './cuerpo';
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
  /**
   * rigidez de los pares de una punta del cuerpo contra un triángulo de tela (N/m), lo que la malla de la tela no ve; el
   * vértice de tela apoyado en el cuerpo no lleva resorte: es un piso duro (E10, contactos.ts)
   */
  kContacto: number;
  /** rigidez de los pares entre capas de tela (N/m); sin ella, kContacto */
  kPropio?: number;
  /**
   * rigidez de cada punto de costura (N/m). Con 1000, una costura que sostiene 1 N/m de tela con puntos cada
   * 5 mm queda abierta 5 µm. El banco todavía no la escoge (spec §5): el 2026-10-16, con 300, 1000 y 3000 N/m la
   * camiseta no quedó quieta y ninguno cumplió las costuras de §2; 3000 las cerró mejor pero duplicó los aplastados
   * en la CPU a 20 mm. Queda 1000 hasta que el gradiente conjugado converja.
   */
  kCostura: number;
  /**
   * lo más que se cierra en un cuadro el largo de reposo de una costura (m, E7): con huecos de decenas de centímetros
   * en la colocación, el cierre de ×0,97¹⁵ tiraba de cada costura más de un tercio de su hueco en el primer cuadro.
   * 5 mm es el valor de partida: entre 2, 5 y 10 mm la camiseta queda dentro del ruido de la GPU (spec §7, E7)
   */
  cierreMaximo: number;
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
  /** búsqueda en línea sobre G (§4.2.1, paso 5) */
  busqueda: boolean;
}

export const AJUSTES_IMPLICITO: AjustesImplicito = {
  h: 1 / 60,
  gravedad: -9.81,
  aire: 1,
  kContacto: 2000,
  kCostura: 1000,
  cierreMaximo: 0.005,
  capasDelMargen: CAPAS_DEL_MARGEN,
  flexionDelMargen: FLEXION_DEL_MARGEN,
  contactoPropio: true,
  maxCG: 50,
  tolCG: 1e-4,
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
  /** los vértices apoyados en el cuerpo en el cuadro en curso (E10) */
  apoyos: ApoyoEnCuerpo[] = [];
  /**
   * por vértice, la fuerza (N) con que el cuerpo lo sostuvo el último cuadro: la de su restricción, o la que lo frenó al
   * proyectarlo; negativa si la restricción jalaba hacia el cuerpo (entonces se suelta). Decide la fricción del cuadro
   * siguiente.
   */
  readonly fuerzaDeApoyo: Float64Array;
  /** separación entre dos capas de la tela (m) */
  readonly sepPropia: number;
  /** los pares del contacto propio del cuadro en curso: candidatos y activos (contactoPropio.ts) */
  paresPropios: ParPropio[] = [];
  private readonly rejilla = new RejillaDePuntos();
  /**
   * por vértice: él y sus compañeros de costura, cuyos triángulos no cuentan para su contacto propio (lo lee también
   * gpu/empaquetar.ts)
   */
  readonly excluidos: number[][];
  /** la arista media del patrón (m): el lado mínimo de la celda de la rejilla del contacto propio */
  readonly aristaMedia: number;
  /** los cuerpos rígidos de los obstáculos, en orden: sus vértices van en la rejilla detrás de los de la tela */
  private readonly cuerpos: CuerpoRigido[];
  /** las posiciones que guarda la rejilla: la tela (se copia cada cuadro) y los vértices de cada cuerpo */
  private readonly puntos: Float64Array;
  private readonly punto: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
  /** por cuerpo, 1 = ese vértice del cuerpo sostenía la tela el cuadro anterior */
  private sostiene: Uint8Array[];

  constructor(malla: MallaDeTela, tela: TelaFisica, op: OpcionesSistema = {}) {
    this.n = malla.x.length / 3;
    this.tela = telaSI(tela);
    this.aj = { ...AJUSTES_IMPLICITO, ...op.ajustes };
    if (!(this.aj.cierreMaximo > 0)) throw new Error(`SistemaTela: cierreMaximo tiene que ser positivo (llegó ${this.aj.cierreMaximo})`);
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
    this.costuras = new Costuras(op.costuras?.puntos ?? [], malla.x, this.aj.kCostura, this.aj.cierreMaximo, this.fijo);
    this.xt = Float64Array.from(malla.x);
    this.v = new Float64Array(3 * this.n);
    this.vPedida = new Float64Array(3 * this.n);
    this.fuerzaDeApoyo = new Float64Array(this.n);
    this.sepPropia = separacionPropia(this.tela.grosor);
    // la arista media del patrón: con dos separaciones y el radio de búsqueda, decide la celda de la rejilla
    let largo = 0;
    for (let t = 0; t < malla.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const a = malla.tris[3 * t + k], b = malla.tris[3 * t + ((k + 1) % 3)];
        largo += Math.hypot(uv[2 * b] - uv[2 * a], uv[2 * b + 1] - uv[2 * a + 1]);
      }
    }
    this.aristaMedia = largo / Math.max(1, malla.tris.length);
    this.cuerpos = this.obstaculos.flatMap((o) => (o.tipo === 'cuerpo' ? [o.cuerpo] : []));
    this.puntos = new Float64Array(3 * this.n + this.cuerpos.reduce((suma, c) => suma + c.vertices.length, 0));
    let o = 3 * this.n;
    for (const c of this.cuerpos) {
      this.puntos.set(c.vertices, o);
      o += c.vertices.length;
    }
    this.sostiene = this.cuerpos.map((c) => new Uint8Array(c.vertices.length / 3));
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

  /** La fricción de los apoyos del cuadro y los pares del contacto propio, en x (contactos.ts y contactoPropio.ts). */
  energiaContactos(x: Float64Array): number {
    let E = 0;
    for (const c of this.apoyos) {
      const q = 3 * c.i;
      E += energiaDeFriccion(c, x[q] - this.xt[q], x[q + 1] - this.xt[q + 1], x[q + 2] - this.xt[q + 2]);
    }
    for (const par of this.paresPropios) if (par.activo) E += energiaDelPar(par, par.k, x, this.xt);
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

  /**
   * Lo que pasa entre un cuadro y el siguiente: las costuras se cierran un cuadro más, se cosen las que quedaron cerca
   * de su punto (E8), y al cerrar todas, la flexión las cruza.
   */
  alTerminarCuadro(): void {
    this.costuras.avanzarCierre();
    this.costuras.coser(this.x, (e, d) => this.cruzaUnObstaculo(this.costuras.a[e], d));
    if (!this.cosida && this.costuras.n > 0 && this.costuras.cerradas()) {
      this.placa.activarCosturas();
      this.cosida = true;
    }
  }

  /**
   * E8: la línea entre el vértice a y su punto (x_a − d) entra en un obstáculo más hondo que la separación. Se miran
   * sus puntos intermedios, sin las puntas: una puntada no se cierra a través del cuerpo.
   */
  cruzaUnObstaculo(a: number, d: readonly number[]): boolean {
    const q = 3 * a;
    for (let k = 1; k < MUESTRAS_DE_PUNTADA && this.obstaculos.length > 0; k++) {
      const t = k / MUESTRAS_DE_PUNTADA;
      const c = masCercano(this.obstaculos, this.x[q] - t * d[0], this.x[q + 1] - t * d[1], this.x[q + 2] - t * d[2], RADIO_DE_BUSQUEDA);
      if (c && c.d < -this.sep) return true;
    }
    return false;
  }

  /** v[i] = 0 en cada vértice empotrado. */
  anularFijos(v: Float64Array): void {
    for (let i = 0; i < this.n; i++) if (this.fijo[i]) v[3 * i] = v[3 * i + 1] = v[3 * i + 2] = 0;
  }

  /**
   * Los vértices apoyados en el cuerpo en x_t (E10): libres y sin coser, a menos de la separación más la holgura, sin
   * irse hacia afuera y sin que el cuadro anterior los jalara hacia el cuerpo. La fricción usa la fuerza de apoyo del
   * cuadro anterior, nunca menos que el peso que el vértice carga sobre el cuerpo (el primer cuadro apoyado no tiene
   * otra), y la velocidad tangencial del cuadro anterior.
   */
  armarApoyos(): void {
    this.apoyos = [];
    const { h, gravedad } = this.aj, mu = this.tela.friccionCuerpo;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i] || this.costuras.cosidoV(i) || this.fuerzaDeApoyo[i] < 0) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q], this.x[q + 1], this.x[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || c.d >= this.sep + HOLGURA_DE_APOYO) continue;
      const vn = c.nx * this.v[q] + c.ny * this.v[q + 1] + c.nz * this.v[q + 2];
      if (vn > VELOCIDAD_DE_DESPEGUE) continue;
      const vt = Math.hypot(this.v[q] - vn * c.nx, this.v[q + 1] - vn * c.ny, this.v[q + 2] - vn * c.nz);
      const lambda = Math.max(this.fuerzaDeApoyo[i], -this.masa[i] * gravedad * c.ny);
      this.apoyos.push({ i, nx: c.nx, ny: c.ny, nz: c.nz, kt: rigidezDeFriccion(mu, lambda, vt, h) });
    }
  }

  /** Quita a v la componente normal de cada apoyo: el vértice apoyado no se mueve en la normal del cuerpo (E10). */
  filtrar(v: Float64Array): void {
    for (const c of this.apoyos) {
      const q = 3 * c.i, vn = c.nx * v[q] + c.ny * v[q + 1] + c.nz * v[q + 2];
      v[q] -= vn * c.nx;
      v[q + 1] -= vn * c.ny;
      v[q + 2] -= vn * c.nz;
    }
  }

  /** out[k] = n·v del apoyo k. */
  normalesDeApoyo(v: Float64Array, out: Float64Array): void {
    this.apoyos.forEach((c, k) => (out[k] = c.nx * v[3 * c.i] + c.ny * v[3 * c.i + 1] + c.nz * v[3 * c.i + 2]));
  }

  /**
   * La fuerza de cada apoyo es −n·r, con r el residuo sin filtrar al terminar el gradiente conjugado: lo que la
   * restricción tuvo que poner para que el vértice no se moviera en la normal. Los demás vértices quedan en 0.
   */
  guardarFuerzasDeApoyo(rn: Float64Array): void {
    this.fuerzaDeApoyo.fill(0);
    this.apoyos.forEach((c, k) => (this.fuerzaDeApoyo[c.i] = -rn[k]));
  }

  /**
   * Al terminar el paso (E10): el vértice libre y sin coser que quedó a menos de la separación de un obstáculo vuelve a
   * ella por la normal, sin velocidad hacia adentro; su fuerza de apoyo es la que lo frenó en el cuadro. Devuelve cuántos.
   */
  proyectar(): number {
    const { h } = this.aj;
    let proyectados = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.fijo[i] || this.costuras.cosidoV(i)) continue;
      const q = 3 * i;
      const c = masCercano(this.obstaculos, this.x[q], this.x[q + 1], this.x[q + 2], RADIO_DE_BUSQUEDA);
      if (c === null || c.d >= this.sep) continue;
      const p = this.sep - c.d;
      this.x[q] += p * c.nx;
      this.x[q + 1] += p * c.ny;
      this.x[q + 2] += p * c.nz;
      const vn = c.nx * this.v[q] + c.ny * this.v[q + 1] + c.nz * this.v[q + 2];
      if (vn < 0) {
        this.v[q] -= vn * c.nx;
        this.v[q + 1] -= vn * c.ny;
        this.v[q + 2] -= vn * c.nz;
        this.fuerzaDeApoyo[i] = Math.max(this.fuerzaDeApoyo[i], (this.masa[i] * -vn) / h);
      }
      proyectados++;
    }
    return proyectados;
  }

  /**
   * Los pares del contacto propio en x_t (§4.3.2, E3 y E6): cada triángulo de tela mira, en la rejilla de puntos, los
   * que caen en su caja agrandada por el radio de búsqueda. Un vértice libre de tela entra si cae sobre la cara a menos
   * del radio (salvo los vértices del triángulo y sus compañeros de costura); un vértice del cuerpo, si atravesó la
   * tela por la cara o la sostenía el cuadro anterior. Entra activo el que ya está dentro de la separación, con su
   * fricción, y el par de dos capas que el cuadro sin fuerzas (y = x_t + h·v + h²·g) metería en la separación (E10: sin
   * segunda ronda, la predicción reemplaza a la anticipación). Cada triángulo busca hasta su propio radio, el de su
   * rapidez y la de su región (contactoPropio.ts, radioDeBusqueda).
   */
  armarParesPropios(): void {
    this.paresPropios = [];
    if (!this.aj.contactoPropio) return;
    const { x, v, tris, fijo, n, punto: q } = this, sep = this.sepPropia, { kContacto, kPropio, h, gravedad } = this.aj, kp = kPropio ?? kContacto;
    const rapidez = (i: number) => Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]);
    const regiones = new RegionesDeRapidez(celdaDeRegion(sep, this.aristaMedia));
    for (let i = 0; i < n; i++) regiones.anotar(x[3 * i], x[3 * i + 1], x[3 * i + 2], rapidez(i));
    this.puntos.set(x);
    this.rejilla.armar(this.puntos, celdaDeLaRejilla(sep, this.aristaMedia));
    const agregar = (vs: number[], ws: number[], nx: number, ny: number, nz: number, s0: number, separacionDelPar: number, mu: number, k: number, predecir: boolean) => {
      const p0 = separacionDelPar - s0;
      let vx = 0, vy = 0, vz = 0, un = 0;
      for (let q = 0; q < vs.length; q++) {
        vx += ws[q] * v[3 * vs[q]];
        vy += ws[q] * v[3 * vs[q] + 1];
        vz += ws[q] * v[3 * vs[q] + 2];
        // lo que la separación cambia en el cuadro sin fuerzas, hasta y = x_t + h·v + h²·g (la gravedad se va salvo en
        // un empotrado)
        const o = 3 * vs[q];
        un += ws[q] * ((this.prediccion(vs[q], 0) - x[o]) * nx + (this.prediccion(vs[q], 1) - x[o + 1]) * ny + (this.prediccion(vs[q], 2) - x[o + 2]) * nz);
      }
      const vn = vx * nx + vy * ny + vz * nz;
      const kt = p0 > 0 ? rigidezDeFriccion(mu, k * p0, Math.hypot(vx - vn * nx, vy - vn * ny, vz - vn * nz), h) : 0;
      // E10: entra también el que el cuadro sin fuerzas metería en la separación; uno más lejos, con el resorte de dos
      // lados de la solución, jalaría las capas una contra otra
      this.paresPropios.push({ v: vs, w: ws, nx, ny, nz, p0, k, kt, activo: p0 > 0 || (predecir && p0 - un > 0) });
    };
    const ahora = this.cuerpos.map((c) => new Uint8Array(c.vertices.length / 3));
    for (let t = 0; t < tris.length / 3; t++) {
      const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
      const ax = x[3 * a], ay = x[3 * a + 1], az = x[3 * a + 2], bx = x[3 * b], by = x[3 * b + 1], bz = x[3 * b + 2];
      const cx = x[3 * c], cy = x[3 * c + 1], cz = x[3 * c + 2];
      const libres = !(fijo[a] && fijo[b] && fijo[c]);
      const radio = radioDeBusqueda(sep, Math.max(rapidez(a), rapidez(b), rapidez(c)), regiones.alrededor((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3), h, gravedad);
      // E6: un punto cae sobre la cara cerrada del triángulo si su separación del punto más cercano va a lo largo de la
      // normal de la cara; la tolerancia de 1/1000 deja entrar al que cae justo sobre un borde o un vértice (mallas
      // alineadas), y el vecino de la misma capa, que la mira de canto, queda fuera
      const tnx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), tny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const tnz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), tn2 = tnx * tnx + tny * tny + tnz * tnz;
      const sobreLaCara = (ex: number, ey: number, ez: number) => {
        const e2 = ex * ex + ey * ey + ez * ez, en = ex * tnx + ey * tny + ez * tnz;
        return e2 - (en * en) / tn2 <= 1e-6 * e2;
      };
      this.rejilla.enCaja(
        Math.min(ax, bx, cx) - radio, Math.min(ay, by, cy) - radio, Math.min(az, bz, cz) - radio,
        Math.max(ax, bx, cx) + radio, Math.max(ay, by, cy) + radio, Math.max(az, bz, cz) + radio,
        (p) => {
          if (p < n) {
            if (fijo[p]) return;
            const fuera = this.excluidos[p];
            if (fuera.includes(a) || fuera.includes(b) || fuera.includes(c)) return;
            const px = x[3 * p], py = x[3 * p + 1], pz = x[3 * p + 2];
            puntoMasCercano(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, q);
            const ex = px - q.x, ey = py - q.y, ez = pz - q.z, d = Math.hypot(ex, ey, ez);
            if (d >= radio || d < 1e-9 || !sobreLaCara(ex, ey, ez)) return;
            agregar([p, a, b, c], [1, -q.wa, -q.wb, -q.wc], ex / d, ey / d, ez / d, d, sep, this.tela.friccionTela, kp, true);
            return;
          }
          if (!libres) return;
          let k = 0, j = p - n;
          while (j >= this.cuerpos[k].vertices.length / 3) j -= this.cuerpos[k++].vertices.length / 3;
          const cuerpo = this.cuerpos[k], yx = cuerpo.vertices[3 * j], yy = cuerpo.vertices[3 * j + 1], yz = cuerpo.vertices[3 * j + 2];
          puntoMasCercano(yx, yy, yz, ax, ay, az, bx, by, bz, cx, cy, cz, q);
          // una punta que atraviesa la tela cae sobre la cara de un triángulo (E6); si no, el vértice del cuerpo está al
          // costado y s no mide nada.
          // La tela queda del lado de afuera del cuerpo, a la separación del cuerpo y no a la de dos capas: s = n·(punto de
          // la tela − y) ≥ sep. El par rescata la tela que una punta del cuerpo atravesó: entra cuando el vértice cruzó
          // la tela (s < 0) y sigue mientras la sostiene (s < sep). Sobre un cuerpo liso el apoyo lo dan los planos de
          // los vértices de tela; si estos pares entraran antes (o anticipados), competirían con ellos por el mismo
          // contacto: el centro de un triángulo plano queda más cerca del cuerpo que sus vértices, y la tela temblaba
          // sobre los vértices del cuerpo o la búsqueda en línea rechazaba el paso entero
          if (Math.hypot(yx - q.x, yy - q.y, yz - q.z) >= radio || !sobreLaCara(yx - q.x, yy - q.y, yz - q.z)) return;
          const nx = cuerpo.normales[3 * j], ny = cuerpo.normales[3 * j + 1], nz = cuerpo.normales[3 * j + 2];
          const s0 = nx * (q.x - yx) + ny * (q.y - yy) + nz * (q.z - yz);
          if (!(s0 < 0 || (this.sostiene[k][j] && s0 < this.sep))) return;
          ahora[k][j] = 1;
          // tela contra cuerpo: la fricción del cuerpo (§4.3.1); la punta no se predice (R13)
          agregar([a, b, c], [q.wa, q.wb, q.wc], nx, ny, nz, s0, this.sep, this.tela.friccionCuerpo, kContacto, false);
        },
      );
    }
    this.sostiene = ahora;
  }

  /** out += H·p de la fricción de los apoyos, kt·(I − n·nᵀ), y de los pares activos. */
  sumarContactosPor(p: Float64Array, out: Float64Array): void {
    for (const c of this.apoyos) {
      const q = 3 * c.i, pn = c.nx * p[q] + c.ny * p[q + 1] + c.nz * p[q + 2];
      out[q] += c.kt * (p[q] - pn * c.nx);
      out[q + 1] += c.kt * (p[q + 1] - pn * c.ny);
      out[q + 2] += c.kt * (p[q + 2] - pn * c.nz);
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
      const ax = par.k * qn * par.nx + par.kt * (qx - qn * par.nx), ay = par.k * qn * par.ny + par.kt * (qy - qn * par.ny), az = par.k * qn * par.nz + par.kt * (qz - qn * par.nz);
      for (let k = 0; k < par.v.length; k++) {
        const o = 3 * par.v[k];
        out[o] += par.w[k] * ax;
        out[o + 1] += par.w[k] * ay;
        out[o + 2] += par.w[k] * az;
      }
    }
  }

  /** B[9i..9i+8] += el bloque de la fricción de cada apoyo y de cada par activo. */
  sumarBloquesDeContacto(B: Float64Array): void {
    for (const c of this.apoyos) {
      const n = [c.nx, c.ny, c.nz], o = 9 * c.i;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += -c.kt * n[a] * n[b] + (a === b ? c.kt : 0);
    }
    for (const par of this.paresPropios) {
      if (!par.activo) continue;
      const n = [par.nx, par.ny, par.nz];
      for (let k = 0; k < par.v.length; k++) {
        const o = 9 * par.v[k], w2 = par.w[k] * par.w[k];
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) B[o + 3 * a + b] += w2 * ((par.k - par.kt) * n[a] * n[b] + (a === b ? par.kt : 0));
      }
    }
  }

  /**
   * out = −∇G en las posiciones actuales, con la fricción de cada apoyo, ½·kt·|u − (n·u)·n|², y cada par activo, con
   * u = x − x_t (la normal de un apoyo no lleva energía: la fija su restricción, E10). Los empotrados quedan en cero.
   * Pide `linealizar`, `armarApoyos` y `armarParesPropios` antes.
   */
  residuo(out: Float64Array): void {
    this.gradienteElastico(out);
    const { h, aire } = this.aj;
    for (let i = 0; i < this.n; i++) {
      const m = this.masa[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        out[q] = -(out[q] + (m / (h * h)) * (this.x[q] - this.prediccion(i, d)) + ((aire * m) / h) * (this.x[q] - this.xt[q]));
      }
    }
    for (const c of this.apoyos) {
      const q = 3 * c.i;
      const ux = this.x[q] - this.xt[q], uy = this.x[q + 1] - this.xt[q + 1], uz = this.x[q + 2] - this.xt[q + 2];
      const un = c.nx * ux + c.ny * uy + c.nz * uz;
      out[q] -= c.kt * (ux - un * c.nx);
      out[q + 1] -= c.kt * (uy - un * c.ny);
      out[q + 2] -= c.kt * (uz - un * c.nz);
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
      const un = par.nx * ux + par.ny * uy + par.nz * uz, f = par.k * (par.p0 - un);
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
