import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AVATAR_POR_DEFECTO, CATALOGO, CLAVES, avatarPorUrl, medidasDeEntrada, nombreDeTalla, urlDeModelo,
} from '../catalogo';
import { parseProfilesJson } from '../../utils/avatar/avatarLibrary';

const entrada = (id: string) => CATALOGO.find((e) => e.id === id)!;

describe('catálogo de avatares en la app', () => {
  it('trae las 31 tallas, cada una con su GLB y su miniatura publicadas', () => {
    expect(CATALOGO).toHaveLength(31);
    const faltan = CATALOGO.flatMap((e) => [urlDeModelo(e), `/avatares/${e.miniatura}`])
      .filter((url) => !existsSync(path.resolve('public', `.${url}`)));
    expect(faltan).toEqual([]);
  });

  it('cada medida del catálogo tiene su clave en Vina', () => {
    const sinClave = CATALOGO.flatMap((e) => Object.keys(e.medidas)).filter((k) => !(k in CLAVES));
    expect(sinClave).toEqual([]);
  });

  it('las medidas de las 31 pasan la validación de perfiles (claves obligatorias, 5–500 cm)', () => {
    const t = Date.UTC(2026, 8, 30);
    const perfiles = CATALOGO.map((e) => ({
      id: e.id, name: nombreDeTalla(e), measurements: medidasDeEntrada(e), createdAt: t, updatedAt: t,
    }));
    const r = parseProfilesJson(JSON.stringify(perfiles));
    expect(r).toMatchObject({ success: true, rejected: 0 });
  });

  it('traduce Mujer EU 38 clave por clave', () => {
    expect(medidasDeEntrada(entrada('mujer-eu38'))).toEqual({
      height: 161.4, chest: 88, waist: 77.1, hips: 97, shoulder: 36.1, armLength: 53.7, inseam: 77.7,
      neckCirc: 31.6, lowBust: 73.2, thighCirc: 57.5, kneeCirc: 35.1, upperArmCirc: 26.5,
      neckToWaistBack: 38.2, crotchLength: 61.7, waistHeight: 101.5,
    });
  });

  it('un niño no trae bajo busto', () => {
    expect(medidasDeEntrada(entrada('nino-8'))).not.toHaveProperty('lowBust');
  });

  it('nombra la talla como el generador', () => {
    expect(nombreDeTalla(entrada('mujer-eu38'))).toBe('Mujer EU 38 · US 8');
    expect(nombreDeTalla(entrada('nina-8'))).toBe('Niña 8 años');
  });

  it('el avatar por defecto es Mujer EU 38, y la búsqueda por URL da siempre el mismo objeto', () => {
    expect(AVATAR_POR_DEFECTO).toMatchObject({
      id: 'mujer-eu38', name: 'Mujer EU 38 · US 8', modelUrl: '/avatares/mujer-eu38.glb',
    });
    expect(avatarPorUrl('/avatares/mujer-eu38.glb')).toBe(AVATAR_POR_DEFECTO);
    expect(avatarPorUrl('/avatares/hombre-eu50.glb')).toBe(avatarPorUrl('/avatares/hombre-eu50.glb'));
    for (const ajena of ['', null, undefined, '/default-avatar.glb', 'blob:http://localhost/1']) {
      expect(avatarPorUrl(ajena)).toBeUndefined();
    }
  });
});
