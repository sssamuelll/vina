/** El motor nuevo en la CPU para el banco: corre cada escena hasta que la tela queda quieta (§4.2.4) o 10 s de tela. */
import { SistemaTela, type AjustesImplicito } from '../src/utils/cloth/implicito/sistema';
import { pasoImplicito } from '../src/utils/cloth/implicito/paso';
import { medirQuietud, VigiaDeQuietud } from '../src/utils/cloth/implicito/quietud';
import { toparPlaca } from '../src/utils/cloth/implicito/banco/experimentos';
import { aristasQueAtraviesan, LadosDeLosPares } from '../src/utils/cloth/implicito/banco/instrumentos';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';
import type { Escena } from '../src/utils/cloth/implicito/banco/escenas';
import type { Corredor } from './_banco';

/** Los pares del cuadro como los lee el instrumento del lado malo: 14 números por par, los cuatro vértices primero (−1 en una punta del cuerpo). */
function paresComoEnLaGpu(s: SistemaTela): Float64Array {
  const out = new Float64Array(14 * s.paresPropios.length);
  s.paresPropios.forEach((p, k) => {
    for (let j = 0; j < 4; j++) out[14 * k + j] = p.v.length === 4 ? p.v[j] : j < 3 ? p.v[j] : -1;
  });
  return out;
}

/** `topePlaca`: el experimento de banco/experimentos.ts; sin él, la placa del motor */
export function correrImplicito(tela: TelaFisica, ajustes: Partial<AjustesImplicito> = {}, topePlaca?: number): Corredor {
  return (e: Escena) => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (topePlaca !== undefined) toparPlaca(s.placa, topePlaca);
    if (e.v) s.v.set(e.v);
    const vigia = new VigiaDeQuietud(), lados = new LadosDeLosPares();
    const t0 = performance.now();
    let cuadros = 0, quieta: number | null = null, cg = 0, alTope = 0, recortados = 0;
    let primeraCerrada: number | null = null, todasCerradas: number | null = null;
    const tope = Number(process.env.VINA_TELA_CUADROS ?? 600);
    while (cuadros < tope && quieta === null) {
      // el instrumento anota los pares con las posiciones con que se arman, las del cuadro que empieza
      const x = Float64Array.from(s.x);
      const info = pasoImplicito(s);
      lados.anotar(paresComoEnLaGpu(s), s.paresPropios.length, x);
      cg += info.cg;
      if (info.cg >= s.aj.maxCG) alTope++;
      if (info.alfa < 1) recortados++;
      cuadros++;
      if (primeraCerrada === null && s.costuras.L.some((L) => L === 0)) primeraCerrada = cuadros;
      if (todasCerradas === null && s.costuras.n > 0 && s.costuras.cerradas()) todasCerradas = cuadros;
      if (vigia.registrar(medirQuietud(s).total)) quieta = cuadros / 60;
      if (cuadros % 60 === 0) console.error(`  cuadro ${cuadros}: ${((performance.now() - t0) / cuadros).toFixed(0)} ms por cuadro, quietud ${medirQuietud(s).total.toExponential(2)}, lado malo ${lados.revisar(s.x).vertices}, aristas que atraviesan ${aristasQueAtraviesan(s.x, s.tris, s.excluidos).cruces}`);
    }
    return {
      x: s.x, quieta, msPorCuadro: (performance.now() - t0) / cuadros, cgMedio: cg / cuadros, primeraCerrada, todasCerradas,
      instrumentos: {
        cuadros, alTope, recortados, quietudFinal: medirQuietud(s).total, ladoMalo: lados.revisar(s.x), atraviesan: aristasQueAtraviesan(s.x, s.tris, s.excluidos),
        cruces: lados.cruces(s.x, new Set(Array.from({ length: s.costuras.n }, (_, e) => s.costuras.vertices(e)).flat())),
      },
    };
  };
}
