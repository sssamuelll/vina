/**
 * La flexión de cada tela medida en la referencia, ajustada en su mismo ensayo (spec 2026-10-13 E12). La referencia mide
 * la flexión con un voladizo de Peirce apoyado en la mesa, sin sujetar: en el borde la tira gira y la cola se levanta,
 * mientras la fórmula de Peirce supone la tira empotrada. Para cada corrida (dirección, largo fuera de la mesa y ángulo)
 * se busca el factor de la flexión de la fórmula que da en el motor el mismo ángulo con la misma tira apoyada. El factor
 * de cada dirección es la media geométrica de sus corridas válidas (10-70°, con tres aristas o más fuera de la mesa); el
 * bies se ajusta después, con la urdimbre y la trama ya ajustadas.
 *
 *   VINA_REFERENCIAS=<carpeta privada> npx tsx bench/flexionDeLaReferencia.ts [--malla=5] [--telas=Jersey,Rib]
 *
 * Lee `$VINA_REFERENCIAS/telas/resultados.json` y escribe `telas/flexion-<malla>mm.json`, que lee bench/telas.ts. Corre
 * en la CPU: va con el candado de scripts/pesado.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { carpetaPrivada } from './_banco';
import { correrImplicito } from './motorImplicito';
import { escenaPeirceApoyada } from '../src/utils/cloth/implicito/banco/escenas';
import { peirceApoyado } from '../src/utils/cloth/implicito/banco/medidas';
import { telaMedida, type TelaMedidaEnLaReferencia } from '../src/utils/cloth/implicito/banco/telasMedidas';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';

type Direccion = 'urdimbre' | 'trama' | 'bies';
const CAMPO = { urdimbre: 'bUrdimbre', trama: 'bTrama', bies: 'bBies' } as const;

const args = new Map(
  process.argv.slice(2).map((a): [string, string] => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);
const malla = Number(args.get('malla') ?? 5);
const filtro = args.get('telas')?.split(',');
const datos = JSON.parse(fs.readFileSync(path.join(carpetaPrivada(), 'telas', 'resultados.json'), 'utf8')) as { telas: Record<string, TelaMedidaEnLaReferencia> };

function angulo(tela: TelaFisica, dir: Direccion, L: number, S: number): number {
  const e = escenaPeirceApoyada(L, S, dir, malla);
  return peirceApoyado(correrImplicito(tela)(e).x, e.malla, L / 1000, S / 1000).angulo;
}

// la longitud de flexión de Peirce: c ∝ B^⅓, así que el factor que falta va como (c del objetivo / c propia)³
const cPeirce = (grados: number, L: number) => {
  const t = (grados * Math.PI) / 180;
  return L * Math.cbrt(Math.cos(t / 2) / (8 * Math.tan(t)));
};

const salida: Record<string, unknown> = {};
for (const [nombre, medida] of Object.entries(datos.telas)) {
  if (filtro && !filtro.some((f) => nombre.includes(f))) continue;
  // la mesa de la referencia lleva fricción 0,8: la cola no resbala
  const base = telaMedida(medida, { cuerpo: 0.8, tela: 0.45 });
  if (!base) {
    console.log(`${nombre}: sin tracción o flexión medidas`);
    continue;
  }
  const factor: Record<Direccion, number> = { urdimbre: 1, trama: 1, bies: 1 };
  const filas: Array<Record<string, unknown>> = [];
  for (const dir of ['urdimbre', 'trama', 'bies'] as const) {
    const tela = { ...base, bUrdimbre: factor.urdimbre * base.bUrdimbre, bTrama: factor.trama * base.bTrama };
    const logs: number[] = [];
    for (const c of medida.peirce?.[dir]?.corridas ?? []) {
      if (c.L_nominal_mm < 3 * malla) continue;
      let f = 1, th = angulo(tela, dir, c.L_nominal_mm, c.S_mm);
      const th1 = th;
      for (let it = 0; it < 5 && Math.abs(th - c.theta_deg) > 0.3; it++) {
        f = Math.min(20, Math.max(0.05, f * (cPeirce(c.theta_deg, c.L_nominal_mm) / cPeirce(th, c.L_nominal_mm)) ** 3));
        th = angulo({ ...tela, [CAMPO[dir]]: f * tela[CAMPO[dir]] }, dir, c.L_nominal_mm, c.S_mm);
      }
      const cuenta = c.valida_10_70 && Math.abs(th - c.theta_deg) <= 0.5;
      if (cuenta) logs.push(Math.log(f));
      filas.push({ direccion: dir, L: c.L_nominal_mm, S: c.S_mm, referencia: c.theta_deg, conLaFormula: th1, factor: f, angulo: th, cuenta });
      console.log(`${nombre} ${dir} L ${c.L_nominal_mm} mm: referencia ${c.theta_deg.toFixed(1)}° · con la fórmula ${th1.toFixed(1)}° · factor ${f.toFixed(2)} da ${th.toFixed(1)}°${cuenta ? '' : ' (no cuenta)'}`);
    }
    if (logs.length > 0) factor[dir] = Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
  }
  console.log(`${nombre} malla ${malla} mm: factor urdimbre ${factor.urdimbre.toFixed(2)} · trama ${factor.trama.toFixed(2)} · bies ${factor.bies.toFixed(2)}`);
  salida[nombre] = { factor, corridas: filas };
}
const ruta = path.join(carpetaPrivada(), 'telas', `flexion-${malla}mm.json`);
const previo = fs.existsSync(ruta) ? (JSON.parse(fs.readFileSync(ruta, 'utf8')) as { telas: Record<string, unknown> }).telas : {};
fs.writeFileSync(ruta, JSON.stringify({ malla, generado: new Date().toISOString(), telas: { ...previo, ...salida } }, null, 1));
console.log(`escrito: ${ruta}`);
