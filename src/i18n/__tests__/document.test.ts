// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDocumentLocale, installDocumentLocale } from '../document';
import { __resetLocaleForTests, detectLocale, setLocale } from '../locale';

let uninstall: () => void = () => {};

beforeEach(() => {
  localStorage.clear();
  __resetLocaleForTests('es');
  document.documentElement.lang = 'en';
  document.title = 'Vina — Pattern making and 3D simulation';
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
});

describe('document locale', () => {
  it('applies the active locale at install and follows every change', () => {
    uninstall = installDocumentLocale();
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe('Vina — Patronaje y simulación 3D');
    setLocale('de');
    expect(document.documentElement.lang).toBe('de');
    expect(document.title).toBe('Vina — Schnittkonstruktion und 3D-Simulation');
  });

  it('stops following after uninstall', () => {
    uninstall();
    uninstall = installDocumentLocale();
    uninstall();
    setLocale('de');
    expect(document.documentElement.lang).toBe('es');
  });

  it('under pseudo, html lang is en and the title is the pseudo one', () => {
    detectLocale({ search: '?locale=pseudo', hash: '', languages: [], allowPseudo: true, replaceUrl: () => {} });
    applyDocumentLocale();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title.startsWith('[')).toBe(true);
  });
});
