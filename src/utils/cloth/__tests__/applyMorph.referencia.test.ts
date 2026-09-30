import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyMorph } from '../avatarMeshExtractor';

const eu38 = { chest: 88, waist: 77.1, hip: 97, shoulderWidth: 36.1, height: 161.4, armLength: 53.7, inseam: 77.7 };

function esqueleto(): THREE.Group {
  const g = new THREE.Group();
  for (const nombre of ['Hips', 'Spine', 'Spine1', 'LeftShoulder', 'LeftArm', 'LeftUpLeg']) {
    const b = new THREE.Bone();
    b.name = nombre;
    g.add(b);
  }
  return g;
}

const escalas = (g: THREE.Object3D) => {
  const out: Record<string, number[]> = {};
  g.traverse((o) => { if ((o as THREE.Bone).isBone) out[o.name] = o.scale.toArray(); });
  return out;
};

describe('applyMorph (colisión por URL) con la referencia del cuerpo', () => {
  it('un cuerpo de la biblioteca medido contra sí mismo deja todos los huesos en escala 1', () => {
    const g = esqueleto();
    applyMorph(g, eu38, {}, eu38);
    expect(Object.values(escalas(g)).flat().every((s) => s === 1)).toBe(true);
  });

  it('sin referencia, estira como hoy contra el hombre de 180 cm', () => {
    const g = esqueleto();
    applyMorph(g, eu38, {});
    expect(escalas(g).Spine1[0]).toBeCloseTo(88 / 96);
  });
});
