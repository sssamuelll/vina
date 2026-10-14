/**
 * El motor implícito en la GPU (spec 2026-10-13 §4.2.2): el mismo cuadro que paso.ts, en WGSL, sobre un
 * GPUDevice que recibe de afuera. El cuadro entero va en un pase de cómputo y los escalares no salen de la
 * GPU; solo se leen cuando alguien los pide.
 */
import type { SistemaTela } from '../sistema';
import { empaquetar, type PaqueteGpu } from './empaquetar';
import { distribuir, ENTRADAS, ESC, wgslDelMotor, type Distribucion } from './wgsl';

type Entrada = (typeof ENTRADAS)[number];
type Bufer = 'pos' | 'vf' | 'tf' | 'iu' | 'red' | 'vals' | 'pv' | 'at';
/** En el orden de las ligaduras del WGSL. */
const BUFERES: Bufer[] = ['pos', 'vf', 'tf', 'iu', 'red', 'vals', 'pv', 'at'];

/** Lo que dejó el último cuadro: iteraciones, contactos anticipados, paso aceptado, quietud y pares de contacto propio (§4.2.4). */
export interface EstadoGpu {
  cuadro: number;
  cg: number;
  anticipados: number;
  alfa: number;
  quietud: number;
  quietudMaxima: number;
  /** G(x_t + α·Δ) − G(x_t) del paso aceptado, como G1 − G0 en paso.ts */
  dg: number;
  pares: number;
  /** los pares que no cupieron y los triángulos que no buscaron, desde el primer cuadro */
  desbordes: number;
}

export class MotorGpu {
  private constructor(
    private readonly device: GPUDevice,
    readonly s: SistemaTela,
    private readonly p: PaqueteGpu,
    private readonly d: Distribucion,
    private readonly b: Record<Bufer, GPUBuffer>,
    private readonly grupo: GPUBindGroup,
    private readonly k: Record<Entrada, GPUComputePipeline>,
  ) {}

  static async crear(device: GPUDevice, s: SistemaTela, cuadrosDeHistoria = 3600, maxPares?: number): Promise<MotorGpu> {
    const p = empaquetar(s, { maxPares });
    const d = distribuir(p, cuadrosDeHistoria);
    const modulo = device.createShaderModule({ code: wgslDelMotor(s, p, d) });
    const errores = (await modulo.getCompilationInfo()).messages.filter((m) => m.type === 'error');
    if (errores.length > 0) throw new Error(`WGSL del motor: ${errores.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | ')}`);

    const vf = new Float32Array(d.vf.total);
    vf.set(p.f32.x, d.vf.XT);
    vf.set(p.f32.masa, d.vf.MASA);
    vf.set(Float32Array.from(s.v), d.vf.V);
    const tf = new Float32Array(d.tf.total);
    tf.set(p.f32.coef, d.tf.COEF);
    tf.set(p.f32.K, d.tf.KP);
    tf.set(p.f32.pcr, d.tf.PCR);
    tf.set(p.f32.cs, d.tf.CS);
    tf.set(p.f32.cl, d.tf.CL);
    tf.set(p.f32.ckh, d.tf.CKH);
    tf.set(p.f32.cuNodos, d.tf.CUN);
    tf.set(p.f32.cuTri, d.tf.CUT);
    tf.set(p.f32.cuNt, d.tf.CUNT);
    tf.set(p.f32.cuPa, d.tf.CUPA);
    tf.set(p.f32.cuPv, d.tf.CUPV);
    const iu = new Uint32Array(d.iu.total);
    for (const clave of Object.keys(p.u32) as Array<keyof PaqueteGpu['u32']>) iu.set(p.u32[clave], d.iu[clave]);
    const datos: Record<Bufer, Float32Array | Uint32Array> = {
      pos: p.f32.x,
      vf,
      tf,
      iu,
      red: new Float32Array(d.red.total),
      vals: new Float32Array(12 * Math.max(p.nq, 1)),
      pv: new Float32Array(4 * p.n),
      at: new Uint32Array(d.at.total),
    };
    const b = {} as Record<Bufer, GPUBuffer>;
    for (const nombre of BUFERES) {
      b[nombre] = device.createBuffer({
        size: Math.max(16, datos[nombre].byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      device.queue.writeBuffer(b[nombre], 0, datos[nombre]);
    }
    const disposicion = device.createBindGroupLayout({
      entries: BUFERES.map((nombre, binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: (nombre === 'iu' ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
      })),
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [disposicion] });
    const grupo = device.createBindGroup({ layout: disposicion, entries: BUFERES.map((nombre, binding) => ({ binding, resource: { buffer: b[nombre] } })) });
    const tuberias = await Promise.all(ENTRADAS.map((entryPoint) => device.createComputePipelineAsync({ layout, compute: { module: modulo, entryPoint } })));
    const k = Object.fromEntries(ENTRADAS.map((e, i) => [e, tuberias[i]])) as Record<Entrada, GPUComputePipeline>;
    return new MotorGpu(device, s, p, d, b, grupo, k);
  }

  /** Graba un cuadro completo en el pase, en el orden de paso.ts. */
  grabarCuadro(pase: GPUComputePassEncoder): void {
    const { aj } = this.s, { gv, gt, gh, gb, gc, gch, gp, gcel, gpnt } = this.d, propio = this.p.propio;
    const d = (e: Entrada, grupos: number) => {
      if (grupos === 0) return;
      pase.setPipeline(this.k[e]);
      pase.dispatchWorkgroups(grupos);
    };
    const ronda = () => {
      d('residuo', gv);
      d('sumarInicio', 1);
      for (let k = 0; k < aj.maxCG; k++) {
        d('spmv', gv);
        d('sumarAlfa', 1);
        d('actualizar', gv);
        d('sumarBeta', 1);
        d('nuevaP', gv);
      }
    };
    pase.setBindGroup(0, this.grupo);
    d('inicio', gv);
    d('prepTri', gt);
    d('prepHinge', gh);
    d('gradElem', gt);
    d('prepCostura', gc);
    d('ensamblar', gb);
    if (propio) {
      // los pares del contacto propio en x_t (sistema.ts, armarParesPropios) y la lista de entradas de cada vértice
      d('velMax', gv);
      d('armarRadio', 1);
      d('limpiarCeldas', gcel);
      d('hashContar', gpnt);
      d('scanCBloques', gcel);
      d('scanCTotales', 1);
      d('scanCSumar', gcel);
      d('hashLlenar', gpnt);
      d('paresDeTriangulo', gt);
      d('limpiarVertices', gv);
      d('contarEntradas', gp);
      d('scanVBloques', gv);
      d('scanVTotales', 1);
      d('scanVSumar', gv);
      d('llenarEntradas', gp);
    }
    ronda();
    // ponytail: la segunda ronda y los intentos de la búsqueda se despachan siempre y salen enseguida si no
    // hacen falta (cuestan los despachos vacíos); pasar a despacho indirecto cuando se optimice la velocidad
    if (aj.anticipar && (this.s.obstaculos.length > 0 || propio)) {
      d('anticipar', gv);
      if (propio) d('anticiparPares', gp);
      d('armarRonda2', 1);
      ronda();
    }
    if (aj.busqueda) {
      d('prepBusqueda', 1);
      for (let intento = 0; intento < 8; intento++) {
        d('posPrueba', gv);
        d('anguloPrueba', gh);
        d('difTri', gt);
        d('difCostura', gc);
        if (propio) d('difPares', gp);
        d('decidir', 1);
      }
    }
    d('aplicar', gv);
    d('cerrarCuadro', 1);
    if (gc > 0) {
      d('cerrarCosturas', gc);
      d('revisarCosido', 1);
      d('coser', gch);
    }
  }

  /** Avanza `cuadros` cuadros, un envío por cuadro, y espera a la GPU. */
  async avanzar(cuadros: number): Promise<void> {
    for (let c = 0; c < cuadros; c++) {
      const enc = this.device.createCommandEncoder();
      const pase = enc.beginComputePass();
      this.grabarCuadro(pase);
      pase.end();
      this.device.queue.submit([enc.finish()]);
    }
    await this.device.queue.onSubmittedWorkDone();
  }

  private async leer(nombre: Bufer, desde: number, bytes: number): Promise<ArrayBuffer> {
    const lectura = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.b[nombre], desde, lectura, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    await lectura.mapAsync(GPUMapMode.READ);
    const copia = lectura.getMappedRange().slice(0);
    lectura.unmap();
    lectura.destroy();
    return copia;
  }

  async leerPosiciones(): Promise<Float32Array> {
    return new Float32Array(await this.leer('pos', 0, 12 * this.s.n));
  }

  async leerEstado(): Promise<EstadoGpu> {
    const e = new Float32Array(await this.leer('red', 4 * this.d.red.SC, 4 * 16));
    const a = new Uint32Array(await this.leer('at', 4 * this.d.at.NPAR, 8));
    return {
      cuadro: e[ESC.CUADRO], cg: e[ESC.ITER], anticipados: e[ESC.NUEVOS], alfa: e[ESC.ALFA_FINAL], quietud: e[ESC.QUIETUD], quietudMaxima: e[ESC.QMAX],
      dg: e[ESC.DG], pares: Math.min(a[0], this.p.maxPares), desbordes: a[1],
    };
  }

  /** La quietud de los cuadros [desde, desde + cuantos). */
  async leerQuietud(desde: number, cuantos: number): Promise<Float32Array> {
    return new Float32Array(await this.leer('red', 4 * (this.d.red.HISTO + desde), 4 * cuantos));
  }

  destruir(): void {
    for (const nombre of BUFERES) this.b[nombre].destroy();
  }
}
