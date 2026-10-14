/** El motor nuevo en la CPU para el banco: corre cada escena hasta que la tela queda quieta (§4.2.4) o 10 s de tela. */
import { SistemaTela, type AjustesImplicito } from '../src/utils/cloth/implicito/sistema';
import { pasoImplicito } from '../src/utils/cloth/implicito/paso';
import { medirQuietud, VigiaDeQuietud } from '../src/utils/cloth/implicito/quietud';
import type { TelaFisica } from '../src/utils/cloth/implicito/tela';
import type { Escena } from '../src/utils/cloth/implicito/banco/escenas';
import type { Corredor } from './_banco';

export function correrImplicito(tela: TelaFisica, ajustes: Partial<AjustesImplicito> = {}): Corredor {
  return (e: Escena) => {
    const s = new SistemaTela(e.malla, tela, { obstaculos: e.obstaculos, hilo: e.hilo, costuras: e.costuras, franja: e.franja, ajustes });
    if (e.v) s.v.set(e.v);
    const vigia = new VigiaDeQuietud();
    const t0 = performance.now();
    let cuadros = 0, quieta: number | null = null;
    while (cuadros < 600 && quieta === null) {
      pasoImplicito(s);
      cuadros++;
      if (vigia.registrar(medirQuietud(s).total)) quieta = cuadros / 60;
    }
    return { x: s.x, quieta, msPorCuadro: (performance.now() - t0) / cuadros };
  };
}
