import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  noPasoNada,
  mensajeDe,
  suscribirNoPasoNada,
  RAZONES,
  type RazonMuda,
} from '../noPasoNada';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

/**
 * Hallazgo G de la revisión adversarial del 2026-09-04 (#1117): las
 * herramientas 2D se callan cuando un gesto no llega a nada.
 *
 * El censo del 09-05 recorrió los 26 hooks de gesto —los 24 de
 * `components/PatternEditor/` más Pliegue y Elástico, que viven en `hooks/` y
 * el informe no contó— y de ~96 `return` tempranos separó:
 *
 *   ~45  ruido normal del gesto (mover sin botón, clic en el vacío) → callarse
 *        es correcto; hablar ahí sería peor
 *   ~27  invariantes internos (estado rancio, pieza sin bordes nombrados) →
 *        bitácora, nunca tira: María no puede accionarlos
 *     4  ya cerradas por `faltaSujeto` en la tanda anterior
 *    20  **mudas de verdad**: el gesto tenía intención clara y falló por algo
 *        que ella puede corregir
 *
 * Y el peor grupo de esas 20 no es "falta seleccionar": es **el gesto que
 * muere después de armarse**. En `useNotchTool:319`, `useNotchTool:338`,
 * `usePointTool:251` y `useWalkSeamTool:464` María apretó sobre un borde real
 * —el hit-test acertó, el gesto se armó—, soltó, y no apareció nada. Ni
 * piquete, ni punto, ni aviso, ni rastro.
 *
 * El criterio que separa (a) de (b) NO es "hay hit-test": es **si ese hook
 * pinta un canal vivo durante el gesto**. Nueve pintan `hovered*` en
 * `handleMouseMove` y ahí el silencio ya está contestado. Hilo
 * (`useGrainlineTool`) y el modo libre de Pespunte no pintan nada, y ahí el
 * mismo `return` es mudo de verdad.
 *
 * Canal elegido: **bitácora siempre, tira para las (a), toast nunca**. Un
 * gesto que no pasó nada se repite cinco veces en tres segundos, y serían
 * cinco toasts encima del lienzo. La tira ya tiene dos ranuras de texto
 * montadas y no interrumpe.
 */

describe('mensajeDe — el catálogo de razones', () => {
  it('toda razón declarada tiene mensaje', () => {
    for (const razon of RAZONES) {
      expect(mensajeDe(razon), `${razon} no tiene mensaje`).toBeTruthy();
    }
  });

  it('los mensajes están en español y sin signo de apertura', () => {
    // Ley de idioma del contrato: español de Venezuela, sentence case, sin "¡".
    for (const razon of RAZONES) {
      const m = mensajeDe(razon);
      expect(m, `${razon} abre con "¡"`).not.toMatch(/^[¡¿]/);
      expect(m, `${razon} parece inglés`).not.toMatch(
        /\b(failed|invalid|error|select|click|unable|cannot|not found)\b/i,
      );
    }
  });

  it('ningún mensaje termina en punto: son etiquetas, no oraciones sueltas', () => {
    for (const razon of RAZONES) {
      expect(mensajeDe(razon).endsWith('.'), `${razon} termina en punto`).toBe(false);
    }
  });

  it('dice qué hacer, no solo qué falló', () => {
    // Un mensaje que solo nombra el fallo deja a María igual de trabada.
    // Se pide un verbo de acción en cada uno; la lista es la del glosario.
    const accionable = /\b(prueba|acerca|aleja|elige|escribe|mueve|separa|marca|suelta|clic|arrastra|abre|cierra|selecciona|usa|toca|ajusta|reduce|aumenta)\b/i;
    const flojos = RAZONES.filter((r) => !accionable.test(mensajeDe(r)));
    expect(flojos, 'estas razones dicen qué falló pero no qué hacer').toEqual([]);
  });

  it('cubre el grupo peor: el gesto que muere después de armarse', () => {
    // Los cuatro sitios medidos donde María acertó el borde y no pasó nada.
    for (const r of ['notch:sin-sitio', 'notch:sin-emplazamiento', 'point:sin-comando', 'walkseam:borde-sin-resolver'] as RazonMuda[]) {
      expect(RAZONES).toContain(r);
    }
  });

  it('las Tijeras usan dos clics: su aviso no puede decir «arrastra»', () => {
    expect(mensajeDe('tijeras:corte-no-cruza')).not.toMatch(/arrastr/i);
  });

  it('ningún aviso nombra la tira: su sitio es la línea al pie desde P2b', () => {
    expect(RAZONES.filter((r) => /\btira\b/i.test(mensajeDe(r)))).toEqual([]);
  });

  it('los del piquete caben junto a sus cuatro opciones (spec 2026-10-02 § 5.3)', () => {
    const largos = RAZONES.filter((r) => r.startsWith('notch:') && mensajeDe(r).length > 65);
    expect(largos.map((r) => `${r}: ${mensajeDe(r).length}`)).toEqual([]);
  });
});

describe('noPasoNada — escribe en la bitácora y avisa a la tira', () => {
  beforeEach(() => clearJournal());

  it('deja rastro en la bitácora con su razón nombrada', () => {
    noPasoNada('notch:sin-sitio');
    const { events } = getJournal();
    const mio = events.filter((e) => e.kind === 'gesture' && e.name === 'no-paso-nada');
    expect(mio).toHaveLength(1);
    expect(mio[0].data?.razon).toBe('notch:sin-sitio');
  });

  it('la bitácora recibe también los datos que le pasen', () => {
    noPasoNada('trim:borde-sin-largo', { edgeId: 'e3' });
    const ev = getJournal().events.find((e) => e.name === 'no-paso-nada');
    expect(ev?.data?.edgeId).toBe('e3');
    expect(ev?.data?.razon).toBe('trim:borde-sin-largo');
  });

  it('un gesto repetido deja UNA línea por vez: la caja negra cuenta, no resume', () => {
    // `gesture` está en UNFUSED a propósito (journal.ts:47): repetir es señal.
    noPasoNada('notch:sin-sitio');
    noPasoNada('notch:sin-sitio');
    noPasoNada('notch:sin-sitio');
    expect(getJournal().events.filter((e) => e.name === 'no-paso-nada')).toHaveLength(3);
  });

  it('avisa a quien esté suscrito, con el texto ya resuelto', () => {
    const visto = vi.fn();
    const cancelar = suscribirNoPasoNada(visto);
    noPasoNada('notch:sin-sitio');

    expect(visto).toHaveBeenCalledTimes(1);
    expect(visto.mock.calls[0][0]).toMatchObject({
      razon: 'notch:sin-sitio',
      texto: mensajeDe('notch:sin-sitio'),
    });
    expect(typeof visto.mock.calls[0][0].t).toBe('number');
    cancelar();
  });

  it('cancelar la suscripción la corta de verdad', () => {
    const visto = vi.fn();
    suscribirNoPasoNada(visto)();
    noPasoNada('notch:sin-sitio');
    expect(visto).not.toHaveBeenCalled();
  });

  it('convive con más de un suscriptor y con ninguno', () => {
    expect(() => noPasoNada('notch:sin-sitio')).not.toThrow();
    const a = vi.fn(), b = vi.fn();
    const ca = suscribirNoPasoNada(a);
    const cb = suscribirNoPasoNada(b);
    noPasoNada('point:sin-comando');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ca(); cb();
  });

  it('un suscriptor que revienta no se lleva el gesto por delante', () => {
    // La tira es decoración del desenlace; si falla, el gesto ya ocurrió.
    const cancelar = suscribirNoPasoNada(() => { throw new Error('boom'); });
    expect(() => noPasoNada('notch:sin-sitio')).not.toThrow();
    expect(getJournal().events.some((e) => e.name === 'no-paso-nada')).toBe(true);
    cancelar();
  });
});

describe('las guardas que el censo marcó (a) ya no son mudas', () => {
  const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

  // Los cuatro sitios del grupo peor, con su archivo. Si alguien borra la
  // llamada, este test lo dice: el censo del 09-05 los midió uno a uno.
  const OBLIGADOS: Array<[string, string]> = [
    ['src/components/PatternEditor/useNotchTool.ts', 'notch'],
    ['src/components/PatternEditor/usePointTool.ts', 'point'],
    ['src/components/PatternEditor/useWalkSeamTool.ts', 'walkseam'],
    ['src/components/PatternEditor/useTrimTool.ts', 'trim'],
    ['src/components/PatternEditor/useGrainlineTool.ts', 'grainline'],
    // Tijeras entró tarde: su `state.error` vivía igual de muerto que el de
    // Slash & Spread, pero la lista de abajo solo miraba a los dos hermanos
    // que alguien censo ese día. Un censo parcial delata al detector (#1116).
    ['src/components/PatternEditor/useScissorsTool.ts', 'tijeras'],
    // Editar costuras entró el 06-09 con #1098: su clic sobre un borde SIN
    // costura era un no-op declarado "a propósito" en un comentario, que para
    // María es indistinguible de la herramienta rota. Un no-op a propósito
    // sigue debiendo decirlo.
    ['src/components/PatternEditor/useSeamEditTool.ts', 'costuras'],
    // Margen ya hablaba ('margen:borde-sin-anillo'); #1136 le sumó el candado.
    ['src/components/PatternEditor/useSeamAllowanceTool.ts', 'margen'],
  ];

  it.each(OBLIGADOS)('%s habla cuando el gesto muere', (ruta, prefijo) => {
    const src = lee(ruta);
    expect(src, `${ruta} no importa noPasoNada`).toContain('noPasoNada');
    expect(
      new RegExp(`noPasoNada\\(\\s*'${prefijo}:`).test(src),
      `${ruta} importa el helper pero no usa ninguna razón '${prefijo}:*'`,
    ).toBe(true);
  });

  it('no quedan cadenas de error en inglés vivas en esos hooks', () => {
    // `useSlashAndSpreadTool` guardaba 'Invalid slash line' en el estado y lo
    // exponía, pero PatternEditor nunca pasaba `error` como prop: cadena muerta
    // viva. Y `useMergeTool` SÍ pinta las suyas — en inglés, vía MergeOverlay.
    const sospechosos = [
      'src/components/PatternEditor/useSlashAndSpreadTool.ts',
      'src/components/PatternEditor/useMergeTool.ts',
      'src/components/PatternEditor/useScissorsTool.ts',
    ];
    const ingles = /'(?:[A-Z][a-z]+ )+(?:[a-z]+ )*[a-z]+'/g;
    const malos: string[] = [];
    for (const ruta of sospechosos) {
      for (const m of lee(ruta).matchAll(ingles)) {
        // Solo frases que parecen mensajes: 3+ palabras y verbo/negación inglesa.
        if (/\b(No|Failed|Invalid|Cannot|Unable|Select|Click)\b/.test(m[0]) && m[0].split(' ').length >= 3) {
          malos.push(`${ruta}: ${m[0]}`);
        }
      }
    }
    expect(malos, 'cadenas en inglés que la usuaria puede llegar a leer').toEqual([]);
  });
});
