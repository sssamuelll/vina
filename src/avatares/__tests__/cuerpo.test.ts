import { describe, it, expect } from 'vitest';
import { AVATAR_POR_DEFECTO, avatarPorUrl, medidasDelCuerpo, referenciaDeMorph } from '../catalogo';
import { DEFAULT_MEASUREMENTS, aMorph, computeMorphWeights } from '../../utils/avatar/morphTargets';
import type { BodyMeasurements } from '../../types/types';

const editadas: BodyMeasurements = { height: 170, chest: 70, waist: 60, hips: 80, shoulder: 40, armLength: 60, inseam: 80 };
const proyecto = (avatarModelUrl: string | null, avatarMode = 'model') =>
  ({ avatarMode, avatarModelUrl, avatar: { ...AVATAR_POR_DEFECTO, measurements: editadas } });

describe('las medidas del cuerpo que se ve', () => {
  it('con un cuerpo de la biblioteca son las de su talla, aunque María edite las del proyecto', () => {
    expect(medidasDelCuerpo(proyecto('/avatares/mujer-eu38.glb'))).toBe(AVATAR_POR_DEFECTO.measurements);
    expect(medidasDelCuerpo(proyecto('/avatares/hombre-eu50.glb')).height).toBe(174.4);
  });

  it('con un modelo propio, sin modelo o con el maniquí de costura son las del proyecto, como hoy', () => {
    for (const p of [proyecto('blob:http://localhost/1'), proyecto(null), proyecto('/avatares/mujer-eu38.glb', 'dressform')]) {
      expect(medidasDelCuerpo(p)).toBe(editadas);
    }
  });

  it('un cuerpo de la biblioteca se estira contra sí mismo; un modelo propio, contra el de 180 cm', () => {
    const url = '/avatares/mujer-eu38.glb';
    const w = computeMorphWeights(aMorph(medidasDelCuerpo(proyecto(url))), referenciaDeMorph(url));
    expect(Object.values(w)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(referenciaDeMorph('blob:http://localhost/1')).toBe(DEFAULT_MEASUREMENTS);
    expect(referenciaDeMorph(null)).toBe(DEFAULT_MEASUREMENTS);
    expect(referenciaDeMorph(url)).toEqual(aMorph(avatarPorUrl(url)!.measurements));
  });
});
