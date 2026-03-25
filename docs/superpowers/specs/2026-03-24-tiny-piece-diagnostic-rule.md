# Spec: Diagnostic Rule — Tiny Piece Detection (#32)

**Status:** Draft (Pending Approval)  
**Date:** March 24, 2026  
**Author:** Gemini CLI  

---

## 1. Objective
Detect pattern pieces that are too small to be simulated or manufactured correctly. Tiny pieces (scraps) cause physics instabilities (jitter) and artifacts in export pipelines.

## 2. Rule Definition: `ruleTinyPiece`

- **Criteria:** A pattern piece whose total surface area is **less than 1,000 mm²** (equivalent to 10 cm²).
- **Exclusion Heuristic:** If a piece is connected to at least one active seam, it is considered an intentional accessory (e.g., belt loop, button tab) and will **not** trigger the warning.
- **Severity:** `warning` for orphan tiny pieces; `none` for connected pieces.
- **Category:** `geometry`.
- **User Feedback:**
  - **Message:** "Orphaned tiny piece detected (< 10cm²)"
  - **Detail:** "Small orphaned scraps can cause simulation jitter and are typically residues of edit operations. Consider deleting this piece."

## 3. Implementation Strategy

### A. Data Collection (`src/diagnostics/dataCollector.ts`)
- **Area Calculation:** The area MUST be computed based on the **linearized** outline (including curves).
  - Algorithm: Use `flattenPath(piece.outline)` to get vertices, then apply the **Shoelace Formula**.
  - Unit: All calculations in `mm²`.
- **Schema Update:** Update `InspectionPieceData` in `src/diagnostics/types.ts` to include the `area` (number) field.

### B. Rule Engine (`src/diagnostics/ruleEngine.ts`)
- Implement `ruleTinyPiece` as a pure function.
- Verify: `data.area < 1000 && data.seams.length === 0`.

### C. Agent Analyzer Suggestions (`src/diagnostics/agentAnalyzer.ts`)
- **Action Strategy:** The agent will provide a **clickable tool suggestion**.
- **UX Flow:** 
  1. Inspector displays: "Possible scrap detected. Remove?"
  2. User clicks the suggestion.
  3. Action `project/removePiece` is dispatched.
  4. **Confirmation:** The action is intercepted by `confirmationMiddleware`. If the user has NOT suppressed confirmations, a dialog will appear before deletion.

## 4. Verification Plan
- **Unit Test:** `src/diagnostics/__tests__/ruleEngine.test.ts`. Test area calculation with a 50x20mm rectangle (1000mm²) vs a 10x10mm square (100mm²).
- **Edge Case Test:** Verify that a 5x5mm piece with an active seam **does not** trigger the warning.
