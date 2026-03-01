# OpenClo.ai — AI Copilot Spec (v0.5)

## Overview

The AI Copilot is the primary interface for professional fashion engineering in OpenClo.ai. It is built as a **Situated Agent** that understands garment anatomy, technical constraints, and user preferences in real-time.

**Core Philosophy**: The agent is a **Co-Designer** that operates on a Semantic Graph, not just a text-to-CAD translator.

## Capabilities ✅ COMPLETE (v0.5)

### Pattern Synthesis
- **Intelligent Generation**: "Create a base bodice size 40 based on Müller's method." The agent uses its **Tailoring Soul** (Gilewska/Aldrich/Müller) to synthesize production-ready pieces.
- **Parametric Templates**: 5 primary skills (Bodice, Sleeve, Skirt, Collar, Grading) with 35+ formulas and 52 construction steps.

### Pattern Modification
- **Semantic Edits**: "Widen the shoulder by 1.5cm," "Move the bust dart down 20mm." The agent identifies the correct **SemanticEdge** or **Dart** and applies geometric transformations while maintaining piece integrity.
- **Constraint-Aware Transforms**: 9 primary transformations (scale, offset, rotate, dart-move, etc.) that respect sewing compatibility.

### Situated Intelligence
- **Semantic Recognition**: The agent identifies pieces and edges by anatomical function (e.g., knowing an edge is an *Armhole* allows it to warn about sleeve compatibility).
- **Proactive Analysis**: 5 automatic audits (Seam Allowance consistency, Dart alignment, Self-intersection, Area integrity, Seam compatibility).
- **Teaching Mode**: Explains the technical "WHY" behind pattern-making decisions to educate the user.

### Adaptive Learning & Memory
- **Durable Design Memory**: The agent remembers fit standards, fabric preferences, and style history across sessions.
- **Preference Learner**: Observes manual edits to detect formula deltas and creates permanent **Skill Overrides** for the user's specific aesthetic.

## Architecture

OpenClo.ai uses a **Multi-Turn Agentic Loop** with multi-provider support.

### The Orchestration Loop
1. **Context Building**: The `EnhancedContextBuilder` serializes the current **Semantic Graph**, **Spatial Relationships**, and **Design Log** into the system prompt.
2. **Reasoning**: The LLM (Claude, GPT, or Ollama) reasons about the request and selects from **42+ Tools**.
3. **Execution**: The `ToolExecutor` applies changes to the Redux store.
4. **Validation**: The `ProactiveAnalysis` engine audits the result.
5. **Durable Logging**: Decisions are written back to the **Design Log** for cross-session persistence.

### Multi-Provider Architecture
The agent is provider-agnostic, supporting:
- **Anthropic Claude 3.5 Sonnet** (Primary recommendation for professional reasoning).
- **OpenAI GPT-4o**.
- **Ollama (llama3.1)**: For 100% private, local-first, and cost-free execution.

## UX Principles

1. **Natural Language, Technical Precision**: Speak like a tailor, execute like a CAD engineer.
2. **Visual Feedback**: Every AI action is immediately reflected in the 2D Editor and 3D Viewport.
3. **Transparency**: Token tracking, budget warnings, and tool-use logging are visible in the ActivityBar.
4. **Deterministic Audits**: The agent simulates changes in a **Sandbox** before applying them to ensure no unsewable geometry is created.

## Fashion Terminology & Soul

The Copilot's "Soul" is defined by industrial pattern-making standards. It maps natural language across English and Spanish to precise technical entities:

| Concept | Semantic Target | Technical Constraint |
|---------|-----------------|----------------------|
| Corpiño | `BODICE_FRONT/BACK`| Anatomical landmarks (Neck, Bust, Side) |
| Pinza | `DART` | Vertex/Leg geometry + Intake |
| Sisa | `ARMHOLE_CURVE` | Bezier curvature + Ease |
| Piquete | `NOTCH` | ASTM layer mapping (4/84/85) |
| Hilo | `GRAINLINE` | Fabric vector orientation |
