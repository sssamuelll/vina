import { useMemo } from 'react';
import * as THREE from 'three';
import { PatternPiece, PathCommand } from '../../types/types';

/**
 * Convert a pattern piece's outline (PathCommand[]) into a Three.js Shape
 * for rendering as a flat mesh in the 3D viewport.
 * 
 * Scale: 1 SVG unit = 1mm in pattern space → 0.001m in Three.js
 */
const SCALE = 0.001; // 1 SVG unit = 1mm = 0.001m

function commandsToShape(commands: PathCommand[]): THREE.Shape | null {
  if (commands.length === 0) return null;

  const shape = new THREE.Shape();
  let cx = 0, cy = 0; // current point

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        shape.moveTo(v[0] * SCALE, -v[1] * SCALE); // flip Y
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

interface PieceMeshProps {
  piece: PatternPiece;
  isSelected: boolean;
  color: string;
  position: [number, number, number];
}

export default function PieceMesh({ piece, isSelected, color, position }: PieceMeshProps) {
  const geometry = useMemo(() => {
    const shape = commandsToShape(piece.outline);
    if (!shape) return null;
    const geo = new THREE.ShapeGeometry(shape, 32);
    geo.computeBoundingBox();
    // Center the geometry
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, 0);
    }
    return geo;
  }, [piece.outline]);

  if (!geometry) return null;

  return (
    <group position={position} rotation={[0, -(piece.rotation ?? 0) * Math.PI / 180, 0]}>
      {/* Front face — pieces are drawn in XY, already vertical */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={isSelected ? '#ffd700' : color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.85}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
      {/* Wireframe outline */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={isSelected ? '#ffd700' : '#4a9eff'}
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}
