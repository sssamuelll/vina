/**
 * El BVH del cuerpo preparado en reposo y su worker. Lo que vigila:
 *  - La caché guarda dos BVH, por la huella de la malla horneada; el que se
 *    usa pasa al final y sale el que hace más que no se usa.
 *  - Se entrega el mismo BVH que se guardó, sin copiar: nadie escribe en los
 *    arreglos de un LinearBVH después de armarlo (informe de la tarea 11).
 *  - El worker da el mismo BVH que buildLinearBVH, y la malla viaja sin
 *    transferir: sigue siendo de quien llama.
 *  - Sin workers, o con uno que falla o no contesta, se arma en el hilo
 *    principal, como hoy, y se dice por qué; con `soloFueraDelHilo` (el
 *    preparador, en reposo) se rechaza en vez de bloquear el hilo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

import { buildLinearBVH, type LinearBVH } from '../bvh';
import type { CollisionMeshData } from '../../collisionMesh';
import { huella } from '../../huella';
import { transferibles } from '../../transferibles';

/** Un cuerpo de prueba: una tira de 16 triángulos en z = 0, con sus normales. Arreglos nuevos en cada llamada. */
function unCuerpo(): CollisionMeshData {
  const triCount = 16;
  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const x = t * 0.1;
    vertices.set([x, 0, 0, x + 0.1, 0, 0, x, 0.1, 0], t * 9);
    normals.set([0, 0, 1], t * 3);
  }
  return { vertices, normals, triCount };
}

/** La huella del BVH que da buildLinearBVH directo, en este hilo. */
const directo = (mesh: CollisionMeshData) => huella(buildLinearBVH(mesh));

type Modo = 'contesta' | 'mudo' | 'dispara-error' | 'contesta-error' | 'no-clona';

/**
 * Un worker de mentira con lo que usa `armarBvhFueraDelHilo`: `onmessage`,
 * `onerror`, `postMessage` y `terminate`. Lo que recibe cruza clonado, con la
 * lista de transferencia que le pasen (si se transfiriera la malla, a quien
 * llama le quedaría vacía). Contesta como el de verdad (el BVH de
 * buildLinearBVH, con sus buffers transferidos) o falla como diga `modo`.
 */
class WorkerFalso {
  static todos: WorkerFalso[] = [];
  static modo: Modo = 'contesta';
  onmessage: ((m: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  enviados = 0;
  terminado = false;
  constructor(readonly url: URL, readonly opciones: WorkerOptions) { WorkerFalso.todos.push(this); }
  postMessage(datos: { mesh: CollisionMeshData }, transfer?: Transferable[]) {
    if (WorkerFalso.modo === 'no-clona') throw new DOMException('no se pueden clonar', 'DataCloneError');
    const recibidos = structuredClone(datos, transfer ? { transfer } : undefined);
    this.enviados++;
    setTimeout(() => {
      // Terminado, ni recibe ni contesta.
      if (this.terminado) return;
      if (WorkerFalso.modo === 'dispara-error') this.onerror?.({ message: 'no cargó' });
      if (WorkerFalso.modo === 'contesta-error') this.onmessage?.({ data: { error: 'se rompió' } });
      if (WorkerFalso.modo === 'contesta') {
        const bvh = buildLinearBVH(recibidos.mesh);
        this.onmessage?.({ data: structuredClone({ bvh }, { transfer: transferibles(bvh) }) });
      }
    }, 0);
  }
  terminate() { this.terminado = true; }
}

/**
 * El módulo cargado de nuevo (cada caso empieza con la caché vacía), con un
 * espía en el buildLinearBVH que él ve: `enElHilo` cuenta los armados en el
 * hilo principal. El worker falso usa el de este archivo, que el espía no ve.
 */
async function cargar() {
  const enElHilo = vi.fn();
  vi.doMock('../bvh', async (original) => {
    const real = await original<typeof import('../bvh')>();
    return {
      ...real,
      buildLinearBVH: (mesh: CollisionMeshData) => { enElHilo(); return real.buildLinearBVH(mesh); },
    };
  });
  return { ...(await import('../bvhPreparado')), enElHilo };
}

/** Cada forma en que el worker no arma el BVH: el motivo que se dice y cuánto tarda en saberse (ms). */
const FALLOS: Array<[string, Modo | 'sin-worker', RegExp, number]> = [
  ['sin Worker', 'sin-worker', /: sin worker$/, 0],
  ['un worker que dispara error', 'dispara-error', /: error del worker: no cargó$/, 0],
  ['un worker que contesta con { error }', 'contesta-error', /: error del worker: se rompió$/, 0],
  ['una malla que no se puede clonar', 'no-clona', /: no se pudo clonar$/, 0],
  ['un worker que no contesta en 10 s', 'mudo', /: no contestó en 10 s$/, 10_000],
];

const fallar = (modo: Modo | 'sin-worker') => {
  if (modo === 'sin-worker') vi.stubGlobal('Worker', undefined);
  else WorkerFalso.modo = modo;
};

beforeEach(() => {
  WorkerFalso.todos = [];
  WorkerFalso.modo = 'contesta';
  vi.stubGlobal('Worker', WorkerFalso);
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock('../bvh');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('la caché de BVH', () => {
  const bvh = (n: number) => ({ nodeCount: n }) as LinearBVH;

  it('guarda dos: con tres huellas, la primera ya no está; las otras salen tal cual se guardaron, sin copia', async () => {
    const { guardarBvh, bvhGuardado, BVH_GUARDADOS } = await cargar();
    expect(BVH_GUARDADOS).toBe(2);
    const [a, b, c] = [bvh(1), bvh(2), bvh(3)];
    guardarBvh('h1', a);
    guardarBvh('h2', b);
    guardarBvh('h3', c);
    expect(bvhGuardado('h1')).toBeNull();
    // Sin copiar: nadie escribe en un LinearBVH después de armarlo.
    expect(bvhGuardado('h2')).toBe(b);
    expect(bvhGuardado('h3')).toBe(c);
  });

  it('el que se usa pasa al final: sale el que hace más que no se usa', async () => {
    const { guardarBvh, bvhGuardado } = await cargar();
    const [a, b, c] = [bvh(1), bvh(2), bvh(3)];
    guardarBvh('h1', a);
    guardarBvh('h2', b);
    expect(bvhGuardado('h1')).toBe(a); // pasa a ser el más reciente
    guardarBvh('h3', c); // sale h2
    expect(bvhGuardado('h2')).toBeNull();
    expect(bvhGuardado('h1')).toBe(a);
  });
});

describe('armarBvhFueraDelHilo', () => {
  it('lo arma un worker de módulo: el mismo BVH que buildLinearBVH, nada en el hilo principal, y la malla sigue siendo de quien llama', async () => {
    const { armarBvhFueraDelHilo, enElHilo } = await cargar();
    const mesh = unCuerpo();
    const bvh = await armarBvhFueraDelHilo(mesh);

    expect(huella(bvh)).toBe(directo(unCuerpo()));
    expect(enElHilo, 'en el worker: nada en el hilo principal').not.toHaveBeenCalled();
    expect(huella(mesh), 'la malla viaja sin transferir: no queda vacía').toBe(huella(unCuerpo()));
    // El worker es un archivo que existe, de módulo, y no se queda vivo.
    const [worker] = WorkerFalso.todos;
    expect(worker.enviados).toBe(1);
    expect(worker.opciones).toEqual({ type: 'module' });
    expect(existsSync(fileURLToPath(worker.url))).toBe(true);
    expect(worker.terminado).toBe(true);
  });

  it('el worker que contesta no deja armado el reloj de los 10 s', async () => {
    const { armarBvhFueraDelHilo, enElHilo } = await cargar();
    vi.useFakeTimers();
    const promesa = armarBvhFueraDelHilo(unCuerpo());
    await vi.advanceTimersByTimeAsync(1);
    expect(huella(await promesa)).toBe(directo(unCuerpo()));
    expect(vi.getTimerCount()).toBe(0);
    // Si quedara armado, 10 s después armaría el BVH otra vez en el hilo, en silencio.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enElHilo).not.toHaveBeenCalled();
  });

  it.each(FALLOS)('%s: lo arma en el hilo principal, el mismo que buildLinearBVH, y dice por qué', async (_, modo, motivo, espera) => {
    fallar(modo);
    const { armarBvhFueraDelHilo, enElHilo } = await cargar();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    let listo = false;
    const promesa = armarBvhFueraDelHilo(unCuerpo()).finally(() => { listo = true; });
    if (espera > 0) {
      await vi.advanceTimersByTimeAsync(espera - 1);
      expect(listo, 'hasta los 10 s espera al worker').toBe(false);
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(listo, 'sin esperar de más').toBe(true);
    expect(huella(await promesa)).toBe(directo(unCuerpo()));
    expect(enElHilo).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(motivo));
    expect(vi.getTimerCount()).toBe(0);
    expect(WorkerFalso.todos.every((w) => w.terminado)).toBe(true);
  });

  it.each(FALLOS)('con soloFueraDelHilo, %s: rechaza diciendo por qué, sin armar en el hilo', async (_, modo, motivo, espera) => {
    fallar(modo);
    const { armarBvhFueraDelHilo, enElHilo } = await cargar();
    vi.useFakeTimers();
    const resultado = armarBvhFueraDelHilo(unCuerpo(), { soloFueraDelHilo: true })
      .then(() => 'resolvió', (err: Error) => err.message);
    await vi.advanceTimersByTimeAsync(espera + 1);
    const mensaje = await resultado;
    expect(mensaje).toMatch(/^El BVH del cuerpo no se armó fuera del hilo principal: /);
    expect(mensaje).toMatch(motivo);
    expect(enElHilo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(WorkerFalso.todos.every((w) => w.terminado)).toBe(true);
  });
});

// El worker de verdad, con un `self` de mentira. Este sí carga three y
// three-mesh-bvh: corre en reposo, fuera del hilo, y su arranque no cuenta
// para el clic.
describe('el worker del BVH', () => {
  type Respuesta = { bvh?: LinearBVH; error?: string };
  let ambito: { onmessage?: (m: { data: unknown }) => void; postMessage: (msg: Respuesta, transfer?: Transferable[]) => void };
  let enviada: Respuesta | undefined;
  let recibida: Respuesta | undefined;

  beforeEach(() => {
    enviada = recibida = undefined;
    ambito = {
      postMessage: (msg, transfer) => {
        enviada = msg;
        recibida = structuredClone(msg, { transfer });
      },
    };
    vi.stubGlobal('self', ambito);
  });

  it('contesta con el BVH de buildLinearBVH, con sus buffers transferidos', async () => {
    await import('../bvhWorker');
    ambito.onmessage!({ data: { mesh: unCuerpo() } });
    expect(huella(recibida!.bvh)).toBe(directo(unCuerpo()));
    // Transferidos, no copiados: del lado del worker quedan vacíos.
    const b = enviada!.bvh!;
    for (const arreglo of [b.nodes, b.skip, b.triVerts, b.triNormals, b.edgePseudonormals, b.vertexPseudonormals]) {
      expect(arreglo.byteLength).toBe(0);
    }
  });

  it('si buildLinearBVH lanza, contesta con el error', async () => {
    await import('../bvhWorker');
    ambito.onmessage!({ data: { mesh: { triCount: 1 } } });
    expect(recibida).toEqual({ error: expect.any(String) });
  });
});
