/**
 * Export Vina project as CLO3D .zprj file (ZIP archive).
 */
import { zipSync, strToU8 } from 'fflate';
import { generateDXFAAMA } from '../dxf';
import type { PatternPiece, Seam, Fabric, Avatar } from '../../types/types';

export interface ZprjExportInput {
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  avatar: Avatar;
  projectName: string;
}

export interface ZprjExportConfig {
  projectName: string;
  includeThumbnail?: boolean;
  thumbnailCanvas?: HTMLCanvasElement;
}

export async function exportZprj(
  input: ZprjExportInput,
  config: ZprjExportConfig,
): Promise<Blob> {
  const { pieces, seams, fabrics, avatar } = input;
  const zipFiles: Record<string, Uint8Array> = {};

  // 1. Pattern DXF
  const dxfContent = generateDXFAAMA(pieces);
  zipFiles['pattern/pattern.dxf'] = strToU8(dxfContent);

  // 2. Pattern info JSON
  const patternInfo = {
    pieces: pieces.map(p => ({
      name: p.name,
      grainAngle: p.rotation,
      seamAllowance: p.seamAllowance,
      fabricType: p.fabricId || 'main',
      cutCount: 1,
      mirror: p.mirrored,
    })),
    seams: seams.map(s => {
      const p1 = pieces.find(p => p.id === s.pieceA.pieceId);
      const p2 = pieces.find(p => p.id === s.pieceB.pieceId);
      return {
        piece1: p1?.name || s.pieceA.pieceId,
        edge1: s.pieceA.edgeName,
        piece2: p2?.name || s.pieceB.pieceId,
        edge2: s.pieceB.edgeName,
        type: s.type,
      };
    }),
  };
  zipFiles['pattern/pattern_info.json'] = strToU8(JSON.stringify(patternInfo, null, 2));

  // 3. Avatar info
  const avatarInfo = {
    height: avatar.measurements.height,
    chest: avatar.measurements.chest,
    waist: avatar.measurements.waist,
    hip: avatar.measurements.hips,
    shoulder: avatar.measurements.shoulder,
    armLength: avatar.measurements.armLength,
    inseam: avatar.measurements.inseam,
    unit: 'cm',
  };
  zipFiles['avatar/avatar_info.json'] = strToU8(JSON.stringify(avatarInfo, null, 2));

  // 4. Fabric info (use first fabric)
  if (fabrics.length > 0) {
    const f = fabrics[0];
    const fabricInfo = {
      name: f.name,
      weight: f.weight,
      stretch: f.stretch,
      bendStiffness: f.stiffness,
      density: f.friction,
    };
    zipFiles['fabric/fabric_info.json'] = strToU8(JSON.stringify(fabricInfo, null, 2));
  }

  // 5. Project info
  const projectInfo = {
    name: config.projectName,
    version: '1.0',
    createdAt: new Date().toISOString(),
    software: 'Vina',
  };
  zipFiles['project_info.json'] = strToU8(JSON.stringify(projectInfo, null, 2));

  // 6. Thumbnail
  if (config.includeThumbnail && config.thumbnailCanvas) {
    try {
      const blob = await new Promise<Blob | null>(resolve =>
        config.thumbnailCanvas!.toBlob(resolve, 'image/png')
      );
      if (blob) {
        const buf = await blob.arrayBuffer();
        zipFiles['thumbnail.png'] = new Uint8Array(buf);
      }
    } catch {
      // Skip thumbnail on error
    }
  }

  // 7. Create ZIP
  const zipped = zipSync(zipFiles);
  return new Blob([zipped], { type: 'application/zip' });
}

/** Convenience: export and trigger download */
export async function downloadZprj(
  input: ZprjExportInput,
  config: ZprjExportConfig,
): Promise<void> {
  const blob = await exportZprj(input, config);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.projectName || 'project'}.zprj`;
  a.click();
  URL.revokeObjectURL(url);
}
