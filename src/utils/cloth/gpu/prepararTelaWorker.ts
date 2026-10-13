/**
 * Worker del armado de la tela: corre `prepararTela` fuera del hilo principal
 * y devuelve la tela con sus buffers transferidos. No carga three: de
 * `telasPreparadas` solo entra el tipo de las entradas.
 */
import { prepararTela } from './prepararTela';
import { transferibles } from '../transferibles';
import type { EntradasDelArmado } from './telasPreparadas';

self.onmessage = (m: MessageEvent<EntradasDelArmado>) => {
  try {
    const { pieces, seamPairs, fabric, interruptores } = m.data;
    const tela = prepararTela(pieces, seamPairs, fabric, interruptores);
    (self as unknown as Worker).postMessage({ tela }, transferibles(tela));
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
