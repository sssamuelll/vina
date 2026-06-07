/**
 * Default shortcut definitions — CLO3D-compatible key bindings.
 *
 * Every keyboard shortcut in the application is registered here.
 * This is the single source of truth for default bindings.
 */

import type { ShortcutDef } from './ShortcutRegistry';

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  // ─── File ───────────────────────────────────────────────────────────────────
  { id: 'file.save', key: 's', ctrl: true, label: 'Save', category: 'File', context: 'global' },

  // ─── Edit ───────────────────────────────────────────────────────────────────
  { id: 'edit.undo', key: 'z', ctrl: true, label: 'Undo', category: 'Edit', context: 'global' },
  { id: 'edit.redo', key: 'z', ctrl: true, shift: true, label: 'Redo', category: 'Edit', context: 'global' },
  { id: 'edit.redoAlt', key: 'y', ctrl: true, label: 'Redo (Alt)', category: 'Edit', context: 'global' },
  { id: 'edit.copy', key: 'c', ctrl: true, label: 'Copy', category: 'Edit', context: 'global' },
  { id: 'edit.paste', key: 'v', ctrl: true, label: 'Paste', category: 'Edit', context: 'global' },
  { id: 'edit.mirrorPaste', key: 'r', ctrl: true, label: 'Mirror Paste', category: 'Edit', context: 'global' },
  { id: 'edit.duplicate', key: 'd', ctrl: true, label: 'Duplicate', category: 'Edit', context: 'global' },
  { id: 'edit.delete', key: 'Delete', label: 'Delete Selected', category: 'Edit', context: 'global' },
  { id: 'edit.deleteAlt', key: 'Backspace', label: 'Delete Selected (Alt)', category: 'Edit', context: 'global' },

  // ─── Selection ──────────────────────────────────────────────────────────────
  { id: 'selection.selectAll', key: 'a', ctrl: true, label: 'Select All', category: 'Selection', context: 'global' },
  { id: 'selection.deselect', key: 'Escape', label: 'Deselect / Hide Gizmo', category: 'Selection', context: 'global' },
  { id: 'selection.reverseSeam', key: 'b', ctrl: true, label: 'Reverse Sewing', category: 'Selection', context: 'global' },

  // ─── Simulation ─────────────────────────────────────────────────────────────
  { id: 'sim.toggle', key: ' ', label: 'Toggle Simulation', category: 'Simulation', context: 'global' },
  { id: 'sim.hiRes', key: ' ', shift: true, label: 'Simulate Hi-Res', category: 'Simulation', context: 'global' },
  { id: 'sim.reset', key: 'f', ctrl: true, label: 'Reset 3D Arrangement', category: 'Simulation', context: 'global' },

  // ─── 2D Tools (CLO3D mapping, no modifiers) ────────────────────────────────
  { id: 'tool.transform', key: 'a', label: 'Transform Pattern', category: '2D Tools', context: '2d' },
  { id: 'tool.select', key: 'z', label: 'Edit Pattern (Select)', category: '2D Tools', context: '2d' },
  { id: 'tool.editCurve', key: 'v', label: 'Edit Curve Point', category: '2D Tools', context: '2d' },
  { id: 'tool.editConstrain', key: 'c', label: 'Edit Curvature', category: '2D Tools', context: '2d' },
  { id: 'tool.pen', key: 'h', label: 'Polygon (Pen)', category: '2D Tools', context: '2d' },
  { id: 'tool.rectangle', key: 's', label: 'Rectangle', category: '2D Tools', context: '2d' },
  { id: 'tool.circle', key: 'e', label: 'Ellipse (Circle)', category: '2D Tools', context: '2d' },
  { id: 'tool.internalShape', key: 'g', label: 'Internal Shape', category: '2D Tools', context: '2d' },
  { id: 'tool.trace', key: 'i', label: 'Trace', category: '2D Tools', context: '2d' },
  { id: 'tool.dart', key: 'd', label: 'Dart', category: '2D Tools', context: '2d' },
  { id: 'tool.scissors', key: 'x', label: 'Scissors', category: '2D Tools', context: '2d' },
  { id: 'tool.pin', key: 'w', label: 'Pin', category: '2D Tools', context: '2d' },
  { id: 'tool.measure', key: 'm', label: 'Measure', category: '2D Tools', context: '2d' },
  { id: 'tool.walkSeam', key: 'm', shift: true, label: 'Walk Seam', category: '2D Tools', context: '2d' },
  { id: 'tool.merge', key: 'j', label: 'Merge Patterns', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchEdit', key: 't', label: 'Edit Topstitch', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchSegment', key: 'k', label: 'Segment Topstitch', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchFree', key: 'l', label: 'Free Topstitch', category: '2D Tools', context: '2d' },
  { id: 'tool.topstitchSeamline', key: ';', label: 'Seamline Topstitch', category: '2D Tools', context: '2d' },

  { id: 'tool.pomMeasure', key: 'p', label: 'POM Measure', category: '2D Tools', context: '2d' },
  { id: 'tool.offsetOutline', key: 'r', label: 'Offset Outline', category: '2D Tools', context: '2d' },
  { id: 'tool.extendTrim', key: 'u', label: 'Extend / Trim', category: '2D Tools', context: '2d' },
  { id: 'tool.polyPen', key: 'y', label: 'Poly Pen', category: '2D Tools', context: '2d' },
  // Dual-context key (precedent: 'w' = tool.pin 2d + tool3d.pin 3d): plain 'o'
  // is tool3d.meshGrab when the 3D viewport has focus.
  { id: 'tool.seamAllowance', key: 'o', label: 'Seam Allowance', category: '2D Tools', context: '2d' },

  // ─── Sewing ─────────────────────────────────────────────────────────────────
  { id: 'tool.seam', key: 'b', label: 'Edit Sewing (Seam)', category: 'Sewing', context: '2d' },
  { id: 'tool.freeSewing', key: 'f', label: 'Free Sewing', category: 'Sewing', context: '2d' },
  { id: 'tool.segmentSewing', key: 'n', label: 'Segment Sewing', category: 'Sewing', context: '2d' },

  // ─── Shift+Key tools (displaced) ────────────────────────────────────────────
  { id: 'tool.grainline', key: 'g', shift: true, label: 'Grainline Tool', category: '2D Tools', context: '2d' },
  { id: 'tool.freeSewingAlt', key: 'f', shift: true, label: 'Free Sewing (Alt)', category: 'Sewing', context: '2d' },
  { id: 'tool.notch', key: 'n', shift: true, label: 'Notch Tool', category: '2D Tools', context: '2d' },
  { id: 'tool.line', key: 'l', shift: true, label: 'Line Tool', category: '2D Tools', context: '2d' },

  // ─── View ───────────────────────────────────────────────────────────────────
  { id: 'view.toggleSeamAllowance', key: 's', shift: true, label: 'Toggle Seam Allowance', category: 'View', context: 'global' },
  { id: 'view.helpOverlay', key: '/', shift: true, label: 'Shortcut Help', category: 'View', context: 'global' },
  { id: 'view.helpOverlayAlt', key: '?', label: 'Shortcut Help (Alt)', category: 'View', context: 'global' },
  { id: 'view.layersPanel', key: 'l', ctrl: true, shift: true, label: 'Toggle Layers Panel', category: 'View', context: 'global' },
  { id: 'view.xrayMode', key: 'x', shift: true, label: 'Toggle X-Ray Mode', category: 'View', context: 'global' },

  // ─── 3D Tools ───────────────────────────────────────────────────────────────
  { id: 'tool3d.camera', key: 'q', label: 'Select/Move (3D)', category: '3D Tools', context: '3d' },
  { id: 'tool3d.toggleAvatar', key: 'a', shift: true, label: 'Toggle Avatar', category: '3D Tools', context: '3d' },
  { id: 'tool3d.toggleArrangement', key: 'f', shift: true, label: 'Toggle Arrangement Tool', category: '3D Tools', context: '3d' },
  { id: 'tool3d.pin', key: 'w', label: 'Toggle Pin Tool (3D)', category: '3D Tools', context: '3d' },
  { id: 'tool3d.clearPins', key: 'w', ctrl: true, label: 'Clear All Pins', category: '3D Tools', context: '3d' },
  { id: 'tool3d.focusPiece', key: 'f', label: 'Focus Selected Piece', category: '3D Tools', context: '3d' },
  { id: 'tool3d.snapshot', key: 'F10', label: 'Snapshot 3D', category: '3D Tools', context: '3d' },
  { id: 'tool3d.steamBrush', key: 'b', label: 'Steam Brush', category: '3D Tools', context: '3d' },
  { id: 'tool3d.meshGrab', key: 'o', label: 'Mesh Grab', category: '3D Tools', context: '3d' },

  // ─── 3D Camera Presets (Numpad) ─────────────────────────────────────────────
  { id: 'camera.front', key: '2', label: 'Front View', category: '3D Tools', context: '3d' },
  { id: 'camera.back', key: '8', label: 'Back View', category: '3D Tools', context: '3d' },
  { id: 'camera.right', key: '4', label: 'Right View', category: '3D Tools', context: '3d' },
  { id: 'camera.left', key: '6', label: 'Left View', category: '3D Tools', context: '3d' },
  { id: 'camera.top', key: '5', label: 'Top View', category: '3D Tools', context: '3d' },
  { id: 'camera.bottom', key: '0', label: 'Bottom View', category: '3D Tools', context: '3d' },
  { id: 'camera.threeQuarterRight', key: '1', label: '3/4 Right View', category: '3D Tools', context: '3d' },
  { id: 'camera.threeQuarterLeft', key: '3', label: '3/4 Left View', category: '3D Tools', context: '3d' },

  // ─── Fit Map Modes ──────────────────────────────────────────────────────────
  { id: 'fitmap.stress', key: '6', alt: true, label: 'Stress Map', category: '3D Tools', context: '3d' },
  { id: 'fitmap.strain', key: '7', alt: true, label: 'Strain Map', category: '3D Tools', context: '3d' },
  { id: 'fitmap.fit', key: '8', alt: true, label: 'Fit Map', category: '3D Tools', context: '3d' },
  { id: 'fitmap.pressure', key: '9', alt: true, label: 'Pressure Points', category: '3D Tools', context: '3d' },
  { id: 'fitmap.none', key: '0', alt: true, label: 'Fit Map Off', category: '3D Tools', context: '3d' },

  // ─── Copilot ────────────────────────────────────────────────────────────────
  { id: 'copilot.focusChat', key: '/', ctrl: true, label: 'Focus Chat Input', category: 'View', context: 'copilot' },
  { id: 'copilot.togglePanel', key: '/', ctrl: true, shift: true, label: 'Toggle Chat Panel', category: 'View', context: 'copilot' },

  // ─── Command Palette ────────────────────────────────────────────────────────
  { id: 'app.commandPalette', key: 'k', ctrl: true, label: 'Command Palette', category: 'View', context: 'global' },
];
