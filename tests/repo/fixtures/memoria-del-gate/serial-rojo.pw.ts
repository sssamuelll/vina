import { test, expect } from '@playwright/test';

// `c` no llega a correr: lo que no corrió no pasó.
test.describe.configure({ mode: 'serial' });

test('a pasa', () => {
  expect(1).toBe(1);
});

test('b falla siempre', () => {
  expect(1).toBe(2);
});

test('c no llega a correr', () => {
  expect(1).toBe(1);
});
