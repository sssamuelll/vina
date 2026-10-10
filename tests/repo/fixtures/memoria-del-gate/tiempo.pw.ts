import { test } from '@playwright/test';

// Su único rojo es un tiempo agotado, el rojo más común del gate: no sale
// como «failed» sino como «timedOut».
test('se pasa de tiempo', async () => {
  test.setTimeout(500);
  await new Promise((r) => setTimeout(r, 2_000));
});
