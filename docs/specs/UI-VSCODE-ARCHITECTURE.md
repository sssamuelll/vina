# Engineering Spec: VS Code-Inspired UI Architecture (Tokenization)

## 1. Overview
OpenClo aims to provide a professional, ergonomic design environment for long-duration work. Instead of following the outdated UI of legacy CAD software, we adopt the **Visual Studio Code (Monaco)** design language. This ensures high visual contrast, reduced eye strain, and a familiar technical aesthetic for modern designers.

## 2. CSS Tokenization (Theming System)
We will replace all hardcoded colors with CSS variables mapping directly to VS Code's workbench tokens. This allows for native theme support (Dark, Light, High Contrast).

### Core Token Mappings
| OpenClo UI Region | VS Code Token Equivalent | CSS Variable Name |
| :--- | :--- | :--- |
| **Main Background** | `editor.background` | `--vscode-editor-background` |
| **Activity Bar** | `activityBar.background` | `--vscode-activityBar-background` |
| **Sidebar** | `sideBar.background` | `--vscode-sideBar-background` |
| **Status Bar** | `statusBar.background` | `--vscode-statusBar-background` |
| **Primary Accent** | `button.background` | `--vscode-button-background` |
| **Border / Divider** | `sideBar.border` | `--vscode-sideBar-border` |
| **Text (Primary)** | `foreground` | `--vscode-foreground` |

## 3. Semantic Layout Refactor
The UI will follow the standard "Integrated Development Environment" (IDE) pattern:

- **Activity Bar (Left)**: Vertical strip for context switching (2D Editor, 3D Simulation, Asset Library, Export).
- **Side Bar (Left/Collatable)**: Context-specific tools (e.g., when in 2D Editor mode, shows Drafting & Sewing tools).
- **Editor Area (Center)**: The split 2D/3D viewports.
- **Panel Area (Bottom)**: Collapsible area for logs, copilot chat, and simulation stats.
- **Status Bar (Bottom)**: Real-time feedback (Particle count, Wasm state, units).

## 4. Implementation Strategy

### Phase 1: Tokenization
1. Create `src/styles/theme.css` containing the root variables.
2. Update `App.css` and component-specific CSS files to consume these variables.
3. Target: Dark mode base at `#1e1e1e`.

### Phase 2: Activity Bar Migration
1. Extract mode selection from `Toolbar2D` and `Toolbar3D`.
2. Move these to a unified `ActivityBar` component.
3. Implement the collapsible `SideBar` for tool-specific sub-selections.

### Phase 3: Status Bar Dynamic Feedback
1. Update `StatusBar.tsx` to use the VS Code aesthetic (thin, solid color background).
2. Integrate simulation engine status (e.g., "Wasm: Running", "Particles: 12k").

## 5. Success Criteria
- The application looks and feels like a specialized "Fashion IDE".
- Zero hardcoded hex codes in the `.tsx` and `.css` files.
- Switching between 2D and 3D modes feels like switching between "Explorer" and "Debug" in VS Code.
