/**
 * Piezas del banco de la tela nueva (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.2 y
 * §4.4.4): leer la referencia privada, correr los ensayos con cualquier motor, comparar y guardar el
 * informe. La referencia vive en la carpeta `VINA_REFERENCIAS`, fuera del repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCusickPedestal } from '../src/utils/cloth/cusickScene';
import { getPhysicalFabric, toXPBDParams } from '../src/utils/cloth/physicalFabric';
import { XPBDClothSolver } from '../src/utils/cloth/xpbdSolver';
import { escenaCusick, escenaVoladizo, type Escena } from '../src/utils/cloth/implicito/banco/escenas';
import { aplastados, caidaCusick, peirce, puntaDelVoladizo } from '../src/utils/cloth/implicito/banco/medidas';
import { aMarcoDelHilo } from '../src/utils/cloth/implicito/malla';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';
import { camisetaContraLaReferencia, medirCamiseta, type ConfigCamiseta, type MedidasDeCamiseta } from '../src/utils/cloth/implicito/banco/camiseta';
import type { AjustesImplicito } from '../src/utils/cloth/implicito/sistema';
import { correrImplicito } from './motorImplicito';

/** `VINA_REFERENCIAS/referencias.json`. */
export interface Referencias {
  /** coeficiente y ondas del disco por malla (mm), con la separación de contacto más parecida a la del motor */
  cusick: Record<string, { coeficiente: number; ondas: number }>;
  /** una serie del mismo ajuste con mallas de 5, 10 y 20 mm, para el rango de §2 */
  cusickRango: Record<string, { coeficiente: number; ondas: number }>;
  /** ángulo de Peirce en grados por «hilo-volado»: "urdimbre-15", "trama-40"… */
  voladizo: Record<string, { angulo: number }>;
  /** la tela de la referencia; el pandeo lo pone el banco */
  tela: Omit<TelaFisica, 'pandeo' | 'friccionCuerpo' | 'friccionTela'>;
}

export function carpetaPrivada(): string {
  const carpeta = process.env.VINA_REFERENCIAS;
  if (!carpeta) throw new Error('Falta VINA_REFERENCIAS: la carpeta privada con referencias.json (no está en el repo).');
  return carpeta;
}

export function leerReferencias(): Referencias {
  return JSON.parse(fs.readFileSync(path.join(carpetaPrivada(), 'referencias.json'), 'utf8')) as Referencias;
}

/** La tela de la referencia con su pandeo y la fricción del jersey de la biblioteca: la referencia no la publica. */
export function telaDeLaReferencia(ref: Referencias, pandeo: number): TelaFisica {
  const jersey = getPhysicalFabric('cotton-jersey');
  if (!jersey) throw new Error('falta cotton-jersey en la biblioteca');
  return { ...ref.tela, pandeo, friccionCuerpo: jersey.frictionBody, friccionTela: jersey.friction };
}

/** Lo que devuelve un motor después de correr una escena. */
export interface Corrida {
  x: ArrayLike<number>;
  /** segundos de tela hasta quedar quieta (§4.2.4); null si el motor no lo mide o no llegó */
  quieta: number | null;
  msPorCuadro: number;
}

export type Corredor = (e: Escena) => Corrida;

/**
 * El motor de hoy: XPBD de CPU con el jersey de la biblioteca y el mapeo de producción (el mismo de
 * cusickGate.cpu.test.ts), durante 8 s de tela.
 */
export function correrXpbd(e: Escena): Corrida {
  const pf = getPhysicalFabric('cotton-jersey');
  if (!pf) throw new Error('falta cotton-jersey en la biblioteca');
  const xpbd = toXPBDParams(pf);
  const m = e.malla;
  // el motor de hoy no lee la línea de grano: se le da el patrón ya girado al marco del hilo (1 UV = 10 cm)
  const uv = aMarcoDelHilo(m.patron, e.hilo);
  const solver = new XPBDClothSolver(
    { vertices: Float32Array.from(m.x), triIds: Int32Array.from(m.tris), uvs: Float32Array.from(uv, (q) => q * 10) },
    {
      numSubsteps: 15,
      adaptiveSubsteps: false,
      dt: 1 / 60,
      gravity: [0, -9.81, 0],
      stretchComplianceWarp: 0,
      stretchComplianceWeft: 0,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: xpbd.bendComplianceWarp,
      bendComplianceWeft: xpbd.bendComplianceWeft,
      internalDamping: pf.internalDamping,
      fabricDensity: xpbd.density,
      // las escenas del banco no tienen suelo: el de hoy trae uno en y = 0, justo donde está la tira
      groundY: -10,
    },
  );
  for (const o of e.obstaculos) if (o.tipo === 'pedestal') solver.setCollisionMesh(buildCusickPedestal({ topY: o.tapa, radius: o.radio }));
  m.fijos?.forEach((f, i) => {
    if (f) solver.pinParticle(i);
  });
  const cuadros = 480, t0 = performance.now();
  for (let c = 0; c < cuadros; c++) solver.step();
  return { x: solver.getSnapshot().positions, quieta: null, msPorCuadro: (performance.now() - t0) / cuadros };
}

export interface FilaCusick {
  malla: number;
  coeficiente: number;
  ondas: number;
  aplastados: number;
  quieta: number | null;
  msPorCuadro: number;
  referencia: number | null;
}

export function ensayoCusick(correr: Corredor, mallas: number[], ref: Referencias): FilaCusick[] {
  return mallas.map((malla) => {
    const e = escenaCusick(malla);
    const r = correr(e);
    return {
      malla,
      ...caidaCusick(r.x, e.malla),
      aplastados: aplastados(r.x, e.malla),
      quieta: r.quieta,
      msPorCuadro: r.msPorCuadro,
      referencia: ref.cusick[String(malla)]?.coeficiente ?? null,
    };
  });
}

export interface FilaVoladizo {
  hilo: 'urdimbre' | 'trama';
  volado: number;
  malla: number;
  angulo: number;
  longitudDeFlexion: number;
  quieta: number | null;
  referencia: number | null;
}

export function ensayoVoladizo(correr: Corredor, mallas: number[], ref: Referencias): FilaVoladizo[] {
  const filas: FilaVoladizo[] = [];
  for (const hilo of ['urdimbre', 'trama'] as const) {
    for (const volado of [15, 25, 40]) {
      for (const malla of mallas) {
        const e = escenaVoladizo(volado, hilo, malla);
        const r = correr(e);
        const { angulo, longitudDeFlexion } = peirce(puntaDelVoladizo(r.x, e.malla, volado / 1000), volado / 1000);
        filas.push({ hilo, volado, malla, angulo, longitudDeFlexion, quieta: r.quieta, referencia: ref.voladizo[`${hilo}-${volado}`]?.angulo ?? null });
      }
    }
  }
  return filas;
}

/** §2: a 5 puntos o menos de la referencia con malla de 5 mm, y un rango entre 5, 10 y 20 mm no mayor que el de la referencia. */
export function criterioCusick(filas: FilaCusick[], ref: Referencias): { nivel: boolean; rango: boolean; rangoPropio: number; rangoReferencia: number } {
  const propio = (m: number) => filas.find((f) => f.malla === m)?.coeficiente ?? NaN;
  const rango = (v: number[]) => Math.max(...v) - Math.min(...v);
  const rangoPropio = rango([5, 10, 20].map(propio));
  const rangoReferencia = rango(['5', '10', '20'].map((k) => ref.cusickRango[k]?.coeficiente ?? NaN));
  return {
    nivel: Math.abs(propio(5) - (ref.cusick['5']?.coeficiente ?? NaN)) <= 5,
    // la referencia trae un decimal: el rango se compara en décimas
    rango: Math.round(10 * rangoPropio) <= Math.round(10 * rangoReferencia),
    rangoPropio,
    rangoReferencia,
  };
}

const uno = (v: number | null) => (v === null ? '—' : v.toFixed(1));

export function imprimirCusick(filas: FilaCusick[]): void {
  for (const f of filas) {
    console.log(`cusick ${f.malla} mm: coeficiente ${uno(f.coeficiente)} (referencia ${uno(f.referencia)}) · ondas ${f.ondas} · aplastados ${f.aplastados.toFixed(2)} % · quieta ${uno(f.quieta)} s · ${f.msPorCuadro.toFixed(0)} ms por cuadro`);
  }
}

export function imprimirVoladizo(filas: FilaVoladizo[]): void {
  for (const f of filas) {
    console.log(`voladizo ${f.hilo} ${f.volado} mm, malla ${f.malla} mm: ángulo ${uno(f.angulo)}° (referencia ${uno(f.referencia)}°) · longitud de flexión ${(f.longitudDeFlexion * 1000).toFixed(1)} mm · quieta ${uno(f.quieta)} s`);
  }
}

/** Guarda el informe en `$VINA_REFERENCIAS/informes/` y devuelve la ruta. */
export function guardarInforme(nombre: string, datos: unknown): string {
  const dir = path.join(carpetaPrivada(), 'informes');
  fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${nombre}.json`);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 1));
  return ruta;
}

const DXF_DE_MARIA = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

export interface FilaCamiseta extends MedidasDeCamiseta {
  malla: number;
  quieta: number | null;
  msPorCuadro: number;
  errorDeColocacion: number[];
}

/** La camiseta sobre el avatar de la referencia, desde su colocación (E5), en la CPU hasta quieta o 10 s de tela. */
export function ensayoCamiseta(tela: TelaFisica, mallas: number[], ajustes: Partial<AjustesImplicito> = {}): FilaCamiseta[] {
  const dir = carpetaPrivada();
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'camiseta.json'), 'utf8')) as ConfigCamiseta;
  const leer = (r: string) => fs.readFileSync(path.join(dir, r), 'utf8');
  const base = { dxf: fs.readFileSync(DXF_DE_MARIA, 'utf8'), config, colocacion: leer(config.colocacion), cuerpo: leer(config.cuerpo) };
  return mallas.map((malla) => {
    const asentada = config.asentada[String(malla)];
    const c = camisetaContraLaReferencia({ ...base, asentada: asentada ? leer(asentada) : undefined }, malla, tela);
    const r = correrImplicito(tela, ajustes)(c.escena);
    return { malla, quieta: r.quieta, msPorCuadro: r.msPorCuadro, errorDeColocacion: c.errorDeColocacion, ...medirCamiseta(r.x, c) };
  });
}

const mm = (v: number) => (1000 * v).toFixed(1);
const pct = (e: { p05: number; p50: number; p95: number }) => [e.p05, e.p50, e.p95].map((q) => (100 * q).toFixed(1)).join('/');

export function imprimirCamiseta(filas: FilaCamiseta[]): void {
  for (const f of filas) {
    const ref = f.referencia;
    console.log(`camiseta ${f.malla} mm (${f.vertices} vértices; colocación a ${Math.max(...f.errorDeColocacion).toFixed(2)} mm): quieta ${uno(f.quieta)} s · ${f.msPorCuadro.toFixed(0)} ms por cuadro`);
    console.log(`  aplastados ${f.aplastados.toFixed(2)} %${ref ? ` (referencia ${ref.aplastados.toFixed(2)} %)` : ''} · costuras mediana ${mm(f.costuras.mediana)} mm, máxima ${mm(f.costuras.maxima)} mm`);
    console.log(`  estiramiento p05/p50/p95 ${pct(f.estiramiento)} %${ref ? ` (referencia ${pct(ref.estiramiento)})` : ''} · encogidas >10 % ${f.estiramiento.encogidas.toFixed(2)} %`);
    console.log(`  pliegues p50/p95 ${f.pliegues.p50.toFixed(1)}°/${f.pliegues.p95.toFixed(1)}°, >90° ${f.pliegues.sobre90}, >150° ${f.pliegues.sobre150}${ref ? ` (referencia ${ref.pliegues.p50.toFixed(1)}°/${ref.pliegues.p95.toFixed(1)}°, ${ref.pliegues.sobre90}, ${ref.pliegues.sobre150})` : ''}`);
    console.log(`  al cuerpo p05/p50/p95 ${mm(f.alCuerpo.p05)}/${mm(f.alCuerpo.p50)}/${mm(f.alCuerpo.p95)} mm${ref ? ` (referencia ${mm(ref.alCuerpo.p05)}/${mm(ref.alCuerpo.p50)}/${mm(ref.alCuerpo.p95)})` : ''}`);
    if (f.contraLaReferencia) console.log(`  contra la asentada de la referencia: p50 ${mm(f.contraLaReferencia.p50)} · p90 ${mm(f.contraLaReferencia.p90)} · p99 ${mm(f.contraLaReferencia.p99)} · máx ${mm(f.contraLaReferencia.maxima)} mm`);
    // la mediana «0 mm» de §2 se cuenta como menos de 0,05 mm: la referencia trae un decimal
    const pasa = f.aplastados < 0.1 && f.costuras.mediana < 5e-5 && f.costuras.maxima <= 1e-3 && f.quieta !== null && f.quieta <= 10;
    console.log(`  §2 de la camiseta (sin la velocidad, que es de la GPU): ${pasa ? 'pasa' : 'no pasa'}`);
  }
}
