# Master Spec: Copilot Brain Architecture (v1.0)

## 1. Overview
This specification defines the "Cerebral" layer of the OpenClo Copilot. Inspired by the **OpenClaw** hub-and-spoke model, it transitions the agent from a reactive command-executor to a situated design partner with visual awareness and historical memory.

## 2. Structural Hierarchy
All logic for the Copilot's intelligence is centralized in `src/copilot/vision/`.

### 👁️ Perception Layer
- **Geometry Classifier**: Analyzes raw `PathCommands` to identify garment-specific landmarks (necklines, armholes, hems).
- **Spatial Describer**: Analyzes the 3D Scene Graph to describe adjacency and collisions between pieces.

### 🧠 Memory Layer
- **Durable Design Log**: Manages the persistent Markdown journal (`.openclo/design-log.md`). Extracts technical decisions from chat history.
- **Preference Learner**: Observes manual user edits to override built-in skill formulas.

### ⚡ Action Layer
- **Intent Predictor**: Runs a "Pre-flight Sandbox" simulation. Validates geometry changes before they touch the Redux store.

## 3. Data Flow Cycle
1. **Sensing**: Vision Layer builds a semantic map of the current workspace.
2. **Recall**: Memory Layer retrieves recent decisions and style preferences.
3. **Synthesis**: Context Builder merges senses and memories into the LLM system prompt.
4. **Validation**: Action Layer audits the LLM's proposed tool calls.
5. **Execution**: If safe, changes are applied and a durable note is written back to the Memory Layer.

## 4. Implementation Map (Phase 1)
| Issue | Component | Responsibility |
| :--- | :--- | :--- |
| **A** | `vision/types.ts` | Shared interfaces for SemanticLabels, Landmarks, and Diffs. |
| **B** | `geometryClassifier.ts` | Concavity/Convexity detection and ratio analysis. |
| **C** | `spatialDescriber.ts` | Proximity analysis using placed 3D meshes. |
| **I** | `designLog.ts` | Memory Flush protocol and Markdown persistence. |
| **J** | `preferenceLearner.ts` | Formula delta detection and override persistence. |
| **D** | `intentPredictor.ts` | Geometric Auditor and Mental Simulation sandbox. |
| **E** | `contextBuilder.ts` | Final serialization of the 'Brilliant' context. |

## 5. Security & Stability
- **Pure Functions**: The Perception and Action layers must remain pure where possible.
- **Sandboxing**: The Intent Predictor must operate on a deep clone of the piece to avoid state leakage.
- **Token Budget**: Proactive memory flushing must trigger when conversation history exceeds 4,000 tokens.
