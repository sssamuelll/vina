import { afterEach, describe, expect, it, vi } from 'vitest';
import { avisarCuandoLaGpuTermine } from '../avisarCuandoLaGpuTermine';

/** Una cola de mentira cuyo trabajo termina, o falla, cuando el test lo dice. */
function colaPendiente() {
  let terminar!: () => void;
  let fallar!: (e: Error) => void;
  const device = {
    queue: {
      onSubmittedWorkDone: () => new Promise<void>((resolve, reject) => { terminar = resolve; fallar = reject; }),
    },
  };
  return { device, terminar: () => terminar(), fallar: (e: Error) => fallar(e) };
}

// Las promesas resuelven en microtareas: una vuelta de macrotarea las deja correr todas.
const vuelta = () => new Promise((r) => { setTimeout(r, 0); });

describe('avisarCuandoLaGpuTermine (el primer cuadro, cuando ya se ve)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('sin device, o sin onSubmittedWorkDone, avisa al momento y sin cifra', () => {
    const avisar = vi.fn();
    avisarCuandoLaGpuTermine(undefined, () => true, avisar);
    avisarCuandoLaGpuTermine({ queue: {} }, () => true, avisar);
    expect(avisar.mock.calls).toEqual([[], []]);
  });

  it('con la corrida viva, avisa cuando la cola termina, con lo que tardó la GPU', async () => {
    const reloj = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { device, terminar } = colaPendiente();
    const avisar = vi.fn();
    avisarCuandoLaGpuTermine(device, () => true, avisar);
    await vuelta();
    expect(avisar, 'no antes de que la GPU termine').not.toHaveBeenCalled();
    reloj.mockReturnValue(1180);
    terminar();
    await vuelta();
    expect(avisar.mock.calls).toEqual([[{ gpuMs: 180 }]]);
  });

  // El device perdido tiene esta misma forma: la espera resuelve igual (spec de
  // WebGPU), y lo que frena el aviso es `sigueViva`, que lo mira.
  it('si la corrida murió mientras la GPU trabajaba (Restablecer, otra cascada, device perdido), no avisa', async () => {
    const { device, terminar } = colaPendiente();
    let viva = true;
    const avisar = vi.fn();
    avisarCuandoLaGpuTermine(device, () => viva, avisar);
    viva = false;
    terminar();
    await vuelta();
    expect(avisar).not.toHaveBeenCalled();
  });

  it('si la espera falla, no avisa ni deja un rechazo suelto', async () => {
    const { device, fallar } = colaPendiente();
    const avisar = vi.fn();
    avisarCuandoLaGpuTermine(device, () => true, avisar);
    fallar(new Error('la cola no respondió'));
    await vuelta();
    expect(avisar).not.toHaveBeenCalled();
  });
});
