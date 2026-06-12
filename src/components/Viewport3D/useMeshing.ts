/**
 * useMeshing — Async piece meshing via SimulationInitClient with
 * edit classification and warm-start debounce.
 *
 * Handles:
 * - Async meshing of pattern pieces into triangulated meshes
 * - Edit classification (topology vs dimension changes)
 * - Warm-start: on dimension-only edits, updates solver constraints
 *   in-place without full re-mesh
 *
 * Uses a ref for solver clients to break the circular dependency:
 * useMeshing → pieceMeshes → placedMeshes → useSimulationLifecycle → clients
 *
 * Extracted from GarmentSimulation.tsx for separation of concerns.
 *
 * **Warm-start tier coverage (post-C4):** CPU + WASM only. GPU and Neural
 * have no `updateConstraints` equivalent (GPU uses TSL kernel rest-length
 * buffers; Neural is inference-based with no live constraint surface).
 * Bounded gap per C4 RFC § 2.4.3.
 *
 * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md § 2.4.3
 */

import { useRef, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece } from '../../types/types';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { classifyEdit } from '../../utils/cloth/editClassifier';
import { computeRestLengths } from '../../utils/cloth/restLengthComputer';
import { setParticleCount, setIsWarmStarting } from '../../store/simulationSlice';
import { showErrorToast } from '../../store/copilotUISlice';
import type { SimulationClients } from './useSimulationLifecycle';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MeshedPiece {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  outline: Array<{ type: string; values: number[] }>;
  edges?: Array<{ name: string; segmentRange: [number, number] }>;
  /** UV coordinates from 2D pattern space for texture mapping */
  uvs?: Float32Array;
  /** Per-piece stiffness multiplier (>1 = stiffer, from interfacing/solidify). Default 1. */
  stiffnessMultiplier?: number;
  /**
   * Boundary-subdivision maxEdgeLength (mm) this piece was MESHED with
   * (= its particleDistance). Seam/elastic builders downstream re-derive
   * the mesher's boundary vertex numbering and must subdivide with the
   * same value (M4 — see `PieceSeamData` in seamAssembly). Legacy fallback;
   * superseded by `boundaryOrig`.
   */
  meshMaxEdgeLength?: number;
  /** Mesher boundary provenance (M4) — see ClothMeshData.boundaryOrig. */
  boundaryOrig?: Float64Array;
}

interface UseMeshingProps {
  pieces: PatternPiece[];
  /** Ref to solver clients — read inside warm-start setTimeout to get latest value */
  clientsRef: React.MutableRefObject<SimulationClients>;
  stretchingIdsRef: React.MutableRefObject<Int32Array | null>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMeshing({
  pieces,
  clientsRef,
  stretchingIdsRef,
}: UseMeshingProps): MeshedPiece[] {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const globalParticleDistance = useSelector((s: RootState) => s.simulation.particleDistance);
  const pieceParticleDistances = useSelector((s: RootState) => s.simulation.pieceParticleDistance);

  const [pieceMeshes, setPieceMeshes] = useState<MeshedPiece[]>([]);
  const prevPiecesRef = useRef<PatternPiece[]>([]);
  const warmStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full async meshing (topology changes or initial mesh)
  useEffect(() => {
    // Skip re-meshing for dimension-only edits when solver is active
    if (prevPiecesRef.current.length > 0 && (simulationState === 'running' || simulationState === 'paused')) {
      const editType = classifyEdit(prevPiecesRef.current, pieces);
      if (editType === 'dimension') {
        return;
      }
    }

    let cancelled = false;
    const client = new SimulationInitClient();
    client.onProgress = () => { /* progress tracking available if needed */ };

    (async () => {
      const meshed = await client.meshAllPieces(pieces, pieceParticleDistances, globalParticleDistance);
      if (cancelled) return;

      // Noisy meshing failure (#895, CLO3D doctrine: explicit message +
      // exclude the piece, never silence). Before this, a piece whose CDT
      // failed or timed out was dropped with at most a console.warn — the
      // sim then started with N-1 pieces and every seam referencing the
      // missing piece resolved to 0 constraints ("missing piece"), which
      // is how María's front bodice vanished in production unnoticed.
      if (meshed.length < pieces.length) {
        const meshedIds = new Set(meshed.map(m => m.pieceId));
        const missing = pieces.filter(p => !meshedIds.has(p.id));
        for (const p of missing) {
          dispatch(showErrorToast(
            `La pieza «${p.name}» no se pudo mallar y queda fuera de la simulación — ` +
            'su contorno puede tener problemas; prueba a subir su densidad de partícula o simplificarlo',
          ));
        }
      }

      const result = meshed.map(m => {
        const piece = pieces.find(p => p.id === m.pieceId);
        return {
          ...m,
          outline: (piece?.outline ?? []) as Array<{ type: string; values: number[] }>,
          edges: piece?.edges?.map(e => ({ name: e.name, segmentRange: e.segmentRange })),
          meshMaxEdgeLength: pieceParticleDistances[m.pieceId] ?? globalParticleDistance,
        };
      });

      setPieceMeshes(result);
      const totalParticles = result.reduce((sum, p) => sum + p.vertices.length / 3, 0);
      dispatch(setParticleCount(totalParticles));
    })().catch(err => {
      if (!cancelled) {
        console.error('[Meshing] Async meshing failed:', err);
      }
    });

    return () => {
      cancelled = true;
      client.dispose();
    };
  }, [pieces, globalParticleDistance, pieceParticleDistances, simulationState, dispatch]);

  // Warm-start on dimension-only edits
  useEffect(() => {
    const prevPieces = prevPiecesRef.current;
    prevPiecesRef.current = pieces;

    if (prevPieces.length === 0) return;
    if (simulationState !== 'running' && simulationState !== 'paused') return;

    const editType = classifyEdit(prevPieces, pieces);
    if (editType !== 'dimension') return;

    if (warmStartTimerRef.current) {
      clearTimeout(warmStartTimerRef.current);
    }

    dispatch(setIsWarmStarting(true));

    warmStartTimerRef.current = setTimeout(() => {
      const client = new SimulationInitClient();
      client.meshAllPieces(pieces, pieceParticleDistances, globalParticleDistance)
        .then(meshed => {
          client.dispose();

          const stretchIds = stretchingIdsRef.current;
          if (!stretchIds || meshed.length === 0) return;

          const totalVerts = meshed.reduce((sum, p) => sum + p.vertices.length, 0);
          const mergedVerts = new Float32Array(totalVerts);
          let offset = 0;
          for (const p of meshed) {
            mergedVerts.set(p.vertices, offset);
            offset += p.vertices.length;
          }

          const newRestLengths = computeRestLengths(mergedVerts, stretchIds);

          // Read clients from ref to get latest solver instance
          const clients = clientsRef.current;
          if (clients.cpu) {
            clients.cpu.updateConstraints(newRestLengths);
          } else if (clients.wasm) {
            clients.wasm.updateConstraints(newRestLengths);
          }

          // Update pieceMeshes for static rendering
          setPieceMeshes(meshed.map(m => {
            const piece = pieces.find(p => p.id === m.pieceId);
            return {
              ...m,
              outline: (piece?.outline ?? []) as Array<{ type: string; values: number[] }>,
              edges: piece?.edges?.map(e => ({ name: e.name, segmentRange: e.segmentRange })),
              meshMaxEdgeLength: pieceParticleDistances[m.pieceId] ?? globalParticleDistance,
            };
          }));

          dispatch(setIsWarmStarting(false));
        })
        .catch(err => {
          client.dispose();
          console.warn('[Meshing] Warm-start re-mesh failed:', err);
          dispatch(setIsWarmStarting(false));
        });
    }, 500);

    return () => {
      if (warmStartTimerRef.current) {
        clearTimeout(warmStartTimerRef.current);
        warmStartTimerRef.current = null;
      }
    };
    // clientsRef and stretchingIdsRef are stable refs — no need in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, simulationState, pieceParticleDistances, globalParticleDistance, dispatch]);

  return pieceMeshes;
}
