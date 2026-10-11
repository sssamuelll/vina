/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import ToolTooltip from '../ToolTooltip';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderTip(props: Partial<Parameters<typeof ToolTooltip>[0]> = {}) {
  vi.useFakeTimers();
  return render(
    <ToolTooltip name="Select" {...props}>
      <button type="button">child</button>
    </ToolTooltip>,
  );
}

function hover(container: HTMLElement) {
  fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
  act(() => { vi.advanceTimersByTime(500); });
}

describe('ToolTooltip', () => {
  it('renders children and no tooltip before hover', () => {
    const { container } = renderTip();
    expect(container.textContent).toContain('child');
    expect(document.querySelector('.tool-tooltip')).toBeNull();
  });

  it('shows the tooltip with the name after the 500ms delay', () => {
    const { container } = renderTip({ name: 'Select' });
    hover(container);
    const tip = document.querySelector('.tool-tooltip');
    expect(tip).toBeTruthy();
    expect(tip!.querySelector('.tool-tooltip-name')!.textContent).toBe('Select');
  });

  it('apagado no sale: lo que el botón abrió ya está a la vista y el tooltip lo taparía', () => {
    // El estado de la simulación (2026-10-11): con su detalle abierto, volver a pasar por el
    // icono sacaba el tooltip (z del tooltip) encima de las últimas líneas del detalle, los avisos.
    const { container, rerender } = renderTip({ apagado: true });
    hover(container);
    expect(document.querySelector('.tool-tooltip')).toBeNull();
    rerender(<ToolTooltip name="Select"><button type="button">child</button></ToolTooltip>);
    hover(container);
    expect(document.querySelector('.tool-tooltip'), 'encendido de nuevo, vuelve a salir').toBeTruthy();
  });

  it('renders the shortcut as a kbd when given', () => {
    const { container } = renderTip({ name: 'Select', shortcut: 'Z' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-shortcut')!.textContent).toBe('Z');
  });

  it('omits the kbd when no shortcut', () => {
    const { container } = renderTip({ name: 'Arrange' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-shortcut')).toBeNull();
  });

  it('renders the description line', () => {
    const { container } = renderTip({ name: 'X', description: 'Crea o muestra una pieza para dibujar líneas internas.' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-desc')!.textContent).toBe('Crea o muestra una pieza para dibujar líneas internas.');
  });

  it('uses the position class (right vs left)', () => {
    const { container } = renderTip({ name: 'X', position: 'right' });
    hover(container);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-right')).toBe(true);
  });
});
