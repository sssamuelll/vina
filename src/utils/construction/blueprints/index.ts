/**
 * Builtin Blueprint Library
 * 
 * All validated construction blueprints that ship with OpenClo.
 * Users can add their own blueprints on top of these.
 */

import type { Blueprint } from '../../../types/blueprint';
import { bodiceFrontBlock } from './bodiceFrontBlock';
import { bodiceBackBlock } from './bodiceBackBlock';
import { basicSleeve } from './basicSleeve';

export const BUILTIN_BLUEPRINTS: Blueprint[] = [
  bodiceFrontBlock,
  bodiceBackBlock,
  basicSleeve,
];

export { bodiceFrontBlock, bodiceBackBlock, basicSleeve };
