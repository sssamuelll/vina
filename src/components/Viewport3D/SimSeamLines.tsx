/**
 * SimSeamLines — seam lines over the SIMULATED garment
 * (post-ship plan R2, #880; fuente staticGeometry + polylines de borde
 * 2026-07-05 — paridad CLO3D).
 *
 * CLO3D draws sewing lines on the draped garment. This component draws TWO
 * layers in ONE merged LineSegments (un draw call — dictamen Halberg; el
 * WebGPURenderer rechaza fat lines):
 *   1. Connection pairs (R2): the matched vertex pairs the solver pulls
 *      together — converge as the seam closes; a reversed seam shows the
 *      crossed-X for free.
 *   2. Edge polylines (2026-07-05): the continuous seam line along side A —
 *      with the seam closed (2mm floor) this IS the CLO3D seam line on the
 *      garment.
 *
 * FUENTE DE POSICIONES (fix 2026-07-05): `staticGeometry.position` — la
 * geometry que TODOS los tiers sincronizan (CPU/WASM cada frame; GPU cada
 * 15 frames vía readbackPositionsToGeometry). Antes leía `positionsRef`,
 * que solo alimenta el onFrame de los workers CPU/WASM → en el tier GPU
 * DEFAULT el componente estaba silenciosamente MUERTO (buffer todo-ceros,
 * invisible): la sim por defecto no dibujaba NINGUNA costura. Caveat
 * conocido: en GPU las líneas trailean ≤15 frames respecto a la tela
 * visible (node material a full rate); exactas al asentarse, que es cuando
 * se inspeccionan costuras.
 *
 * Color = `seamThreadColor` (identidad hash-estable por seam.id +
 * proveniencia como saturación) — unificado con los hilos de arrange
 * (SeamRenderer3D) para que todo lo de una costura comparta hue.
 *
 * Lifecycle per RFC C1: geometry + material wrapped in a disposable.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import type { RootState } from '../../store';
import type { SeamInitData } from '../../utils/cloth/seamAssembly';
import {
  buildSimSeamLineData,
  buildSeamEdgePolylineData,
  fillSeamLinePositions,
  type SimSeamPieceMesh,
  type SimSeamLineData,
} from './simSeamLineData';
import { useDisposable } from './hooks/useDisposable';

interface SimSeamLinesProps {
  /** La geometry sincronizada por el solver en TODOS los tiers (merged-mesh
   *  order; índice de vértice == índice global de partícula). */
  geometry: THREE.BufferGeometry | null;
  placedMeshes: SimSeamPieceMesh[];
  seamInitData: SeamInitData[];
}

/** Concatena los dos datasets (conexiones + polylines) en uno. */
function mergeLineData(
  a: SimSeamLineData | null,
  b: SimSeamLineData | null,
): SimSeamLineData | null {
  if (!a) return b;
  if (!b) return a;
  const vertexIndices = new Uint32Array(a.vertexIndices.length + b.vertexIndices.length);
  vertexIndices.set(a.vertexIndices, 0);
  vertexIndices.set(b.vertexIndices, a.vertexIndices.length);
  const colors = new Float32Array(a.colors.length + b.colors.length);
  colors.set(a.colors, 0);
  colors.set(b.colors, a.colors.length);
  return { vertexIndices, colors, lineCount: a.lineCount + b.lineCount };
}

export default function SimSeamLines({ geometry, placedMeshes, seamInitData }: SimSeamLinesProps) {
  // Modo INSPECCIÓN, default OFF (acta consejo costura-real 2026-07-05): la
  // anotación dibujada contradiciendo al shading era el "más anormal" del
  // founder — la costura debe VERSE por física+normales, no por overlay.
  const showSimSeamLines = useSelector((s: RootState) => s.simulation.showSimSeamLines);
  const lineDataRef = useRef<SimSeamLineData | null>(null);

  const lineObj = useMemo(() => {
    const data = mergeLineData(
      buildSimSeamLineData(seamInitData, placedMeshes),
      buildSeamEdgePolylineData(seamInitData, placedMeshes),
    );
    lineDataRef.current = data;
    if (!data) return null;

    const geo = new THREE.BufferGeometry();
    // Positions start at 0 and are overwritten from the synced geometry each
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
    const positions = geometry?.getAttribute('position')?.array;
    if (!lineObj || !data || !positions) return;

    const posAttr = lineObj.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const visible = fillSeamLinePositions(posAttr.array as Float32Array, data.vertexIndices, positions);
    lineObj.lines.visible = visible;
    posAttr.needsUpdate = true;
  });

  if (!showSimSeamLines || !lineObj) return null;

  return <primitive object={lineObj.lines} />;
}
