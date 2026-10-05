/**
 * La revisión del proyecto en esta sesión (spec 2026-10-05 § 5.2): un número
 * que sube cada vez que el proyecto cambia. Con él, un agente ve si algo
 * cambió entre dos llamadas, también si lo cambió María. Es por sesión: vuelve
 * a 0 al recargar, y para eso basta.
 *
 * Se sigue con un subscribe enfocado en la identidad de `state.project`, como
 * el autoguardado (`projectAutosave.ts`). Así ve también `global/newProject`,
 * la única acción que cambia el proyecto sin el prefijo `project/`.
 */
let revision = 0;

export function revisionDelProyecto(): number {
  return revision;
}

export function seguirLaRevision(store: {
  getState: () => { project: unknown };
  subscribe: (fn: () => void) => () => void;
}): () => void {
  let anterior = store.getState().project;
  return store.subscribe(() => {
    const proyecto = store.getState().project;
    if (proyecto !== anterior) {
      anterior = proyecto;
      revision += 1;
    }
  });
}
