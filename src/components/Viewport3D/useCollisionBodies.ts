/**
 * useCollisionBodies — Syncs pinned vertices to the WASM solver.
 *
 * Initial collision loading (avatar mesh + custom bodies) is handled inside
 * useSimulationLifecycle as part of the solver startup sequence. This hook
 * handles only runtime pin sync which is a reactive effect on pinnedVertices.
 *
 * Extracted from GarmentSimulation.tsx for separation of concerns.
 *
 * **Tier coverage (post-C4):** this hook syncs Redux pin state to the WASM
 * `setPins` surface (positional batch). Other tiers' pin/freeze surfaces
 * are exposed via different hooks: GPU `freezePieces` via
 * `useSimulationLifecycle` (per-piece freeze, not vertex pin); CPU
 * `pinParticle` (single-pin freeze, different shape) via
 * `clothWorkerClient`. Neural has no per-particle interactivity.
 * Pin sync coverage gap captured C4 RFC § 2.4.4; WASM is canonical for
 * positional pin batch post-A6.
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
