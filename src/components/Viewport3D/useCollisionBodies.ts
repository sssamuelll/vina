/**
 * useCollisionBodies — Syncs pinned vertices to the WASM solver.
 *
 * Initial collision loading (avatar mesh + custom bodies) is handled inside
 * useSimulationLifecycle as part of the solver startup sequence. This hook
 * handles only runtime pin sync which is a reactive effect on pinnedVertices.
 *
 * Extracted from GarmentSimulation.tsx for separation of concerns.
 *
 * **Tier coverage (post-C4):** WASM only. CPU has `pinParticle(idx)`
 * (single-pin freeze-only — no positional pin); GPU + Neural have no pin
 * surface. Per C4 RFC § 2.4.4, pin sync coverage gap is bounded + acceptable
 * (WASM is the canonical pin tier post-A6 batch shape `setPins`).
 *
 * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md § 2.4.4
 */

import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import type { SimulationClients } from './useSimulationLifecycle';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseCollisionBodiesProps {
  clients: SimulationClients;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCollisionBodies({ clients }: UseCollisionBodiesProps): void {
  const pinnedVertices = useSelector((s: RootState) => s.simulation.pinnedVertices);

  // Sync pinned vertices to WASM solver
  useEffect(() => {
    if (!clients.wasm) return;
    const pins = Object.values(pinnedVertices);
    if (pins.length === 0) {
      clients.wasm.clearPins();
    } else {
      clients.wasm.setPins(pins.map(p => ({
        vertexIndex: p.vertexIndex,
        position: p.targetPosition,
      })));
    }
  }, [clients.wasm, pinnedVertices]);
}
