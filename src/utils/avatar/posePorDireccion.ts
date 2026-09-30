/**
 * Presets de pose por dirección (decisión de Samuel, 2026-09-30). Cada preset dice hacia dónde
 * apunta en el mundo cada segmento que mueve (brazo, antebrazo, muslo, pierna), y se resuelve
 * contra el esqueleto que cargó.
 *
 * Las de antes eran rotaciones locales calibradas sobre el escaneo en T. Sobre un esqueleto con
 * otro reposo u otros ejes echaban los brazos adelante. Las 31 de la biblioteca reposan en A a 47°,
 * con los ejes oblicuos y el codo doblado hacia delante: la A-pose de antes les dejaba las manos
 * delante de la pelvis, donde cae una falda.
 *
 * Mundo de three: +X es la izquierda del cuerpo, +Y arriba y +Z adelante.
 */
import * as THREE from 'three';
import type { JointRotation } from '../../store/avatarSlice';

export type Direccion = readonly [number, number, number];

/** Brazo y antebrazo rectos, `grados` por debajo de la horizontal, en el plano frontal. */
function brazosAbajo(grados: number): Record<string, Direccion> {
  const c = Math.cos((grados * Math.PI) / 180);
  const s = Math.sin((grados * Math.PI) / 180);
  return { LeftArm: [c, -s, 0], LeftForeArm: [c, -s, 0], RightArm: [-c, -s, 0], RightForeArm: [-c, -s, 0] };
}

const R = Math.SQRT1_2;
const C5 = Math.cos((5 * Math.PI) / 180);
const S5 = Math.sin((5 * Math.PI) / 180);

/** Las claves son estado de Redux (`activePreset`): no se traducen. El rótulo va en AvatarPanel. */
export const PRESETS_DE_POSE: Readonly<Record<string, Readonly<Record<string, Direccion>>>> = {
  'A-pose': brazosAbajo(45),
  'T-pose': brazosAbajo(0),
  'Relaxed': { ...brazosAbajo(60), LeftUpLeg: [0, -C5, S5], RightUpLeg: [0, -C5, S5] },
  'Arms Forward': { LeftArm: [R, 0, R], LeftForeArm: [R, 0, R], RightArm: [-R, 0, R], RightForeArm: [-R, 0, R] },
  'Sitting': { LeftUpLeg: [0, 0, 1], LeftLeg: [0, -1, 0], RightUpLeg: [0, 0, 1], RightLeg: [0, -1, 0] },
};

/** El segmento de un hueso va de su articulación a la de este hijo. */
const HIJO: Readonly<Record<string, string>> = {
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
};

const grados = (rad: number) => Math.round((rad * 1800) / Math.PI) / 10;

function profundidad(o: THREE.Object3D): number {
  let n = 0;
  for (let p = o.parent; p; p = p.parent) n++;
  return n;
}

/**
 * Las rotaciones locales que llevan cada segmento de `preset` a su dirección, sobre este
 * esqueleto. Salen en grados, como Euler 'ZYX' relativa al bind, que es lo que `applyPose`
 * compone con cada hueso. Deja los huesos posados; quien llama los vuelve a poner cada frame.
 */
export function resolverPreset(
  preset: Readonly<Record<string, Direccion>>,
  huesos: ReadonlyMap<string, THREE.Bone>,
  binds: ReadonlyMap<string, THREE.Quaternion>,
): Record<string, JointRotation> {
  for (const [nombre, hueso] of huesos) {
    const bind = binds.get(nombre);
    if (bind) hueso.quaternion.copy(bind);
  }
  const orden = Object.keys(preset)
    .filter((n) => huesos.has(n) && huesos.has(HIJO[n]) && binds.has(n))
    .sort((a, b) => profundidad(huesos.get(a)!) - profundidad(huesos.get(b)!));

  const joints: Record<string, JointRotation> = {};
  const desde = new THREE.Vector3();
  const hasta = new THREE.Vector3();
  const padre = new THREE.Quaternion();
  for (const nombre of orden) {
    const hueso = huesos.get(nombre)!;
    hueso.updateWorldMatrix(true, true);
    hueso.getWorldPosition(desde);
    huesos.get(HIJO[nombre])!.getWorldPosition(hasta);
    const giro = new THREE.Quaternion().setFromUnitVectors(
      hasta.sub(desde).normalize(),
      new THREE.Vector3(...preset[nombre]).normalize(),
    );
    const mundo = giro.multiply(hueso.getWorldQuaternion(new THREE.Quaternion()));
    if (hueso.parent) hueso.parent.getWorldQuaternion(padre);
    else padre.identity();
    const local = padre.invert().multiply(mundo);
    hueso.quaternion.copy(local);
    const e = new THREE.Euler().setFromQuaternion(binds.get(nombre)!.clone().invert().multiply(local), 'ZYX');
    joints[nombre] = { x: grados(e.x), y: grados(e.y), z: grados(e.z) };
  }
  return joints;
}
