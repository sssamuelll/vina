import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { collectSurface } from '../../scripts/persisted-surface.mjs';

const FIXTURE: Record<string, string> = {
  '/v/src/types/types.ts': `
    export interface Point { x: number; y: number }
    export interface Trazo { id: string; points: Point[] }
    export interface PatternPiece { id: string; name: string }
    export interface VinaProject {
      id: string;
      pieces: PatternPiece[];
      trazos?: Trazo[];
      parent?: VinaProject;
    }
  `,
  '/v/src/utils/projectSchema.ts': `
    declare const z: any;
    const pointSchema = z
      .object({ x: z.number(), y: z.number() });
    export const projectSchema = z.object({ id: z.string(), trazos: z.array(pointSchema).optional() }).loose();
  `,
  '/v/src/utils/other.ts': `
    declare const z: any;
    export const notPersisted = z.object({ ignored: z.string() });
  `,
  '/v/src/store/demoSlice.ts': `
    declare function createSlice(options: any): any;
    export const demo = createSlice({
      name: 'demo',
      initialState: {},
      reducers: {
        addThing(state: unknown) {},
        removeThing: (state: unknown) => {},
        prepared: {
          reducer(state: unknown) {},
          prepare(n: number) { return { payload: n }; },
        },
      },
    });
  `,
  '/v/src/utils/storageUse.ts': `
    declare function safeGetItem(key: string): string | null;
    declare function storageSet(store: string, key: string, value: unknown): Promise<void>;
    const DEMO_KEY = 'vina-demo';
    safeGetItem(DEMO_KEY);
    localStorage.getItem('vina-literal');
    interface Saved { a: number; b: { c: string } }
    declare const saved: Saved;
    void storageSet('kv', 'vina-saved', saved);
  `,
};

function fixtureProgram(): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const base = { getSourceFile: host.getSourceFile, fileExists: host.fileExists, readFile: host.readFile };
  host.getSourceFile = (name, lang, ...rest) =>
    name in FIXTURE ? ts.createSourceFile(name, FIXTURE[name], lang) : base.getSourceFile(name, lang, ...rest);
  host.fileExists = (name) => name in FIXTURE || base.fileExists(name);
  host.readFile = (name) => FIXTURE[name] ?? base.readFile(name);
  return ts.createProgram(Object.keys(FIXTURE), options, host);
}

describe('collectSurface', () => {
  const surface = collectSurface(fixtureProgram());

  it('lists the action types of every createSlice, in each reducer form', () => {
    expect(surface.actionTypes).toEqual(
      expect.arrayContaining(['demo/addThing', 'demo/removeThing', 'demo/prepared']),
    );
  });

  it('lists the keys of every z.object in projectSchema.ts, by schema variable, and nothing elsewhere', () => {
    expect(surface.zodKeys).toEqual(
      expect.arrayContaining(['projectSchema.trazos', 'projectSchema.id', 'pointSchema.x', 'pointSchema.y']),
    );
    expect(surface.zodKeys.some((k) => k.includes('ignored'))).toBe(false);
  });

  it('lists storage keys, resolving a const identifier to its string', () => {
    expect(surface.storageKeys).toEqual(expect.arrayContaining(['vina-demo', 'vina-literal', 'vina-saved']));
  });

  it('lists the property paths of the stored value by its type name', () => {
    expect(surface.storedShapes.Saved).toEqual(expect.arrayContaining(['a', 'b.c']));
  });

  it('lists the project property paths, arrays as [], cycles cut', () => {
    expect(surface.projectPaths).toEqual(
      expect.arrayContaining(['id', 'pieces[].id', 'pieces[].name', 'trazos[]', 'trazos[].points[].x', 'parent']),
    );
    expect(surface.projectPaths.length).toBeLessThan(100);
  });

  it('sorts every list', () => {
    for (const list of [surface.projectPaths, surface.zodKeys, surface.storageKeys, surface.actionTypes]) {
      expect(list).toEqual([...list].sort());
    }
    for (const paths of Object.values(surface.storedShapes)) expect(paths).toEqual([...paths].sort());
  });
});
