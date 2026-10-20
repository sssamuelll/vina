// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useT } from '../index';
import { __listenerCountForTests, __resetLocaleForTests, setLocale } from '../locale';

let renders = 0;
function DeleteKey() {
  renders++;
  return <span>{useT().keys.delete}</span>;
}

beforeEach(() => {
  localStorage.clear();
  __resetLocaleForTests('es');
  renders = 0;
});

afterEach(() => {
  cleanup();
});

describe('useT', () => {
  it('re-renders once per language change', () => {
    render(<DeleteKey />);
    expect(screen.getByText('Supr')).toBeTruthy();
    const before = renders;
    act(() => setLocale('de'));
    expect(screen.getByText('Entf')).toBeTruthy();
    expect(renders - before).toBe(1);
    act(() => setLocale('de'));
    expect(renders - before).toBe(1);
  });

  it('unsubscribes on unmount, StrictMode double mount included', () => {
    const base = __listenerCountForTests();
    const { unmount } = render(
      <StrictMode>
        <DeleteKey />
      </StrictMode>,
    );
    expect(__listenerCountForTests()).toBe(base + 1);
    unmount();
    expect(__listenerCountForTests()).toBe(base);
    const after = renders;
    act(() => setLocale('en'));
    expect(renders).toBe(after);
  });
});
