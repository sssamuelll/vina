/**
 * La caché de telas preparadas y el worker del armado. Lo que vigila:
 *  - Restablecer y volver a simular con la tela guardada: el solver escribe en
 *    los arreglos que recibe, así que cada llamada recibe su copia y la
 *    guardada queda como salió del armado.
 *  - Pulsar «Simular» mientras el preparador arma: se espera la misma tela en
 *    vuelo, no se arma otra.
 *  - Una guardada que no coincide con las entradas no se usa.
 *  - Sin workers, o con uno que falla o no contesta, se arma en el hilo
 *    principal, como hoy.
 *  - El worker no carga three.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

import { prepararTela, type Interruptores, type TelaPreparada } from '../prepararTela';
import type { EntradasDelArmado } from '../telasPreparadas';
import type { PieceMeshData } from '../gpuSolverClient';
import { huella } from '../../huella';
import { transferibles } from '../../transferibles';
import { dosPiezas, makeQuadPiece, makeQuadPieceAt, COSTURAS, TELA } from './dosPiezas';

const INTERRUPTORES: Interruptores = { crossBend: true, seamScExcl: true };

/** Las entradas del armado de la prenda 1, con arreglos nuevos en cada llamada. */
const entradas = (pieces: PieceMeshData[] = dosPiezas()): EntradasDelArmado => ({
  pieces, seamPairs: COSTURAS, fabric: TELA, interruptores: INTERRUPTORES,
});

/** La huella de lo que da prepararTela directo, en este hilo. */
const directa = (e: EntradasDelArmado) => huella(prepararTela(e.pieces, e.seamPairs, e.fabric, e.interruptores));

type Modo = 'contesta' | 'mudo' | 'dispara-error' | 'contesta-error' | 'no-clona';

/**
 * Un worker de mentira con lo que usa `armarFueraDelHilo`: `onmessage`,
 * `onerror`, `postMessage` y `terminate`. Contesta como el de verdad (la tela
 * de prepararTela, con sus buffers transferidos) o falla como diga `modo`.
 */
class WorkerFalso {
  static todos: WorkerFalso[] = [];
  static modo: Modo = 'contesta';
  onmessage: ((m: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  enviados = 0;
  terminado = false;
  constructor(readonly url: URL, readonly opciones: WorkerOptions) { WorkerFalso.todos.push(this); }
  postMessage(e: EntradasDelArmado) {
    // Las entradas cruzan clonadas, o el envío lanza (DataCloneError).
    if (WorkerFalso.modo === 'no-clona') throw new DOMException('no se pueden clonar', 'DataCloneError');
    const recibidas = structuredClone(e);
    this.enviados++;
    setTimeout(() => {
      // Terminado, ni recibe ni contesta.
      if (this.terminado) return;
      if (WorkerFalso.modo === 'dispara-error') this.onerror?.();
      if (WorkerFalso.modo === 'contesta-error') this.onmessage?.({ data: { error: 'se rompió' } });
      if (WorkerFalso.modo === 'contesta') {
        const tela = prepararTela(recibidas.pieces, recibidas.seamPairs, recibidas.fabric, recibidas.interruptores);
        this.onmessage?.({ data: structuredClone({ tela }, { transfer: transferibles(tela) }) });
      }
    }, 0);
  }
  terminate() { this.terminado = true; }
}

const enviados = () => WorkerFalso.todos.reduce((n, w) => n + w.enviados, 0);

/** El módulo cargado de nuevo: cada caso empieza con la caché vacía. */
const cargar = () => import('../telasPreparadas');

beforeEach(() => {
  WorkerFalso.todos = [];
  WorkerFalso.modo = 'contesta';
  vi.stubGlobal('Worker', WorkerFalso);
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('obtenerTela', () => {
  it('la primera vez la arma un worker de módulo; la segunda sale de la caché, con el mismo contenido', async () => {
    const { obtenerTela } = await cargar();
    const primera = await obtenerTela('h', entradas());
    const segunda = await obtenerTela('h', entradas());

    expect([primera.origen, segunda.origen]).toEqual(['armada', 'cache']);
    expect(huella(primera.tela)).toBe(directa(entradas()));
    expect(huella(segunda.tela)).toBe(huella(primera.tela));
    expect(enviados(), 'la caché no la vuelve a pedir').toBe(1);
    // El worker es un archivo que existe, de módulo, y no se queda vivo.
    const [worker] = WorkerFalso.todos;
    expect(worker.opciones).toEqual({ type: 'module' });
    expect(existsSync(fileURLToPath(worker.url))).toBe(true);
    expect(worker.terminado).toBe(true);
  });

  it('cada llamada recibe su copia: lo que el solver escribe en la suya no llega a la guardada', async () => {
    const { obtenerTela } = await cargar();
    const armada = await obtenerTela('h', entradas());
    const intacta = huella(armada.tela);
    // Lo que hace el solver con la que recibe: congelar piezas reescribe
    // invMass, el planchado reescribe la flexión, y originalInvMass, edgeData,
    // triangles y la soldadura se los queda por referencia.
    const usar = (t: TelaPreparada) => {
      t.invMass[0] = 123;
      t.bendAll.restAngles[0] = 1.5;
      t.bendAll.compliance![0] = 7;
      t.originalInvMass[0] = 0.25;
      t.edgeData.lengths[0] = 9;
      t.triangles[0] = 3;
      t.weld!.partners[0] = 5;
    };
    usar(armada.tela);
    const deLaCache = await obtenerTela('h', entradas());
    expect(deLaCache.origen).toBe('cache');
    expect(huella(deLaCache.tela), 'la armada que se entregó no es la guardada').toBe(intacta);
    usar(deLaCache.tela);
    expect(huella((await obtenerTela('h', entradas())).tela), 'la de la caché tampoco').toBe(intacta);
  });

  it('dos llamadas a la vez con la misma huella arman una sola vez, y cada una recibe su copia', async () => {
    const { obtenerTela } = await cargar();
    const [a, b] = await Promise.all([obtenerTela('h', entradas()), obtenerTela('h', entradas())]);

    expect(enviados()).toBe(1);
    expect([a.origen, b.origen]).toEqual(['armada', 'en-vuelo']);
    const intacta = huella(a.tela);
    expect(huella(b.tela)).toBe(intacta);
    a.tela.invMass[0] = 123;
    b.tela.invMass[1] = 123;
    expect(huella((await obtenerTela('h', entradas())).tela), 'ninguna de las dos es la guardada').toBe(intacta);
  });

  it('guarda dos telas: con tres huellas, la primera ya no está', async () => {
    const { obtenerTela, TELAS_GUARDADAS } = await cargar();
    expect(TELAS_GUARDADAS).toBe(2);
    for (const h of ['h1', 'h2', 'h3']) await obtenerTela(h, entradas());
    expect((await obtenerTela('h2', entradas())).origen).toBe('cache');
    expect((await obtenerTela('h3', entradas())).origen).toBe('cache');
    expect((await obtenerTela('h1', entradas())).origen).toBe('armada');
  });

  it('la que sale es la que hace más que no se usa', async () => {
    const { obtenerTela } = await cargar();
    await obtenerTela('h1', entradas());
    await obtenerTela('h2', entradas());
    await obtenerTela('h1', entradas()); // de la caché: pasa a ser la más reciente
    await obtenerTela('h3', entradas()); // sale h2
    expect((await obtenerTela('h1', entradas())).origen).toBe('cache');
    expect((await obtenerTela('h2', entradas())).origen).toBe('armada');
  });

  it('sin Worker se arma en el hilo principal, igual que prepararTela', async () => {
    vi.stubGlobal('Worker', undefined);
    const { obtenerTela } = await cargar();
    const { tela, origen } = await obtenerTela('h', entradas());
    expect(origen).toBe('armada');
    expect(huella(tela)).toBe(directa(entradas()));
  });

  it.each<[string, Modo]>([
    ['dispara error', 'dispara-error'],
    ['contesta con { error }', 'contesta-error'],
    ['no puede recibir las entradas', 'no-clona'],
  ])('un worker que %s: se arma en el hilo principal en el acto, igual que prepararTela', async (_, modo) => {
    WorkerFalso.modo = modo;
    const { obtenerTela } = await cargar();
    vi.useFakeTimers();
    let lista = false;
    const promesa = obtenerTela('h', entradas()).finally(() => { lista = true; });
    // Lo que tarda el falso en fallar, no los 10 s del reloj.
    await vi.advanceTimersByTimeAsync(1);
    expect(lista).toBe(true);
    const { tela, origen } = await promesa;
    expect(origen).toBe('armada');
    expect(huella(tela)).toBe(directa(entradas()));
    expect(WorkerFalso.todos.every((w) => w.terminado)).toBe(true);
  });

  it('un worker que no contesta en 10 s: se arma en el hilo principal', async () => {
    WorkerFalso.modo = 'mudo';
    const { obtenerTela } = await cargar();
    vi.useFakeTimers();
    let lista = false;
    const promesa = obtenerTela('h', entradas()).finally(() => { lista = true; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(lista).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const { tela, origen } = await promesa;
    expect(origen).toBe('armada');
    expect(huella(tela)).toBe(directa(entradas()));
    expect(WorkerFalso.todos[0].terminado).toBe(true);
  });

  it.each<[string, () => PieceMeshData[]]>([
    ['otro pieceId', () => [makeQuadPiece('A'), makeQuadPieceAt('C', 0.3)]],
    ['otros vértices', () => {
      const [a, b] = dosPiezas();
      return [a, { ...b, vertices: new Float32Array([...b.vertices, 0.4, 0.5, 0]) }];
    }],
  ])('una guardada con %s que las entradas no se usa: se arma la de las entradas', async (_, piezas) => {
    const { obtenerTela } = await cargar();
    await obtenerTela('h', entradas());
    const otras = entradas(piezas());
    const { tela, origen } = await obtenerTela('h', otras);
    expect(origen).toBe('armada');
    expect(huella(tela)).toBe(directa(otras));
    expect((await obtenerTela('h', otras)).origen, 'y reemplaza a la vieja').toBe('cache');
  });
});

// El worker de verdad, con un `self` de mentira. Cada módulo que carga three
// lanza al importarse: si el worker lo cargara, también por el import de otro
// módulo, el import fallaría aquí.
describe('el worker del armado', () => {
  const MODULOS_DE_THREE = ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh', '@react-three/fiber', '@react-three/drei'];
  type Respuesta = { tela?: TelaPreparada; error?: string };
  let ambito: { onmessage?: (m: { data: unknown }) => void; postMessage: (msg: Respuesta, transfer?: Transferable[]) => void };
  let enviada: Respuesta | undefined;
  let recibida: Respuesta | undefined;

  beforeEach(() => {
    for (const m of MODULOS_DE_THREE) vi.doMock(m, () => { throw new Error(`${m} no se carga en el worker`); });
    enviada = recibida = undefined;
    ambito = {
      postMessage: (msg, transfer) => {
        enviada = msg;
        recibida = structuredClone(msg, { transfer });
      },
    };
    vi.stubGlobal('self', ambito);
  });
  afterEach(() => { for (const m of MODULOS_DE_THREE) vi.doUnmock(m); });

  it('el worker, prepararTela, telasPreparadas y transferibles se cargan sin three', async () => {
    await import('../prepararTelaWorker');
    await import('../prepararTela');
    await import('../telasPreparadas');
    await import('../../transferibles');
    expect(ambito.onmessage).toBeTypeOf('function');
  });

  it('contesta con la tela de prepararTela, con sus buffers transferidos', async () => {
    await import('../prepararTelaWorker');
    ambito.onmessage!({ data: entradas() });
    expect(huella(recibida!.tela)).toBe(directa(entradas()));
    // Transferidos, no copiados: del lado del worker quedan vacíos.
    const t = enviada!.tela!;
    for (const arreglo of [t.positions, t.invMass, t.bendAll.ids, t.edgeData.ids, t.weld!.partners, t.csr.neighbors, t.tetherRadii]) {
      expect(arreglo.byteLength).toBe(0);
    }
  });

  it('si prepararTela lanza, contesta con el error', async () => {
    await import('../prepararTelaWorker');
    ambito.onmessage!({ data: entradas([{ pieceId: 'rota' } as PieceMeshData]) });
    expect(recibida).toEqual({ error: expect.any(String) });
  });
});

describe('transferibles', () => {
  it('los buffers de los arreglos tipados de un valor, en profundidad y sin repetir', () => {
    const x = new Float32Array(4);
    const y = new Uint8Array(2);
    const buffers = transferibles({ a: x, b: [x.subarray(1), { c: y }], d: null, e: 'texto', f: 3 });
    expect(buffers).toHaveLength(2);
    expect(buffers[0]).toBe(x.buffer);
    expect(buffers[1]).toBe(y.buffer);
  });
});
