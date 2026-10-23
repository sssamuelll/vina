/**
 * La tela nueva en la GPU (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.3): paridad
 * con la CPU, velocidad y segundos hasta quedar quieta.
 *
 * DEV-only: App.tsx la monta con `?testScene=tela-implicita` y reemplaza la app entera. La consume
 * tests/e2e/tela-implicita.spec.ts (@gpu-local). Parámetros: `modo` = paridad | velocidad | perfil | quietud | camiseta;
 * `escena` = una de ESCENAS (chica: disco Cusick de 10 mm; grande: disco de 48 cm con malla de 5 mm, del tamaño de
 * la camiseta; las escenas de paridad del banco; y camiseta, con `malla` en mm, armada con los archivos de la
 * referencia privada que sirve la prueba); `cg` = iteraciones del gradiente conjugado; `cuadros`; `busqueda=0` y
 * `propio=0` apagan esos pasos para aislar una diferencia; `anillo=0` deja la tira del cuello donde la pone la
 * referencia (E11); `kc` cambia la rigidez de las puntas del cuerpo; `kp`, la de los pares entre capas de tela;
 * `maxPares`, la capacidad de pares. El modo camiseta la corre hasta quieta o 10 s de tela y la mide; con `instr=1`, cuadro
 * a cuadro y con los instrumentos de banco/instrumentos.ts, sin medir el tiempo. Publica el
 * resultado en `window.__TELA_IMPLICITA__`.
 */
import { useEffect, useState } from 'react';
import {
  escenaAplastada, escenaApoyada, escenaCapas, escenaCostura, escenaCusick, escenaEsfera, escenaHundida, escenaInclinada, escenaPunta, TELA_DE_LABORATORIO, type Escena,
} from '../../utils/cloth/implicito/banco/escenas';
import {
  camisetaContraLaReferencia, medirCamiseta, type CamisetaContraLaReferencia, type ConfigCamiseta, type MedidasDeCamiseta,
} from '../../utils/cloth/implicito/banco/camiseta';
import { toparPlaca } from '../../utils/cloth/implicito/banco/experimentos';
import { aristasQueAtraviesan, costurasPorClase, LadosDeLosPares } from '../../utils/cloth/implicito/banco/instrumentos';
import { percentil } from '../../utils/cloth/implicito/banco/medidas';
import { paresEnCosturas, peoresPuntos, type ParesEnCostura, type PeorPunto } from '../../utils/cloth/implicito/banco/paresEnCosturas';
import { SistemaTela } from '../../utils/cloth/implicito/sistema';
import type { TelaFisica } from '../../utils/cloth/implicito/tela';
import { pasoImplicito } from '../../utils/cloth/implicito/paso';
import { VigiaDeQuietud } from '../../utils/cloth/implicito/quietud';
import { MotorGpu, type EstadoGpu } from '../../utils/cloth/implicito/gpu/motorGpu';

interface Resultado {
  modo: string;
  escena: string;
  vertices: number;
  gpu: string;
  dif?: { maxima: number; media: number };
  /** G1 − G0 del último cuadro de la CPU (paso.ts) */
  dgCpu?: number;
  msPorCuadro?: number;
  segundosHastaQuieta?: number | null;
  medidas?: MedidasDeCamiseta;
  /** con diag=1: los pares del contacto propio junto a las costuras abiertas (banco/paresEnCosturas.ts) */
  diagnostico?: ParesEnCostura[];
  peores?: PeorPunto[];
  estado?: EstadoGpu;
  /** modo perfil: ms de GPU por cuadro y despachos por cuadro de cada entrada, de la más cara a la más barata */
  perfil?: Array<{ entrada: string; veces: number; ms: number }>;
  /** modo camiseta con instr=1: cada cuadro y su resumen (banco/instrumentos.ts); esa corrida no mide el tiempo */
  instrumentos?: Instrumentos;
  error?: string;
}

const SERIES = ['alfa', 'quietud', 'aceptado', 'cg', 'residuo', 'pares', 'desbordesLista', 'desbordesCeldas', 'ladoMaloPares', 'ladoMaloVertices'] as const;

interface Instrumentos {
  /** por cuadro: el α aceptado, la quietud del paso pedido y la del aceptado (α·quietud), las iteraciones, el residuo, los pares, los desbordes del cuadro por causa y los pares (y sus vértices) del lado malo */
  serie: Record<(typeof SERIES)[number], number[]>;
  resumen: {
    cuadros: number;
    desbordesLista: number;
    desbordesCeldas: number;
    cuadrosConDesborde: number;
    alfaMenorQueUno: number;
    alfaCero: number;
    cgAlTope: number;
    residuoMediano: number;
    residuoMaximo: number;
    ladoMaloMaximo: number;
    ladoMaloAlFinal: number;
    paresAnotados: number;
    cruces: ReturnType<LadosDeLosPares['cruces']>;
    /** las aristas que atraviesan un triángulo de tela al final, y sus vértices: el cruce que no depende de los pares */
    atraviesan: ReturnType<typeof aristasQueAtraviesan>;
    costuras: ReturnType<typeof costurasPorClase>;
  };
}

/**
 * La camiseta cuadro a cuadro, leyendo después de cada uno el estado, los pares y las posiciones: los desbordes del
 * cuadro por causa, la historia de α, el residuo y los pares que cruzaron su cara. Al final, la costura por clase de punto.
 */
async function instrumentar(motor: MotorGpu, nuevo: () => SistemaTela): Promise<{ quieta: number | null; x: Float32Array; instrumentos: Instrumentos }> {
  const vigia = new VigiaDeQuietud(), lados = new LadosDeLosPares();
  const serie = Object.fromEntries(SERIES.map((k) => [k, [] as number[]])) as Instrumentos['serie'];
  let x = await motor.leerPosiciones(), quieta: number | null = null, lista = 0, celdas = 0;
  for (let c = 0; c < 600 && quieta === null; c++) {
    await motor.avanzar(1);
    const e = await motor.leerEstado();
    // los pares se armaron con las posiciones de antes del cuadro
    lados.anotar(await motor.leerPares(e.pares), e.pares, x);
    x = await motor.leerPosiciones();
    const malo = lados.revisar(x);
    const fila = { alfa: e.alfa, quietud: e.quietud, aceptado: e.alfa * e.quietud, cg: e.cg, residuo: e.residuo, pares: e.pares, desbordesLista: e.desbordesLista - lista, desbordesCeldas: e.desbordesCeldas - celdas, ladoMaloPares: malo.pares, ladoMaloVertices: malo.vertices };
    for (const k of SERIES) serie[k].push(fila[k]);
    lista = e.desbordesLista;
    celdas = e.desbordesCeldas;
    if (vigia.registrar(e.quietud)) quieta = (c + 1) / 60;
  }
  const cpu = nuevo();
  cpu.x.set(x);
  const { n, a, b0, b1 } = cpu.costuras;
  const costura = new Set([...a.subarray(0, n), ...b0.subarray(0, n), ...b1.subarray(0, n)]);
  const cuenta =(v: number[], si: (q: number, k: number) => boolean) => v.filter(si).length;
  const instrumentos: Instrumentos = {
    serie,
    resumen: {
      cuadros: serie.alfa.length,
      desbordesLista: lista,
      desbordesCeldas: celdas,
      cuadrosConDesborde: cuenta(serie.desbordesLista, (q, k) => q + serie.desbordesCeldas[k] > 0),
      alfaMenorQueUno: cuenta(serie.alfa, (q) => q < 1),
      alfaCero: cuenta(serie.alfa, (q) => q === 0),
      cgAlTope: cuenta(serie.cg, (q) => q >= motor.s.aj.maxCG),
      residuoMediano: percentil(serie.residuo, 0.5),
      residuoMaximo: Math.max(...serie.residuo),
      ladoMaloMaximo: Math.max(...serie.ladoMaloVertices),
      ladoMaloAlFinal: serie.ladoMaloVertices.at(-1) ?? 0,
      paresAnotados: lados.anotados,
      cruces: lados.cruces(x, costura),
      atraviesan: aristasQueAtraviesan(x, cpu.tris, cpu.excluidos),
      costuras: costurasPorClase(x, cpu.costuras, await motor.leerCosidos(), (e, d) => cpu.cruzaUnObstaculo(cpu.costuras.a[e], d)),
    },
  };
  return { quieta, x, instrumentos };
}

/** Lo que sirve tela-implicita.spec.ts desde la carpeta privada; sin ella, la escena no se arma. */
async function delBanco(nombre: string, opcional = false): Promise<string | undefined> {
  const r = await fetch(`/__banco__/${nombre}`);
  if (r.ok) return r.text();
  if (opcional) return undefined;
  throw new Error(`falta ${nombre}: lo sirve tela-implicita.spec.ts desde VINA_REFERENCIAS`);
}

/** La camiseta de la última escena `camiseta`, para medirla al terminar. */
let camisetaEnCurso: CamisetaContraLaReferencia | null = null;
/** La tela de la referencia, si la escena es la camiseta; si no, la de laboratorio. */
let telaEnCurso: TelaFisica = TELA_DE_LABORATORIO;

async function escenaCamiseta(malla: number): Promise<Escena> {
  const [config, tela, dxf, colocacion, cuerpo, asentada] = await Promise.all([
    delBanco('camiseta.json'), delBanco('tela.json'), delBanco('maria.dxf'), delBanco('colocacion.obj'), delBanco('cuerpo.obj'), delBanco(`asentada-${malla}.obj`, true),
  ]);
  telaEnCurso = JSON.parse(tela!) as TelaFisica;
  camisetaEnCurso = camisetaContraLaReferencia(
    { dxf: dxf!, config: JSON.parse(config!) as ConfigCamiseta, colocacion: colocacion!, cuerpo: cuerpo!, asentada },
    malla,
    telaEnCurso,
    // E11: la tira del cuello en anillo, salvo anillo=0
    { anillo: new URLSearchParams(window.location.search).get('anillo') !== '0' },
  );
  return camisetaEnCurso.escena;
}

/** Las escenas del harness; cada tarea del plan de la parte 2 suma la suya. */
const ESCENAS: Record<string, () => Escena | Promise<Escena>> = {
  chica: () => escenaCusick(10),
  grande: () => escenaCusick(5, 480),
  apoyada: () => escenaApoyada(),
  costura: () => escenaCostura(30),
  'costura-cerrada': () => escenaCostura(0, 30),
  esfera: () => escenaEsfera(),
  inclinada: () => escenaInclinada(),
  capas: () => escenaCapas(),
  punta: () => escenaPunta(),
  hundida: () => escenaHundida(),
  aplastada: () => escenaAplastada(),
  camiseta: () => escenaCamiseta(Number(new URLSearchParams(window.location.search).get('malla') ?? 5)),
};

async function correr(q: URLSearchParams): Promise<Resultado> {
  const modo = q.get('modo') ?? 'paridad';
  const escena = q.get('escena') ?? 'chica';
  const armar = ESCENAS[escena];
  if (!armar) throw new Error(`escena desconocida: ${escena} (hay ${Object.keys(ESCENAS).join(', ')})`);
  const e = await armar();
  const ajustes = {
    maxCG: Number(q.get('cg') ?? 50),
    // en la paridad, todas las iteraciones en las dos: la tolerancia no decide nada
    tolCG: modo === 'paridad' ? 0 : 1e-4,
    busqueda: q.get('busqueda') !== '0',
    // la tela contra sí misma, salvo que se pida apagarla
    contactoPropio: q.get('propio') !== '0',
    // la rigidez de contacto, si se pide otra
    ...(q.get('kc') ? { kContacto: Number(q.get('kc')) } : {}),
    // la de los pares del contacto propio, si se pide otra que la del cuerpo
    ...(q.get('kp') ? { kPropio: Number(q.get('kp')) } : {}),
    // el tope del cierre de las costuras (mm por cuadro), si se pide otro
    ...(q.get('cierre') ? { cierreMaximo: Number(q.get('cierre')) / 1000 } : {}),
    // la rigidez de los puntos de costura (N/m), si se pide otra
    ...(q.get('kcost') ? { kCosturaPorLargo: Number(q.get('kcost')) } : {}),
  };
  // la tela, con el gramaje, el pandeo, su tope y las rigideces de tracción y de flexión que pida el banco (p. ej. topePandeo=0.2&bUrdimbre=7.6)
  const tela: TelaFisica = { ...telaEnCurso };
  for (const k of ['gramaje', 'pandeo', 'topePandeo', 'kTrama', 'kUrdimbre', 'kCizalla', 'bTrama', 'bUrdimbre', 'bBies', 'friccionCuerpo', 'friccionTela'] as const) if (q.get(k)) tela[k] = Number(q.get(k));
  const nuevo = () => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    // el experimento de banco/experimentos.ts, solo si se pide
    if (q.get('topePlaca')) toparPlaca(s.placa, Number(q.get('topePlaca')));
    if (e.v) s.v.set(e.v);
    return s;
  };
  const s = nuevo();
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adaptador) throw new Error('este navegador no tiene WebGPU');
  // las marcas de tiempo, para el modo perfil, si el adaptador las tiene
  const device = await adaptador.requestDevice({ requiredFeatures: adaptador.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  const { vendor, architecture, description } = adaptador.info;
  const base = { modo, escena, vertices: s.n, gpu: `${vendor} ${architecture} ${description}`.trim() };
  const motor = await MotorGpu.crear(device, s, 3600, Number(q.get('maxPares')) || undefined);
  try {
    if (modo === 'paridad') {
      const cuadros = Number(q.get('cuadros') ?? 3);
      const cpu = nuevo();
      await motor.avanzar(cuadros);
      let info = pasoImplicito(cpu);
      for (let c = 1; c < cuadros; c++) info = pasoImplicito(cpu);
      const xg = await motor.leerPosiciones();
      let maxima = 0, suma = 0;
      for (let i = 0; i < cpu.n; i++) {
        const dist = Math.hypot(xg[3 * i] - cpu.x[3 * i], xg[3 * i + 1] - cpu.x[3 * i + 1], xg[3 * i + 2] - cpu.x[3 * i + 2]);
        maxima = Math.max(maxima, dist);
        suma += dist;
      }
      return { ...base, dif: { maxima, media: suma / cpu.n }, dgCpu: info.G1 - info.G0, estado: await motor.leerEstado() };
    }
    if (modo === 'velocidad') {
      await motor.avanzar(2); // calentamiento: el primer envío compila las tuberías
      const cuadros = Number(q.get('cuadros') ?? 60);
      const t0 = performance.now();
      await motor.avanzar(cuadros);
      return { ...base, msPorCuadro: (performance.now() - t0) / cuadros, estado: await motor.leerEstado() };
    }
    if (modo === 'perfil') {
      // desde la colocación, como la velocidad: `desde` cuadros sin medir y luego `cuadros` repartidos por entrada
      await motor.avanzar(Number(q.get('desde') ?? 2));
      return { ...base, perfil: await motor.perfilar(Number(q.get('cuadros') ?? 10)), estado: await motor.leerEstado() };
    }
    if (modo === 'camiseta') {
      if (!camisetaEnCurso) throw new Error('el modo camiseta va con escena=camiseta');
      if (q.get('instr')) {
        const { quieta, x, instrumentos } = await instrumentar(motor, nuevo);
        return { ...base, segundosHastaQuieta: quieta, medidas: medirCamiseta(x, camisetaEnCurso), instrumentos, estado: await motor.leerEstado() };
      }
      // hasta quieta o 10 s de tela, de a un segundo; el primer cuadro cuenta para la quietud y no para el tiempo,
      // porque su envío espera a que se compilen las tuberías
      const vigia = new VigiaDeQuietud();
      let quieta: number | null = null, ms = 0, hechos = 1;
      await motor.avanzar(1);
      if (vigia.registrar((await motor.leerQuietud(0, 1))[0])) quieta = 1 / 60;
      while (hechos < 600 && quieta === null) {
        const t0 = performance.now();
        await motor.avanzar(60);
        ms += performance.now() - t0;
        const historia = await motor.leerQuietud(hechos, 60);
        for (let c = 0; c < 60 && quieta === null; c++) if (vigia.registrar(historia[c])) quieta = (hechos + c + 1) / 60;
        hechos += 60;
      }
      const cuadros = hechos - 1;
      const x = await motor.leerPosiciones();
      let diagnostico: ParesEnCostura[] | undefined, peores: PeorPunto[] | undefined;
      if (q.get('diag')) {
        // los pares que arma la CPU sobre las posiciones de la GPU
        const cpu = nuevo();
        cpu.x.set(x);
        cpu.v.fill(0);
        cpu.costuras.cosido.set(await motor.leerCosidos());
        cpu.armarParesPropios();
        const { piezas, prenda } = camisetaEnCurso.camiseta;
        const piezaDe = (v: number) => {
          const k = prenda.piezas.findIndex((p) => v >= p.v0 && v < p.v0 + p.nv);
          return `${piezas[k].name} (${piezas[k].category ?? 'sin clase'})`;
        };
        diagnostico = paresEnCosturas(cpu, piezaDe);
        peores = peoresPuntos(cpu, piezaDe);
      }
      return { ...base, segundosHastaQuieta: quieta, msPorCuadro: ms / cuadros, medidas: medirCamiseta(x, camisetaEnCurso), diagnostico, peores, estado: await motor.leerEstado() };
    }
    // quietud: hasta 10 s de tela, leyendo la historia de a un segundo
    const vigia = new VigiaDeQuietud();
    for (let segundo = 0; segundo < 10; segundo++) {
      await motor.avanzar(60);
      const historia = await motor.leerQuietud(60 * segundo, 60);
      for (let c = 0; c < 60; c++) {
        if (vigia.registrar(historia[c])) return { ...base, segundosHastaQuieta: (60 * segundo + c + 1) / 60, estado: await motor.leerEstado() };
      }
    }
    return { ...base, segundosHastaQuieta: null, estado: await motor.leerEstado() };
  } finally {
    motor.destruir();
    device.destroy();
  }
}

function publicar(r: Resultado): void {
  (window as unknown as { __TELA_IMPLICITA__?: Resultado }).__TELA_IMPLICITA__ = r;
  console.log(`[tela-implicita] ${JSON.stringify(r)}`);
}

export default function TelaImplicitaHarness() {
  const [texto, setTexto] = useState('preparando la escena…');
  useEffect(() => {
    correr(new URLSearchParams(window.location.search))
      .catch((e: unknown): Resultado => ({ modo: '', escena: '', vertices: 0, gpu: '', error: e instanceof Error ? (e.stack ?? e.message) : String(e) }))
      .then((r) => {
        publicar(r);
        setTexto(JSON.stringify(r, null, 1));
      });
  }, []);
  return <pre>{texto}</pre>;
}
