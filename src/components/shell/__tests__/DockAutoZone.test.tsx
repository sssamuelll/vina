/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockAutoZone from '../DockAutoZone';
import { Scaling, Package } from 'lucide-react';

afterEach(cleanup);

const SUGS = [
  { id: 'grade', icon: Scaling, label: 'Grade' },
  { id: 'bom', icon: Package, label: 'BOM' },
];

describe('DockAutoZone', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<DockAutoZone suggestions={[]} onRun={() => {}} />);
    expect(container.querySelector('.dock__auto-label')).toBeNull();
    expect(container.querySelector('.dock__tool--auto')).toBeNull();
  });

  it('renders the auto label + one violet button per suggestion', () => {
    render(<DockAutoZone suggestions={SUGS} onRun={() => {}} />);
    expect(screen.getByText('auto')).toBeTruthy();
    const grade = screen.getByRole('button', { name: 'Grade' });
    expect(grade.className).toContain('dock__tool--auto');
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
  });

  it('calls onRun with the suggestion id on click', () => {
    const onRun = vi.fn();
    render(<DockAutoZone suggestions={SUGS} onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onRun).toHaveBeenCalledWith('grade');
  });
});
