#!/usr/bin/env node
/**
 * OpenClo CLI — headless garment processing.
 *
 * Usage:
 *   openclo info <project.json>
 *   openclo export <project.json> --format dxf|pdf|aama [--output <file>]
 *   openclo validate <project.json>
 *
 * @module cli
 */

import * as fs from 'fs';
import * as path from 'path';

const VERSION = '0.9.0';

function printUsage(): void {
  console.log(`
OpenClo CLI v${VERSION} — Headless Garment Processing

Usage:
  openclo info <project.json>                          Print project summary
  openclo export <project.json> --format <fmt> [-o f]  Export to DXF/PDF/AAMA
  openclo validate <project.json>                      Validate project data
  openclo --version                                    Show version
  openclo --help                                       Show this help

Export formats: dxf, pdf, aama

Examples:
  openclo info my-garment.json
  openclo export my-garment.json --format dxf -o output.dxf
  openclo export my-garment.json --format aama
  openclo validate my-garment.json
`);
}

// ─── Argument Parsing ───────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`openclo v${VERSION}`);
  process.exit(0);
}

const command = args[0];
const projectPath = args[1];

if (!projectPath && command !== '--version') {
  console.error('Error: project file path required.');
  printUsage();
  process.exit(1);
}

// ─── Load Project ───────────────────────────────────────────────────────────

function loadProject(filePath: string): Record<string, unknown> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`Error: file not found: ${absPath}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(absPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error: failed to parse project file: ${(err as Error).message}`);
    process.exit(1);
  }
}

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdInfo(): Promise<void> {
  const project = loadProject(projectPath);
  const pieces = (project.pieces as unknown[]) || [];
  const seams = (project.seams as unknown[]) || [];
  const fabrics = (project.fabrics as unknown[]) || [];
  const garmentInfo = (project.garmentInfo as Record<string, string>) || {};
  const colorways = (project.colorways as unknown[]) || [];

  console.log(`\n  Project: ${project.name || 'Untitled'}`);
  console.log(`  ID:      ${project.id || 'N/A'}`);
  console.log(`  Pieces:  ${pieces.length}`);
  console.log(`  Seams:   ${seams.length}`);
  console.log(`  Fabrics: ${fabrics.length}`);
  console.log(`  Colorways: ${colorways.length}`);

  if (Object.keys(garmentInfo).length > 0) {
    console.log(`\n  Garment Info:`);
    for (const [key, val] of Object.entries(garmentInfo)) {
      if (val) console.log(`    ${key}: ${val}`);
    }
  }

  // Piece summary
  if (pieces.length > 0) {
    console.log(`\n  Pieces:`);
    for (const p of pieces as Array<{ id: string; name: string; fabricCode?: string }>) {
      console.log(`    - ${p.name || p.id} [${p.fabricCode || 'SELF'}]`);
    }
  }
  console.log('');
}

async function cmdExport(): Promise<void> {
  const format = getFlag('--format') || getFlag('-f');
  if (!format || !['dxf', 'pdf', 'aama'].includes(format)) {
    console.error('Error: --format must be one of: dxf, pdf, aama');
    process.exit(1);
  }

  const project = loadProject(projectPath);
  // Import PatternPiece type — project JSON matches this structure
  type Piece = import('../src/types/types').PatternPiece;
  const pieces = (project.pieces || []) as Piece[];

  if (pieces.length === 0) {
    console.error('Error: project has no pieces to export.');
    process.exit(1);
  }

  const outputFlag = getFlag('--output') || getFlag('-o');
  const defaultExt = format === 'pdf' ? '.pdf' : '.dxf';
  const outputPath = outputFlag || path.basename(projectPath, path.extname(projectPath)) + defaultExt;

  let content: string;

  if (format === 'dxf') {
    // Legacy DXF with all layers (CUT, SEAM, NOTCH, GRAINLINE, LABEL, etc.)
    const { generateDXFLegacy } = await import('../src/utils/exportDXF.js');
    content = generateDXFLegacy(pieces);
  } else if (format === 'aama') {
    // AAMA/ASTM D6673 compliant DXF with numbered layers
    const { generateDXFAAMA } = await import('../src/utils/dxf/exportAAMA.js');
    content = generateDXFAAMA(pieces);
  } else {
    // PDF
    const { generatePDF } = await import('../src/utils/exportPDF.js');
    content = generatePDF(pieces);
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`Exported ${pieces.length} pieces to ${outputPath} (${format.toUpperCase()})`);
}

async function cmdValidate(): Promise<void> {
  const project = loadProject(projectPath);

  // Use the shared projectValidator for full validation
  type OpenCloProject = import('../src/types/types').OpenCloProject;
  const { validateAndRepairProject } = await import('../src/utils/projectValidator.js');
  const { diagnostics } = validateAndRepairProject(project as unknown as OpenCloProject);

  const pieces = (project.pieces || []) as unknown[];
  const seams = (project.seams || []) as unknown[];

  if (diagnostics.length === 0) {
    console.log(`\n  ✓ Project valid — ${pieces.length} pieces, ${seams.length} seams, 0 issues\n`);
  } else {
    for (const d of diagnostics) {
      const icon = d.severity === 'error' ? '✗' : d.severity === 'warning' ? '⚠' : 'ℹ';
      console.log(`  ${icon} [${d.code}] ${d.message}`);
    }
    console.log(`\n  ${diagnostics.length} issue(s) found\n`);
    const hasErrors = diagnostics.some(d => d.severity === 'error');
    if (hasErrors) process.exit(1);
  }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  switch (command) {
    case 'info': return cmdInfo();
    case 'export': return cmdExport();
    case 'validate': return cmdValidate();
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
