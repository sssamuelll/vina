#!/usr/bin/env node
/**
 * string-census — finds the literal text a person reads in the source.
 *
 * Four positions count: JSX text, a few JSX attributes, properties with a
 * display-like key, and toast arguments. A `copilot` property subtree and any
 * literal without a letter are skipped. Text in files that feed the model
 * (not the user) is flagged `modelFacing` so the bundle ceiling ignores it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const MODEL_FACING_PATHS = [
  'src/copilot/action/tools/definitions/',
  'src/copilot/reasoning/bridge/',
  'src/copilot/llm/',
  'src/copilot/perception/',
  'src/copilot/reasoning/proactiveAnalysis.ts',
];

const ATTRS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label']);
const KEYS = new Set(['label', 'name', 'title', 'description', 'message', 'placeholder', 'tooltip', 'actionLabel', 'hint', 'text']);
const TOASTS = new Set(['showToast', 'showErrorToast', 'showSuccessToast', 'showInfoToast', 'showUndoToast']);
const LETTER = /\p{L}/u;

function isModelFacing(file) {
  const p = '/' + file.replaceAll('\\', '/');
  return MODEL_FACING_PATHS.some((m) => (m.endsWith('/') ? p.includes('/' + m) : p.endsWith('/' + m)));
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => s.literal.text).join('');
  return undefined;
}

const nameOf = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined);

export function defaultFiles() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', 'src'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/(^|\/)__tests__\//.test(f) && !/\.(test|spec)\./.test(f))
    .map((f) => join(ROOT, f));
}

export function collectCandidates(files = defaultFiles()) {
  const out = [];
  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const modelFacing = isModelFacing(file);
    const add = (pos, offset, position, raw) => {
      const text = raw.trim();
      if (!LETTER.test(text)) return;
      const line = sf.getLineAndCharacterOfPosition(pos + offset).line + 1;
      out.push({ file, line, position, text, modelFacing });
    };
    // A literal inside a branch counts at the position of the expression holding it.
    const addLiteral = (node, position) => {
      const op = ts.isBinaryExpression(node) ? node.operatorToken.kind : undefined;
      if (ts.isParenthesizedExpression(node)) return addLiteral(node.expression, position);
      if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse].forEach((n) => addLiteral(n, position));
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return addLiteral(node.right, position);
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return [node.left, node.right].forEach((n) => addLiteral(n, position));
      const raw = literalText(node);
      if (raw !== undefined) add(node.getStart(sf), 0, position, raw);
    };
    // createSlice({ name }) is a Redux identifier, not text.
    const isSliceName = (prop) => {
      const call = prop.parent.parent;
      if (!call || !ts.isCallExpression(call) || !call.arguments.includes(prop.parent)) return false;
      const c = call.expression;
      return (ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '') === 'createSlice';
    };
    const visit = (node) => {
      if (ts.isPropertyAssignment(node)) {
        const key = nameOf(node.name);
        if (key === 'copilot') return;
        if (KEYS.has(key) && !(key === 'name' && isSliceName(node))) addLiteral(node.initializer, 'property');
      } else if (ts.isJsxText(node)) {
        add(node.pos, node.text.length - node.text.trimStart().length, 'jsx-text', node.text);
      } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        addLiteral(node.expression, 'jsx-text');
      } else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (init) addLiteral(init, 'jsx-attr');
      } else if (ts.isCallExpression(node)) {
        const c = node.expression;
        const callee = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
        if (TOASTS.has(callee)) node.arguments.forEach((a) => addLiteral(a, 'toast'));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}
