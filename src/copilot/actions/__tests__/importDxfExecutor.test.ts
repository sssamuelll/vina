import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureStore } from '@reduxjs/toolkit';

// Minimal DXF content that parseDXF can parse
const MINIMAL_DXF = [
  '0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', '1', '70', '1', '90', '4',
  '10', '0', '20', '0',
  '10', '100', '20', '0',
  '10', '100', '20', '200',
  '10', '0', '20', '200',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');

describe('import_dxf executor', () => {
  it('parses DXF content and produces pattern pieces', async () => {
    const { parseDXF } = await import('../../../utils/dxf/parser');
    const { dxfToPatternPieces } = await import('../../../utils/dxf/converter');

    const doc = parseDXF(MINIMAL_DXF);
    const pieces = dxfToPatternPieces(doc);
    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });
});

describe('import_dxf executor — loadType "open" is a faithful import (no auto-sew)', () => {
  // The pivot rule is "the AI NEVER auto-sews" (2026-05-29 CLO3D flow doc,
  // domainBootstrap). The drop-zone path (addPiece) honors it; the agent
  // path used to dispatch loadProject, whose generative pipeline auto-sews
  // and auto-renames — inventing seams the user never asked for.
  it('does not generate seams or load diagnostics when opening a multi-piece DXF', async () => {
    const { CopilotActionExecutor } = await import('../actionExecutor');
    const projectReducer = (await import('../../../store/projectSlice')).default;
    const editorReducer = (await import('../../../store/editorSlice')).default;
    const realStore = configureStore({
      reducer: { project: projectReducer, editor: editorReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false }),
    });

    const executor = new CopilotActionExecutor(
      realStore.dispatch as never,
      realStore.getState as never,
    );

    // Frozen multi-piece fixture (17 named pieces) — enough naming/length
    // signal that the legacy generative path actually produced seams.
    const dxf = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/garments/male_shirt.dxf'),
      'utf8',
    );

    const result = await executor.execute({
      action: 'import_dxf',
      fileContent: dxf,
      loadType: 'open',
    } as never);

    expect(result.success).toBe(true);
    const project = realStore.getState().project;
    expect(project.pieces.length).toBeGreaterThan(1);
    // Faithful import: what the file has is what lands. No invented seams.
    expect(project.seams).toHaveLength(0);
    expect(
      project.loadDiagnostics.filter(d => d.code === 'AUTO_SEAMS_DETECTED'),
    ).toHaveLength(0);
  });
});
