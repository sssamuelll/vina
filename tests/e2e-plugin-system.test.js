/**
 * E2E Test Suite — Phase 5: Plugin System & Community Skills
 *
 * Tests the plugin architecture, community skill format, marketplace,
 * language packs, PluginManager UI, Redux plugin state, formula plugins,
 * permissions, and plugin lifecycle operations.
 *
 * Standalone Puppeteer runner, spawns its own Vite dev server on port 5198.
 * Run: node tests/e2e-plugin-system.test.js
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

async function getSidebarTitle() {
  const el = await page.$('.sidebar-title');
  return el ? await el.evaluate(n => n.textContent.trim()) : null;
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
  // Clean up plugin state in localStorage for isolated tests
  await page.evaluate(() => {
    localStorage.removeItem('openclo_installed_plugins');
  });
}

// ═════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════

// ─── 1. ActivityBar Plugin Icon ─────────────────────────

async function testActivityBarPluginIcon() {
  console.log('\n🧩 1. ActivityBar Plugin Icon');
  await freshPage();

  // Plugin button exists with title "Plugins"
  const pluginBtn = await page.$('button.activity-bar-item[title="Plugins"]');
  ok(pluginBtn, 'Plugins button exists in ActivityBar');

  // It contains an SVG icon (puzzle-piece style)
  const hasSvg = await pluginBtn.evaluate(el => !!el.querySelector('svg'));
  ok(hasSvg, 'Plugins button has an SVG icon');

  // Clicking it opens the sidebar with "Plugins" title
  await ensureSidebarClosed();
  await sleep(200);
  await openActivityView('Plugins');
  const sidebarOpen = await page.$('.sidebar.open');
  ok(sidebarOpen, 'Clicking Plugins icon opens sidebar');

  const title = await getSidebarTitle();
  ok(title === 'Plugins', `Sidebar title is "Plugins" (got: "${title}")`);
}

// ─── 2. PluginManager UI ────────────────────────────────

async function testPluginManagerUI() {
  console.log('\n📦 2. PluginManager UI');
  await freshPage();

  await openActivityView('Plugins');
  await sleep(200);

  // PluginManager renders
  const manager = await page.$('.plugin-manager');
  ok(manager, 'PluginManager component renders');

  // Header with "Plugins" text
  const headerText = await page.evaluate(() => {
    const h2 = document.querySelector('.plugin-manager__header h2');
    return h2 ? h2.textContent.trim() : null;
  });
  ok(headerText === 'Plugins', `Header says "Plugins" (got: "${headerText}")`);

  // Install input exists
  const installInput = await page.$('.plugin-manager__install-input');
  ok(installInput, 'Install URL input exists');
  const placeholder = await installInput.evaluate(el => el.placeholder);
  ok(placeholder.includes('URL'), `Input placeholder mentions URL (got: "${placeholder}")`);

  // Install button exists
  const installBtn = await page.$('.plugin-manager__install-btn');
  ok(installBtn, 'Install button exists');

  // Count badge shows "0 installed"
  const countText = await page.evaluate(() => {
    const span = document.querySelector('.plugin-manager__count');
    return span ? span.textContent.trim() : null;
  });
  ok(countText === '0 installed', `Count shows "0 installed" (got: "${countText}")`);

  // Empty state message
  const emptyMsg = await page.evaluate(() => {
    const empty = document.querySelector('.plugin-manager__empty');
    return empty ? empty.textContent : null;
  });
  ok(emptyMsg && emptyMsg.includes('No plugins installed'), 'Empty state message shows');
  ok(emptyMsg && emptyMsg.includes('manifest URL'), 'Empty state hints about manifest URL');
}

// ─── 3. Plugin Redux State ──────────────────────────────

async function testPluginReduxState() {
  console.log('\n🔧 3. Plugin Redux State');
  await freshPage();

  // Initial state is correct
  const state = await page.evaluate(() => window.__store__.getState());
  ok(state.plugins !== undefined, 'Plugins slice exists in Redux store');
  ok(Array.isArray(state.plugins.installedPlugins), 'installedPlugins is an array');
  ok(state.plugins.installedPlugins.length === 0, 'installedPlugins starts empty');
  ok(Array.isArray(state.plugins.enabledPlugins), 'enabledPlugins is an array');
  ok(state.plugins.enabledPlugins.length === 0, 'enabledPlugins starts empty');
  ok(typeof state.plugins.pluginErrors === 'object', 'pluginErrors is an object');

  // Dispatch installPlugin
  const installResult = await page.evaluate(async () => {
    const mod = await import('/src/store/pluginSlice.ts');
    window.__store__.dispatch(mod.installPlugin({
      id: 'test.plugin-a',
      name: 'Test Plugin A',
      version: '1.0.0',
      author: 'Test Author',
      description: 'A test plugin',
      enabled: false,
      permissions: ['read-pieces'],
    }));
    return window.__store__.getState().plugins;
  });
  ok(installResult.installedPlugins.length === 1, 'installPlugin adds to installedPlugins');
  ok(installResult.installedPlugins[0].id === 'test.plugin-a', 'Installed plugin has correct id');

  // Dispatch enablePlugin
  const enableResult = await page.evaluate(async () => {
    const mod = await import('/src/store/pluginSlice.ts');
    window.__store__.dispatch(mod.enablePlugin('test.plugin-a'));
    return window.__store__.getState().plugins;
  });
  ok(enableResult.enabledPlugins.includes('test.plugin-a'), 'enablePlugin adds to enabledPlugins');
  ok(enableResult.installedPlugins[0].enabled === true, 'enablePlugin sets enabled=true on info');

  // Dispatch disablePlugin
  const disableResult = await page.evaluate(async () => {
    const mod = await import('/src/store/pluginSlice.ts');
    window.__store__.dispatch(mod.disablePlugin('test.plugin-a'));
    return window.__store__.getState().plugins;
  });
  ok(!disableResult.enabledPlugins.includes('test.plugin-a'), 'disablePlugin removes from enabledPlugins');
  ok(disableResult.installedPlugins[0].enabled === false, 'disablePlugin sets enabled=false');

  // Dispatch removePlugin
  const removeResult = await page.evaluate(async () => {
    const mod = await import('/src/store/pluginSlice.ts');
    window.__store__.dispatch(mod.removePlugin('test.plugin-a'));
    return window.__store__.getState().plugins;
  });
  ok(removeResult.installedPlugins.length === 0, 'removePlugin clears installedPlugins');
  ok(removeResult.enabledPlugins.length === 0, 'removePlugin clears enabledPlugins');
}

// ─── 4. Plugin Registry + Core Tools ────────────────────

async function testPluginRegistryWithCoreTools() {
  console.log('\n🔌 4. Plugin Registry + Core Tools');
  await freshPage();

  const registryResult = await page.evaluate(async () => {
    try {
      const registryMod = await import('/src/copilot/plugins/pluginRegistry.ts');
      const coreRegistryMod = await import('/src/copilot/tools/registry.ts');

      const pluginRegistry = registryMod.getDefaultPluginRegistry();
      pluginRegistry.reset();

      const coreRegistry = coreRegistryMod.getDefaultRegistry();
      const coreToolCount = coreRegistry.size;
      const coreToolNames = coreRegistry.listNames();

      // Register a test plugin with a tool
      pluginRegistry.registerPlugin({
        id: 'test.registry-check',
        name: 'Registry Check Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Test plugin for registry',
        license: 'MIT',
        compatibleWith: '>=0.1.0',
        tools: [{
          name: 'myCustomTool',
          description: 'A custom tool',
          parameters: { type: 'object', properties: {}, required: [] },
          requiredPermissions: ['read-pieces'],
          handler: async () => ({ success: true, result: 'done' }),
        }],
      }, ['read-pieces']);

      const pluginToolDefs = pluginRegistry.getToolDefinitions();
      const pluginToolCount = pluginRegistry.toolCount;
      const hasNamespaced = pluginRegistry.hasTool('test.registry-check.myCustomTool');

      // Clean up
      pluginRegistry.reset();

      return {
        coreToolCount,
        coreToolNames,
        pluginToolCount,
        pluginToolDefsLength: pluginToolDefs.length,
        hasNamespaced,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!registryResult.error, `Plugin registry loads${registryResult.error ? ': ' + registryResult.error : ''}`);
  ok(registryResult.coreToolCount === 42, `Core registry has 42 tools (got: ${registryResult.coreToolCount})`);
  ok(registryResult.pluginToolCount === 1, `Plugin registry has 1 tool after registration (got: ${registryResult.pluginToolCount})`);
  ok(registryResult.pluginToolDefsLength === 1, 'getToolDefinitions returns plugin tool');
  ok(registryResult.hasNamespaced, 'Namespaced tool "test.registry-check.myCustomTool" found');

  // Plugin tools are separate from core, but both accessible
  ok(registryResult.coreToolNames.includes('createPiece'), 'Core tool "createPiece" still accessible');
}

// ─── 5. Community Skill Import/Export ───────────────────

async function testCommunitySkillRoundTrip() {
  console.log('\n🌍 5. Community Skill Import/Export');
  await freshPage();

  const roundTrip = await page.evaluate(async () => {
    try {
      const communityMod = await import('/src/copilot/skills/communityFormat.ts');
      const registryMod = await import('/src/copilot/skills/skillRegistry.ts');

      const registry = registryMod.getDefaultSkillRegistry();
      const bodiceSkill = registry.get('bodice');
      if (!bodiceSkill) return { error: 'Bodice skill not found in registry' };

      // Export a core skill to community format
      const metadata = {
        id: 'community.bodice-test',
        name: 'Test Bodice Skill',
        version: '1.0.0',
        author: 'E2E Test',
        description: 'A test export of bodice skill',
        tags: ['bodice', 'test'],
        license: 'MIT',
      };

      const exported = communityMod.exportSkill(bodiceSkill, metadata);
      const exportedObj = JSON.parse(exported);

      // Validate exported JSON structure
      const hasSchemaVersion = exportedObj.schemaVersion === '1.0.0';
      const hasMetadata = exportedObj.metadata.id === 'community.bodice-test';
      const hasSkill = exportedObj.skill.name === 'bodice';

      // Import it back
      const imported = communityMod.importSkill(exported);

      // Validate round-trip
      const skillNameMatch = imported.skill.name === bodiceSkill.name;
      const triggersMatch = imported.skill.triggers.length === bodiceSkill.triggers.length;
      const methodsMatch = imported.skill.methods.length === bodiceSkill.methods.length;
      const stepsMatch = imported.skill.constructionSteps.length === bodiceSkill.constructionSteps.length;
      const metadataMatch = imported.metadata.id === 'community.bodice-test';

      // Validate the imported skill
      const validation = communityMod.validateCommunitySkill(imported);

      return {
        hasSchemaVersion,
        hasMetadata,
        hasSkill,
        skillNameMatch,
        triggersMatch,
        methodsMatch,
        stepsMatch,
        metadataMatch,
        validationValid: validation.valid,
        validationErrors: validation.errors,
        exportLength: exported.length,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!roundTrip.error, `Round-trip completes${roundTrip.error ? ': ' + roundTrip.error : ''}`);
  ok(roundTrip.hasSchemaVersion, 'Exported has schema version 1.0.0');
  ok(roundTrip.hasMetadata, 'Exported has correct metadata id');
  ok(roundTrip.hasSkill, 'Exported has bodice skill');
  ok(roundTrip.skillNameMatch, 'Imported skill name matches original');
  ok(roundTrip.triggersMatch, 'Imported skill triggers count matches');
  ok(roundTrip.methodsMatch, 'Imported skill methods count matches');
  ok(roundTrip.stepsMatch, 'Imported skill construction steps count matches');
  ok(roundTrip.metadataMatch, 'Imported metadata id matches');
  ok(roundTrip.validationValid, `Re-imported skill passes validation (errors: ${roundTrip.validationErrors?.join('; ') || 'none'})`);
  ok(roundTrip.exportLength > 100, `Exported JSON is non-trivial (${roundTrip.exportLength} chars)`);
}

// ─── 6. Language Packs ──────────────────────────────────

async function testLanguagePacks() {
  console.log('\n🌐 6. Language Packs');
  await freshPage();

  const langResult = await page.evaluate(async () => {
    try {
      const langMod = await import('/src/copilot/skills/languagePacks.ts');
      const registryMod = await import('/src/copilot/skills/skillRegistry.ts');

      // Available languages
      const languages = langMod.listAvailableLanguages();

      // Get bodice skill in English
      const registry = registryMod.getDefaultSkillRegistry();
      const bodiceSkill = registry.get('bodice');
      if (!bodiceSkill) return { error: 'Bodice skill not found' };

      const enSkill = langMod.getLocalizedSkill(bodiceSkill, 'en');
      const esSkill = langMod.getLocalizedSkill(bodiceSkill, 'es');

      // Check descriptions differ
      const enDesc = enSkill.description;
      const esDesc = esSkill.description;
      const descriptionsAreDifferent = enDesc !== esDesc;

      // Check construction step localization
      const enStep1 = enSkill.constructionSteps[0]?.instruction;
      const esStep1 = esSkill.constructionSteps[0]?.instruction;
      const stepsAreDifferent = enStep1 !== esStep1;

      // Check translation function directly
      const enTranslation = langMod.getTranslation('bodice', 'description', 'en');
      const esTranslation = langMod.getTranslation('bodice', 'description', 'es');

      // hasTranslations check
      const hasEnBodice = langMod.hasTranslations('bodice', 'en');
      const hasEsBodice = langMod.hasTranslations('bodice', 'es');
      const hasFrBodice = langMod.hasTranslations('bodice', 'fr');

      // Missing translations for unsupported language
      const missingFr = langMod.getMissingTranslations('bodice', 'fr');

      return {
        languages,
        descriptionsAreDifferent,
        stepsAreDifferent,
        enDesc: enDesc.substring(0, 50),
        esDesc: esDesc.substring(0, 50),
        enStep1: enStep1?.substring(0, 50),
        esStep1: esStep1?.substring(0, 50),
        enTranslation: enTranslation.substring(0, 30),
        esTranslation: esTranslation.substring(0, 30),
        hasEnBodice,
        hasEsBodice,
        hasFrBodice,
        missingFrCount: missingFr.length,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!langResult.error, `Language packs load${langResult.error ? ': ' + langResult.error : ''}`);
  ok(langResult.languages.includes('en'), 'English language available');
  ok(langResult.languages.includes('es'), 'Spanish language available');
  ok(langResult.descriptionsAreDifferent, `EN/ES descriptions differ (EN: "${langResult.enDesc}…", ES: "${langResult.esDesc}…")`);
  ok(langResult.stepsAreDifferent, `EN/ES step 1 differs (EN: "${langResult.enStep1}…", ES: "${langResult.esStep1}…")`);
  ok(langResult.hasEnBodice, 'English translations exist for bodice');
  ok(langResult.hasEsBodice, 'Spanish translations exist for bodice');
  ok(!langResult.hasFrBodice, 'French translations do NOT exist for bodice (expected)');
  ok(langResult.missingFrCount > 0, `French missing ${langResult.missingFrCount} translation keys`);
}

// ─── 7. Marketplace Graceful Empty State ────────────────

async function testMarketplaceEmptyState() {
  console.log('\n🏪 7. Marketplace Empty State');
  await freshPage();

  const marketResult = await page.evaluate(async () => {
    try {
      const marketMod = await import('/src/copilot/skills/marketplace.ts');

      // Reset marketplace state
      marketMod.resetMarketplace();

      // No registry URL configured
      const registryUrl = marketMod.getSkillRegistryUrl();
      const noUrl = registryUrl === '';

      // Fetching without URL should throw
      let fetchError = null;
      try {
        await marketMod.fetchAvailableSkills();
      } catch (e) {
        fetchError = e.message;
      }

      // Installed skills should be empty
      const installed = marketMod.loadInstalledCommunitySkills();
      const installedEmpty = installed.length === 0;

      // isSkillInstalled should return false
      const notInstalled = !marketMod.isSkillInstalled('nonexistent-skill');

      // getInstalledSkillsAsPatternSkills should return empty array
      const patternSkills = marketMod.getInstalledSkillsAsPatternSkills();
      const noPatternSkills = patternSkills.length === 0;

      // Setting and getting registry URL
      marketMod.setSkillRegistryUrl('https://example.com/skills.json');
      const newUrl = marketMod.getSkillRegistryUrl();

      // Clean up
      marketMod.resetMarketplace();

      return {
        noUrl,
        fetchError,
        installedEmpty,
        notInstalled,
        noPatternSkills,
        newUrl,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!marketResult.error, `Marketplace module loads${marketResult.error ? ': ' + marketResult.error : ''}`);
  ok(marketResult.noUrl, 'No registry URL configured by default');
  ok(marketResult.fetchError && marketResult.fetchError.includes('not configured'),
    `Fetch without URL throws: "${marketResult.fetchError}"`);
  ok(marketResult.installedEmpty, 'Installed community skills starts empty');
  ok(marketResult.notInstalled, 'isSkillInstalled returns false for unknown skill');
  ok(marketResult.noPatternSkills, 'No pattern skills from community when empty');
  ok(marketResult.newUrl === 'https://example.com/skills.json', 'setSkillRegistryUrl persists URL');
}

// ─── 8. Formula Plugin ──────────────────────────────────

async function testFormulaPlugin() {
  console.log('\n📐 8. Formula Plugin');
  await freshPage();

  const formulaResult = await page.evaluate(async () => {
    try {
      const formulaMod = await import('/src/copilot/plugins/formulaPlugin.ts');

      // Reset
      formulaMod.resetCustomFormulas();

      // Validate a valid formula
      const validation = formulaMod.validateCustomFormula(
        'bustDart',
        'bust / 4 + ease',
        ['bust', 'ease'],
      );

      // Register a formula
      const regResult = formulaMod.registerFormula(
        'test-plugin',
        'bustDart',
        'bust / 4 + ease',
        ['bust', 'ease'],
        'Bust dart calculation',
      );

      // Get it back
      const formula = formulaMod.getCustomFormula('test-plugin.bustDart');
      const formulaExists = formula !== undefined;
      const formulaName = formula?.name;
      const formulaPluginId = formula?.pluginId;

      // Evaluate it
      const evalResult = formulaMod.evaluateCustomFormula('test-plugin.bustDart', {
        bust: 88,
        ease: 2,
      });

      // List all
      const allFormulas = formulaMod.listCustomFormulas();
      const pluginFormulas = formulaMod.listPluginFormulas('test-plugin');

      // Register a second formula from same plugin
      formulaMod.registerFormula(
        'test-plugin',
        'waistDart',
        'waist / 4',
        ['waist'],
        'Waist dart',
      );
      const afterSecond = formulaMod.listPluginFormulas('test-plugin');

      // Unregister all from plugin
      const removedCount = formulaMod.unregisterPluginFormulas('test-plugin');
      const afterUnregister = formulaMod.listCustomFormulas();

      // Evaluate unknown formula
      const unknownEval = formulaMod.evaluateCustomFormula('nonexistent.formula', {});

      // Validate invalid formula
      const invalidValidation = formulaMod.validateCustomFormula('', '', []);

      // Clean up
      formulaMod.resetCustomFormulas();

      return {
        validationValid: validation.valid,
        validationTestResult: validation.testResult,
        regResultValid: regResult.valid,
        formulaExists,
        formulaName,
        formulaPluginId,
        evalValue: evalResult.value,
        evalError: evalResult.error,
        allFormulasCount: allFormulas.length,
        pluginFormulasCount: pluginFormulas.length,
        afterSecondCount: afterSecond.length,
        removedCount,
        afterUnregisterCount: afterUnregister.length,
        unknownEvalError: unknownEval.error,
        invalidValidationValid: invalidValidation.valid,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!formulaResult.error, `Formula plugin loads${formulaResult.error ? ': ' + formulaResult.error : ''}`);
  ok(formulaResult.validationValid, 'Valid formula passes validation');
  ok(formulaResult.validationTestResult === 62.5, `Test result with mocks = 62.5 (50/4 + 50) — got: ${formulaResult.validationTestResult}`);
  ok(formulaResult.regResultValid, 'Formula registers successfully');
  ok(formulaResult.formulaExists, 'Registered formula retrievable by namespaced name');
  ok(formulaResult.formulaName === 'test-plugin.bustDart', `Formula name is namespaced (got: "${formulaResult.formulaName}")`);
  ok(formulaResult.formulaPluginId === 'test-plugin', 'Formula knows its plugin id');
  ok(formulaResult.evalValue === 24, `Evaluates bust/4 + ease = 88/4 + 2 = 24 (got: ${formulaResult.evalValue})`);
  ok(!formulaResult.evalError, 'No eval error');
  ok(formulaResult.allFormulasCount === 1, 'listCustomFormulas returns 1 after first registration');
  ok(formulaResult.pluginFormulasCount === 1, 'listPluginFormulas returns 1');
  ok(formulaResult.afterSecondCount === 2, 'After second registration: 2 formulas from plugin');
  ok(formulaResult.removedCount === 2, 'unregisterPluginFormulas removes 2');
  ok(formulaResult.afterUnregisterCount === 0, 'After unregister: 0 formulas');
  ok(formulaResult.unknownEvalError && formulaResult.unknownEvalError.includes('Unknown formula'), 'Unknown formula eval returns error');
  ok(!formulaResult.invalidValidationValid, 'Invalid formula fails validation');
}

// ─── 9. Plugin Permissions ──────────────────────────────

async function testPluginPermissions() {
  console.log('\n🔒 9. Plugin Permissions');
  await freshPage();

  const permResult = await page.evaluate(async () => {
    try {
      const pluginMod = await import('/src/copilot/plugins/index.ts');
      const registryMod = await import('/src/copilot/plugins/pluginRegistry.ts');

      const registry = registryMod.getDefaultPluginRegistry();
      registry.reset();

      // Create a plugin with a tool that requires 'write-pieces' + 'simulation'
      const restrictedPlugin = {
        id: 'test.restricted',
        name: 'Restricted Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'Plugin with restricted tool',
        license: 'MIT',
        compatibleWith: '>=0.1.0',
        tools: [{
          name: 'modifyAndSimulate',
          description: 'Needs write-pieces and simulation',
          parameters: { type: 'object', properties: {}, required: [] },
          requiredPermissions: ['write-pieces', 'simulation'],
          handler: async () => ({ success: true, result: 'executed' }),
        }],
      };

      // Register with LIMITED permissions (only read-pieces)
      registry.registerPlugin(restrictedPlugin, ['read-pieces']);

      // Try executing the tool — should be denied
      const toolDefs = registry.getToolDefinitions();
      const restrictedTool = toolDefs.find(t => t.name === 'test.restricted.modifyAndSimulate');

      let execResult = null;
      if (restrictedTool) {
        execResult = await restrictedTool.execute({});
      }

      // Check permission functions
      const permCheck = pluginMod.checkPermissions(
        ['read-pieces'],
        ['write-pieces', 'simulation'],
      );

      const fullPermCheck = pluginMod.checkPermissions(
        ['read-pieces', 'write-pieces', 'simulation'],
        ['write-pieces', 'simulation'],
      );

      const descriptions = pluginMod.getPermissionDescriptions(['read-pieces', 'network']);

      // Clean up
      registry.reset();

      return {
        toolRegistered: !!restrictedTool,
        execDenied: execResult && !execResult.success,
        execError: execResult?.error,
        permCheckAllowed: permCheck.allowed,
        permCheckMissing: permCheck.missing,
        fullPermCheckAllowed: fullPermCheck.allowed,
        descriptionsCount: descriptions.length,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!permResult.error, `Permissions system works${permResult.error ? ': ' + permResult.error : ''}`);
  ok(permResult.toolRegistered, 'Restricted tool is registered in the registry');
  ok(permResult.execDenied, 'Tool execution denied when permissions insufficient');
  ok(permResult.execError && permResult.execError.includes('Permission denied'),
    `Denial error mentions permissions: "${permResult.execError}"`);
  ok(!permResult.permCheckAllowed, 'checkPermissions reports not allowed for insufficient perms');
  ok(permResult.permCheckMissing.includes('write-pieces'), 'Missing write-pieces reported');
  ok(permResult.permCheckMissing.includes('simulation'), 'Missing simulation reported');
  ok(permResult.fullPermCheckAllowed, 'checkPermissions allows when all perms granted');
  ok(permResult.descriptionsCount === 2, 'Permission descriptions returned for 2 permissions');
}

// ─── 10. Plugin Enable/Disable ──────────────────────────

async function testPluginEnableDisable() {
  console.log('\n🔀 10. Plugin Enable/Disable');
  await freshPage();

  const toggleResult = await page.evaluate(async () => {
    try {
      const pluginManagerMod = await import('/src/copilot/plugins/pluginManager.ts');
      const registryMod = await import('/src/copilot/plugins/pluginRegistry.ts');
      const loaderMod = await import('/src/copilot/plugins/pluginLoader.ts');

      // Reset everything
      pluginManagerMod.resetPluginManager();
      registryMod.resetDefaultPluginRegistry();
      loaderMod.resetLoadedPlugins();

      const registry = registryMod.getDefaultPluginRegistry();

      // Create a test plugin object
      const testPlugin = {
        id: 'test.toggle-plugin',
        name: 'Toggle Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'A plugin for testing enable/disable',
        license: 'MIT',
        compatibleWith: '>=0.1.0',
        tools: [{
          name: 'toggleTool',
          description: 'A togglable tool',
          parameters: { type: 'object', properties: {}, required: [] },
          requiredPermissions: [],
          handler: async () => ({ success: true, result: 'ok' }),
        }],
      };

      // Install from manifest
      const manifest = {
        id: 'test.toggle-plugin',
        name: 'Toggle Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'A plugin for testing enable/disable',
        license: 'MIT',
        compatibleWith: '>=0.1.0',
        entryPoint: '/src/copilot/plugins/index.ts', // won't actually load
        permissions: ['read-pieces'],
      };
      pluginManagerMod.installPluginFromManifest(manifest);

      // Enable it
      pluginManagerMod.enablePlugin('test.toggle-plugin');
      const afterEnable = pluginManagerMod.getInstalledPlugin('test.toggle-plugin');
      const enabledIds = pluginManagerMod.listEnabledPluginIds();

      // Manually register tool to simulate full load
      pluginManagerMod.loadAndRegisterPlugin(testPlugin, ['read-pieces']);
      const toolsAfterEnable = registry.getToolDefinitions();
      const hasTool = registry.hasTool('test.toggle-plugin.toggleTool');

      // Disable it
      pluginManagerMod.disablePlugin('test.toggle-plugin');
      const afterDisable = pluginManagerMod.getInstalledPlugin('test.toggle-plugin');
      const enabledIdsAfter = pluginManagerMod.listEnabledPluginIds();
      const toolsAfterDisable = registry.getToolDefinitions();
      const hasToolAfterDisable = registry.hasTool('test.toggle-plugin.toggleTool');

      // Clean up
      pluginManagerMod.resetPluginManager();
      registryMod.resetDefaultPluginRegistry();
      loaderMod.resetLoadedPlugins();

      return {
        afterEnableEnabled: afterEnable?.enabled,
        enabledIdsIncludes: enabledIds.includes('test.toggle-plugin'),
        toolCountAfterEnable: toolsAfterEnable.length,
        hasTool,
        afterDisableEnabled: afterDisable?.enabled,
        enabledIdsAfterEmpty: enabledIdsAfter.length === 0,
        toolCountAfterDisable: toolsAfterDisable.length,
        hasToolAfterDisable,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!toggleResult.error, `Enable/Disable works${toggleResult.error ? ': ' + toggleResult.error : ''}`);
  ok(toggleResult.afterEnableEnabled, 'Plugin is enabled after enablePlugin()');
  ok(toggleResult.enabledIdsIncludes, 'Enabled ids list includes plugin');
  ok(toggleResult.hasTool, 'Tool accessible while enabled');
  ok(toggleResult.toolCountAfterEnable >= 1, `Tool count ≥ 1 when enabled (got: ${toggleResult.toolCountAfterEnable})`);
  ok(!toggleResult.afterDisableEnabled, 'Plugin is disabled after disablePlugin()');
  ok(toggleResult.enabledIdsAfterEmpty, 'Enabled ids empty after disabling');
  ok(!toggleResult.hasToolAfterDisable, 'Tool NOT accessible after disabling');
  ok(toggleResult.toolCountAfterDisable === 0, `Tool count = 0 after disable (got: ${toggleResult.toolCountAfterDisable})`);
}

// ─── 11. Plugin Remove ──────────────────────────────────

async function testPluginRemove() {
  console.log('\n🗑️ 11. Plugin Remove');
  await freshPage();

  const removeResult = await page.evaluate(async () => {
    try {
      const pluginManagerMod = await import('/src/copilot/plugins/pluginManager.ts');
      const registryMod = await import('/src/copilot/plugins/pluginRegistry.ts');
      const loaderMod = await import('/src/copilot/plugins/pluginLoader.ts');

      // Reset
      pluginManagerMod.resetPluginManager();
      registryMod.resetDefaultPluginRegistry();
      loaderMod.resetLoadedPlugins();

      // Install a plugin
      const manifest = {
        id: 'test.removable',
        name: 'Removable Plugin',
        version: '1.0.0',
        author: 'Test',
        description: 'A plugin to be removed',
        license: 'MIT',
        compatibleWith: '>=0.1.0',
        entryPoint: './test.js',
        permissions: ['storage'],
      };
      pluginManagerMod.installPluginFromManifest(manifest);

      // Write to plugin storage
      loaderMod.writePluginStorage('test.removable', { data: 'test' });
      const storageKey = loaderMod.getPluginStorageKey('test.removable');
      const storageBeforeRemove = localStorage.getItem(storageKey);

      // Verify installed
      const installedBefore = pluginManagerMod.listInstalledPlugins();

      // Remove
      pluginManagerMod.removePlugin('test.removable');

      // Verify cleanup
      const installedAfter = pluginManagerMod.listInstalledPlugins();
      const storageAfterRemove = localStorage.getItem(storageKey);
      const pluginInfo = pluginManagerMod.getInstalledPlugin('test.removable');

      // Clean up
      pluginManagerMod.resetPluginManager();

      return {
        installedBeforeCount: installedBefore.length,
        storageBeforeRemove: !!storageBeforeRemove,
        installedAfterCount: installedAfter.length,
        storageCleared: storageAfterRemove === null,
        pluginGone: pluginInfo === undefined,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!removeResult.error, `Plugin remove works${removeResult.error ? ': ' + removeResult.error : ''}`);
  ok(removeResult.installedBeforeCount === 1, 'Plugin was installed');
  ok(removeResult.storageBeforeRemove, 'Plugin storage was written');
  ok(removeResult.installedAfterCount === 0, 'No installed plugins after remove');
  ok(removeResult.storageCleared, 'Plugin localStorage cleared after remove');
  ok(removeResult.pluginGone, 'getInstalledPlugin returns undefined after remove');
}

// ─── 12. No Console Errors ──────────────────────────────

async function testNoConsoleErrors() {
  console.log('\n🔇 12. No Console Errors During Plugin Lifecycle');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  // Open plugin manager
  await openActivityView('Plugins');
  await sleep(300);

  // Type in install input (won't actually install, just test UI interaction)
  const input = await page.$('.plugin-manager__install-input');
  if (input) {
    await input.click();
    await page.keyboard.type('https://example.com/plugin');
    await sleep(100);
    // Clear input
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await sleep(100);
  }

  // Switch views back and forth
  await openActivityView('Pattern Explorer');
  await sleep(200);
  await openActivityView('Plugins');
  await sleep(200);
  await openActivityView('Plugins');
  await sleep(200);
  await openActivityView('Plugins');
  await sleep(200);

  // Run some plugin module operations
  await page.evaluate(async () => {
    const pluginMod = await import('/src/copilot/plugins/index.ts');
    pluginMod.resetPluginManager();
    pluginMod.resetDefaultPluginRegistry();
    pluginMod.resetLoadedPlugins();
    pluginMod.resetCustomFormulas();

    // Register and unregister
    pluginMod.registerFormula('e2e', 'test', 'a + b', ['a', 'b'], 'test');
    pluginMod.unregisterPluginFormulas('e2e');

    // Manifest validation
    pluginMod.validateManifest({
      id: 'test', name: 'Test', version: '1.0.0', author: 'T',
      description: 'D', license: 'MIT', compatibleWith: '>=0.1.0',
      entryPoint: './t.js', permissions: [],
    });
  });
  await sleep(200);

  const newErrors = filterCriticalErrors(consoleErrors.slice(errorsBefore));
  ok(newErrors.length === 0,
    `No unexpected console errors during plugin lifecycle (${newErrors.length} errors)`);
  if (newErrors.length > 0) {
    newErrors.slice(0, 3).forEach(e => console.log(`    ⚠ ${e.slice(0, 150)}`));
  }
}

// ─── 13. Rapid Plugin Operations ────────────────────────

async function testRapidPluginOperations() {
  console.log('\n🏋️ 13. Rapid Plugin Operations Stress Test');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  const stressResult = await page.evaluate(async () => {
    const pluginSliceMod = await import('/src/store/pluginSlice.ts');
    const store = window.__store__;
    let errors = 0;

    for (let i = 0; i < 10; i++) {
      try {
        // Install
        store.dispatch(pluginSliceMod.installPlugin({
          id: `stress.plugin-${i}`,
          name: `Stress Plugin ${i}`,
          version: '1.0.0',
          author: 'Stress Test',
          description: `Stress test plugin ${i}`,
          enabled: false,
          permissions: ['read-pieces'],
        }));

        // Enable
        store.dispatch(pluginSliceMod.enablePlugin(`stress.plugin-${i}`));

        // Disable
        store.dispatch(pluginSliceMod.disablePlugin(`stress.plugin-${i}`));

        // Remove
        store.dispatch(pluginSliceMod.removePlugin(`stress.plugin-${i}`));
      } catch (e) {
        errors++;
      }
    }

    const finalState = store.getState().plugins;

    return {
      errors,
      finalInstalledCount: finalState.installedPlugins.length,
      finalEnabledCount: finalState.enabledPlugins.length,
    };
  });

  ok(stressResult.errors === 0, `No errors in 10 rapid install/enable/disable/remove cycles`);
  ok(stressResult.finalInstalledCount === 0, `No plugins left after rapid operations (got: ${stressResult.finalInstalledCount})`);
  ok(stressResult.finalEnabledCount === 0, `No enabled plugins left (got: ${stressResult.finalEnabledCount})`);

  // Also stress test the plugin registry
  const registryStress = await page.evaluate(async () => {
    const registryMod = await import('/src/copilot/plugins/pluginRegistry.ts');
    const registry = registryMod.getDefaultPluginRegistry();
    registry.reset();

    let errors = 0;
    for (let i = 0; i < 10; i++) {
      try {
        registry.registerPlugin({
          id: `stress.reg-${i}`,
          name: `Stress Registry ${i}`,
          version: '1.0.0',
          author: 'Test',
          description: 'Stress',
          license: 'MIT',
          compatibleWith: '>=0.1.0',
          tools: [{
            name: 'tool',
            description: 'A tool',
            parameters: { type: 'object', properties: {}, required: [] },
            requiredPermissions: [],
            handler: async () => ({ success: true, result: 'ok' }),
          }],
        }, []);

        registry.unregisterPlugin(`stress.reg-${i}`);
      } catch (e) {
        errors++;
      }
    }

    const finalToolCount = registry.toolCount;
    registry.reset();

    return { errors, finalToolCount };
  });

  ok(registryStress.errors === 0, 'No errors in 10 rapid registry register/unregister cycles');
  ok(registryStress.finalToolCount === 0, `Registry clean after stress test (got: ${registryStress.finalToolCount})`);

  // App still functional
  const svgExists = await page.$('.pattern-svg');
  ok(svgExists, 'App still functional after rapid plugin operations');

  const newErrors = filterCriticalErrors(consoleErrors.slice(errorsBefore));
  ok(newErrors.length === 0, `No console errors during stress test (${newErrors.length})`);
}

// ─── 14. Sidebar View Switching ─────────────────────────

async function testSidebarViewSwitching() {
  console.log('\n🔄 14. Sidebar View Switching');
  await freshPage();

  // Install a plugin to have state in the PluginManager
  await page.evaluate(async () => {
    const pluginManagerMod = await import('/src/copilot/plugins/pluginManager.ts');
    pluginManagerMod.resetPluginManager();
    pluginManagerMod.installPluginFromManifest({
      id: 'test.sidebar-test',
      name: 'Sidebar Test Plugin',
      version: '1.0.0',
      author: 'Test',
      description: 'For sidebar switching test',
      license: 'MIT',
      compatibleWith: '>=0.1.0',
      entryPoint: './test.js',
      permissions: ['read-pieces', 'storage'],
    });
  });
  await sleep(100);

  // Open Plugins view
  await openActivityView('Plugins');
  await sleep(300);

  // Verify plugin shows in list
  const pluginCardBefore = await page.$('.plugin-card');
  ok(pluginCardBefore, 'Plugin card visible in Plugins view');

  // Switch to Pattern Explorer
  await openActivityView('Pattern Explorer');
  await sleep(200);
  const explorerTitle = await getSidebarTitle();
  ok(explorerTitle === 'Pattern Explorer', `Switched to Pattern Explorer (got: "${explorerTitle}")`);

  // Switch to Settings
  await openActivityView('Settings');
  await sleep(200);
  const settingsTitle = await getSidebarTitle();
  ok(settingsTitle === 'Settings', `Switched to Settings (got: "${settingsTitle}")`);

  // Switch back to Plugins
  await openActivityView('Plugins');
  await sleep(300);
  const pluginsTitle = await getSidebarTitle();
  ok(pluginsTitle === 'Plugins', `Switched back to Plugins (got: "${pluginsTitle}")`);

  // Plugin card should still be there (state preserved)
  const pluginCardAfter = await page.$('.plugin-card');
  ok(pluginCardAfter, 'Plugin card still visible after view switching');

  // Clean up
  await page.evaluate(async () => {
    const pluginManagerMod = await import('/src/copilot/plugins/pluginManager.ts');
    pluginManagerMod.resetPluginManager();
  });
}

// ═════════════════════════════════════════════════════════
//  RUNNER
// ═════════════════════════════════════════════════════════

async function run() {
  let passed = 0, failed = 0;
  const tests = [
    testActivityBarPluginIcon,
    testPluginManagerUI,
    testPluginReduxState,
    testPluginRegistryWithCoreTools,
    testCommunitySkillRoundTrip,
    testLanguagePacks,
    testMarketplaceEmptyState,
    testFormulaPlugin,
    testPluginPermissions,
    testPluginEnableDisable,
    testPluginRemove,
    testNoConsoleErrors,
    testRapidPluginOperations,
    testSidebarViewSwitching,
  ];

  console.log(`\n🧪 OpenClo E2E — Plugin System & Community Skills — ${tests.length} test suites\n${'═'.repeat(60)}`);

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
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
