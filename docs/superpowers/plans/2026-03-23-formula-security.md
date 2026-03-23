# Safe Formula Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dynamic code construction in both formula evaluators with a recursive descent parser, eliminating the code injection attack surface.

**Architecture:** One shared `safeEval` parser with tokenizer + recursive descent evaluator. Two thin adapter layers (`formulaEngine.ts` and `seamly2d/formulaEvaluator.ts`) keep their existing APIs and delegate to `safeEval`. No external dependencies.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-formula-security-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/utils/formula/safeEval.ts` | Recursive descent parser (~200 lines). Tokenizer + evaluator. |
| `src/utils/formula/__tests__/safeEval.test.ts` | Exhaustive parser tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/utils/formula/formulaEngine.ts` | Replace dynamic code block with `safeEval` call |
| `src/utils/seamly2d/formulaEvaluator.ts` | Replace dynamic code + regex checks with `safeEval`, fix silent zero fallbacks, simplify alias rewriting |

---

## Task 1: Implement `safeEval` — recursive descent parser

**Files:**
- Create: `src/utils/formula/safeEval.ts`
- Create: `src/utils/formula/__tests__/safeEval.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/formula/__tests__/safeEval.test.ts` with comprehensive tests covering:

- **Arithmetic** (7 tests): addition, subtraction, multiplication, division, modulo, precedence, decimals
- **Parentheses** (2 tests): grouping, nested
- **Unary** (5 tests): negative, double negative, negation of parens, unary plus, logical not
- **Comparison** (6 tests): `<`, `>`, `>=`, `<=`, `==`, `!=` — return 1 or 0
- **Boolean** (4 tests): `&&`, `||` with truthy/falsy values
- **Ternary** (4 tests): true branch, false branch, nested, short-circuit (`0 > 0 ? 1/0 : 42` must return 42 without throwing)
- **Functions** (12 tests): `sqrt`, `abs`, `min`, `max`, `round`, `floor`, `ceil`, `pow`, `sin`, `cos`, `atan2`, `sign`
- **Constants** (2 tests): `PI`, `PI * 2`
- **Variables** (3 tests): `x + y`, `chest / 4 + 2`, `E` as variable name
- **allowedFunctions** (2 tests): restricted set rejects disallowed, allows listed
- **Errors** (7 tests): empty string, unknown variable, unknown function, syntax error, unclosed paren, division by zero, modulo by zero
- **Security** (2 tests): globals (window, document, globalThis), constructor — all throw `Undefined variable`

Import signature: `import { safeEval } from '../safeEval';`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/formula/__tests__/safeEval.test.ts`
Expected: FAIL — `safeEval` not found

- [ ] **Step 3: Implement `safeEval`**

Create `src/utils/formula/safeEval.ts`. The file contains:

**Tokenizer** — converts input string to Token array:
- Token types: `number`, `ident`, `op`, `paren`, `comma`, `eof`
- Numbers: `[0-9]+(\.[0-9]+)?` and `.5` style
- Identifiers: Unicode-aware `[\p{L}_][\p{L}\p{N}_]*`
- Two-char operators: `==`, `!=`, `<=`, `>=`, `&&`, `||`
- Single-char operators: `+-*/%<>!=?:`
- Parentheses: `(`, `)`
- Comma: `,`

**Parser class** — recursive descent with these methods matching the grammar:
- `parse()` → calls `expression()`, expects EOF
- `expression()` → `ternary()`
- `ternary()` → `or()`, then if `?`: short-circuit evaluate only taken branch, skip other
- `or()` → `and()` with `||` short-circuit
- `and()` → `comparison()` with `&&` short-circuit
- `comparison()` → `addition()` with one optional comparison op. If a second comparison follows at EOF check, throw helpful chained-comparison error.
- `addition()` → `multiplication()` with `+`/`-`
- `multiplication()` → `unary()` with `*`/`/`/`%`. Division/modulo by zero throws immediately.
- `unary()` → handles `+`, `-`, `!` prefix
- `call()` → if IDENT followed by `(`, parse as function call with arg list. Validates against allowed function whitelist. Calls the corresponding `Math.*` function.
- `primary()` → NUMBER literal, IDENT (resolve from constants then variables, throw if undefined), or parenthesized expression

**Public API:**
```typescript
export function safeEval(
  expr: string,
  vars: Record<string, number> = {},
  allowedFunctions?: string[],
): number
```
- Throws on empty input, syntax errors, unknown variables/functions, division by zero, NaN result
- Default `allowedFunctions` is the full set of 16 math functions
- Constants: only `PI`

**Internal constants:**
- `ALL_FUNCTIONS`: array of 16 function names
- `CONSTANTS`: `{ PI: Math.PI }`
- `MATH_FNS`: maps function names to `Math.*` implementations

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/formula/__tests__/safeEval.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/formula/safeEval.ts src/utils/formula/__tests__/safeEval.test.ts
git commit -m "feat: implement safeEval recursive descent parser (#398)"
```

---

## Task 2: Migrate `formulaEngine.ts` to use `safeEval`

**Files:**
- Modify: `src/utils/formula/formulaEngine.ts`
- Test: `src/__tests__/formula.test.ts` (must continue passing — 10 tests)

- [ ] **Step 1: Run existing tests to confirm baseline**

Run: `npx vitest run src/__tests__/formula.test.ts`
Expected: PASS — all 10 tests green

- [ ] **Step 2: Read and modify `formulaEngine.ts`**

Read the file first. Then make these changes:

1. Add import: `import { safeEval } from './safeEval';`

2. Add constant: `const RESTRICTED_FUNCTIONS = ['min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt'];`

3. In `evaluateFormula()`, the current code at lines 123-134 builds an expression string, does a regex sanitization check, then uses dynamic code construction, then checks isFinite. Replace all of that (lines 123-134) with:

```typescript
    const expr = exprParts.join(' ');

    try {
      const result = safeEval(expr, {}, RESTRICTED_FUNCTIONS);
      return { value: result };
    } catch (evalErr) {
      return { value: NaN, error: evalErr instanceof Error ? evalErr.message : 'Evaluation error' };
    }
```

This removes: the regex sanitization check (line 125), the dynamic code construction (lines 129-130), and the isFinite check (lines 132-134). The `safeEval` parser handles all validation internally.

The tokenizer, `getFormulaVariables`, and `validateFormula` are unchanged.

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run src/__tests__/formula.test.ts`
Expected: PASS — all 10 tests still green

- [ ] **Step 4: Verify no dynamic code construction remains**

Run: `grep -rn "new Function" src/utils/formula/formulaEngine.ts` (use Grep tool)
Expected: No matches

- [ ] **Step 5: Commit**

```bash
git add src/utils/formula/formulaEngine.ts
git commit -m "fix(security): replace dynamic code construction with safeEval in formulaEngine (#398)"
```

---

## Task 3: Migrate `seamly2d/formulaEvaluator.ts` to use `safeEval`

**Files:**
- Modify: `src/utils/seamly2d/formulaEvaluator.ts`
- Test: `src/utils/seamly2d/__tests__/formulaEvaluator.test.ts` (must continue passing)

- [ ] **Step 1: Run existing tests to confirm baseline**

Run: `npx vitest run src/utils/seamly2d/__tests__/formulaEvaluator.test.ts`
Expected: PASS

- [ ] **Step 2: Read and modify `formulaEvaluator.ts`**

Read the file first. Then make these changes:

1. Add import: `import { safeEval } from '../formula/safeEval';`

2. Delete `SAFE_FORMULA_RE` constant (line 18) — no longer needed.

3. **Fix silent zero fallbacks:**
   - Line 40: change `return '0';` to `throw new Error(\`Unknown variable: \${match}\`);`
   - Line 50: change `return '0';` to `throw new Error(\`Unknown measurement: @\${name}\`);`

4. **Simplify alias rewriting** (lines 82-91). The current code does a complex two-stage alias dance with `__ROUND__` and `__SIGN__` placeholders, then maps all math functions to `Math.*`. Replace all of lines 82-91 with:
```typescript
  // Replace Seamly2D-specific math function aliases
  expr = expr.replace(/\brint\b/g, 'round');
  // 'sign' maps directly — no rewrite needed
  // Math function names pass through as-is — safeEval resolves them internally
```

5. **Remove lines 93-116** (regex safety check, assignment operator check, dynamic code construction block). Replace with:
```typescript
  try {
    const result = safeEval(expr);
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula did not evaluate to a finite number: ${formula} → ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to evaluate formula "${formula}" (resolved: "${expr}"): ${(err as Error).message}`);
  }
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run src/utils/seamly2d/__tests__/formulaEvaluator.test.ts`
Expected: PASS

- [ ] **Step 4: Verify no dynamic code construction remains**

Run: `grep -rn "new Function" src/utils/seamly2d/formulaEvaluator.ts` (use Grep tool)
Expected: No matches

- [ ] **Step 5: Commit**

```bash
git add src/utils/seamly2d/formulaEvaluator.ts
git commit -m "fix(security): replace dynamic code construction with safeEval in seamly2d evaluator (#398)"
```

---

## Task 4: Final verification — no dynamic code construction anywhere

**Files:** All formula-related files

- [ ] **Step 1: Grep for remaining dynamic code construction**

Search across all formula-related production code for `new Function` or `eval(`. Exclude test files and node_modules.

Expected: Zero matches in production code.

- [ ] **Step 2: Run all formula-related tests together**

Run: `npx vitest run src/utils/formula/__tests__/safeEval.test.ts src/__tests__/formula.test.ts src/utils/seamly2d/__tests__/formulaEvaluator.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS (or only pre-existing failures unrelated to formula changes)

- [ ] **Step 4: Commit if any fixes needed**

Only if fixes were required:
```bash
git add -A
git commit -m "fix: resolve integration issues in formula security migration (#398)"
```
