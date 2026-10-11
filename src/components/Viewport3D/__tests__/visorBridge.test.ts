import { describe, it, expect, vi, afterEach } from 'vitest';
import { registrarVisor, capturarVisor3D } from '../visorBridge';

/**
 * «Capturar visor 3D» vive en el menú Vina › Archivo (spec 2026-10-02 § 4.2),
 * fuera del árbol del visor, que es quien sabe capturar. El puente es el hilo
 * entre los dos: el visor registra su captura al montarse y la suelta al irse.
 */
afterEach(() => registrarVisor(null));

describe('visorBridge', () => {
  it('sin visor registrado no hace nada y dice que no pudo', () => {
    expect(capturarVisor3D()).toBe(false);
  });

  it('con un visor registrado lo llama una vez y dice que sí', () => {
    const captura = vi.fn();
    registrarVisor(captura);
    expect(capturarVisor3D()).toBe(true);
    expect(captura).toHaveBeenCalledTimes(1);
  });

  it('el visor que se va suelta su captura: ya no queda nada que llamar', () => {
    const captura = vi.fn();
    registrarVisor(captura);
    registrarVisor(null);
    expect(capturarVisor3D()).toBe(false);
    expect(captura).not.toHaveBeenCalled();
  });

  it('el último visor registrado es el que captura', () => {
    const viejo = vi.fn();
    const nuevo = vi.fn();
    registrarVisor(viejo);
    registrarVisor(nuevo);
    capturarVisor3D();
    expect(viejo).not.toHaveBeenCalled();
    expect(nuevo).toHaveBeenCalledTimes(1);
  });
});
