/**
 * Default shortcut definitions — CLO3D-compatible key bindings.
 *
 * Every keyboard shortcut in the application is registered here.
 * This is the single source of truth for default bindings.
 */

import type { ShortcutDef } from './ShortcutRegistry';

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  // ─── File ───────────────────────────────────────────────────────────────────
  { id: 'file.save', key: 's', ctrl: true, label: 'Guardar', category: 'File', context: 'global' },

  // ─── Edit ───────────────────────────────────────────────────────────────────
  { id: 'edit.undo', key: 'z', ctrl: true, label: 'Deshacer', category: 'Edit', context: 'global' },
  { id: 'edit.redo', key: 'z', ctrl: true, shift: true, label: 'Rehacer', category: 'Edit', context: 'global' },
  { id: 'edit.redoAlt', key: 'y', ctrl: true, label: 'Rehacer (alternativo)', category: 'Edit', context: 'global' },
  { id: 'edit.copy', key: 'c', ctrl: true, label: 'Copiar', category: 'Edit', context: 'global' },
  { id: 'edit.paste', key: 'v', ctrl: true, label: 'Pegar', category: 'Edit', context: 'global' },
  { id: 'edit.mirrorPaste', key: 'r', ctrl: true, label: 'Pegar en espejo', category: 'Edit', context: 'global' },
  { id: 'edit.duplicate', key: 'd', ctrl: true, label: 'Duplicar', category: 'Edit', context: 'global' },
  { id: 'edit.delete', key: 'Delete', label: 'Eliminar selección', category: 'Edit', context: 'global' },
  { id: 'edit.deleteAlt', key: 'Backspace', label: 'Eliminar selección (alternativo)', category: 'Edit', context: 'global' },

  // ─── Selection ──────────────────────────────────────────────────────────────
  { id: 'selection.selectAll', key: 'a', ctrl: true, label: 'Seleccionar todo', category: 'Selection', context: 'global' },
  { id: 'selection.deselect', key: 'Escape', label: 'Quitar selección / ocultar manipulador', category: 'Selection', context: 'global' },
  { id: 'selection.reverseSeam', key: 'b', ctrl: true, label: 'Invertir dirección de costura', category: 'Selection', context: 'global' },

  // ─── Simulation ─────────────────────────────────────────────────────────────
  { id: 'sim.toggle', key: ' ', label: 'Iniciar o pausar simulación', category: 'Simulation', context: 'global' },
  { id: 'sim.hiRes', key: ' ', shift: true, label: 'Simular en alta resolución', category: 'Simulation', context: 'global' },
  { id: 'sim.reset', key: 'f', ctrl: true, label: 'Restablecer colocación 3D', category: 'Simulation', context: 'global' },

  // ─── 2D Tools (CLO3D mapping, no modifiers) ────────────────────────────────
  { id: 'tool.transform', key: 'a', label: 'Transformar patrón', category: '2D Tools', context: '2d' },
  { id: 'tool.select', key: 'z', label: 'Seleccionar', category: '2D Tools', context: '2d' },
  { id: 'tool.editPattern', key: 'q', label: 'Editar patrón', category: '2D Tools', context: '2d' },
  { id: 'tool.editCurve', key: 'v', label: 'Editar punto de curva', category: '2D Tools', context: '2d' },
  { id: 'tool.pen', key: 'h', label: 'Pluma', category: '2D Tools', context: '2d' },
  { id: 'tool.rectangle', key: 's', label: 'Rectángulo', category: '2D Tools', context: '2d' },
  // La E vuelve de la reserva de F7: el círculo ya tiene gesto (#1111).
  { id: 'tool.circle', key: 'e', label: 'Elipse (círculo)', category: '2D Tools', context: '2d' },
  { id: 'tool.internalShape', key: 'g', label: 'Línea interna', category: '2D Tools', context: '2d' },
  { id: 'tool.scissors', key: 'x', label: 'Tijeras', category: '2D Tools', context: '2d' },
  { id: 'tool.measure', key: 'm', label: 'Medir', category: '2D Tools', context: '2d' },
  { id: 'tool.walkSeam', key: 'm', shift: true, label: 'Recorrer costura', category: '2D Tools', context: '2d' },
  { id: 'tool.merge', key: 'j', label: 'Unir patrones', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchSegment', key: 'k', label: 'Pespunte por tramo', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchFree', key: 'l', label: 'Pespunte libre', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchSeamline', key: ';', label: 'Pespunte sobre costura', category: '2D Tools', context: '2d' },

  { id: 'tool.offsetOutline', key: 'r', label: 'Desplazar contorno', category: '2D Tools', context: '2d' },
  { id: 'tool.extendTrim', key: 'u', label: 'Extender / recortar', category: '2D Tools', context: '2d' },
  // Tecla de doble contexto: 'o' es tool3d.meshGrab cuando el foco está en la
  // vista 3D. (El precedente que citaba este comentario, 'w' = tool.pin 2d +
  // tool3d.pin 3d, dejó de existir: tool.pin se reservó en F7 y hoy 'w' es solo
  // de 3D.)
  { id: 'tool.seamAllowance', key: 'o', label: 'Margen de costura', category: '2D Tools', context: '2d' },

  // ─── Sewing ─────────────────────────────────────────────────────────────────
  { id: 'tool.seamEdit', key: 'b', label: 'Editar costuras', category: 'Sewing', context: '2d' },
  { id: 'tool.seam', key: 'n', label: 'Coser', category: 'Sewing', context: '2d' },

  // ─── Shift+Key tools (displaced) ────────────────────────────────────────────
  { id: 'tool.grainline', key: 'g', shift: true, label: 'Hilo', category: '2D Tools', context: '2d' },
  { id: 'tool.notch', key: 'n', shift: true, label: 'Piquete', category: '2D Tools', context: '2d' },

  // ─── View ───────────────────────────────────────────────────────────────────
  { id: 'view.toggleSeamAllowance', key: 's', shift: true, label: 'Mostrar u ocultar margen de costura', category: 'View', context: 'global' },
  // Aquí vivían `view.helpOverlay` (⇧/) y `view.helpOverlayAlt` (?), retirados
  // el 2026-09-14 (#1170): estaban registrados, **no tenían manejador en
  // ninguna parte** y no existe pantalla de ayuda que abrir — ni siquiera un
  // consumidor de `getShortcutMap()`, que se exportó para ella. Un atajo en el
  // catálogo que no hace nada es la misma enfermedad que el rótulo de menú que
  // miente, por el otro lado del registro; y encima había un test vigilando su
  // ortografía. La pantalla de ayuda es una funcionalidad que hace falta, y por
  // eso vive como issue y no como dos líneas muertas aquí.
  { id: 'view.layersPanel', key: 'l', ctrl: true, shift: true, label: 'Mostrar u ocultar panel de capas', category: 'View', context: 'global' },
  { id: 'view.xrayMode', key: 'x', shift: true, label: 'Activar o desactivar modo rayos X', category: 'View', context: 'global' },
  // Anunciado como ⌘0 por Ver ▸ «Ajustar zoom al patrón» desde siempre y sin
  // registrar hasta el 2026-09-13 (#1163). El `0` pelado de más abajo es la
  // vista inferior de la cámara 3D: no chocan, este lleva Ctrl.
  { id: 'view.fitPattern', key: '0', ctrl: true, label: 'Ajustar zoom al patrón', category: 'View', context: 'global' },

  // ─── 3D Tools ───────────────────────────────────────────────────────────────
  { id: 'tool3d.camera', key: 'q', label: 'Seleccionar/mover (3D)', category: '3D Tools', context: '3d' },
  { id: 'tool3d.toggleAvatar', key: 'a', shift: true, label: 'Mostrar u ocultar avatar', category: '3D Tools', context: '3d' },
  { id: 'tool3d.toggleArrangement', key: 'f', shift: true, label: 'Activar o desactivar herramienta de colocación', category: '3D Tools', context: '3d' },
  { id: 'tool3d.pin', key: 'w', label: 'Activar o desactivar herramienta de fijación (3D)', category: '3D Tools', context: '3d' },
  { id: 'tool3d.clearPins', key: 'w', ctrl: true, label: 'Quitar todas las fijaciones', category: '3D Tools', context: '3d' },
  { id: 'tool3d.focusPiece', key: 'f', label: 'Enfocar pieza seleccionada', category: '3D Tools', context: '3d' },
  { id: 'tool3d.snapshot', key: 'F10', label: 'Captura 3D', category: '3D Tools', context: '3d' },
  { id: 'tool3d.steamBrush', key: 'b', label: 'Plancha a vapor', category: '3D Tools', context: '3d' },
  { id: 'tool3d.meshGrab', key: 'o', label: 'Agarre de malla', category: '3D Tools', context: '3d' },

  // ─── 3D Camera Presets (Numpad) ─────────────────────────────────────────────
  { id: 'camera.front', key: '2', label: 'Vista frontal', category: '3D Tools', context: '3d' },
  { id: 'camera.back', key: '8', label: 'Vista trasera', category: '3D Tools', context: '3d' },
  { id: 'camera.right', key: '4', label: 'Vista derecha', category: '3D Tools', context: '3d' },
  { id: 'camera.left', key: '6', label: 'Vista izquierda', category: '3D Tools', context: '3d' },
  { id: 'camera.top', key: '5', label: 'Vista superior', category: '3D Tools', context: '3d' },
  { id: 'camera.bottom', key: '0', label: 'Vista inferior', category: '3D Tools', context: '3d' },
  { id: 'camera.threeQuarterRight', key: '1', label: 'Vista 3/4 derecha', category: '3D Tools', context: '3d' },
  { id: 'camera.threeQuarterLeft', key: '3', label: 'Vista 3/4 izquierda', category: '3D Tools', context: '3d' },

  // ─── Fit Map Modes ──────────────────────────────────────────────────────────
  { id: 'fitmap.stress', key: '6', alt: true, label: 'Mapa de tensión', category: '3D Tools', context: '3d' },
  { id: 'fitmap.strain', key: '7', alt: true, label: 'Mapa de estiramiento', category: '3D Tools', context: '3d' },
  { id: 'fitmap.fit', key: '8', alt: true, label: 'Mapa de ajuste', category: '3D Tools', context: '3d' },
  { id: 'fitmap.pressure', key: '9', alt: true, label: 'Puntos de presión', category: '3D Tools', context: '3d' },
  { id: 'fitmap.none', key: '0', alt: true, label: 'Desactivar mapa de ajuste', category: '3D Tools', context: '3d' },

  // ─── Copilot ────────────────────────────────────────────────────────────────
  { id: 'copilot.focusChat', key: '/', ctrl: true, label: 'Enfocar campo del chat', category: 'View', context: 'copilot' },
  { id: 'copilot.togglePanel', key: '/', ctrl: true, shift: true, label: 'Mostrar u ocultar panel del chat', category: 'View', context: 'copilot' },

  // ─── Command Palette ────────────────────────────────────────────────────────
  { id: 'app.commandPalette', key: 'k', ctrl: true, label: 'Paleta de comandos', category: 'View', context: 'global' },
];

/**
 * Atajos 2D reservados: la tecla existe, la herramienta todavía no.
 *
 * Revisión adversarial de UI del 2026-09-04, hallazgo F7. Un barrido de las 52
 * teclas contra la app viva encontró siete que metían a María en un modo
 * inerte: la tira le dibujaba la cabina (nombre, atajo, opciones), el cursor se
 * ponía en cruz, y ningún clic hacía nada, porque el despachador
 * (`src/components/PatternEditor/useEditorInteractions.ts`) no conduce esos
 * ids. Se sacaron de `DEFAULT_SHORTCUTS` para que la tecla no prometa nada.
 *
 * No se borran, se reservan: cuando la herramienta exista, su atajo vuelve
 * intacto al sitio que ya era suyo. Quedan SEIS: el círculo ya cobró su E
 * (#1111, María: «círculo es indispensable»), que era el primero de la cola.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F7.
 */
export const ATAJOS_2D_SIN_GESTO: ShortcutDef[] = [
  { id: 'tool.dart', key: 'd', label: 'Pinza', category: '2D Tools', context: '2d' },
  { id: 'tool.editConstrain', key: 'c', label: 'Editar curvatura', category: '2D Tools', context: '2d' },
  { id: 'tool.pin', key: 'w', label: 'Fijar', category: '2D Tools', context: '2d' },
  { id: 'tool.pomMeasure', key: 'p', label: 'Medir POM', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchEdit', key: 't', label: 'Editar pespunte', category: '2D Tools', context: '2d' },
  { id: 'tool.trace', key: 'i', label: 'Trazar', category: '2D Tools', context: '2d' },
];
