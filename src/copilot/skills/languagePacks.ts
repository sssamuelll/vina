/**
 * Language Packs — multi-language support for pattern-making skills.
 *
 * Provides a system for localizing skill content (descriptions,
 * construction steps, teaching material) into multiple languages.
 * Default packs: Spanish (es) and English (en).
 *
 * @module skills/languagePacks
 */

import type { PatternSkill, ConstructionStep, Formula, DraftingMethod } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Supported language codes.
 */
export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt';

/** All supported language codes */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'en', 'es', 'fr', 'de', 'it', 'pt',
] as const;

/** Default fallback language */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * A set of translations for a single skill.
 *
 * Each key corresponds to a translatable field in the skill.
 * Keys use dot notation for nested fields:
 * - `description` — skill description
 * - `method.{methodName}.description` — drafting method description
 * - `formula.{formulaName}.name` — formula display name
 * - `formula.{formulaName}.description` — formula description
 * - `step.{order}` — construction step instruction text
 */
export interface SkillTranslations {
  [key: string]: string;
}

/**
 * A language pack containing translations for one or more skills.
 */
export interface LanguagePack {
  /** Language code */
  language: SupportedLanguage;
  /** Display name of the language (in that language) */
  languageName: string;
  /** Translations keyed by skill name, then by translation key */
  skills: Record<string, SkillTranslations>;
}

// ─── Built-in Language Packs ────────────────────────────────────────────────

/**
 * English language pack for core skills.
 */
export const englishPack: LanguagePack = {
  language: 'en',
  languageName: 'English',
  skills: {
    bodice: {
      'description': 'Bodice block construction — drafting front and back bodice pieces from body measurements with darts, shoulder slope, and neckline shaping.',
      'method.Aldrich.description': 'Winifred Aldrich method — systematic block construction using chest, waist, and bust measurements with standard ease distribution.',
      'method.Müller.description': 'Müller & Sohn method — German precision drafting with detailed proportional calculations.',
      'formula.chestWidth.name': 'Chest Width',
      'formula.chestWidth.description': 'Quarter chest plus ease for bodice width',
      'step.1': 'Draw the center back line vertically',
      'step.2': 'Mark the nape-to-waist length along center back',
      'step.3': 'Construct the back shoulder and armhole',
      'step.4': 'Draft the front bodice with bust dart',
    },
    sleeve: {
      'description': 'Sleeve drafting — creating one-piece and two-piece sleeves fitted to the bodice armscye.',
      'step.1': 'Measure the armscye circumference from the bodice',
      'step.2': 'Draw the sleeve cap height',
      'step.3': 'Shape the sleeve cap curve',
      'step.4': 'Complete the underarm seam',
    },
    skirt: {
      'description': 'Skirt block construction — from basic straight skirt to A-line and circular variations.',
      'step.1': 'Draw the center front line',
      'step.2': 'Mark the waist and hip lines',
      'step.3': 'Calculate and place darts',
      'step.4': 'Shape the hemline',
    },
    collar: {
      'description': 'Collar drafting — flat, standing, and rolled collar constructions.',
      'step.1': 'Measure the neckline from the bodice',
      'step.2': 'Draw the collar stand',
      'step.3': 'Shape the collar fall',
    },
    grading: {
      'description': 'Pattern grading — scaling pattern pieces across a size range while maintaining proportions.',
      'step.1': 'Identify grade points on the pattern',
      'step.2': 'Apply grade rules per measurement',
      'step.3': 'Verify graded nest for smooth transitions',
    },
  },
};

/**
 * Spanish language pack for core skills.
 */
export const spanishPack: LanguagePack = {
  language: 'es',
  languageName: 'Español',
  skills: {
    bodice: {
      'description': 'Construcción del corpiño base — trazado de delantero y espalda a partir de medidas corporales con pinzas, inclinación de hombro y escote.',
      'method.Aldrich.description': 'Método Winifred Aldrich — construcción sistemática del bloque usando medidas de pecho, cintura y busto con distribución estándar de holgura.',
      'method.Müller.description': 'Método Müller & Sohn — trazado de precisión alemán con cálculos proporcionales detallados.',
      'formula.chestWidth.name': 'Ancho de pecho',
      'formula.chestWidth.description': 'Cuarto de contorno de pecho más holgura para el ancho del corpiño',
      'step.1': 'Trazar la línea de centro espalda verticalmente',
      'step.2': 'Marcar el largo de nuca a cintura sobre el centro espalda',
      'step.3': 'Construir el hombro y la sisa de la espalda',
      'step.4': 'Trazar el delantero con la pinza de busto',
    },
    sleeve: {
      'description': 'Trazado de manga — creación de mangas de una y dos piezas ajustadas a la sisa del corpiño.',
      'step.1': 'Medir el contorno de sisa del corpiño',
      'step.2': 'Dibujar la altura de copa de manga',
      'step.3': 'Dar forma a la curva de copa',
      'step.4': 'Completar la costura de debajo del brazo',
    },
    skirt: {
      'description': 'Construcción de falda base — desde falda recta básica hasta variaciones en A y circular.',
      'step.1': 'Trazar la línea de centro delantero',
      'step.2': 'Marcar las líneas de cintura y cadera',
      'step.3': 'Calcular y colocar pinzas',
      'step.4': 'Dar forma al bajo',
    },
    collar: {
      'description': 'Trazado de cuello — construcciones de cuello plano, de pie y enrollado.',
      'step.1': 'Medir el escote del corpiño',
      'step.2': 'Dibujar el pie de cuello',
      'step.3': 'Dar forma a la caída del cuello',
    },
    grading: {
      'description': 'Escalado de patrones — ajuste de piezas a través de un rango de tallas manteniendo las proporciones.',
      'step.1': 'Identificar los puntos de escalado en el patrón',
      'step.2': 'Aplicar reglas de escalado por medida',
      'step.3': 'Verificar el nido escalado para transiciones suaves',
    },
  },
};

// ─── Language Pack Registry ─────────────────────────────────────────────────

/** All registered language packs, keyed by language code */
const languagePacks: Map<SupportedLanguage, LanguagePack> = new Map([
  ['en', englishPack],
  ['es', spanishPack],
]);

/**
 * Register a language pack.
 *
 * @param pack - The language pack to register
 */
export function registerLanguagePack(pack: LanguagePack): void {
  languagePacks.set(pack.language, pack);
}

/**
 * Get a registered language pack by language code.
 *
 * @param language - Language code
 * @returns The language pack, or undefined
 */
export function getLanguagePack(language: SupportedLanguage): LanguagePack | undefined {
  return languagePacks.get(language);
}

/**
 * List all registered language codes.
 *
 * @returns Array of registered language codes
 */
export function listAvailableLanguages(): SupportedLanguage[] {
  return Array.from(languagePacks.keys());
}

// ─── Localization ───────────────────────────────────────────────────────────

/**
 * Get a translation for a specific key within a skill.
 *
 * Falls back to DEFAULT_LANGUAGE if the requested language doesn't have
 * the key, or returns the key itself as a final fallback.
 *
 * @param skillName - The skill name (e.g. 'bodice')
 * @param key - The translation key (e.g. 'description', 'step.1')
 * @param language - Target language code
 * @returns The translated string
 */
export function getTranslation(
  skillName: string,
  key: string,
  language: SupportedLanguage,
): string {
  // Try requested language
  const pack = languagePacks.get(language);
  if (pack?.skills[skillName]?.[key]) {
    return pack.skills[skillName][key];
  }

  // Fall back to default language
  if (language !== DEFAULT_LANGUAGE) {
    const fallback = languagePacks.get(DEFAULT_LANGUAGE);
    if (fallback?.skills[skillName]?.[key]) {
      return fallback.skills[skillName][key];
    }
  }

  // Final fallback: return the key
  return key;
}

/**
 * Create a localized copy of a PatternSkill.
 *
 * Replaces the skill's description and construction step instructions
 * with translations from the specified language pack. Falls back to
 * the original content if translations are missing.
 *
 * @param skill - The source pattern skill
 * @param language - Target language code
 * @returns A new PatternSkill with localized content
 */
export function getLocalizedSkill(skill: PatternSkill, language: SupportedLanguage): PatternSkill {
  const pack = languagePacks.get(language);

  // If no pack exists for this language, fall back to default or return as-is
  if (!pack?.skills[skill.name]) {
    if (language !== DEFAULT_LANGUAGE) {
      return getLocalizedSkill(skill, DEFAULT_LANGUAGE);
    }
    return skill;
  }

  const translations = pack.skills[skill.name];

  // Localize description
  const description = translations['description'] ?? skill.description;

  // Localize drafting methods
  const methods: DraftingMethod[] = skill.methods.map(m => ({
    ...m,
    description: translations[`method.${m.name}.description`] ?? m.description,
  }));

  // Localize formulas
  const formulas: Record<string, Formula> = {};
  for (const [key, formula] of Object.entries(skill.formulas)) {
    formulas[key] = {
      ...formula,
      name: translations[`formula.${key}.name`] ?? formula.name,
      description: translations[`formula.${key}.description`] ?? formula.description,
    };
  }

  // Localize construction steps
  const constructionSteps: ConstructionStep[] = skill.constructionSteps.map(step => ({
    ...step,
    instruction: translations[`step.${step.order}`] ?? step.instruction,
  }));

  return {
    ...skill,
    description,
    methods,
    formulas,
    constructionSteps,
  };
}

/**
 * Check if translations are available for a skill in a given language.
 *
 * @param skillName - The skill name
 * @param language - Language code
 * @returns true if any translations exist
 */
export function hasTranslations(skillName: string, language: SupportedLanguage): boolean {
  const pack = languagePacks.get(language);
  return !!pack?.skills[skillName] && Object.keys(pack.skills[skillName]).length > 0;
}

/**
 * Get the list of missing translation keys for a skill in a given language.
 *
 * Compares against the English (default) pack to find untranslated keys.
 *
 * @param skillName - The skill name
 * @param language - Language code to check
 * @returns Array of missing key strings
 */
export function getMissingTranslations(skillName: string, language: SupportedLanguage): string[] {
  const enPack = languagePacks.get('en');
  const targetPack = languagePacks.get(language);

  if (!enPack?.skills[skillName]) return [];

  const enKeys = Object.keys(enPack.skills[skillName]);
  if (!targetPack?.skills[skillName]) return enKeys;

  const targetKeys = new Set(Object.keys(targetPack.skills[skillName]));
  return enKeys.filter(k => !targetKeys.has(k));
}

/**
 * Reset language packs to defaults (for testing).
 */
export function resetLanguagePacks(): void {
  languagePacks.clear();
  languagePacks.set('en', englishPack);
  languagePacks.set('es', spanishPack);
}
