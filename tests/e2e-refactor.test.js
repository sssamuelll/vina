/**
 * E2E test suite for PatternEditor refactor validation
 * Tests that all tool interactions still work after splitting into renderers
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const PORT = 5199;
let browser, page, devServer;

// ── Helpers ──
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function svgClick(x, y, opts = {}) {
  const svg = await page.$('.pattern-svg');
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + x, box.y + y, opts);
}

async function svgDrag(x1, y1, x2, y2) {
  const svg = await page.$('.pattern-svg');
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 5 });
  await page.mouse.up();
}

async function pressKey(key) { await page.keyboard.press(key); }

async function countPieces() {
  return page.$$eval('[data-piece-id]', els => els.length);
}

async function selectToolByKey(key) {
  // Click on SVG first to ensure focus isn't in an input
  const svg = await page.$('.pattern-svg');
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + 5, box.y + 5);
  await sleep(50);
  await pressKey(key);
  await sleep(100);
}

function ok(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// ── Setup / Teardown ──
async function setup() {
  devServer = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    cwd: '/Users/samueldarioballesterosgarcia/Projects/01_products/openclo',
    stdio: 'pipe',
  });

  // Wait for vite to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite timeout')), 20000);
    devServer.stdout.on('data', d => {
      if (d.toString().includes('Local:')) { clearTimeout(timeout); resolve(); }
    });
    devServer.stderr.on('data', d => {
      const s = d.toString();
      if (s.includes('Local:')) { clearTimeout(timeout); resolve(); }
    });
  });

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(500);
}

async function teardown() {
  if (browser) await browser.close();
  if (devServer) devServer.kill('SIGTERM');
}

// ── Tests ──
async function testGridRendering() {
  console.log('\n🔲 Grid Rendering');
  const grid = await page.$('#grid-small');
  ok(grid, 'Small grid pattern exists');
  const gridLarge = await page.$('#grid-large');
  ok(gridLarge, 'Large grid pattern exists');
}

async function testPenToolDrawPiece() {
  console.log('\n✏️ Pen Tool — Draw a piece');
  await selectToolByKey('p');
  
  // Draw a triangle
  await svgClick(200, 200);
  await sleep(50);
  await svgClick(350, 200);
  await sleep(50);
  await svgClick(275, 350);
  await sleep(50);
  // Close by pressing Enter
  await pressKey('Enter');
  await sleep(200);
  
  const count = await countPieces();
  ok(count >= 1, `Piece created (count: ${count})`);
}

async function testPenToolWithCurves() {
  console.log('\n🔄 Pen Tool — Bezier curves');
  await selectToolByKey('p');

  // Click-drag creates curve handles
  await svgDrag(400, 200, 430, 180);
  await sleep(50);
  await svgDrag(550, 200, 580, 220);
  await sleep(50);
  await svgClick(475, 350);
  await sleep(50);
  await pressKey('Enter');
  await sleep(200);
  
  const count = await countPieces();
  ok(count >= 2, `Curved piece created (count: ${count})`);
}

async function testSelectTool() {
  console.log('\n👆 Select Tool');
  await selectToolByKey('v');
  
  // Click on a piece's path element directly
  const piecePaths = await page.$$('[data-piece-id] path');
  ok(piecePaths.length > 0, 'Piece paths exist to select');
  
  if (piecePaths.length > 0) {
    const box = await piecePaths[0].boundingBox();
    if (box) {
      // Click on the path stroke edge (top-left area of bounding box)
      await page.mouse.click(box.x + 2, box.y + 2);
      await sleep(150);
      const selected = await page.$$('.pattern-piece.selected');
      ok(selected.length > 0, 'Piece selected on click');
    }
  }
}

async function testPieceDrag() {
  console.log('\n🔀 Piece Drag');
  await selectToolByKey('v');

  const piecePaths = await page.$$('[data-piece-id] path');
  if (piecePaths.length > 0) {
    const box = await piecePaths[0].boundingBox();
    if (box) {
      const cx = box.x + 2;
      const cy = box.y + 2;
      
      // Select first
      await page.mouse.click(cx, cy);
      await sleep(100);
      
      // Get position before
      const posBefore = await page.$eval('[data-piece-id]', el => el.getAttribute('transform'));
      
      // Drag
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy + 40, { steps: 10 });
      await page.mouse.up();
      await sleep(150);
      
      const posAfter = await page.$eval('[data-piece-id]', el => el.getAttribute('transform'));
      ok(posBefore !== posAfter, 'Piece position changed after drag');
    }
  }
}

async function testDeletePiece() {
  console.log('\n🗑️ Delete Piece');
  await selectToolByKey('v');
  
  const countBefore = await countPieces();
  
  // Select first piece via its path
  const piecePaths = await page.$$('[data-piece-id] path');
  if (piecePaths.length > 0) {
    const box = await piecePaths[0].boundingBox();
    if (box) {
      await page.mouse.click(box.x + 2, box.y + 2);
      await sleep(150);
      await pressKey('Delete');
      await sleep(200);
      
      const countAfter = await countPieces();
      ok(countAfter < countBefore, `Piece deleted (${countBefore} → ${countAfter})`);
    }
  }
}

async function testZoom() {
  console.log('\n🔍 Zoom');
  const svg = await page.$('.pattern-svg');
  const box = await svg.boundingBox();
  
  // Get initial transform
  const transformBefore = await page.$eval(
    '.pattern-svg > g[transform]',
    el => el.getAttribute('transform')
  );
  
  // Wheel zoom
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.wheel({ deltaY: -300 });
  await sleep(200);
  
  const transformAfter = await page.$eval(
    '.pattern-svg > g[transform]',
    el => el.getAttribute('transform')
  );
  
  ok(transformBefore !== transformAfter, 'Zoom changed transform');
}

async function testKeyboardShortcuts() {
  console.log('\n⌨️ Keyboard Shortcuts');
  
  const shortcuts = [
    ['p', 'crosshair'],
    ['v', 'default'],
    ['h', 'grab'],
    ['m', 'crosshair'],
    ['s', 'crosshair'],
    ['n', 'crosshair'],
    ['g', 'crosshair'],
  ];
  
  for (const [key, expectedCursor] of shortcuts) {
    await selectToolByKey(key);
    const cursor = await page.$eval('.pattern-svg', el => el.style.cursor);
    ok(cursor === expectedCursor, `Key '${key}' → cursor '${cursor}' (expected '${expectedCursor}')`);
  }
}

async function testTemplateGeneration() {
  console.log('\n📐 Template Generation');
  
  // Click Templates button
  const templateBtn = await page.$('.template-btn');
  ok(templateBtn, 'Template button exists');
  await templateBtn.click();
  await sleep(300);
  
  // Check modal appeared
  const modal = await page.$('.template-library');
  ok(modal, 'Template modal opened');
  
  if (modal) {
    // Click first template card
    const cards = await page.$$('.template-card');
    ok(cards.length > 0, `Template cards found (${cards.length})`);
    
    if (cards.length > 0) {
      const countBefore = await countPieces();
      await cards[0].click();
      await sleep(500);
      const countAfter = await countPieces();
      ok(countAfter > countBefore, `Template generated pieces (${countBefore} → ${countAfter})`);
    }
    
    // Close modal if still open
    const closeBtn = await page.$('.template-close');
    if (closeBtn) await closeBtn.click();
    await sleep(200);
  }
}

async function testUndoRedo() {
  console.log('\n↩️ Undo/Redo');
  
  const countBefore = await countPieces();
  
  // Draw a quick piece
  await selectToolByKey('p');
  await svgClick(600, 400);
  await sleep(50);
  await svgClick(700, 400);
  await sleep(50);
  await svgClick(650, 500);
  await sleep(50);
  await pressKey('Enter');
  await sleep(200);
  
  const countAfterDraw = await countPieces();
  ok(countAfterDraw > countBefore, 'Drew new piece');
  
  // Undo
  await page.keyboard.down('Meta');
  await pressKey('z');
  await page.keyboard.up('Meta');
  await sleep(200);
  
  const countAfterUndo = await countPieces();
  ok(countAfterUndo < countAfterDraw, `Undo removed piece (${countAfterDraw} → ${countAfterUndo})`);
  
  // Redo
  await page.keyboard.down('Meta');
  await page.keyboard.down('Shift');
  await pressKey('z');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Meta');
  await sleep(200);
  
  const countAfterRedo = await countPieces();
  ok(countAfterRedo > countAfterUndo, `Redo restored piece (${countAfterUndo} → ${countAfterRedo})`);
}

async function testMeasureTool() {
  console.log('\n📏 Measure Tool');
  await selectToolByKey('m');
  
  // Click two points
  await svgClick(200, 200);
  await sleep(100);
  await svgClick(350, 200);
  await sleep(200);
  
  // Check measure line rendered
  const measureLines = await page.$$('.measure-lines line');
  ok(measureLines.length > 0, 'Measurement line rendered');
  
  // Check label
  const labels = await page.$$('.measure-lines text');
  ok(labels.length > 0, 'Measurement label rendered');
  
  // Clear with Escape
  await pressKey('Escape');
  await sleep(100);
}

async function testHintText() {
  console.log('\n💬 Hint Text');
  
  // Seam tool shows hint always when no first edge selected
  await selectToolByKey('s');
  await sleep(100);
  
  const hints = await page.$$eval('svg text', els => els.map(e => (e.textContent || '').trim()));
  // Debug: log what we found
  const hasSeamHint = hints.some(h => h.includes('edge'));
  if (!hasSeamHint) console.log('    DEBUG hints:', JSON.stringify(hints));
  ok(hasSeamHint, `Seam tool hint displayed`);
  
  // Switch back
  await selectToolByKey('v');
}

async function testPieceRendererInternals() {
  console.log('\n🧵 Piece Renderer — Internals');
  
  // Check that pieces have SVG paths for outlines
  const paths = await page.$$('.pattern-piece path');
  ok(paths.length > 0, 'Pattern pieces have SVG paths');
}

async function testChatPanel() {
  console.log('\n💬 Chat Panel');
  
  // Click Chat button
  const chatBtn = await page.$('.copilot-toolbar-btn');
  ok(chatBtn, 'Chat toolbar button exists');
  await chatBtn.click();
  await sleep(200);
  
  // Check panel opened
  const panel = await page.$('.copilot-panel');
  ok(panel, 'Chat panel opened');
  
  // Check setup prompt (no agent configured)
  const setupBtn = await page.$('.copilot-setup-btn');
  ok(setupBtn, 'Setup prompt shown (no agent configured)');
  
  // Close
  const closeBtn = await page.$('.copilot-panel .copilot-btn-sm:last-child');
  if (closeBtn) await closeBtn.click();
  await sleep(100);
}

async function testPropertiesPanel() {
  console.log('\n📋 Properties Panel');
  
  // Check panel exists (collapsed or expanded)
  const panel = await page.$('.properties-panel');
  ok(panel, 'Properties panel exists');
  
  // Check icon strip when collapsed
  const icons = await page.$$('.panel-icon-shortcut');
  const content = await page.$('.panel-content');
  
  if (icons.length > 0) {
    ok(true, `Collapsed icon strip (${icons.length} icons)`);
    // Click an icon to expand
    await icons[0].click();
    await sleep(200);
    const expandedContent = await page.$('.panel-content');
    ok(expandedContent, 'Panel expanded on icon click');
  } else if (content) {
    ok(true, 'Panel is expanded with content');
  }
}

async function testMobileLayout() {
  console.log('\n📱 Mobile Layout');
  
  // Resize to mobile
  await page.setViewport({ width: 375, height: 812 });
  await sleep(500);
  
  // Should show mobile chat
  const mobileChat = await page.$('.mobile-chat');
  ok(mobileChat, 'Mobile shows chat-only layout');
  
  // No editors visible
  const editors = await page.$('.editors');
  ok(!editors, 'No editors on mobile');
  
  // Restore desktop
  await page.setViewport({ width: 1400, height: 900 });
  await sleep(300);
}

// ── Runner ──
async function run() {
  let passed = 0, failed = 0;
  const tests = [
    testGridRendering,
    testPenToolDrawPiece,
    testPenToolWithCurves,
    testSelectTool,
    testPieceDrag,
    testKeyboardShortcuts,
    testTemplateGeneration,
    testPieceRendererInternals,
    testUndoRedo,
    testMeasureTool,
    testDeletePiece,
    testHintText,
    testChatPanel,
    testPropertiesPanel,
    testZoom,
    testMobileLayout,
  ];
  
  console.log(`\n🧪 OpenClo E2E — ${tests.length} test suites\n${'═'.repeat(45)}`);
  
  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n${'═'.repeat(45)}`);
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
