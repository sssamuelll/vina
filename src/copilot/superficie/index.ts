import { z } from 'zod';
import type { Verbo } from './tipos';
import { VERBOS_DE_LEER } from './verbos/leer';
import { VERBOS_DE_MEDIR } from './verbos/medir';
import { VERBOS_DE_PIEZA } from './verbos/pieza';
import { VERBOS_DE_COSTURA } from './verbos/costura';
import { VERBOS_DE_PIQUETE } from './verbos/piquete';
import { VERBOS_DE_BORRAR } from './verbos/borrar';

/**
 * La superficie de herramientas de Vina (spec 2026-10-05): la única capa que
 * ven los agentes, el de la usuaria por MCP y el de Vina. Los verbos llegan
 * por entregas: 1a leer y medir; 1b, primera mitad, las manos.
 */
export const SUPERFICIE: readonly Verbo[] = [
  ...VERBOS_DE_LEER, ...VERBOS_DE_MEDIR,
  ...VERBOS_DE_PIEZA, ...VERBOS_DE_COSTURA, ...VERBOS_DE_PIQUETE, ...VERBOS_DE_BORRAR,
];

export interface DefinicionDeVerbo {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Lo que viaja al modelo por cada verbo: nombre, descripción y esquema JSON de entrada. */
export function definicionesDeLaSuperficie(verbos: readonly Verbo[] = SUPERFICIE): DefinicionDeVerbo[] {
  return verbos.map(v => {
    const esquema = z.toJSONSchema(v.args, { io: 'input' }) as Record<string, unknown>;
    delete esquema.$schema;
    return { name: v.name, description: v.description, input_schema: esquema };
  });
}
