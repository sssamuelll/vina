/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockAutoZone from '../DockAutoZone';
import { Scaling, Package } from 'lucide-react';

afterEach(cleanup);

const GRADE = { id: 'grade', icon: Scaling, label: 'Grade' };
const BOM = { id: 'bom', icon: Package, label: 'BOM' };

function setup(props: Partial<Parameters<typeof DockAutoZone>[0]> = {}) {
  const onRun = vi.fn(), onPin = vi.fn(), onUnpin = vi.fn();
  render(<DockAutoZone kept={[]} suggested={[]} onRun={onRun} onPin={onPin} onUnpin={onUnpin} {...props} />);
  return { onRun, onPin, onUnpin };
}

describe('DockAutoZone', () => {
  it('renders nothing when kept and suggested are both empty', () => {
    setup();
    expect(screen.queryByText('auto')).toBeNull();
  });

  it('renders suggested items under the auto label with a Keep badge', () => {
    setup({ suggested: [GRADE] });
    expect(screen.getByText('auto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep Grade' })).toBeTruthy();
  });

  it('renders kept items with an Unpin badge and no auto label when no suggestions', () => {
    setup({ kept: [BOM] });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unpin BOM' })).toBeTruthy();
  });

  it('the Keep badge calls onPin and NOT onRun', () => {
    const { onRun, onPin } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Grade' }));
    expect(onPin).toHaveBeenCalledWith('grade');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the Unpin badge calls onUnpin and NOT onRun', () => {
    const { onRun, onUnpin } = setup({ kept: [BOM] });
    fireEvent.click(screen.getByRole('button', { name: 'Unpin BOM' }));
    expect(onUnpin).toHaveBeenCalledWith('bom');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the icon button calls onRun', () => {
    const { onRun } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onRun).toHaveBeenCalledWith('grade');
  });
});
