# Vina.ai — Functional Skill Ecosystem (Marketplace) (v0.7)

## 1. Vision: Content vs. Capability
To protect the intellectual property of pattern makers and designers, Vina.ai maintains a strict separation between **Content** and **Capability**.

- **Patterns (`.vina`)**: The proprietary geometry and formulas created by the designer.
- **Skills (`.oskill`)**: **Functional Capabilities** that expand the Copilot's "intelligence" (e.g., how to grade a specific style, how to generate a tech pack, or how to import legacy formats).

The Marketplace is a hub for **Capabilities**, not a library of static patterns.

## 2. Skill Registry & Core Skills

We have implemented a robust **Skill Registry** that handles the lifecycle of professional construction logic.

- **Core Skills**: Built-in capabilities including **Bodice, Sleeve, Skirt, Collar, and Grading**. These provide the foundational "Patronaje Soul" of the Copilot.
- **NSID System**: Every skill is identified by a unique **Namespace ID** (e.g., `core:bodice/aldrich`), ensuring no collisions in the marketplace.
- **Provider-Agnostic Tools**: Skills define their own `toolDefinitions`, which the Copilot's agentic loop consumes dynamically.

## 3. Skill Authoring & Ingestion

### SkillBuilder API (v0.7)

The `SkillBuilder` class (`src/copilot/action/skills/SkillBuilder.ts`) provides a complete authoring pipeline:

```typescript
const skill = SkillBuilder
  .fromConstruction(constructionSteps)
  .withMetadata({ name: 'Custom Bodice', author: 'designer@example.com' })
  .getPreview()      // Returns SkillBuilderPreview
  .validate()        // Returns SkillBuilderValidation
  .build();          // Returns CommunitySkill
```

### Silent Ingestion (Seamly2D Converter)
An intelligent service that parses legacy `.val` and `.vit` files and "elevates" them into functional Vina.ai Skills.

## 4. Marketplace Module (v0.7)

The marketplace module (`src/copilot/action/skills/marketplace.ts`) provides:

- **Configurable Registry URL**: `getSkillRegistryUrl()` / `setSkillRegistryUrl()` via localStorage.
- **Skill Discovery**: `fetchAvailableSkills()` queries the registry for available community skills.
- **Validation Pipeline**: `validateCommunitySkill()` checks skill integrity, permissions, and compatibility.
- **Community Skill Format**: Standardized package format for distribution.

### UI Components
- **SkillMarketplace** (`src/components/SkillMarketplace/`): Browse, search, and install community skills.
- **ExportSkillModal** (`src/components/ExportSkillModal/`): Export authored skills for sharing.
- **PluginManager** (`src/components/PluginManager/`): Manage installed plugins and skills.

## 5. Technical Architecture: The `.oskill` Format
A Skill is a sandboxed package containing:
- **Manifest**: Metadata, versioning, and required permissions.
- **Triggers**: Natural language prompts that activate the skill.
- **Construction Logic**: Formulas, drafting methods, and grading rules.
- **Tool Mapping**: Instructions for the LLM on how to execute the skill's capabilities.

## 6. Security & Sandboxing
All Skills run through the **SkillValidator** and execute in a controlled environment to protect the integrity of the project state.
- **Permission Model**: Users must grant permissions for third-party skills to access project metadata or export services.
- **Community Validation**: `validateCommunitySkill()` enforces structural and security checks.

## 7. Roadmap (v0.8)
- **Marketplace Backend**: Hosted registry service for community skill discovery and installation.
- **Skill Versioning**: Support for minor/major updates and dependency management (#176).
- **Namespace Verification**: Identity verification for professional contributors (#175).
- **Conflict Resolution**: Handling NSID collisions and dependency conflicts (#175).
