/**
 * require-use-disposable — flags `useMemo` callbacks that construct a Three.js
 * disposable resource without an adjacent `useDisposable(value)` registration.
 *
 * Background
 * ----------
 * The C1 RFC (`docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md`) ratified
 * `useDisposable(value)` (`src/components/Viewport3D/hooks/useDisposable.ts`)
 * as the canonical helper for cleaning up Three.js resources created in a
 * `useMemo`. Today enforcement is via code review + CLAUDE.md anchor + JSDoc
 * on the hook. This rule closes the mechanical gap for new sites.
 *
 * What it detects
 * ---------------
 * For each `useMemo(() => …)` whose result is assigned to a single identifier
 * `X`, if the immediate body of the callback constructs a Three.js disposable
 * (a `new THREE.<Suffix>(…)` where `<Suffix>` ends in `Geometry`, `Material`,
 * `Texture`, or `RenderTarget`), require that the enclosing function scope
 * contains `useDisposable(X)`.
 *
 * Out of scope (deliberate false negatives, not bugs)
 * ---------------------------------------------------
 * - Module-level singletons (`const FOO = new THREE.X()` outside any
 *   component): never inspected — no surrounding `useMemo`.
 * - Function-scoped transient (helper that creates + disposes locally):
 *   never inspected — no surrounding `useMemo`.
 * - `useEffect`-based material/texture lifecycle (RFC § 1.2 out of scope):
 *   not a `useMemo`, never inspected.
 * - Wrapper-object `useMemo` shape (e.g. `const { fineGeo, sectionGeo } =
 *   useMemo(() => ({ fineGeo: …, sectionGeo: … }), [])` in `FloorGrid`):
 *   `useMemo` result is destructured (`ObjectPattern`), not a single
 *   `Identifier`. Skipped — false negative documented as v1 limitation.
 *   The 2 canonical wrapper-object sites (`FloorGrid`, `GarmentSimulation`
 *   `staticGeometry`) already register `useDisposable` on each destructured
 *   property; the rule simply doesn't enforce it.
 * - Aliased namespace imports (`import * as T from 'three'`) and named
 *   imports (`import { BufferGeometry } from 'three'`): only `THREE.<X>` is
 *   detected. Aliases produce false negatives. The 7 canonical sites all use
 *   `import * as THREE from 'three'`.
 * - Nested helper functions defined inside the `useMemo` body: detection
 *   bails at function-defining nodes (`FunctionExpression`,
 *   `ArrowFunctionExpression`, `FunctionDeclaration`). This is what allows
 *   `FloorGrid`'s `buildGeo` helper to remain unflagged.
 *
 * Why `THREE.Mesh` is omitted from the detected suffixes
 * ------------------------------------------------------
 * The follow-up issue (#674) lists `THREE.Mesh` as a target. `THREE.Mesh` has
 * no `dispose()` method — calling `mesh.dispose()` is a no-op. The GPU
 * resources held by a Mesh live on its `geometry` and `material`, both of
 * which already carry their own `dispose()` and would be detected by the
 * suffix regex if constructed inside a `useMemo`. Including `Mesh` would
 * produce false positives at every callsite that creates a Mesh from
 * externally-managed geometry/material. Decision documented in PR body.
 *
 * Severity ramp
 * -------------
 * Initial severity is `warn`, per RFC § 7 reopen trigger #3 ("lint rule under
 * E generates >5% false positives after 1 month warning-only — reopen…").
 * Promotion to `error` (or `--max-warnings=0` in CI) is a follow-up after the
 * 1-month observation window.
 *
 * @type {import('eslint').Rule.RuleModule}
 */

const DISPOSABLE_SUFFIX_REGEX = /(Geometry|Material|Texture|RenderTarget)$/;

const FUNCTION_NODE_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

function isDisposableNewExpression(node) {
  if (!node || node.type !== 'NewExpression') return false;
  const callee = node.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.object.name !== 'THREE' ||
    callee.property.type !== 'Identifier'
  ) {
    return false;
  }
  return DISPOSABLE_SUFFIX_REGEX.test(callee.property.name);
}

/**
 * Walks `node` and all descendants without crossing into nested function
 * bodies. Returns true on the first matching `new THREE.<Disposable>(…)`.
 */
function containsDisposableInScope(node) {
  if (!node || typeof node !== 'object') return false;
  if (FUNCTION_NODE_TYPES.has(node.type)) return false;
  if (isDisposableNewExpression(node)) return true;

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const sub of child) {
        if (sub && typeof sub === 'object' && sub.type && containsDisposableInScope(sub)) {
          return true;
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (containsDisposableInScope(child)) return true;
    }
  }
  return false;
}

/**
 * Walks `node` and all descendants without crossing into nested function
 * bodies. Returns true on the first `useDisposable(<targetName>)` call.
 */
function hasUseDisposableCall(node, targetName) {
  if (!node || typeof node !== 'object') return false;
  if (FUNCTION_NODE_TYPES.has(node.type)) return false;
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'useDisposable' &&
    node.arguments.length >= 1 &&
    node.arguments[0].type === 'Identifier' &&
    node.arguments[0].name === targetName
  ) {
    return true;
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const sub of child) {
        if (sub && typeof sub === 'object' && sub.type && hasUseDisposableCall(sub, targetName)) {
          return true;
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (hasUseDisposableCall(child, targetName)) return true;
    }
  }
  return false;
}

function findEnclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (FUNCTION_NODE_TYPES.has(cur.type)) return cur;
    cur = cur.parent;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce useDisposable() registration for Three.js disposable resources created in useMemo (C1 RFC ratified pattern).',
      url: 'https://github.com/sssamuelll/vina/issues/674',
    },
    schema: [],
    messages: {
      missingUseDisposable:
        'Three.js disposable "{{name}}" created in useMemo without useDisposable({{name}}) registration. Add `useDisposable({{name}});` after the useMemo. See C1 RFC (docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'useMemo' ||
          node.arguments.length === 0
        ) {
          return;
        }

        const callback = node.arguments[0];
        if (
          callback.type !== 'ArrowFunctionExpression' &&
          callback.type !== 'FunctionExpression'
        ) {
          return;
        }

        if (!containsDisposableInScope(callback.body)) return;

        const parent = node.parent;
        if (!parent || parent.type !== 'VariableDeclarator') return;
        if (parent.id.type !== 'Identifier') return;

        const resultName = parent.id.name;

        const enclosingFunction = findEnclosingFunction(node);
        if (!enclosingFunction || !enclosingFunction.body) return;

        if (hasUseDisposableCall(enclosingFunction.body, resultName)) return;

        context.report({
          node,
          messageId: 'missingUseDisposable',
          data: { name: resultName },
        });
      },
    };
  },
};
