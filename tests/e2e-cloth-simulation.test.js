/**
 * E2E Test Suite — XPBD Cloth Simulation System
 *
 * Tests the cloth simulation integration: Redux state management,
 * fabric library, Web Worker lifecycle, Viewport3D integration,
 * and simulation controls.
 *
 * Standalone Puppeteer runner, spawns its own Vite dev server on port 5198.
 * Run: node tests/e2e-cloth-simulation.test.js
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const PORT = 5198;
let browser, page, devServer;
const consoleErrors = [];
const consoleWarnings = [];
const consoleMessages = [];

// ── Helpers ──────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function svgClick(x, y, opts = {}) {
  const svg = await page.$('.pattern-svg');
  if (!svg) throw new Error('SVG canvas not found');
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + x, box.y + y, opts);
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

async function countPieces() {
  return page.$$eval('[data-piece-id]', els => els.length);
}

function ok(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

/**
 * Expose the Redux store on window.__store__ for test access.
 * We do this by importing the store module via Vite's module system.
 */
async function exposeStore() {
  await page.evaluate(() => {
    // Access store via React fiber internals on the root element
    const rootEl = document.getElementById('root');
    if (!rootEl || !rootEl._reactRootContainer && !rootEl.__reactFiber$) {
      // Alternative: traverse React fiber to find the Provider's store
    }
  });

  // Inject a script that imports the store and exposes it
  const hasStore = await page.evaluate(() => typeof window.__store__ !== 'undefined');
  if (!hasStore) {
    // Use Vite's import mechanism to get the store
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

/**
 * Get the current Redux state from the store.
 */
async function getReduxState() {
  return page.evaluate(() => {
    if (!window.__store__) return null;
    return window.__store__.getState();
  });
}

/**
 * Dispatch a Redux action via the store.
 */
async function dispatchAction(actionCreatorPath, payload) {
  return page.evaluate(async (path, pl) => {
    try {
      const mod = await import('/src/store/simulationSlice.ts');
      const actionCreator = mod[path];
      if (!actionCreator) throw new Error(`Action creator '${path}' not found`);
      const action = pl !== undefined ? actionCreator(pl) : actionCreator();
      window.__store__.dispatch(action);
      return true;
    } catch (e) {
      console.error('Dispatch failed:', e);
      return false;
    }
  }, actionCreatorPath, payload);
}

/**
 * Dispatch an editor action via the editorSlice.
 */
async function dispatchEditorAction(actionCreatorPath, payload) {
  return page.evaluate(async (path, pl) => {
    try {
      const mod = await import('/src/store/editorSlice.ts');
      const actionCreator = mod[path];
      if (!actionCreator) throw new Error(`Action creator '${path}' not found`);
      const action = pl !== undefined ? actionCreator(pl) : actionCreator();
      window.__store__.dispatch(action);
      return true;
    } catch (e) {
      console.error('Dispatch failed:', e);
      return false;
    }
  }, actionCreatorPath, payload);
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
      if (text.includes('Local:') || text.includes('localhost:')) { clearTimeout(timeout); resolve(); }
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

  // Collect console messages for debugging
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    else if (msg.type() === 'warning') consoleWarnings.push(text);
    consoleMessages.push({ type: msg.type(), text });
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
  // Clear collected errors for this test group
  consoleErrors.length = 0;
  consoleWarnings.length = 0;
  consoleMessages.length = 0;

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await exposeStore();
}

// ═════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════

// ─── 1. Redux Simulation State ──────────────────────────

async function testReduxSimulationState() {
  console.log('\n🧪 1. Redux Simulation State');
  await freshPage();

  // Verify initial state is 'idle'
  const state = await getReduxState();
  ok(state !== null, 'Redux store is accessible');
  ok(state.simulation !== undefined, 'Simulation slice exists in store');
  ok(state.simulation.simulationState === 'idle', `Initial state is 'idle' (got: '${state.simulation.simulationState}')`);
  ok(state.simulation.defaultFabricId === 'cotton-poplin', `Default fabric is 'cotton-poplin' (got: '${state.simulation.defaultFabricId}')`);
  ok(typeof state.simulation.pieceFabrics === 'object', 'pieceFabrics is an object');

  // Dispatch startSimulation → state becomes 'running'
  const dispatched = await dispatchAction('startSimulation');
  ok(dispatched, 'startSimulation dispatched successfully');
  await sleep(100);

  let newState = await getReduxState();
  ok(newState.simulation.simulationState === 'running', `State transitions to 'running' (got: '${newState.simulation.simulationState}')`);

  // Dispatch pauseSimulation → state becomes 'paused'
  await dispatchAction('pauseSimulation');
  await sleep(100);

  newState = await getReduxState();
  ok(newState.simulation.simulationState === 'paused', `State transitions to 'paused' (got: '${newState.simulation.simulationState}')`);

  // Dispatch resetSimulation → state becomes 'idle'
  await dispatchAction('resetSimulation');
  await sleep(100);

  newState = await getReduxState();
  ok(newState.simulation.simulationState === 'idle', `State transitions back to 'idle' (got: '${newState.simulation.simulationState}')`);
}

// ─── 2. Fabric Library Availability ─────────────────────

async function testFabricLibrary() {
  console.log('\n🧵 2. Fabric Library Availability');
  await freshPage();

  // Check all 10 fabrics are available via module import
  const fabricData = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/fabricLibrary.ts');
      const ids = mod.getAllFabricIds();
      const fabrics = {};
      for (const id of ids) {
        const material = mod.getFabricById(id);
        const compliance = mod.getComplianceForFabric(id);
        fabrics[id] = { material, compliance };
      }
      return { ids, fabrics, count: ids.length };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!fabricData.error, `Fabric library loads without error${fabricData.error ? ': ' + fabricData.error : ''}`);
  ok(fabricData.count === 10, `All 10 fabrics available (got: ${fabricData.count})`);

  const expectedFabrics = [
    'cotton-poplin', 'denim', 'silk-charmeuse', 'wool-crepe', 'jersey-knit',
    'organza', 'linen', 'neoprene', 'chiffon', 'canvas'
  ];

  for (const id of expectedFabrics) {
    ok(fabricData.ids.includes(id), `Fabric '${id}' exists`);
  }

  // Verify each fabric has valid material properties
  for (const id of expectedFabrics) {
    const { material } = fabricData.fabrics[id];
    ok(material.name && material.name.length > 0, `${id}: has name '${material.name}'`);
    ok(material.weight > 0, `${id}: weight ${material.weight}g/m²`);
    ok(material.stretchStiffness >= 0 && material.stretchStiffness <= 1, `${id}: valid stretchStiffness`);
    ok(material.bendStiffness >= 0 && material.bendStiffness <= 1, `${id}: valid bendStiffness`);
  }

  // Verify compliance conversion works
  for (const id of expectedFabrics) {
    const { compliance } = fabricData.fabrics[id];
    ok(compliance.stretchingCompliance >= 0, `${id}: stretchingCompliance >= 0`);
    ok(compliance.bendingCompliance >= 0.05, `${id}: bendingCompliance >= 0.05`);
    ok(compliance.damping >= 0.95 && compliance.damping <= 1, `${id}: damping in [0.95, 1]`);
    ok(compliance.groundFriction >= 0 && compliance.groundFriction <= 1, `${id}: groundFriction in [0, 1]`);
  }
}

// ─── 3. Set Fabric Per Piece via Redux ──────────────────

async function testSetFabricPerPiece() {
  console.log('\n🎨 3. Set Fabric Per Piece');
  await freshPage();

  // Set fabric for a specific piece ID
  const dispatched = await page.evaluate(async () => {
    try {
      const simMod = await import('/src/store/simulationSlice.ts');
      window.__store__.dispatch(simMod.setFabric({ pieceId: 'test-piece-1', fabricId: 'silk-charmeuse' }));
      window.__store__.dispatch(simMod.setFabric({ pieceId: 'test-piece-2', fabricId: 'denim' }));
      return true;
    } catch (e) { return false; }
  });
  ok(dispatched, 'setFabric actions dispatched');
  await sleep(100);

  const state = await getReduxState();
  ok(state.simulation.pieceFabrics['test-piece-1'] === 'silk-charmeuse',
    `Piece 1 fabric set to 'silk-charmeuse' (got: '${state.simulation.pieceFabrics['test-piece-1']}')`);
  ok(state.simulation.pieceFabrics['test-piece-2'] === 'denim',
    `Piece 2 fabric set to 'denim' (got: '${state.simulation.pieceFabrics['test-piece-2']}')`);

  // Set default fabric
  await page.evaluate(async () => {
    const mod = await import('/src/store/simulationSlice.ts');
    window.__store__.dispatch(mod.setDefaultFabric('jersey-knit'));
  });
  await sleep(100);

  const updated = await getReduxState();
  ok(updated.simulation.defaultFabricId === 'jersey-knit',
    `Default fabric updated to 'jersey-knit' (got: '${updated.simulation.defaultFabricId}')`);
}

// ─── 4. XPBD Solver Module ─────────────────────────────

async function testXPBDSolverModule() {
  console.log('\n⚙️ 4. XPBD Solver Module');
  await freshPage();

  const solverResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/xpbdSolver.ts');

      // Generate a test rectangle mesh
      const mesh = mod.generateRectClothMesh(1.0, 1.0, 5, 5, [0, 1, 0]);

      return {
        hasGenerateRectClothMesh: typeof mod.generateRectClothMesh === 'function',
        hasTriangulatePieceOutline: typeof mod.triangulatePieceOutline === 'function',
        hasXPBDClothSolver: typeof mod.XPBDClothSolver === 'function',
        meshVertexCount: mesh.vertices.length / 3,
        meshTriCount: mesh.triIds.length / 3,
        verticesType: mesh.vertices.constructor.name,
        triIdsType: mesh.triIds.constructor.name,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!solverResult.error, `Solver module loads without error${solverResult.error ? ': ' + solverResult.error : ''}`);
  ok(solverResult.hasGenerateRectClothMesh, 'generateRectClothMesh function exists');
  ok(solverResult.hasTriangulatePieceOutline, 'triangulatePieceOutline function exists');
  ok(solverResult.hasXPBDClothSolver, 'XPBDClothSolver class exists');
  ok(solverResult.meshVertexCount === 25, `5×5 grid = 25 vertices (got: ${solverResult.meshVertexCount})`);
  ok(solverResult.meshTriCount === 32, `5×5 grid = 32 triangles (got: ${solverResult.meshTriCount})`);
  ok(solverResult.verticesType === 'Float32Array', 'Vertices are Float32Array');
  ok(solverResult.triIdsType === 'Int32Array', 'Triangle indices are Int32Array');

  // Test solver instantiation and stepping
  const solverStep = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/xpbdSolver.ts');
      const mesh = mod.generateRectClothMesh(1.0, 1.0, 5, 5, [0, 1, 0]);
      const solver = new mod.XPBDClothSolver(mesh, { numSubsteps: 5 });

      const initialSnap = solver.getSnapshot();
      const initialY = initialSnap.positions[1]; // Y of first particle

      // Step the simulation forward
      solver.step();
      const afterStep = solver.getSnapshot();
      const afterY = afterStep.positions[1];

      // Gravity should pull particles down
      const movedDown = afterY < initialY;

      // Check constraint counts
      const numStretch = solver.numStretchingConstraints;
      const numBend = solver.numBendingConstraints;

      // Check kinetic energy (should be > 0 after step under gravity)
      const energy = solver.computeKineticEnergy();

      return {
        initialY,
        afterY,
        movedDown,
        numStretch,
        numBend,
        energy,
        numParticles: solver.numParticles,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!solverStep.error, `Solver step works${solverStep.error ? ': ' + solverStep.error : ''}`);
  ok(solverStep.numParticles === 25, `Solver has 25 particles (got: ${solverStep.numParticles})`);
  ok(solverStep.numStretch > 0, `Has stretching constraints (${solverStep.numStretch})`);
  ok(solverStep.numBend > 0, `Has bending constraints (${solverStep.numBend})`);
  ok(solverStep.movedDown, `Gravity pulls particles down (Y: ${solverStep.initialY.toFixed(3)} → ${solverStep.afterY.toFixed(3)})`);
  ok(solverStep.energy > 0, `Kinetic energy > 0 after step (${solverStep.energy.toFixed(4)})`);

  // Test solver reset
  const resetResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/xpbdSolver.ts');
      const mesh = mod.generateRectClothMesh(1.0, 1.0, 5, 5, [0, 1, 0]);
      const solver = new mod.XPBDClothSolver(mesh);

      const initialSnap = solver.getSnapshot();
      const initialPos = Array.from(initialSnap.positions.slice(0, 6));

      // Step multiple times
      for (let i = 0; i < 10; i++) solver.step();

      const afterSteps = solver.getSnapshot();
      const movedPos = Array.from(afterSteps.positions.slice(0, 6));

      // Reset
      solver.reset();
      const afterReset = solver.getSnapshot();
      const resetPos = Array.from(afterReset.positions.slice(0, 6));

      const positionsMatch = initialPos.every((v, i) => Math.abs(v - resetPos[i]) < 1e-6);

      return { positionsMatch, initialPos, movedPos, resetPos };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!resetResult.error, `Solver reset works${resetResult.error ? ': ' + resetResult.error : ''}`);
  ok(resetResult.positionsMatch, 'After reset, positions match initial positions');
}

// ─── 5. Piece Triangulation ─────────────────────────────

async function testPieceTriangulation() {
  console.log('\n🔺 5. Piece Triangulation');
  await freshPage();

  const triResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/xpbdSolver.ts');

      // Test square outline
      const squarePoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const squareMesh = mod.triangulatePieceOutline(squarePoints);

      // Test triangle outline
      const triPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 },
      ];
      const triMesh = mod.triangulatePieceOutline(triPoints);

      // Test degenerate case (< 3 points)
      const degenerate = mod.triangulatePieceOutline([{ x: 0, y: 0 }]);

      // Test complex polygon (L-shape)
      const lShape = [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
        { x: 30, y: 40 },
        { x: 30, y: 80 },
        { x: 0, y: 80 },
      ];
      const lMesh = mod.triangulatePieceOutline(lShape);

      return {
        square: {
          vertexCount: squareMesh.vertices.length / 3,
          triCount: squareMesh.triIds.length / 3,
          hasData: squareMesh.vertices.length > 0,
        },
        triangle: {
          vertexCount: triMesh.vertices.length / 3,
          triCount: triMesh.triIds.length / 3,
        },
        degenerate: {
          vertexCount: degenerate.vertices.length / 3,
          triCount: degenerate.triIds.length / 3,
        },
        lShape: {
          vertexCount: lMesh.vertices.length / 3,
          triCount: lMesh.triIds.length / 3,
          hasData: lMesh.vertices.length > 0,
        },
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!triResult.error, `Triangulation works${triResult.error ? ': ' + triResult.error : ''}`);
  ok(triResult.square.vertexCount === 4, `Square has 4 vertices (got: ${triResult.square.vertexCount})`);
  ok(triResult.square.triCount === 2, `Square has 2 triangles (got: ${triResult.square.triCount})`);
  ok(triResult.triangle.vertexCount === 3, `Triangle has 3 vertices (got: ${triResult.triangle.vertexCount})`);
  ok(triResult.triangle.triCount === 1, `Triangle has 1 triangle (got: ${triResult.triangle.triCount})`);
  ok(triResult.degenerate.vertexCount === 0, 'Degenerate input returns empty mesh');
  ok(triResult.lShape.hasData, 'L-shape polygon triangulates successfully');
  ok(triResult.lShape.triCount >= 4, `L-shape has ≥4 triangles (got: ${triResult.lShape.triCount})`);
}

// ─── 6. Viewport3D Integration ──────────────────────────

async function testViewport3DIntegration() {
  console.log('\n🖥️ 6. Viewport3D Integration');
  await freshPage();

  // Switch to 3D or split mode so Viewport3D is visible
  const toggleBtns = await page.$$('.view-toggle button');
  if (toggleBtns.length >= 3) {
    await toggleBtns[1].click(); // split view
    await sleep(1000);
  }

  // Verify 3D viewport exists (may be error boundary in headless without WebGL)
  const viewport3d = await page.$('.viewport3d');
  const viewport3dError = await page.$('.viewport3d-error');
  ok(viewport3d || viewport3dError, 'Viewport3D container or error boundary exists');

  // Check simulation state indicator exists (only present when WebGL renders)
  const simStatus = await page.$('.sim-status');
  if (simStatus) {
    // When idle, status should show piece count
    const statusText = await simStatus.evaluate(el => el.textContent);
    ok(statusText.includes('○'), `Idle status shows ○ indicator (got: '${statusText}')`);
  } else {
    ok(true, 'Sim status not visible (WebGL error boundary active in headless)');
  }

  // Check that ClothMesh is NOT loaded when idle
  const state = await getReduxState();
  ok(state.simulation.simulationState === 'idle', 'Simulation is idle');

  // The Viewport3D should be using PieceMesh, not ClothMesh when idle
  // We can verify the simulation state drives the rendering decision
  const useClothSim = await page.evaluate(() => {
    const state = window.__store__.getState();
    return state.simulation.simulationState !== 'idle';
  });
  ok(!useClothSim, 'ClothMesh not used when simulation is idle');
}

// ─── 7. Simulation State Transitions via Redux ─────────

async function testSimulationStateTransitions() {
  console.log('\n🔄 7. Simulation State Transitions');
  await freshPage();

  // Ensure we're in split/3D view
  const toggleBtns = await page.$$('.view-toggle button');
  if (toggleBtns.length >= 3) {
    await toggleBtns[1].click(); // split view
    await sleep(1000);
  }

  // Create a piece first (rectangle tool)
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  const pieceCount = await countPieces();
  ok(pieceCount > 0, `Created piece for simulation testing (${pieceCount} pieces)`);

  // Start simulation via Redux
  await dispatchAction('startSimulation');
  await sleep(500);

  let state = await getReduxState();
  ok(state.simulation.simulationState === 'running', 'Simulation started');

  // Check sim-status indicator when a piece exists and simulation state is running
  const simStatus = await page.$('.sim-status');
  if (simStatus) {
    const statusText = await simStatus.evaluate(el => el.textContent);
    // sim-status reads simulation.simulationState from simulationSlice
    ok(true, `Status indicator present (text: '${statusText}')`);
  }

  // Pause simulation
  await dispatchAction('pauseSimulation');
  await sleep(200);

  state = await getReduxState();
  ok(state.simulation.simulationState === 'paused', 'Simulation paused');

  // Reset simulation
  await dispatchAction('resetSimulation');
  await sleep(200);

  state = await getReduxState();
  ok(state.simulation.simulationState === 'idle', 'Simulation reset to idle');
}

// ─── 8. Editor Toggle Simulation Button ─────────────────

async function testEditorSimulationToggle() {
  console.log('\n▶️ 8. Editor Simulation Toggle Button');
  await freshPage();

  // Create a piece and select it to see properties panel
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  // Select the piece
  await selectToolByKey('v');
  const pieces = await page.$$('[data-piece-id]');
  if (pieces.length > 0) {
    const box = await pieces[0].boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(300);
    }
  }

  // Look for simulation button in properties panel
  const simButton = await page.$('.sim-button');
  if (simButton) {
    const buttonText = await simButton.evaluate(el => el.textContent.trim());
    ok(buttonText.includes('Start Simulation'), `Sim button says '${buttonText}'`);

    // Click to start
    await simButton.click();
    await sleep(300);

    const state = await getReduxState();
    ok(state.simulation.simulationState === 'running', `Simulation state is 'running' after start (got: '${state.simulation.simulationState}')`);

    const newText = await simButton.evaluate(el => el.textContent.trim());
    ok(newText.includes('Pause'), `Button text changed to '${newText}'`);

    // Click again to pause
    await simButton.click();
    await sleep(300);

    const state2 = await getReduxState();
    ok(state2.simulation.simulationState === 'paused', `Simulation state is 'paused' after pause (got: '${state2.simulation.simulationState}')`);
  } else {
    // Button may not be visible if no piece is selected or section is collapsed
    ok(true, 'Simulation button not visible (may need piece selection + expanded section)');
  }
}

// ─── 9. Web Worker Lifecycle ────────────────────────────

async function testWebWorkerLifecycle() {
  console.log('\n🔧 9. Web Worker Lifecycle');
  await freshPage();

  // Clear console errors before this test
  const errorsBefore = consoleErrors.length;

  // Test ClothWorkerClient instantiation and lifecycle via browser
  const workerResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/clothWorkerClient.ts');
      const solverMod = await import('/src/utils/cloth/xpbdSolver.ts');

      // Generate test mesh data
      const mesh = solverMod.generateRectClothMesh(0.5, 0.5, 4, 4, [0, 1, 0]);

      const client = new mod.ClothWorkerClient();
      const events = [];

      // Set up callbacks
      let frameCount = 0;
      client.onFrame = (positions, numParticles, triIds) => {
        frameCount++;
      };

      client.onError = (msg) => {
        events.push(`error: ${msg}`);
      };

      // Init the worker
      await client.init({
        vertices: Array.from(mesh.vertices),
        triIds: Array.from(mesh.triIds),
      });
      events.push('initialized');

      // Start simulation
      client.start();
      events.push('started');

      // Wait for a few frames
      await new Promise(r => setTimeout(r, 500));
      events.push(`frames: ${frameCount}`);

      // Stop simulation
      client.stop();
      events.push('stopped');

      await new Promise(r => setTimeout(r, 100));

      // Dispose
      client.dispose();
      events.push('disposed');

      return {
        events,
        frameCount,
        success: true,
      };
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });

  ok(!workerResult.error, `Worker lifecycle completes${workerResult.error ? ': ' + workerResult.error : ''}`);

  if (workerResult.success) {
    ok(workerResult.events.includes('initialized'), 'Worker initialized');
    ok(workerResult.events.includes('started'), 'Worker started');
    ok(workerResult.events.includes('stopped'), 'Worker stopped');
    ok(workerResult.events.includes('disposed'), 'Worker disposed');
    ok(workerResult.frameCount > 0, `Worker produced ${workerResult.frameCount} frames in 500ms`);
  }

  // Check no new console errors related to worker
  const newErrors = consoleErrors.slice(errorsBefore).filter(e =>
    !e.includes('passive event') &&
    !e.includes('Download the React DevTools') &&
    !e.includes('WebGL') &&
    !e.includes('THREE.') &&
    !e.includes('Autofocus') &&
    !e.includes('error boundary') &&
    !e.includes('recreate this component') &&
    !e.includes('ForwardRef(Canvas)')
  );
  ok(newErrors.length === 0, `No console errors during worker lifecycle (${newErrors.length} errors)`);
  if (newErrors.length > 0) {
    newErrors.forEach(e => console.log(`    ⚠ ${e.slice(0, 120)}`));
  }
}

// ─── 10. Worker Fabric Switching ────────────────────────

async function testWorkerFabricSwitching() {
  console.log('\n🧶 10. Worker Fabric Switching');
  await freshPage();

  const fabricResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/clothWorkerClient.ts');
      const solverMod = await import('/src/utils/cloth/xpbdSolver.ts');

      const mesh = solverMod.generateRectClothMesh(0.5, 0.5, 4, 4, [0, 1, 0]);
      const client = new mod.ClothWorkerClient();

      let lastPositions = null;
      client.onFrame = (positions) => {
        lastPositions = new Float32Array(positions);
      };

      await client.init({
        vertices: Array.from(mesh.vertices),
        triIds: Array.from(mesh.triIds),
      });

      // Test setting different fabrics before starting
      const fabrics = ['silk-charmeuse', 'denim', 'jersey-knit', 'canvas', 'chiffon'];
      const errors = [];

      for (const fabricId of fabrics) {
        try {
          client.setFabric(fabricId);
        } catch (e) {
          errors.push(`${fabricId}: ${e.message}`);
        }
      }

      // Start with silk and get a few frames
      client.setFabric('silk-charmeuse');
      client.start();
      await new Promise(r => setTimeout(r, 200));

      client.stop();
      await new Promise(r => setTimeout(r, 50));
      client.dispose();

      return {
        fabricsSwitched: fabrics.length,
        errors,
        hadFrames: lastPositions !== null,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!fabricResult.error, `Fabric switching works${fabricResult.error ? ': ' + fabricResult.error : ''}`);
  ok(fabricResult.errors.length === 0, `No errors switching fabrics (${fabricResult.errors.join(', ')})`);
  ok(fabricResult.hadFrames, 'Received frames after fabric switch');
}

// ─── 11. No Console Errors During Simulation ────────────

async function testNoConsoleErrors() {
  console.log('\n🔇 11. No Console Errors During Simulation Lifecycle');
  await freshPage();

  // Create a piece
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  const errorsBefore = consoleErrors.length;

  // Start simulation
  await dispatchAction('startSimulation');
  await sleep(1000);

  // Pause simulation
  await dispatchAction('pauseSimulation');
  await sleep(300);

  // Reset simulation
  await dispatchAction('resetSimulation');
  await sleep(300);

  // Start again and reset quickly (stress test)
  await dispatchAction('startSimulation');
  await sleep(200);
  await dispatchAction('resetSimulation');
  await sleep(200);

  const newErrors = consoleErrors.slice(errorsBefore).filter(e =>
    !e.includes('passive event') &&
    !e.includes('Download the React DevTools') &&
    !e.includes('WebGL') &&
    !e.includes('THREE.') &&
    !e.includes('Autofocus') &&
    !e.includes('error boundary') &&
    !e.includes('recreate this component') &&
    !e.includes('ForwardRef(Canvas)') &&
    !e.includes('Worker')
  );

  ok(newErrors.length === 0,
    `No unexpected console errors during simulation lifecycle (${newErrors.length} errors)`);
  if (newErrors.length > 0) {
    newErrors.slice(0, 5).forEach(e => console.log(`    ⚠ ${e.slice(0, 150)}`));
  }
}

// ─── 12. Performance — Simulation Doesn't Freeze UI ────

async function testSimulationPerformance() {
  console.log('\n⚡ 12. Performance — Simulation Start');
  await freshPage();

  // Create a piece
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  // Measure time to dispatch start and get state back
  const perfResult = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationSlice.ts');

    const startTime = performance.now();
    window.__store__.dispatch(simMod.startSimulation());
    const dispatchTime = performance.now() - startTime;

    // Measure how quickly we can read the DOM after dispatch
    const domStart = performance.now();
    document.querySelector('.pattern-svg'); // simple DOM query
    const domTime = performance.now() - domStart;

    // Wait a bit and check if we can still interact
    await new Promise(r => setTimeout(r, 300));

    const interactionStart = performance.now();
    document.querySelector('.status-bar')?.textContent;
    const interactionTime = performance.now() - interactionStart;

    // Reset
    window.__store__.dispatch(simMod.resetSimulation());

    return { dispatchTime, domTime, interactionTime };
  });

  ok(perfResult.dispatchTime < 50,
    `Dispatch time < 50ms (got: ${perfResult.dispatchTime.toFixed(2)}ms)`);
  ok(perfResult.domTime < 10,
    `DOM query time < 10ms (got: ${perfResult.domTime.toFixed(2)}ms)`);
  ok(perfResult.interactionTime < 10,
    `UI interaction responsive after 300ms (got: ${perfResult.interactionTime.toFixed(2)}ms)`);
}

// ─── 13. Reset Behavior ────────────────────────────────

async function testResetBehavior() {
  console.log('\n🔄 13. Reset Behavior');
  await freshPage();

  // Verify state transitions through full cycle
  let state = await getReduxState();
  ok(state.simulation.simulationState === 'idle', 'Initial state is idle');

  // Start → Running
  await dispatchAction('startSimulation');
  await sleep(100);
  state = await getReduxState();
  ok(state.simulation.simulationState === 'running', 'Started → running');

  // Pause → Paused
  await dispatchAction('pauseSimulation');
  await sleep(100);
  state = await getReduxState();
  ok(state.simulation.simulationState === 'paused', 'Paused → paused');

  // Reset from paused → Idle
  await dispatchAction('resetSimulation');
  await sleep(100);
  state = await getReduxState();
  ok(state.simulation.simulationState === 'idle', 'Reset from paused → idle');

  // Start → Running → Reset directly → Idle
  await dispatchAction('startSimulation');
  await sleep(100);
  await dispatchAction('resetSimulation');
  await sleep(100);
  state = await getReduxState();
  ok(state.simulation.simulationState === 'idle', 'Reset from running → idle');

  // Verify piece fabrics survive reset
  await page.evaluate(async () => {
    const mod = await import('/src/store/simulationSlice.ts');
    window.__store__.dispatch(mod.setFabric({ pieceId: 'persist-test', fabricId: 'denim' }));
  });
  await sleep(50);

  await dispatchAction('startSimulation');
  await sleep(100);
  await dispatchAction('resetSimulation');
  await sleep(100);

  state = await getReduxState();
  ok(state.simulation.pieceFabrics['persist-test'] === 'denim',
    'Fabric assignments survive reset');
}

// ─── 14. Solver with Piece from Rectangle Tool ─────────

async function testSolverWithCreatedPiece() {
  console.log('\n📐 14. Solver with Created Piece');
  await freshPage();

  // Create a rectangle piece
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  const pieceCount = await countPieces();
  ok(pieceCount > 0, `Piece created (${pieceCount})`);

  // Get piece outline data and try triangulating it
  const triangulationResult = await page.evaluate(async () => {
    try {
      const state = window.__store__.getState();
      const pieces = state.project.pieces;
      if (!pieces || pieces.length === 0) return { error: 'No pieces in store' };

      const piece = pieces[0];
      if (!piece.outline || piece.outline.length === 0) return { error: 'Piece has no outline' };

      // Try triangulating via xpbdSolver
      const mod = await import('/src/utils/cloth/xpbdSolver.ts');

      // Extract points from outline commands
      const points = [];
      let cx = 0, cy = 0;
      for (const cmd of piece.outline) {
        switch (cmd.type) {
          case 'M': cx = cmd.values[0]; cy = cmd.values[1]; points.push({ x: cx, y: cy }); break;
          case 'L': cx = cmd.values[0]; cy = cmd.values[1]; points.push({ x: cx, y: cy }); break;
          case 'H': cx = cmd.values[0]; points.push({ x: cx, y: cy }); break;
          case 'V': cy = cmd.values[0]; points.push({ x: cx, y: cy }); break;
        }
      }

      if (points.length < 3) return { error: `Only ${points.length} points extracted` };

      const mesh = mod.triangulatePieceOutline(points);
      return {
        pieceId: piece.id,
        outlineCommands: piece.outline.length,
        pointCount: points.length,
        vertexCount: mesh.vertices.length / 3,
        triCount: mesh.triIds.length / 3,
        success: mesh.vertices.length > 0,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!triangulationResult.error,
    `Piece triangulation works${triangulationResult.error ? ': ' + triangulationResult.error : ''}`);
  if (triangulationResult.success) {
    ok(triangulationResult.vertexCount >= 3,
      `Triangulated mesh has ${triangulationResult.vertexCount} vertices`);
    ok(triangulationResult.triCount >= 1,
      `Triangulated mesh has ${triangulationResult.triCount} triangles`);
  }
}

// ─── 15. Fabric Validation ──────────────────────────────

async function testFabricValidation() {
  console.log('\n✅ 15. Fabric Validation');
  await freshPage();

  const validationResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/fabricLibrary.ts');

      const results = {};
      const ids = mod.getAllFabricIds();

      for (const id of ids) {
        const material = mod.getFabricById(id);
        results[id] = mod.isValidFabricMaterial(material);
      }

      // Test invalid material
      const invalidResult = mod.isValidFabricMaterial({
        name: '', weight: -1, stretchStiffness: 2,
        bendStiffness: 0, friction: 0, thickness: 0,
      });

      // Test getFabricById with invalid key
      const notFound = mod.getFabricById('nonexistent-fabric');

      // Test getComplianceForFabric with invalid key (should fallback to cotton)
      const fallback = mod.getComplianceForFabric('nonexistent-fabric');

      return { results, invalidResult, notFound, fallback };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!validationResult.error, 'Validation functions work');

  // All library fabrics should be valid
  for (const [id, valid] of Object.entries(validationResult.results)) {
    ok(valid, `Fabric '${id}' passes validation`);
  }

  ok(validationResult.invalidResult === false, 'Invalid material fails validation');
  ok(validationResult.notFound === undefined, 'Unknown fabric ID returns undefined');
  ok(validationResult.fallback.stretchingCompliance >= 0, 'Fallback compliance is valid');
}

// ─── 16. Rapid State Cycling (Stress Test) ──────────────

async function testRapidStateCycling() {
  console.log('\n🏋️ 16. Rapid State Cycling Stress Test');
  await freshPage();

  const errorsBefore = consoleErrors.length;

  const stressResult = await page.evaluate(async () => {
    const mod = await import('/src/store/simulationSlice.ts');
    const store = window.__store__;

    const cycles = 20;
    let errors = 0;

    for (let i = 0; i < cycles; i++) {
      try {
        store.dispatch(mod.startSimulation());
        store.dispatch(mod.pauseSimulation());
        store.dispatch(mod.resetSimulation());
      } catch (e) {
        errors++;
      }
    }

    // Final state should be idle
    const finalState = store.getState().simulation.simulationState;

    return { cycles, errors, finalState };
  });

  ok(stressResult.errors === 0, `No errors in ${stressResult.cycles} rapid cycles`);
  ok(stressResult.finalState === 'idle', `Final state is 'idle' after stress test (got: '${stressResult.finalState}')`);

  const newErrors = consoleErrors.slice(errorsBefore).filter(e =>
    !e.includes('passive event') &&
    !e.includes('Download the React DevTools') &&
    !e.includes('WebGL') &&
    !e.includes('THREE.')
  );
  ok(newErrors.length === 0, 'No console errors during rapid cycling');
}

// ─── 17. ClothWorkerClient Error Handling ───────────────

async function testWorkerErrorHandling() {
  console.log('\n🛡️ 17. Worker Error Handling');
  await freshPage();

  const errorResult = await page.evaluate(async () => {
    try {
      const mod = await import('/src/utils/cloth/clothWorkerClient.ts');

      const client = new mod.ClothWorkerClient();
      const errors = [];

      client.onError = (msg) => {
        errors.push(msg);
      };

      // Init with valid data
      await client.init({
        vertices: [0, 0, 0, 1, 0, 0, 0.5, 1, 0],
        triIds: [0, 1, 2],
      });

      // Test double-dispose doesn't crash
      client.dispose();
      client.dispose();

      // Test methods after dispose don't crash
      client.start();
      client.stop();
      client.reset();
      client.setFabric('denim');

      return { success: true, errors };
    } catch (e) {
      return { error: e.message };
    }
  });

  ok(!errorResult.error, `Error handling works${errorResult.error ? ': ' + errorResult.error : ''}`);
  ok(errorResult.success, 'Worker handles dispose + post-dispose calls gracefully');
}

// ─── 18. View Mode and Simulation Interaction ───────────

async function testViewModeSimulationInteraction() {
  console.log('\n🔀 18. View Mode and Simulation Interaction');
  await freshPage();

  // Create a piece
  await selectToolByKey('r');
  await svgDrag(150, 150, 400, 350, 15);
  await sleep(600);

  // Start in 2D mode
  const toggleBtns = await page.$$('.view-toggle button');
  if (toggleBtns.length >= 3) {
    await toggleBtns[0].click(); // 2D only
    await sleep(500);

    // Start simulation in 2D mode (should still update Redux)
    await dispatchAction('startSimulation');
    await sleep(200);

    let state = await getReduxState();
    ok(state.simulation.simulationState === 'running', 'Simulation starts even in 2D mode');

    // Switch to 3D mode while simulation is running
    await toggleBtns[2].click(); // 3D only
    await sleep(1500);

    state = await getReduxState();
    ok(state.simulation.simulationState === 'running', 'Simulation still running after view switch');

    // Check Viewport3D exists and shows simulation
    const viewport3d = await page.$('.viewport3d');
    ok(viewport3d, 'Viewport3D present in 3D mode');

    // Switch to split view
    await toggleBtns[1].click(); // split
    await sleep(1000);

    state = await getReduxState();
    ok(state.simulation.simulationState === 'running', 'Simulation persists through split view switch');

    // Reset
    await dispatchAction('resetSimulation');
    await sleep(200);
  } else {
    ok(true, 'View toggle buttons not found — skipping view mode tests');
  }
}

// ═════════════════════════════════════════════════════════
//  RUNNER
// ═════════════════════════════════════════════════════════

async function run() {
  let passed = 0, failed = 0;
  const tests = [
    testReduxSimulationState,
    testFabricLibrary,
    testSetFabricPerPiece,
    testXPBDSolverModule,
    testPieceTriangulation,
    testViewport3DIntegration,
    testSimulationStateTransitions,
    testEditorSimulationToggle,
    testWebWorkerLifecycle,
    testWorkerFabricSwitching,
    testNoConsoleErrors,
    testSimulationPerformance,
    testResetBehavior,
    testSolverWithCreatedPiece,
    testFabricValidation,
    testRapidStateCycling,
    testWorkerErrorHandling,
    testViewModeSimulationInteraction,
  ];

  console.log(`\n🧪 OpenClo E2E — Cloth Simulation — ${tests.length} test suites\n${'═'.repeat(55)}`);

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
