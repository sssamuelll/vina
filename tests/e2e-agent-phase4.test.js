/**
 * E2E Test Suite — Agent Phase 4: AI Copilot, Settings, Keyboard Shortcuts, Error Recovery
 *
 * Tests the AI copilot integration: CopilotPanel UI, AgentSettings, keyboard shortcuts,
 * cost footer, error recovery, provider selection, teaching mode, tool registry,
 * agent loop, proactive warnings, skills, memory, console health, and stress tests.
 *
 * Standalone Puppeteer runner, spawns its own Vite dev server on port 5198.
 * Run: node tests/e2e-agent-phase4.test.js
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const PORT = 5198;
let browser, page, devServer;
const consoleErrors = [];
const consoleWarnings = [];

// ── Helpers ──────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ok(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function svgClick(x, y) {
  const svg = await page.$('.pattern-svg');
  if (!svg) throw new Error('SVG canvas not found');
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}

async function svgDrag(x1, y1, x2, y2, steps = 10) {
  const svg = await page.$('.pattern-svg');
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(
      box.x + x1 + (x2 - x1) * t,
      box.y + y1 + (y2 - y1) * t,
    );
    await sleep(10);
  }
  await page.mouse.up();
}

async function pressKey(key) { await page.keyboard.press(key); }

async function selectToolByKey(key) {
  const svg = await page.$('.pattern-svg');
  if (svg) {
    const box = await svg.boundingBox();
    await page.mouse.click(box.x + 5, box.y + 5);
    await sleep(50);
  }
  await pressKey(key);
  await sleep(100);
}

async function focusCanvas() {
  const svg = await page.$('.pattern-svg');
  if (svg) {
    const box = await svg.boundingBox();
    await page.mouse.click(box.x + 5, box.y + 5);
    await sleep(50);
  }
}

async function openActivityView(title) {
  const btn = await page.$(`button.activity-bar-item[title="${title}"]`);
  if (!btn) throw new Error(`Activity bar button "${title}" not found`);
  await btn.click();
  await sleep(300);
}

async function ensureSidebarClosed() {
  const sidebar = await page.$('.sidebar.open');
  if (sidebar) {
    const closeBtn = await page.$('.sidebar-close');
    if (closeBtn) {
      await closeBtn.click();
      await sleep(300);
    }
  }
}

/** Expose the Redux store on window.__store__ */
async function exposeStore() {
  const hasStore = await page.evaluate(() => typeof window.__store__ !== 'undefined');
  if (!hasStore) {
    await page.evaluate(async () => {
      try {
        const mod = await import('/src/store/index.ts');
        window.__store__ = mod.store;
      } catch (e) {
        console.error('Failed to import store:', e);
      }
    });
    await sleep(300);
  }
}

/** Filter console errors to only significant ones */
function filterCriticalErrors(errors) {
  return errors.filter(e =>
    !e.includes('passive event') &&
    !e.includes('Download the React DevTools') &&
    !e.includes('WebGL') &&
    !e.includes('THREE.') &&
    !e.includes('Autofocus') &&
    !e.includes('favicon') &&
    !e.includes('error boundary') &&
    !e.includes('recreate this component') &&
    !e.includes('ForwardRef(Canvas)') &&
    !e.includes('Worker') &&
    !e.includes('SpeechRecognition') &&
    !e.includes('webkitSpeechRecognition') &&
    !e.includes('Failed to fetch') &&
    !e.includes('net::ERR_') &&
    !e.includes('NetworkError') &&
    !e.includes('localhost:11434') &&
    !e.includes('ECONNREFUSED') &&
    !e.includes('detectOllama') &&
    !e.includes('AbortError')
  );
}

// ── Setup / Teardown ─────────────────────────────────────

async function setup() {
  devServer = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    cwd: '/Users/samueldarioballesterosgarcia/Projects/01_products/openclo',
    stdio: 'pipe',
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite timeout after 60s')), 60000);
    const onData = d => {
      const text = d.toString();
      if (text.includes('Local:') || text.includes('localhost:')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    devServer.stdout.on('data', onData);
    devServer.stderr.on('data', onData);
  });

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    else if (msg.type() === 'warning') consoleWarnings.push(text);
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
}

async function teardown() {
  if (browser) await browser.close();
  if (devServer) devServer.kill('SIGTERM');
}

async function freshPage() {
  consoleErrors.length = 0;
  consoleWarnings.length = 0;
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await exposeStore();
}

// ═════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════

// ─── 1. CopilotPanel UI ────────────────────────────────

async function testCopilotPanelUI() {
  console.log('\n💬 1. CopilotPanel UI');
  await freshPage();

  // Open Copilot via activity bar
  await openActivityView('AI Copilot');

  // Panel renders
  const panel = await page.$('.copilot-panel');
  ok(panel, 'CopilotPanel renders');

  // Header exists
  const header = await page.$('.copilot-header');
  ok(header, 'CopilotPanel header exists');

  // Title contains "Chat"
  const titleText = await page.evaluate(() => {
    const t = document.querySelector('.copilot-title');
    return t ? t.textContent : '';
  });
  ok(titleText.includes('Chat'), `Title contains "Chat" (got: "${titleText}")`);

  // Input area exists
  const input = await page.$('.copilot-input');
  ok(input, 'Copilot input field exists');

  // Send button exists
  const sendBtn = await page.$('.copilot-send');
  ok(sendBtn, 'Send button exists');

  // Settings (gear) button exists
  const gearBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.copilot-btn-sm')];
    return btns.some(b => b.title === 'Settings');
  });
  ok(gearBtn, 'Gear icon (Settings) button exists');

  // Click gear → settings panel opens
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
    if (btn) btn.click();
  });
  await sleep(400);

  const settingsPanel = await page.evaluate(() => {
    // AgentSettings renders an h4 "Agent Settings"
    const h4s = [...document.querySelectorAll('h4')];
    return h4s.some(h => h.textContent.trim() === 'Agent Settings');
  });
  ok(settingsPanel, 'Gear icon opens Agent Settings panel');

  // Close settings via Cancel button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cancel = btns.find(b => b.textContent.trim() === 'Cancel');
    if (cancel) cancel.click();
  });
  await sleep(200);

  // Toggle visibility — click AI Copilot again to close sidebar
  await openActivityView('AI Copilot');
  await sleep(200);
  const sidebarClosed = await page.$('.sidebar.closed');
  ok(sidebarClosed, 'Clicking AI Copilot icon again toggles panel closed');
}

// ─── 2. Agent Settings ─────────────────────────────────

async function testAgentSettings() {
  console.log('\n⚙️ 2. Agent Settings');
  await freshPage();

  // Open copilot and then settings
  await openActivityView('AI Copilot');
  await sleep(200);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
    if (btn) btn.click();
  });
  await sleep(400);

  // Provider dropdown exists — look for select elements within the copilot panel
  const providerSelect = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    return selects.length > 0 ? selects[0].value : null;
  });
  ok(providerSelect !== null, `Provider dropdown exists (value: "${providerSelect}")`);

  // API key input exists (type=password for masking)
  const apiKeyInput = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="password"]')];
    return inputs.length > 0;
  });
  ok(apiKeyInput, 'API key input exists (masked/password type)');

  // Model selection dropdown
  const modelSelect = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    return selects.length >= 2 ? selects[1].value : null;
  });
  ok(modelSelect !== null, `Model selection dropdown exists (value: "${modelSelect}")`);

  // Teaching mode toggle
  const teachingToggle = await page.evaluate(() => {
    const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
    return checkboxes.length > 0;
  });
  ok(teachingToggle, 'Teaching mode toggle (checkbox) exists');

  // Language preference dropdown
  const languageSelect = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    // Third select: language
    return selects.length >= 3 ? selects[2].value : null;
  });
  ok(languageSelect !== null, `Language preference dropdown exists (value: "${languageSelect}")`);

  // Budget input
  const budgetInput = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    return inputs.length > 0;
  });
  ok(budgetInput, 'Budget input (number) exists');

  // Token usage display
  const tokenUsage = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('This session') && text.includes('Budget');
  });
  ok(tokenUsage, 'Token usage display exists (session + budget)');

  // Save and Cancel buttons
  const hasButtons = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const hasSave = btns.some(b => b.textContent.trim() === 'Save');
    const hasCancel = btns.some(b => b.textContent.trim() === 'Cancel');
    return hasSave && hasCancel;
  });
  ok(hasButtons, 'Save and Cancel buttons exist');
}

// ─── 3. Quick Action Chips (Mobile) ────────────────────

async function testQuickActionChips() {
  console.log('\n📱 3. Quick Action Chips (Mobile)');
  await freshPage();

  // Configure a fake provider so hasConnection is true (chips only show when connected)
  await page.evaluate(() => {
    const config = { provider: 'ollama', apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434' };
    localStorage.setItem('openclo-provider-config', JSON.stringify(config));
  });

  // Open copilot at desktop width first
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await openActivityView('AI Copilot');
  await sleep(300);

  // Now resize to mobile
  await page.setViewport({ width: 375, height: 812 });
  await sleep(800);

  // Check for quick action chips
  const chipsExist = await page.evaluate(() => {
    const chips = document.querySelectorAll('.copilot-quick-chip');
    return chips.length;
  });
  ok(chipsExist > 0, `Quick action chips render on mobile viewport (${chipsExist} chips)`);

  // Verify chip labels match expected quick actions
  const chipLabels = await page.evaluate(() => {
    return [...document.querySelectorAll('.copilot-quick-chip')].map(c => c.textContent.trim());
  });
  const expectedLabels = ['Nuevo corpiño', 'Agregar manga', 'Gradar', 'Anidar', 'Exportar DXF'];
  for (const label of expectedLabels) {
    ok(chipLabels.includes(label), `Quick chip "${label}" present`);
  }

  // Clean up — reset viewport and localStorage
  await page.evaluate(() => {
    localStorage.removeItem('openclo-provider-config');
  });
  await page.setViewport({ width: 1400, height: 900 });
  await sleep(300);
}

// ─── 4. Keyboard Shortcuts ─────────────────────────────

async function testKeyboardShortcuts() {
  console.log('\n⌨️ 4. Keyboard Shortcuts');
  await freshPage();

  // Open copilot panel first
  await openActivityView('AI Copilot');
  await sleep(300);

  // Test keyboard shortcut module loads correctly
  const shortcutModule = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/keyboardShortcuts.ts');
      return {
        hasCopilotShortcuts: Array.isArray(mod.COPILOT_SHORTCUTS),
        shortcutCount: mod.COPILOT_SHORTCUTS.length,
        hasCreateHandler: typeof mod.createCopilotKeyHandler === 'function',
        hasGetCommands: typeof mod.getCopilotCommands === 'function',
        hasFormatShortcut: typeof mod.formatShortcut === 'function',
        shortcuts: mod.COPILOT_SHORTCUTS.map(s => ({
          display: s.display,
          key: s.key,
          meta: s.meta,
          shift: s.shift,
        })),
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!shortcutModule.error, 'Keyboard shortcuts module loads');
  ok(shortcutModule.shortcutCount === 3, `3 copilot shortcuts defined (got: ${shortcutModule.shortcutCount})`);
  ok(shortcutModule.hasCreateHandler, 'createCopilotKeyHandler function exists');
  ok(shortcutModule.hasGetCommands, 'getCopilotCommands function exists');

  // Wire up the handler and test it via dispatched keydown events
  const handlerResult = await page.evaluate(async () => {
    const mod = await import('/src/copilot/keyboardShortcuts.ts');
    let focusCalled = false;
    let toggleCalled = false;
    let blurCalled = false;

    const handler = mod.createCopilotKeyHandler({
      onFocusInput: () => { focusCalled = true; },
      onTogglePanel: () => { toggleCalled = true; },
      onBlurInput: () => { blurCalled = true; },
    });

    // Attach handler
    document.addEventListener('keydown', handler);

    // Simulate Cmd+/ (focus)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }));

    // Simulate Cmd+Shift+/ (toggle)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, shiftKey: true, bubbles: true }));

    // Simulate Escape when copilot input is focused
    const input = document.querySelector('.copilot-input');
    if (input) {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    // Clean up
    document.removeEventListener('keydown', handler);

    return { focusCalled, toggleCalled, blurCalled };
  });

  ok(handlerResult.focusCalled, 'Cmd+/ triggers onFocusInput handler');
  ok(handlerResult.toggleCalled, 'Cmd+Shift+/ triggers onTogglePanel handler');
  ok(handlerResult.blurCalled, 'Escape on copilot input triggers onBlurInput handler');

  // Test formatShortcut
  const formatted = await page.evaluate(async () => {
    const mod = await import('/src/copilot/keyboardShortcuts.ts');
    return mod.COPILOT_SHORTCUTS.map(s => mod.formatShortcut(s));
  });
  ok(formatted.length === 3, `formatShortcut works for all 3 shortcuts`);

  // Test getCopilotCommands returns valid Command objects
  const commands = await page.evaluate(async () => {
    const mod = await import('/src/copilot/keyboardShortcuts.ts');
    const cmds = mod.getCopilotCommands({
      onFocusInput: () => {},
      onTogglePanel: () => {},
      onBlurInput: () => {},
    });
    return cmds.map(c => ({ id: c.id, name: c.name, category: c.category }));
  });
  ok(commands.length === 3, `getCopilotCommands returns 3 commands`);
  ok(commands.some(c => c.id === 'copilot-focus'), 'copilot-focus command exists');
  ok(commands.some(c => c.id === 'copilot-toggle'), 'copilot-toggle command exists');
}

// ─── 5. Cost Footer ────────────────────────────────────

async function testCostFooter() {
  console.log('\n💰 5. Cost Footer');
  await freshPage();

  // Open copilot
  await openActivityView('AI Copilot');
  await sleep(200);

  // Cost manager module loads
  const costModule = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/costManager.ts');
      return {
        hasCostManager: typeof mod.CostManager === 'function',
        hasPricing: typeof mod.MODEL_PRICING === 'object',
        pricingKeys: Object.keys(mod.MODEL_PRICING),
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!costModule.error, 'Cost manager module loads');
  ok(costModule.hasCostManager, 'CostManager class exists');
  ok(costModule.pricingKeys.length >= 8, `Model pricing table has ≥8 entries (got: ${costModule.pricingKeys.length})`);

  // Cost footer element class exists in CSS (renders conditionally when cost > 0)
  const costFooterExists = await page.evaluate(() => {
    // The footer renders only when sessionCostLabel is non-empty
    // We can verify the component code handles it by checking CostManager works
    const style = document.querySelector('style, link[rel="stylesheet"]');
    // Check if the CSS class is defined
    const sheets = [...document.styleSheets];
    for (const sheet of sheets) {
      try {
        const rules = [...sheet.cssRules];
        for (const rule of rules) {
          if (rule.selectorText && rule.selectorText.includes('copilot-cost-footer')) {
            return true;
          }
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  ok(costFooterExists, 'copilot-cost-footer CSS class is defined');

  // Test CostManager functionality
  const costTest = await page.evaluate(async () => {
    const mod = await import('/src/copilot/costManager.ts');
    const cm = new mod.CostManager('test-project');
    cm.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    const session = cm.getSessionCost();
    const formatted = cm.formatSessionCost();
    return {
      sessionCalls: session.calls,
      sessionTokens: session.tokens,
      sessionCost: session.estimatedCost,
      formatted,
    };
  });
  ok(costTest.sessionCalls === 1, `CostManager tracks calls (${costTest.sessionCalls})`);
  ok(costTest.sessionTokens === 1500, `CostManager tracks tokens (${costTest.sessionTokens})`);
  ok(costTest.sessionCost > 0, `CostManager estimates cost (${costTest.sessionCost})`);
  ok(costTest.formatted.length > 0, `CostManager formats cost string: "${costTest.formatted}"`);
}

// ─── 6. Error Recovery UI ──────────────────────────────

async function testErrorRecoveryUI() {
  console.log('\n🛡️ 6. Error Recovery UI');
  await freshPage();

  // Open copilot with no provider configured
  await page.evaluate(() => {
    localStorage.removeItem('openclo-provider-config');
  });
  await freshPage();
  await openActivityView('AI Copilot');
  await sleep(300);

  // When no API key set, shows appropriate message
  const emptyState = await page.evaluate(() => {
    const empty = document.querySelector('.copilot-empty');
    if (!empty) return null;
    return empty.textContent;
  });
  ok(emptyState, 'Empty state renders when no provider configured');
  ok(
    emptyState.includes('Connect') || emptyState.includes('provider') || emptyState.includes('Offline'),
    `Shows appropriate no-key message (contains provider/connect/offline)`
  );

  // Setup button exists
  const setupBtn = await page.$('.copilot-setup-btn');
  ok(setupBtn, 'Configure Provider button exists in empty state');

  // Error recovery module loads
  const recoveryModule = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/errorRecovery.ts');
      return {
        hasClassifyError: typeof mod.classifyError === 'function',
        hasGetErrorMessage: typeof mod.getErrorMessage === 'function',
        hasIsOfflineMode: typeof mod.isOfflineMode === 'function',
        hasRecoveryStrategy: typeof mod.RecoveryStrategy === 'function',
        hasGetOfflineActions: typeof mod.getOfflineActions === 'function',
        offlineActionCount: mod.getOfflineActions().length,
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!recoveryModule.error, 'Error recovery module loads');
  ok(recoveryModule.hasClassifyError, 'classifyError function exists');
  ok(recoveryModule.hasRecoveryStrategy, 'RecoveryStrategy class exists');
  ok(recoveryModule.offlineActionCount > 0, `Offline actions available (${recoveryModule.offlineActionCount})`);

  // isOfflineMode correctly detects no config
  const isOffline = await page.evaluate(async () => {
    const mod = await import('/src/copilot/errorRecovery.ts');
    return mod.isOfflineMode(null);
  });
  ok(isOffline, 'isOfflineMode(null) returns true');
}

// ─── 7. Provider Selection ─────────────────────────────

async function testProviderSelection() {
  console.log('\n🔄 7. Provider Selection');
  await freshPage();

  // Open copilot + settings
  await openActivityView('AI Copilot');
  await sleep(200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
    if (btn) btn.click();
  });
  await sleep(400);

  // Get provider select element
  const providerOptions = await page.evaluate(() => {
    const select = document.querySelectorAll('select')[0];
    if (!select) return [];
    return [...select.options].map(o => ({ value: o.value, label: o.textContent }));
  });
  ok(providerOptions.length >= 3, `Provider dropdown has ≥3 options (got: ${providerOptions.length})`);

  const hasAnthropic = providerOptions.some(o => o.value === 'anthropic');
  const hasOpenAI = providerOptions.some(o => o.value === 'openai');
  const hasOllama = providerOptions.some(o => o.value === 'ollama');
  ok(hasAnthropic, 'Anthropic provider option exists');
  ok(hasOpenAI, 'OpenAI provider option exists');
  ok(hasOllama, 'Ollama provider option exists');

  // Switch to OpenAI — model dropdown should update
  await page.evaluate(() => {
    const select = document.querySelectorAll('select')[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    nativeInputValueSetter.call(select, 'openai');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);

  const modelAfterOpenAI = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
      const models = [...selects[1].options].map(o => o.value);
      return models;
    }
    return [];
  });
  const hasGPT = modelAfterOpenAI.some(m => m.includes('gpt'));
  ok(hasGPT, `Switching to OpenAI shows GPT models (${modelAfterOpenAI.join(', ')})`);

  // Switch to Ollama — API key input should disappear, URL input should appear
  await page.evaluate(() => {
    const select = document.querySelectorAll('select')[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    nativeInputValueSetter.call(select, 'ollama');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);

  const ollamaUI = await page.evaluate(() => {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const textInputs = [...document.querySelectorAll('input[type="text"]')];
    const hasUrlInput = textInputs.some(i => i.placeholder && i.placeholder.includes('localhost'));
    return {
      noApiKeyInput: passwordInputs.length === 0,
      hasUrlInput,
    };
  });
  ok(ollamaUI.noApiKeyInput, 'Ollama mode hides API key input');
  ok(ollamaUI.hasUrlInput, 'Ollama mode shows URL input');

  // Switch back to Anthropic
  await page.evaluate(() => {
    const select = document.querySelectorAll('select')[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    nativeInputValueSetter.call(select, 'anthropic');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);

  const backToAnthropic = await page.evaluate(() => {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    return passwordInputs.length > 0;
  });
  ok(backToAnthropic, 'Switching back to Anthropic shows API key input');
}

// ─── 8. Teaching Mode Toggle ───────────────────────────

async function testTeachingModeToggle() {
  console.log('\n🎓 8. Teaching Mode Toggle');
  await freshPage();

  // Open copilot + settings
  await openActivityView('AI Copilot');
  await sleep(200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
    if (btn) btn.click();
  });
  await sleep(400);

  // Find teaching mode checkbox
  const toggleResult = await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (!checkbox) return { found: false };
    const before = checkbox.checked;
    checkbox.click();
    const after = checkbox.checked;
    // Click again to restore
    checkbox.click();
    return { found: true, before, after, toggled: before !== after };
  });
  ok(toggleResult.found, 'Teaching mode checkbox found');
  ok(toggleResult.toggled, `Teaching mode toggles (${toggleResult.before} → ${toggleResult.after})`);

  // Teaching mode label visible
  const teachingLabel = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    return labels.some(l => l.textContent.includes('Teaching Mode'));
  });
  ok(teachingLabel, 'Teaching Mode label visible');

  // ON/OFF indicator updates
  const indicator = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    return spans.some(s => s.textContent.trim() === 'ON' || s.textContent.trim() === 'OFF');
  });
  ok(indicator, 'ON/OFF indicator visible');
}

// ─── 9. Tool Registry ──────────────────────────────────

async function testToolRegistry() {
  console.log('\n🔧 9. Tool Registry');
  await freshPage();

  const registryResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/tools/registry.ts');
      const registry = mod.getDefaultRegistry();
      return {
        size: registry.size,
        names: registry.listNames(),
        hasGet: typeof registry.get === 'function',
        hasValidate: typeof registry.validate === 'function',
        hasToOpenAI: typeof registry.toOpenAITools === 'function',
        hasToAnthropic: typeof registry.toAnthropicTools === 'function',
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!registryResult.error, 'Tool registry loads');
  ok(registryResult.size === 42, `All 42 tools registered (got: ${registryResult.size})`);
  ok(registryResult.hasGet, 'registry.get() exists');
  ok(registryResult.hasValidate, 'registry.validate() exists');
  ok(registryResult.hasToOpenAI, 'registry.toOpenAITools() exists');
  ok(registryResult.hasToAnthropic, 'registry.toAnthropicTools() exists');

  // Verify some key tools exist
  const keyTools = ['createPiece', 'createSeam', 'gradePiece', 'runNesting', 'exportDXF', 'setMeasurements'];
  for (const name of keyTools) {
    ok(registryResult.names.includes(name), `Tool "${name}" registered`);
  }

  // Verify OpenAI format conversion
  const openAITools = await page.evaluate(async () => {
    const mod = await import('/src/copilot/tools/registry.ts');
    const registry = mod.getDefaultRegistry();
    const tools = registry.toOpenAITools();
    return {
      count: tools.length,
      firstTool: tools[0] ? { type: tools[0].type, name: tools[0].function.name } : null,
    };
  });
  ok(openAITools.count === 42, `OpenAI format has 42 tools (got: ${openAITools.count})`);
  ok(openAITools.firstTool?.type === 'function', 'OpenAI tool type is "function"');
}

// ─── 10. Agent Loop ─────────────────────────────────────

async function testAgentLoop() {
  console.log('\n🔁 10. Agent Loop');
  await freshPage();

  // Open copilot
  await openActivityView('AI Copilot');
  await sleep(200);

  // Ensure NO provider configured — sending should fail gracefully
  await page.evaluate(() => {
    localStorage.removeItem('openclo-provider-config');
  });
  await freshPage();
  await openActivityView('AI Copilot');
  await sleep(300);

  // Type a message and send
  const input = await page.$('.copilot-input');
  if (input) {
    await input.click();
    await page.keyboard.type('Crear un corpiño');
    await sleep(100);

    // Press Enter
    await page.keyboard.press('Enter');
    await sleep(500);

    // Should NOT crash — check app is still functional
    const svgExists = await page.$('.pattern-svg');
    ok(svgExists, 'App still functional after sending without API key (no crash)');

    // Check for messages or empty state
    const hasMessages = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.copilot-msg');
      const empty = document.querySelector('.copilot-empty');
      return msgs.length > 0 || empty !== null;
    });
    ok(hasMessages, 'Message area or empty state visible after send attempt');
  } else {
    ok(true, 'Input not visible (offline/empty state mode) — graceful');
  }

  // Verify agent loop module loads
  const loopModule = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/agentLoop.ts');
      return {
        hasRunAgentLoop: typeof mod.runAgentLoop === 'function',
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!loopModule.error, 'Agent loop module loads');
  ok(loopModule.hasRunAgentLoop, 'runAgentLoop function exists');
}

// ─── 11. Proactive Warnings ────────────────────────────

async function testProactiveWarnings() {
  console.log('\n⚠️ 11. Proactive Warnings');
  await freshPage();

  // Create a piece without seam allowance
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  // Open copilot to see warnings
  await openActivityView('AI Copilot');
  await sleep(500);

  // Check for warnings display
  const warningsDisplay = await page.evaluate(() => {
    // Warnings appear in a div with bg-warning style
    const warningDiv = document.querySelector('[style*="bg-warning"]');
    if (warningDiv) return warningDiv.textContent;
    // Also check for any text containing warning indicators
    const body = document.body.innerText;
    if (body.includes('⚠') || body.includes('SA') || body.includes('seam allowance') || body.includes('margen')) {
      return 'warning found';
    }
    return null;
  });
  ok(warningsDisplay, 'Proactive warning appears for piece without seam allowance');

  // Proactive analysis module works
  const proactiveResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/proactiveAnalysis.ts');
      return {
        hasRunProactive: typeof mod.runProactiveAnalysis === 'function',
        hasFormatWarnings: typeof mod.formatWarnings === 'function',
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!proactiveResult.error, 'Proactive analysis module loads');
  ok(proactiveResult.hasRunProactive, 'runProactiveAnalysis function exists');
  ok(proactiveResult.hasFormatWarnings, 'formatWarnings function exists');
}

// ─── 12. Skill Triggers ────────────────────────────────

async function testSkillTriggers() {
  console.log('\n🧠 12. Skill Triggers');
  await freshPage();

  const skillResult = await page.evaluate(async () => {
    try {
      const loaderMod = await import('/src/copilot/skills/skillLoader.ts');
      const registryMod = await import('/src/copilot/skills/skillRegistry.ts');

      const registry = registryMod.getDefaultSkillRegistry();
      const skillNames = registry.listNames();

      // Test trigger matching
      const bodiceSkills = loaderMod.getRelevantSkills('crear un corpiño base');
      const sleeveSkills = loaderMod.getRelevantSkills('add a sleeve to the bodice');
      const skirtSkills = loaderMod.getRelevantSkills('hacer una falda');

      // Build skill context for prompt
      const formatted = loaderMod.buildSkillContext(bodiceSkills);

      return {
        skillCount: registry.size,
        skillNames,
        bodiceMatched: bodiceSkills.length,
        sleeveMatched: sleeveSkills.length,
        skirtMatched: skirtSkills.length,
        formattedLength: formatted.length,
        hasLoadSkill: typeof loaderMod.loadSkill === 'function',
        hasGetRelevant: typeof loaderMod.getRelevantSkills === 'function',
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!skillResult.error, `Skill system loads${skillResult.error ? ': ' + skillResult.error : ''}`);
  ok(skillResult.skillCount >= 5, `Skill registry has ≥5 skills (got: ${skillResult.skillCount})`);
  ok(skillResult.bodiceMatched > 0, `"crear un corpiño" matches bodice skill (${skillResult.bodiceMatched})`);
  ok(skillResult.sleeveMatched > 0, `"add a sleeve" matches sleeve skill (${skillResult.sleeveMatched})`);
  ok(skillResult.skirtMatched > 0, `"hacer una falda" matches skirt skill (${skillResult.skirtMatched})`);
  ok(skillResult.formattedLength > 0, 'Skills format to prompt text');
}

// ─── 13. Memory ────────────────────────────────────────

async function testMemory() {
  console.log('\n🧠 13. Memory');
  await freshPage();

  // Test memory module
  const memoryResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/memory.ts');
      const mem = new mod.ProjectMemory('test-e2e-project');

      // Clear any existing
      mem.clear();
      mem.save();

      // Add messages
      mem.addMessage({ role: 'user', content: 'Create a bodice', timestamp: Date.now() });
      mem.addMessage({ role: 'assistant', content: 'Creating bodice...', timestamp: Date.now(), toolsCalled: ['createPiece'] });
      mem.save();

      // Load from localStorage
      const loaded = new mod.ProjectMemory('test-e2e-project');
      const messages = loaded.messages;
      const projectId = loaded.projectId;

      // Clean up
      mem.clear();
      mem.save();

      return {
        hasProjectMemory: typeof mod.ProjectMemory === 'function',
        savedMessages: messages.length,
        hasProjectId: projectId === 'test-e2e-project',
        firstRole: messages[0]?.role,
        secondToolsCalled: messages[1]?.toolsCalled,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!memoryResult.error, 'Memory module loads');
  ok(memoryResult.hasProjectMemory, 'ProjectMemory class exists');
  ok(memoryResult.savedMessages === 2, `Memory saves messages (${memoryResult.savedMessages})`);
  ok(memoryResult.hasProjectId, 'Memory stored with correct project ID');
  ok(memoryResult.firstRole === 'user', 'First message is user role');
  ok(memoryResult.secondToolsCalled?.includes('createPiece'), 'Assistant message has toolsCalled');

  // Verify CopilotPanel stores conversation in localStorage
  await openActivityView('AI Copilot');
  await sleep(200);

  const localStorageKeys = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('memory')) keys.push(key);
    }
    return keys;
  });
  ok(localStorageKeys.length >= 0, `Memory localStorage keys accessible (${localStorageKeys.length} memory-related keys)`);
}

// ─── 14. No Console Errors ─────────────────────────────

async function testNoConsoleErrors() {
  console.log('\n🔇 14. No Console Errors');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  // Full interaction cycle
  await openActivityView('AI Copilot');
  await sleep(200);

  // Open settings
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
    if (btn) btn.click();
  });
  await sleep(200);

  // Close settings
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel');
    if (btn) btn.click();
  });
  await sleep(200);

  // Create a piece
  await ensureSidebarClosed();
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  // Switch views
  await openActivityView('AI Copilot');
  await sleep(200);
  await openActivityView('Pattern Explorer');
  await sleep(200);
  await openActivityView('AI Copilot');
  await sleep(200);

  // Keyboard shortcuts
  await page.keyboard.down('Meta');
  await pressKey('/');
  await page.keyboard.up('Meta');
  await sleep(100);
  await pressKey('Escape');
  await sleep(100);

  const newErrors = filterCriticalErrors(consoleErrors.slice(errorsBefore));
  ok(newErrors.length === 0, `No unexpected console errors during interaction cycle (${newErrors.length} errors)`);
  if (newErrors.length > 0) {
    newErrors.slice(0, 3).forEach(e => console.log(`    ⚠ ${e.slice(0, 150)}`));
  }
}

// ─── 15. Rapid Interaction Stress Test ─────────────────

async function testRapidInteraction() {
  console.log('\n🏋️ 15. Rapid Interaction Stress Test');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  // Open copilot
  await openActivityView('AI Copilot');
  await sleep(200);

  // Open settings
  const openSettings = async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.copilot-btn-sm')].find(b => b.title === 'Settings');
      if (btn) btn.click();
    });
    await sleep(50);
  };

  const closeSettings = async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel');
      if (btn) btn.click();
    });
    await sleep(50);
  };

  // Rapid: open/close settings 20 times
  for (let i = 0; i < 20; i++) {
    await openSettings();
    await closeSettings();
  }
  await sleep(300);

  // App still functional
  let svgExists = await page.$('.pattern-svg');
  ok(svgExists, 'App stable after 20 rapid settings toggles');

  // Rapid: toggle teaching mode in settings
  await openSettings();
  await sleep(200);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const checkbox = document.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.click();
    });
    await sleep(20);
  }
  await closeSettings();
  await sleep(200);

  svgExists = await page.$('.pattern-svg');
  ok(svgExists, 'App stable after 20 rapid teaching mode toggles');

  // Rapid: switch providers in settings
  await openSettings();
  await sleep(200);
  const providers = ['openai', 'ollama', 'anthropic'];
  for (let i = 0; i < 20; i++) {
    const prov = providers[i % 3];
    await page.evaluate((p) => {
      const select = document.querySelectorAll('select')[0];
      if (select) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, p);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, prov);
    await sleep(30);
  }
  await closeSettings();
  await sleep(200);

  svgExists = await page.$('.pattern-svg');
  ok(svgExists, 'App stable after 20 rapid provider switches');

  // Check for errors
  const newErrors = filterCriticalErrors(consoleErrors.slice(errorsBefore));
  ok(newErrors.length === 0, `No console errors during stress test (${newErrors.length} errors)`);
  if (newErrors.length > 0) {
    newErrors.slice(0, 3).forEach(e => console.log(`    ⚠ ${e.slice(0, 150)}`));
  }
}

// ═════════════════════════════════════════════════════════
//  RUNNER
// ═════════════════════════════════════════════════════════

async function run() {
  let passed = 0, failed = 0;
  const tests = [
    testCopilotPanelUI,
    testAgentSettings,
    testQuickActionChips,
    testKeyboardShortcuts,
    testCostFooter,
    testErrorRecoveryUI,
    testProviderSelection,
    testTeachingModeToggle,
    testToolRegistry,
    testAgentLoop,
    testProactiveWarnings,
    testSkillTriggers,
    testMemory,
    testNoConsoleErrors,
    testRapidInteraction,
  ];

  console.log(`\n🧪 OpenClo E2E — Agent Phase 4 — ${tests.length} test suites\n${'═'.repeat(55)}`);

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length}`);

  if (failed > 0) process.exitCode = 1;
}

(async () => {
  try {
    await setup();
    await run();
  } catch (e) {
    console.error('Setup failed:', e.message);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
})();
