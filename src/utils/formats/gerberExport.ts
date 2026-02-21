/**
 * Export OpenClo project as Gerber AccuMark ZIP package.
 *
 * Structure:
 *   pieces/PIECE_NAME.dxf   — individual AAMA DXF per piece
 *   manifest.txt            — tab-separated piece list
 */
import { zipSync, strToU8 } from 'fflate';
import { generateDXFAAMA } from '../dxf';
import type { PatternPiece, Seam } from '../../types/types';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
}

export async function exportGerber(
  pieces: PatternPiece[],
  _seams: Seam[],
  projectName: string,
): Promise<Blob> {
  const zipFiles: Record<string, Uint8Array> = {};

  // Generate individual DXF per piece
  for (const piece of pieces) {
    const dxf = generateDXFAAMA([piece]);
    const filename = `pieces/${sanitizeFilename(piece.name)}.dxf`;
    zipFiles[filename] = strToU8(dxf);
  }

  // Build manifest.txt
  const manifestLines = [
    `# AccuMark Manifest — ${projectName}`,
    `# piece_name\tsize\tfabric_type`,
    ...pieces.map(p => {
      const fabricType = (p as any).fabricId || 'MAIN';
      return `${p.name}\t\t${fabricType}`;
    }),
  ];
  zipFiles['manifest.txt'] = strToU8(manifestLines.join('\n') + '\n');

  const zipped = zipSync(zipFiles);
  return new Blob([zipped], { type: 'application/zip' });
}

/** Convenience: export and trigger download */
export async function downloadGerber(
  pieces: PatternPiece[],
  seams: Seam[],
  projectName: string,
): Promise<void> {
  const blob = await exportGerber(pieces, seams, projectName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName || 'accumark-export'}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
