import { z } from 'zod';
import type { Verbo } from './tipos';
import { VERBOS_DE_LEER } from './verbos/leer';

/**
 * La superficie de herramientas de Vina (spec 2026-10-05): la única capa que
 * ven los agentes, el de la usuaria por MCP y el de Vina. Los verbos llegan
 * por entregas: 1a leer y medir, 1b actuar.
 */
export const SUPERFICIE: readonly Verbo[] = [...VERBOS_DE_LEER];

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
