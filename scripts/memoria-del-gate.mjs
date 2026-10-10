// La memoria del gate del deploy: un reporter de Playwright que deja
// `<spec>.ok` en VINA_GATE_MARCAS (la carpeta de marcas del árbol que se mide)
// cuando el último intento de CADA test de ese spec salió como se esperaba:
// pasado, o saltado a propósito. `scripts/deploy-prod.sh` se salta los specs
// con marca. Lo mide tests/repo/la-memoria-del-gate.test.ts.
//
// La marca se escribe en cuanto el spec queda entero, no al final: si a la
// corrida la matan a mitad (Claude Code mata los trabajos de fondo cuando falta
// memoria), lo que ya pasó queda guardado y el intento siguiente sigue desde ahí.
//
// Por qué «el último intento» y no el resultado del test: un grupo serial que
// cae se reintenta ENTERO, y un test que ya había pasado vuelve a correr. Y por
// qué no `test.ok()`: cuenta como ok un test que no llegó a correr.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export default class MemoriaDelGate {
  constructor() {
    this.carpeta = process.env.VINA_GATE_MARCAS;
    if (!this.carpeta) throw new Error('memoria-del-gate: falta VINA_GATE_MARCAS, la carpeta de marcas del árbol');
    mkdirSync(this.carpeta, { recursive: true });
    /** spec → (id del test → ¿su último intento salió como se esperaba?) */
    this.specs = new Map();
  }

  onBegin(_config, suite) {
    for (const test of suite.allTests()) {
      const spec = basename(test.location.file);
      if (!this.specs.has(spec)) this.specs.set(spec, new Map());
      this.specs.get(spec).set(test.id, false);
    }
  }

  onTestEnd(test, result) {
    const spec = basename(test.location.file);
    const tests = this.specs.get(spec);
    tests.set(test.id, result.status === test.expectedStatus);
    if ([...tests.values()].every(Boolean)) writeFileSync(join(this.carpeta, `${spec}.ok`), '');
  }

  printsToStdio() {
    return false;
  }
}
