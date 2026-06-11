/**
 * SimSeamLines — seam connection lines over the SIMULATED garment
 * (post-ship plan R2, #880; plan de paridad § 5:87 fast-follow).
 *
 * CLO3D draws sewing lines "como líneas que conectan las piezas en la
 * ventana 3D" durante la simulación; hasta R2, OpenClo solo las dibujaba en
 * arrange (`SeamRenderer3D`, gated `!useClothSim`) y "el seam cerrado ERA
 * la visualización". This component draws the matched vertex pairs the
 * solver is actually pulling together, read from the live positions buffer
 * each frame — the lines converge as the seam closes, and a reversed seam
 * shows the crossed-X in 3D for free (same error language as 2D).
 *
 * Color = pair identity (`seamPairColor`, Fase 6 — same language as the 2D
 * canvas). Deliberate divergence from arrange-mode `SeamRenderer3D`, which
 * keeps provenance coloring (amber AI / green human): arrange answers
 * "who proposed this seam?", sim answers "which pair is closing where?".
 *
 * Lifecycle per RFC C1: geometry + material wrapped in a disposable.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import type { RootState } from '../../store';
import type { SeamInitData } from '../../utils/cloth/seamAssembly';
import { buildSimSeamLineData, type SimSeamPieceMesh } from './simSeamLineData';
import { useDisposable } from './hooks/useDisposable';

interface SimSeamLinesProps {
  /** Live solver positions (merged-mesh order) — read fresh every frame. */
  positionsRef: React.MutableRefObject<Float32Array | null>;
  placedMeshes: SimSeamPieceMesh[];
  seamInitData: SeamInitData[];
}

export default function SimSeamLines({ positionsRef, placedMeshes, seamInitData }: SimSeamLinesProps) {
  const showSeamlines3D = useSelector((s: RootState) => s.simulation.showSeamlines3D);
  const lineDataRef = useRef<ReturnType<typeof buildSimSeamLineData>>(null);

  const lineObj = useMemo(() => {
    const data = buildSimSeamLineData(seamInitData, placedMeshes);
    lineDataRef.current = data;
    if (!data) return null;

    const geo = new THREE.BufferGeometry();
    // Positions start at 0 and are overwritten from the live buffer each
    // frame; frustumCulled=false below avoids per-frame bounding updates.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.lineCount * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      // Overlay semantics (CLO3D seamline look): the pair spans between
      // pieces and would otherwise be swallowed by the cloth.
      depthTest: false,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 999;
    lines.frustumCulled = false;

    return {
      lines,
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  }, [seamInitData, placedMeshes]);

  useDisposable(lineObj);

  useFrame(() => {
    const data = lineDataRef.current;
    const positions = positionsRef.current;
    if (!lineObj || !data || !positions) return;

    const posAttr = lineObj.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out = posAttr.array as Float32Array;
    const idx = data.vertexIndices;
    let visible = false;
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i] * 3;
      if (v + 2 < positions.length) {
        out[i * 3] = positions[v];
        out[i * 3 + 1] = positions[v + 1];
        out[i * 3 + 2] = positions[v + 2];
        visible = true;
      }
    }
    lineObj.lines.visible = visible;
    posAttr.needsUpdate = true;
  });

  if (!showSeamlines3D || !lineObj) return null;

  return <primitive object={lineObj.lines} />;
}
