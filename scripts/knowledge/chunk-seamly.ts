/**
 * Knowledge Chunking: Seamly2D Patterns + Size Tables
 *
 * Extracts knowledge from the Seamly2D pattern catalog and size table
 * data into KnowledgeChunk arrays.
 *
 * Run: npx tsx scripts/knowledge/chunk-seamly.ts
 * Output: scripts/knowledge/output/seamly-chunks.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { KnowledgeChunk, ChunkMetadata } from '../../src/copilot/knowledge/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chunks: KnowledgeChunk[] = [];
let nextId = 1;

function addChunk(content: string, metadata: ChunkMetadata): void {
  chunks.push({
    id: `seamly-${String(nextId++).padStart(3, '0')}`,
    content,
    metadata,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN CATALOG — one chunk per pattern entry
// ─────────────────────────────────────────────────────────────────────────────

// --- Tops ---

addChunk(
  'Male Shirt (Camisa Masculina): Full male dress shirt with yoke, sleeve, and collar construction. ' +
  'Category: tops. Gender: men. Complexity: advanced. ' +
  'Requires 7 measurements: chest, waist, hips, height, neckCirc, shoulder, armLength. ' +
  'This is one of the most complex patterns in the library, involving multiple pieces that must be precisely connected.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:male_shirt',
    category: 'drafting-method',
    tags: ['shirt', 'camisa', 'men', 'yoke', 'collar', 'sleeve'],
    garmentTypes: ['bodice', 'sleeve', 'collar'],
    difficulty: 'advanced',
  },
);

addChunk(
  'Men\'s Shirt Block (Bloque Base Camisa Masculina): Basic shirt block/sloper for men. ' +
  'Category: blocks. Gender: men. Complexity: basic. ' +
  'Requires 4 measurements: chest, waist, height, shoulder. ' +
  'A fundamental building block for all men\'s upper body garments. The sloper has no design ease, serving as a body-fitting template.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:mens_shirt_block',
    category: 'drafting-method',
    tags: ['block', 'sloper', 'shirt', 'men', 'base'],
    garmentTypes: ['bodice'],
    difficulty: 'basic',
  },
);

addChunk(
  'Blouse Pattern (Patron de Blusa): Women\'s blouse base pattern. ' +
  'Category: tops. Gender: women. Complexity: intermediate. ' +
  'Requires 3 measurements: chest, waist, height. ' +
  'A versatile base for women\'s blouse construction. Can be adapted for different necklines, sleeve types, and closures.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:patron_blusa',
    category: 'drafting-method',
    tags: ['blouse', 'blusa', 'women', 'top'],
    garmentTypes: ['bodice'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'T-Shirt (Camiseta): Basic t-shirt pattern. ' +
  'Category: tops. Gender: unisex. Complexity: basic. ' +
  'Requires 2 measurements: chest, height. ' +
  'The simplest top pattern in the library. Suitable for beginners and rapid prototyping.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:tshirt_test',
    category: 'drafting-method',
    tags: ['tshirt', 'camiseta', 'casual', 'unisex', 'basic'],
    garmentTypes: ['bodice'],
    difficulty: 'basic',
  },
);

addChunk(
  'Pajama Top Wrap (Top de Pijama Cruzado): Wrap-style pajama top. ' +
  'Category: tops. Gender: unisex. Complexity: intermediate. ' +
  'Requires 3 measurements: chest, waist, height. ' +
  'Features a wrap front closure, suitable for sleepwear and loungewear construction.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:pajama_top_wrap2',
    category: 'drafting-method',
    tags: ['pajama', 'pijama', 'wrap', 'sleepwear', 'unisex'],
    garmentTypes: ['bodice'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'Moulage Armhole and Neckline (Moulage Sisa y Escote): Moulage block focusing on armhole and neckline shaping. ' +
  'Category: blocks. Gender: women. Complexity: intermediate. ' +
  'Requires 3 measurements: chest, waist, height. ' +
  'A draping-based block specifically designed for studying and refining armhole and neckline fit. Used as an educational tool.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:moulage_05_armhole_neckline',
    category: 'drafting-method',
    tags: ['moulage', 'draping', 'armhole', 'neckline', 'women', 'block'],
    garmentTypes: ['bodice'],
    difficulty: 'intermediate',
  },
);

// --- Bottoms ---

addChunk(
  'Trousers (Pantalon): Full trouser pattern with front and back pieces. ' +
  'Category: bottoms. Gender: unisex. Complexity: advanced. ' +
  'Requires 4 measurements: waist, hips, height, inseam. ' +
  'A complete trouser construction with separate front and back pieces, crotch curve, and fly extension.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:trousers',
    category: 'drafting-method',
    tags: ['trousers', 'pants', 'pantalon', 'unisex'],
    garmentTypes: ['skirt'],
    difficulty: 'advanced',
  },
);

addChunk(
  'Base Trouser Eli (Pantalon Base Eli): Women\'s basic trouser block. ' +
  'Category: bottoms. Gender: women. Complexity: intermediate. ' +
  'Requires 3 measurements: waist, hips, height. ' +
  'A women\'s trouser sloper that serves as the foundation for all women\'s pant styles including straight leg, wide leg, and tapered.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:pantalon_base_Eli',
    category: 'drafting-method',
    tags: ['trouser', 'pants', 'pantalon', 'women', 'base'],
    garmentTypes: ['skirt'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'Pants Size 52 (Pantalon Talla 52): Men\'s pants pattern, size 52/176. ' +
  'Category: bottoms. Gender: men. Complexity: intermediate. ' +
  'Requires 4 measurements: waist, hips, height, inseam. ' +
  'Pre-graded men\'s trouser for European size 52 (height 176cm).',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:pants1_52-176',
    category: 'drafting-method',
    tags: ['pants', 'pantalon', 'men', 'size-52'],
    garmentTypes: ['skirt'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'Pants Size 40 Children (Pantalon Talla 40): Children\'s pants pattern, size 40/146. ' +
  'Category: bottoms. Gender: children. Complexity: intermediate. ' +
  'Requires 4 measurements: waist, hips, height, inseam. ' +
  'Children\'s trouser pattern with proportions adapted for child body shapes. Height 146cm corresponds roughly to age 10-12.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:pants2_40-146',
    category: 'drafting-method',
    tags: ['pants', 'pantalon', 'children', 'kids'],
    garmentTypes: ['skirt'],
    difficulty: 'intermediate',
  },
);

addChunk(
  'Steampunk Trousers (Pantalon Steampunk): Decorative steampunk-style trousers. ' +
  'Category: bottoms. Gender: unisex. Complexity: advanced. ' +
  'Requires 4 measurements: waist, hips, height, inseam. ' +
  'A costume/fashion trouser with decorative construction details inspired by the steampunk aesthetic.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:steampunk_trousers',
    category: 'drafting-method',
    tags: ['steampunk', 'trousers', 'costume', 'fashion'],
    garmentTypes: ['skirt'],
    difficulty: 'advanced',
  },
);

addChunk(
  'Keiko Skirt (Falda Keiko): Keiko-style skirt pattern. ' +
  'Category: bottoms. Gender: women. Complexity: intermediate. ' +
  'Requires 3 measurements: waist, hips, height. ' +
  'A distinctive skirt design with unique paneling and shape.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:keiko_skirt',
    category: 'drafting-method',
    tags: ['skirt', 'falda', 'keiko', 'women'],
    garmentTypes: ['skirt'],
    difficulty: 'intermediate',
  },
);

// --- Underwear ---

addChunk(
  'Bra (Sujetador): Bra pattern with cup construction. ' +
  'Category: underwear. Gender: women. Complexity: advanced. ' +
  'Requires 3 measurements: highBust, chest (full bust), waist. ' +
  'Cup construction uses the difference between full bust and high bust to determine cup size. Requires specialized stretch fabrics and findings.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:bra',
    category: 'drafting-method',
    tags: ['bra', 'sujetador', 'lingerie', 'underwear', 'women', 'cup'],
    garmentTypes: ['bodice'],
    difficulty: 'advanced',
  },
);

// --- Outerwear ---

addChunk(
  'Jacket Size 52 (Chaqueta Talla 52): Men\'s jacket, size 52/176. ' +
  'Category: outerwear. Gender: men. Complexity: advanced. ' +
  'Requires 6 measurements: chest, waist, hips, height, shoulder, armLength. ' +
  'A full tailored jacket with multiple pieces including front, back, sleeve, collar, and facing. Requires careful fit adjustment.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:jacket1_52-176',
    category: 'drafting-method',
    tags: ['jacket', 'chaqueta', 'men', 'tailoring', 'outerwear'],
    garmentTypes: ['bodice', 'sleeve', 'collar'],
    difficulty: 'advanced',
  },
);

addChunk(
  'Gentleman\'s Jacket Tummy Fit (Chaqueta Caballero Ajuste Abdomen): Gentleman\'s jacket with tummy accommodation. ' +
  'Category: outerwear. Gender: men. Complexity: advanced. ' +
  'Requires 6 measurements: chest, waist, hips, height, shoulder, armLength. ' +
  'A specialized jacket pattern that accommodates a protruding abdomen through modified front dart placement and additional ease distribution at the front waist.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:gent_jacket_with_tummy',
    category: 'drafting-method',
    tags: ['jacket', 'chaqueta', 'gentleman', 'tummy', 'plus-size', 'men'],
    garmentTypes: ['bodice', 'sleeve'],
    difficulty: 'advanced',
  },
);

// --- Blocks ---

addChunk(
  'Women\'s Basic Block 2016 (Bloque Base Mujer 2016): Women\'s basic bodice block/sloper (2016 method). ' +
  'Category: blocks. Gender: women. Complexity: basic. ' +
  'Requires 4 measurements: chest, waist, hips, height. ' +
  'The foundational building block for all women\'s garments. A close-fitting body shell with no design ease, used as the starting point for all pattern manipulation.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:basic_block_women-2016',
    category: 'drafting-method',
    tags: ['block', 'sloper', 'base', 'women', 'bodice'],
    garmentTypes: ['bodice'],
    difficulty: 'basic',
  },
);

addChunk(
  'Armhole Adjustment Block (Bloque Ajuste de Sisa): Armhole adjustment block for bodice fitting. ' +
  'Category: blocks. Gender: women. Complexity: intermediate. ' +
  'Requires 3 measurements: chest, waist, height. ' +
  'A specialized block used to study and modify armhole fit. Essential for achieving comfortable sleeve insertion and arm movement range.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:07_armhole_adjustment_010',
    category: 'drafting-method',
    tags: ['armhole', 'adjustment', 'block', 'fitting', 'women'],
    garmentTypes: ['bodice'],
    difficulty: 'intermediate',
  },
);

// --- Sleeves ---

addChunk(
  'Basic Sleeve (Manga Basica): Basic sleeve pattern. ' +
  'Category: sleeves. Gender: unisex. Complexity: basic. ' +
  'Requires 2 measurements: armLength, chest. ' +
  'A standard one-piece set-in sleeve. The cap shape must match the bodice armhole it will be set into, with appropriate cap ease added.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:sleeve',
    category: 'drafting-method',
    tags: ['sleeve', 'manga', 'basic', 'unisex'],
    garmentTypes: ['sleeve'],
    difficulty: 'basic',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SIZE TABLES — measurement data by size system
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'European Women size table (all measurements in mm, converted to cm here for readability): ' +
  'XXS (EU 32-34): height 164, chest 78, waist 60, hips 84, shoulder 12.0, armLength 58, inseam 76, neckCirc 34, highBust 76, shoulderWidth 37. ' +
  'XS (EU 34-36): height 166, chest 82, waist 64, hips 88, shoulder 12.2, armLength 58.5, inseam 77, neckCirc 34.5, highBust 80, shoulderWidth 38. ' +
  'S (EU 36-38): height 168, chest 88, waist 70, hips 94, shoulder 12.5, armLength 59, inseam 78, neckCirc 35.5, highBust 86, shoulderWidth 39. ' +
  'M (EU 38-40): height 168, chest 92, waist 74, hips 98, shoulder 12.8, armLength 59.5, inseam 78, neckCirc 36.5, highBust 90, shoulderWidth 40. ' +
  'L (EU 40-42): height 168, chest 96, waist 78, hips 102, shoulder 13.2, armLength 60, inseam 78, neckCirc 37.5, highBust 94, shoulderWidth 41. ' +
  'XL (EU 42-44): height 168, chest 102, waist 85, hips 108, shoulder 13.6, armLength 60, inseam 78, neckCirc 39, highBust 100, shoulderWidth 42.5. ' +
  'XXL (EU 44-46): height 168, chest 108, waist 92, hips 114, shoulder 14.0, armLength 60, inseam 78, neckCirc 40, highBust 106, shoulderWidth 44. ' +
  '3XL (EU 46-48): height 168, chest 114, waist 98, hips 120, shoulder 14.4, armLength 60, inseam 78, neckCirc 41, highBust 112, shoulderWidth 45.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:sizeTables:eu-women',
    category: 'size-table',
    tags: ['size-table', 'EU', 'women', 'measurements', 'standard-sizes'],
    garmentTypes: ['bodice', 'sleeve', 'skirt'],
    difficulty: 'basic',
  },
);

addChunk(
  'European Men size table (all measurements in mm, converted to cm here for readability): ' +
  'XXS (EU 42-44): height 172, chest 86, waist 72, hips 88, shoulder 13.5, armLength 61, inseam 79, neckCirc 37, shoulderWidth 42. ' +
  'XS (EU 44-46): height 174, chest 90, waist 76, hips 92, shoulder 13.8, armLength 62, inseam 80, neckCirc 38, shoulderWidth 43. ' +
  'S (EU 46-48): height 176, chest 94, waist 80, hips 96, shoulder 14.2, armLength 63, inseam 81, neckCirc 39, shoulderWidth 44. ' +
  'M (EU 48-50): height 178, chest 98, waist 84, hips 100, shoulder 14.6, armLength 64, inseam 82, neckCirc 40, shoulderWidth 46. ' +
  'L (EU 50-52): height 180, chest 104, waist 90, hips 104, shoulder 15.0, armLength 65, inseam 83, neckCirc 41.5, shoulderWidth 47.5. ' +
  'XL (EU 52-54): height 180, chest 110, waist 97, hips 108, shoulder 15.4, armLength 65, inseam 83, neckCirc 43, shoulderWidth 49. ' +
  'XXL (EU 54-56): height 180, chest 116, waist 104, hips 114, shoulder 15.8, armLength 65, inseam 83, neckCirc 44.5, shoulderWidth 50.5. ' +
  '3XL (EU 56-58): height 180, chest 122, waist 110, hips 120, shoulder 16.2, armLength 65, inseam 83, neckCirc 46, shoulderWidth 52.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:sizeTables:eu-men',
    category: 'size-table',
    tags: ['size-table', 'EU', 'men', 'measurements', 'standard-sizes'],
    garmentTypes: ['bodice', 'sleeve', 'skirt'],
    difficulty: 'basic',
  },
);

addChunk(
  'European Children size table by height (all measurements in mm, converted to cm here for readability): ' +
  'XXS (104cm/~4y): height 104, chest 56, waist 52, hips 58, shoulder 8.5, armLength 37, inseam 44. ' +
  'XS (116cm/~6y): height 116, chest 60, waist 54, hips 62, shoulder 9.0, armLength 41, inseam 51. ' +
  'S (128cm/~8y): height 128, chest 64, waist 56, hips 66, shoulder 10.0, armLength 45, inseam 57. ' +
  'M (140cm/~10y): height 140, chest 68, waist 58, hips 72, shoulder 10.8, armLength 49, inseam 63. ' +
  'L (152cm/~12y): height 152, chest 74, waist 62, hips 78, shoulder 11.5, armLength 53, inseam 69. ' +
  'XL (164cm/~14y): height 164, chest 80, waist 66, hips 84, shoulder 12.2, armLength 56, inseam 74. ' +
  'XXL (176cm/~16y): height 176, chest 86, waist 70, hips 90, shoulder 13.0, armLength 58, inseam 79. ' +
  'Children sizes are organized by body height rather than circumference measurements. The height-to-age mapping is approximate.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:sizeTables:eu-children',
    category: 'size-table',
    tags: ['size-table', 'EU', 'children', 'kids', 'measurements', 'height-based'],
    garmentTypes: ['bodice', 'sleeve', 'skirt'],
    difficulty: 'basic',
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER ARCHITECTURE — construction knowledge
// ─────────────────────────────────────────────────────────────────────────────

addChunk(
  'Seamly2D pattern adapter architecture: The adapter converts Seamly2D pattern JSON files into the OpenClo construction engine format. ' +
  'The pipeline has 4 stages: ' +
  '1. Resolve all construction steps to concrete (x, y) coordinates using measurements and formula evaluation. ' +
  '2. Convert resolved points to CPoint objects (construction points with IDs and coordinates). ' +
  '3. Convert spline definitions to CCurve objects (bezier curves connecting points). ' +
  '4. Convert piece definitions to CPiece objects with ordered PieceNode arrays defining the outline. ' +
  'Each Seamly2D pattern declares required measurements with defaults, variables (computed formulas), ' +
  'a sequence of construction steps (point, line-angle, spline, etc.), and piece outlines referencing constructed geometry.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:adapter',
    category: 'construction-step',
    tags: ['seamly2d', 'adapter', 'construction', 'pipeline', 'architecture'],
    garmentTypes: ['bodice', 'sleeve', 'skirt'],
    difficulty: 'advanced',
  },
);

addChunk(
  'Seamly2D pattern structure: Each pattern JSON contains four sections. ' +
  'Measurements section declares required body measurements with default values (in mm). ' +
  'Variables section contains computed formulas that reference measurements and other variables (e.g., "#sag_p = chest/4 + 1"). ' +
  'Construction section lists steps that build the geometry: single points at absolute coordinates, endpoint-by-angle points, ' +
  'endpoint-by-length points, cubic bezier splines, and spline paths with multiple control points. ' +
  'Pieces section defines pattern pieces as ordered lists of nodes (points and curves) that form closed outlines, ' +
  'with seam allowance width per piece. The formula evaluator supports Seamly2D syntax including IncrementName references.',
  {
    source: 'seamly2d',
    sourceRef: 'seamly2d:pattern-structure',
    category: 'construction-step',
    tags: ['seamly2d', 'pattern', 'structure', 'json', 'formulas'],
    garmentTypes: ['bodice', 'sleeve', 'skirt'],
    difficulty: 'intermediate',
  },
);

// ─── Write output ────────────────────────────────────────────────────────────

const outputDir = path.join(__dirname, 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'seamly-chunks.json'),
  JSON.stringify(chunks, null, 2),
);
console.log(`Generated ${chunks.length} seamly chunks → scripts/knowledge/output/seamly-chunks.json`);
