/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Minus } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dock from '../Dock';
import DockToolPicker from '../DockToolPicker';
import ToolTooltip from '../ToolTooltip';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LINE_TOOL = {
  id: 'line',
  icon: Minus,
  label: 'Línea',
  shortcut: '⇧L',
  grupo: 'dibujar' as const,
};

describe('notación de atajos en las superficies del dock', () => {
  it('normaliza el aria-label del dock', () => {
    render(
      <Dock
        tools={[LINE_TOOL]}
        activeToolId="line"
        onSelectTool={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Línea · Shift+L' })).toBeTruthy();
  });

  it('normaliza la columna de teclas del personalizador', () => {
    render(
      <DockToolPicker
        catalog={[LINE_TOOL]}
        selectedIds={['line']}
        onAdd={() => {}}
        onRemove={() => {}}
        onReset={() => {}}
        ancla={{ left: 0, bottom: 0 }}
      />,
    );

    // El personalizador cuelga de <body>, no del contenedor del render.
    expect(document.body.querySelector('.dock-picker__kbd')?.textContent).toBe('Shift+L');
  });

  it('normaliza el chip del tooltip', () => {
    vi.useFakeTimers();
    const { container } = render(
      <ToolTooltip name="Línea" shortcut="Shift+L">
        <button type="button">Línea</button>
      </ToolTooltip>,
    );

    fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
    act(() => { vi.advanceTimersByTime(500); });

    expect(document.querySelector('.tool-tooltip-shortcut')?.textContent).toBe('Shift+L');
  });
});
