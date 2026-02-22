export type ToolContext = '2d' | '3d' | 'both';

export interface ToolDefinition {
  id: string;                    // unique: 'pen', 'select', 'pose', etc
  name: string;                  // display: 'Pen Tool'
  context: ToolContext;          // where it's available
  shortcut?: string;             // keyboard shortcut key
  icon: React.FC<{size?: number}>; // SVG icon component
  cursor?: string;               // CSS cursor
  group?: string;                // for grouping in toolbar: 'draw', 'edit', 'view', '3d-edit'
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