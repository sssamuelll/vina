/**
 * Seamly2D Pattern Catalog — indexes available pattern templates with
 * metadata for copilot discovery and size table integration.
 *
 * @module seamly2d/catalog
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type GarmentCategory =
  | 'tops'      // shirts, blouses, t-shirts
  | 'bottoms'   // trousers, skirts, pants
  | 'dresses'   // full dresses
  | 'outerwear' // jackets, coats
  | 'underwear' // bra, underwear
  | 'blocks'    // basic blocks (slopers)
  | 'sleeves'   // standalone sleeve patterns
  | 'other';

export type Gender = 'women' | 'men' | 'unisex' | 'children';

export interface CatalogEntry {
  /** Pattern file name (without .json) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Localized name (Spanish) */
  nameEs: string;
  /** Category */
  category: GarmentCategory;
  /** Target gender */
  gender: Gender;
  /** Required measurements from BodyMeasurements */
  requiredMeasurements: string[];
  /** Keywords for search */
  keywords: string[];
  /** Complexity: basic block, intermediate, advanced */
  complexity: 'basic' | 'intermediate' | 'advanced';
  /** Whether this is a usable pattern (vs test file) */
  usable: boolean;
  /** Brief description */
  description: string;
}

// ─── Catalog data ───────────────────────────────────────────────────────────

const CATALOG: CatalogEntry[] = [
  // ─── Tops ───
  {
    id: 'male_shirt',
    name: 'Male Shirt',
    nameEs: 'Camisa Masculina',
    category: 'tops',
    gender: 'men',
    requiredMeasurements: ['chest', 'waist', 'hips', 'height', 'neckCirc', 'shoulder', 'armLength'],
    keywords: ['shirt', 'camisa', 'hemd', 'chemise', 'male', 'men', 'hombre'],
    complexity: 'advanced',
    usable: true,
    description: 'Full male dress shirt with yoke, sleeve, and collar construction',
  },
  {
    id: 'mens_shirt_block',
    name: 'Men\'s Shirt Block',
    nameEs: 'Bloque Base Camisa Masculina',
    category: 'blocks',
    gender: 'men',
    requiredMeasurements: ['chest', 'waist', 'height', 'shoulder'],
    keywords: ['block', 'sloper', 'base', 'shirt', 'camisa', 'bloque'],
    complexity: 'basic',
    usable: true,
    description: 'Basic shirt block/sloper for men',
  },
  {
    id: 'patron_blusa',
    name: 'Blouse Pattern',
    nameEs: 'Patrón de Blusa',
    category: 'tops',
    gender: 'women',
    requiredMeasurements: ['chest', 'waist', 'height'],
    keywords: ['blouse', 'blusa', 'bluse', 'top', 'women', 'mujer'],
    complexity: 'intermediate',
    usable: true,
    description: 'Women\'s blouse base pattern',
  },
  {
    id: 'tshirt_test',
    name: 'T-Shirt',
    nameEs: 'Camiseta',
    category: 'tops',
    gender: 'unisex',
    requiredMeasurements: ['chest', 'height'],
    keywords: ['tshirt', 'camiseta', 't-shirt', 'casual'],
    complexity: 'basic',
    usable: true,
    description: 'Basic t-shirt pattern',
  },
  {
    id: 'pajama_top_wrap2',
    name: 'Pajama Top (Wrap)',
    nameEs: 'Top de Pijama (Cruzado)',
    category: 'tops',
    gender: 'unisex',
    requiredMeasurements: ['chest', 'waist', 'height'],
    keywords: ['pajama', 'pijama', 'wrap', 'cruzado', 'sleepwear'],
    complexity: 'intermediate',
    usable: true,
    description: 'Wrap-style pajama top',
  },
  {
    id: 'moulage_05_armhole_neckline',
    name: 'Moulage Armhole & Neckline',
    nameEs: 'Moulage Sisa y Escote',
    category: 'blocks',
    gender: 'women',
    requiredMeasurements: ['chest', 'waist', 'height'],
    keywords: ['moulage', 'draping', 'armhole', 'neckline', 'sisa', 'escote'],
    complexity: 'intermediate',
    usable: true,
    description: 'Moulage block focusing on armhole and neckline shaping',
  },

  // ─── Bottoms ───
  {
    id: 'trousers',
    name: 'Trousers',
    nameEs: 'Pantalón',
    category: 'bottoms',
    gender: 'unisex',
    requiredMeasurements: ['waist', 'hips', 'height', 'inseam'],
    keywords: ['trousers', 'pants', 'pantalón', 'hose', 'pantalon'],
    complexity: 'advanced',
    usable: true,
    description: 'Full trouser pattern with front/back pieces',
  },
  {
    id: 'pantalon_base_Eli',
    name: 'Base Trouser (Eli)',
    nameEs: 'Pantalón Base (Eli)',
    category: 'bottoms',
    gender: 'women',
    requiredMeasurements: ['waist', 'hips', 'height'],
    keywords: ['trouser', 'pants', 'pantalón', 'base', 'women'],
    complexity: 'intermediate',
    usable: true,
    description: 'Women\'s basic trouser block',
  },
  {
    id: 'pants1_52-176',
    name: 'Pants (Size 52)',
    nameEs: 'Pantalón (Talla 52)',
    category: 'bottoms',
    gender: 'men',
    requiredMeasurements: ['waist', 'hips', 'height', 'inseam'],
    keywords: ['pants', 'pantalón', 'men', 'hombre'],
    complexity: 'intermediate',
    usable: true,
    description: 'Men\'s pants pattern, size 52/176',
  },
  {
    id: 'pants2_40-146',
    name: 'Pants (Size 40)',
    nameEs: 'Pantalón (Talla 40)',
    category: 'bottoms',
    gender: 'children',
    requiredMeasurements: ['waist', 'hips', 'height', 'inseam'],
    keywords: ['pants', 'pantalón', 'children', 'kids', 'niños'],
    complexity: 'intermediate',
    usable: true,
    description: 'Children\'s pants pattern, size 40/146',
  },
  {
    id: 'steampunk_trousers',
    name: 'Steampunk Trousers',
    nameEs: 'Pantalón Steampunk',
    category: 'bottoms',
    gender: 'unisex',
    requiredMeasurements: ['waist', 'hips', 'height', 'inseam'],
    keywords: ['steampunk', 'trousers', 'costume', 'disfraz'],
    complexity: 'advanced',
    usable: true,
    description: 'Decorative steampunk-style trousers',
  },
  {
    id: 'keiko_skirt',
    name: 'Keiko Skirt',
    nameEs: 'Falda Keiko',
    category: 'bottoms',
    gender: 'women',
    requiredMeasurements: ['waist', 'hips', 'height'],
    keywords: ['skirt', 'falda', 'rock', 'jupe', 'keiko', 'women'],
    complexity: 'intermediate',
    usable: true,
    description: 'Keiko-style skirt pattern',
  },

  // ─── Underwear ───
  {
    id: 'bra',
    name: 'Bra',
    nameEs: 'Sujetador',
    category: 'underwear',
    gender: 'women',
    requiredMeasurements: ['highBust', 'chest', 'waist'],
    keywords: ['bra', 'sujetador', 'lingerie', 'lencería', 'bh'],
    complexity: 'advanced',
    usable: true,
    description: 'Bra pattern with cup construction',
  },

  // ─── Outerwear ───
  {
    id: 'jacket1_52-176',
    name: 'Jacket (Size 52)',
    nameEs: 'Chaqueta (Talla 52)',
    category: 'outerwear',
    gender: 'men',
    requiredMeasurements: ['chest', 'waist', 'hips', 'height', 'shoulder', 'armLength'],
    keywords: ['jacket', 'chaqueta', 'jacke', 'veste', 'men'],
    complexity: 'advanced',
    usable: true,
    description: 'Men\'s jacket, size 52/176',
  },
  {
    id: 'gent_jacket_with_tummy',
    name: 'Gentleman\'s Jacket (Tummy Fit)',
    nameEs: 'Chaqueta Caballero (Ajuste Abdomen)',
    category: 'outerwear',
    gender: 'men',
    requiredMeasurements: ['chest', 'waist', 'hips', 'height', 'shoulder', 'armLength'],
    keywords: ['jacket', 'chaqueta', 'gentleman', 'tummy', 'abdomen', 'plus-size'],
    complexity: 'advanced',
    usable: true,
    description: 'Gentleman\'s jacket with tummy accommodation',
  },

  // ─── Blocks / Slopers ───
  {
    id: 'basic_block_women-2016',
    name: 'Women\'s Basic Block (2016)',
    nameEs: 'Bloque Base Mujer (2016)',
    category: 'blocks',
    gender: 'women',
    requiredMeasurements: ['chest', 'waist', 'hips', 'height'],
    keywords: ['block', 'sloper', 'base', 'bloque', 'women', 'mujer', 'grundschnitt'],
    complexity: 'basic',
    usable: true,
    description: 'Women\'s basic bodice block/sloper (2016 method)',
  },
  {
    id: '07_armhole_adjustment_010',
    name: 'Armhole Adjustment Block',
    nameEs: 'Bloque Ajuste de Sisa',
    category: 'blocks',
    gender: 'women',
    requiredMeasurements: ['chest', 'waist', 'height'],
    keywords: ['armhole', 'sisa', 'adjustment', 'ajuste', 'block'],
    complexity: 'intermediate',
    usable: true,
    description: 'Armhole adjustment block for bodice fitting',
  },

  // ─── Sleeves ───
  {
    id: 'sleeve',
    name: 'Basic Sleeve',
    nameEs: 'Manga Básica',
    category: 'sleeves',
    gender: 'unisex',
    requiredMeasurements: ['armLength', 'chest'],
    keywords: ['sleeve', 'manga', 'ärmel', 'manche'],
    complexity: 'basic',
    usable: true,
    description: 'Basic sleeve pattern',
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get all catalog entries. */
export function getCatalog(): CatalogEntry[] {
  return CATALOG.filter(e => e.usable);
}

/** Search catalog by keyword (supports multi-language). */
export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/);

  return getCatalog()
    .map(entry => {
      let score = 0;
      const searchText = [
        entry.name, entry.nameEs, entry.category,
        entry.gender, entry.description, ...entry.keywords,
      ].join(' ').toLowerCase();

      for (const token of tokens) {
        if (searchText.includes(token)) score++;
        // Exact keyword match gets bonus
        if (entry.keywords.includes(token)) score += 2;
        // Name match gets bonus
        if (entry.name.toLowerCase().includes(token)) score += 2;
        if (entry.nameEs.toLowerCase().includes(token)) score += 2;
      }

      return { entry, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.entry);
}

/** Get catalog entry by ID. */
export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find(e => e.id === id);
}

/** Get entries by category. */
export function getCatalogByCategory(category: GarmentCategory): CatalogEntry[] {
  return getCatalog().filter(e => e.category === category);
}

/** Get entries by gender. */
export function getCatalogByGender(gender: Gender): CatalogEntry[] {
  return getCatalog().filter(e => e.gender === gender || e.gender === 'unisex');
}
