/**
 * El primer cuadro de una corrida en WebGPU no se ve al enviarlo: el primer
 * subpaso compila sus pipelines en el proceso de la GPU, y hasta que la cola lo
 * termina nada se mueve en pantalla (la sonda del drape midió 883 ms sin
 * cuadros bajo «Simulando»). Esto espera a la cola del device y avisa con
 * `gpuMs`, lo que tardó: ahí dentro va la primera compilación de los kernels
 * (spec 2026-10-11 «simular al instante» § 4.6).
 *
 * Sin device, o sin `onSubmittedWorkDone`, avisa al momento y sin cifra, como
 * antes. Si la corrida murió mientras la GPU trabajaba (`sigueViva` lo dice:
 * Restablecer, una cascada nueva) o la espera falla (device perdido, que ya
 * cuenta `device:lost`), no avisa nada: esa corrida no tuvo primer cuadro.
 */
export function avisarCuandoLaGpuTermine(
  device: { queue?: { onSubmittedWorkDone?: () => Promise<unknown> } } | undefined,
  sigueViva: () => boolean,
  avisar: (datos?: { gpuMs: number }) => void,
): void {
  const cola = device?.queue;
  if (!cola?.onSubmittedWorkDone) {
    avisar();
    return;
  }
  const t0 = performance.now();
  cola.onSubmittedWorkDone().then(
    () => {
      if (sigueViva()) avisar({ gpuMs: Math.round(performance.now() - t0) });
    },
    () => { /* device perdido: lo cuenta `device:lost`, y la cascada vuelve a empezar */ },
  );
}
