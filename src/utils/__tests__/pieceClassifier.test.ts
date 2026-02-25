import { describe, it, expect } from 'vitest';
import { classifyByName } from '../pieceClassifier';

describe('pieceClassifier', () => {
  it.each([
    ['Front Bodice', 'bodice', 'front'],
    ['Back Bodice', 'bodice', 'back'],
    ['Sleeve', 'sleeve', 'both'],
    ['Left Sleeve', 'sleeve', 'left'],
    ['Collar', 'collar', 'both'],
    ['Skirt Front', 'skirt', 'front'],
    ['Trouser Back', 'trouser', 'back'],
    ['Waistband', 'waistband', 'both'],
    ['Pocket', 'pocket', 'both'],
    ['Hood', 'hood', 'both'],
    ['Cuff', 'cuff', 'both'],
    ['Facing', 'facing', 'both'],
    ['Lining', 'lining', 'both'],
    ['Yoke', 'yoke', 'both'],
    // Spanish
    ['Delantero', 'bodice', 'front'],
    ['Espalda', 'bodice', 'back'],
    ['Manga', 'sleeve', 'both'],
    ['Cuello', 'collar', 'both'],
    ['Falda', 'skirt', 'both'],
    ['Pantalón', 'trouser', 'both'],
    ['Bolsillo', 'pocket', 'both'],
    // French
    ['Devant', 'bodice', 'front'],
    ['Dos', 'bodice', 'back'],
    ['Manche', 'sleeve', 'both'],
    // German
    ['Vorderteil', 'bodice', 'front'],
    ['Rückteil', 'bodice', 'back'],
    ['Ärmel', 'sleeve', 'both'],
    // Unknown
    ['Detail', 'other', 'both'],
    ['Mystery Piece', 'other', 'both'],
  ])('classifies "%s" as %s/%s', (name, expectedCat, expectedSide) => {
    const { category, side } = classifyByName(name);
    expect(category).toBe(expectedCat);
    expect(side).toBe(expectedSide);
  });
});
