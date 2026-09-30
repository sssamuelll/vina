/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { loadProject, restoreProject, setAvatarModelUrl } from '../projectSlice';
import type { VinaProject } from '../../types/types';
import { NEW_PROJECT } from '../actions';
import { AVATAR_POR_DEFECTO } from '../../avatares/catalogo';

const medidas = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };
const proyecto = (modelUrl: string): VinaProject => ({
  id: 'p', name: 'Guardado', pieces: [], seams: [], fabrics: [],
  avatar: { id: 'a', name: 'A', modelUrl, measurements: medidas },
  createdAt: 1000, updatedAt: 1000,
} as any);

// Estado de partida con un modelo propio cargado: al abrir otro proyecto no puede quedar pegado.
const conModeloPropio = reducer(reducer(undefined, { type: '@@INIT' }), setAvatarModelUrl('blob:http://localhost/propio'));

describe('al cargar, el cuerpo sale de avatar.modelUrl (spec § 5)', () => {
  it.each([
    ['loadProject', loadProject, '/avatares/hombre-eu50.glb'],
    ['restoreProject', restoreProject, '/avatares/hombre-eu50.glb'],
    ['restoreProject', restoreProject, '/avatares/mujer-eu38.glb'], // cada arranque con autoguardado
  ] as const)('%s restaura %s y las medidas del patrón que se guardaron', (_, accion, url) => {
    const s = reducer(conModeloPropio, accion(proyecto(url)));
    expect(s.avatarModelUrl).toBe(url);
    expect(s.avatar.modelUrl).toBe(url);
    // las del patrón, no las de la talla: María las editó y el cuerpo no se estira por eso
    expect(s.avatar.measurements).toEqual(medidas);
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

describe('proyecto nuevo', () => {
  it('arranca con Mujer EU 38 y sus medidas, al abrir la app y con Nuevo proyecto', () => {
    for (const s of [reducer(undefined, { type: '@@INIT' }), reducer(conModeloPropio, NEW_PROJECT())]) {
      expect(s.avatar).toBe(AVATAR_POR_DEFECTO);
      expect(s.avatarModelUrl).toBe('/avatares/mujer-eu38.glb');
    }
  });
});
