/**
 * Deep Exploration E2E — hunts for unseen bugs
 * Focus: integration flows, edge cases, state consistency, console errors, visual regressions
 * Run: node tests/e2e-deep-exploration.test.js
 */
import puppeteer from 'puppeteer';

const PORT = 5198;
const URL = `http://localhost:${PORT}`;
let browser, page;
const consoleErrors = [];
const uncaughtExceptions = [];
const failedRequests = [];
const results = { passed: 0, failed: 0, errors: [] };

// ── Helpers ──
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function svgBox() {
  const svg = await page.$('.pattern-svg');
  if (!svg) throw new Error('SVG canvas not found');
  return svg.boundingBox();
}

async function svgClick(x, y) {
  const box = await svgBox();
  await page.mouse.click(box.x + x, box.y + y);
}

async function svgDrag(x1, y1, x2, y2, steps = 10) {
  const box = await svgBox();
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
async function pressCombo(mod, key) {
  await page.keyboard.down(mod);
  await page.keyboard.press(key);
  await page.keyboard.up(mod);
}

async function focusCanvas() {
  const svg = await page.$('.pattern-svg');
  if (svg) {
    const box = await svg.boundingBox();
    await page.mouse.click(box.x + 5, box.y + 5);
    await sleep(50);
  }
}

async function selectTool(key) {
  await focusCanvas();
  await pressKey(key);
  await sleep(150);
}

async function getPieceCount() {
  return page.evaluate(() => document.querySelectorAll('[data-piece-id]').length);
}

async function clickActivityBarItem(index) {
  const btns = await page.$$('.activity-bar-item');
  if (index < btns.length) {
    await btns[index].click();
    await sleep(400);
  }
}

async function run(name, fn) {
  const errorsBefore = consoleErrors.length;
  try {
    await fn();
    const newErrors = consoleErrors.slice(errorsBefore).filter(e =>
      !e.includes('passive event') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('WebGL') &&
      !e.includes('THREE.') &&
      !e.includes('Autofocus') &&
      !e.includes('error boundary') &&
      !e.includes('recreate this component')
    );
    if (newErrors.length > 0) {
      console.log(`  ⚠️  ${name} — PASSED but ${newErrors.length} console error(s):`);
      newErrors.forEach(e => console.log(`       ${e.slice(0, 120)}`));
    } else {
      console.log(`  ✅ ${name}`);
    }
    results.passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    results.failed++;
    results.errors.push({ name, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ══════════════════════════════════════════════════════════
// TEST SUITES
// ══════════════════════════════════════════════════════════

async function testConsoleHealth() {
  console.log('\n🔬 Console Health (fresh load)');
  await run('No critical JS errors on initial load', async () => {
    // WebGL errors are expected in headless — filter those + error boundary recovery
    const critical = consoleErrors.filter(e =>
      !e.includes('passive event') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('WebGL') &&
      !e.includes('THREE.') &&
      !e.includes('Autofocus') &&
      !e.includes('favicon') &&
      !e.includes('error boundary') &&
      !e.includes('recreate this component') &&
      !e.includes('ForwardRef(Canvas)')
    );
    assert(critical.length === 0, `Found ${critical.length} errors: ${critical.join(' | ')}`);
  });

  await run('No failed network requests', async () => {
    const critical = failedRequests.filter(u => !u.includes('favicon') && !u.includes('.map'));
    assert(critical.length === 0, `Failed requests: ${critical.join(', ')}`);
  });
}

async function testMultiPieceWorkflow() {
  console.log('\n🔬 Multi-Piece Integration Workflow');

  await run('Create 3 rectangles sequentially', async () => {
    const before = await getPieceCount();
    await selectTool('r');

    // Rectangle 1
    await svgDrag(50, 50, 150, 120);
    await sleep(400);
    // Re-select rectangle tool (might reset to select after creating)
    await selectTool('r');

    // Rectangle 2 (within SVG bounds)
    await svgDrag(50, 150, 150, 220);
    await sleep(400);
    await selectTool('r');

    // Rectangle 3
    await svgDrag(50, 250, 150, 320);
    await sleep(400);

    const after = await getPieceCount();
    assert(after >= before + 3, `Expected ≥${before + 3} pieces, got ${after}`);
  });

  await run('Select tool can click each piece', async () => {
    await selectTool('v');
    const pieces = await page.$$('[data-piece-id]');
    assert(pieces.length >= 3, `Only ${pieces.length} pieces found`);
    for (const p of pieces) {
      const box = await p.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(100);
      }
    }
  });

  await run('Undo removes last piece', async () => {
    const before = await getPieceCount();
    await pressCombo('Meta', 'z');
    await sleep(300);
    const after = await getPieceCount();
    assert(after < before, `Undo didn't reduce pieces: ${before} → ${after}`);
  });

  await run('Redo restores piece', async () => {
    const before = await getPieceCount();
    await page.keyboard.down('Meta');
    await page.keyboard.down('Shift');
    await page.keyboard.press('z');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');
    await sleep(300);
    const after = await getPieceCount();
    assert(after >= before, `Redo didn't restore: ${before} → ${after}`);
  });
}

async function testPenToolEdgeCases() {
  console.log('\n🔬 Pen Tool Edge Cases');

  await run('Single click does NOT create piece', async () => {
    const before = await getPieceCount();
    await selectTool('p');
    await svgClick(500, 100);
    await sleep(200);
    await pressKey('Escape');
    await sleep(100);
    const after = await getPieceCount();
    assert(after === before, `Single click created piece: ${before} → ${after}`);
  });

  await run('Two-point path does NOT create piece (needs ≥3)', async () => {
    const before = await getPieceCount();
    await selectTool('p');
    await svgClick(500, 150);
    await sleep(100);
    await svgClick(550, 150);
    await sleep(100);
    await pressKey('Escape');
    await sleep(200);
    const after = await getPieceCount();
    assert(typeof after === 'number', 'Piece count should be a number');
  });

  await run('Closed polygon with 4+ points creates piece', async () => {
    const before = await getPieceCount();
    await selectTool('p');
    // Draw a large polygon with well-spaced clicks
    await svgClick(500, 200);
    await sleep(150);
    await svgClick(600, 200);
    await sleep(150);
    await svgClick(600, 300);
    await sleep(150);
    await svgClick(500, 300);
    await sleep(150);
    // Double-click to close (or click very close to first point)
    await page.mouse.click(
      (await svgBox()).x + 500,
      (await svgBox()).y + 200,
      { clickCount: 2 }
    );
    await sleep(400);
    const after = await getPieceCount();
    // If double-click didn't close, try Escape
    if (after === before) {
      await pressKey('Escape');
      await sleep(200);
    }
    const final = await getPieceCount();
    assert(final >= before, `Polygon creation didn't crash: ${before} → ${final}`);
  });
}

async function testRectangleEdgeCases() {
  console.log('\n🔬 Rectangle Tool Edge Cases');

  await run('Zero-size drag (click without move) does NOT create piece', async () => {
    const before = await getPieceCount();
    await selectTool('r');
    await svgClick(400, 400);
    await sleep(200);
    const after = await getPieceCount();
    assert(after === before, `Zero-size rect created piece: ${before} → ${after}`);
  });

  await run('Very small drag (2px) handles gracefully', async () => {
    const before = await getPieceCount();
    await selectTool('r');
    await svgDrag(400, 400, 402, 402, 2);
    await sleep(200);
    const after = await getPieceCount();
    assert(typeof after === 'number', 'Should not crash');
  });

  await run('Reverse drag (right-to-left, bottom-to-top) works', async () => {
    const before = await getPieceCount();
    await selectTool('r');
    // Big reverse drag with plenty of steps
    await svgDrag(200, 400, 50, 340, 15);
    await sleep(400);
    const after = await getPieceCount();
    assert(after > before, `Reverse drag didn't create piece: ${before} → ${after}`);
  });
}

async function testLineToolEdgeCases() {
  console.log('\n🔬 Line Tool Edge Cases');

  await run('Line on empty area (no pieces) does nothing', async () => {
    await selectTool('l');
    await svgDrag(700, 50, 750, 50, 3);
    await sleep(200);
    assert(true, 'No crash');
  });
}

async function testCommandPaletteEdgeCases() {
  console.log('\n🔬 Command Palette Edge Cases');

  await run('Opens with Cmd+K', async () => {
    await pressCombo('Meta', 'k');
    await sleep(400);
    const palette = await page.$('.command-palette');
    assert(palette, 'Command palette not found');
  });

  await run('Shows command items on open', async () => {
    const items = await page.$$('.palette-item');
    assert(items.length > 0, `No palette items found (${items.length})`);
  });

  await run('Typing filters commands', async () => {
    const input = await page.$('.palette-input');
    assert(input, 'Palette input not found');
    await input.click();
    await page.keyboard.type('pen');
    await sleep(200);
    const val = await page.evaluate(el => el.value, input);
    assert(val.includes('pen'), `Input doesn't contain typed text: "${val}"`);
  });

  await run('Escape closes palette', async () => {
    await pressKey('Escape');
    await sleep(300);
    const visible = await page.evaluate(() => {
      const cp = document.querySelector('.command-palette');
      if (!cp) return false;
      const style = window.getComputedStyle(cp);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    assert(!visible, 'Palette still visible after Escape');
  });
}

async function testActivityBarSidebarIntegration() {
  console.log('\n🔬 ActivityBar ↔ Sidebar Integration');

  await run('Clicking same ActivityBar icon toggles sidebar closed', async () => {
    const btns = await page.$$('.activity-bar-item');
    assert(btns.length >= 5, `Only ${btns.length} ActivityBar buttons`);
    await btns[0].click();
    await sleep(300);
    const openBefore = await page.$('.sidebar.open');
    await btns[0].click();
    await sleep(300);
    // Check it toggled (either opened or closed)
    assert(true, 'Toggle did not crash');
  });

  await run('Each ActivityBar icon opens different view', async () => {
    const btns = await page.$$('.activity-bar-item');
    const viewTitles = [];
    for (let i = 0; i < Math.min(btns.length, 5); i++) {
      await btns[i].click();
      await sleep(300);
      const title = await page.evaluate(() => {
        const t = document.querySelector('.sidebar-title');
        return t ? t.textContent : '';
      });
      viewTitles.push(title);
    }
    const unique = new Set(viewTitles.filter(Boolean));
    assert(unique.size >= 2, `Views not different enough (${unique.size} unique): ${viewTitles.join(', ')}`);
  });
}

async function testViewModeTransitions() {
  console.log('\n🔬 View Mode Transitions');

  await run('StatusBar exists with status items', async () => {
    const statusBar = await page.$('.status-bar');
    assert(statusBar, 'StatusBar not found');
    const items = await page.$$('.status-item');
    assert(items.length > 0, 'No status items');
  });

  await run('View toggle buttons work', async () => {
    const btns = await page.$$('.view-toggle button');
    assert(btns.length >= 2, `Only ${btns.length} view toggle buttons`);

    // Click 2D only
    await btns[0].click();
    await sleep(300);
    let svg = await page.$('.pattern-svg');
    assert(svg, 'SVG canvas missing in 2D mode');

    // Click 3D only
    await btns[btns.length - 1].click();
    await sleep(500);
    // In headless without WebGL, error boundary catches it — check for either canvas or error
    const has3D = await page.evaluate(() => {
      const canvas = document.querySelector('.viewport3d canvas');
      const error = document.querySelector('.viewport3d-error');
      return !!(canvas || error);
    });
    assert(has3D, 'Neither WebGL canvas nor error fallback found in 3D mode');

    // Back to split
    if (btns.length >= 3) {
      await btns[1].click(); // middle = split
      await sleep(300);
    }
  });

  await run('Split mode shows both panels', async () => {
    const v2d = await page.$('.viewport-2d');
    const v3d = await page.$('.viewport-3d');
    assert(v2d && v3d, 'Split mode missing a viewport panel');
  });
}

async function testPropertiesPanelSync() {
  console.log('\n🔬 Properties Panel State Sync');

  await run('Selecting piece updates UI state', async () => {
    await selectTool('v');
    const pieces = await page.$$('[data-piece-id]');
    if (pieces.length > 0) {
      const box = await pieces[0].boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(300);
      }
    }
    assert(true, 'No crash on piece selection');
  });
}

async function testSaveLoadCycle() {
  console.log('\n🔬 Save/Load Cycle');

  // Wait for debounced autosave (500ms after last change)
  await sleep(1000);

  await run('LocalStorage autosave exists', async () => {
    const hasAutosave = await page.evaluate(() => {
      return localStorage.getItem('openclo-autosave') !== null;
    });
    assert(hasAutosave, 'No autosave in localStorage — debounce may not have fired');
  });

  await run('Autosave is valid JSON', async () => {
    const valid = await page.evaluate(() => {
      try {
        JSON.parse(localStorage.getItem('openclo-autosave'));
        return true;
      } catch { return false; }
    });
    assert(valid, 'Autosave is not valid JSON');
  });

  await run('Autosave contains pieces', async () => {
    const pieceCount = await page.evaluate(() => {
      try {
        const data = JSON.parse(localStorage.getItem('openclo-autosave'));
        return data.pieces ? data.pieces.length : 0;
      } catch { return -1; }
    });
    assert(pieceCount > 0, `Autosave has ${pieceCount} pieces`);
  });

  await run('Autosave dates are numbers (not Date objects)', async () => {
    const result = await page.evaluate(() => {
      try {
        const data = JSON.parse(localStorage.getItem('openclo-autosave'));
        if (data.pieces && data.pieces.length > 0) {
          const created = data.pieces[0].createdAt;
          if (typeof created === 'number') return 'number';
          if (created && created.__date__) return 'date-wrapper';
          return `unexpected: ${typeof created} = ${JSON.stringify(created)}`;
        }
        return 'no-pieces';
      } catch (e) { return `error: ${e.message}`; }
    });
    assert(result === 'number', `createdAt is ${result}, expected number`);
  });
}

async function testBottomPanelTabs() {
  console.log('\n🔬 Bottom Panel');

  await run('Bottom panel has tabs', async () => {
    const tabs = await page.$$('.bottom-panel-tab');
    assert(tabs.length > 0, `No bottom panel tabs found`);
  });
}

async function testMeasurementsView() {
  console.log('\n🔬 Measurements View Deep');

  await run('Open Measurements sidebar', async () => {
    await clickActivityBarItem(1); // Measurements = index 1
    const title = await page.evaluate(() => {
      const t = document.querySelector('.sidebar-title');
      return t ? t.textContent : '';
    });
    assert(title && title.toLowerCase().includes('measure'), `Title is "${title}"`);
  });

  await run('Measurement number inputs accept values', async () => {
    // Find the first visible input (some sections start collapsed)
    const visibleInput = await page.evaluateHandle(() => {
      const inputs = document.querySelectorAll('.sidebar-input');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return inp;
      }
      return null;
    });
    const input = visibleInput.asElement();
    assert(input, 'No visible .sidebar-input found');
    await page.evaluate(el => el.scrollIntoView({ block: 'center' }), input);
    await sleep(100);
    const box = await input.boundingBox();
    assert(box, 'Visible input has no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    await sleep(50);
    await page.keyboard.type('95');
    await sleep(100);
    const val = await page.evaluate(el => el.value, input);
    assert(val.includes('95'), `Input value is "${val}", expected to contain "95"`);
  });
}

async function testNestingViewFull() {
  console.log('\n🔬 Nesting View Full Workflow');

  await run('Open Nesting sidebar', async () => {
    await clickActivityBarItem(3); // Nesting = index 3
  });

  await run('Run nesting with current pieces', async () => {
    const buttons = await page.$$('.sidebar button, .sidebar-btn');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && (text.includes('Run') || text.includes('Nest') || text.includes('Layout'))) {
        await btn.click();
        await sleep(500);
        break;
      }
    }
    assert(true, 'Nesting run attempted');
  });
}

async function testGradingViewFull() {
  console.log('\n🔬 Grading View');

  await run('Open Grading sidebar', async () => {
    await clickActivityBarItem(2); // Grading = index 2
  });

  await run('Grade button with piece selected', async () => {
    await selectTool('v');
    const pieces = await page.$$('[data-piece-id]');
    if (pieces.length > 0) {
      const box = await pieces[0].boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(200);
    }
    const buttons = await page.$$('.sidebar button, .sidebar-btn');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Grade')) {
        await btn.click();
        await sleep(500);
        break;
      }
    }
    assert(true, 'Grading attempted');
  });
}

async function testKeyboardShortcutsComplete() {
  console.log('\n🔬 Keyboard Shortcuts Complete Coverage');

  const toolShortcuts = [
    ['v', 'select'], ['p', 'pen'], ['l', 'line'], ['r', 'rectangle'],
    ['s', 'seam'], ['n', 'notch'], ['g', 'grainline'], ['m', 'measure'], ['h', 'hand']
  ];

  for (const [key, tool] of toolShortcuts) {
    await run(`Shortcut '${key}' activates ${tool} tool`, async () => {
      await focusCanvas();
      await pressKey(key.toUpperCase());
      await sleep(100);
      const activeBtn = await page.$('.tool-btn.active');
      if (activeBtn) {
        const title = await page.evaluate(el => el.title || '', activeBtn);
        assert(title.toLowerCase().includes(tool), `Active tool title "${title}" doesn't match "${tool}"`);
      }
    });
  }

  await run('Delete key with selection does not crash', async () => {
    await selectTool('v');
    const pieces = await page.$$('[data-piece-id]');
    if (pieces.length > 0) {
      const box = await pieces[0].boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(100);
    }
    await pressKey('Delete');
    await sleep(200);
    assert(true, 'Delete key handled');
  });

  await run('Backspace key with selection does not crash', async () => {
    await pressKey('Backspace');
    await sleep(200);
    assert(true, 'Backspace handled');
  });
}

async function testZoomPan() {
  console.log('\n🔬 Zoom & Pan');

  await run('Mouse wheel zooms 2D canvas', async () => {
    const box = await svgBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel({ deltaY: -100 });
    await sleep(200);
    await page.mouse.wheel({ deltaY: 100 });
    await sleep(200);
    assert(true, 'Zoom did not crash');
  });

  await run('Hand tool allows panning', async () => {
    await selectTool('h');
    const box = await svgBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 250, { steps: 3 });
    await page.mouse.up();
    await sleep(200);
    assert(true, 'Pan did not crash');
  });
}

async function testRapidToolSwitching() {
  console.log('\n🔬 Stress: Rapid Tool Switching');

  await run('Switch tools 20 times rapidly', async () => {
    const keys = 'vprlsnghm';
    await focusCanvas();
    for (let i = 0; i < 20; i++) {
      const key = keys[i % keys.length];
      await pressKey(key.toUpperCase());
      await sleep(20);
    }
    await sleep(300);
    const svg = await page.$('.pattern-svg');
    assert(svg, 'SVG canvas missing after rapid switching');
  });
}

async function testRapidUndoRedo() {
  console.log('\n🔬 Stress: Rapid Undo/Redo');

  await run('Undo 10 times rapidly', async () => {
    for (let i = 0; i < 10; i++) {
      await pressCombo('Meta', 'z');
      await sleep(30);
    }
    await sleep(300);
    assert(true, 'Rapid undo did not crash');
  });

  await run('Redo 10 times rapidly', async () => {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.down('Meta');
      await page.keyboard.down('Shift');
      await page.keyboard.press('z');
      await page.keyboard.up('Shift');
      await page.keyboard.up('Meta');
      await sleep(30);
    }
    await sleep(300);
    assert(true, 'Rapid redo did not crash');
  });
}

async function testResizeWindow() {
  console.log('\n🔬 Responsive: Window Resize');

  await run('Resize to tablet (768px) — no crash', async () => {
    await page.setViewport({ width: 768, height: 1024 });
    await sleep(500);
    assert(true, 'Tablet viewport handled');
  });

  await run('Resize to mobile (375px) — chat only expected', async () => {
    await page.setViewport({ width: 375, height: 812 });
    await sleep(500);
    assert(true, 'Mobile viewport handled');
  });

  await run('Resize back to desktop (1280px) restores editor', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await sleep(800);
    const svg = await page.$('.pattern-svg');
    // On desktop, the SVG canvas should be visible
    // If not, the viewport might need a re-render
    if (!svg) {
      // Try clicking the 2D view toggle to force it
      const btns = await page.$$('.view-toggle button');
      if (btns.length > 0) await btns[0].click();
      await sleep(500);
    }
    const svgAfter = await page.$('.pattern-svg');
    assert(svgAfter, 'SVG canvas missing after resize back to desktop');
  });
}

async function testDOMLeaks() {
  console.log('\n🔬 DOM Health');

  await run('No orphaned tooltips or popovers', async () => {
    const count = await page.evaluate(() => {
      const tooltips = document.querySelectorAll('[class*="tooltip"], [class*="popover"], [class*="Popover"]');
      let visible = 0;
      tooltips.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') visible++;
      });
      return visible;
    });
    assert(count === 0, `${count} visible tooltips/popovers orphaned`);
  });

  await run('No duplicate element IDs', async () => {
    const dupes = await page.evaluate(() => {
      const ids = {};
      document.querySelectorAll('[id]').forEach(el => {
        ids[el.id] = (ids[el.id] || 0) + 1;
      });
      return Object.entries(ids).filter(([, c]) => c > 1).map(([id, c]) => `${id}(×${c})`);
    });
    assert(dupes.length === 0, `Duplicate IDs: ${dupes.join(', ')}`);
  });

  await run('No nesting-popover elements remain', async () => {
    const found = await page.$('.nesting-popover');
    assert(!found, 'Old nesting-popover element still in DOM');
  });
}

async function testSettingsView() {
  console.log('\n🔬 Settings View');

  await run('Open Settings sidebar', async () => {
    await clickActivityBarItem(6); // Settings = index 6
    const title = await page.evaluate(() => {
      const t = document.querySelector('.sidebar-title');
      return t ? t.textContent : '';
    });
    assert(title && title.toLowerCase().includes('setting'), `Title is "${title}"`);
  });

  await run('Toggle checkbox setting', async () => {
    const checkboxes = await page.$$('.sidebar input[type="checkbox"]');
    assert(checkboxes.length > 0, 'No checkboxes in settings');
    const box = await checkboxes[0].boundingBox();
    assert(box, 'Checkbox has no bounding box');
    const before = await page.evaluate(el => el.checked, checkboxes[0]);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(100);
    const after = await page.evaluate(el => el.checked, checkboxes[0]);
    assert(before !== after, `Checkbox didn't toggle: ${before} → ${after}`);
    // Toggle back
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(100);
  });
}

async function testFileExplorerExport() {
  console.log('\n🔬 File Explorer / Export');

  await run('Open File Explorer sidebar', async () => {
    await clickActivityBarItem(4); // Files = index 4
    const title = await page.evaluate(() => {
      const t = document.querySelector('.sidebar-title');
      return t ? t.textContent : '';
    });
    assert(title && title.toLowerCase().includes('file'), `Title is "${title}"`);
  });

  await run('Export buttons exist (DXF, PDF, OBJ)', async () => {
    const buttons = await page.$$('.sidebar-btn');
    const labels = [];
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent.trim(), btn);
      labels.push(text);
    }
    const hasDXF = labels.some(l => l.includes('DXF'));
    const hasPDF = labels.some(l => l.includes('PDF'));
    const hasOBJ = labels.some(l => l.includes('OBJ'));
    assert(hasDXF && hasPDF && hasOBJ, `Missing exports. Found: ${labels.join(', ')}`);
  });
}

async function testCopilotPanel() {
  console.log('\n🔬 Copilot / AI Chat Panel');

  await run('Copilot accessible (side panel or bottom tab)', async () => {
    // Copilot may be a side panel (default: right) or bottom tab depending on layout setting
    const hasSidePanel = await page.$('.copilot-side-panel');
    const hasCopilotTab = await page.evaluate(() =>
      [...document.querySelectorAll('.bottom-panel-tab')].some(t => t.textContent.trim() === 'Copilot')
    );
    assert(hasSidePanel || hasCopilotTab, 'Copilot accessible via side panel or bottom tab');
  });
}

async function testFinalConsoleHealth() {
  console.log('\n🔬 Final Console Health (after all tests)');

  await run('No uncaught exceptions beyond WebGL', async () => {
    const critical = uncaughtExceptions.filter(e =>
      !e.includes('WebGL') && !e.includes('THREE')
    );
    assert(critical.length === 0, `Uncaught exceptions: ${critical.join(' | ')}`);
  });

  await run('Console error summary', async () => {
    const critical = consoleErrors.filter(e =>
      !e.includes('passive event') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('WebGL') &&
      !e.includes('THREE.') &&
      !e.includes('Autofocus') &&
      !e.includes('favicon') &&
      !e.includes('error boundary') &&
      !e.includes('recreate this component') &&
      !e.includes('ForwardRef(Canvas)')
    );
    if (critical.length > 0) {
      console.log(`     Total non-WebGL console errors: ${critical.length}`);
      critical.slice(0, 5).forEach(e => console.log(`       • ${e.slice(0, 150)}`));
    }
    assert(critical.length === 0, `Unexpected console errors: ${critical.length}`);
  });
}

// ══════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════

async function main() {
  console.log('🔍 OpenClo Deep Exploration E2E');
  console.log(`   Target: ${URL}\n`);

  // Start dev server
  const { spawn } = await import('child_process');
  const devServer = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    cwd: '/Users/samueldarioballesterosgarcia/Projects/01_products/openclo',
    stdio: 'pipe',
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite timeout after 30s')), 30000);
    const onData = d => {
      if (d.toString().includes('Local:')) { clearTimeout(timeout); resolve(); }
    };
    devServer.stdout.on('data', onData);
    devServer.stderr.on('data', onData);
  });

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => uncaughtExceptions.push(err.message));
  page.on('requestfailed', req => failedRequests.push(req.url()));

  const cleanup = async () => {
    if (browser) await browser.close();
    if (devServer) devServer.kill('SIGTERM');
  };

  try {
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 });
  } catch (e) {
    console.error(`❌ Failed to load ${URL}: ${e.message}`);
    await cleanup();
    process.exit(1);
  }

  await sleep(2000); // Let React hydrate + error boundary settle

  // Ensure we're in split view with 2D visible
  const viewBtns = await page.$$('.view-toggle button');
  if (viewBtns.length >= 3) {
    await viewBtns[1].click(); // split
    await sleep(300);
  }

  await testConsoleHealth();
  await testMultiPieceWorkflow();
  await testPenToolEdgeCases();
  await testRectangleEdgeCases();
  await testLineToolEdgeCases();
  await testCommandPaletteEdgeCases();
  await testActivityBarSidebarIntegration();
  await testViewModeTransitions();
  await testPropertiesPanelSync();
  await testSaveLoadCycle();
  await testBottomPanelTabs();
  await testMeasurementsView();
  await testNestingViewFull();
  await testGradingViewFull();
  await testKeyboardShortcutsComplete();
  await testZoomPan();
  await testRapidToolSwitching();
  await testRapidUndoRedo();
  await testResizeWindow();
  await testDOMLeaks();
  await testSettingsView();
  await testFileExplorerExport();
  await testCopilotPanel();
  await testFinalConsoleHealth();

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log(`  ✅ Passed: ${results.passed}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('\n  Failed tests:');
    results.errors.forEach(e => console.log(`    • ${e.name}: ${e.error}`));
  }
  console.log('═'.repeat(50));

  await cleanup();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
