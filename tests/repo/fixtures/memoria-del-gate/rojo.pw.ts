import { test, expect } from '@playwright/test';

test('pasa', () => {
  expect(1).toBe(1);
});

test('falla siempre', () => {
  expect(1).toBe(2);
});
