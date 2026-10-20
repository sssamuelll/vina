// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { __resetLocaleForTests } from '../../../i18n/locale';
import { NumericField } from '../NumericField';

/**
 * A number a person types, in their locale (i18n spec § 5.7): a text spinbutton that seeds its draft
 * with formatNumber, reads it back with parseNumber, never commits 0 for an empty or invalid entry,
 * clamps to min and max, and steps with the arrow keys.
 */
beforeEach(() => {
  __resetLocaleForTests('es');
});
afterEach(cleanup);

function mount(over: Partial<ComponentProps<typeof NumericField>> = {}) {
  const props = { value: 12.5, decimals: 1, onCommit: vi.fn(), 'aria-label': 'Ancho', ...over };
  const view = render(<NumericField {...props} />);
  return { props, view, input: screen.getByRole('spinbutton') as HTMLInputElement };
}

const type = (input: HTMLInputElement, text: string) => fireEvent.change(input, { target: { value: text } });
const enter = (input: HTMLInputElement) => fireEvent.keyDown(input, { key: 'Enter' });

describe('NumericField', () => {
  it('is a text spinbutton with the value and its bounds', () => {
    const { input } = mount({ min: 1, max: 300 });
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
    expect(input.getAttribute('aria-valuenow')).toBe('12.5');
    expect(input.getAttribute('aria-valuemin')).toBe('1');
    expect(input.getAttribute('aria-valuemax')).toBe('300');
    expect(input.getAttribute('aria-label')).toBe('Ancho');
  });

  it('seeds the draft in the locale', () => {
    expect(mount().input.value).toBe('12,5');
  });

  it('commits a typed decimal comma on Enter and redisplays it', () => {
    const { input, props } = mount({ decimals: 2 });
    type(input, '13,25');
    enter(input);
    expect(props.onCommit).toHaveBeenCalledWith(13.25);
    expect(input.value).toBe('13,25');
  });

  it('commits on blur', () => {
    const { input, props } = mount();
    type(input, '14');
    fireEvent.blur(input);
    expect(props.onCommit).toHaveBeenCalledWith(14);
    expect(input.value).toBe('14,0');
  });

  it('an invalid entry marks the field and commits nothing until a valid one', () => {
    const { input, props } = mount();
    type(input, 'abc');
    fireEvent.blur(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('abc');
    type(input, '14');
    enter(input);
    expect(props.onCommit).toHaveBeenCalledWith(14);
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('an empty entry commits nothing, never 0', () => {
    const { input, props } = mount();
    type(input, '');
    enter(input);
    fireEvent.blur(input);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it('clamps to min: 1.500 reads as 1.5 and commits 100', () => {
    const { input, props } = mount({ min: 100, value: 150 });
    type(input, '1.500');
    enter(input);
    expect(props.onCommit).toHaveBeenCalledWith(100);
  });

  it('clamps to max', () => {
    const { input, props } = mount({ max: 20 });
    type(input, '35');
    enter(input);
    expect(props.onCommit).toHaveBeenCalledWith(20);
  });

  it('ArrowUp steps and commits at once', () => {
    const { input, props } = mount({ value: 12, step: 0.5 });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(props.onCommit).toHaveBeenCalledWith(12.5);
    expect(input.value).toBe('12,5');
  });

  it('ArrowDown at min stays at min', () => {
    const { input, props } = mount({ value: 1, min: 1, step: 0.5 });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('1,0');
  });

  it('the German draft reads back through parseNumber', () => {
    __resetLocaleForTests('de');
    const { input, props } = mount({ decimals: 2 });
    expect(input.value).toBe('12,50');
    enter(input);
    expect(props.onCommit).not.toHaveBeenCalled();
    type(input, '12,75');
    enter(input);
    expect(props.onCommit).toHaveBeenCalledWith(12.75);
  });

  it('a NaN value shows an empty draft and commits nothing on blur', () => {
    const { input, props } = mount({ value: NaN });
    expect(input.value).toBe('');
    fireEvent.blur(input);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it('an untouched field commits nothing on blur or Enter, even when the value is finer than decimals', () => {
    const { input, props } = mount({ value: 12.34, decimals: 1 });
    expect(input.value).toBe('12,3');
    fireEvent.blur(input);
    enter(input);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it('an untouched empty field is not marked invalid on blur', () => {
    const { input } = mount({ value: NaN });
    fireEvent.blur(input);
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('an invalid entry left by blur gives way to a new value', () => {
    const { props, view, input } = mount();
    fireEvent.focus(input);
    type(input, 'abc');
    fireEvent.blur(input);
    view.rerender(<NumericField {...props} value={20} />);
    expect(input.value).toBe('20,0');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('a new value does not overwrite what is being typed', () => {
    const { props, view, input } = mount();
    fireEvent.focus(input);
    type(input, '13');
    view.rerender(<NumericField {...props} value={20} />);
    expect(input.value).toBe('13');
  });

  it('announces the value as displayed', () => {
    expect(mount().input.getAttribute('aria-valuetext')).toBe('12,5');
  });

  it('re-seeds when the value changes while not being edited', () => {
    const { props, view, input } = mount();
    view.rerender(<NumericField {...props} value={20} />);
    expect(input.value).toBe('20,0');
  });

  it('the wheel does nothing', () => {
    const { input, props } = mount();
    fireEvent.wheel(input, { deltaY: -100 });
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('12,5');
  });
});
