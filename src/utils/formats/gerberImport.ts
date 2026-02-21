/**
 * Import Gerber AccuMark ZIP packages.
 *
 * Supports:
 * - Multiple DXF files in any directory structure
 * - Optional manifest.txt (tab-separated: piece_name, size, fabric_type)
 * - Single DXF with multiple BLOCKs (split into individual pieces)
 * - Ignores proprietary .rul / .mrk files
 */
import { unzipSync, strFromU8 } from 'fflate';
import { parseDXF, dxfToPatternPieces } from '../dxf';
import type { PatternPiece } from '../../types/types';

export interface GerberManifestEntry {
  pieceName: string;
  size?: string;
  fabricType?: string;
}

export interface GerberImportResult {
  pieces: PatternPiece[];
  warnings: string[];
  manifest?: GerberManifestEntry[];
}

/** Parse manifest.txt — tab-separated: piece_name, size, fabric_type. # = comment. */
export function parseManifest(text: string): GerberManifestEntry[] {
  const entries: GerberManifestEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length === 0 || !parts[0].trim()) continue;
    entries.push({
      pieceName: parts[0].trim(),
      size: parts[1]?.trim() || undefined,
      fabricType: parts[2]?.trim() || undefined,
    });
  }
  return entries;
}

export async function importGerber(file: File | ArrayBuffer): Promise<GerberImportResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const files = unzipSync(new Uint8Array(buffer));
  const warnings: string[] = [];
  const pieces: PatternPiece[] = [];

  // Categorise files
  const dxfFiles: { path: string; data: Uint8Array }[] = [];
  let manifestData: Uint8Array | undefined;

  for (const [path, data] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.dxf') && data.length > 0) {
      dxfFiles.push({ path, data });
    } else if (lower.endsWith('manifest.txt') && data.length > 0) {
      manifestData = data;
    } else if (lower.endsWith('.rul') || lower.endsWith('.mrk')) {
      warnings.push(`Ignored proprietary file: ${path}`);
    }
  }

  if (dxfFiles.length === 0) {
    throw new Error('No DXF files found in Gerber AccuMark archive');
  }

  // Parse manifest if present
  let manifest: GerberManifestEntry[] | undefined;
  if (manifestData) {
    manifest = parseManifest(strFromU8(manifestData));
  }

  // Parse each DXF
  for (const { path, data } of dxfFiles) {
    try {
      const doc = parseDXF(strFromU8(data));
      const parsed = dxfToPatternPieces(doc);

      if (parsed.length === 0) {
        warnings.push(`No pieces extracted from ${path}`);
        continue;
      }

      // If single-piece DXF and name is generic, derive from filename
      if (parsed.length === 1 && parsed[0].name === 'Imported Piece') {
        const basename = path.split('/').pop()?.replace(/\.dxf$/i, '') ?? 'Piece';
        parsed[0].name = basename;
      }

      pieces.push(...parsed);
    } catch (err) {
      warnings.push(`Failed to parse ${path}: ${(err as Error).message}`);
    }
  }

  // Match manifest entries to pieces by name
  if (manifest) {
    for (const entry of manifest) {
      const piece = pieces.find(
        p => p.name.toLowerCase() === entry.pieceName.toLowerCase(),
      );
      if (piece && entry.fabricType) {
        // Store fabric type hint as fabricId
        (piece as any).fabricId = entry.fabricType;
      }
    }
  }

  return { pieces, warnings, manifest };
}
