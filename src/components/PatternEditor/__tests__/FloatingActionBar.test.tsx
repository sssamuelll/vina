// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { type ComponentProps } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FloatingActionBar from '../FloatingActionBar';
import type { CurationCtx } from '../actionCuration';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';
import type { BBox } from '../../../utils/geometry/transform';

afterEach(cleanup);

function pieceFix(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0, outline: [], internals: [], edges: [],
  } as unknown as PatternPiece;
}

function makeCtx(over: Partial<CurationCtx> = {}): CurationCtx {
  return {
    dispatch: vi.fn() as unknown as AppDispatch,
    targetKind: 'piece', stage: 'drafted', altitude: 'body',
    pieceId: 'p1', piece: pieceFix(), selectedPieceIds: ['p1'],
    seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: undefined, segmentIsCurve: undefined,
    clipboard: null, groups: [], pieces: [pieceFix()],
    cb: {}, onClose: vi.fn(),
    ...over,
  };
}

const BBOX: BBox = { x: 100, y: 100, width: 200, height: 100 };

function renderBar(over: Partial<ComponentProps<typeof FloatingActionBar>> = {}) {
  return render(
    <FloatingActionBar
      show
      bbox={BBOX}
      pan2D={{ x: 0, y: 0 }}
      zoom2D={1}
      isDragging={false}
      contextMenuOpen={false}
      calibrationActive={false}
      ctx={makeCtx()}
      {...over}
    />,
  );
}

describe('FloatingActionBar — anclaje (F4: contrato de transformTool.bbox)', () => {
  it('ancla sobre el handle de rotación: centro-X del box, tope − 32px, translate(-50%,-100%)', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar).toBeTruthy();
    // left = pan.x + (bbox.x + bbox.width/2)*zoom = 0 + (100+100)*1
    expect(bar.style.left).toBe('200px');
    // top = boxTop(100) − ROTATE_HANDLE_GAP(32)
    expect(bar.style.top).toBe('68px');
    expect(bar.style.transform).toBe('translate(-50%, -100%)');
  });

  it('below-flip cuando no hay aire arriba: ancla bajo el box con BAR_GAP y translate(-50%,0)', () => {
    const { container } = renderBar({ bbox: { x: 0, y: 10, width: 100, height: 40 } });
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    // boxBottom = (10+40)*1 = 50; top = 50 + BAR_GAP(8)
    expect(bar.style.top).toBe('58px');
    expect(bar.style.transform).toBe('translate(-50%, 0)');
    expect(bar.style.left).toBe('50px');
  });

  it('respeta pan y zoom al convertir patrón → pantalla', () => {
    const { container } = renderBar({
      pan2D: { x: 20, y: 40 }, zoom2D: 2, bbox: { x: 100, y: 100, width: 50, height: 50 },
    });
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    // left = 20 + (100+25)*2 = 270; boxTop = 40 + 100*2 = 240; top = 240 − 32 = 208
    expect(bar.style.left).toBe('270px');
    expect(bar.style.top).toBe('208px');
  });
});

describe('FloatingActionBar — superficie neutral-dark (nunca azul de selección)', () => {
  it('fondo #1a1a1a, z-index 90 (local a su isolation:isolate); NO el azul de selección #4A9EFF', () => {
    const { container } = renderBar();
    const bar = container.querySelector('.floating-action-bar') as HTMLElement;
    expect(bar.style.backgroundColor).toBe('rgb(26, 26, 26)');       // #1a1a1a
    expect(bar.style.backgroundColor).not.toBe('rgb(74, 158, 255)'); // #4A9EFF
    // Grupo 2 (§2.3 emplazamiento, Task 4): el 90 dejó de ser literal — vive
    // en --capa-bar, local al isolation:isolate de este mismo elemento.
    expect(bar.style.isolation).toBe('isolate');
    expect(bar.style.getPropertyValue('--capa-bar')).toBe('90');
    expect(bar.style.zIndex).toBe('var(--capa-bar)');
  });
});

describe('FloatingActionBar — icon-only + labels en tooltip', () => {
  it('renderiza icon-only: un botón por acción, con SVG y sin texto visible', () => {
    renderBar();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5); // rotate90, duplicate, flipH, properties, lockToggle
    for (const b of buttons) {
      expect(b.querySelector('svg')).toBeTruthy();
      expect((b.textContent ?? '').trim()).toBe('');
    }
  });

  it('la acción corre el verbo existente al hacer clic (rotate90 → dispatch)', () => {
    const ctx = makeCtx();
    render(
      <FloatingActionBar
        show bbox={BBOX} pan2D={{ x: 0, y: 0 }} zoom2D={1}
        isDragging={false} contextMenuOpen={false} calibrationActive={false} ctx={ctx}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rotar 90°' }));
    expect(ctx.dispatch).toHaveBeenCalled();
  });
});

describe('FloatingActionBar — dismiss (una sola compuerta)', () => {
  const cases: Array<[string, Partial<ComponentProps<typeof FloatingActionBar>>]> = [
    ['show=false (deselección / cambio de tool / altitud POINT)', { show: false }],
    ['transform drag activo (T3)', { isDragging: true }],
    ['menú contextual abierto (dos superficies no coexisten)', { contextMenuOpen: true }],
    ['calibración activa (F9)', { calibrationActive: true }],
    ['sin ctx', { ctx: null }],
  ];
  it.each(cases)('no monta con %s', (_label, over) => {
    const { container } = renderBar(over);
    expect(container.querySelector('.floating-action-bar')).toBeNull();
  });
});

describe('FloatingActionBar — Escape seguro por construcción (T5)', () => {
  it('no registra ningún listener de teclado en window (cero race con la captura de Escape)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderBar();
    expect(addSpy.mock.calls.some(c => c[0] === 'keydown')).toBe(false);
    addSpy.mockRestore();
  });
});
