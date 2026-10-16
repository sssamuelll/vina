/**
 * Varias telas de la referencia en el disco Cusick (spec 2026-10-13 §4.4.2 y E12): cada tela medida en la carpeta
 * privada (tracción por dirección, flexión del voladizo, gramaje y grosor) se lleva al modelo del motor y se compara su
 * coeficiente de caída con el de la referencia.
 *
 *   VINA_REFERENCIAS=<carpeta privada> npx tsx bench/telas.ts [--mallas=5] [--telas=Jersey,Rib] [--cg=<n>]
 *
 * Lee `$VINA_REFERENCIAS/telas/resultados.json`. Corre en la CPU; con muchas telas tarda: va con el candado de
 * scripts/pesado.mjs. El informe queda en `$VINA_REFERENCIAS/informes/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { carpetaPrivada, guardarInforme } from './_banco';
import { correrImplicito } from './motorImplicito';
import { escenaCusick } from '../src/utils/cloth/implicito/banco/escenas';
import { caidaCusick } from '../src/utils/cloth/implicito/banco/medidas';
import { cusickDeLaReferencia, telaMedida, type TelaMedidaEnLaReferencia } from '../src/utils/cloth/implicito/banco/telasMedidas';
import { getPhysicalFabric } from '../src/utils/cloth/physicalFabric';

const args = new Map(
  process.argv.slice(2).map((a): [string, string] => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);
const mallas = (args.get('mallas') ?? '5').split(',').map(Number);
const filtro = args.get('telas')?.split(',');
const datos = JSON.parse(fs.readFileSync(path.join(carpetaPrivada(), 'telas', 'resultados.json'), 'utf8')) as { telas: Record<string, TelaMedidaEnLaReferencia> };
// la referencia no publica la fricción: la del jersey de la biblioteca, como en el banco (_banco.ts, telaDeLaReferencia)
const jersey = getPhysicalFabric('cotton-jersey');
if (!jersey) throw new Error('falta cotton-jersey en la biblioteca');
const friccion = { cuerpo: jersey.frictionBody, tela: jersey.friction };
const filas: Array<Record<string, unknown>> = [];
for (const [nombre, medida] of Object.entries(datos.telas)) {
  if (filtro && !filtro.some((f) => nombre.includes(f))) continue;
  const tela = telaMedida(medida, friccion);
  if (!tela) {
    console.log(`${nombre}: sin tracción o flexión medidas`);
    continue;
  }
  for (const malla of mallas) {
    const e = escenaCusick(malla);
    const r = correrImplicito(tela, args.has('cg') ? { maxCG: Number(args.get('cg')) } : {})(e);
    const c = caidaCusick(r.x, e.malla);
    const ref = cusickDeLaReferencia(medida);
    filas.push({ tela: nombre, malla, coeficiente: c.coeficiente, ondas: c.ondas, referencia: ref?.coeficiente ?? null, ondasReferencia: ref?.ondas ?? null, quieta: r.quieta, modelo: tela });
    console.log(`${nombre} ${malla} mm: ${c.coeficiente.toFixed(1)} (referencia ${ref?.coeficiente.toFixed(1) ?? '—'}) · ondas ${c.ondas} (${ref?.ondas ?? '—'}) · quieta ${r.quieta?.toFixed(2) ?? '—'} s`);
  }
}
console.log(`informe: ${guardarInforme('telas', { mallas, filas })}`);
