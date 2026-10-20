import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectCandidates } from '../../scripts/i18n/string-census.mjs';

const root = mkdtempSync(join(tmpdir(), 'vina-census-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture(rel: string, source: string): string {
  const file = join(root, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, source);
  return file;
}

const panel = fixture(
  'src/components/Panel.tsx',
  `
  import { showToast } from '../store/toasts';
  export function Panel() {
    showToast('Listo');
    const items = [{ label: 'Proyecto nuevo' }, { label: '12' }];
    const tool = { copilot: { description: 'Draws a dart' } };
    return (
      <div className="x">
        <button aria-label="Cerrar">Guardar cambios</button>
        {items.length}{tool.copilot.description}
      </div>
    );
  }
`,
);

const definition = fixture(
  'src/copilot/action/tools/definitions/createPiece.ts',
  `export const createPiece = { name: 'createPiece', description: 'Creates a pattern piece from points' };`,
);

const branches = fixture(
  'src/components/Branches.tsx',
  `
  const slice = createSlice({ name: 'editor', initialState: {}, reducers: {} });
  export const B = ({ open, x }) => <b title={x ?? 'Menú'}>{open ? 'Sí' : 'No'}</b>;
  const item = { label: open ? 'Cerrar' : 'Abrir' };
`,
);

type Candidate = { file: string; line: number; position: string; text: string; modelFacing: boolean };

describe('collectCandidates', () => {
  const found: Candidate[] = collectCandidates([panel, definition, branches]);
  const inPanel = found.filter((c) => c.file.replace(/\\/g, '/').endsWith('src/components/Panel.tsx'));
  const byText = (text: string) => inPanel.find((c) => c.text === text);

  it('reports JSX text, labelled attributes, labelled properties and toast arguments with their positions', () => {
    expect(byText('Guardar cambios')).toMatchObject({ position: 'jsx-text', modelFacing: false });
    expect(byText('Cerrar')).toMatchObject({ position: 'jsx-attr', modelFacing: false });
    expect(byText('Proyecto nuevo')).toMatchObject({ position: 'property', modelFacing: false });
    expect(byText('Listo')).toMatchObject({ position: 'toast', modelFacing: false });
    expect(byText('Guardar cambios')!.line).toBe(9);
  });

  it('skips class names, text without letters and the copilot subtree', () => {
    expect(byText('x')).toBeUndefined();
    expect(byText('12')).toBeUndefined();
    expect(byText('Draws a dart')).toBeUndefined();
    expect(inPanel).toHaveLength(4);
  });

  it('marks text in the copilot tool definitions as model-facing', () => {
    const def = found.find((c) => c.text === 'Creates a pattern piece from points');
    expect(def).toMatchObject({ position: 'property', modelFacing: true });
  });

  it('counts a literal in a conditional or logical branch at its position, and skips a slice name', () => {
    const inBranches = found.filter((c) => c.file.replace(/\\/g, '/').endsWith('src/components/Branches.tsx'));
    expect(inBranches.map((c) => [c.position, c.text])).toEqual([
      ['jsx-attr', 'Menú'],
      ['jsx-text', 'Sí'],
      ['jsx-text', 'No'],
      ['property', 'Cerrar'],
      ['property', 'Abrir'],
    ]);
  });
});
