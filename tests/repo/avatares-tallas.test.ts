import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error — módulo .mjs sin tipos
import { mediana, leerCsv, ibmADoble, leerXpt, tallaAdulta, tallaNino, descargar } from '../../scripts/avatares/tallas.mjs';

const ibm = (hex: string) => ibmADoble(Buffer.from(hex, 'hex'), 0);

describe('tallas: lectura de los datos', () => {
  it('mediana impar y par', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(() => mediana([])).toThrow();
  });

  it('número IBM 370 de SAS → double; los faltantes de SAS (., _, .A…) son null', () => {
    expect(ibm('4110000000000000')).toBe(1);
    expect(ibm('4264000000000000')).toBe(100);
    expect(ibm('c128000000000000')).toBe(-2.5);
    expect(ibm('0000000000000000')).toBe(0);
    expect(ibm('2e00000000000000')).toBeNull();
    expect(ibm('5f00000000000000')).toBeNull();
    expect(ibm('4100000000000000')).toBeNull();
  });

  it('lee el XPT de NHANES igual que pandas (20 primeras filas de BMX_L)', () => {
    const { variables, filas } = leerXpt(readFileSync('tests/fixtures/avatares/bmx_l_primeras20.xpt'));
    expect(variables).toHaveLength(22);
    expect(filas).toHaveLength(20);
    expect(filas.slice(0, 5).map((f: Record<string, number | null>) => [f.SEQN, f.BMXHT, f.BMXWAIST, f.BMXHIP])).toEqual([
      [130378, 179.5, 98.3, 102.9], [130379, 174.2, 114.7, 112.4], [130380, 152.9, 93.5, 98],
      [130381, 120.1, 70.4, null], [130382, null, null, null],
    ]);
    expect(filas[19]).toMatchObject({ SEQN: 130400, BMXHT: 160.3, BMXWAIST: 97, BMXHIP: 101 });
  });

  it('CSV de ANSUR: CRLF, claves en minúscula, y una fila con campos de más es un error', () => {
    expect(leerCsv('SubjectId,Stature\r\n1,1600\r\n2,1700\r\n')).toEqual([{ subjectid: '1', stature: '1600' }, { subjectid: '2', stature: '1700' }]);
    expect(() => leerCsv('a,b\r\n1,2,3\r\n')).toThrow(/fila 2/);
  });

  it('un archivo que no es el esperado (el HTML que a veces manda ANSUR) no pasa el sha256', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tallas-'));
    writeFileSync(path.join(dir, 'ANSUR_II_FEMALE_Public.csv'), '<!DOCTYPE html><html></html>');
    await expect(descargar('ansurMujer', { url: 'https://invalido.example/ANSUR_II_FEMALE_Public.csv', sha256: '0'.repeat(64) }, dir))
      .rejects.toThrow(/se esperaba 0{64}.*Borra/s);
  });
});

const persona = (chestMm: number, extra: Record<string, number> = {}) => ({
  chestcircumference: String(chestMm), stature: '1600', waistcircumference: '800', buttockcircumference: '1000',
  neckcircumference: '320', biacromialbreadth: '360', sleeveoutseam: '540', crotchheight: '780',
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
});

describe('tallas: una talla adulta', () => {
  it('la banda de busto es [centro − 2, centro + 2) y el resto es la mediana de esa banda', () => {
    const filas = [
      ...Array.from({ length: 9 }, () => persona(870)),
      persona(860, { stature: 1705 }), // borde de abajo: entra
      persona(859, { stature: 1 }), persona(900, { stature: 1 }), // fuera: 85,9 y el borde de arriba
    ];
    const t = tallaAdulta(filas, 'mujer', 38);
    expect(t).toMatchObject({ id: 'mujer-eu38', grupo: 'mujer', talla: { eu: '38', us: '8' }, fuente: 'ANSUR II', n: 10 });
    expect(t.objetivo).toEqual({ estatura: 160, busto: 88, cintura_ombligo: 80, cadera: 100, cuello: 32, hombros: 36, largo_brazo: 54, entrepierna: 78 });
  });

  it('una mediana par que cae en medio milímetro se redondea hacia arriba', () => {
    const filas = [...Array.from({ length: 5 }, () => persona(1000, { stature: 1700 })), ...Array.from({ length: 5 }, () => persona(1000, { stature: 1701 }))];
    expect(tallaAdulta(filas, 'hombre', 50).objetivo.estatura).toBe(170.1);
    expect(tallaAdulta(filas, 'hombre', 50).talla).toEqual({ eu: '50', us: '40' });
  });

  it('una banda con menos de 10 personas es un error que nombra la talla', () => {
    expect(() => tallaAdulta([persona(870)], 'mujer', 38)).toThrow(/mujer EU 38: 1 personas en la banda de busto 86–90 cm/);
  });
});

describe('tallas: una talla de niña o niño', () => {
  const demo = [
    ...Array.from({ length: 10 }, (_, i) => ({ SEQN: i, RIAGENDR: 2, RIDAGEYR: 8 })),
    { SEQN: 100, RIAGENDR: 1, RIDAGEYR: 8 }, // niño: no cuenta para niña
    { SEQN: 101, RIAGENDR: 2, RIDAGEYR: 9 }, // 9 años: no cuenta para 8
  ];
  const bmx = [
    ...Array.from({ length: 10 }, (_, i) => ({ SEQN: i, BMXHT: 130 + i * 0.1, BMXWAIST: 60, BMXHIP: null })),
    { SEQN: 100, BMXHT: 999, BMXWAIST: 999, BMXHIP: 999 },
    { SEQN: 101, BMXHT: 999, BMXWAIST: 999, BMXHIP: 999 },
  ];

  it('solo esa edad cumplida y ese sexo; sin cadera cuando NHANES no la midió', () => {
    const t = tallaNino(bmx, demo, 'nina', 8);
    expect(t).toMatchObject({ id: 'nina-8', talla: { edad: 8 }, fuente: 'NHANES 2021-2023', n: 10 });
    expect(t.objetivo).toEqual({ estatura: 130.5, cintura_ombligo: 60 }); // mediana de 130,0…130,9
    expect(t.columnas).toEqual({ estatura: 'BMXHT', cintura_ombligo: 'BMXWAIST' });
  });
});

describe('tallas.json commiteado', () => {
  const { tallas } = JSON.parse(readFileSync('scripts/avatares/tallas.json', 'utf8'));
  const ids = tallas.map((t: { id: string }) => t.id);

  it('las 31 en orden: mujer, hombre, niña, niño', () => {
    expect(ids).toEqual([
      ...[32, 34, 36, 38, 40, 42, 44, 46, 48].map((eu) => `mujer-eu${eu}`),
      ...[44, 46, 48, 50, 52, 54, 56, 58].map((eu) => `hombre-eu${eu}`),
      ...[2, 4, 6, 8, 10, 12, 14].map((e) => `nina-${e}`),
      ...[2, 4, 6, 8, 10, 12, 14].map((e) => `nino-${e}`),
    ]);
  });

  it('valores contrastados con pandas el 2026-09-30', () => {
    const t = Object.fromEntries(tallas.map((x: { id: string }) => [x.id, x]));
    expect(t['mujer-eu38']).toMatchObject({ n: 318, objetivo: { estatura: 161.4, busto: 88, cintura_ombligo: 79.1, cadera: 97, cuello: 31.6, hombros: 36.1, largo_brazo: 53.7, entrepierna: 77.7 } });
    expect(t['hombre-eu58']).toMatchObject({ n: 400, objetivo: { estatura: 177.8, cintura_ombligo: 105.4, cuello: 41.9 } });
    expect(t['nina-8']).toMatchObject({ n: 80, objetivo: { estatura: 131.8, cintura_ombligo: 62.8 } });
    expect(t['nino-14'].objetivo).toEqual({ estatura: 170.5, cintura_ombligo: 80.3, cadera: 93.4 });
  });

  it('cadera solo desde los 12 años (NHANES no la mide antes)', () => {
    for (const t of tallas.filter((x: { grupo: string }) => x.grupo === 'nina' || x.grupo === 'nino')) {
      expect('cadera' in t.objetivo).toBe(t.talla.edad >= 12);
    }
  });
});
