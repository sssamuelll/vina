import { createContext } from 'react';
import type { Cota } from './cotas';

export interface GrupoPuesto {
  campos: Cota[];
  left: number;
  top: number;
}

/** Posiciones reales de los chips agrupados, compartidas con sus lecturas. */
export const GruposDeCotas = createContext<Map<string, GrupoPuesto | null> | null>(null);
