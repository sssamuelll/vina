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

  it('applies the pin tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'you pinned this', descriptionTone: 'pin' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('you pinned this');
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(true);
  });

  it('applies the auto tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'suggested for this stage · click ✦ to keep', descriptionTone: 'auto' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-desc')!.classList.contains('tool-tooltip-desc--auto')).toBe(true);
  });

  it('renders a plain description (no tone class) when descriptionTone is omitted', () => {
    const { container } = renderTip({ name: 'X', description: 'plain' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(false);
    expect(desc.classList.contains('tool-tooltip-desc--auto')).toBe(false);
  });

  it('uses the position class (right vs left)', () => {
    const { container } = renderTip({ name: 'X', position: 'right' });
    hover(container);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-right')).toBe(true);
  });
});
