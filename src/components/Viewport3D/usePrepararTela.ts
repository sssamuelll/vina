import { useEffect, useRef } from 'react';
import type { PatternPiece, ViewMode } from '../../types/types';
import type { SimulationState } from '../../store/simulationSlice';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { pushSolverEvent, reemplazarEventoDeLaFase } from '../../utils/cloth/solverRuntimeTracker';

export const ESPERA_PARA_PREPARAR_MS = 600;

export interface EntradasDeLaTela {
  /** Las que se simulan (`seSimula`): el mismo filtro que GarmentSimulation. */
  piezas: PatternPiece[];
  /** `simulation.pieceParticleDistance`. */
  densidades: Record<string, number>;
  /** `simulation.particleDistance`. */
  densidad: number;
}

/**
 * Las cuatro condiciones del preparador (spec 2026-10-11 § 4.1): la simulación
 * en reposo, la vista en 3D o Split, la prenda visible y al menos una pieza que
 * se simula. En 2D no se prepara: el visor no dibuja ahí.
 */
export function debePrepararLaTela(estado: {
  simulationState: SimulationState;
  viewMode: ViewMode;
  showGarment: boolean;
  piezas: readonly PatternPiece[];
}): boolean {
  return estado.simulationState === 'idle' && estado.viewMode !== '2d' && estado.showGarment && estado.piezas.length > 0;
}

/**
 * Prepara en segundo plano lo que «Simular» va a necesitar, mientras la prenda
 * está a la vista y la simulación parada (spec 2026-10-11 «simular al
 * instante» § 4.1). Malla con la caché de SimulationInitClient: al pulsar,
 * useMeshing encuentra las mallas hechas (o en vuelo) y no malla otra vez.
 * Un cambio de entradas suelta lo que esté en vuelo; pasar a null (pulsar
 * «Simular») lo deja terminar, porque la simulación lo está esperando.
 *
 * `entradas` null = no preparar (ver `debePrepararLaTela`).
 */
export function usePrepararTela(entradas: EntradasDeLaTela | null): void {
  const siguiente = useRef<EntradasDeLaTela | null>(entradas);
  siguiente.current = entradas;

  useEffect(() => {
    if (!entradas) return;
    let cliente: SimulationInitClient | null = null;
    // Una corrida soltada no avisa: su cliente resuelve igual, más tarde, con lo
    // que alcanzó a mallar, y eso no es un «listo» en la caja negra.
    let vigente = true;
    const temporizador = setTimeout(() => {
      const t0 = performance.now();
      cliente = new SimulationInitClient();
      // Sin worker, el cliente malla en el hilo principal: en reposo eso
      // congelaría el visor tras cada edición. No se prepara nada y «Simular»
      // malla al pulsar, como antes del preparador.
      if (!cliente.fueraDelHilo) {
        cliente.dispose();
        return;
      }
      cliente.meshAllPieces(entradas.piezas, entradas.densidades, entradas.densidad)
        .then(
          // Uno por fase en el ring: se prepara tras cada pausa de la edición.
          () => { if (vigente) reemplazarEventoDeLaFase('preparar:listo', { fase: 'mallas', ms: Math.round(performance.now() - t0) }); },
          (e: unknown) => { if (vigente) pushSolverEvent('preparar:fallo', { fase: 'mallas', message: e instanceof Error ? e.message : String(e) }); },
        )
        .finally(() => cliente?.dispose());
    }, ESPERA_PARA_PREPARAR_MS);
    return () => {
      clearTimeout(temporizador);
      // Pulsar «Simular» (entradas → null) deja terminar la malla en vuelo: la
      // simulación la espera (mallas en vuelo compartidas). Un cambio de
      // entradas (una edición) o desmontar la suelta: su malla ya no sirve.
      if (siguiente.current === null) return;
      vigente = false;
      cliente?.dispose();
    };
  }, [entradas]);
}
