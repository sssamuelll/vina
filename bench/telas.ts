/**
 * Varias telas de la referencia en el disco Cusick (spec 2026-10-13 §4.4.2 y E12): cada tela medida en la carpeta
 * privada (tracción por dirección, flexión del voladizo, gramaje y grosor) se lleva al modelo del motor y se compara su
 * coeficiente de caída con el de la referencia.
 *
 *   VINA_REFERENCIAS=<carpeta privada> npx tsx bench/telas.ts [--mallas=5] [--telas=Jersey,Rib] [--cg=<n>] [--ajusteDe=<malla>] [--flexion=<factor>]
 *
 * La flexión de cada tela es la ajustada en el voladizo apoyado de la referencia para cada malla
 * (`telas/flexion-<malla>mm.json`, de bench/flexionDeLaReferencia.ts); sin ese archivo, la de la fórmula de Peirce.
 * `--ajusteDe=<malla>` usa en todas las mallas el ajuste de esa (en una malla gruesa no caben las tiras cortas), y
 * `--flexion` multiplica además la flexión por un factor (para medir cuánto mueve la caída).
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
// la flexión ajustada de cada malla (bench/flexionDeLaReferencia.ts), si existe
const ajustesPorMalla = new Map<number, Record<string, { factor: { urdimbre: number; trama: number; bies: number } }>>();
function ajustes(malla: number) {
  if (!ajustesPorMalla.has(malla)) {
    const ruta = path.join(carpetaPrivada(), 'telas', `flexion-${malla}mm.json`);
    ajustesPorMalla.set(malla, fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, 'utf8')).telas : {});
    console.log(fs.existsSync(ruta) ? `flexión ajustada de ${malla} mm` : `sin flexión ajustada de ${malla} mm: la de la fórmula de Peirce`);
  }
  return ajustesPorMalla.get(malla)!;
}
const filas: Array<Record<string, unknown>> = [];
for (const [nombre, medida] of Object.entries(datos.telas)) {
  if (filtro && !filtro.some((f) => nombre.includes(f))) continue;
  const medidaComoTela = telaMedida(medida, friccion);
  if (!medidaComoTela) {
    console.log(`${nombre}: sin tracción o flexión medidas`);
    continue;
  }
  const f = Number(args.get('flexion') ?? 1);
  for (const malla of mallas) {
    const ajuste = ajustes(args.has('ajusteDe') ? Number(args.get('ajusteDe')) : malla)[nombre]?.factor ?? { urdimbre: 1, trama: 1, bies: 1 };
    const tela = {
      ...medidaComoTela,
      bUrdimbre: f * ajuste.urdimbre * medidaComoTela.bUrdimbre,
      bTrama: f * ajuste.trama * medidaComoTela.bTrama,
      bBies: f * ajuste.bies * medidaComoTela.bBies,
    };
    const e = escenaCusick(malla);
    const r = correrImplicito(tela, args.has('cg') ? { maxCG: Number(args.get('cg')) } : {})(e);
    const c = caidaCusick(r.x, e.malla);
    const ref = cusickDeLaReferencia(medida);
    filas.push({ tela: nombre, malla, flexion: f, ajuste, coeficiente: c.coeficiente, ondas: c.ondas, referencia: ref?.coeficiente ?? null, ondasReferencia: ref?.ondas ?? null, quieta: r.quieta, modelo: tela });
    console.log(`${nombre} ${malla} mm: ${c.coeficiente.toFixed(1)} (referencia ${ref?.coeficiente.toFixed(1) ?? '—'}) · ondas ${c.ondas} (${ref?.ondas ?? '—'}) · quieta ${r.quieta?.toFixed(2) ?? '—'} s`);
  }
}
console.log(`informe: ${guardarInforme('telas', { mallas, filas })}`);
