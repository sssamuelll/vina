export type ToolContext = '2d' | '3d' | 'both';

/**
 * Copilot-specific metadata for AI-driven tool usage.
 * This enables the Copilot to understand, suggest, and execute tools via natural language.
 */
export interface CopilotToolMetadata {
  /** Detailed description for LLM (more verbose than UI description) */
  description: string;
  /** Natural language examples of how to invoke this tool */
  examples: string[];
  /** Synonyms and related terms for better NL matching */
  keywords: string[];
  /** Does this tool require something to be selected first? */
  requiresSelection?: 'piece' | 'edge' | 'point' | 'seam' | 'internalLine' | 'none';
  /** What does this tool produce or modify? */
  produces?: 'piece' | 'seam' | 'elastic' | 'point' | 'measurement' | 'simulation' | 'view' | 'internalLine' | 'modification' | 'none';
  /** Can actions from this tool be undone? */
  undoable?: boolean;
  /** Is this a destructive action that needs confirmation? */
  dangerous?: boolean;
  /** Parameter descriptions for LLM (supplements ToolOption) */
  parameterHints?: Record<string, string>;
}

export interface ToolDefinition {
  id: string;                    // unique: 'pen', 'select', 'pose', etc
  name: string;                  // display: 'Pen Tool'
  description?: string;          // 1-line description for tooltip
  context: ToolContext;          // where it's available
  shortcut?: string;             // keyboard shortcut key
  icon: React.FC<{size?: number}>; // SVG icon component
  cursor?: string;               // CSS cursor
  group?: string;                // for grouping in toolbar: 'draw', 'edit', 'view', '3d-edit'
  subTools?: string[];           // IDs of variant tools (flyout on long-press)
  hidden?: boolean;              // if true, only appears in flyouts (not main toolbar)
  options?: ToolOption[];        // configurable options
  onActivate?: () => void;       // lifecycle
  onDeactivate?: () => void;     // cleanup

  /** Copilot AI metadata — enables natural language tool invocation */
  copilot?: CopilotToolMetadata;
}

export interface ToolOption {
  id: string;
  label: string;
  type: 'number' | 'select' | 'toggle' | 'color';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  min?: number;
  max?: number;
  step?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: { label: string; value: any }[];
}