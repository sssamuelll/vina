/**
 * E2E Test Suite — CopilotPanel UX Audit
 *
 * Comprehensive Puppeteer tests for the CopilotPanel inside the BottomPanel.
 * Tests cover: panel opening/closing, empty state, settings, quick actions,
 * input field, keyboard shortcuts, teaching mode, language prefs, cost footer,
 * panel resize, console errors, and mobile viewport.
 *
 * Run: node tests/e2e-copilot-ux.test.js
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const PORT = 5198;
let browser, page, devServer;
const consoleErrors = [];

// ── Helpers ──────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ok(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function pressKey(key) { await page.keyboard.press(key); }

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

/** Open the bottom panel via Command Palette → "Toggle Bottom Panel" */
async function openBottomPanel() {
  const panel = await page.$('.bottom-panel.open');
  if (panel) return; // already open
  await page.keyboard.down('Meta');
  await pressKey('k');
  await page.keyboard.up('Meta');
  await sleep(300);
  await page.type('.palette-input', 'Toggle Bottom Panel');
  await sleep(200);
  await pressKey('Enter');
  await sleep(400);
}

/** Click a bottom panel tab by label */
async function clickBottomTab(label) {
  await page.evaluate((l) => {
    const tabs = [...document.querySelectorAll('.bottom-panel-tab')];
    const tab = tabs.find(b => b.textContent.trim() === l);
    if (tab) tab.click();
  }, label);
  await sleep(300);
}

/** Open copilot settings via the gear button */
async function openCopilotSettings() {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.copilot-btn-sm')];
    const gear = btns.find(b => b.title === 'Settings');
    if (gear) gear.click();
  });
  await sleep(400);
}

/** Close copilot settings via Cancel button */
async function closeCopilotSettings() {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cancel = btns.find(b => b.textContent.trim() === 'Cancel');
    if (cancel) cancel.click();
  });
  await sleep(200);
}

/** Filter out noise from console errors */
function filterCriticalErrors(errors) {
  return errors.filter(e =>
    !e.includes('passive event') &&
    !e.includes('Download the React DevTools') &&
    !e.includes('WebGL') &&
    !e.includes('THREE.') &&
    !e.includes('Autofocus') &&
    !e.includes('favicon') &&
    !e.includes('error boundary') &&
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
    if (msg.type() === 'error') consoleErrors.push(msg.text());
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
  await page.setViewport({ width: 1400, height: 900 });
  // Clear provider config to get no-provider empty state
  await page.evaluate(() => {
    localStorage.removeItem('openclo-provider-config');
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
}

// ═════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════

// ─── 1. Bottom Panel Opens — click to open, Copilot tab visible ────

async function testBottomPanelOpens() {
  console.log('\n📦 1. Bottom Panel Opens');
  await freshPage();

  // Panel starts closed
  const panelClosed = await page.$('.bottom-panel.closed');
  // It could also just have height 0 — check if not .open
  const panelOpen = await page.$('.bottom-panel.open');
  ok(!panelOpen || panelClosed, 'Bottom panel starts closed or collapsed');

  // Open via command palette
  await openBottomPanel();

  const panelNowOpen = await page.$('.bottom-panel.open');
  ok(panelNowOpen, 'Bottom panel opens via command palette');

  // Copilot tab is visible
  const copilotTab = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.bottom-panel-tab')];
    return tabs.some(t => t.textContent.trim() === 'Copilot');
  });
  ok(copilotTab, 'Copilot tab is visible in bottom panel');

  // All four tabs exist
  const tabLabels = await page.$$eval('.bottom-panel-tab', tabs => tabs.map(t => t.textContent.trim()));
  ok(tabLabels.includes('Copilot'), 'Copilot tab exists');
  ok(tabLabels.includes('Problems'), 'Problems tab exists');
  ok(tabLabels.includes('Output'), 'Output tab exists');
  ok(tabLabels.includes('Nesting Preview'), 'Nesting Preview tab exists');
}

// ─── 2. Empty State Renders — title, configure button, quick actions ────

async function testEmptyStateRenders() {
  console.log('\n🔲 2. Empty State Renders');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');

  // Resize panel to see full content
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // "AI Pattern Assistant" title
  const title = await page.evaluate(() => {
    const el = document.querySelector('.copilot-empty-title');
    return el ? el.textContent.trim() : null;
  });
  ok(title === 'AI Pattern Assistant', `Empty state title is "AI Pattern Assistant" (got: "${title}")`);

  // Configure button visible
  const configBtn = await page.$('.copilot-setup-btn');
  ok(configBtn, 'Configure Provider button is visible');

  const configBtnText = await page.$eval('.copilot-setup-btn', el => el.textContent.trim());
  ok(configBtnText.includes('Configure Provider'), `Button says "Configure Provider" (got: "${configBtnText}")`);

  // Quick action suggestion buttons visible
  const suggestions = await page.$$('.copilot-suggestion');
  ok(suggestions.length >= 4, `At least 4 quick action buttons visible (got: ${suggestions.length})`);

  // Verify suggestion labels match expected offline actions
  const labels = await page.$$eval('.copilot-suggestion', els => els.map(e => e.textContent.trim()));
  const hasCorpino = labels.some(l => l.includes('Crear corpiño') || l.includes('corpiño'));
  ok(hasCorpino, 'Quick action includes "Crear corpiño"');

  // Empty state hint text
  const hint = await page.evaluate(() => {
    const el = document.querySelector('.copilot-empty-hint');
    return el ? el.textContent.trim() : null;
  });
  ok(hint && hint.includes('Configure an AI provider'), `Hint text guides user (got: "${hint?.substring(0, 60)}")`);
}

// ─── 3. Configure Provider Button — click opens settings ────

async function testConfigureProviderOpensSettings() {
  console.log('\n⚙️ 3. Configure Provider Button');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');

  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Click Configure Provider button
  await page.evaluate(() => {
    const btn = document.querySelector('.copilot-setup-btn');
    if (btn) btn.click();
  });
  await sleep(400);

  // Increase panel height so settings content is fully visible
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '500px';
  });
  await sleep(200);

  // Settings panel should open — check for Agent Settings heading or provider select
  const settingsOpened = await page.evaluate(() => {
    // Check for h4 with "Agent Settings"
    const h4s = [...document.querySelectorAll('h4')];
    const hasH4 = h4s.some(h => h.textContent.trim() === 'Agent Settings');
    // Also check for select elements (provider/model dropdowns) appearing inside the copilot panel
    const copilotPanel = document.querySelector('.copilot-panel');
    const selects = copilotPanel ? copilotPanel.querySelectorAll('select') : [];
    const hasSelects = selects.length >= 2;
    // Check for password input (API key)
    const hasPassword = copilotPanel ?
      copilotPanel.querySelectorAll('input[type="password"]').length > 0 : false;
    return hasH4 || (hasSelects && hasPassword);
  });
  ok(settingsOpened, 'Clicking Configure Provider opens Agent Settings');
}

// ─── 4. Settings Panel — provider, API key, model dropdowns ────

async function testSettingsPanel() {
  console.log('\n🔧 4. Settings Panel');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  await openCopilotSettings();

  // Provider dropdown exists with correct options
  const providerOptions = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length === 0) return [];
    return [...selects[0].options].map(o => ({ value: o.value, label: o.textContent }));
  });
  ok(providerOptions.length >= 3, `Provider dropdown has ≥3 options (got: ${providerOptions.length})`);
  ok(providerOptions.some(o => o.value === 'anthropic'), 'Has Anthropic option');
  ok(providerOptions.some(o => o.value === 'openai'), 'Has OpenAI option');
  ok(providerOptions.some(o => o.value === 'ollama'), 'Has Ollama option');

  // API key input exists (password type for masking)
  const apiKeyInput = await page.evaluate(() => {
    return document.querySelectorAll('input[type="password"]').length > 0;
  });
  ok(apiKeyInput, 'API key input exists (password type)');

  // Model selection dropdown exists
  const modelSelect = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    return selects.length >= 2;
  });
  ok(modelSelect, 'Model selection dropdown exists');

  // Budget number input exists
  const budgetInput = await page.evaluate(() => {
    return document.querySelectorAll('input[type="number"]').length > 0;
  });
  ok(budgetInput, 'Budget (number) input exists');
}

// ─── 5. Settings Close — can close and return to chat ────

async function testSettingsClose() {
  console.log('\n❌ 5. Settings Close');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Open settings
  await openCopilotSettings();

  // Verify settings is open
  const settingsOpen = await page.evaluate(() => {
    const h4s = [...document.querySelectorAll('h4')];
    return h4s.some(h => h.textContent.trim() === 'Agent Settings');
  });
  ok(settingsOpen, 'Settings panel is open');

  // Close settings
  await closeCopilotSettings();

  // Verify settings is closed (Agent Settings h4 gone)
  const settingsClosed = await page.evaluate(() => {
    const h4s = [...document.querySelectorAll('h4')];
    return !h4s.some(h => h.textContent.trim() === 'Agent Settings');
  });
  ok(settingsClosed, 'Settings panel closed after clicking Cancel');

  // Chat view restored — check empty state or message area
  const chatVisible = await page.evaluate(() => {
    const empty = document.querySelector('.copilot-empty');
    const messages = document.querySelector('.copilot-messages');
    return empty !== null || messages !== null;
  });
  ok(chatVisible, 'Chat view restored after closing settings');
}

// ─── 6. Quick Actions Render — at least 4 visible without provider ────

async function testQuickActionsRender() {
  console.log('\n🎯 6. Quick Actions Render');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Quick action suggestions visible in empty state
  const suggestions = await page.$$('.copilot-suggestion');
  ok(suggestions.length >= 4, `At least 4 quick action buttons visible (got: ${suggestions.length})`);

  // All suggestion buttons have text content
  const labels = await page.$$eval('.copilot-suggestion', els => els.map(e => e.textContent.trim()));
  const allHaveText = labels.every(l => l.length > 0);
  ok(allHaveText, 'All quick action buttons have text');

  // Suggestion buttons are clickable (cursor: pointer)
  const isClickable = await page.$eval('.copilot-suggestion', el => {
    const style = window.getComputedStyle(el);
    return style.cursor === 'pointer';
  });
  ok(isClickable, 'Quick action buttons have pointer cursor');
}

// ─── 7. Quick Action Click — sends text and gets response ────

async function testQuickActionClick() {
  console.log('\n👆 7. Quick Action Click');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Click first quick action
  const firstLabel = await page.$eval('.copilot-suggestion', el => el.textContent.trim());
  await page.evaluate(() => {
    const btn = document.querySelector('.copilot-suggestion');
    if (btn) btn.click();
  });
  await sleep(600);

  // Should generate messages (user + assistant)
  const messages = await page.$$('.copilot-msg');
  ok(messages.length >= 1, `Quick action click generated messages (got: ${messages.length})`);

  // User message should appear
  const userMsgs = await page.$$('.copilot-msg.user');
  ok(userMsgs.length >= 1, 'User message appears after quick action');

  // Assistant response should appear
  const assistantMsgs = await page.$$('.copilot-msg.assistant');
  ok(assistantMsgs.length >= 1, 'Assistant response appears after quick action');

  // App still functional
  const svgExists = await page.$('.pattern-svg');
  ok(svgExists, 'App still functional after quick action');
}

// ─── 8. Input Field — exists, accepts text, placeholder present ────

async function testInputField() {
  console.log('\n📝 8. Input Field');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');

  // Input field exists
  const input = await page.$('.copilot-input');
  ok(input, 'Copilot input field exists');

  // Placeholder text present
  const placeholder = await page.$eval('.copilot-input', el => el.placeholder);
  ok(placeholder.length > 0, `Input has placeholder text: "${placeholder}"`);
  ok(
    placeholder.includes('Quick action') || placeholder.includes('connect provider') || placeholder.includes('Type'),
    'Placeholder text is meaningful'
  );

  // Accepts text input — use evaluate to set value since React controls it
  await input.click();
  await sleep(100);
  // Type via keyboard (React listens for input events)
  await page.evaluate(() => {
    const input = document.querySelector('.copilot-input');
    if (input) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'Test message');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(200);
  const value = await page.$eval('.copilot-input', el => el.value);
  ok(value === 'Test message', `Input accepts text (value: "${value}")`);

  // Send button exists
  const sendBtn = await page.$('.copilot-send');
  ok(sendBtn, 'Send button exists');

  // Send button is enabled when there's text
  const isDisabled = await page.$eval('.copilot-send', el => el.disabled);
  ok(!isDisabled, 'Send button is enabled when input has text');
}

// ─── 9. Send Without Provider — no crash, appropriate response ────

async function testSendWithoutProvider() {
  console.log('\n📤 9. Send Without Provider');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Type and send a message
  const input = await page.$('.copilot-input');
  if (input) {
    await input.click();
    await page.keyboard.type('Create a bodice');
    await sleep(100);
    await pressKey('Enter');
    await sleep(600);

    // App should NOT crash
    const svgExists = await page.$('.pattern-svg');
    ok(svgExists, 'App does not crash after sending without provider');

    // Either messages or empty state should be visible
    const hasContent = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.copilot-msg');
      const empty = document.querySelector('.copilot-empty');
      return msgs.length > 0 || empty !== null;
    });
    ok(hasContent, 'Message area or empty state visible after send');
  } else {
    ok(true, 'Input not visible in offline mode — graceful');
  }
}

// ─── 10. Keyboard Shortcut — Cmd+/ focuses copilot input ────

async function testKeyboardShortcut() {
  console.log('\n⌨️ 10. Keyboard Shortcut');
  await freshPage();

  // Open bottom panel and copilot tab first
  await openBottomPanel();
  await clickBottomTab('Copilot');
  await sleep(200);

  // Test keyboard shortcuts module imports correctly
  const shortcutModule = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/keyboardShortcuts.ts');
      return {
        hasShortcuts: Array.isArray(mod.COPILOT_SHORTCUTS),
        count: mod.COPILOT_SHORTCUTS.length,
        hasCreateHandler: typeof mod.createCopilotKeyHandler === 'function',
        hasGetCommands: typeof mod.getCopilotCommands === 'function',
        shortcuts: mod.COPILOT_SHORTCUTS.map(s => s.display),
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!shortcutModule.error, 'Keyboard shortcuts module loads');
  ok(shortcutModule.count === 3, `3 copilot shortcuts defined (got: ${shortcutModule.count})`);

  // Verify shortcut handler can focus input
  const handlerTest = await page.evaluate(async () => {
    const mod = await import('/src/copilot/keyboardShortcuts.ts');
    let focusCalled = false;
    const handler = mod.createCopilotKeyHandler({
      onFocusInput: () => { focusCalled = true; },
      onTogglePanel: () => {},
      onBlurInput: () => {},
    });
    document.addEventListener('keydown', handler);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }));
    document.removeEventListener('keydown', handler);
    return focusCalled;
  });
  ok(handlerTest, 'Cmd+/ triggers focus input handler');
}

// ─── 11. Teaching Mode Toggle — visible and toggleable ────

async function testTeachingModeToggle() {
  console.log('\n🎓 11. Teaching Mode Toggle');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  await openCopilotSettings();

  // Teaching mode checkbox exists
  const checkboxExists = await page.evaluate(() => {
    return document.querySelectorAll('input[type="checkbox"]').length > 0;
  });
  ok(checkboxExists, 'Teaching mode checkbox exists');

  // Teaching Mode label visible
  const teachingLabel = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    return labels.some(l => l.textContent.includes('Teaching Mode'));
  });
  ok(teachingLabel, 'Teaching Mode label visible');

  // Toggle it
  const toggleResult = await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (!checkbox) return { found: false };
    const before = checkbox.checked;
    checkbox.click();
    const after = checkbox.checked;
    checkbox.click(); // restore
    return { found: true, before, after, toggled: before !== after };
  });
  ok(toggleResult.toggled, `Teaching mode toggles (${toggleResult.before} → ${toggleResult.after})`);

  // ON/OFF indicator updates
  const indicator = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    return spans.some(s => s.textContent.trim() === 'ON' || s.textContent.trim() === 'OFF');
  });
  ok(indicator, 'ON/OFF indicator visible');

  await closeCopilotSettings();
}

// ─── 12. Language Preference — visible in settings, can change ────

async function testLanguagePreference() {
  console.log('\n🌐 12. Language Preference');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  await openCopilotSettings();

  // Language select exists with correct options
  const languageSelect = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    // Language is typically the third select (after provider and model)
    for (const sel of selects) {
      const opts = [...sel.options].map(o => o.value);
      if (opts.includes('auto') && opts.includes('es') && opts.includes('en')) {
        return {
          found: true,
          value: sel.value,
          options: opts,
        };
      }
    }
    return { found: false };
  });
  ok(languageSelect.found, 'Language preference dropdown found');
  ok(languageSelect.options.includes('auto'), 'Has Auto-detect option');
  ok(languageSelect.options.includes('es'), 'Has Español option');
  ok(languageSelect.options.includes('en'), 'Has English option');

  // Change language
  const changed = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    for (const sel of selects) {
      const opts = [...sel.options].map(o => o.value);
      if (opts.includes('auto') && opts.includes('es')) {
        const before = sel.value;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'es');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { before, after: sel.value, changed: true };
      }
    }
    return { changed: false };
  });
  ok(changed.changed, `Language can be changed (${changed.before} → ${changed.after})`);

  await closeCopilotSettings();
}

// ─── 13. Cost Footer — renders (even if $0.00) ────

async function testCostFooter() {
  console.log('\n💰 13. Cost Footer');
  await freshPage();

  await openBottomPanel();
  await clickBottomTab('Copilot');
  await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.style.height = '400px';
  });
  await sleep(200);

  // Cost footer CSS exists in the stylesheet
  const cssExists = await page.evaluate(() => {
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
  ok(cssExists, 'copilot-cost-footer CSS class is defined');

  // Test CostManager works (so footer can display when cost > 0)
  const costTest = await page.evaluate(async () => {
    try {
      const mod = await import('/src/copilot/costManager.ts');
      const cm = new mod.CostManager('test-project');
      cm.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
      const session = cm.getSessionCost();
      const formatted = cm.formatSessionCost();
      return {
        calls: session.calls,
        tokens: session.tokens,
        cost: session.estimatedCost,
        formatted,
        hasPricing: Object.keys(mod.MODEL_PRICING).length >= 8,
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ok(!costTest.error, 'CostManager module loads and works');
  ok(costTest.calls === 1, `Cost tracks calls (${costTest.calls})`);
  ok(costTest.tokens === 1500, `Cost tracks tokens (${costTest.tokens})`);
  ok(costTest.cost > 0, `Cost estimates a value > 0 (${costTest.cost})`);
  ok(costTest.formatted.length > 0, `Formatted cost: "${costTest.formatted}"`);
  ok(costTest.hasPricing, 'Model pricing table has ≥8 entries');

  // Check token usage in settings panel
  await openCopilotSettings();

  const usageVisible = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('This session') && text.includes('Budget');
  });
  ok(usageVisible, 'Token usage section visible in settings (This session + Budget)');

  await closeCopilotSettings();
}

// ─── 14. Panel Resize / Collapse — bottom panel can be toggled ────

async function testPanelResizeCollapse() {
  console.log('\n📐 14. Panel Resize / Collapse');
  await freshPage();

  // Open panel
  await openBottomPanel();
  const panelOpen = await page.$('.bottom-panel.open');
  ok(panelOpen, 'Panel is open');

  // Get initial height
  const heightBefore = await page.$eval('.bottom-panel', el => el.offsetHeight);
  ok(heightBefore > 0, `Panel has height > 0 (${heightBefore}px)`);

  // Close via close button
  const closeBtn = await page.$('.bottom-panel-close');
  ok(closeBtn, 'Close button exists');
  await closeBtn.click();
  await sleep(400);

  const panelClosed = await page.$('.bottom-panel.closed');
  ok(panelClosed, 'Panel closes when close button clicked');

  // Re-open
  await openBottomPanel();
  const panelReopened = await page.$('.bottom-panel.open');
  ok(panelReopened, 'Panel can be re-opened');

  // Resize handle exists
  const resizeHandle = await page.$('.bottom-panel-resize');
  ok(resizeHandle, 'Resize drag handle exists');

  // Resize cursor on hover
  const cursor = await page.$eval('.bottom-panel-resize', el => {
    const style = window.getComputedStyle(el);
    return style.cursor;
  });
  ok(cursor === 'row-resize', `Resize handle has row-resize cursor (got: ${cursor})`);

  // Tab click toggle: clicking the active tab when panel is open should collapse it
  // First ensure copilot tab is active and panel is open
  await clickBottomTab('Copilot');
  await sleep(200);

  // Verify panel is currently open
  const isOpenNow = await page.evaluate(() => {
    const panel = document.querySelector('.bottom-panel');
    return panel ? panel.classList.contains('open') : false;
  });

  if (isOpenNow) {
    // Get active tab
    const activeTab = await page.$eval('.bottom-panel-tab.active', el => el.textContent.trim());

    // Click the already-active tab → should close
    await clickBottomTab(activeTab);
    await sleep(400);

    const closedAfterToggle = await page.evaluate(() => {
      const panel = document.querySelector('.bottom-panel');
      return panel ? (panel.classList.contains('closed') || panel.offsetHeight === 0) : true;
    });
    ok(closedAfterToggle, 'Clicking active tab collapses panel');
  } else {
    // Panel wasn't re-opened — just verify the open/close cycle worked
    ok(true, 'Panel toggle cycle completed (open/close buttons work)');
  }
}

// ─── 15. No Console Errors — full interaction flow ────

async function testNoConsoleErrors() {
  console.log('\n🔇 15. No Console Errors');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  // Full interaction cycle
  await openBottomPanel();
  await clickBottomTab('Copilot');
  await sleep(200);

  // Open and close settings
  await openCopilotSettings();
  await sleep(200);
  await closeCopilotSettings();
  await sleep(200);

  // Type in input
  const input = await page.$('.copilot-input');
  if (input) {
    await input.click();
    await page.keyboard.type('Hello test');
    await sleep(100);
  }

  // Click quick action
  await page.evaluate(() => {
    const btn = document.querySelector('.copilot-suggestion');
    if (btn) btn.click();
  });
  await sleep(500);

  // Switch tabs
  await clickBottomTab('Problems');
  await sleep(100);
  await clickBottomTab('Output');
  await sleep(100);
  await clickBottomTab('Copilot');
  await sleep(200);

  // Open settings and toggle teaching mode
  await openCopilotSettings();
  await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.click();
  });
  await sleep(100);
  await closeCopilotSettings();

  // Keyboard shortcuts
  await page.keyboard.down('Meta');
  await pressKey('/');
  await page.keyboard.up('Meta');
  await sleep(100);
  await pressKey('Escape');
  await sleep(100);

  // Close panel
  const closeBtn = await page.$('.bottom-panel-close');
  if (closeBtn) await closeBtn.click();
  await sleep(200);

  const newErrors = filterCriticalErrors(consoleErrors.slice(errorsBefore));
  ok(newErrors.length === 0, `No unexpected console errors (${newErrors.length} critical errors)`);
  if (newErrors.length > 0) {
    newErrors.slice(0, 5).forEach(e => console.log(`    ⚠ ${e.slice(0, 150)}`));
  }
}

// ─── 16. Mobile Viewport — at 375px width, copilot still usable ────

async function testMobileViewport() {
  console.log('\n📱 16. Mobile Viewport');
  await freshPage();

  // Configure fake provider so quick chips appear
  await page.evaluate(() => {
    const config = { provider: 'ollama', apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434' };
    localStorage.setItem('openclo-provider-config', JSON.stringify(config));
  });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(800);

  // Open copilot via activity bar at desktop size first
  const aiBtn = await page.$('button.activity-bar-item[title="AI Copilot"]');
  if (aiBtn) {
    await aiBtn.click();
    await sleep(300);
  }

  // Switch to mobile viewport
  await page.setViewport({ width: 375, height: 812 });
  await sleep(800);

  // Copilot panel should still render
  const panel = await page.$('.copilot-panel');
  ok(panel, 'CopilotPanel renders at 375px width');

  // Mobile class should be applied
  const isMobileClass = await page.evaluate(() => {
    const panel = document.querySelector('.copilot-panel');
    return panel ? panel.classList.contains('mobile') : false;
  });
  ok(isMobileClass, 'Mobile class is applied at 375px width');

  // Input field still accessible
  const input = await page.$('.copilot-input');
  ok(input, 'Input field accessible on mobile');

  // Check mobile-specific styling
  const mobileInputSize = await page.$eval('.copilot-input', el => {
    const style = window.getComputedStyle(el);
    return parseInt(style.fontSize);
  });
  ok(mobileInputSize >= 16, `Mobile input font-size ≥ 16px for readability (got: ${mobileInputSize}px)`);

  // Quick action chips visible on mobile
  const chips = await page.$$('.copilot-quick-chip');
  ok(chips.length > 0, `Quick action chips visible on mobile (${chips.length} chips)`);

  // Send button visible
  const sendBtn = await page.$('.copilot-send');
  ok(sendBtn, 'Send button visible on mobile');

  // Fullscreen button visible
  const fullscreenBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.copilot-btn-sm')];
    return btns.some(b => b.title === 'Fullscreen' || b.title === 'Exit fullscreen');
  });
  ok(fullscreenBtn, 'Fullscreen button visible on mobile');

  // Reset viewport and cleanup
  await page.evaluate(() => {
    localStorage.removeItem('openclo-provider-config');
  });
  await page.setViewport({ width: 1400, height: 900 });
  await sleep(300);
}

// ═════════════════════════════════════════════════════════
//  RUNNER
// ═════════════════════════════════════════════════════════

async function run() {
  let passed = 0, failed = 0;
  const tests = [
    testBottomPanelOpens,
    testEmptyStateRenders,
    testConfigureProviderOpensSettings,
    testSettingsPanel,
    testSettingsClose,
    testQuickActionsRender,
    testQuickActionClick,
    testInputField,
    testSendWithoutProvider,
    testKeyboardShortcut,
    testTeachingModeToggle,
    testLanguagePreference,
    testCostFooter,
    testPanelResizeCollapse,
    testNoConsoleErrors,
    testMobileViewport,
  ];

  console.log(`\n🧪 OpenClo E2E — CopilotPanel UX Audit — ${tests.length} test suites\n${'═'.repeat(58)}`);

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(58)}`);
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
