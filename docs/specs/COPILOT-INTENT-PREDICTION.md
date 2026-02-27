# Copilot Spec: Intent Prediction Loop (Autonomous Refinement)

## 1. Overview
Inspired by the **OpenClaw "Lobster"** engine and deterministic pipeline safety, this system prevents the Copilot from applying "broken" or "hallucinated" geometry changes. Before any modification is committed to the Redux store, the agent performs a **Pre-flight Mental Simulation** to validate the technical integrity of the proposed action.

## 2. The Prediction Pipeline
We will insert a validation gate between the `agentLoop.ts` (LLM Reasoning) and the `toolExecutor.ts` (Action Execution).

### Flow:
1. **Tool Request**: LLM calls a tool (e.g., `modifyDimension`).
2. **Virtual Diff**: A pure function calculates the "Next State" of the pattern piece in a temporary sandbox.
3. **Intent Audit**: A set of geometric rules (The Auditor) checks the sandbox state.
4. **Auto-Refinement**: 
   - If **Valid**: Apply to the real store.
   - If **Invalid**: Feed the error back to the LLM (Mental Correction) instead of crashing the UI.

## 3. The "Auditor" Rule Set
The Auditor checks the "Virtual Diff" against standard patternmaking constraints:
- **Area Integrity**: Is the new piece area > 0? (Prevents inverted polygons).
- **Self-Intersection**: Does the new outline intersect itself?
- **Seam Compatibility**: If a length was changed, does it still match its sewn counterpart?
- **Project Log Constraints**: Does this change violate a "Durable Note" (e.g., "Do not change neck width")?

## 4. Technical Implementation

### The Sandbox Interface
```typescript
interface IntentPrediction {
  toolName: string;
  originalPiece: PatternPiece;
  predictedPiece: PatternPiece;
  isSafe: boolean;
  warnings: string[];
}
```

### Integration Points
- **`src/copilot/toolExecutor.ts`**: Add a `preFlightCheck` method that runs the sandbox simulation.
- **`src/utils/mesh/patternOps.ts`**: Use existing pure functions to calculate the predicted geometry.

## 5. User Feedback (Re-Act Loop)
If the Intent Loop detects a high-risk change, the agent generates an internal turn:
- **Input**: "Mental Simulation failed: Increasing the armhole height by 50mm will cause self-intersection."
- **Output to User**: "I attempted to increase the armhole, but that would break the piece geometry. Should I try a smaller increment (e.g., 10mm) instead?"

## 6. Success Criteria
- The UI never renders a "broken" pattern piece (NaN vertices or overlapping lines) caused by an AI action.
- The Copilot proactively catches 100% of its own "impossible" geometry requests.
