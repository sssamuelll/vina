import type { z } from 'zod';
import type { AppDispatch, RootState } from '../../store';

/** De dónde viene la llamada: el agente de la usuaria por MCP, o el agente de Vina. */
export type Origen = 'mcp' | 'vina';

export interface ContextoDeVerbo {
  getState: () => RootState;
  dispatch: AppDispatch;
  origen: Origen;
}

/**
 * Un verbo de la superficie (spec 2026-10-05 § 5.1): un adaptador fino sobre
 * el motor que ya existe. `args` es zod, la única fuente de su esquema JSON
 * (ratificación D3: zod para los argumentos de herramientas). El nombre, la
 * descripción y la respuesta van en inglés (D8).
 */
export interface Verbo<A extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  args: A;
  // Método y no propiedad: los parámetros de un método son bivariantes, y así
  // un verbo con argumentos concretos cabe en una lista de `Verbo`.
  run(args: z.output<A>, ctx: ContextoDeVerbo): unknown;
}

/** Declara un verbo: infiere de `args` lo que recibe `run`. */
export function definirVerbo<A extends z.ZodType>(verbo: Verbo<A>): Verbo<A> {
  return verbo;
}

export type Respuesta =
  | { ok: true; result: unknown; revision: number }
  | { ok: false; error: string; revision: number };
