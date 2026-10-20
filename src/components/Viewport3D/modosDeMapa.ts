/**
 * Los mapas de ajuste (CLO3D «Garment Fit Maps»), como datos: los cuatro que se
 * eligen en el menú «Mapa» (`MenuDeMapas`) y la escala de color que los lee
 * (`LeyendaDeMapas`). Antes vivían dentro de `FitMapToggle.tsx`, la barra oscura
 * que flotaba sobre el visor.
 *
 * Atajos: Alt+6 a Alt+9 los maneja `useKeyboardShortcuts`, con el menú abierto o
 * sin él; aquí solo se enseñan.
 */
import type { FitMapMode } from '../../utils/cloth/fitMaps';

/**
 * Las ocho paradas de la escala de tensión y de estiramiento. Son DATO, no
 * acento: espejan `STRESS_STRAIN_COLORS` del solver (utils/cloth/fitMaps.ts), y
 * cambiarlas es mentir sobre lo que la malla está pintando.
 */
export const ESCALA_DE_8_PARADAS = [
  '#0000FF', // 0.00
  '#0066FF', // 14.3
  '#00CCCC', // 28.6
  '#00FF66', // 42.8
  '#66FF00', // 57.1
  '#FFFF00', // 71.4
  '#FF8800', // 85.7
  '#FF0000', // 100
] as const;

export interface ModoDeMapa {
  mode: FitMapMode;
  label: string;
  shortcut: string;
  /** Trazo SVG (24×24) del icono. */
  icon: string;
}

export const MODOS_DE_MAPA: ReadonlyArray<ModoDeMapa> = [
  {
    mode: 'stress',
    label: 'Mapa de tensión',
    shortcut: 'Alt+6',
    // Termómetro
    icon: 'M12 2a3 3 0 0 0-3 3v8.17a5 5 0 1 0 6 0V5a3 3 0 0 0-3-3Z',
  },
  {
    mode: 'strain',
    label: 'Mapa de estiramiento',
    shortcut: 'Alt+7',
    // Flechas de estirar
    icon: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
  },
  {
    mode: 'fit',
    label: 'Mapa de ajuste',
    shortcut: 'Alt+8',
    // Persona
    icon: 'M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2',
  },
  {
    mode: 'pressure',
    label: 'Puntos de presión',
    shortcut: 'Alt+9',
    // Cuadrícula de puntos de contacto
    icon: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 5m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 5m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M5 19m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 19m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  },
];
