import { test, expect } from '@playwright/test';

test('cae a la primera y pasa al reintento', () => {
  expect(test.info().retry).toBe(1);
});
