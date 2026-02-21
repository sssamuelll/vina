/**
 * Import CLO3D .zprj files (ZIP archives containing DXF patterns, metadata, avatar, fabric info).
 */
import { unzipSync, strFromU8 } from 'fflate';
import { parseDXF, dxfToPatternPieces } from '../dxf';
import type { PatternPiece, Seam, BodyMeasurements, Fabric } from '../../types/types';

export interface ZprjImportResult {
  pieces: PatternPiece[];
  seams: Seam[];
  avatar?: {
    modelUrl?: string;
    measurements?: Partial<BodyMeasurements>;
  };
  fabric?: Partial<Fabric>;
  projectName?: string;
  thumbnail?: Blob;
}

/** Find a file in the ZIP by path suffix (case-insensitive) */
function findFile(files: Record<string, Uint8Array>, ...candidates: string[]): Uint8Array | undefined {
  const keys = Object.keys(files);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const key = keys.find(k => k.toLowerCase().endsWith(lower));
    if (key && files[key].length > 0) return files[key];
  }
  return undefined;
}

/** Find any file matching extension */
function findByExt(files: Record<string, Uint8Array>, ext: string): Uint8Array | undefined {
  const keys = Object.keys(files);
  const key = keys.find(k => k.toLowerCase().endsWith(ext) && files[k].length > 0);
  return key ? files[key] : undefined;
}

function safeJsonParse(data: Uint8Array): any {
  try {
    return JSON.parse(strFromU8(data));
  } catch {
    return null;
  }
}

export async function importZprj(file: File | ArrayBuffer): Promise<ZprjImportResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const data = new Uint8Array(buffer);
  const files = unzipSync(data);

  // 1. Find and parse DXF
  const dxfData = findFile(files, 'pattern/pattern.dxf') ?? findByExt(files, '.dxf');
  if (!dxfData) {
    throw new Error('No DXF pattern file found in .zprj archive');
  }
  const dxfText = strFromU8(dxfData);
  const doc = parseDXF(dxfText);
  let pieces = dxfToPatternPieces(doc);
  const seams: Seam[] = [];

  // 2. Pattern info metadata
  const patternInfoData = findFile(files, 'pattern/pattern_info.json', 'pattern_info.json');
  if (patternInfoData) {
    const info = safeJsonParse(patternInfoData);
    if (info) {
      // Enrich pieces with metadata
      if (Array.isArray(info.pieces)) {
        for (const meta of info.pieces) {
          const piece = pieces.find(p =>
            p.name.toLowerCase() === (meta.name || '').toLowerCase()
          );
          if (piece) {
            if (meta.seamAllowance != null) piece.seamAllowance = meta.seamAllowance;
            if (meta.mirror != null) piece.mirrored = meta.mirror;
          }
        }
      }
      // Extract seams
      if (Array.isArray(info.seams)) {
        for (const s of info.seams) {
          const pieceA = pieces.find(p => p.name.toLowerCase() === (s.piece1 || '').toLowerCase());
          const pieceB = pieces.find(p => p.name.toLowerCase() === (s.piece2 || '').toLowerCase());
          if (pieceA && pieceB) {
            const edge1 = Array.isArray(s.edge1) ? s.edge1 : [0, 0];
            const edge2 = Array.isArray(s.edge2) ? s.edge2 : [0, 0];
            seams.push({
              id: `seam-${seams.length}`,
              pieceA: { pieceId: pieceA.id, edgeStart: edge1[0], edgeEnd: edge1[1] },
              pieceB: { pieceId: pieceB.id, edgeStart: edge2[0], edgeEnd: edge2[1] },
              type: (s.type === 'french' || s.type === 'flat-felled' || s.type === 'overlock') ? s.type : 'standard',
            });
          }
        }
      }
    }
  }

  // 3. Avatar
  let avatar: ZprjImportResult['avatar'];
  const avatarInfoData = findFile(files, 'avatar/avatar_info.json', 'avatar_info.json');
  const avatarObjData = findFile(files, 'avatar/avatar.obj');

  if (avatarInfoData || avatarObjData) {
    avatar = {};
    if (avatarInfoData) {
      const info = safeJsonParse(avatarInfoData);
      if (info) {
        const m: Partial<BodyMeasurements> = {};
        if (info.height != null) m.height = info.height;
        if (info.chest != null) m.chest = info.chest;
        if (info.waist != null) m.waist = info.waist;
        if (info.hip != null || info.hips != null) m.hips = info.hip ?? info.hips;
        if (info.shoulder != null) m.shoulder = info.shoulder;
        if (info.armLength != null) m.armLength = info.armLength;
        if (info.inseam != null) m.inseam = info.inseam;
        avatar.measurements = m;
      }
    }
    if (avatarObjData) {
      const blob = new Blob([avatarObjData], { type: 'model/obj' });
      avatar.modelUrl = URL.createObjectURL(blob);
    }
  }

  // 4. Fabric
  let fabric: Partial<Fabric> | undefined;
  const fabricInfoData = findFile(files, 'fabric/fabric_info.json', 'fabric_info.json');
  if (fabricInfoData) {
    const info = safeJsonParse(fabricInfoData);
    if (info) {
      fabric = {
        id: 'imported-fabric',
        name: info.name || 'Imported Fabric',
        color: '#e8e4df',
        weight: info.weight ?? 150,
        stretch: info.stretch ?? 0.05,
        stiffness: info.bendStiffness ?? info.stiffness ?? 0.4,
        friction: info.density ?? 0.5,
      };
    }
  }

  // 5. Project name
  let projectName: string | undefined;
  const projectInfoData = findFile(files, 'project_info.json');
  if (projectInfoData) {
    const info = safeJsonParse(projectInfoData);
    if (info?.name) projectName = info.name;
  }

  // 6. Thumbnail
  let thumbnail: Blob | undefined;
  const thumbnailData = findFile(files, 'thumbnail.png');
  if (thumbnailData) {
    thumbnail = new Blob([thumbnailData], { type: 'image/png' });
  }

  return { pieces, seams, avatar, fabric, projectName, thumbnail };
}
