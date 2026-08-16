import { ToolDefinition } from '../types';

export const pinTool: ToolDefinition = {
  id: 'pin',
  name: 'Fijar',
  description: 'Fix cloth points in place during simulation',
  context: '3d',
  shortcut: 'w',
  icon: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 9L15 3L12 0L6 6L0 12L3 15L9 9Z"/>
      <path d="M9 9L12 12"/>
      <circle cx="12" cy="6" r="1" fill="currentColor"/>
    </svg>
  ),
  cursor: 'crosshair',
  group: '3d-arrange',
  options: [
    {
      id: 'pinStrength',
      label: 'Fuerza de la fijación',
      type: 'select',
      value: 'strong',
      choices: [
        { label: 'Suave', value: 'weak' },
        { label: 'Media', value: 'medium' },
        { label: 'Fuerte', value: 'strong' },
      ],
    },
  ],
  onActivate: () => {
    console.log('[Pin Tool] Activated — click on cloth to add pins, Ctrl+W to clear all');
  },
  copilot: {
    description: 'Pins a point on the cloth to fix it in place during simulation. Pinned points will not move, allowing the rest of the fabric to drape naturally around them. Useful for holding garments on shoulders, waistband, or specific anchor points.',
    examples: [
      'Pin the shoulder point',
      'Fix this point in place',
      'Add a pin to hold the waistband',
      'Anchor the neckline',
    ],
    keywords: ['pin', 'fix', 'anchor', 'hold', 'constrain', 'attach', 'lock', 'tack'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: true,
    parameterHints: {
      pinStrength: 'How strongly the pin holds the cloth. Weak allows slight movement, Strong is completely fixed.',
    },
  },
};