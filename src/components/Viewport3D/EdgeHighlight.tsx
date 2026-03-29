/**
 * EdgeHighlight — R3F component that renders a bright colored line along
 * a SemanticEdge on a piece mesh in the 3D viewport.
 *
 * Uses THREE.Line via `<primitive>` to avoid JSX type conflict with SVG `<line>`.
 * linewidth is always 1px due to platform limitations, but bright colors
 * (green/orange/red) on dark garment meshes provide sufficient contrast.
 *
 * Color changes update the material in-place (no geometry recreation).
 */

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PathCommand, SemanticEdge } from '../../types/types';
import { outlineToLocal3D } from '../../utils/3d/edgePicker';

interface EdgeHighlightProps {
  outline: PathCommand[];
  edge: SemanticEdge;
  color: string;
}

export default function EdgeHighlight({ outline, edge, color }: EdgeHighlightProps) {
  const matRef = useRef<THREE.LineBasicMaterial | null>(null);

  // Geometry + Line object — only recreated when outline/edge changes
  const lineObj = useMemo(() => {
    const local3D = outlineToLocal3D(outline);
    if (local3D.length === 0) return null;

    const [start, end] = edge.segmentRange;
    const clampedStart = Math.max(0, Math.min(start, local3D.length - 1));
    const clampedEnd = Math.max(clampedStart + 1, Math.min(end + 1, local3D.length));
    const edgePoints = local3D.slice(clampedStart, clampedEnd);
    if (edgePoints.length < 2) return null;

    const positions = new Float32Array(edgePoints.length * 3);
    for (let i = 0; i < edgePoints.length; i++) {
      positions[i * 3] = edgePoints[i].x;
      positions[i * 3 + 1] = 0.002;
      positions[i * 3 + 2] = edgePoints[i].z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
    matRef.current = mat;

    const line = new THREE.Line(geo, mat);
    return line;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- color updated via matRef, not recreation
  }, [outline, edge]);

  // Update color in-place without recreating geometry
  useEffect(() => {
    if (matRef.current) matRef.current.color.set(color);
  }, [color]);

  // Dispose on unmount or when lineObj changes
  useEffect(() => {
    return () => {
      if (lineObj) {
        lineObj.geometry.dispose();
        (lineObj.material as THREE.Material).dispose();
      }
    };
  }, [lineObj]);

  if (!lineObj) return null;

  return <primitive object={lineObj} />;
}
