export type ToolContext = '2d' | '3d' | 'both';

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
}

export interface ToolOption {
  id: string;
  label: string;
  type: 'number' | 'select' | 'toggle' | 'color';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  choices?: { label: string; value: any }[];
}