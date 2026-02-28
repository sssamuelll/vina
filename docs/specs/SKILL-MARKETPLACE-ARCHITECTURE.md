# Architecture Spec: OpenClo Skill Marketplace & SDK

## 1. Vision
OpenClo should not just be a tool, but an **ecosystem**. Instead of hardcoding every possible garment type (jeans, corsets, coats), we will provide a **Skill SDK**. Pattern makers, brands, and developers can author "Skills" and distribute them through the OpenClo Marketplace (similar to VS Code Extensions).

## 2. What is a "Skill"?
A Skill is a portable knowledge package that teaches the Copilot how to draft, modify, or simulate a specific category of garment.

### The `.oskill` Format (OpenClo Skill)
Skills will be distributed as JSON or sandboxed WASM modules containing:
1. **Metadata**: Name, author, version, description.
2. **Triggers**: Natural language phrases that activate the skill (e.g., "draft a skirt", "make a tailored jacket").
3. **Formulas**: Parametric math expressions mapped to body measurements.
4. **Construction Graph**: The sequential logic to generate base pattern pieces.
5. **Validation Rules**: Sanity checks (e.g., "Waist dart depth cannot exceed 15cm").

## 3. The Marketplace Architecture

### Client-Side (OpenClo App)
- **Plugin Manager UI**: A new view in the Activity Bar to search, install, and manage Skills.
- **Skill Registry (`src/copilot/skills/skillRegistry.ts`)**: Upgraded to handle dynamic injection of `.oskill` files at runtime.
- **Sandboxing**: 
  - If a skill contains executable code, it must run inside an isolated Web Worker or iframe to prevent malicious access to the user's local files or Redux store.
  - *Recommendation*: Use JSON for formulas and strict DSL (Domain Specific Language) for logic to avoid `eval()`.

### Server-Side (The Registry)
- A lightweight Node.js/Supabase backend serving a registry index: `api.openclo.app/registry/v1/skills.json`.
- Skills can be hosted on GitHub (like Homebrew taps) or directly on the registry.

## 4. Converting Existing Ecosystems (Seamly2D Bridge)
To bootstrap the marketplace, we will build a bridge that imports **Seamly2D `.val`** construction files and converts them automatically into `.oskill` packages. This instantly gives OpenClo access to thousands of open-source patterns created by the community over the last decade.

## 5. Implementation Roadmap
1. **Phase 1: Local Skill Injection**: Refactor the Copilot's `skillRegistry` to accept JSON-based skills loaded from the local filesystem instead of hardcoded `.ts` files.
2. **Phase 2: The UI Hub**: Build the "Marketplace" tab in the UI to browse a hardcoded list of remote skills.
3. **Phase 3: The Authoring Tool**: A UI for users to save their current project's construction history as a new `.oskill` file.

## 6. Success Criteria
- A user can click "Install" on a "Victorian Corset" skill in the UI.
- Immediately after installation, the user can type "Make a corset" and the Copilot generates the correct pieces using the newly downloaded knowledge.
