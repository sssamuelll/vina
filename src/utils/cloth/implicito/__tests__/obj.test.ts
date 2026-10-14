import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido } from '../cuerpo';
import { cuerpoDeObj, leerObj } from '../banco/obj';

/** Un cubo de 2 m centrado en el origen, con caras de cuatro lados; `alReves` invierte el sentido de todas. */
function cubo(alReves: boolean): string {
  const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  // caras en sentido antihorario visto desde afuera
  const caras = [[1, 4, 3, 2], [5, 6, 7, 8], [1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8]];
  return [
    ...v.map((p) => `v ${p.join(' ')}`),
    'usemtl piel',
    ...caras.map((c) => `f ${(alReves ? [...c].reverse() : c).map((i) => `${i}/${i}`).join(' ')}`),
  ].join('\n');
}

describe('leer un OBJ', () => {
  it('parte las caras de cuatro lados en dos triángulos y guarda los grupos', () => {
    const obj = leerObj(`${cubo(false)}\nusemtl otro\nf 1 2 3`);
    expect(obj.v.length).toBe(24);
    expect(obj.tris.length / 3).toBe(13);
    expect(obj.grupos).toEqual([{ nombre: 'piel', t0: 0, nt: 12 }, { nombre: 'otro', t0: 12, nt: 1 }]);
  });

  it('el cuerpo de un OBJ da distancia positiva afuera, aunque sus caras vengan al revés', () => {
    for (const alReves of [false, true]) {
      const cuerpo = new CuerpoRigido(buildLinearBVH(cuerpoDeObj(leerObj(cubo(alReves)), ['piel'], 0.1)));
      expect(cuerpo.cercano(0, 0.15, 0)!.d).toBeCloseTo(0.05, 6);
      expect(cuerpo.cercano(0, 0.05, 0)!.d).toBeCloseTo(-0.05, 6);
    }
  });
});
