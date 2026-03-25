/**
 * Central name sanitization for piece, seam, and point names.
 *
 * Enforces length limits and strips dangerous characters at the validation
 * layer. Export-specific escaping functions handle format-level injection
 * (PDF, DXF) at the output boundary.
 *
 * @module sanitizeName
 */

// ─── Constants ─────────────────────────────────────────────────────────────

export const MAX_NAME_LENGTH = 100;

/**
 * Control characters (C0 + C1) and a handful of characters that are
 * problematic across export formats. We allow printable Unicode
 * (accented letters, CJK, etc.) but strip:
 *  - ASCII control chars (\x00-\x1F, \x7F)
 *  - C1 control chars (\x80-\x9F)
 *  - Null and zero-width chars (\uFEFF, \u200B-\u200F, \u2028-\u2029)
 */
const CONTROL_AND_UNSAFE_RE =
  // eslint-disable-next-line no-control-regex
  /[\x00-\x1F\x7F\x80-\x9F\uFEFF\u200B-\u200F\u2028\u2029]/g;

// ─── Sanitize ──────────────────────────────────────────────────────────────

/**
 * Sanitize a user-provided name:
 * 1. Strip control/zero-width characters
 * 2. Trim whitespace
 * 3. Truncate to MAX_NAME_LENGTH
 *
 * Returns the cleaned string. Does NOT reject empty — use `validateName`
 * for that.
 */
export function sanitizeName(raw: string): string {
  return raw
    .replace(CONTROL_AND_UNSAFE_RE, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

// ─── Validate ──────────────────────────────────────────────────────────────

export interface NameValidation {
  valid: boolean;
  sanitized: string;
  errors: string[];
}

/**
 * Validate AND sanitize a name. Returns the cleaned value plus any errors.
 * Callers should use `result.sanitized` as the final name.
 */
export function validateName(raw: string): NameValidation {
  const sanitized = sanitizeName(raw);
  const errors: string[] = [];

  if (sanitized.length === 0) {
    errors.push('Name cannot be empty');
  }

  return { valid: errors.length === 0, sanitized, errors };
}

// ─── Export-Specific Escaping ──────────────────────────────────────────────

/**
 * Escape a string for embedding in a PDF content stream text operator.
 * PDF literal strings are delimited by parentheses — unescaped parens or
 * backslashes break the stream.
 */
export function escapePdfString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Escape a string for use in a DXF TEXT entity value (group code 1).
 * DXF MTEXT entities interpret backslash sequences (\\P = newline, etc.)
 * but plain TEXT entities do not. We escape backslashes and strip newlines
 * defensively so the output is safe for both TEXT and MTEXT contexts.
 */
export function escapeDxfString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}
