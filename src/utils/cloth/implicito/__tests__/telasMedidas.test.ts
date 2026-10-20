import { describe, expect, it } from 'vitest';
import { cusickDeLaReferencia, telaMedida, type TelaMedidaEnLaReferencia } from '../banco/telasMedidas';

const friccion = { cuerpo: 0.4, tela: 0.45 };
const medida = (): TelaMedidaEnLaReferencia => ({
  gramaje_g_m2: 200,
  grosor_mm_informacion: 0.5,
  traccion: {
    urdimbre: { fitting: { k_mean_N_m: 28 } },
    trama: { fitting: { k_mean_N_m: 27 } },
    'bies+45': { fitting: { k_mean_N_m: 25 } },
    'bies-45': { fitting: { k_mean_N_m: 26 } },
  },
  peirce: { urdimbre: { G_ef_media_N_m: 4e-6 }, trama: { G_ef_media_N_m: 8e-7 }, bies: { G_ef_media_N_m: 1.8e-6 } },
  cusick: { cusick_q2_pd5: { calidad: 2, pd_mm: 5, dc_final: 27.9, ondas_final_umbral4: 10, dc_primeros_3s: [[0.067, 98.8, 0], [1, 34.4, 9]] } },
});

describe('las telas medidas en la referencia', () => {
  it('la tracción a lo largo y a lo ancho, la cizalla que da el bies y la flexión en µN·m', () => {
    const t = telaMedida(medida(), friccion)!;
    expect([t.kUrdimbre, t.kTrama]).toEqual([28, 27]);
    // a 45°, la membrana sin Poisson da 1/E45 = ¼·(1/kT + 1/kU + 1/kS): con kS así, vuelve el bies medido
    expect(4 / (1 / t.kTrama + 1 / t.kUrdimbre + 1 / t.kCizalla)).toBeCloseTo(25.5, 9);
    expect(t.bUrdimbre).toBeCloseTo(4, 9);
    expect(t.bTrama).toBeCloseTo(0.8, 9);
    expect(t.bBies).toBeCloseTo(1.8, 9);
    expect([t.gramaje, t.grosor, t.friccionCuerpo, t.friccionTela]).toEqual([200, 0.5, 0.4, 0.45]);
  });

  it('sin bies medido: la cizalla no baja de la tracción y la flexión al bies es el promedio', () => {
    const m = medida();
    delete m.traccion!['bies+45'];
    delete m.traccion!['bies-45'];
    delete m.peirce!.bies;
    const t = telaMedida(m, friccion)!;
    expect(t.kCizalla).toBe(28);
    expect(t.bBies).toBeCloseTo(2.4, 9);
  });

  it('sin la tracción o la flexión a lo largo no hay tela', () => {
    const m = medida();
    delete m.peirce!.urdimbre;
    expect(telaMedida(m, friccion)).toBeNull();
  });

  it('el Cusick de la referencia: coeficiente, ondas y la caída de los primeros segundos', () => {
    expect(cusickDeLaReferencia(medida())).toEqual({ coeficiente: 27.9, ondas: 10, primeros: [[0.067, 98.8], [1, 34.4]] });
  });
});
