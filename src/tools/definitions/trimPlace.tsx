/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
import { TRIM_LIBRARY } from '../../utils/trim/trimLibrary';

const TrimPlaceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="4" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="9" y1="14" x2="9" y2="17" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="14" y1="9" x2="17" y2="9" />
  </svg>
);

// El desplegable lee `nameEs`, que la biblioteca ya traía escrito y nadie
// consultaba: era uno de los ocho contratos que la auditoría del 2026-08-14
// encontró rodeados. La medida deja de repetirse —«Botón Plano 15mm (15mm)»—
// porque cada `nameEs` ya la lleva dentro cuando importa.
const presetChoices = TRIM_LIBRARY.map(p => ({
  label: p.nameEs,
  value: p.id,
}));

export const trimPlaceTool: ToolDefinition = {
  id: 'trimPlace',
  // «Poner avío» y no «Colocar avío»: «Colocar» ya es `Arrange`, la colocación
  // 3D, y el glosario manda un término por concepto.
  name: 'Poner avío',
  description: 'Haz clic en un borde para poner botones, cierres o broches',
  context: '2d',
  icon: TrimPlaceIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'trimPreset',
      label: 'Avío',
      type: 'select',
      value: TRIM_LIBRARY[0].id,
      choices: presetChoices,
    },
    {
      id: 'placementMode',
      label: 'Cómo se ponen',
      type: 'select',
      value: 'single',
      choices: [
        { label: 'Uno', value: 'single' },
        { label: 'Repartidos por el borde', value: 'distribute' },
      ],
    },
    {
      id: 'distributeCount',
      label: 'Cuántos',
      type: 'number',
      value: 5,
      min: 2,
      max: 20,
      step: 1,
    },
    {
      id: 'startOffset',
      // El principio y el final son los del borde, que es lo único que esta
      // herramienta recorre. «Margen» está tomado por el de costura.
      label: 'Desde el principio (mm)',
      // Como todo número en la línea al pie, se teclea: un campo con Restar y
      // Sumar (spec 2026-10-02 § 5.3). Hasta P2b era un deslizador de paso 1
      // sobre 0-50 mm.
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      id: 'endOffset',
      label: 'Hasta el final (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Place trims (buttons, zippers, snaps, rivets, buckles) on pattern piece edges by clicking. ' +
      'Select a preset from the trim library, then click on piece edges to place. ' +
      'Use Distribute mode to evenly space N trims along an edge. ' +
      '/ Colocar avios (botones, cremalleras, broches, remaches, hebillas) en los bordes de piezas del patron.',
    examples: [
      'Place buttons on the front bodice center-front edge',
      'Distribute 5 snaps along the waistband',
      'Add a zipper to the center back',
    ],
    keywords: ['trim', 'button', 'zipper', 'snap', 'rivet', 'buckle', 'place', 'attach', 'distribute'],
    requiresSelection: 'none',
    produces: 'modification',
    undoable: true,
  },
};
