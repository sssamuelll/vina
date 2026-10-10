import { test as base, expect } from '@playwright/test';

// El test pasa, pero el cierre del worker revienta. Playwright no ata ese error
// a ningún test: lo manda por onError y la corrida sale en rojo. Corre aparte
// (@error-global), porque deja sin marcas a toda su corrida.
const test = base.extend<object, { cierreRoto: void }>({
  cierreRoto: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      throw new Error('cierre del worker roto');
    },
    { scope: 'worker', auto: true },
  ],
});

test('pasa, pero el worker cae al cerrar @error-global', () => {
  expect(1).toBe(1);
});
