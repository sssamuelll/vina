/**
 * Builtin Blueprint Library
 * 
 * Complete garment blueprints that ship with OpenClo.
 * Each blueprint contains one or more blocks (body, sleeve, collar, etc.)
 */

import type { Blueprint } from '../../../types/blueprint';
import { basicTshirt } from './tshirt';

export const BUILTIN_BLUEPRINTS: Blueprint[] = [
  basicTshirt,
];

export { basicTshirt };
