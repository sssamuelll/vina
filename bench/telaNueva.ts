/**
 * El banco de la tela nueva contra la referencia privada (spec 2026-10-13 §4.4.2) y contra el motor de
 * hoy (§4.4.4).
 *
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- [--motor=implicito|xpbd] [--pandeo=<factor>] [--ensayo=cusick|voladizo|todo|camiseta] [--mallas=5,10,20] [--cg=<n>] [--cierre=<mm por cuadro>] [--kCostura=<N/m>] [--flexionDelMargen=<f>]
 *
 * `camiseta` no entra en `todo`: corre la camiseta de María sobre el avatar y desde la colocación de la referencia
 * (camiseta.json en la carpeta privada), solo con el motor implícito.
 *
 * `npm run bench:tela` ya corre con el candado de scripts/pesado.mjs. El informe queda en
 * `$VINA_REFERENCIAS/informes/`.
 */
import {
  correrXpbd,
  criterioCusick,
  ensayoCamiseta,
  ensayoCusick,
  ensayoVoladizo,
  guardarInforme,
  imprimirCamiseta,
  imprimirCusick,
  imprimirVoladizo,
  leerReferencias,
  telaDeLaReferencia,
  type Corredor,
  type Referencias,
} from './_banco';
import { PANDEO_CALIBRADO } from '../src/utils/cloth/implicito/tela';
import { correrImplicito } from './motorImplicito';

const MOTORES: Record<string, (ref: Referencias, args: Map<string, string>) => Corredor> = {
  implicito: (ref, args) => correrImplicito(telaDeLaReferencia(ref, Number(args.get('pandeo') || PANDEO_CALIBRADO))),
  xpbd: () => correrXpbd,
};

const args = new Map(
  process.argv.slice(2).map((a): [string, string] => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);
const motor = args.get('motor') ?? 'implicito';
const ensayo = args.get('ensayo') ?? 'todo';
const mallas = (args.get('mallas') ?? '5,10,20').split(',').map(Number);
const fabrica = MOTORES[motor];
if (!fabrica) throw new Error(`motor desconocido: ${motor} (hay ${Object.keys(MOTORES).join(', ')})`);
const ref = leerReferencias();
const correr = fabrica(ref, args);
const informe: Record<string, unknown> = { motor, mallas, args: Object.fromEntries(args) };
if (ensayo === 'todo' || ensayo === 'cusick') {
  const filas = ensayoCusick(correr, mallas, ref);
  imprimirCusick(filas);
  const criterio = criterioCusick(filas, ref);
  console.log(`§2: nivel con 5 mm ${criterio.nivel ? 'pasa' : 'no pasa'} · rango ${criterio.rangoPropio.toFixed(1)} frente a ${criterio.rangoReferencia.toFixed(1)}: ${criterio.rango ? 'pasa' : 'no pasa'}`);
  informe.cusick = filas;
  informe.criterio = criterio;
}
if (ensayo === 'todo' || ensayo === 'voladizo') {
  const filas = ensayoVoladizo(correr, mallas, ref);
  imprimirVoladizo(filas);
  informe.voladizo = filas;
}
if (ensayo === 'camiseta') {
  if (motor !== 'implicito') throw new Error('la camiseta corre solo con el motor implícito');
  const filas = ensayoCamiseta(telaDeLaReferencia(ref, Number(args.get('pandeo') || PANDEO_CALIBRADO)), mallas, {
    ...(args.has('cg') ? { maxCG: Number(args.get('cg')) } : {}),
    ...(args.has('flexionDelMargen') ? { flexionDelMargen: Number(args.get('flexionDelMargen')) } : {}),
    ...(args.has('cierre') ? { cierreMaximo: Number(args.get('cierre')) / 1000 } : {}),
    ...(args.has('kCostura') ? { kCostura: Number(args.get('kCostura')) } : {}),
  });
  imprimirCamiseta(filas);
  informe.camiseta = filas;
}
console.log(`informe: ${guardarInforme(motor, informe)}`);
