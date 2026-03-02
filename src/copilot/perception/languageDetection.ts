/**
 * Language Detection — simple heuristic-based detection of Spanish vs English.
 *
 * Uses word frequency analysis and common pattern-making terms to determine
 * the user's language preference. Sets preference in project memory.
 *
 * @module languageDetection
 */

/** Supported languages for the agent */
export type AgentLanguage = 'es' | 'en';

/** Spanish indicator words — common pattern-making and general Spanish terms */
const SPANISH_INDICATORS: ReadonlySet<string> = new Set([
  // Pattern-making terms
  'corpiño', 'corpino', 'pinza', 'falda', 'manga', 'cuello', 'costura',
  'margen', 'tela', 'hilo', 'piquete', 'doblez', 'entretela', 'forro',
  'sisa', 'escote', 'cintura', 'cadera', 'busto', 'pecho', 'espalda',
  'delantero', 'trasero', 'costado', 'godets', 'godet', 'evasé', 'evase',
  'pliegue', 'fruncido', 'volante', 'vuelo', 'bajo', 'dobladillo',
  'patrón', 'patron', 'patronaje', 'modista', 'talla', 'medida', 'medidas',
  'gradación', 'gradacion', 'nido', 'anidamiento', 'corte', 'tendido',
  // Common Spanish words
  'hazme', 'quiero', 'necesito', 'agregar', 'agrega', 'crear', 'crea',
  'modificar', 'modifica', 'eliminar', 'elimina', 'mover', 'mueve',
  'cambiar', 'cambia', 'revisar', 'revisa', 'exportar', 'exporta',
  'generar', 'genera', 'transformar', 'transforma', 'convertir', 'convierte',
  'enseñame', 'enséñame', 'explica', 'cómo', 'como', 'qué', 'que',
  'por', 'para', 'con', 'del', 'las', 'los', 'una', 'uno', 'más',
  'menos', 'también', 'pero', 'porque', 'desde', 'hasta', 'esta',
  'este', 'ese', 'esa', 'todo', 'toda', 'todos', 'todas',
  'pantalón', 'pantalon', 'vestido', 'blusa', 'camisa', 'chaqueta',
  'botón', 'boton', 'cremallera', 'bolsillo', 'puño', 'puno',
]);

/** English indicator words — common pattern-making and general English terms */
const ENGLISH_INDICATORS: ReadonlySet<string> = new Set([
  // Pattern-making terms
  'bodice', 'dart', 'skirt', 'sleeve', 'collar', 'seam', 'allowance',
  'fabric', 'grainline', 'notch', 'fold', 'interfacing', 'lining',
  'armscye', 'neckline', 'waist', 'bust', 'back', 'front',
  'godet', 'pleat', 'gather', 'flounce', 'flare', 'hem',
  'pattern', 'draft', 'grade', 'grading', 'nest', 'nesting', 'cut',
  'ease', 'easing',
  // Common English words
  'make', 'create', 'add', 'remove', 'delete', 'move', 'change',
  'modify', 'export', 'generate', 'transform', 'convert', 'show',
  'tell', 'explain', 'how', 'what', 'why', 'the', 'and', 'for',
  'with', 'from', 'this', 'that', 'all', 'can', 'please',
  'trousers', 'pants', 'dress', 'blouse', 'shirt', 'jacket',
  'button', 'zipper', 'pocket', 'cuff',
]);

/**
 * Detect the language of a user message.
 *
 * Uses word-level matching against Spanish and English indicator sets.
 * Returns the language with the higher match count. Defaults to English
 * if the result is ambiguous (tie or no matches).
 *
 * @param message - The user's message text
 * @returns Detected language code ('es' or 'en')
 *
 * @example
 * ```ts
 * detectLanguage('Hazme un corpiño talla 40')  // 'es'
 * detectLanguage('Create a bodice block')       // 'en'
 * ```
 */
export function detectLanguage(message: string): AgentLanguage {
  const words = message
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'()[\]{}]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1);

  let esScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (SPANISH_INDICATORS.has(word)) esScore++;
    if (ENGLISH_INDICATORS.has(word)) enScore++;
  }

  // Check for strong Spanish markers (accented characters, ñ)
  if (/[áéíóúñ¿¡]/i.test(message)) {
    esScore += 2;
  }

  return esScore > enScore ? 'es' : 'en';
}

/**
 * Piece name translations for standard pattern pieces.
 */
const PIECE_NAMES: Record<string, Record<AgentLanguage, string>> = {
  'bodice-front':  { es: 'Delantero Corpiño',  en: 'Front Bodice' },
  'bodice-back':   { es: 'Espalda Corpiño',    en: 'Back Bodice' },
  'sleeve':        { es: 'Manga',              en: 'Sleeve' },
  'skirt-front':   { es: 'Falda Delantero',    en: 'Front Skirt' },
  'skirt-back':    { es: 'Falda Espalda',      en: 'Back Skirt' },
  'pants-front':   { es: 'Pantalón Delantero', en: 'Front Pants' },
  'pants-back':    { es: 'Pantalón Espalda',   en: 'Back Pants' },
  'collar':        { es: 'Cuello',             en: 'Collar' },
};

/**
 * Get the localized name for a standard pattern piece template.
 *
 * @param templateId - Template identifier (e.g. 'bodice-front')
 * @param language - Target language
 * @returns Localized piece name, or the templateId if no translation exists
 */
export function getLocalizedPieceName(templateId: string, language: AgentLanguage): string {
  return PIECE_NAMES[templateId]?.[language] ?? templateId;
}

/**
 * Get localized labels for common pattern-making concepts.
 */
const LABELS: Record<string, Record<AgentLanguage, string>> = {
  'seam-allowance':    { es: 'Margen de costura', en: 'Seam allowance' },
  'grainline':         { es: 'Línea de hilo',     en: 'Grainline' },
  'dart':              { es: 'Pinza',              en: 'Dart' },
  'notch':             { es: 'Piquete',            en: 'Notch' },
  'fold-line':         { es: 'Línea de doblez',    en: 'Fold line' },
  'hem':               { es: 'Dobladillo',         en: 'Hem' },
  'measurements':      { es: 'Medidas',            en: 'Measurements' },
  'bust':              { es: 'Busto',              en: 'Bust' },
  'waist':             { es: 'Cintura',            en: 'Waist' },
  'hips':              { es: 'Cadera',             en: 'Hips' },
  'shoulder':          { es: 'Hombro',             en: 'Shoulder' },
  'arm-length':        { es: 'Largo de manga',     en: 'Arm length' },
  'pieces-created':    { es: 'piezas creadas',     en: 'pieces created' },
  'actions-applied':   { es: 'acciones aplicadas', en: 'actions applied' },
};

/**
 * Get a localized label for a pattern-making concept.
 *
 * @param key - Label key
 * @param language - Target language
 * @returns Localized label string
 */
export function getLabel(key: string, language: AgentLanguage): string {
  return LABELS[key]?.[language] ?? key;
}
