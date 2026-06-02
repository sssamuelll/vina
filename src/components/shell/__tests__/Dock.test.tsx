/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Dock from '../Dock';
import { MousePointer2, Pen } from 'lucide-react';

afterEach(cleanup);

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'Z' },
  { id: 'pen', icon: Pen, label: 'Pen', shortcut: 'H' },
];

describe('Dock (presentational)', () => {
  it('renders the domain label and one button per tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByRole('button', { name: /select · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pen · h/i })).toBeTruthy();
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pen · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pen · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });
});
