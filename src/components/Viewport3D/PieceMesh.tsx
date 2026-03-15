import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, PathCommand, PieceCategory } from '../../types/types';

/**
 * Convert a pattern piece's outline (PathCommand[]) into a Three.js Shape
 * for rendering as a flat mesh in the 3D viewport.
 *
 * Scale: 1 SVG unit = 1mm in pattern space → 0.001m in Three.js
 */
const SCALE = 0.001; // 1 SVG unit = 1mm = 0.001m

// ─── Color-coding by body region (CLO3D-style) ─────────────────────────────

const CATEGORY_COLORS: Record<PieceCategory | 'default', string> = {
  bodice: '#4a7fbb',    // blue
  sleeve: '#5a9e6f',    // green
  collar: '#c9b84e',    // yellow
  skirt: '#8e6aad',     // purple
  trouser: '#7a8fb5',   // slate blue
  waistband: '#b5886a', // warm brown
  facing: '#7abbb5',    // teal
  lining: '#b57a9e',    // rose
  pocket: '#8a9e6f',    // olive
  cuff: '#6a8aad',      // steel blue
  hood: '#ad6a6a',      // brick
  yoke: '#9e8a6f',      // tan
  other: '#a0a0a0',     // gray
  default: '#a0a0a0',
};

function getCategoryColor(category?: PieceCategory): string {
  return CATEGORY_COLORS[category || 'default'];
}

// ─── Shape builder ──────────────────────────────────────────────────────────

function commandsToShape(commands: PathCommand[]): THREE.Shape | null {
  if (commands.length === 0) return null;

  const shape = new THREE.Shape();
  let cx = 0, cy = 0;

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        shape.moveTo(v[0] * SCALE, -v[1] * SCALE);
        cx = v[0]; cy = v[1];
        break;
      case 'L':
        shape.lineTo(v[0] * SCALE, -v[1] * SCALE);
        cx = v[0]; cy = v[1];
        break;
      case 'H':
        shape.lineTo(v[0] * SCALE, -cy * SCALE);
        cx = v[0];
        break;
      case 'V':
        shape.lineTo(cx * SCALE, -v[0] * SCALE);
        cy = v[0];
        break;
      case 'C':
        shape.bezierCurveTo(
          v[0] * SCALE, -v[1] * SCALE,
          v[2] * SCALE, -v[3] * SCALE,
          v[4] * SCALE, -v[5] * SCALE,
        );
        cx = v[4]; cy = v[5];
        break;
      case 'Q':
        shape.quadraticCurveTo(
          v[0] * SCALE, -v[1] * SCALE,
          v[2] * SCALE, -v[3] * SCALE,
        );
        cx = v[2]; cy = v[3];
        break;
      case 'Z':
        shape.closePath();
        break;
    }
  }

  return shape;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface PieceMeshProps {
  piece: PatternPiece;
  isSelected: boolean;
  color: string;
  position: [number, number, number];
  /** Placement rotation from garmentPlacement (Euler XYZ radians) */
  placementRotation?: [number, number, number];
  showLabel?: boolean;
  /** Fabric material for visual rendering */
  fabricColor?: string;
  fabricRoughness?: number;
}

export default function PieceMesh({ piece, isSelected, position, placementRotation, showLabel = false, fabricColor, fabricRoughness }: PieceMeshProps) {
  const surfaceMode = useSelector((s: RootState) => s.simulation.surfaceMode3D);
  const geometry = useMemo(() => {
    const shape = commandsToShape(piece.outline);
    if (!shape) return null;
    const geo = new THREE.ShapeGeometry(shape, 32);

    // Rotate geometry to XZ plane to match CDT mesher output
    // CDT mesher: X = pattern X, Y = 0, Z = pattern Y
    // ShapeGeometry default: X = pattern X, Y = pattern -Y, Z = 0
    // Rotate +90° around X to convert: Y → Z, Z → -Y
    geo.rotateX(Math.PI / 2);

    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
    }
    return geo;
  }, [piece.outline]);

  // Rotation now uses same system as CDT mesher (XZ plane geometry)
  const finalRotation = useMemo((): [number, number, number] => {
    if (placementRotation) {
      return [
        placementRotation[0],
        placementRotation[1] - (piece.rotation ?? 0) * Math.PI / 180,
        placementRotation[2],
      ];
    }
    // Fallback: just piece rotation around Y
    return [0, -(piece.rotation ?? 0) * Math.PI / 180, 0];
  }, [placementRotation, piece.rotation]);

  // Color priority: selected=gold > fabric > category
  const meshColor = isSelected ? '#ffd700' : (fabricColor || getCategoryColor(piece.category));
  const roughness = fabricRoughness ?? 0.7;
  if (!geometry) return null;

  const solidOpacity = surfaceMode === 'translucent'
    ? (isSelected ? 0.4 : 0.2)
    : surfaceMode === 'textured'
    ? 1.0
    : surfaceMode === 'thick'
    ? (isSelected ? 0.95 : 0.85)
    : (isSelected ? 0.85 : 0.6);

  const showSolid = surfaceMode !== 'mesh';
  const showWireframe = surfaceMode === 'mesh';

  return (
    <group position={position} rotation={finalRotation}>
      {/* Main face */}
      {showSolid && (
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color={meshColor}
            side={THREE.DoubleSide}
            transparent={solidOpacity < 1}
            opacity={solidOpacity}
            roughness={roughness}
            metalness={0}
          />
        </mesh>
      )}
      {/* Wireframe outline */}
      {showWireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={meshColor}
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
      {/* Floating piece name label */}
      {showLabel && (
        <Html
          position={[0, 0.02, 0]}
          center
          distanceFactor={2}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            fontSize: '10px',
            fontFamily: "'Inter', sans-serif",
            color: isSelected ? '#ffd700' : '#555',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            fontWeight: isSelected ? 600 : 400,
          }}
        >
          {piece.name}
        </Html>
      )}
    </group>
  );
}
