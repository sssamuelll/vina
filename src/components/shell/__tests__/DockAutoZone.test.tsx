/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import DockAutoZone from '../DockAutoZone';
import { Scaling, Package } from 'lucide-react';

afterEach(cleanup);

const GRADE = { id: 'grade', icon: Scaling, label: 'Escalar' };
const BOM = { id: 'bom', icon: Package, label: 'BOM' };

function setup(props: Partial<Parameters<typeof DockAutoZone>[0]> = {}) {
  const onRun = vi.fn(), onPin = vi.fn(), onUnpin = vi.fn();
  const { container } = render(
    <DockAutoZone kept={[]} suggested={[]} signaling="subtle" side="left" onRun={onRun} onPin={onPin} onUnpin={onUnpin} {...props} />,
  );
  return { onRun, onPin, onUnpin, container };
}

describe('DockAutoZone', () => {
  it('renders nothing when kept and suggested are both empty', () => {
    setup();
    expect(screen.queryByText('auto')).toBeNull();
  });

  it('renders suggested items under the auto label with a Keep badge', () => {
    setup({ suggested: [GRADE] });
    expect(screen.getByText('auto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Escalar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fijar Escalar' })).toBeTruthy();
  });

  it('renders kept items with an Unpin badge and no auto label when no suggestions', () => {
    setup({ kept: [BOM] });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soltar BOM' })).toBeTruthy();
  });

  it('the Keep badge calls onPin and NOT onRun', () => {
    const { onRun, onPin } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Escalar' }));
    expect(onPin).toHaveBeenCalledWith('grade');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the Unpin badge calls onUnpin and NOT onRun', () => {
    const { onRun, onUnpin } = setup({ kept: [BOM] });
    fireEvent.click(screen.getByRole('button', { name: 'Soltar BOM' }));
    expect(onUnpin).toHaveBeenCalledWith('bom');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the icon button calls onRun', () => {
    const { onRun } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Escalar' }));
    expect(onRun).toHaveBeenCalledWith('grade');
  });

  it('off: kept items render as plain buttons with no badge', () => {
    const { container } = setup({ kept: [BOM], signaling: 'off' });
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
    expect(container.querySelector('.dock__badge')).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
  });

  it('off: the kept icon still calls onRun', () => {
    const { onRun } = setup({ kept: [BOM], signaling: 'off' });
    fireEvent.click(screen.getByRole('button', { name: 'BOM' }));
    expect(onRun).toHaveBeenCalledWith('bom');
  });

  it('off: no suggestions rise even when suggested is non-empty', () => {
    const { container } = setup({ suggested: [GRADE], signaling: 'off' });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
    expect(container.querySelector('.dock__tool')).toBeNull();
  });

  it('off + no kept renders nothing', () => {
    const { container } = setup({ kept: [], suggested: [GRADE], signaling: 'off' });
    expect(container.querySelector('.dock__tool-wrap')).toBeNull();
  });

  it('kept item tooltip shows the pinned why-here line in the pin tone', () => {
    vi.useFakeTimers();
    const { container } = setup({ kept: [BOM], side: 'left' });
    fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
    act(() => { vi.advanceTimersByTime(500); });
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('you pinned this');
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(true);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-right')).toBe(true);
    vi.useRealTimers();
  });

  it('auto item tooltip shows the stage why-here line in the auto tone, left-positioned on the right dock', () => {
    vi.useFakeTimers();
    const { container } = setup({ suggested: [GRADE], side: 'right' });
    fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
    act(() => { vi.advanceTimersByTime(500); });
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('suggested for this stage · click ✦ to keep');
    expect(desc.classList.contains('tool-tooltip-desc--auto')).toBe(true);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-left')).toBe(true);
    vi.useRealTimers();
  });
});
