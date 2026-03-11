import { test, expect } from '@playwright/test';

test.describe('TSL Zero-Copy Rendering', () => {
  test.setTimeout(120_000);

  test('cloth simulation runs with TSL solver on WebGPU', async ({ page }) => {
    // Collect console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // Wait for simulation to start (triggered by default template)
    await page.waitForTimeout(5_000);

    // Check that WebGPU TSL solver was selected (or fell through to WASM/CPU)
    const hasTslLog = consoleMessages.some(msg => msg.includes('TSL solver initialized'));
    const hasWebGpuLog = consoleMessages.some(msg => msg.includes('Using WebGPU'));

    // If WebGPU is available, expect TSL solver
    if (hasWebGpuLog) {
      expect(hasTslLog).toBe(true);
    }

    // Verify no WebGPU errors
    const hasGpuError = consoleMessages.some(msg =>
      msg.includes('WebGPU uncaptured error') || msg.includes('GPUValidationError'),
    );
    expect(hasGpuError).toBe(false);
  });
});
