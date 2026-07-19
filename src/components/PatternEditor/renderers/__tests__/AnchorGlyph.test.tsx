// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';

afterEach(cleanup);

function draw(
  role: Parameters<typeof AnchorGlyph>[0]['role'],
  state: AnchorVisualState = 'idle',
) {
  return render(
    <svg>
      <AnchorGlyph
        role={role}
        position={{ x: 20, y: 30 }}
        zoom2D={2}
        state={state}
      />
    </svg>,
  );
}

describe('AnchorGlyph', () => {
  it('uses one root with role metadata and a position transform', () => {
    const { container } = draw('corner');
    const root = container.querySelector('[data-anchor-role="corner"]')!;
    expect(root.getAttribute('transform')).toBe('translate(20 30)');
  });

  it('does not participate in SVG hit-testing', () => {
    const { container } = draw('corner');
    const root = container.querySelector('[data-anchor-role="corner"]')!;
    expect(root.getAttribute('pointer-events')).toBe('none');
  });

  it('renders exact screen-space sizes through zoom compensation', () => {
    const corner = draw('corner').container.querySelector('rect')!;
    expect(Number(corner.getAttribute('width'))).toBe(5);
    cleanup();
    const smooth = draw('smoothSample').container.querySelector('circle')!;
    expect(Number(smooth.getAttribute('r'))).toBe(1.5);
    cleanup();
    const bezier = draw('bezierAnchor').container.querySelectorAll('circle');
    expect(bezier).toHaveLength(2);
    expect(Number(bezier[0].getAttribute('r'))).toBe(2.25);
  });

  it('keeps role shape while selected and hovered state change color', () => {
    const selected = draw('corner', 'selected');
    expect(selected.container.querySelector('[data-anchor-role="corner"]')).toBeTruthy();
    expect(selected.container.querySelector('rect')?.getAttribute('fill')).toBe('#FFD700');
    cleanup();
    const hovered = draw('corner', 'hovered');
    expect(hovered.container.querySelector('rect')?.getAttribute('fill')).toBe('#6BB3FF');
  });

  it('uses diamond, square, ring and small circle as distinct glyphs', () => {
    expect(draw('openEndpoint').container.querySelector('polygon')).toBeTruthy();
    cleanup();
    expect(draw('corner').container.querySelector('rect')).toBeTruthy();
    cleanup();
    expect(draw('bezierAnchor').container.querySelectorAll('circle')).toHaveLength(2);
    cleanup();
    expect(draw('smoothSample').container.querySelectorAll('circle')).toHaveLength(1);
  });
});
