import { useEffect, useRef } from 'react';
import type { BodyMeasurements, PatternPiece, Seam, SeamGroup, ViewMode } from '../../types/types';
import type { SimulationState } from '../../store/simulationSlice';
import type { ArrangementOverride } from '../../utils/cloth/arrangement/arrangementBinding';
import type { ArmAxis } from '../../utils/cloth/arrangement/buildAxisHints';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { reemplazarEventoDeLaFase } from '../../utils/cloth/solverRuntimeTracker';
import { seamInitDataToPairs } from '../../utils/cloth/seamPairs';
import { complianceDeTela } from '../../utils/cloth/complianceDeTela';
import { huella } from '../../utils/cloth/huella';
import { obtenerTela } from '../../utils/cloth/gpu/telasPreparadas';
import { interruptoresDeTela } from '../../utils/cloth/gpu/prepararTela';
import { hayAdaptadorWebGPU } from '../../utils/cloth/gpu/webgpuDetect';
import { mallasDePiezas } from './mallasDePiezas';
import { colocarMallas } from './colocarMallas';
import { seamsToInitData } from './costurasDeLaSimulacion';

export const ESPERA_PARA_PREPARAR_MS = 600;

/**
 * Lo que «Simular» va a leer, con los mismos valores que GarmentSimulation: la
 * tela entra a la caché con la huella de todo esto, y la cascada solo la usa si
 * calcula la misma. Uno que difiera y, al pulsar, la tela se vuelve a armar.
 */
export interface EntradasDeLaTela {
  /** Las que se simulan (`seSimula`): el mismo filtro que GarmentSimulation. */
  piezas: PatternPiece[];
  /** `simulation.pieceParticleDistance`. */
  densidades: Record<string, number>;
  /** `simulation.particleDistance`. */
  densidad: number;
  /** Las del cuerpo, `medidasDelCuerpo(project)`. */
  medidas: BodyMeasurements;
  /** `project.arrangementOverrides`. */
  overrides: Record<string, ArrangementOverride>;
  /** `simulation.armAxis`: la pose de los brazos coloca las mangas. */
  armAxis: ArmAxis;
  /** `project.seams`. */
  seams: Seam[];
  /** `project.seamGroups`. */
  seamGroups: SeamGroup[] | undefined;
  /** `simulation.defaultFabricId`. */
  fabricId: string;
  /**
   * WebGPU existe y no está apagado. Con él y un adaptador (`hayAdaptadorWebGPU`)
   * la cascada irá por WebGPU; si no, solo se malla: WASM y CPU arman su propia tela.
   */
  conGpu: boolean;
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

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Prepara en segundo plano lo que «Simular» va a necesitar, mientras la prenda
 * está a la vista y la simulación parada (spec 2026-10-11 «simular al
 * instante» § 4.1). Malla con la caché de SimulationInitClient y, con WebGPU,
 * arma la tela del solver en un worker (`obtenerTela`): al pulsar, la cascada
 * encuentra las mallas y la tela hechas (o en vuelo) y no las hace otra vez.
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
    // Una corrida soltada no avisa: su cliente resuelve igual, más tarde y casi
    // siempre corto (lo que tenía en vuelo o en cola falla con «Disposed»), y
    // eso no es ni un «listo» ni un «fallo» en la caja negra. Tampoco arma la
    // tela: sería la de otras entradas.
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
      // Uno por kind y fase en el ring: se prepara tras cada pausa de la
      // edición, y una pieza que no malla vuelve a fallar cada vez.
      const avisar = (kind: 'preparar:listo' | 'preparar:fallo', data: Record<string, unknown>) => {
        if (vigente) reemplazarEventoDeLaFase(kind, data);
      };
      const n = entradas.piezas.length;
      cliente.meshAllPieces(entradas.piezas, entradas.densidades, entradas.densidad)
        // Sus workers se sueltan ya: la tela se arma en otro.
        .finally(() => cliente?.dispose())
        .then(
          // Una pieza que no malla no rechaza: `meshAllPieces` la deja fuera.
          async (mallas) => {
            const faltan = n - mallas.length;
            if (faltan > 0) {
              avisar('preparar:fallo', { fase: 'mallas', message: `${faltan} de ${n} piezas sin malla` });
              return;
            }
            avisar('preparar:listo', { fase: 'mallas', ms: Math.round(performance.now() - t0) });
            // Sin WebGPU, o sin adaptador (GPU vetada, o un navegador sin GPU),
            // la cascada cae a WASM y esta tela no se usaría. Mientras se
            // pregunta, la corrida puede soltarse.
            if (!entradas.conGpu || !(await hayAdaptadorWebGPU()) || !vigente) return;
            // La tela con la huella que la cascada calculará al pulsar: las
            // mismas funciones sobre las mismas entradas (useMeshing,
            // GarmentSimulation y la rama WebGPU de useSimulationLifecycle).
            // Solo fuera del hilo: en reposo, armarla aquí congelaría el visor.
            const t1 = performance.now();
            try {
              const colocadas = colocarMallas(
                mallasDePiezas(mallas, entradas.piezas, entradas.densidades, entradas.densidad),
                entradas.piezas, entradas.medidas, entradas.overrides, entradas.armAxis,
              );
              const seamPairs = seamInitDataToPairs(seamsToInitData(entradas.seams, entradas.seamGroups), colocadas);
              const fabric = complianceDeTela(entradas.fabricId);
              const interruptores = interruptoresDeTela();
              await obtenerTela(
                huella(colocadas, seamPairs, fabric, interruptores),
                { pieces: colocadas, seamPairs, fabric, interruptores },
                { soloFueraDelHilo: true },
              );
              avisar('preparar:listo', { fase: 'tela', ms: Math.round(performance.now() - t1) });
            } catch (e) {
              avisar('preparar:fallo', { fase: 'tela', message: mensaje(e) });
            }
          },
          (e: unknown) => avisar('preparar:fallo', { fase: 'mallas', message: mensaje(e) }),
        );
    }, ESPERA_PARA_PREPARAR_MS);
    return () => {
      clearTimeout(temporizador);
      // Pulsar «Simular» (entradas → null) deja terminar la malla y la tela en
      // vuelo: la simulación las espera (en vuelo compartidas). Un cambio de
      // entradas (una edición) o desmontar la suelta: lo suyo ya no sirve.
      if (siguiente.current === null) return;
      vigente = false;
      cliente?.dispose();
    };
  }, [entradas]);
}
