/**
 * La caché de telas preparadas y el worker del armado. Lo que vigila:
 *  - Restablecer y volver a simular con la tela guardada: el solver escribe en
 *    los arreglos que recibe, así que cada llamada recibe su copia y la
 *    guardada queda como salió del armado.
 *  - Pulsar «Simular» mientras el preparador arma: se espera la misma tela en
 *    vuelo, no se arma otra; y si esa falla o es de otras piezas, el clic arma
 *    la suya.
 *  - Una guardada que no coincide con las entradas no se usa.
 *  - Sin workers, o con uno que falla o no contesta, se arma en el hilo
 *    principal, como hoy, y se dice por qué; con `soloFueraDelHilo` (el
 *    preparador, en reposo) se rechaza en vez de bloquear el hilo.
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
  onerror: ((ev: { message: string }) => void) | null = null;
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
      if (WorkerFalso.modo === 'dispara-error') this.onerror?.({ message: 'no cargó' });
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

/**
 * El módulo cargado de nuevo (cada caso empieza con la caché vacía), con un
 * espía en el prepararTela que él ve: `enElHilo` cuenta los armados en el hilo
 * principal. El worker falso usa el de este archivo, que el espía no ve.
 */
async function cargar() {
  const enElHilo = vi.fn();
  vi.doMock('../prepararTela', async (original) => {
    const real = await original<typeof import('../prepararTela')>();
    return {
      ...real,
      prepararTela: (...args: Parameters<typeof real.prepararTela>) => { enElHilo(); return real.prepararTela(...args); },
    };
  });
  return { ...(await import('../telasPreparadas')), enElHilo };
}

/** Cada forma en que el worker no arma la tela: el motivo que se dice y cuánto tarda en saberse (ms). */
const FALLOS: Array<[string, Modo | 'sin-worker', RegExp, number]> = [
  ['sin Worker', 'sin-worker', /: sin worker$/, 0],
  ['un worker que dispara error', 'dispara-error', /: error del worker: no cargó$/, 0],
  ['un worker que contesta con { error }', 'contesta-error', /: error del worker: se rompió$/, 0],
  ['unas entradas que no se pueden clonar', 'no-clona', /: no se pudo clonar$/, 0],
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
  vi.doUnmock('../prepararTela');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('obtenerTela', () => {
  it('la primera vez la arma un worker de módulo; la segunda sale de la caché, con el mismo contenido', async () => {
    const { obtenerTela, enElHilo } = await cargar();
    const primera = await obtenerTela('h', entradas());
    const segunda = await obtenerTela('h', entradas());

    expect([primera.origen, segunda.origen]).toEqual(['armada', 'cache']);
    expect(enElHilo, "'armada' es en el worker: nada en el hilo principal").not.toHaveBeenCalled();
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

  it('«Simular» mientras el preparador arma: se arma una sola vez, y cada uno recibe su copia', async () => {
    const { obtenerTela } = await cargar();
    const [preparador, clic] = await Promise.all([
      obtenerTela('h', entradas(), { soloFueraDelHilo: true }),
      obtenerTela('h', entradas()),
    ]);

    expect(enviados()).toBe(1);
    expect([preparador.origen, clic.origen]).toEqual(['armada', 'en-vuelo']);
    const intacta = huella(preparador.tela);
    expect(huella(clic.tela)).toBe(intacta);
    preparador.tela.invMass[0] = 123;
    clic.tela.invMass[1] = 123;
    expect(huella((await obtenerTela('h', entradas())).tela), 'ninguna de las dos es la guardada').toBe(intacta);
  });

  it('la que está en vuelo con otras piezas no se usa: la segunda llamada arma la suya', async () => {
    const { obtenerTela } = await cargar();
    const otras = entradas([makeQuadPiece('A'), makeQuadPieceAt('C', 0.3)]);
    const [a, b] = await Promise.all([obtenerTela('h', entradas()), obtenerTela('h', otras)]);

    expect([a.origen, b.origen]).toEqual(['armada', 'armada']);
    expect(huella(a.tela)).toBe(directa(entradas()));
    expect(huella(b.tela)).toBe(directa(otras));
    expect(enviados()).toBe(2);
  });

  it('si la que está en vuelo falla, quien la esperaba arma la suya, y no queda nada en vuelo', async () => {
    WorkerFalso.modo = 'dispara-error';
    const { obtenerTela } = await cargar();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Con su manejador desde el principio: un rechazo sin manejador rompe la corrida.
    const preparador = obtenerTela('h', entradas(), { soloFueraDelHilo: true })
      .then((r) => `resolvió: ${r.origen}`, (err: Error) => err.message);
    const clic = obtenerTela('h', entradas());

    expect(await preparador).toMatch(/error del worker/);
    const { tela, origen } = await clic;
    expect(origen, 'el clic sí puede armar en el hilo').toBe('armada-en-el-hilo');
    expect(huella(tela)).toBe(directa(entradas()));
    expect(enviados(), 'el clic probó con su propio worker').toBe(2);
    // Sin la guardada (sale con dos huellas más), la huella se vuelve a armar:
    // nada de lo que estuvo en vuelo se quedó en el mapa.
    WorkerFalso.modo = 'contesta';
    for (const otra of ['h2', 'h3']) await obtenerTela(otra, entradas());
    expect((await obtenerTela('h', entradas())).origen).toBe('armada');
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

  it('el worker que contesta no deja armado el reloj de los 10 s', async () => {
    const { obtenerTela, enElHilo } = await cargar();
    vi.useFakeTimers();
    const promesa = obtenerTela('h', entradas());
    await vi.advanceTimersByTimeAsync(1);
    expect((await promesa).origen).toBe('armada');
    expect(vi.getTimerCount()).toBe(0);
    // Si quedara armado, 10 s después armaría la tela otra vez en el hilo, en silencio.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(enElHilo).not.toHaveBeenCalled();
  });

  it.each(FALLOS)('%s: se arma en el hilo principal, se dice por qué y el origen lo marca', async (_, modo, motivo, espera) => {
    fallar(modo);
    const { obtenerTela, enElHilo } = await cargar();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    let lista = false;
    const promesa = obtenerTela('h', entradas()).finally(() => { lista = true; });
    if (espera > 0) {
      await vi.advanceTimersByTimeAsync(espera - 1);
      expect(lista, 'hasta los 10 s espera al worker').toBe(false);
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(lista, 'sin esperar de más').toBe(true);
    const { tela, origen } = await promesa;
    expect(origen).toBe('armada-en-el-hilo');
    expect(enElHilo).toHaveBeenCalledTimes(1);
    expect(huella(tela)).toBe(directa(entradas()));
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(motivo));
    expect(vi.getTimerCount()).toBe(0);
    expect(WorkerFalso.todos.every((w) => w.terminado)).toBe(true);
  });

  it.each(FALLOS)('con soloFueraDelHilo, %s: rechaza diciendo por qué, sin armar en el hilo', async (_, modo, motivo, espera) => {
    fallar(modo);
    const { obtenerTela, enElHilo } = await cargar();
    vi.useFakeTimers();
    const resultado = obtenerTela('h', entradas(), { soloFueraDelHilo: true })
      .then((r) => `resolvió: ${r.origen}`, (err: Error) => err.message);
    await vi.advanceTimersByTimeAsync(espera + 1);
    const mensaje = await resultado;
    expect(mensaje).toMatch(/^La tela no se armó fuera del hilo principal: /);
    expect(mensaje).toMatch(motivo);
    expect(enElHilo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(WorkerFalso.todos.every((w) => w.terminado)).toBe(true);
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
