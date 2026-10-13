/**
 * El primer cuadro de una corrida en WebGPU no se ve al enviarlo: sus kernels
 * compilan sus pipelines en el proceso de la GPU la primera vez, y hasta que la
 * cola los termina nada se mueve en pantalla (la sonda del drape midió 883 ms
 * sin cuadros bajo «Simulando»). Esto espera a que la cola del device termine
 * lo enviado hasta ahora y avisa con `gpuMs`, lo que tardó: ahí dentro va la
 * primera compilación de los kernels (spec 2026-10-11 «simular al instante»
 * § 4.6).
 *
 * Sin device, o sin `onSubmittedWorkDone`, avisa al momento y sin cifra, como
 * antes. Si la corrida murió mientras la GPU trabajaba, no avisa: lo dice
 * `sigueViva` (Restablecer, una cascada nueva, el device perdido). Con el
 * device perdido la espera no falla, resuelve, como manda la spec de WebGPU:
 * por eso lo mira `sigueViva`. Una espera que falla tampoco avisa.
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
    () => { /* una espera que falla no es un cuadro en pantalla */ },
  );
}
