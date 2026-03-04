/**
 * Action Schema Generator — converts CopilotAction types to LLM-friendly schemas.
 *
 * Generates documentation and JSON schemas for the system prompt, enabling
 * the LLM to understand available actions and their parameters.
 *
 * @module actionSchemas
 */

import { ACTION_CATEGORIES } from '../actions/actionTypes';

// ============================================================================
// Schema Types
// ============================================================================

export interface ActionSchema {
  action: string;
  description: string;
  category: string;
  parameters: ActionParameter[];
  examples: string[];
  dangerous?: boolean;
  readOnly?: boolean;
}

export interface ActionParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

// ============================================================================
// Action Definitions
// ============================================================================

const ACTION_SCHEMAS: ActionSchema[] = [
  // === Selection ===
  {
    action: 'select_piece',
    description: 'Select a single piece by ID',
    category: 'selection',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece to select', required: true },
    ],
    examples: ['Select the front bodice', 'Select piece-1'],
  },
  {
    action: 'select_pieces',
    description: 'Select multiple pieces by IDs or natural language query',
    category: 'selection',
    parameters: [
      { name: 'query', type: 'string | string[]', description: 'Piece IDs or natural language query like "all sleeves"', required: true },
    ],
    examples: ['Select all sleeve pieces', 'Select front and back bodice'],
  },
  {
    action: 'select_edge',
    description: 'Select a specific edge on a piece',
    category: 'selection',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge (0-based)', required: true },
    ],
    examples: ['Select the top edge of the front bodice'],
  },
  {
    action: 'clear_selection',
    description: 'Clear all selections',
    category: 'selection',
    parameters: [],
    examples: ['Clear selection', 'Deselect all'],
  },

  // === Piece Operations ===
  {
    action: 'create_piece',
    description: 'Create a new pattern piece',
    category: 'piece',
    parameters: [
      { name: 'shape', type: 'string', description: 'Shape type', required: true, enum: ['rectangle', 'from_points', 'from_outline'] },
      { name: 'params.name', type: 'string', description: 'Name for the piece', required: false },
      { name: 'params.width', type: 'number', description: 'Width in mm (for rectangle)', required: false },
      { name: 'params.height', type: 'number', description: 'Height in mm (for rectangle)', required: false },
      { name: 'params.points', type: '[number, number][]', description: 'Array of [x, y] points (for from_points)', required: false },
    ],
    examples: ['Create a 200x300mm rectangle named "Front Panel"', 'Create a piece from points'],
  },
  {
    action: 'duplicate_piece',
    description: 'Duplicate an existing piece',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece to duplicate', required: true },
      { name: 'offset', type: '[number, number]', description: 'Offset [x, y] from original in mm', required: false },
      { name: 'newName', type: 'string', description: 'Name for the duplicate', required: false },
    ],
    examples: ['Duplicate the front bodice', 'Copy and offset by 50mm'],
  },
  {
    action: 'delete_piece',
    description: 'Delete a piece (also removes connected seams)',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece to delete', required: true },
    ],
    examples: ['Delete the collar piece'],
    dangerous: true,
  },
  {
    action: 'rename_piece',
    description: 'Rename a piece',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'name', type: 'string', description: 'New name', required: true },
    ],
    examples: ['Rename piece-1 to "Left Sleeve"'],
  },
  {
    action: 'mirror_piece',
    description: 'Mirror/flip a piece on an axis',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'axis', type: 'string', description: 'Axis to mirror on', required: true, enum: ['x', 'y'] },
      { name: 'createCopy', type: 'boolean', description: 'If true, create a mirrored copy', required: false, default: false },
    ],
    examples: ['Mirror the sleeve horizontally', 'Flip the back panel vertically'],
  },
  {
    action: 'move_piece',
    description: 'Move a piece to a new position',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'position', type: '{ x, y } | { dx, dy }', description: 'New position or delta', required: true },
      { name: 'relative', type: 'boolean', description: 'If true, position is relative delta', required: false },
    ],
    examples: ['Move piece 100mm to the right', 'Position at (200, 300)'],
  },
  {
    action: 'scale_piece',
    description: 'Scale a piece by a factor',
    category: 'piece',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'factor', type: 'number', description: 'Scale factor (1.0 = no change)', required: true },
    ],
    examples: ['Scale the piece to 110%', 'Reduce by 10%'],
  },

  // === Geometry ===
  {
    action: 'move_point',
    description: 'Move a point on a piece outline',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'pointIndex', type: 'number', description: 'Index of the point', required: true },
      { name: 'delta', type: '[number, number]', description: 'Movement [dx, dy] in mm', required: true },
    ],
    examples: ['Move point 2 by 10mm up'],
  },
  {
    action: 'add_point',
    description: 'Add a point along an edge',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge', required: true },
      { name: 'position', type: 'number', description: 'Position along edge (0-1)', required: true },
    ],
    examples: ['Add a point at the midpoint of edge 0'],
  },
  {
    action: 'delete_point',
    description: 'Delete a point from a piece outline',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'pointIndex', type: 'number', description: 'Index of the point to delete', required: true },
    ],
    examples: ['Delete point 3 from the front bodice', 'Remove the extra point on edge 2'],
    dangerous: true,
  },
  {
    action: 'curve_edge',
    description: 'Convert a straight edge to a curve',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge to curve', required: true },
      { name: 'curvature', type: 'number', description: 'Curvature amount (-1 to 1, positive = outward)', required: true },
    ],
    examples: ['Curve the side seam edge', 'Add curvature to edge 2'],
  },
  {
    action: 'straighten_edge',
    description: 'Convert a curved edge to a straight line',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge to straighten', required: true },
    ],
    examples: ['Straighten the armhole edge', 'Make edge 1 a straight line'],
  },
  {
    action: 'add_ease',
    description: 'Add ease to an edge or entire piece',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edge', type: 'number | "all"', description: 'Edge index or "all"', required: true },
      { name: 'amount', type: 'number', description: 'Ease amount in mm', required: true },
    ],
    examples: ['Add 2cm ease to the chest', 'Add 5mm ease to edge 1'],
  },
  {
    action: 'add_dart',
    description: 'Add a dart to a piece',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'position', type: '[number, number]', description: 'Dart position [x, y] in mm', required: true },
      { name: 'angle', type: 'number', description: 'Dart angle in degrees', required: true },
      { name: 'depth', type: 'number', description: 'Dart depth in mm', required: true },
    ],
    examples: ['Add a bust dart at (100, 150) with 8cm depth'],
  },
  {
    action: 'split_piece',
    description: 'Split a pattern piece into two pieces along a cut line between two points on the outline',
    category: 'geometry',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece to split', required: true },
      { name: 'startPoint', type: '[number, number]', description: 'Start point [x, y] on the piece outline (in pattern space)', required: true },
      { name: 'endPoint', type: '[number, number]', description: 'End point [x, y] on the piece outline (in pattern space)', required: true },
    ],
    examples: ['Split the front bodice from armhole to waist', 'Cut this piece in half horizontally'],
    dangerous: true,
  },
  {
    action: 'merge_pieces',
    description: 'Merge two adjacent pattern pieces into one. The pieces must share an adjacent edge.',
    category: 'geometry',
    parameters: [
      { name: 'pieceIdA', type: 'string', description: 'ID of the first piece', required: true },
      { name: 'pieceIdB', type: 'string', description: 'ID of the second piece', required: true },
    ],
    examples: ['Merge the upper and lower bodice', 'Join these two pieces together', 'Combine the front panels'],
  },

  // === Seams ===
  {
    action: 'create_seam',
    description: 'Create a seam between two pieces',
    category: 'seam',
    parameters: [
      { name: 'pieceA', type: 'string', description: 'ID of first piece', required: true },
      { name: 'edgeA', type: 'number', description: 'Edge index on first piece', required: true },
      { name: 'pieceB', type: 'string', description: 'ID of second piece', required: true },
      { name: 'edgeB', type: 'number', description: 'Edge index on second piece', required: true },
      { name: 'type', type: 'string', description: 'Seam type', required: false, enum: ['standard', 'french', 'flat-felled', 'overlock'] },
    ],
    examples: ['Sew the shoulder seam between front and back bodice'],
  },
  {
    action: 'delete_seam',
    description: 'Delete a seam',
    category: 'seam',
    parameters: [
      { name: 'seamId', type: 'string', description: 'ID of the seam to delete', required: true },
    ],
    examples: ['Remove the side seam'],
    dangerous: true,
  },
  {
    action: 'auto_detect_seams',
    description: 'Automatically detect and create seams between matching edges',
    category: 'seam',
    parameters: [
      { name: 'pieceIds', type: 'string[]', description: 'Pieces to analyze (omit for all)', required: false },
      { name: 'tolerance', type: 'number', description: 'Edge matching tolerance in mm', required: false },
    ],
    examples: ['Auto-detect seams for all pieces', 'Find seams for the bodice pieces'],
  },

  // === Topstitch ===
  {
    action: 'create_topstitch',
    description: 'Add a topstitch line along a piece edge',
    category: 'topstitch',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge to topstitch', required: true },
      { name: 'stitchType', type: 'string', description: 'Stitch type', required: false, enum: ['straight', 'zigzag', 'triple'] },
      { name: 'stitchLength', type: 'number', description: 'Stitch length in mm', required: false, default: 3 },
      { name: 'offset', type: 'number', description: 'Offset from edge in mm', required: false, default: 5 },
      { name: 'threadColor', type: 'string', description: 'Thread color (hex)', required: false, default: '#333' },
      { name: 'rows', type: 'number', description: 'Number of parallel rows', required: false, default: 1 },
    ],
    examples: ['Add topstitch along the collar edge', 'Add a zigzag topstitch on edge 0'],
  },

  // === Measurements ===
  {
    action: 'measure_edge',
    description: 'Measure the length of an edge',
    category: 'measurement',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
      { name: 'edgeIndex', type: 'number', description: 'Index of the edge', required: true },
    ],
    examples: ['Measure the shoulder seam length'],
    readOnly: true,
  },
  {
    action: 'measure_piece_area',
    description: 'Calculate the area of a piece',
    category: 'measurement',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece', required: true },
    ],
    examples: ['What is the area of the front panel?'],
    readOnly: true,
  },
  {
    action: 'compare_edges',
    description: 'Compare lengths of two edges',
    category: 'measurement',
    parameters: [
      { name: 'edge1', type: '{ pieceId, edgeIndex }', description: 'First edge', required: true },
      { name: 'edge2', type: '{ pieceId, edgeIndex }', description: 'Second edge', required: true },
    ],
    examples: ['Compare the armhole curves on front and back'],
    readOnly: true,
  },
  {
    action: 'measure_distance',
    description: 'Measure straight-line distance between two points',
    category: 'measurement',
    parameters: [
      { name: 'from', type: '{ x: number, y: number }', description: 'Start point coordinates', required: true },
      { name: 'to', type: '{ x: number, y: number }', description: 'End point coordinates', required: true },
    ],
    examples: ['Measure distance between these two points', 'How far apart are these points?'],
    readOnly: true,
  },

  // === Simulation ===
  {
    action: 'start_simulation',
    description: 'Start the cloth simulation',
    category: 'simulation',
    parameters: [
      { name: 'quality', type: 'string', description: 'Simulation quality', required: false, enum: ['fast', 'normal', 'high'] },
    ],
    examples: ['Start simulation', 'Run the drape simulation at high quality'],
  },
  {
    action: 'stop_simulation',
    description: 'Stop the running simulation',
    category: 'simulation',
    parameters: [],
    examples: ['Stop simulation', 'Pause draping'],
  },
  {
    action: 'show_fit_map',
    description: 'Show or hide fit map visualization',
    category: 'simulation',
    parameters: [
      { name: 'enabled', type: 'boolean', description: 'Show or hide', required: true },
      { name: 'type', type: 'string', description: 'Map type', required: false, enum: ['stress', 'strain', 'fit', 'pressure'] },
    ],
    examples: ['Show the stress map', 'Display fit visualization'],
  },

  // === Avatar ===
  {
    action: 'set_avatar_measurement',
    description: 'Set a single body measurement',
    category: 'avatar',
    parameters: [
      { name: 'measurement', type: 'string', description: 'Measurement name (chest, waist, hips, etc.)', required: true },
      { name: 'value', type: 'number', description: 'Value in cm', required: true },
    ],
    examples: ['Set chest to 96cm', 'Change waist measurement to 80'],
  },
  {
    action: 'set_avatar_measurements',
    description: 'Set multiple body measurements at once',
    category: 'avatar',
    parameters: [
      { name: 'measurements', type: 'Record<string, number>', description: 'Measurements in cm', required: true },
    ],
    examples: ['Set measurements for size 42', 'Update chest, waist, and hips'],
  },

  // === View ===
  {
    action: 'switch_view',
    description: 'Switch between 2D, 3D, or split view',
    category: 'view',
    parameters: [
      { name: 'view', type: 'string', description: 'View mode', required: true, enum: ['2d', '3d', 'split'] },
    ],
    examples: ['Switch to 3D view', 'Show split view'],
  },
  {
    action: 'zoom_to_piece',
    description: 'Zoom the view to a specific piece',
    category: 'view',
    parameters: [
      { name: 'pieceId', type: 'string', description: 'ID of the piece to zoom to', required: true },
    ],
    examples: ['Zoom to the collar', 'Focus on the back panel'],
  },

  // === Project ===
  {
    action: 'undo',
    description: 'Undo the last action(s)',
    category: 'project',
    parameters: [
      { name: 'steps', type: 'number', description: 'Number of steps to undo', required: false, default: 1 },
    ],
    examples: ['Undo', 'Undo last 3 actions'],
  },
  {
    action: 'redo',
    description: 'Redo previously undone action(s)',
    category: 'project',
    parameters: [
      { name: 'steps', type: 'number', description: 'Number of steps to redo', required: false, default: 1 },
    ],
    examples: ['Redo', 'Redo 2 actions'],
  },
];

// ============================================================================
// Schema Generation
// ============================================================================

/**
 * Get all action schemas.
 */
export function getAllActionSchemas(): ActionSchema[] {
  return ACTION_SCHEMAS;
}

/**
 * Get action schemas by category.
 */
export function getActionSchemasByCategory(category: keyof typeof ACTION_CATEGORIES): ActionSchema[] {
  return ACTION_SCHEMAS.filter(s => s.category === category);
}

/**
 * Get a specific action schema.
 */
export function getActionSchema(action: string): ActionSchema | undefined {
  return ACTION_SCHEMAS.find(s => s.action === action);
}

/**
 * Generate a system prompt section describing all available actions.
 */
export function generateActionsPromptSection(): string {
  const lines: string[] = [
    '## Available Actions\n',
    'You can execute actions by returning JSON in this format:',
    '```json',
    '{"actions": [{"action": "action_name", ...params}], "explanation": "What I did"}',
    '```\n',
  ];

  // Group by category
  const categories = Object.keys(ACTION_CATEGORIES) as Array<keyof typeof ACTION_CATEGORIES>;

  for (const category of categories) {
    const schemas = getActionSchemasByCategory(category);
    if (schemas.length === 0) continue;

    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)} Actions\n`);

    for (const schema of schemas) {
      const flags: string[] = [];
      if (schema.dangerous) flags.push('⚠️ destructive');
      if (schema.readOnly) flags.push('📖 read-only');
      const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';

      lines.push(`**${schema.action}**${flagStr}`);
      lines.push(`  ${schema.description}`);

      if (schema.parameters.length > 0) {
        lines.push('  Parameters:');
        for (const param of schema.parameters) {
          const req = param.required ? '(required)' : '(optional)';
          const enumStr = param.enum ? ` [${param.enum.join('|')}]` : '';
          lines.push(`    - \`${param.name}\`: ${param.type}${enumStr} ${req} — ${param.description}`);
        }
      }

      if (schema.examples.length > 0) {
        lines.push(`  Examples: "${schema.examples[0]}"`);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate a compact action reference for token-constrained contexts.
 */
export function generateCompactActionsReference(): string {
  const lines: string[] = ['## Actions Quick Reference\n'];

  for (const schema of ACTION_SCHEMAS) {
    const params = schema.parameters
      .filter(p => p.required)
      .map(p => p.name)
      .join(', ');
    lines.push(`- \`${schema.action}(${params})\`: ${schema.description}`);
  }

  return lines.join('\n');
}
