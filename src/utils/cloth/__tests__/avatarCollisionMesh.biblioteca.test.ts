import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// El colisionador por URL (modo Maniquí, avatar oculto, simular antes de que cargue la GLB) tiene
// que ser el mismo cuerpo que dibuja AvatarModel: sin recentrar uno de la biblioteca, y estirado
// contra la referencia del cuerpo cargado.
const importMesh = vi.fn(async () => ({ scene: new THREE.Group() }));
const applyMorph = vi.fn();
vi.mock('../../import/meshImporter', () => ({ importMesh }));
vi.mock('../avatarMeshExtractor', () => ({
  applyPose: vi.fn(),
  applyMorph,
  extractMeshData: () => ({ vertices: new Float32Array(), indices: new Uint32Array(), normals: null }),
}));

const { extractAvatarCollisionMesh } = await import('../avatarCollisionMesh');

const eu38 = { chest: 88, waist: 77.1, hip: 97, shoulderWidth: 36.1, height: 161.4, armLength: 53.7, inseam: 77.7 };

describe('colisión por URL', () => {
  beforeEach(() => { importMesh.mockClear(); applyMorph.mockClear(); });

  it('un cuerpo de la biblioteca no se recentra: queda donde lo deja el generador, como en el render', async () => {
    await extractAvatarCollisionMesh('/avatares/mujer-eu38.glb', 1.614);
    expect(importMesh).toHaveBeenCalledWith('/avatares/mujer-eu38.glb', 'mujer-eu38.glb', expect.objectContaining({ centrar: false }));
  });

  it('un modelo propio sí se centra, como antes', async () => {
    await extractAvatarCollisionMesh('blob:http://localhost/x#mio.glb', 1.8);
    expect(importMesh).toHaveBeenCalledWith('blob:http://localhost/x#mio.glb', 'x#mio.glb', expect.objectContaining({ centrar: true }));
  });

  it('el morph llega a applyMorph con su referencia', async () => {
    const ref = { ...eu38 };
    await extractAvatarCollisionMesh('/avatares/mujer-eu38.glb', 1.614, undefined, { medidas: eu38, morphTargets: {}, referencia: ref });
    expect(applyMorph).toHaveBeenCalledWith(expect.anything(), eu38, {}, ref);
  });
});
