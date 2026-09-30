import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Un cuerpo de la biblioteca no se estira (spec § 5): lo que se dibuja, choca o se coloca sobre
 * él tiene que leer SUS medidas (`medidasDelCuerpo`), no las del proyecto, que ahora son las del
 * patrón. Si uno de estos archivos vuelve a leer `avatar.measurements`, la colocación se separa
 * del cuerpo en cuanto María edita una medida: piezas sembradas por dentro o flotando.
 */
const LECTORES_DEL_CUERPO = [
  'src/components/Viewport3D/AvatarModel.tsx',
  'src/components/Viewport3D/Viewport3D.tsx',
  'src/components/Viewport3D/GarmentSimulation.tsx',
  'src/components/Viewport3D/useSimulationLifecycle.ts',
  'src/components/Viewport3D/useAvatarTape.ts',
  'src/components/Viewport3D/ClothMesh.tsx',
  'src/store/autoSewThunk.ts',
  'src/copilot/action/tools/definitions/3dInteractionTools.ts',
  'src/copilot/action/tools/definitions/simulationTools.ts',
  'src/hooks/useKeyboardShortcuts.ts',
];

describe('lo que va sobre el cuerpo lee las medidas del cuerpo', () => {
  it.each(LECTORES_DEL_CUERPO)('%s', (archivo) => {
    const src = readFileSync(archivo, 'utf8');
    expect(src).toContain('medidasDelCuerpo');
    expect(src.match(/avatar\.measurements/g) ?? []).toEqual([]);
  });
});
