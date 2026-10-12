import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { FakeGPUDevice } from './fakeDevice';
import { dosPiezas, makeQuadPiece, makeQuadPieceAt, COSTURAS, TELA } from './dosPiezas';

// Arnés de gpuSolverClient.test.ts: vi.hoisted corre antes que los vi.mock, así
// el MockSBA es visible para las dos fábricas (three/webgpu y three/tsl). El
// MockSBA guarda `array` POR REFERENCIA: la huella lee los mismos bits que
// createTslBuffers le entrega al solver.
const { sharedMock } = vi.hoisted(() => {
  class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    version = 0;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() { return createChainProxy(); },
      apply() { return createChainProxy(); },
    };
    return new Proxy(function () {}, handler);
  };

  const makeUniform = (val: unknown): any => {
    const target = { value: val };
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'value') return t.value;
        return createChainProxy();
      },
      set(t, prop, v) {
        if (prop === 'value') t.value = v;
        return true;
      },
    });
  };

  const sharedMock = () => ({
    StorageBufferAttribute: MockSBA,
    storage: () => createChainProxy(),
    Fn: () => () => createChainProxy(),
    compute: (_fn: unknown, count: number) => ({ __tslCompute: true, dispatchCount: count }),
    uniform: (val: unknown) => makeUniform(val),
    float: (val: unknown) => makeUniform(val),
    int: (val: unknown) => makeUniform(val),
    uint: (val: unknown) => makeUniform(val),
    vec3: () => createChainProxy(),
    instanceIndex: createChainProxy(),
    Loop: () => createChainProxy(),
    Break: () => createChainProxy(),
    If: () => createChainProxy(),
    atomicStore: () => createChainProxy(),
    atomicAdd: () => createChainProxy(),
    atomicLoad: () => createChainProxy(),
    atomicMin: () => createChainProxy(),
    atomicMax: () => createChainProxy(),
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { sharedMock };
});

vi.mock('three/webgpu', () => sharedMock());
vi.mock('three/tsl', () => sharedMock());

import { GpuSolverClient, type PieceMeshData } from '../gpuSolverClient';
import { prepararTela, interruptoresDeTela, type TelaPreparada } from '../prepararTela';
import type { FabricComplianceConfig } from '../tslBuffers';
import type { SeamPair } from '../../seamPairs';
import { importDXFContent } from '../../../dxf';
import { classifyImportedPieces } from '../../../geometricClassifier';
import { meshPiece } from '../../../mesh';
import { colocarMallas } from '../../../../components/Viewport3D/colocarMallas';
import type { MeshedPiece } from '../../../../components/Viewport3D/useMeshing';
import type { BodyMeasurements } from '../../../../types/types';

// ─── La huella ───────────────────────────────────────────────────────────────

type Parte = ArrayBufferView | number | string | null | undefined;

/**
 * FNV-1a de 32 bits sobre los BYTES de cada parte, en el orden dado: lee los
 * bits tal cual, sin redondear. Byte a byte y no palabra a palabra: con el XOR
 * de una palabra de 32 bits, el bit alto (el signo de un float) no se mezcla
 * con los demás y dos cambios en él se cancelan. Cada parte entra con su
 * nombre y su largo: una ausente (null) o vacía cambia la huella, y dos
 * arreglos no se confunden con su concatenación.
 */
function huellaDe(partes: Array<[string, Parte]>): string {
  let h = 0x811c9dc5;
  const texto = new TextEncoder();
  const mezcla = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  };
  for (const [nombre, v] of partes) {
    const bits = v == null ? null
      : typeof v === 'number' ? new Float64Array([v])
        : typeof v === 'string' ? texto.encode(v)
          : v;
    mezcla(texto.encode(bits ? `${nombre}:${bits.byteLength};` : `${nombre}:null;`));
    if (bits) mezcla(new Uint8Array(bits.buffer, bits.byteOffset, bits.byteLength));
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Todo lo que la parte CPU del armado le deja al solver, en este orden:
 *  1. tslBuffers: numParticles, numTriangles, positionSBA, invMassSBA,
 *     triangleIdsSBA (los triángulos fusionados) y tetherMaxDistSBA (los
 *     radios del tirante por región);
 *  2. stretchColors: cuántos grupos y, por grupo, count, idsSBA,
 *     restLengthsSBA y complianceSBA;
 *  3. numBendConstraints y bendColors (flexión intra-pieza, banda F3 y quads
 *     entre piezas): por grupo, count, idsSBA, restAnglesSBA y complianceSBA;
 *  4. numSeamConstraints y seamColors: por grupo, count, idsSBA,
 *     targetDistSBA y complianceSBA;
 *  5. scBuffers: tableSize, adjOffsetsSBA y adjNeighborsSBA (el CSR);
 *  6. weldBuffers: count, vertsSBA, offsetsSBA y partnersSBA;
 *  7. del cliente: originalInvMass, edgeData (ids y lengths),
 *     pieceVertexRanges (id, start y count por pieza), crossQuadPartners
 *     (llave y partners por quad) y pressedBendCompliance.
 * Un grupo que falta (null) entra como etiqueta: aparecer o desaparecer cambia
 * la huella. Lo que createTslBuffers deriva por su cuenta (las copias de las
 * posiciones, los buffers en cero, el CSR de face-poke) no entra: no sale del
 * armado CPU.
 */
function huellaDelArmado(client: GpuSolverClient): string {
  const c = client as any;
  const b = c.tslBuffers;
  const partes: Array<[string, Parte]> = [
    ['numParticles', b.numParticles],
    ['numTriangles', b.numTriangles],
    ['positions', b.positionSBA.array],
    ['invMass', b.invMassSBA.array],
    ['triangles', b.triangleIdsSBA.array],
    ['tetherMaxDist', b.tetherMaxDistSBA.array],
  ];
  const grupos = (tipo: string, gs: any[], campos: string[]) => {
    partes.push([tipo, gs.length]);
    gs.forEach((g, i) => {
      partes.push([`${tipo}[${i}].count`, g.count]);
      for (const k of campos) partes.push([`${tipo}[${i}].${k}`, g[k].array]);
    });
  };
  grupos('stretchColors', b.stretchColors, ['idsSBA', 'restLengthsSBA', 'complianceSBA']);
  partes.push(['numBendConstraints', b.numBendConstraints]);
  grupos('bendColors', b.bendColors, ['idsSBA', 'restAnglesSBA', 'complianceSBA']);
  partes.push(['numSeamConstraints', b.numSeamConstraints]);
  grupos('seamColors', b.seamColors, ['idsSBA', 'targetDistSBA', 'complianceSBA']);
  const sc = b.scBuffers;
  if (sc) partes.push(['sc.tableSize', sc.tableSize], ['sc.offsets', sc.adjOffsetsSBA.array], ['sc.neighbors', sc.adjNeighborsSBA.array]);
  else partes.push(['scBuffers', null]);
  const weld = b.weldBuffers;
  if (weld) partes.push(['weld.count', weld.count], ['weld.verts', weld.vertsSBA.array], ['weld.offsets', weld.offsetsSBA.array], ['weld.partners', weld.partnersSBA.array]);
  else partes.push(['weldBuffers', null]);
  partes.push(['originalInvMass', c.originalInvMass], ['edgeData.ids', c.edgeData?.ids], ['edgeData.lengths', c.edgeData?.lengths]);
  for (const [id, r] of c.pieceVertexRanges as Map<string, { start: number; count: number }>) {
    partes.push(['rango.id', id], ['rango.start', r.start], ['rango.count', r.count]);
  }
  if (c.crossQuadPartners) {
    for (const [llave, [b0, b1]] of c.crossQuadPartners as Map<string, [number, number]>) {
      partes.push(['cruce', llave], ['cruce.b0', b0], ['cruce.b1', b1]);
    }
  } else partes.push(['crossQuadPartners', null]);
  partes.push(['pressedBendCompliance', c.pressedBendCompliance]);
  return huellaDe(partes);
}

const CAMINOS = ['directo', 'preparado'] as const;

/**
 * 'directo': initMultiPieceTsl prepara la tela por su cuenta. 'preparado': lo
 * que llega del worker. Los interruptores se leen en el hilo principal, y
 * prepararTela corre sin window, como en un worker, y la tela cruza por
 * structuredClone. Si prepararTela leyera localStorage por su cuenta, aquí no
 * vería los interruptores apagados y la huella cambiaría.
 */
async function armar(
  camino: (typeof CAMINOS)[number],
  piezas: PieceMeshData[],
  costuras?: SeamPair[],
  tela?: FabricComplianceConfig,
): Promise<GpuSolverClient> {
  const client = new GpuSolverClient(new FakeGPUDevice() as any);
  let preparada: TelaPreparada | undefined;
  if (camino === 'preparado') {
    const interruptores = interruptoresDeTela();
    vi.stubGlobal('window', undefined);
    preparada = structuredClone(prepararTela(piezas, costuras, tela, interruptores));
  }
  await client.initMultiPieceTsl(piezas, costuras, undefined, tela, preparada);
  return client;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Lo que entra al armado: si esto cambia, cambió la malla o la colocación. */
function huellaDeLaEntrada(piezas: PieceMeshData[]): string {
  return huellaDe(piezas.flatMap((p): Array<[string, Parte]> => [
    ['pieceId', p.pieceId],
    ['vertices', p.vertices],
    ['triIds', p.triIds],
    ['uvs', p.uvs],
    ['region', p.region],
  ]));
}

// La prenda 1 (dos piezas con costura y la tela TELA) vive en `dosPiezas.ts`.

// ─── Prenda 2: la camisa de María, sin costuras ──────────────────────────────

const MARIA = resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MEDIDAS: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 };

/** Malladas con las opciones de SimulationInitClient.meshPiece, a 20 mm para que el test sea rápido. */
function camisaDeMaria(): PieceMeshData[] {
  const piezas = importDXFContent(readFileSync(MARIA, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  // La importación da a cada pieza un UUID nuevo, y el id entra a la huella
  // (pieceVertexRanges): ids fijos para que la huella no cambie en cada corrida.
  piezas.forEach((p, i) => { p.id = `maria-${i}`; });
  // Como AppShell al importar: con las piezas clasificadas, cuello, mangas y
  // torso llevan cada uno su radio de tirante (sin clasificar, todo es torso).
  classifyImportedPieces(piezas);
  const mallas: MeshedPiece[] = [];
  for (const pieza of piezas) {
    const malla = meshPiece(pieza, { yHeight: 0, scale: 0.001, maxEdgeLength: 20, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    if (malla.vertices.length > 0 && malla.triIds.length > 0) mallas.push({ ...malla, pieceId: pieza.id, outline: pieza.outline });
  }
  return colocarMallas(mallas, piezas, MEDIDAS, {}, { left: null, right: null, ready: false });
}

// Se malla una vez para los dos caminos: nadie escribe en las piezas de
// entrada, y si alguien lo hiciera, la huella de la entrada lo diría.
let camisa: PieceMeshData[] | undefined;

// ─── Los tests ───────────────────────────────────────────────────────────────

// Las huellas se fijaron con el armado de antes de moverlo (600c8028): los
// dos caminos tienen que dar exactamente esas.
describe.each(CAMINOS)('prepararTela: la huella del armado TSL, camino %s', (camino) => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dos piezas con costura: empaquetado, quads entre piezas, banda F3 y soldadura', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = await armar(camino, dosPiezas(), COSTURAS, TELA);

    // La prenda pasa por lo que dice cubrir; si no, la huella no lo vigila.
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('fantasma'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    expect(c.crossQuadPartners?.size).toBe(1);
    expect(c.tslBuffers.weldBuffers).not.toBeNull();
    expect(huellaDelArmado(client)).toBe('faf078df');
  });

  // Los interruptores de desarrollo cambian el armado: con uno apagado sale
  // otra huella, y cada uno la suya (si se cruzaran, se vería).
  it.each([
    ['vina-crossbend', '5178a24d'],
    ['vina-seamscx', '7844fbc0'],
  ])('con %s apagado en localStorage, su propia huella', async (clave, esperada) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => (k === clave ? 'off' : null) } });
    const client = await armar(camino, dosPiezas(), COSTURAS, TELA);
    expect(huellaDelArmado(client)).toBe(esperada);
  });

  it('la camisa de María, sin costuras: coloreado, radios por región y CSR a tamaño real', async () => {
    const piezas = (camisa ??= camisaDeMaria());
    expect(huellaDeLaEntrada(piezas), 'cambió la malla o la colocación, no el armado').toBe('dbdaaaec');
    const client = await armar(camino, piezas);
    expect(huellaDelArmado(client)).toBe('89f454e2');
  });
});

// Defensa detrás de la huella de obtenerTela: si una tela preparada llegara
// con otras piezas, el cliente la rearma en vez de simular otra tela.
describe('initMultiPieceTsl con una tela preparada que no es de estas piezas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Como la entrega obtenerTela: armada aparte, y una copia. */
  const preparadaPara = (piezas: PieceMeshData[]) =>
    structuredClone(prepararTela(piezas, COSTURAS, TELA, interruptoresDeTela()));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function iniciar(preparada: TelaPreparada): Promise<any> {
    const client = new GpuSolverClient(new FakeGPUDevice() as any);
    await client.initMultiPieceTsl(dosPiezas(), COSTURAS, undefined, TELA, preparada);
    return client;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  it('la de estas piezas se usa tal cual, sin avisar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preparada = preparadaPara(dosPiezas());
    const client = await iniciar(preparada);
    expect(client.originalInvMass, 'se queda con sus arreglos: no la arma otra vez').toBe(preparada.originalInvMass);
    expect(aviso).not.toHaveBeenCalledWith(expect.stringContaining('no es de estas piezas'));
  });

  it.each<[string, () => PieceMeshData[], string]>([
    ['otra pieza', () => [makeQuadPiece('A'), makeQuadPieceAt('C', 0.3)], "pieza 2: 'C' en la tela, 'B' para simular"],
    ['otros vértices', () => {
      const [a, b] = dosPiezas();
      return [a, { ...b, vertices: new Float32Array([...b.vertices, 0.4, 0.5, 0]) }];
    }, "vértices de 'B': 5 en la tela, 4 para simular"],
    ['menos piezas', () => [makeQuadPiece('A')], 'piezas: 1 en la tela, 2 para simular'],
  ])('con %s, avisa qué no coincide y simula la de estas piezas', async (_, ajenas, motivo) => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = await iniciar(preparadaPara(ajenas()));
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining(motivo));
    expect(huellaDelArmado(client), 'la de la prenda 1, armada aquí').toBe('faf078df');
  });
});

describe('prepararTela corre en un worker: sin window y sin three', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sin window prepara la tela, y los avisos vuelven en la tela, no por la consola', () => {
    vi.stubGlobal('window', undefined);
    const consola = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = prepararTela(dosPiezas(), COSTURAS, TELA, { crossBend: true, seamScExcl: true });
    expect(tela.avisos).toEqual([expect.stringContaining('fantasma')]);
    expect(consola).not.toHaveBeenCalled();
  });

  // Un worker que importa three revienta al cargar. De tslBuffers y de
  // gpuSolverClient (los dos cargan three) solo entran tipos, que se borran
  // al compilar.
  it('el texto de prepararTela.ts no importa three, y de tslBuffers y gpuSolverClient solo tipos', () => {
    const fuente = readFileSync(resolve(__dirname, '../prepararTela.ts'), 'utf-8');
    // `from 'three…'`, y también `import 'three…'` e `import('three…')`.
    expect(fuente).not.toMatch(/(?:from|import)\s*\(?\s*['"]three(?:\/|['"])/);
    expect(fuente).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+['"]\.\/(?:tslBuffers|gpuSolverClient)['"]/m);
  });
});
