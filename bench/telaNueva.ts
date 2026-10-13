/**
 * El banco de la tela nueva contra la referencia privada (spec 2026-10-13 §4.4.2) y contra el motor de
 * hoy (§4.4.4).
 *
 *   VINA_REFERENCIAS=<carpeta privada> npm run bench:tela -- [--motor=xpbd] [--ensayo=cusick|voladizo|todo] [--mallas=5,10,20]
 *
 * `npm run bench:tela` ya corre con el candado de scripts/pesado.mjs. El informe queda en
 * `$VINA_REFERENCIAS/informes/`.
 */
import {
  correrXpbd,
  criterioCusick,
  ensayoCusick,
  ensayoVoladizo,
  guardarInforme,
  imprimirCusick,
  imprimirVoladizo,
  leerReferencias,
  type Corredor,
  type Referencias,
} from './_banco';

const MOTORES: Record<string, (ref: Referencias, args: Map<string, string>) => Corredor> = {
  xpbd: () => correrXpbd,
};

const args = new Map(
  process.argv.slice(2).map((a): [string, string] => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);
const motor = args.get('motor') ?? 'xpbd';
const ensayo = args.get('ensayo') ?? 'todo';
const mallas = (args.get('mallas') ?? '5,10,20').split(',').map(Number);
const fabrica = MOTORES[motor];
if (!fabrica) throw new Error(`motor desconocido: ${motor} (hay ${Object.keys(MOTORES).join(', ')})`);
const ref = leerReferencias();
const correr = fabrica(ref, args);
const informe: Record<string, unknown> = { motor, mallas, args: Object.fromEntries(args) };
if (ensayo !== 'voladizo') {
  const filas = ensayoCusick(correr, mallas, ref);
  imprimirCusick(filas);
  const criterio = criterioCusick(filas, ref);
  console.log(`§2: nivel con 5 mm ${criterio.nivel ? 'pasa' : 'no pasa'} · rango ${criterio.rangoPropio.toFixed(1)} frente a ${criterio.rangoReferencia.toFixed(1)}: ${criterio.rango ? 'pasa' : 'no pasa'}`);
  informe.cusick = filas;
  informe.criterio = criterio;
}
if (ensayo !== 'cusick') {
  const filas = ensayoVoladizo(correr, mallas, ref);
  imprimirVoladizo(filas);
  informe.voladizo = filas;
}
console.log(`informe: ${guardarInforme(motor, informe)}`);
