# OpenClo.ai — Professional UI Architecture (Fashion IDE) (v0.7)

## 1. Overview
OpenClo.ai provides a high-performance, ergonomic design environment for professional fashion engineering. We have adopted the **"Integrated Development Environment" (IDE)** pattern, specifically inspired by the **Visual Studio Code (Monaco)** design language. This ensures high visual contrast, reduced eye strain, and a familiar technical aesthetic for modern designers.

## 2. CSS Tokenization (Theming System)
The entire UI is built on a strict tokenization system using CSS variables. This enables native theme support and ensures consistency across all functional modules.

### Core Token Mappings
| OpenClo UI Region | VS Code Token Equivalent | CSS Variable Name |
| :--- | :--- | :--- |
| **Main Background** | `editor.background` | `--vscode-editor-background` |
| **Activity Bar** | `activityBar.background` | `--vscode-activityBar-background` |
| **Side Bar** | `sideBar.background` | `--vscode-sideBar-background` |
| **Status Bar** | `statusBar.background` | `--vscode-statusBar-background` |
| **Primary Accent** | `button.background` | `--vscode-button-background` |
| **Border / Divider** | `sideBar.border` | `--vscode-sideBar-border` |
| **Text (Primary)** | `foreground` | `--vscode-foreground` |

## 3. Semantic Layout
The layout is divided into specialized zones to optimize the professional workflow:

- **Activity Bar (Left)**: The primary navigation strip for context switching.
    - **Top Contexts**: Pattern Explorer, Measurements, Grading, Nesting, Simulation, Parametric Control, History, Files.
    - **Bottom System Contexts**: Skills Marketplace, Plugins, Settings.
- **Side Bar (Collapsible)**: Provides context-specific tools and metadata management (e.g., Piece selection, Fabric properties, Grading rules).
- **Editor Area (Center)**: A synchronized **2D/3D Split Viewport**.
    - **2D Viewport**: High-precision SVG drafting canvas with **Display Bar 2D** (toggles for seam allowance, piece names, line lengths, grainlines, sewing lines, and render modes).
    - **3D Viewport**: Real-time XPBD cloth simulation with **Snapshot Bar** (A/B/C drape comparison) and **Collision Body Panel** (import, friction/offset sliders).
- **Panel Area (Bottom)**: Collapsible area for the **AI Copilot Chat**, technical logs, and simulation statistics.
- **Status Bar (Bottom)**: Real-time feedback on engine state (Wasm solver status, particle count, active units).

## 4. Key UX Principles
- **Command Palette**: Quick access to all 45 tools and system commands without leaving the keyboard.
- **Context-Aware Sidebar**: The sidebar automatically adapts its content based on the active selection in the 2D or 3D viewport.
- **Visual Feedback**: Real-time synchronization between the 2D graph and the 3D drape ensures a "What You See Is What You Drape" (WYSIWYD) experience.
- **Display Bar 2D**: Floating contextual toolbar for rapid toggle of display options (seam allowance, piece names, line lengths, sewing lines) and render mode switching (textured, translucent, wireframe).
- **Linked Editing Indicators**: Visual cues showing linked piece pairs and their propagation mode (instance/symmetry).

## 5. Component Inventory (v0.7)

| Component | Directory | Purpose |
|-----------|-----------|---------|
| ActivityBar | `src/components/ActivityBar/` | VS Code-style navigation strip |
| CopilotPanel | `src/components/CopilotPanel/` | AI assistant chat interface |
| DisplayBar2D | `src/components/DisplayBar2D/` | 2D contextual floating toolbar |
| DisplayBar3D | `src/components/DisplayBar3D/` | 3D display options |
| PatternEditor | `src/components/PatternEditor/` | 2D SVG canvas with tool hooks |
| Viewport3D | `src/components/Viewport3D/` | R3F 3D viewport |
| SnapshotBar | `src/components/Viewport3D/SnapshotBar.tsx` | A/B/C drape comparison |
| CollisionBodyPanel | `src/components/Viewport3D/CollisionBodyPanel.tsx` | Collision body management |
| Toolbar2D | `src/components/Toolbar2D/` | 2D tool palette |
| Toolbar3D | `src/components/Toolbar3D/` | 3D tool palette |
| ToolOptions | `src/components/ToolOptions/` | Per-tool option panels |
| PropertiesPanel | `src/components/PropertiesPanel/` | Piece/selection properties |
| Sidebar | `src/components/Sidebar/` | Collapsible context panel |
| StatusBar | `src/components/StatusBar/` | Real-time engine status |
| CommandPalette | `src/components/CommandPalette/` | Quick command access |
| SkillMarketplace | `src/components/SkillMarketplace/` | Skill discovery UI |
| PluginManager | `src/components/PluginManager/` | Plugin management UI |
| ImportDXFDialog | `src/components/ImportDXFDialog/` | DXF import configuration |
| ExportSkillModal | `src/components/ExportSkillModal/` | Skill export interface |
| TemplateLibrary | `src/components/TemplateLibrary/` | Pattern template browser |
| ShortcutHelp | `src/components/ShortcutHelp/` | Keyboard shortcut reference |

## 6. Next Steps (v0.8)
- **3D Direct Interaction**: Enabling "Grab and Pull" directly in the 3D viewport.
- **Floating Tool Options**: Moving tool-specific parameters to a context-aware overlay for reduced mouse travel.
- **Customizable Workspace**: Allow users to drag and drop panels to create a personalized layout.
- **Collaborative Presence**: Avatar indicators for multi-user editing sessions.
