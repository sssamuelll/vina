import { UnitSystem } from '../types/types';

/**
 * Convert and format a dimension from mm to the target unit system
 * @param valueMm - Value in millimeters
 * @param units - Target unit system
 * @returns Formatted string with unit suffix
 */
export function formatDimension(valueMm: number, units: UnitSystem): string {
  switch (units) {
    case 'mm':
      return `${valueMm.toFixed(1)} mm`;
    case 'cm':
      return `${(valueMm / 10).toFixed(1)} cm`;
    case 'inches':
      return `${(valueMm / 25.4).toFixed(1)} in`;
    default:
      return `${valueMm.toFixed(1)} mm`;
  }
}