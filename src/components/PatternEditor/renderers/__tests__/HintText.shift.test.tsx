// @vitest-environment jsdom
/**
 * La pista del pie anuncia Shift dos veces (spec 2026-09-23 § 4.2, ley de
 * puertas): con Shift pulsado sustituye a la de la herramienta, porque las de
 * la Pluma y la Línea interna ya no caben en su laptop. Las palabras de los
 * marcos son las de la píldora: «al eje» para la hoja, «al borde» o «al tramo»
 * para el otro. jsdom no es macOS: la notación es la de Windows.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HintText from '../HintText';
import { displayModifierKey } from '../../../shell/shortcutDisplay';

afterEach(cleanup);

type Props = React.ComponentProps<typeof HintText>;
const pie = (props: Partial<Props>) =>
  render(
    <svg>
      <HintText activeTool="pen" pieces={[]} penNodesLength={2} nodeEditorIsEditing={false} {...props} />
    </svg>,
  ).container.textContent;

describe('displayModifierKey — la tecla sola', () => {
  it('⇧ en macOS y Shift fuera, sin el + de combinar', () => {
    expect(displayModifierKey('⇧', true)).toBe('⇧');
    expect(displayModifierKey('⇧', false)).toBe('Shift');
    expect(displayModifierKey('⌥', false)).toBe('Alt');
  });
});

describe('HintText — Shift anuncia la otra guía', () => {
  it('con Shift y un borde que elegir, la pista dice cómo llegar a él', () => {
    expect(pie({ modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe('Shift: al eje · Shift dos veces: al borde');
  });

  it('con el borde activo, dice cómo volver al eje', () => {
    expect(pie({ modoShift: 'borde', segundoMarco: 'border' }))
      .toBe('Shift dos veces: al borde · una vez: al eje');
  });

  it('desde el segundo tramo el otro marco es el tramo', () => {
    expect(pie({ modoShift: 'hoja', segundoMarco: 'segment' }))
      .toBe('Shift: al eje · Shift dos veces: al tramo');
  });

  it('sin segundo marco no hay nada que elegir: la pista de la herramienta', () => {
    expect(pie({ modoShift: 'hoja', segundoMarco: null })).toContain('Clic añade');
  });

  it('sin Shift, la pista de siempre', () => {
    expect(pie({ modoShift: 'suelto', segundoMarco: 'border' })).toContain('Clic añade');
  });

  it('también en la Línea interna y en Editar patrón', () => {
    expect(pie({ activeTool: 'internalShape', internalShapeNodesLength: 1, modoShift: 'hoja', segundoMarco: 'border' }))
      .toBe('Shift: al eje · Shift dos veces: al borde');
    expect(pie({ activeTool: 'editPattern', modoShift: 'borde', segundoMarco: 'border' }))
      .toBe('Shift dos veces: al borde · una vez: al eje');
  });

  it('el Hilo no cambia: no tiene borde de partida', () => {
    expect(pie({ activeTool: 'grainline', modoShift: 'hoja', segundoMarco: 'border' })).toContain('para el hilo');
  });
});

describe('HintText — Shift no pisa la pista del editor de nodos', () => {
  it('con el editor de nodos abierto, solo su pista', () => {
    const texto = pie({ activeTool: 'editPattern', nodeEditorIsEditing: true, modoShift: 'hoja', segundoMarco: 'border' });
    expect(texto).toBe('Editando nodos · arrastra para mover · Esc para salir');
  });
});
