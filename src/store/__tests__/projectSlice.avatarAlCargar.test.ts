/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { loadProject, restoreProject, setAvatarModelUrl } from '../projectSlice';
import type { VinaProject } from '../../types/types';

const medidas = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };
const proyecto = (modelUrl: string): VinaProject => ({
  id: 'p', name: 'Guardado', pieces: [], seams: [], fabrics: [],
  avatar: { id: 'a', name: 'A', modelUrl, measurements: medidas },
  createdAt: 1000, updatedAt: 1000,
} as any);

// Estado de partida con un modelo propio cargado: al abrir otro proyecto no puede quedar pegado.
const conModeloPropio = reducer(reducer(undefined, { type: '@@INIT' }), setAvatarModelUrl('blob:http://localhost/propio'));

describe('al cargar, el cuerpo sale de avatar.modelUrl (spec § 5)', () => {
  it.each([['loadProject', loadProject], ['restoreProject', restoreProject]] as const)('%s restaura una talla de la biblioteca', (_, accion) => {
    const s = reducer(conModeloPropio, accion(proyecto('/avatares/hombre-eu50.glb')));
    expect(s.avatarModelUrl).toBe('/avatares/hombre-eu50.glb');
    expect(s.avatar.modelUrl).toBe('/avatares/hombre-eu50.glb');
  });

  it.each(['', '/default-avatar.glb', 'blob:http://localhost/viejo'])(
    'un proyecto sin cuerpo de la biblioteca (%j) abre con Mujer EU 38 y conserva sus medidas',
    (modelUrl) => {
      const s = reducer(conModeloPropio, restoreProject(proyecto(modelUrl)));
      expect(s.avatarModelUrl).toBe('/avatares/mujer-eu38.glb');
      expect(s.avatar.modelUrl).toBe('/avatares/mujer-eu38.glb');
      expect(s.avatar.measurements).toEqual(medidas);
    },
  );
});
