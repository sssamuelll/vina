/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { createRef } from 'react';
import PanCrosshair from '../PanCrosshair';

describe('PanCrosshair', () => {
  it('is hidden by default — only the pan handlers reveal it while the button is held', () => {
    const { getByTestId } = render(<PanCrosshair />);
    expect(getByTestId('pan-crosshair').style.display).toBe('none');
  });

  it('never intercepts pointer events and is invisible to a11y', () => {
    const { getByTestId } = render(<PanCrosshair />);
    const el = getByTestId('pan-crosshair');
    // jsdom's cssstyle doesn't expose style.pointerEvents — assert the attribute
    expect(el.getAttribute('style')).toContain('pointer-events: none');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards its ref so pointer handlers can toggle display directly (no re-render)', () => {
    const ref = createRef<HTMLDivElement>();
    render(<PanCrosshair ref={ref} />);
    expect(ref.current).not.toBeNull();
    ref.current!.style.display = 'block';
    expect(ref.current!.style.display).toBe('block');
  });
});
