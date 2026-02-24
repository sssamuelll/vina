/**
 * Builtin Recipe Library
 * 
 * All validated construction recipes that ship with OpenClo.
 * Users can add their own recipes on top of these.
 */

import type { Recipe } from '../../../types/recipe';
import { bodiceFrontBlock } from './bodiceFrontBlock';
import { bodiceBackBlock } from './bodiceBackBlock';
import { basicSleeve } from './basicSleeve';

export const BUILTIN_RECIPES: Recipe[] = [
  bodiceFrontBlock,
  bodiceBackBlock,
  basicSleeve,
];

export { bodiceFrontBlock, bodiceBackBlock, basicSleeve };
