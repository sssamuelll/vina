import { test, expect } from '@playwright/test';

test('pasa', () => {
  expect(1).toBe(1);
});

test('también pasa', () => {
  expect(2).toBe(2);
});

test.skip('saltado a propósito', () => {});

test('saltado por dentro', () => {
  test.skip(true, 'no aplica aquí');
});
