/** El motor nuevo en la CPU para el banco: corre cada escena hasta que la tela queda quieta (§4.2.4) o 10 s de tela. */
import { SistemaTela, type AjustesImplicito } from '../src/utils/cloth/implicito/sistema';
import { pasoImplicito } from '../src/utils/cloth/implicito/paso';
import { medirQuietud, VigiaDeQuietud } from '../src/utils/cloth/implicito/quietud';
import { toparPlaca } from '../src/utils/cloth/implicito/banco/experimentos';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';
import type { Escena } from '../src/utils/cloth/implicito/banco/escenas';
import type { Corredor } from './_banco';

/** `topePlaca`: el experimento de banco/experimentos.ts; sin él, la placa del motor */
export function correrImplicito(tela: TelaFisica, ajustes: Partial<AjustesImplicito> = {}, topePlaca?: number): Corredor {
  return (e: Escena) => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (topePlaca !== undefined) toparPlaca(s.placa, topePlaca);
    if (e.v) s.v.set(e.v);
    const vigia = new VigiaDeQuietud();
    const t0 = performance.now();
    let cuadros = 0, quieta: number | null = null, cg = 0;
    let primeraCerrada: number | null = null, todasCerradas: number | null = null;
    while (cuadros < 600 && quieta === null) {
      cg += pasoImplicito(s).cg;
      cuadros++;
      if (primeraCerrada === null && s.costuras.L.some((L) => L === 0)) primeraCerrada = cuadros;
      if (todasCerradas === null && s.costuras.n > 0 && s.costuras.cerradas()) todasCerradas = cuadros;
      if (vigia.registrar(medirQuietud(s).total)) quieta = cuadros / 60;
    }
    return { x: s.x, quieta, msPorCuadro: (performance.now() - t0) / cuadros, cgMedio: cg / cuadros, primeraCerrada, todasCerradas };
  };
}
