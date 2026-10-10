import { test, expect } from '@playwright/test';

// Un grupo serial que cae se reintenta ENTERO: `a` corre dos veces.
test.describe.configure({ mode: 'serial' });

test('a pasa', () => {
  expect(1).toBe(1);
});

test('b cae a la primera', () => {
  expect(test.info().retry).toBe(1);
});

test('c pasa', () => {
  expect(1).toBe(1);
});
