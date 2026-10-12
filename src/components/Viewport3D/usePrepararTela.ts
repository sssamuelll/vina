import { useEffect, useRef } from 'react';
import type { BodyMeasurements, PatternPiece, Seam, SeamGroup, ViewMode } from '../../types/types';
import type { SimulationState } from '../../store/simulationSlice';
import type { PoseState } from '../../store/avatarSlice';
import type { ArrangementOverride } from '../../utils/cloth/arrangement/arrangementBinding';
import type { ArmAxis } from '../../utils/cloth/arrangement/buildAxisHints';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { reemplazarEventoDeLaFase } from '../../utils/cloth/solverRuntimeTracker';
import { seamInitDataToPairs } from '../../utils/cloth/seamPairs';
import { complianceDeTela } from '../../utils/cloth/complianceDeTela';
import { huella } from '../../utils/cloth/huella';
import { bakeCollisionFromRender } from '../../utils/cloth/renderCollisionBake';
import { obtenerTela } from '../../utils/cloth/gpu/telasPreparadas';
import { interruptoresDeTela } from '../../utils/cloth/gpu/prepararTela';
import { armarBvhFueraDelHilo, bvhGuardado, guardarBvh } from '../../utils/cloth/gpu/bvhPreparado';
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
  /**
   * `avatar.pose` entera (las articulaciones y el IK: `ikEnabled`, `ikTargets`,
   * `ikChains`) y `avatar.morphTargets`, lo que lee AvatarModel. No entran a
   * ninguna huella (la del BVH es la de la malla horneada): están para que un
   * cambio del cuerpo vuelva a preparar y se hornee el cuerpo nuevo.
   */
  pose: PoseState;
  morphs: Record<string, number>;
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
 * arma en workers la tela del solver (`obtenerTela`) y el BVH del cuerpo
 * (`armarBvhFueraDelHilo`): al pulsar, la cascada encuentra las mallas, la tela
 * (hechas o en vuelo) y el BVH hechos, y no los hace otra vez.
 * Un cambio de entradas suelta lo que esté en vuelo. Pasar a null porque la
 * simulación arranca (pulsar «Simular») deja terminar la malla y la tela,
 * porque la simulación las está esperando, pero no sigue con el cuerpo. Pasar
 * a null por otra razón (la vista 2D, la prenda oculta, sin piezas) la suelta
 * como una edición: nadie espera lo suyo (spec § 6: en 2D no se prepara nada).
 *
 * `entradas` null = no preparar (ver `debePrepararLaTela`). `simulando`: la
 * simulación no está en reposo (`simulationState !== 'idle'`).
 */
export function usePrepararTela(entradas: EntradasDeLaTela | null, simulando: boolean): void {
  const siguiente = useRef<EntradasDeLaTela | null>(entradas);
  siguiente.current = entradas;
  const enMarcha = useRef(simulando);
  enMarcha.current = simulando;

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
      // Una pieza que no malla falla otra vez en cada preparación: lo dice el
      // `preparar:fallo` de las mallas, no un aviso por pieza e intento.
      cliente = new SimulationInitClient({ silenciarFallos: true });
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
            // El BVH del cuerpo, con la huella de la malla horneada: la que
            // busca setTslCollisionBody al pulsar. No depende de la tela, así
            // que va aunque ella haya fallado. Hornear son ~54 ms en el hilo
            // principal, en trozos; el BVH, solo en un worker.
            // Tras «Simular» (entradas en null, la corrida sigue viva) no se
            // sigue: setTslCollisionBody es síncrono y no puede esperar un BVH
            // en vuelo, y hornear aquí solo alargaría el clic→primer cuadro.
            const sigueElCuerpo = () => vigente && siguiente.current !== null;
            if (!sigueElCuerpo()) return;
            const t2 = performance.now();
            try {
              const mesh = await bakeCollisionFromRender();
              // Sin cuerpo a la vista no hay nada que preparar: al pulsar se hace como hoy.
              if (!mesh || !sigueElCuerpo()) return;
              const h = huella(mesh);
              // Lo que termina se guarda aunque la corrida se haya soltado: es
              // el BVH de ese cuerpo, y una edición de una pieza no lo cambia.
              if (!bvhGuardado(h)) guardarBvh(h, await armarBvhFueraDelHilo(mesh, { soloFueraDelHilo: true }));
              avisar('preparar:listo', { fase: 'bvh', ms: Math.round(performance.now() - t2) });
            } catch (e) {
              avisar('preparar:fallo', { fase: 'bvh', message: mensaje(e) });
            }
          },
          (e: unknown) => avisar('preparar:fallo', { fase: 'mallas', message: mensaje(e) }),
        );
    }, ESPERA_PARA_PREPARAR_MS);
    return () => {
      clearTimeout(temporizador);
      // Pulsar «Simular» (entradas → null con la simulación en marcha) deja
      // terminar la malla y la tela en vuelo: la simulación las espera (en
      // vuelo compartidas). Una edición, pasar a 2D, ocultar la prenda,
      // quedarse sin piezas o desmontar la suelta: lo suyo ya no sirve.
      if (siguiente.current === null && enMarcha.current) return;
      vigente = false;
      cliente?.dispose();
    };
  }, [entradas]);
}
