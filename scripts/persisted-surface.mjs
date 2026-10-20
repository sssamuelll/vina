#!/usr/bin/env node
// Lists everything a project or the browser persists, so later i18n phases can prove that
// translating the UI renamed nothing persisted:
//   projectPaths  property paths of VinaProject (arrays as `[]`, unions merged, cycles cut, depth <= 8)
//   storedShapes  property paths of each storageSet(store, key, value) value, keyed by its storage key (template keys as `prefix${…}`)
//   zodKeys       `<schemaVariable>.<key>` of every z.object({...}) in src/utils/projectSchema.ts
//   storageKeys   string keys of safe*Item / localStorage.* / storageGet|Set|Del calls
//   actionTypes   `<slice name>/<reducer key>` of every createSlice
//
//   node scripts/persisted-surface.mjs --write   regenerate scripts/persisted-surface-baseline.json
//   node scripts/persisted-surface.mjs --check   exit 1 and print added/removed entries on any difference
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'scripts', 'persisted-surface-baseline.json');
const MAX_DEPTH = 8;
const SAFE_KEY_FNS = new Set(['safeGetItem', 'safeSetItem', 'safeRemoveItem']);
const STORE_KEY_FNS = new Set(['storageGet', 'storageSet', 'storageDel']);
const LS_METHODS = new Set(['getItem', 'setItem', 'removeItem']);

const sorted = (set) => [...set].sort();
const calleeName = (call) =>
  ts.isIdentifier(call.expression) ? call.expression.text
  : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text
  : undefined;

/** @param {ts.Program} program @param {string[]} [skipped] filled with what could not be resolved */
export function collectSurface(program, skipped = []) {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf) && !/(\/__tests__\/|\.test\.tsx?$)/.test(sf.fileName),
  );
  const where = (node) => {
    const sf = node.getSourceFile();
    return `${sf.fileName}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  };

  // String values of an expression: literal types cover literals, const identifiers and unions of them.
  const stringValues = (expr) => {
    const t = checker.getTypeAtLocation(expr);
    const members = t.isUnion() ? t.types : [t];
    return members.every((m) => m.isStringLiteral()) ? members.map((m) => m.value) : undefined;
  };

  // Property paths of a type. `seen` holds the types on the current path (cycle cut).
  const typePaths = (root) => {
    const out = new Set();
    const walk = (type, prefix, depth, seen) => {
      if (depth > MAX_DEPTH) return;
      type = checker.getNonNullableType(type);
      if (type.isUnion()) {
        for (const m of type.types) walk(m, prefix, depth, seen);
        return;
      }
      if (seen.has(type)) return;
      const next = new Set(seen).add(type);
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        out.add(`${prefix}[]`);
        for (const el of checker.getTypeArguments(type)) walk(el, `${prefix}[]`, depth + 1, next);
        return;
      }
      if (type.getCallSignatures().length) return;
      const index = checker.getIndexInfosOfType(type);
      for (const info of index) walk(info.type, `${prefix}[*]`, depth + 1, next);
      for (const prop of checker.getPropertiesOfType(type)) {
        // Props declared only in lib/external typings (Date, Float32Array...) are not ours.
        const decls = prop.declarations ?? [];
        if (decls.length && decls.every((d) => program.isSourceFileDefaultLibrary(d.getSourceFile()) || d.getSourceFile().isDeclarationFile)) continue;
        const p = prefix ? `${prefix}.${prop.name}` : prop.name;
        out.add(p);
        const decl = prop.valueDeclaration ?? decls[0];
        if (decl) walk(checker.getTypeOfSymbolAtLocation(prop, decl), p, depth + 1, next);
      }
    };
    walk(root, '', 0, new Set());
    return out;
  };

  const projectPaths = new Set();
  const storedShapes = {};
  const zodKeys = new Set();
  const storageKeys = new Set();
  const actionTypes = new Set();

  // Storage keys of an expression, or undefined when it cannot be resolved. Template literals and `+`
  // concatenations are key families: string constants are inlined, anything else becomes `${…}`.
  // Const identifiers and single-`return` functions resolve through their initializer/returned
  // expression (parameters stay unresolved, so they become `${…}`). `seen` cuts recursion.
  const keyValues = (expr, seen = new Set()) => {
    while (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) expr = expr.expression;
    const part = (e) => keyValues(e, seen) ?? ['${…}'];
    const join = (lists) => lists.reduce((acc, l) => acc.flatMap((x) => l.map((y) => x + y)), ['']);
    if (ts.isTemplateExpression(expr)) {
      return join([[expr.head.text], ...expr.templateSpans.flatMap((sp) => [part(sp.expression), [sp.literal.text]])]);
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return join([part(expr.left), part(expr.right)]);
    }
    const literal = stringValues(expr);
    if (literal) return literal;
    let target;
    if (ts.isIdentifier(expr)) {
      const decl = checker.getSymbolAtLocation(expr)?.valueDeclaration;
      if (decl && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) target = [decl, decl.initializer];
    } else if (ts.isCallExpression(expr)) {
      const fn = checker.getResolvedSignature(expr)?.declaration;
      if (fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body) {
        const body = fn.body;
        const ret = !ts.isBlock(body) ? body : body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) ? body.statements[0].expression : undefined;
        if (ret) target = [fn, ret];
      }
    }
    if (!target || seen.has(target[0])) return undefined;
    return keyValues(target[1], new Set(seen).add(target[0]));
  };
  const addKeys = (expr, call) => {
    if (!expr) return undefined;
    let values = keyValues(expr);
    if (values?.some((v) => v.startsWith('${…}'))) values = undefined; // a bare parameter says nothing about the key
    if (values) values.forEach((v) => storageKeys.add(v));
    else skipped.push(`storage key not a literal: ${where(call)}`);
    return values;
  };

  const visit = (node) => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === 'VinaProject') {
      for (const p of typePaths(checker.getTypeAtLocation(node.name))) projectPaths.add(p);
    }
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const [a0, a1, a2] = node.arguments;
      let keys;
      if (SAFE_KEY_FNS.has(name)) addKeys(a0, node);
      else if (STORE_KEY_FNS.has(name)) keys = addKeys(a1, node);
      else if (ts.isPropertyAccessExpression(node.expression) && LS_METHODS.has(name) && node.expression.expression.getText().endsWith('localStorage')) addKeys(a0, node);

      if (name === 'storageSet' && a2 && keys) {
        // A primitive or opaque value has no paths worth tracking.
        const paths = typePaths(checker.getTypeAtLocation(a2));
        if (paths.size) for (const k of keys) for (const p of paths) (storedShapes[k] ??= new Set()).add(p);
      }

      if (name === 'createSlice' && a0 && ts.isObjectLiteralExpression(a0)) {
        const prop = (n) => a0.properties.find((p) => p.name && p.name.getText() === n);
        const nameProp = prop('name');
        const reducers = prop('reducers');
        const names = nameProp && ts.isPropertyAssignment(nameProp) && stringValues(nameProp.initializer);
        if (!names || !reducers || !ts.isPropertyAssignment(reducers)) skipped.push(`createSlice without literal name/reducers: ${where(node)}`);
        else {
          const rt = checker.getTypeAtLocation(reducers.initializer);
          if (rt.getCallSignatures().length) skipped.push(`createSlice reducers is a builder callback: ${where(node)}`);
          // Type-based, so object literals, spreads and identifiers resolve alike.
          else for (const sym of checker.getPropertiesOfType(rt)) actionTypes.add(`${names[0]}/${sym.name}`);
        }
      }

      // z.object({...}) in projectSchema.ts: key by the nearest enclosing variable.
      if (
        node.getSourceFile().fileName.endsWith('/src/utils/projectSchema.ts') &&
        ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'object' &&
        node.expression.expression.getText() === 'z' && a0 && ts.isObjectLiteralExpression(a0)
      ) {
        let up = node.parent;
        while (up && !ts.isVariableDeclaration(up)) up = up.parent;
        if (!up || !ts.isIdentifier(up.name)) skipped.push(`z.object outside a variable: ${where(node)}`);
        else for (const p of a0.properties) if (p.name) zodKeys.add(`${up.name.text}.${p.name.getText().replace(/^['"]|['"]$/g, '')}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const sf of files) visit(sf);

  return {
    projectPaths: sorted(projectPaths),
    storedShapes: Object.fromEntries(Object.keys(storedShapes).sort().map((k) => [k, sorted(storedShapes[k])])),
    zodKeys: sorted(zodKeys),
    storageKeys: sorted(storageKeys),
    actionTypes: sorted(actionTypes),
  };
}

function realProgram() {
  const cfgPath = path.join(ROOT, 'tsconfig.app.json');
  const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
  return ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options, projectReferences: cfg.projectReferences });
}

function diff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return { added: b.filter((x) => !sa.has(x)), removed: a.filter((x) => !sb.has(x)) };
}

function main() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') {
    console.error('usage: node scripts/persisted-surface.mjs --write | --check');
    process.exit(2);
  }
  const skipped = [];
  const surface = collectSurface(realProgram(), skipped);
  for (const s of skipped) console.warn(`skipped: ${s}`);
  if (mode === '--write') {
    fs.writeFileSync(BASELINE, JSON.stringify(surface, null, 2) + '\n');
    const counts = Object.entries(surface).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : Object.keys(v).length}`);
    console.log(`wrote ${path.relative(ROOT, BASELINE)} (${counts.join(', ')})`);
    return;
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  let bad = false;
  const report = (label, a, b) => {
    const { added, removed } = diff(a, b);
    if (!added.length && !removed.length) return;
    bad = true;
    console.error(label);
    added.forEach((x) => console.error(`  + ${x}`));
    removed.forEach((x) => console.error(`  - ${x}`));
  };
  for (const k of ['projectPaths', 'zodKeys', 'storageKeys', 'actionTypes']) report(k, base[k] ?? [], surface[k]);
  for (const k of new Set([...Object.keys(base.storedShapes ?? {}), ...Object.keys(surface.storedShapes)])) {
    report(`storedShapes.${k}`, base.storedShapes?.[k] ?? [], surface.storedShapes[k] ?? []);
  }
  if (bad) process.exit(1);
  console.log('persisted surface matches the baseline');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
