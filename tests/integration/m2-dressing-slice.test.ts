// @vitest-environment jsdom
/**
 * M2 dressing-slice integration — drives the REAL agentic loop with REAL
 * tools and the REAL Redux store, using `claude --output-format json` as
 * the LLM provider. This is the "I can do the E2E myself" test.
 *
 * Opt-in: requires `M2_INTEGRATION=1` env var. Skipped on CI and on default
 * `npm run test` runs because (a) each LLM call takes ~10-15 s and (b) it
 * costs real Anthropic credits (or burns Claude Code subscription tokens).
 *
 * Cost estimate: 5 LLM calls × ~$0.05-0.10 each = ~$0.25-0.50 per run on
 * Sonnet. To run:
 *
 *   M2_INTEGRATION=1 npx vitest run tests/integration/m2-dressing-slice.test.ts
 *
 * What this verifies vs the existing M2 scaffolding:
 *
 *   scripts/m2-prompt-dry-run.mjs      → prompt comprehension only (no loop)
 *   AgenticLoop.test.ts (history fix)  → history mechanics only (mock LLM)
 *   THIS test                          → real LLM + real loop + real tools
 *                                        + real Redux state changes
 *
 * Limits this still does NOT cover:
 *   - Browser rendering (UnifiedBarChat shows the right narration?)
 *   - Real Anthropic API tool-calling semantics (this shim uses
 *     structured-output JSON, not native function-calling)
 *   - DoD #506 visual outcome (avatar actually dressed; that test
 *     remains intentionally red until #527/#518/#556/#531)
 */

import { describe, it, expect } from 'vitest';
import { AgenticLoop } from '../../src/copilot/reasoning/bridge/AgenticLoop';
import { getDefaultRegistry } from '../../src/copilot/action/tools/registry';
import { getAllMetaTools } from '../../src/copilot/reasoning/bridge/meta-tools';
import { store } from '../../src/store';
import { claudeCliSend } from './m2-claudeCliShim';
import type { AgenticEvent } from '../../src/copilot/reasoning/bridge/AgenticLoop';

const shouldRun = process.env.M2_INTEGRATION === '1';

describe.skipIf(!shouldRun)('M2 dressing slice — real LLM integration', () => {
  it(
    'intent → propose → confirm → load → autoSew → simulate',
    async () => {
      const registry = getDefaultRegistry();
      registry.setContext(store.dispatch, () => store.getState());

      const actionToolDefs = registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const loop = new AgenticLoop({
        send: claudeCliSend,
        metaTools: getAllMetaTools(),
        actionToolDefs,
        getState: () => store.getState(),
        dispatch: store.dispatch,
        registry,
      });

      const events: AgenticEvent[] = [];
      const onEvent = (e: AgenticEvent) => events.push(e);

      // Snapshot baseline
      const baseline = store.getState();
      expect(baseline.project.pieces).toHaveLength(0);

      // ─── Turn 1: user intent ─────────────────────────────────────────
      console.log('\n[TURN 1] User: "Quiero vestir el avatar con una camisa."');
      const turn1 = await loop.run('Quiero vestir el avatar con una camisa.', onEvent);
      console.log('[TURN 1 response]:', turn1);

      const turn1ToolStarts = events
        .filter((e) => e.type === 'tool:start')
        .map((e) => (e as { name: string }).name);
      console.log('[TURN 1 tools called]:', turn1ToolStarts);

      // After turn 1: agent should have at minimum called listSeamlyPatterns
      // and stopped to propose. Pieces should NOT be loaded yet (still at the
      // confirmation gate).
      expect(turn1ToolStarts).toContain('listSeamlyPatterns');
      expect(store.getState().project.pieces).toHaveLength(0);

      // Turn 1 final text should propose a shirt pattern in Spanish.
      expect(turn1.toLowerCase()).toMatch(/camisa|shirt|patrón|patron/);

      // ─── Turn 2: confirmation ────────────────────────────────────────
      events.length = 0; // reset for turn 2 inspection
      console.log('\n[TURN 2] User: "Sí, úsala."');
      const turn2 = await loop.run('Sí, úsala.', onEvent);
      console.log('[TURN 2 response]:', turn2);

      const turn2ToolStarts = events
        .filter((e) => e.type === 'tool:start')
        .map((e) => (e as { name: string }).name);
      console.log('[TURN 2 tools called]:', turn2ToolStarts);

      // After turn 2 (CLO3D flow, 2026-05-29): the agent loads, ARRANGES in
      // 3D, and verifies — it does NOT auto-simulate. The human presses
      // Simulate. So we expect loadSeamlyPattern + arrangeGarment + verifyGarment,
      // and the simulation must NOT be running.
      expect(turn2ToolStarts).toContain('loadSeamlyPattern');
      expect(turn2ToolStarts).toContain('arrangeGarment');
      // Honesty gate: verify garment health before claiming anything.
      expect(turn2ToolStarts).toContain('verifyGarment');

      const final = store.getState();
      console.log('[FINAL STATE]:', {
        pieces: final.project.pieces.length,
        seams: final.project.seams.length,
        viewMode3D: final.simulation.viewMode3D,
        simulation: final.simulation.simulationState,
      });

      // Pattern loaded → at least one piece in store
      expect(final.project.pieces.length).toBeGreaterThan(0);
      // The agent must NOT have started the drape — arrange mode, idle solver.
      // (The human triggers Simulate; the agent never auto-simulates.)
      expect(final.simulation.simulationState).not.toBe('running');
      expect(final.simulation.viewMode3D).toBe('arrange');
    },
    600_000, // 10-minute budget — 5 LLM calls × ~15 s each + tool exec
  );
});
