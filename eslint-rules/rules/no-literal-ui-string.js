/**
 * no-literal-ui-string — flags text a person reads that bypasses the catalog in `src/i18n`
 * (i18n spec § 8.1).
 *
 * Two kinds of error
 * ------------------
 * `literal`: a string or template literal with a letter sits where a person reads it.
 * `frozen`: the catalog is read at a moment that never re-runs, so the boot language sticks
 * after the person switches.
 *
 * Where a literal counts (positions 1-5)
 * --------------------------------------
 * 1. JSX text with a letter, and a literal directly inside a JSX expression container whose
 *    parent is an element or fragment.
 * 2. The JSX attributes `aria-label`, `aria-description`, `aria-roledescription`,
 *    `aria-valuetext`, `title`, `placeholder`, `alt` and `label`.
 * 3. A property keyed `label`, `name`, `title`, `description`, `message`, `placeholder`,
 *    `tooltip`, `actionLabel`, `hint` or `text`.
 * 4. An argument of `showToast`, `showErrorToast`, `showSuccessToast`, `showInfoToast` or
 *    `showUndoToast`, called bare or as a member.
 * 5. A module-level `const` object or array literal that the same file reads (`TABLE[x]`,
 *    `TABLE.x`) at a position 1-4: each letter-bearing literal inside it is reported. A table
 *    read only elsewhere (`IDS[k] === 'x'`) is not.
 *
 * At positions 1-4 the value is followed through the branches of a conditional (not its test),
 * both operands of `??` and `||`, and the right operand of `&&`; a template counts by its
 * static text.
 *
 * Frozen (position 6)
 * -------------------
 * A call of `t`, `displayShortcut`, `displayModifierKey`, `formatNumber`, `formatCount`,
 * `formatMedida` or `errorMessage` at module scope, inside a `useMemo` callback whose
 * dependency array is `[]`, inside a `useState(() => ...)` initializer, inside the
 * `reducers`/`extraReducers` of `createSlice`, or anywhere in a file under `src/workers/`.
 *
 * Skipped
 * -------
 * - A literal without a letter (`/\p{L}/u`).
 * - The subtree of a property named `copilot`: the model reads it, not a person.
 * - The `name` of the object passed to `createSlice`: a Redux slice name is an identifier.
 * - A node whose line, or the line above, carries `// i18n-ignore: <reason>`. A bare
 *   `// i18n-ignore` is reported itself (`ignoreWithoutReason`) and suppresses nothing.
 *
 * Known ceiling: a table is resolved only when its binding is a module-level `const` in the
 * same file; one imported from elsewhere is not seen.
 *
 * @type {import('eslint').Rule.RuleModule}
 */

const ATTRIBUTES = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext',
  'title', 'placeholder', 'alt', 'label',
]);
const PROPERTIES = new Set([
  'label', 'name', 'title', 'description', 'message', 'placeholder',
  'tooltip', 'actionLabel', 'hint', 'text',
]);
const TOASTS = new Set(['showToast', 'showErrorToast', 'showSuccessToast', 'showInfoToast', 'showUndoToast']);
const CATALOG_READERS = new Set([
  't', 'displayShortcut', 'displayModifierKey', 'formatNumber', 'formatCount', 'formatMedida', 'errorMessage',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const LETTER = /\p{L}/u;
const IGNORE_ANY = /^\s*i18n-ignore(?![\w-])/;
const IGNORE_WITH_REASON = /^\s*i18n-ignore:\s*\S/;

const keyName = (prop) => {
  if (prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return String(prop.key.value);
  return null;
};

/** Callee name of `f(...)` or `x.f(...)`. */
const calleeName = (call) => {
  const c = call.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') return c.property.name;
  return null;
};

/** The text of a string or template literal, or null when the node is neither. */
const staticText = (node) => {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
  return null;
};

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Text a person reads goes through the catalog in src/i18n, and is read when it is shown.',
    },
    schema: [],
    messages: {
      literal: 'Text a person reads goes through the catalog (src/i18n): {{text}}',
      frozen: '{{callee}} reads the catalog when called; calling it here freezes the boot language',
      ignoreWithoutReason: '`// i18n-ignore` needs a reason: `// i18n-ignore: <reason>`',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const filename = (context.filename ?? '').split('\\').join('/');
    const inWorker = /(^|\/)src\/workers\//.test(filename);

    // Lines covered by a reasoned ignore; a bare one is reported and covers nothing.
    const ignored = new Set();
    for (const c of sourceCode.getAllComments()) {
      if (!IGNORE_ANY.test(c.value)) continue;
      if (IGNORE_WITH_REASON.test(c.value)) ignored.add(c.loc.end.line);
      else context.report({ loc: c.loc, messageId: 'ignoreWithoutReason' });
    }

    const reported = new Set();

    function report(node, messageId, data) {
      if (reported.has(node)) return;
      const line = node.loc.start.line;
      if (ignored.has(line) || ignored.has(line - 1)) return;
      // The copilot subtree is read by the model.
      const inCopilot = sourceCode
        .getAncestors(node)
        .some((a) => a.type === 'Property' && keyName(a) === 'copilot');
      if (inCopilot) return;
      reported.add(node);
      context.report({ node, messageId, data });
    }

    function reportText(node) {
      const text = staticText(node);
      if (text !== null && LETTER.test(text)) report(node, 'literal', { text: text.trim() });
    }

    /** Every letter-bearing literal held by a table (object or array literal). */
    function reportTable(node) {
      if (node.type === 'ObjectExpression') {
        for (const p of node.properties) if (p.type === 'Property') reportTable(p.value);
      } else if (node.type === 'ArrayExpression') {
        for (const e of node.elements) if (e) reportTable(e);
      } else if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
        reportTable(node.expression);
      } else {
        reportText(node);
      }
    }

    /** `TABLE[x]` / `TABLE.x`, where TABLE is a module-level const object or array. */
    function readTable(member) {
      let obj = member.object;
      while (obj.type === 'MemberExpression') obj = obj.object;
      if (obj.type !== 'Identifier') return;
      for (let scope = sourceCode.getScope(member); scope; scope = scope.upper) {
        const variable = scope.set.get(obj.name);
        if (!variable) continue;
        const def = variable.defs[0];
        if (scope.type !== 'module' && scope.type !== 'global') return;
        if (!def || def.type !== 'Variable' || def.parent.kind !== 'const' || !def.node.init) return;
        reportTable(def.node.init);
        return;
      }
    }

    /** A value that reaches a person: follow the branches, report literals, resolve tables. */
    function checkValue(node) {
      if (!node) return;
      switch (node.type) {
        case 'ConditionalExpression':
          checkValue(node.consequent);
          checkValue(node.alternate);
          break;
        case 'LogicalExpression':
          if (node.operator !== '&&') checkValue(node.left);
          checkValue(node.right);
          break;
        case 'TSAsExpression':
        case 'TSNonNullExpression':
        case 'TSSatisfiesExpression':
          checkValue(node.expression);
          break;
        case 'MemberExpression':
          readTable(node);
          break;
        default:
          reportText(node);
      }
    }

    function isFrozen(call) {
      if (inWorker) return true;
      const ancestors = sourceCode.getAncestors(call); // outermost first
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        // reducers / extraReducers of createSlice({ ... })
        if (a.type === 'Property' && ['reducers', 'extraReducers'].includes(keyName(a))) {
          const owner = ancestors[i - 2];
          if (owner?.type === 'CallExpression' && calleeName(owner) === 'createSlice') return true;
        }
      }
      for (let i = ancestors.length - 1; i >= 0; i--) {
        if (!FUNCTIONS.has(ancestors[i].type)) continue;
        const fn = ancestors[i];
        const parent = ancestors[i - 1];
        if (parent?.type !== 'CallExpression' || parent.arguments[0] !== fn) return false;
        const name = calleeName(parent);
        if (name === 'useState') return true;
        const deps = parent.arguments[1];
        return name === 'useMemo' && deps?.type === 'ArrayExpression' && deps.elements.length === 0;
      }
      return true; // module scope
    }

    return {
      JSXText(node) {
        if (LETTER.test(node.value)) report(node, 'literal', { text: node.value.trim() });
      },

      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXElement' || node.parent.type === 'JSXFragment') checkValue(node.expression);
      },

      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !ATTRIBUTES.has(node.name.name) || !node.value) return;
        if (node.value.type === 'JSXExpressionContainer') checkValue(node.value.expression);
        else checkValue(node.value);
      },

      Property(node) {
        const key = keyName(node);
        if (!PROPERTIES.has(key)) return;
        const owner = node.parent.parent;
        if (
          key === 'name' &&
          node.parent.type === 'ObjectExpression' &&
          owner?.type === 'CallExpression' &&
          calleeName(owner) === 'createSlice' &&
          owner.arguments.includes(node.parent)
        ) {
          return;
        }
        checkValue(node.value);
      },

      CallExpression(node) {
        const name = calleeName(node);
        if (TOASTS.has(name)) node.arguments.forEach(checkValue);
        if (node.callee.type === 'Identifier' && CATALOG_READERS.has(node.callee.name) && isFrozen(node)) {
          report(node, 'frozen', { callee: node.callee.name });
        }
      },
    };
  },
};
