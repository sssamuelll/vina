/**
 * RuleTester for `no-literal-ui-string` (i18n spec § 8.1): every position where text reaches a
 * person is pinned as an `invalid` case, and every exclusion as a `valid` one.
 */
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from '../rules/no-literal-ui-string.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
});

const FILE = 'src/components/shell/SomePanel.tsx';
const WORKER = 'src/workers/someWorker.ts';
const literal = (n = 1) => Array.from({ length: n }, () => ({ messageId: 'literal' }));
const frozen = [{ messageId: 'frozen' }];
const at = (code, errors, filename = FILE) => ({ filename, code, errors });

const ATTRIBUTES = ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label'];
const PROPERTIES = ['label', 'name', 'title', 'description', 'message', 'placeholder', 'tooltip', 'actionLabel', 'hint', 'text'];
const TOASTS = ['showToast', 'showErrorToast', 'showSuccessToast', 'showInfoToast', 'showUndoToast'];
const CATALOG_READERS = ["t()", "displayShortcut('Ctrl+S')", "displayModifierKey('⇧')", 'formatNumber(1, { decimals: 1 })', 'formatCount(3)', "formatMedida(3, 'mm')", 'errorMessage(e)'];

describe('no-literal-ui-string', () => {
  it('reads every position where text reaches a person, and the catalog read at the wrong time', () => {
    ruleTester.run('no-literal-ui-string', rule, {
      valid: [
        // Attributes and keys nobody reads.
        { filename: FILE, code: 'const A = () => <div className="a b" data-superficie="menu" key="x" />;' },
        { filename: FILE, code: "const A = () => <a href={'/docs'} target=\"_blank\" rel=\"noreferrer\">{url}</a>;" },
        { filename: FILE, code: "const x = { id: 'Hola', type: 'Texto', kind: 'pieza' };" },
        // A Redux slice name is an identifier, not text.
        { filename: FILE, code: "const s = createSlice({ name: 'editor', initialState: {}, reducers: {} });" },
        // Text without a letter.
        { filename: FILE, code: "const x = { label: '12' };" },
        { filename: FILE, code: "const A = () => <span>{'—'} · 3</span>;" },
        // Catalog reads inside functions.
        { filename: FILE, code: 'function A() { return <b title={t().app.title}>{t().keys.delete}</b>; }' },
        { filename: FILE, code: 'const item = () => ({ label: t().app.title });' },
        { filename: FILE, code: 'function f() { return t().app.title; }' },
        { filename: FILE, code: 'function f() { showToast(t().app.title); }' },
        { filename: FILE, code: 'function A({ locale }) { return useMemo(() => t().app.title, [locale]); }' },
        { filename: FILE, code: 'function A() { const [n] = useState(() => 0); return useMemo(() => compute(), []); }' },
        { filename: FILE, code: "const label = () => displayShortcut('Ctrl+S');" },
        // The model reads the copilot subtree, not a person.
        { filename: FILE, code: "const def = { id: 'dart', copilot: { description: 'Draws a dart', name: 'createDart' } };" },
        // A reasoned ignore, on the line or the line above.
        { filename: FILE, code: "// i18n-ignore: identifier\nconst x = { name: 'createPiece' };" },
        { filename: FILE, code: "const x = { name: 'createPiece' }; // i18n-ignore: identifier" },
        // A module table read only at a position nobody sees.
        { filename: FILE, code: "const IDS = { a: 'Alpha' };\nexport function f(k) { return IDS[k] === 'x'; }" },
      ],
      invalid: [
        // 1. JSX text and literals in a JSX expression container.
        at('const A = () => <button>Guardar</button>;', literal()),
        at('const A = () => <>Texto suelto</>;', literal()),
        at("const A = () => <p>{'Hola'}</p>;", literal()),
        at('const A = () => <p>{`Hola ${n}`}</p>;', literal()),
        at("const A = () => <b>{open ? 'Sí' : 'No'}</b>;", literal(2)),
        // 2. Attributes a person perceives.
        ...ATTRIBUTES.map((name) => at(`const A = () => <input ${name}="Buscar" />;`, literal())),
        at("const A = () => <button title={'Cerrar'} />;", literal()),
        at("const A = () => <button aria-label={x ?? 'Menú'} />;", literal()),
        // 3. Properties, the LogoMenu shape included.
        ...PROPERTIES.map((key) => at(`const x = { ${key}: 'Proyecto nuevo' };`, literal())),
        at('const x = { label: `Pieza ${n}` };', literal()),
        at("const x = { label: open ? 'Cerrar' : 'Abrir' };", literal(2)),
        // 4. Toast arguments, bare and as members.
        ...TOASTS.map((name) => at(`function f() { dispatch(${name}('Listo')); }`, literal())),
        at("function f() { toasts.showSuccessToast('Exportado'); }", literal()),
        // 5. A module table read at a position: the uiExport.ts shape and a JSX read.
        at(
          "const SUCCESS = { pdf: 'PDF exportado', dxf: 'DXF exportado' };\nexport function f(format) { dispatch(showSuccessToast(SUCCESS[format])); }",
          literal(2),
        ),
        at("const NAMES = ['Uno', 'Dos'];\nconst A = ({ i }) => <span>{NAMES[i]}</span>;", literal(2)),
        at("const HINTS = { drag: 'Arrastra' };\nfunction f() { return { hint: HINTS.drag }; }", literal()),
        // 6. Frozen: module scope, hook initializers that never re-run, reducers, workers.
        ...CATALOG_READERS.map((call) => at(`const FROZEN = ${call};`, frozen)),
        at('function A() { return useMemo(() => t().app.title, []); }', frozen),
        at('function A() { const [s] = useState(() => t().keys.delete); return s; }', frozen),
        at(
          "const slice = createSlice({ name: 'x', initialState: {}, reducers: { a(state) { state.label = t().app.title; } } });",
          frozen,
        ),
        at(
          "const slice = createSlice({ name: 'x', initialState: {}, reducers: {}, extraReducers: (b) => { b.addCase(y, (s) => { s.m = formatNumber(1, { decimals: 1 }); }); } });",
          frozen,
        ),
        at('export function f() { return t().app.title; }', frozen, WORKER),
        // A bare ignore names no reason: reported, and it suppresses nothing.
        at("// i18n-ignore\nconst x = { label: 'Hola' };", [{ messageId: 'ignoreWithoutReason' }, { messageId: 'literal' }]),
      ],
    });
  });
});
