# Vina.ai — AI Copilot Spec (v0.7)

## Overview

The AI Copilot is the primary interface for professional fashion engineering in Vina.ai. It is built as a **Situated Agent** that understands garment anatomy, technical constraints, and user preferences in real-time.

**Core Philosophy**: The agent is a **Co-Designer** that operates on a Semantic Graph, not just a text-to-CAD translator.

## Architecture: Unified Agentic Loop

In v0.7, the copilot transitioned from a Planner/Executor/Reasoner triad to a **Unified Agentic Loop** that drives LLM tool-use iteration until task completion.

### The Agentic Loop (`AgenticLoop.ts`)

```
User Request
    |
    v
Domain Bootstrap (context initialization)
    |
    v
LLM Iteration Loop:
    1. LLM selects tool(s) from available set
    2. Meta-tools (read-only) execute without state mutation
    3. Action tools (mutations) execute with rollback support
    4. Results fed back to LLM
    5. LLM decides: continue iteration or complete
    |
    v
Summary + Response to User
```

### Tool Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Meta-tools** | Read-only introspection | Inspect piece, list seams, get measurements |
| **Action tools** | State mutations | Modify edge, create dart, apply grading |

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **AgenticLoop** | `src/copilot/reasoning/bridge/AgenticLoop.ts` | Main LLM-driven iteration loop (241 lines) |
| **Meta-tools** | `src/copilot/reasoning/bridge/meta-tools/` | Read-only introspection tools |
| **Domain Bootstrap** | `src/copilot/reasoning/bridge/domainBootstrap.ts` | Context initialization for domain-aware reasoning |
| **useBridge hook** | `src/copilot/hooks/useBridge.ts` | React state management integration |

### Legacy Bridge (deprecated)

The old Planner/Executor/Reasoner pattern still exists in the codebase but is superseded by the AgenticLoop:
- `Planner.ts` — LLM generates JSON execution plan
- `Executor.ts` — Runs steps without LLM
- `Reasoner.ts` — Error recovery with LLM

## Capabilities

### Pattern Synthesis
- **Intelligent Generation**: "Create a base bodice size 40 based on Muller's method." The agent uses its **Tailoring Soul** (Gilewska/Aldrich/Muller) to synthesize production-ready pieces.
- **Parametric Templates**: 5 primary skills (Bodice, Sleeve, Skirt, Collar, Grading) with 35+ formulas and 52 construction steps.

### Pattern Modification
- **Semantic Edits**: "Widen the shoulder by 1.5cm," "Move the bust dart down 20mm." The agent identifies the correct **SemanticEdge** or **Dart** and applies geometric transformations while maintaining piece integrity.
- **Constraint-Aware Transforms**: 9 primary transformations (scale, offset, rotate, dart-move, etc.) that respect sewing compatibility.
- **Stable Edge References**: All tool operations use `pieceId:edgeName` identifiers for reliable targeting.

### Situated Intelligence
- **Semantic Recognition**: The agent identifies pieces and edges by anatomical function (e.g., knowing an edge is an *Armhole* allows it to warn about sleeve compatibility).
- **Proactive Analysis**: 5 automatic audits (Seam Allowance consistency, Dart alignment, Self-intersection, Area integrity, Seam compatibility).
- **Teaching Mode**: Explains the technical "WHY" behind pattern-making decisions to educate the user.

### Adaptive Learning & Memory
- **Durable Design Memory**: The agent remembers fit standards, fabric preferences, and style history across sessions.
- **Preference Learner**: Observes manual edits to detect formula deltas and creates permanent **Skill Overrides** for the user's specific aesthetic.

### Skill System
- **SkillBuilder API**: `fromConstruction()`, `withMetadata()`, `getPreview()`, `validate()`, `build()` for community skill creation.
- **Marketplace Module**: Configurable registry URL, `fetchAvailableSkills()`, community skill validation.
- **5 Core Skills**: Bodice (Aldrich/Muller/Gilewska), Sleeve, Skirt, Collar, Grading.

## Multi-Provider Architecture

The agent is provider-agnostic, supporting:
- **Anthropic Claude** (Primary recommendation for professional reasoning).
- **OpenAI GPT-4o**.
- **Ollama (llama3.1)**: For 100% private, local-first, and cost-free execution.

## UX Principles

1. **Natural Language, Technical Precision**: Speak like a tailor, execute like a CAD engineer.
2. **Visual Feedback**: Every AI action is immediately reflected in the 2D Editor and 3D Viewport.
3. **Transparency**: Token tracking, budget warnings, and tool-use logging are visible in the UnifiedBar settings mode (AgentSettings).
4. **Deterministic Audits**: The agent validates changes before applying them to ensure no unsewable geometry is created.

## Fashion Terminology & Soul

The Copilot's "Soul" is defined by industrial pattern-making standards. It maps natural language across English and Spanish to precise technical entities:

| Concept | Semantic Target | Technical Constraint |
|---------|-----------------|----------------------|
| Corpino | `BODICE_FRONT/BACK`| Anatomical landmarks (Neck, Bust, Side) |
| Pinza | `DART` | Vertex/Leg geometry + Intake |
| Sisa | `ARMHOLE_CURVE` | Bezier curvature + Ease |
| Piquete | `NOTCH` | ASTM layer mapping (4/84/85) |
| Hilo | `GRAINLINE` | Fabric vector orientation |
