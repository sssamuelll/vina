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

/**
 * Lo que devuelve todo verbo de «Actuar» (spec § 5.2). `measure` es propia de
 * cada verbo y puede anidar —los bordes de una pieza, una costura medida—: el
 * `Record` plano de la spec no cabía en el recibo de `create_piece`.
 */
export interface Recibo {
  /** true solo si la medida confirma el resultado (§ 5.3). */
  done: boolean;
  /** Qué cambió, por id: piezas, costuras e internas. */
  changed: { created: string[]; modified: string[]; deleted: string[] };
  /** La medida del resultado, calculada después del cambio. */
  measure: Record<string, unknown>;
  /** Lo que no cuadra, con números. */
  warnings: string[];
  /** La revisión del proyecto antes y después: el agente ve si María tocó algo en medio. */
  revision: { before: number; after: number };
}

export type Respuesta =
  | { ok: true; result: unknown; revision: number }
  | { ok: false; error: string; revision: number };
