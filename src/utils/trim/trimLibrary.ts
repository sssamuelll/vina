// src/utils/trim/trimLibrary.ts
import type { TrimPreset } from '../../types/trim';

export const TRIM_LIBRARY: readonly TrimPreset[] = [
  // Buttons (5)
  { id: 'button-flat-15mm', name: 'Flat Button 15mm', nameEs: 'Botón Plano 15mm', type: 'button', material: 'plastic', color: '#1a1a1a', size: 15, unitCost: 0.15, tags: ['button', 'flat', 'plastic', 'shirt'] },
  { id: 'button-flat-20mm', name: 'Flat Button 20mm', nameEs: 'Botón Plano 20mm', type: 'button', material: 'plastic', color: '#1a1a1a', size: 20, unitCost: 0.20, tags: ['button', 'flat', 'plastic', 'coat'] },
  { id: 'button-shank-18mm', name: 'Shank Button 18mm', nameEs: 'Botón de Pie 18mm', type: 'button', material: 'metal', color: '#c0c0c0', size: 18, unitCost: 0.50, tags: ['button', 'shank', 'metal', 'jacket'] },
  { id: 'button-horn-20mm', name: 'Horn Button 20mm', nameEs: 'Botón de Cuerno 20mm', type: 'button', material: 'horn', color: '#3d2b1f', size: 20, unitCost: 1.20, tags: ['button', 'horn', 'natural', 'coat'] },
  { id: 'button-snap-12mm', name: 'Snap Button 12mm', nameEs: 'Botón de Presión 12mm', type: 'button', material: 'metal', color: '#c0c0c0', size: 12, unitCost: 0.30, tags: ['button', 'snap', 'metal'] },
  // Zippers (4)
  { id: 'zipper-nylon-coil-3mm', name: 'Nylon Coil Zipper 3mm', nameEs: 'Cremallera Espiral Nylon 3mm', type: 'zipper', material: 'nylon', color: '#1a1a1a', size: 3, unitCost: 0.80, tags: ['zipper', 'nylon', 'coil', 'lightweight'] },
  { id: 'zipper-molded-5mm', name: 'Molded Zipper 5mm', nameEs: 'Cremallera Inyectada 5mm', type: 'zipper', material: 'plastic', color: '#1a1a1a', size: 5, unitCost: 1.20, tags: ['zipper', 'molded', 'jacket'] },
  { id: 'zipper-metal-5mm', name: 'Metal Zipper 5mm', nameEs: 'Cremallera Metálica 5mm', type: 'zipper', material: 'metal', color: '#b8860b', size: 5, unitCost: 2.50, tags: ['zipper', 'metal', 'brass', 'jeans'] },
  { id: 'zipper-invisible', name: 'Invisible Zipper', nameEs: 'Cremallera Invisible', type: 'zipper', material: 'nylon', color: '#1a1a1a', size: 3, unitCost: 1.00, tags: ['zipper', 'invisible', 'dress', 'skirt'] },
  // Snaps (2)
  { id: 'snap-prong-10mm', name: 'Prong Snap 10mm', nameEs: 'Broche de Presión 10mm', type: 'snap', material: 'metal', color: '#c0c0c0', size: 10, unitCost: 0.25, tags: ['snap', 'prong', 'metal'] },
  { id: 'snap-ring-12mm', name: 'Ring Snap 12mm', nameEs: 'Broche Anillo 12mm', type: 'snap', material: 'metal', color: '#c0c0c0', size: 12, unitCost: 0.30, tags: ['snap', 'ring', 'metal'] },
  // Rivets (2)
  { id: 'rivet-flat-8mm', name: 'Flat Rivet 8mm', nameEs: 'Remache Plano 8mm', type: 'rivet', material: 'metal', color: '#b8860b', size: 8, unitCost: 0.15, tags: ['rivet', 'flat', 'brass', 'jeans'] },
  { id: 'rivet-cap-10mm', name: 'Cap Rivet 10mm', nameEs: 'Remache Casquillo 10mm', type: 'rivet', material: 'metal', color: '#c0c0c0', size: 10, unitCost: 0.20, tags: ['rivet', 'cap', 'metal'] },
  // Buckles (2)
  { id: 'buckle-single-prong-25mm', name: 'Single Prong Buckle 25mm', nameEs: 'Hebilla Sencilla 25mm', type: 'buckle', material: 'metal', color: '#c0c0c0', size: 25, unitCost: 1.50, tags: ['buckle', 'prong', 'belt', 'metal'] },
  { id: 'buckle-roller-30mm', name: 'Roller Buckle 30mm', nameEs: 'Hebilla Rodillo 30mm', type: 'buckle', material: 'metal', color: '#b8860b', size: 30, unitCost: 2.00, tags: ['buckle', 'roller', 'belt', 'brass'] },
  // Rings (3)
  { id: 'ring-d-25mm', name: 'D-Ring 25mm', nameEs: 'Anilla D 25mm', type: 'ring', material: 'metal', color: '#c0c0c0', size: 25, unitCost: 0.40, tags: ['ring', 'd-ring', 'strap', 'metal'] },
  { id: 'ring-o-20mm', name: 'O-Ring 20mm', nameEs: 'Anilla O 20mm', type: 'ring', material: 'metal', color: '#c0c0c0', size: 20, unitCost: 0.35, tags: ['ring', 'o-ring', 'metal'] },
  { id: 'ring-rectangle-25mm', name: 'Rectangle Ring 25mm', nameEs: 'Anilla Rectangular 25mm', type: 'ring', material: 'metal', color: '#c0c0c0', size: 25, unitCost: 0.45, tags: ['ring', 'rectangle', 'strap', 'metal'] },
  // Hook & Eye (1)
  { id: 'hook-eye-10mm', name: 'Hook & Eye 10mm', nameEs: 'Corchete 10mm', type: 'hook-eye', material: 'metal', color: '#c0c0c0', size: 10, unitCost: 0.10, tags: ['hook', 'eye', 'closure', 'metal'] },
  // Drawstring Stops (2)
  { id: 'drawstring-cord-stop', name: 'Cord Stop', nameEs: 'Tope de Cordón', type: 'drawstring-stop', material: 'plastic', color: '#1a1a1a', size: 8, unitCost: 0.10, tags: ['drawstring', 'stop', 'cord', 'plastic'] },
  { id: 'drawstring-toggle', name: 'Toggle', nameEs: 'Pasador', type: 'drawstring-stop', material: 'plastic', color: '#1a1a1a', size: 12, unitCost: 0.15, tags: ['drawstring', 'toggle', 'plastic'] },
];

/** Look up a preset by ID */
export function getTrimPreset(id: string): TrimPreset | undefined {
  return TRIM_LIBRARY.find(p => p.id === id);
}

/** Filter presets by type */
export function getTrimPresetsByType(type: string): TrimPreset[] {
  return TRIM_LIBRARY.filter(p => p.type === type);
}

/** Search presets by name, tag, or material */
export function searchTrimPresets(query: string): TrimPreset[] {
  const q = query.toLowerCase();
  return TRIM_LIBRARY.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.tags.some(t => t.includes(q)) ||
    p.material.toLowerCase().includes(q),
  );
}
