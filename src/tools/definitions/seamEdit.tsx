/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

/**
 * Editar costuras — la herramienta que separa CREAR costuras de EDITARLAS
 * (#1028). Su comportamiento vive entero en `useSeamEditTool`, no aquí: esta
 * definición existe para que la herramienta tenga NOMBRE.
 *
 * Sin ella, la barra de opciones (#1049) hacía `definicion?.name ?? id` y
 * pintaba la palabra `seamEdit` en pantalla — y esta herramienta está en el
 * dock de fábrica, así que se llegaba con un clic. No declara `options`
 * porque no tiene ninguna que configurar.
 */
const SeamEditIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Dos tramos cosidos y el punto de edición en medio */}
    <path d="M2 12C4 8 6 8 8 12" />
    <path d="M10 12C12 8 14 8 16 12" />
    <circle cx="9" cy="12" r="1.6" />
  </svg>
);

export const seamEditTool: ToolDefinition = {
  id: 'seamEdit',
  name: 'Editar costuras',
  context: '2d',
  icon: SeamEditIcon,
  cursor: 'default',
  group: 'pattern',
};
