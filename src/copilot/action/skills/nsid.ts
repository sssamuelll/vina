/**
 * NSID (Namespace Identifier) — unique skill identification.
 *
 * Format: "author:slug" e.g. "vina:bodice", "sdar:stretch_bodice"
 *
 * Used to prevent namespace collisions when multiple skills have
 * similar triggers. Every skill must have a unique NSID.
 *
 * @module skills/nsid
 */

/** NSID template literal type */
export type NSID = `${string}:${string}`;

/** Parsed NSID components */
export interface ParsedNSID {
  /** Author/namespace identifier */
  author: string;
  /** Skill slug/name */
  slug: string;
  /** Full NSID string */
  full: NSID;
}

/** NSID validation result */
export interface NSIDValidationResult {
  /** Whether the NSID is valid */
  valid: boolean;
  /** Error messages if invalid */
  errors: string[];
}

/**
 * NSID format regex.
 * - Author: alphanumeric, hyphens, underscores (no spaces)
 * - Slug: alphanumeric, hyphens, underscores (no spaces)
 * - Exactly one colon separator
 */
const NSID_REGEX = /^([a-z0-9_-]+):([a-z0-9_-]+)$/i;

/**
 * Check if a string is a valid NSID format.
 *
 * @param value - String to check
 * @returns True if valid NSID format
 *
 * @example
 * isValidNSID('vina:bodice') // true
 * isValidNSID('invalid') // false
 */
export function isValidNSID(value: string): value is NSID {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return NSID_REGEX.test(value);
}

/**
 * Parse an NSID string into its components.
 *
 * @param nsid - NSID string to parse
 * @returns Parsed NSID with author, slug, and full string
 * @throws Error if NSID is invalid
 *
 * @example
 * const { author, slug } = parseNSID('vina:bodice');
 * // author = 'vina', slug = 'bodice'
 */
export function parseNSID(nsid: string): ParsedNSID {
  if (!nsid || typeof nsid !== 'string') {
    throw new Error('Invalid NSID: must be a non-empty string');
  }

  const match = nsid.match(NSID_REGEX);
  if (!match) {
    throw new Error(`Invalid NSID format: "${nsid}". Expected "author:slug" with alphanumeric characters, hyphens, or underscores.`);
  }

  return {
    author: match[1],
    slug: match[2],
    full: nsid as NSID,
  };
}

/**
 * Create an NSID from author and slug components.
 *
 * @param author - Author/namespace identifier
 * @param slug - Skill slug/name
 * @returns Combined NSID
 * @throws Error if author or slug is invalid
 *
 * @example
 * const nsid = createNSID('vina', 'bodice');
 * // nsid = 'vina:bodice'
 */
export function createNSID(author: string, slug: string): NSID {
  if (!author || typeof author !== 'string' || !author.trim()) {
    throw new Error('NSID author cannot be empty');
  }
  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    throw new Error('NSID slug cannot be empty');
  }

  const nsid = `${author}:${slug}`;

  if (!isValidNSID(nsid)) {
    throw new Error(
      `Invalid NSID components: author="${author}", slug="${slug}". ` +
      'Both must contain only alphanumeric characters, hyphens, or underscores.'
    );
  }

  return nsid as NSID;
}

/**
 * Validate an NSID and return detailed results.
 *
 * Unlike `isValidNSID()`, this returns specific error messages
 * to help users fix invalid NSIDs.
 *
 * @param nsid - NSID string to validate
 * @returns Validation result with errors array
 *
 * @example
 * const result = validateNSID(':bodice');
 * // result.valid = false
 * // result.errors = ['NSID author (before colon) cannot be empty']
 */
export function validateNSID(nsid: string): NSIDValidationResult {
  const errors: string[] = [];

  // Check for non-empty string
  if (!nsid || typeof nsid !== 'string') {
    errors.push('NSID must be a non-empty string');
    return { valid: false, errors };
  }

  // Check for colon
  if (!nsid.includes(':')) {
    errors.push('NSID must contain a colon separator (format: "author:slug")');
    return { valid: false, errors };
  }

  // Check for exactly one colon
  const colonCount = (nsid.match(/:/g) || []).length;
  if (colonCount !== 1) {
    errors.push('NSID must have exactly one colon (format: "author:slug")');
    return { valid: false, errors };
  }

  // Split and validate parts
  const [author, slug] = nsid.split(':');

  if (!author) {
    errors.push('NSID author (before colon) cannot be empty');
  }

  if (!slug) {
    errors.push('NSID slug (after colon) cannot be empty');
  }

  // Check character validity
  if (author && !/^[a-z0-9_-]+$/i.test(author)) {
    errors.push('NSID author must contain only alphanumeric characters, hyphens, or underscores');
  }

  if (slug && !/^[a-z0-9_-]+$/i.test(slug)) {
    errors.push('NSID slug must contain only alphanumeric characters, hyphens, or underscores');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Alias de lectura para NSIDs persistidos antes del rename a Vina (2026-08-01).
 * Solo remapea el autor; el slug queda igual. Aplicar en TODO punto de lectura
 * de NSIDs persistidos (skillPersistence: preferencias + instalados).
 */
export function normalizeLegacyNSID(nsid: string): string {
  if (nsid.startsWith('openclo:')) return `vina:${nsid.slice('openclo:'.length)}`;
  if (nsid.startsWith('openclo-community:')) return `vina-community:${nsid.slice('openclo-community:'.length)}`;
  return nsid;
}

/**
 * Inverse of normalizeLegacyNSID — maps a canonical NSID back to the legacy
 * form it may still be stored under. Needed because `cloneDb` (renameMigration.ts)
 * copies the IDB `skills` store verbatim: its keyPath is `nsid`, so records
 * cloned from the old `openclo_skills_v1` DB keep `openclo:*` record keys even
 * though `getAllSkills()` normalizes them on read. A lookup by the canonical
 * key (`getSkill('vina:x')`) then misses the legacy-keyed record — this is the
 * fallback `skillPersistence.getSkill` tries when the canonical key isn't
 * found (IMPORTANT #4, 2026-08-01 final review).
 */
export function denormalizeToLegacyNSID(nsid: string): string | null {
  if (nsid.startsWith('vina-community:')) return `openclo-community:${nsid.slice('vina-community:'.length)}`;
  if (nsid.startsWith('vina:')) return `openclo:${nsid.slice('vina:'.length)}`;
  return null;
}
