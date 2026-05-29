/**
 * DXF import pipeline — the single shared core that turns raw DXF file
 * content into pattern pieces. Pure: parses + converts, does NOT touch
 * Redux. Both the legacy `ActionExecutor` (`import_dxf` case) and the
 * browser drop-zone (`AppShell`) call this so the parse/detect/convert
 * logic lives in exactly one place.
 *
 * Design rationale: see `docs/superpowers/specs/2026-05-29-m3-dxf-agentic-load-design.md`.
 * The browser sandbox forbids the agent from reading files, so file
 * entry is always a user gesture (drop / picker); this module is what
 * that gesture feeds. The agent operates downstream on the loaded pieces.
 *
 * @module dxf/importPipeline
 */

import type { PatternPiece } from '../../types/types';
import type { FormatId, FormatProfile } from './types';
import { parseDXF } from './parser';
import { dxfToPatternPieces } from './converter';
import { detectDXFFormat } from './formatDetector';
import { getProfile } from './formatProfiles';

/**
 * Caller-controlled subset of the converter's options. Explicitly typed
 * (no `any`) so the `tsc -b --noEmit` gate stays clean. Mirrors the
 * shared fields of `DXFImportOptions` in `converter.ts`.
 */
export interface DXFImportOptions {
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  /** Auto-detect the format profile (AAMA/ASTM/Gerber/…). Default true. */
  autoDetect?: boolean;
  /** Force a specific format profile, overriding auto-detect. */
  format?: FormatId;
}

export interface DXFImportResult {
  pieces: PatternPiece[];
  /** Detected (or forced) format profile id, null if none resolved. */
  format: FormatId | null;
  /** Detection confidence (0 when forced or undetected). */
  formatConfidence: number;
}

export type DXFParseErrorCode = 'empty' | 'parse' | 'no-pieces';

/**
 * Thrown when DXF content cannot be turned into pattern pieces. The
 * `code` lets callers render a specific message. `ActionExecutor`'s
 * outer try/catch converts this into a failed `ActionResult`; the
 * drop-zone maps it to a toast.
 */
export class DXFParseError extends Error {
  code: DXFParseErrorCode;
  constructor(code: DXFParseErrorCode, message: string) {
    super(message);
    this.name = 'DXFParseError';
    this.code = code;
  }
}

/**
 * Parse + convert DXF content into pattern pieces.
 *
 * @throws {DXFParseError} `empty` (blank content), `parse` (parser
 *   threw), or `no-pieces` (parsed cleanly but no recognizable geometry).
 */
export function importDXFContent(
  content: string,
  options?: DXFImportOptions,
): DXFImportResult {
  if (!content || content.trim().length === 0) {
    throw new DXFParseError('empty', 'DXF content is empty.');
  }

  let doc;
  try {
    doc = parseDXF(content);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    throw new DXFParseError('parse', `Could not parse DXF: ${detail}`);
  }

  let formatProfile: FormatProfile | undefined;
  let format: FormatId | null = null;
  let formatConfidence = 0;

  if (options?.format) {
    formatProfile = getProfile(options.format);
    format = options.format;
  } else if (options?.autoDetect !== false) {
    const results = detectDXFFormat(doc);
    if (results.length > 0) {
      formatProfile = getProfile(results[0].profileId);
      format = results[0].profileId;
      formatConfidence = results[0].confidence;
    }
  }

  const pieces = dxfToPatternPieces(doc, {
    unit: options?.unit,
    scale: options?.scale,
    formatProfile,
  });

  if (pieces.length === 0) {
    throw new DXFParseError(
      'no-pieces',
      'The DXF parsed but contained no recognizable pattern pieces.',
    );
  }

  return { pieces, format, formatConfidence };
}

/** Drop-zone / attachment byte cap. María's real DXF is ~89 KB; 10 MB is
 *  generous headroom while still guarding against a pathological file
 *  freezing the tab via `File.text()`. */
export const DXF_MAX_BYTES = 10 * 1024 * 1024;

export type DXFFileErrorCode = 'extension' | 'too-large' | 'read';

/** Thrown by {@link readAndParseDXFFile} for problems with the FILE itself
 *  (wrong extension, too big, unreadable) — as opposed to {@link DXFParseError}
 *  which is about the file's CONTENT. UI maps `code` to a localized message. */
export class DXFFileError extends Error {
  code: DXFFileErrorCode;
  constructor(code: DXFFileErrorCode, message: string) {
    super(message);
    this.name = 'DXFFileError';
    this.code = code;
  }
}

/**
 * Validate a dropped/picked File, read its text, and parse it into pieces.
 * The shared front-end of every browser DXF entry surface (canvas drop,
 * File ▸ Import DXF picker, chat attachment). Does NOT dispatch — callers
 * decide what to do with the pieces (import now vs hold as attachment).
 *
 * @throws {DXFFileError} bad extension / too large / unreadable file.
 * @throws {DXFParseError} empty / unparseable / no-pieces content.
 */
export async function readAndParseDXFFile(
  file: File,
  options?: DXFImportOptions,
): Promise<{ name: string; result: DXFImportResult }> {
  if (!file.name.toLowerCase().endsWith('.dxf')) {
    throw new DXFFileError('extension', 'Not a .dxf file.');
  }
  if (file.size > DXF_MAX_BYTES) {
    throw new DXFFileError('too-large', 'File exceeds the size cap.');
  }
  let content: string;
  try {
    content = await file.text();
  } catch {
    throw new DXFFileError('read', 'Could not read the file.');
  }
  const result = importDXFContent(content, options);
  return { name: file.name, result };
}
