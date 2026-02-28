# Architecture Spec: OpenClo Functional Skill Marketplace

## 1. Vision Shift: Patterns are Content, Skills are Capabilities
To protect the intellectual property of pattern makers, we must separate the concept of "Patterns" (content) from "Skills" (functionality).
- **`.openclo` files** are the output of the designer's work. They contain the proprietary geometry and formulas. They are sold/shared via external platforms (Gumroad, Etsy).
- **`.oskill` files** are **Capabilities** that expand what the Copilot can *do* with those patterns. They are the equivalent of VS Code Extensions or OpenClaw Skills.

The OpenClo Marketplace is a hub for **Functional Plugins**, not a pattern library.

## 2. What is a "Functional Skill"?
A Skill teaches the Copilot a new workflow, integration, or analytical capability. It does NOT teach the Copilot how to draw a specific shirt.

### Examples of Marketplace Skills
- **`auto-costing`**: Analyzes the current `.openclo` project, runs nesting logic, and generates a fabric cost report.
- **`tech-pack-export`**: A tool that extracts measurements and 2D views to generate an industry-standard Tech Pack PDF.
- **`fabric-analyzer`**: An integration with an external API that predicts XPBD physics parameters from a swatch photo.
- **`dxf-repair`**: A specialized parser that fixes common geometry errors in imported AAMA files.

## 3. The Copilot's "Internal" Pattern Knowledge
The Copilot still needs to understand garment anatomy (e.g., what an armhole is) to assist the user.
- **Internal Knowledge Base**: The `Pattern Skills` (Bodice, Skirt, Jeans) are moved *inward*. They act as the Copilot's "Vision System", allowing it to semantically map user-drawn lines to human concepts.
- **Zero-Shot Recognition**: The user draws a `.openclo` pattern. The Copilot uses its internal knowledge to say: *"I recognize this is a sleeve. Would you like me to ease the sleeve cap?"* The user's formulas remain completely private.

## 4. Technical Architecture: The New `.oskill` Format
An `.oskill` is a sandboxed execution package.

### Structure
```typescript
interface FunctionalSkill {
  manifest: {
    id: string; // e.g., 'acme:techpack'
    name: string;
    version: string;
    permissions: string[]; // e.g., ['read_project', 'export_pdf']
  };
  triggers: string[]; // "Generate a tech pack", "Cost this garment"
  toolDefinitions: ProviderToolDef[]; // The LLM interface
  runtime: string; // WebAssembly module or Sandboxed JS
}
```

## 5. Security & Execution (The Sandbox)
Since Functional Skills can execute code and access external APIs:
- **Web Workers**: All skill logic runs in a scoped Web Worker with no DOM access.
- **Permission Model**: Users must explicitly grant permissions (e.g., "Allow this skill to read your project data").

## 6. Implementation Roadmap
1. **Pivot Issue #163**: Update the Epic to reflect "Functional Skills" instead of "Pattern Skills".
2. **Internalize Pattern Knowledge**: Shift existing `bodiceSkill.ts` to be an internal semantic mapping tool, not a downloadable plugin.
3. **Build the First Functional Skill**: Create an `Auto-Nesting & Costing` skill as the flagship marketplace plugin to demonstrate the power of the platform.
