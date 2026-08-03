import { describe, it, expect } from 'vitest';
import { pieceBodyStyle, type PieceBodyStyleInput } from '../pieceBodyStyle';

const at = (over: Partial<PieceBodyStyleInput> = {}): PieceBodyStyleInput => ({
  renderMode2D: 'textured', isSelected: false, zoom2D: 1, ...over,
});

describe('pieceBodyStyle — estado de bloqueo (nota de María #192)', () => {
  it('una pieza bloqueada queda hueca y con el contorno de trazos', () => {
    // La convención que ella nombró de Clo. Es un cambio de FORMA: se ve de
    // reojo, sin leer nada. El aviso anterior era la palabra `locked` en 10 px.
    const s = pieceBodyStyle(at({ locked: true }));
    expect(s.fill).toBe('transparent');
    expect(s.cutDash).toBeDefined();
  });

  it('el hueco es transparent y NUNCA none — con none no se podría desbloquear', () => {
    // `fill: none` deja de pintar el relleno y se lleva su área de impacto:
    // la pieza dejaría de poder seleccionarse justo cuando hace falta.
    expect(pieceBodyStyle(at({ locked: true })).fill).not.toBe('none');
    expect(pieceBodyStyle(at({ locked: true, isSelected: true })).fill).toBe('transparent');
    expect(pieceBodyStyle(at({ locked: true, colorwayColor: '#ff8800' })).fill).toBe('transparent');
    expect(pieceBodyStyle(at({ locked: true, renderMode2D: 'translucent' })).fill).toBe('transparent');
  });

  it('el bloqueo gana sobre la colorway: es un estado, no una preferencia de color', () => {
    expect(pieceBodyStyle(at({ colorwayColor: '#ff8800' })).fill).toBe('#ff880025');
    expect(pieceBodyStyle(at({ colorwayColor: '#ff8800', locked: true })).fill).toBe('transparent');
  });

  it('los trazos escalan con el zoom, como el resto del dibujo', () => {
    // Sin dividir por el zoom, al alejarse los trazos se juntan hasta parecer
    // una línea continua, que es justo el estado que hay que distinguir.
    expect(pieceBodyStyle(at({ locked: true, zoom2D: 1 })).cutDash).toBe('8 4');
    expect(pieceBodyStyle(at({ locked: true, zoom2D: 4 })).cutDash).toBe('2 1');
  });

  it('sin bloqueo el contorno va continuo', () => {
    expect(pieceBodyStyle(at()).cutDash).toBeUndefined();
    expect(pieceBodyStyle(at({ locked: false })).cutDash).toBeUndefined();
    expect(pieceBodyStyle(at({ isSelected: true })).cutDash).toBeUndefined();
  });

  it('en wireframe el relleno sigue siendo none, pero el bloqueo se ve en el trazo', () => {
    // Wireframe ya es hueco, así que la forma no puede distinguir nada: ahí el
    // único portador del estado es la discontinuidad del contorno.
    const s = pieceBodyStyle(at({ locked: true, renderMode2D: 'wireframe' }));
    expect(s.fill).toBe('none');
    expect(s.cutDash).toBeDefined();
  });

  it('lo que no está bloqueado se pinta como antes', () => {
    expect(pieceBodyStyle(at()).fill).toBe('var(--piece-fill-2d)');
    expect(pieceBodyStyle(at({ renderMode2D: 'translucent' })).fill).toBe('rgba(255,255,255,0.45)');
    expect(pieceBodyStyle(at({ renderMode2D: 'wireframe' })).fill).toBe('none');
    expect(pieceBodyStyle(at({ isSelected: true })).fill)
      .toBe('color-mix(in oklab, var(--accent-2d) 14%, var(--piece-fill-2d))');
    expect(pieceBodyStyle(at({ colorwayColor: '#ff8800', isSelected: true })).fill).toBe('#ff880040');
  });
});
