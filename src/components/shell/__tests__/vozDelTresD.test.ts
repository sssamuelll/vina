/**
 * La voz del 3D (spec 2026-10-02 «la interfaz en papel» § 5.3, P5): lo que dice
 * la línea al pie mientras se está en el visor. Es la hermana de la frase del
 * patrón: el nombre de la herramienta activa y UNA frase de cómo se usa. Sin
 * herramienta (la cámara) dice cómo se mueve la vista, que antes decía un rótulo
 * azul sobre el visor («MODO EDICIÓN — orbitar con dos dedos…»).
 *
 * El texto salió del glosario y de `solace-wren`: tuteo, sin signos de
 * exclamación, el nombre en español. Una herramienta que no tiene entrada NO
 * enseña su id: antes, el nombre caía al id de la herramienta (`steamBrush`).
 */
import { describe, expect, it } from 'vitest';
import { vozDelTresD } from '../vozDelTresD';

const RATON = { esquema: 'mouse', poseAbierta: false } as const;
const PANEL = { esquema: 'trackpad', poseAbierta: false } as const;

describe('vozDelTresD ▸ la cámara', () => {
  it('con ratón, dice cómo se mueve la vista y no nombra ninguna herramienta', () => {
    expect(vozDelTresD('camera', RATON)).toEqual({
      nombre: null,
      frase: 'Clic derecho orbita · clic central o Alt + arrastrar panea',
    });
  });

  it('con trackpad, dice el gesto del trackpad', () => {
    expect(vozDelTresD('camera', PANEL)).toEqual({
      nombre: null,
      frase: 'Dos dedos orbitan · pellizco acerca · Alt + arrastrar panea',
    });
  });
});

describe('vozDelTresD ▸ las herramientas del 3D', () => {
  it.each([
    ['arrangement', 'Colocar', 'Clic en la pieza y luego en el punto del cuerpo donde va'],
    ['sew3d', 'Coser', 'Clic en un borde y luego en el otro'],
    ['steamBrush', 'Plancha a vapor', 'Arrastra sobre la tela para alisar las arrugas'],
    ['meshGrab', 'Agarre de malla', 'Arrastra un punto de la tela para tirar de él'],
    ['meshSelectBox', 'Selección por caja', 'Arrastra un recuadro para seleccionar puntos de la tela'],
    ['meshSelectLasso', 'Selección por lazo', 'Dibuja un lazo para seleccionar puntos de la tela'],
  ])('«%s» se llama «%s» y dice «%s»', (herramienta, nombre, frase) => {
    expect(vozDelTresD(herramienta, RATON)).toEqual({ nombre, frase });
  });

  // Chrome se queda con Ctrl+W (cierra la pestaña) y la página nunca lo recibe. La frase
  // de Fijar anunciaba «Ctrl+W quita todas» y María, al pulsarlo, cerraba la pestaña con la
  // simulación dentro (revisión final de P5). El visor sigue atendiendo Ctrl+W, pero ya no
  // se anuncia: una frase que promete una tecla muerta es peor que no prometer ninguna.
  it('Fijar solo dice cómo fijar: no anuncia una tecla que el navegador se queda', () => {
    expect(vozDelTresD('pin', RATON)).toEqual({ nombre: 'Fijar', frase: 'Clic en la tela para fijar un punto' });
    expect(vozDelTresD('pin', PANEL)).toEqual({ nombre: 'Fijar', frase: 'Clic en la tela para fijar un punto' });
  });

  it('ninguna frase anuncia un atajo que el navegador reserva (cerrar pestaña, ventana nueva…)', () => {
    const RESERVADAS = /(?:Ctrl|Control|Cmd)\s*\+\s*(?:Shift\s*\+\s*)?[WTN]\b|⌘\s*⇧?\s*[WTN]\b|Ctrl\s*\+\s*Tab/i;
    const herramientas = ['camera', 'arrangement', 'sew3d', 'pin', 'steamBrush', 'meshGrab', 'meshSelectBox', 'meshSelectLasso', 'pose', 'edit', 'avatar', 'algo-que-no-existe'];
    for (const herramienta of herramientas) {
      for (const opciones of [RATON, PANEL, { ...RATON, poseAbierta: true }]) {
        const { frase } = vozDelTresD(herramienta, opciones);
        expect(frase, `${herramienta}: «${frase}»`).not.toMatch(RESERVADAS);
      }
    }
  });

  it('con la pose abierta gana la pose, sea cual sea la herramienta', () => {
    for (const herramienta of ['camera', 'pin', 'arrangement', 'steamBrush', 'pose']) {
      expect(vozDelTresD(herramienta, { ...RATON, poseAbierta: true }), herramienta).toEqual({
        nombre: 'Pose',
        frase: 'Arrastra una articulación para cambiar la pose',
      });
    }
  });

  it('las frases de las herramientas no dependen del esquema de entrada', () => {
    for (const herramienta of ['arrangement', 'sew3d', 'pin', 'steamBrush', 'meshGrab']) {
      expect(vozDelTresD(herramienta, PANEL), herramienta).toEqual(vozDelTresD(herramienta, RATON));
    }
  });
});

describe('vozDelTresD ▸ una herramienta sin entrada', () => {
  it.each(['edit', 'avatar', 'tape-linear', 'algo-que-no-existe', ''])(
    '«%s» da un nombre genérico en español y la frase de mover la vista',
    (herramienta) => {
      const v = vozDelTresD(herramienta, RATON);
      expect(v.nombre).toBe('Herramienta del 3D');
      expect(v.frase).toBe(vozDelTresD('camera', RATON).frase);
    },
  );

  it('ninguna voz deja asomar el id de la herramienta, ni «undefined», ni inglés', () => {
    const ids = ['camera', 'edit', 'sew3d', 'pose', 'avatar', 'arrangement', 'pin', 'steamBrush', 'meshGrab', 'meshSelectBox', 'meshSelectLasso', 'tape-circumference', 'xyz'];
    for (const id of ids) {
      for (const esquema of ['mouse', 'trackpad'] as const) {
        const { nombre, frase } = vozDelTresD(id, { esquema, poseAbierta: false });
        expect(`${nombre ?? ''} ${frase}`, `${id}/${esquema}`).not.toMatch(/undefined|null|steamBrush|meshGrab|meshSelect|sew3d|arrangement|\bCamera\b|\bEdit\b/);
        expect(frase.length, `${id}: frase vacía`).toBeGreaterThan(0);
        if (nombre !== null) expect(nombre.length).toBeGreaterThan(0);
      }
    }
  });

  it('ninguna frase lleva signos de exclamación ni «por favor»', () => {
    const ids = ['camera', 'sew3d', 'pin', 'steamBrush', 'meshGrab', 'arrangement', 'xyz'];
    for (const id of ids) {
      expect(vozDelTresD(id, RATON).frase, id).not.toMatch(/[¡!]|por favor/i);
      expect(vozDelTresD(id, PANEL).frase, id).not.toMatch(/[¡!]|por favor/i);
    }
  });
});
