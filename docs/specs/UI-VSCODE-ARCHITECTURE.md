# OpenClo.ai — Professional UI Architecture (Fashion IDE)

## 1. Overview
OpenClo.ai provides a high-performance, ergonomic design environment for professional fashion engineering. We have adopted the **"Integrated Development Environment" (IDE)** pattern, specifically inspired by the **Visual Studio Code (Monaco)** design language. This ensures high visual contrast, reduced eye strain, and a familiar technical aesthetic for modern designers.

## 2. CSS Tokenization (Theming System) ✅ COMPLETE (v0.5)
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

## 3. Semantic Layout ✅ COMPLETE (v0.5)
The layout is divided into specialized zones to optimize the professional workflow:

- **Activity Bar (Left)**: The primary navigation strip for context switching.
    - **Top Contexts**: Pattern Explorer, Measurements, Grading, Nesting, Simulation, Parametric Control, History, Files.
    - **Bottom System Contexts**: Skills Marketplace, Plugins, Settings.
- **Side Bar (Collapsible)**: Provides context-specific tools and metadata management (e.g., Piece selection, Fabric properties, Grading rules).
- **Editor Area (Center)**: A synchronized **2D/3D Split Viewport**.
    - **2D Viewport**: High-precision SVG drafting canvas.
    - **3D Viewport**: Real-time XPBD cloth simulation.
- **Panel Area (Bottom)**: Collapsible area for the **AI Copilot Chat**, technical logs, and simulation statistics.
- **Status Bar (Bottom)**: Real-time feedback on engine state (Wasm solver status, particle count, active units).

## 4. Key UX Principles
- **Command Palette (⌘K)**: Quick access to all 42+ tools and system commands without leaving the keyboard.
- **Context-Aware Sidebar**: The sidebar automatically adapts its content based on the active selection in the 2D or 3D viewport.
- **Visual Feedback**: Real-time synchronization between the 2D graph and the 3D drape ensures a "What You See Is What You Drape" (WYSIWYD) experience.

## 5. Next Steps (v0.6)
- **3D Direct Interaction**: Enabling "Grab and Pull" directly in the 3D viewport.
- **Floating Tool Options**: Moving tool-specific parameters to a context-aware overlay for reduced mouse travel.
- **Customizable Workspace**: Allow users to drag and drop panels to create a personalized layout.
