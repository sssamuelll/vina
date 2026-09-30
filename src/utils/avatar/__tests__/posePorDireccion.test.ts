import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PRESETS_DE_POSE, resolverPreset, type Direccion } from '../posePorDireccion';

const DEG2RAD = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);

/** Un hueso cuya Y local apunta a `dir` en el mundo, girado `rollDeg` sobre su propio eje. */
function orientacion(dir: Direccion, rollDeg: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...dir).normalize());
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, rollDeg * DEG2RAD));
}

interface Segmento { nombre: string; padre: string | null; inicio: Direccion; dir: Direccion; largo: number; roll: number }

/** Arma un esqueleto con orientaciones y posiciones de MUNDO dadas, como lo cargaría GLTFLoader. */
function esqueleto(segmentos: Segmento[]) {
  const raiz = new THREE.Group();
  const huesos = new Map<string, THREE.Bone>();
  const mundoQ = new Map<string, THREE.Quaternion>();
  const mundoP = new Map<string, THREE.Vector3>();
  for (const s of segmentos) {
    const b = new THREE.Bone();
    b.name = s.nombre;
    const q = orientacion(s.dir, s.roll);
    const p = s.padre
      ? mundoP.get(s.padre)!.clone().add(new THREE.Vector3(...segmentos.find((x) => x.nombre === s.padre)!.dir).normalize()
        .multiplyScalar(segmentos.find((x) => x.nombre === s.padre)!.largo))
      : new THREE.Vector3(...s.inicio);
    if (s.padre) {
      const qp = mundoQ.get(s.padre)!;
      b.quaternion.copy(qp.clone().invert().multiply(q));
      b.position.copy(p.clone().sub(mundoP.get(s.padre)!).applyQuaternion(qp.clone().invert()));
      huesos.get(s.padre)!.add(b);
    } else {
      b.quaternion.copy(q);
      b.position.copy(p);
      raiz.add(b);
    }
    huesos.set(s.nombre, b);
    mundoQ.set(s.nombre, q);
    mundoP.set(s.nombre, p);
  }
  raiz.updateMatrixWorld(true);
  const binds = new Map([...huesos].map(([n, b]) => [n, b.quaternion.clone()]));
  return { raiz, huesos, binds };
}

const c47 = Math.cos(47 * DEG2RAD), s47 = Math.sin(47 * DEG2RAD);
/** Dos rigs con los mismos nombres Mixamo: el escaneo (reposo en T, ejes limpios) y uno como las
 *  31 de la biblioteca (reposo en A a 47°, codo doblado adelante, ejes girados sobre el hueso). */
const RIGS: Record<string, Segmento[]> = {
  'rig en T': [
    { nombre: 'Hips', padre: null, inicio: [0, 0.9, 0], dir: [0, 1, 0], largo: 0.4, roll: 0 },
    { nombre: 'LeftArm', padre: 'Hips', inicio: [0, 0, 0], dir: [1, 0, 0], largo: 0.28, roll: 90 },
    { nombre: 'LeftForeArm', padre: 'LeftArm', inicio: [0, 0, 0], dir: [1, 0, 0], largo: 0.25, roll: 90 },
    { nombre: 'LeftHand', padre: 'LeftForeArm', inicio: [0, 0, 0], dir: [1, 0, 0], largo: 0.1, roll: 90 },
    { nombre: 'RightArm', padre: 'Hips', inicio: [0, 0, 0], dir: [-1, 0, 0], largo: 0.28, roll: -90 },
    { nombre: 'RightForeArm', padre: 'RightArm', inicio: [0, 0, 0], dir: [-1, 0, 0], largo: 0.25, roll: -90 },
    { nombre: 'RightHand', padre: 'RightForeArm', inicio: [0, 0, 0], dir: [-1, 0, 0], largo: 0.1, roll: -90 },
    { nombre: 'LeftUpLeg', padre: 'Hips', inicio: [0, 0, 0], dir: [0.05, -1, 0], largo: 0.42, roll: 180 },
    { nombre: 'LeftLeg', padre: 'LeftUpLeg', inicio: [0, 0, 0], dir: [0, -1, 0], largo: 0.4, roll: 180 },
    { nombre: 'LeftFoot', padre: 'LeftLeg', inicio: [0, 0, 0], dir: [0, -0.3, 1], largo: 0.12, roll: 0 },
    { nombre: 'RightUpLeg', padre: 'Hips', inicio: [0, 0, 0], dir: [-0.05, -1, 0], largo: 0.42, roll: 180 },
    { nombre: 'RightLeg', padre: 'RightUpLeg', inicio: [0, 0, 0], dir: [0, -1, 0], largo: 0.4, roll: 180 },
    { nombre: 'RightFoot', padre: 'RightLeg', inicio: [0, 0, 0], dir: [0, -0.3, 1], largo: 0.12, roll: 0 },
  ],
  'rig en A oblicuo': [
    { nombre: 'Hips', padre: null, inicio: [0, 0.9, 0.02], dir: [0, 1, 0.05], largo: 0.4, roll: 10 },
    { nombre: 'LeftArm', padre: 'Hips', inicio: [0, 0, 0], dir: [c47, -s47, 0.01], largo: 0.26, roll: 37 },
    { nombre: 'LeftForeArm', padre: 'LeftArm', inicio: [0, 0, 0], dir: [0.117, -0.134, 0.158], largo: 0.24, roll: 61 },
    { nombre: 'LeftHand', padre: 'LeftForeArm', inicio: [0, 0, 0], dir: [0.2, -0.5, 0.3], largo: 0.1, roll: 12 },
    { nombre: 'RightArm', padre: 'Hips', inicio: [0, 0, 0], dir: [-c47, -s47, 0.01], largo: 0.26, roll: -37 },
    { nombre: 'RightForeArm', padre: 'RightArm', inicio: [0, 0, 0], dir: [-0.117, -0.134, 0.158], largo: 0.24, roll: -61 },
    { nombre: 'RightHand', padre: 'RightForeArm', inicio: [0, 0, 0], dir: [-0.2, -0.5, 0.3], largo: 0.1, roll: -12 },
    { nombre: 'LeftUpLeg', padre: 'Hips', inicio: [0, 0, 0], dir: [0.1, -1, 0.02], largo: 0.4, roll: 150 },
    { nombre: 'LeftLeg', padre: 'LeftUpLeg', inicio: [0, 0, 0], dir: [0, -1, -0.05], largo: 0.38, roll: 170 },
    { nombre: 'LeftFoot', padre: 'LeftLeg', inicio: [0, 0, 0], dir: [0, -0.4, 1], largo: 0.11, roll: 5 },
    { nombre: 'RightUpLeg', padre: 'Hips', inicio: [0, 0, 0], dir: [-0.1, -1, 0.02], largo: 0.4, roll: -150 },
    { nombre: 'RightLeg', padre: 'RightUpLeg', inicio: [0, 0, 0], dir: [0, -1, -0.05], largo: 0.38, roll: -170 },
    { nombre: 'RightFoot', padre: 'RightLeg', inicio: [0, 0, 0], dir: [0, -0.4, 1], largo: 0.11, roll: -5 },
  ],
};

const HIJO: Record<string, string> = {
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
};

/** Aplica las rotaciones como lo hace AvatarModel: bind · Euler(x, y, z, 'ZYX'). */
function aplicar(e: ReturnType<typeof esqueleto>, joints: Record<string, { x: number; y: number; z: number }>) {
  for (const [n, b] of e.huesos) {
    const j = joints[n];
    const rot = j ? new THREE.Quaternion().setFromEuler(new THREE.Euler(j.x * DEG2RAD, j.y * DEG2RAD, j.z * DEG2RAD, 'ZYX')) : new THREE.Quaternion();
    b.quaternion.copy(e.binds.get(n)!).multiply(rot);
  }
  e.raiz.updateMatrixWorld(true);
}

function direccion(e: ReturnType<typeof esqueleto>, nombre: string): THREE.Vector3 {
  const a = e.huesos.get(nombre)!.getWorldPosition(new THREE.Vector3());
  const b = e.huesos.get(HIJO[nombre])!.getWorldPosition(new THREE.Vector3());
  return b.sub(a).normalize();
}

const gradosEntre = (a: THREE.Vector3, b: Direccion) => a.angleTo(new THREE.Vector3(...b).normalize()) / DEG2RAD;

describe('presets de pose por dirección: el mismo gesto en cualquier esqueleto', () => {
  for (const [rig, segmentos] of Object.entries(RIGS)) {
    for (const [nombre, preset] of Object.entries(PRESETS_DE_POSE)) {
      it(`${nombre} en el ${rig}`, () => {
        const e = esqueleto(segmentos);
        const joints = resolverPreset(preset, e.huesos, e.binds);
        aplicar(e, joints);
        for (const [hueso, meta] of Object.entries(preset)) {
          expect(gradosEntre(direccion(e, hueso), meta), `${hueso} en ${nombre}`).toBeLessThan(0.5);
        }
        // lo que la preset no nombra se queda en su bind
        expect(Object.keys(joints).sort()).toEqual(Object.keys(preset).sort());
      });
    }
  }
});

describe('sobre el esqueleto real de Mujer EU 38', () => {
  it('la A-pose deja los brazos rectos a 45° a los lados, sin manos delante del cuerpo', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read('public/avatares/mujer-eu38.glb');
    const joints = doc.getRoot().listSkins()[0].listJoints();
    const raiz = new THREE.Group();
    const huesos = new Map<string, THREE.Bone>();
    for (const n of joints) {
      const b = new THREE.Bone();
      b.name = n.getName();
      b.position.fromArray(n.getTranslation());
      b.quaternion.fromArray(n.getRotation());
      b.scale.fromArray(n.getScale());
      huesos.set(b.name, b);
    }
    for (const n of joints) {
      const padre = n.getParentNode();
      (padre && huesos.get(padre.getName()) ? huesos.get(padre.getName())! : raiz).add(huesos.get(n.getName())!);
    }
    raiz.updateMatrixWorld(true);
    const e = { raiz, huesos, binds: new Map([...huesos].map(([n, b]) => [n, b.quaternion.clone()])) };

    aplicar(e, resolverPreset(PRESETS_DE_POSE['A-pose'], e.huesos, e.binds));

    for (const hueso of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) {
      expect(gradosEntre(direccion(e, hueso), PRESETS_DE_POSE['A-pose'][hueso]), hueso).toBeLessThan(0.5);
    }
    // en el reposo de la biblioteca la mano izquierda queda 16 cm delante del hombro; recta, en su plano
    const z = (n: string) => e.huesos.get(n)!.getWorldPosition(new THREE.Vector3()).z;
    expect(Math.abs(z('LeftHand') - z('LeftArm'))).toBeLessThan(0.02);
    expect(Math.abs(z('RightHand') - z('RightArm'))).toBeLessThan(0.02);
  });
});
