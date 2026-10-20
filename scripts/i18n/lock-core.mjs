// The translation lock (spec § 7.3): hashes of catalog entries read from the TypeScript AST, and the
// states and stamping built on them. Shared by scripts/i18n/lock.mjs and tests/repo/i18n-lock.test.ts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEFAULT_ROOT = fileURLToPath(new URL('../../src/i18n', import.meta.url));
const LOCALES = ['en', 'es', 'de'];

const unwrap = (n) => {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
  return n;
};
const isFn = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n);
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}

// Is this identifier a property name rather than a reference or a declaration of a binding?
const isPropertyName = (id) => {
  const p = id.parent;
  return (
    (ts.isPropertyAccessExpression(p) && p.name === id) ||
    (ts.isPropertyAssignment(p) && p.name === id) ||
    (ts.isPropertySignature(p) && p.name === id) ||
    (ts.isQualifiedName(p) && p.right === id)
  );
};

function leaves(node, sf, out = []) {
  const kids = node.getChildren(sf);
  if (kids.length) kids.forEach((k) => leaves(k, sf, out));
  else if (node.kind !== ts.SyntaxKind.SyntaxList) out.push(node);
  return out;
}

export function entryHash(node) {
  const sf = node.getSourceFile();
  const params = new Map();
  if (isFn(node)) node.parameters.forEach((p) => bindingNames(p.name).forEach((n) => params.set(n, `$${params.size}`)));
  const closers = new Set([ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.CloseBracketToken]);
  const toks = [];
  const ls = leaves(node, sf);
  ls.forEach((t, i) => {
    if (t.kind === ts.SyntaxKind.CommaToken && ls[i + 1] && closers.has(ls[i + 1].kind)) return;
    if (ts.isStringLiteral(t)) toks.push(`S${JSON.stringify(t.text)}`);
    else if (ts.isTemplateLiteralToken(t)) toks.push(`T${t.kind}${JSON.stringify(t.text.replace(/\r\n/g, '\n'))}`);
    else if (ts.isIdentifier(t) && params.has(t.text) && !isPropertyName(t)) toks.push(params.get(t.text));
    else toks.push(`${t.kind}:${t.getText(sf)}`);
  });
  return createHash('sha256').update(JSON.stringify(toks)).digest('hex');
}

function topLevelNames(sf) {
  const names = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      if (c.name) names.add(c.name.text);
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) names.add(c.namedBindings.name.text);
        else c.namedBindings.elements.forEach((e) => names.add(e.name.text));
      }
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        // names destructured from helpers('<locale>') are the allowed ones
        if (init && ts.isCallExpression(init) && init.expression.getText(sf) === 'helpers') continue;
        bindingNames(d.name).forEach((n) => names.add(n));
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) names.add(st.name.text);
  }
  return names;
}

function foreignRefs(node, sf, top) {
  if (!isFn(node)) return [];
  const local = new Set();
  const visit = (n) => {
    if (ts.isParameter(n) || ts.isVariableDeclaration(n)) bindingNames(n.name).forEach((x) => local.add(x));
    if (ts.isFunctionExpression(n) && n.name) local.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
  const found = new Set();
  const refs = (n) => {
    if (ts.isTypeNode(n)) return;
    if (ts.isIdentifier(n) && !isPropertyName(n) && top.has(n.text) && !local.has(n.text)) found.add(n.text);
    ts.forEachChild(n, refs);
  };
  refs(node);
  return [...found].sort();
}

// Comments tied to a property: on its own lines (after the entry, also after the comma) or above it.
function commentsOf(prop, sf) {
  const text = sf.text;
  const after = text[prop.end] === ',' ? prop.end + 1 : prop.end;
  const ranges = [
    ...(ts.getLeadingCommentRanges(text, prop.getFullStart()) ?? []),
    ...(ts.getTrailingCommentRanges(text, after) ?? []),
  ];
  return ranges.map((r) => text.slice(r.pos, r.end).replace(/^\/\/\s*|^\/\*\s*|\s*\*\/$/g, '').trim());
}

function propName(prop, file, sf) {
  const n = prop.name;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  throw new Error(`cannot walk ${file}:${lineOf(sf, prop)}`);
}

function walkObject(obj, prefix, ctx, out) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) throw new Error(`cannot walk ${ctx.file}:${lineOf(ctx.sf, prop)}`);
    const key = `${prefix}.${propName(prop, ctx.file, ctx.sf)}`;
    const value = unwrap(prop.initializer);
    if (ts.isObjectLiteralExpression(value)) {
      walkObject(value, key, ctx, out);
      continue;
    }
    const isFunction = isFn(value);
    const isString = ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value);
    if (!isFunction && !isString && !ts.isTemplateExpression(value)) {
      throw new Error(`cannot walk ${ctx.file}:${lineOf(ctx.sf, prop)}`);
    }
    let sameAsEn = null;
    const glossaryExempt = [];
    for (const c of commentsOf(prop, ctx.sf)) {
      const s = /^same-as-en:\s*(.*)$/.exec(c);
      if (s) sameAsEn = s[1].trim();
      const g = /^glossary-exempt:\s*(.*?)\s+—\s+(.*)$/.exec(c);
      if (g) glossaryExempt.push({ term: g[1], reason: g[2] });
    }
    out.set(key, {
      hash: entryHash(value),
      text: isString ? value.text : value.getText(ctx.sf),
      isFunction,
      sameAsEn,
      glossaryExempt,
      foreignRefs: foreignRefs(value, ctx.sf, ctx.top),
    });
  }
}

export function readCatalog(locale, root = DEFAULT_ROOT) {
  const out = new Map();
  const dir = join(root, locale);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts').sort()) {
    const file = join(dir, name);
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const ctx = { file, sf, top: topLevelNames(sf) };
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const d of st.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        if (init && ts.isObjectLiteralExpression(init) && ts.isIdentifier(d.name)) walkObject(init, d.name.text, ctx, out);
      }
    }
  }
  return out;
}

const recordOf = (lock, key, locale) => lock.entries[key]?.[locale];

function stateOf(lock, catalogs, key, locale) {
  const rec = recordOf(lock, key, locale);
  if (!rec) return 'unstamped';
  const cur = catalogs[locale].get(key);
  const en = catalogs.en.get(key);
  if (!cur) return 'untranslated';
  if (locale !== 'en' && en && cur.text === en.text && !cur.sameAsEn) return 'untranslated';
  if (locale !== 'en' && en && rec.sourceHash !== en.hash) return 'stale';
  const esRec = recordOf(lock, key, 'es');
  const es = catalogs.es.get(key);
  if (locale !== 'es' && esRec?.signed && es && rec.esHash !== es.hash) return 'stale';
  if (!rec.reviewedBy || rec.reviewedHash !== rec.hash || rec.hash !== cur.hash) return 'unreviewed';
  return 'ok';
}

export function lockStatus(lock, catalogs) {
  const keys = new Set(LOCALES.flatMap((l) => [...catalogs[l].keys()]));
  return [...keys].sort().flatMap((key) => LOCALES.map((locale) => ({ key, locale, state: stateOf(lock, catalogs, key, locale) })));
}

function written(lock, catalogs, key, locale, extra) {
  const cur = catalogs[locale].get(key);
  const old = recordOf(lock, key, locale) ?? {};
  const rec = { hash: cur.hash };
  if (locale !== 'en') rec.sourceHash = catalogs.en.get(key).hash;
  if (locale !== 'es' && recordOf(lock, key, 'es')?.signed && catalogs.es.get(key)) rec.esHash = catalogs.es.get(key).hash;
  for (const f of ['reviewedBy', 'reviewedAt', 'reviewedHash', 'signed']) if (old[f] !== undefined) rec[f] = old[f];
  if (extra?.reason) rec.reason = extra.reason;
  return rec;
}

export function stamp(lock, catalogs, target, opts = {}) {
  const next = structuredClone(lock);
  const isKey = target.includes('.');
  const keys = [...new Set(LOCALES.flatMap((l) => [...catalogs[l].keys()]))].filter((k) =>
    isKey ? k === target : k.startsWith(`${target}.`),
  );
  if (!keys.length) throw new Error(`nothing to stamp for "${target}"`);
  for (const key of keys) {
    const needsReason = new Set();
    if (isKey) {
      // en counts too: for a signed key it is a translation of the Spanish (spec § 7.3)
      for (const l of LOCALES) {
        const rec = recordOf(next, key, l);
        const cur = catalogs[l].get(key);
        if (rec && cur && stateOf(next, catalogs, key, l) === 'stale' && cur.hash === rec.hash) needsReason.add(l);
      }
      if (needsReason.size && !opts.reason) {
        throw new Error(`${key}: ${[...needsReason].join(', ')} stale with an unchanged translation; pass a reason to acknowledge it`);
      }
    }
    for (const locale of LOCALES) {
      if (!catalogs[locale].has(key)) continue;
      if (!isKey && recordOf(next, key, locale)) continue;
      next.entries[key] ??= {};
      next.entries[key][locale] = written(next, catalogs, key, locale, needsReason.has(locale) ? opts : null);
    }
  }
  return next;
}

export function markReviewed(lock, catalogs, key, locale, reviewer, date) {
  const rec = recordOf(lock, key, locale);
  const cur = catalogs[locale].get(key);
  if (!rec || !cur) throw new Error(`${locale}:${key} is not stamped`);
  const next = structuredClone(lock);
  Object.assign(next.entries[key][locale], { reviewedBy: reviewer, reviewedAt: date, reviewedHash: cur.hash });
  return next;
}
