# OpenClo.ai — Functional Skill Ecosystem (Marketplace)

## 1. Vision: Content vs. Capability
To protect the intellectual property of pattern makers and designers, OpenClo.ai maintains a strict separation between **Content** and **Capability**.

- **Patterns (`.openclo`)**: The proprietary geometry and formulas created by the designer.
- **Skills (`.oskill`)**: **Functional Capabilities** that expand the Copilot's "intelligence" (e.g., how to grade a specific style, how to generate a tech pack, or how to import legacy formats).

The Marketplace is a hub for **Capabilities**, not a library of static patterns.

## 2. Skill Registry & Core Skills ✅ COMPLETE (v0.5)
We have implemented a robust **Skill Registry** that handles the lifecycle of professional construction logic.

- **Core Skills**: Built-in capabilities including **Bodice, Sleeve, Skirt, Collar, and Grading**. These provide the foundational "Patronaje Soul" of the Copilot.
- **NSID System**: Every skill is identified by a unique **Namespace ID** (e.g., `core:bodice/aldrich`), ensuring no collisions in the marketplace.
- **Provider-Agnostic Tools**: Skills define their own `toolDefinitions`, which the Copilot's agent loop consumes dynamically.

## 3. Skill Authoring & Ingestion ✅ COMPLETE (v0.5)
We provide professional tools for both creating new skills and migrating legacy knowledge.

- **SkillBuilder**: A visual environment for designers to define construction steps, formulas, and LLM triggers without writing code.
- **Silent Ingestion (Seamly2D Converter)**: An intelligent service that parses legacy `.val` and `.vit` files and "elevates" them into functional OpenClo.ai Skills.

## 4. Technical Architecture: The `.oskill` Format
A Skill is a sandboxed package containing:
- **Manifest**: Metadata, versioning, and required permissions.
- **Triggers**: Natural language prompts that activate the skill.
- **Construction Logic**: Formulas, drafting methods, and grading rules.
- **Tool Mapping**: Instructions for the LLM on how to execute the skill's capabilities.

## 5. Security & Sandboxing
All Skills run through the **SkillValidator** and execute in a controlled environment to protect the integrity of the project state.
- **Permission Model**: Users must grant permissions for third-party skills to access project metadata or export services.

## 6. Roadmap (v0.6)
- **Decentralized Marketplace UI**: A native browser for discovering and installing community-created skills.
- **Skill Versioning**: Support for minor/major updates and dependency management.
- **Namespace Verification**: Ensuring that professional contributors can verify their identity and protect their NSID.
