# Safe Formula Evaluator — Design Spec

> Issue #398 · Audit Finding #06 — [HIGH] [SEC]

## Overview

Replace dynamic code construction in both formula evaluators with a hand-rolled recursive descent parser. Zero dependencies, zero eval, ~200 lines.

## Architecture

One shared safe evaluator, two thin adapters:

```
┌─────────────────────────────────────────────┐
│  safeEval (src/utils/formula/safeEval.ts)    │
│  ─ tokenizer → recursive descent parser      │
│  ─ no dynamic code construction              │
│  ─ numbers, +−*/%, parens, ternary (?:),     │
│    comparisons, boolean (&&, ||, !),         │
│    function calls, variable references       │
└──────────────┬──────────────┬───────────────┘
               │              │
    ┌──────────┴──┐    ┌──────┴──────────────┐
    │ formulaEngine│    │ seamly2d adapter     │
    │ (thin wrap)  │    │ (variable resolution │
    │              │    │  + Seamly2D syntax)  │
    └─────────────┘    └──────────────────────┘
```

- **`src/utils/formula/safeEval.ts`** — new recursive descent parser. Pure function: `safeEval(expr: string, vars?: Record<string, number>): number`. No external dependencies. No dynamic code construction.
- **`src/utils/formula/formulaEngine.ts`** — keeps current API (`evaluateFormula`, `getFormulaVariables`, `validateFormula`), internally calls `safeEval` instead of dynamic code construction
- **`src/utils/seamly2d/formulaEvaluator.ts`** — keeps current API, after variable substitution calls `safeEval` instead of dynamic code construction. Removes `SAFE_FORMULA_RE`, assignment check, and dynamic code block.

### No API changes

All existing callers continue calling the same functions with the same signatures:
- `constructionResolver.ts`
- `pieceBuilder.ts`
- `blueprintExecutor.ts`
- `seamlyAdapter.ts`
- `formulaPlugin.ts`
- `analysisTools.ts`

---

## Grammar

```
expression     → ternary
ternary        → or ('?' ternary ':' ternary)?
or             → and ('||' and)*
and            → comparison ('&&' comparison)*
comparison     → addition (('==' | '!=' | '<' | '>' | '<=' | '>=') addition)?
addition       → multiplication (('+' | '-') multiplication)*
multiplication → unary (('*' | '/' | '%') unary)*
unary          → ('-' | '!') unary | call
call           → IDENT '(' arguments ')' | primary
arguments      → expression (',' expression)*
primary        → NUMBER | IDENT | '(' expression ')'
```

### Built-in functions (whitelist)

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sqrt`, `abs`, `min`, `max`, `pow`, `floor`, `ceil`, `round`, `sign`

No other function names are accepted. Unknown functions throw.

### Constants

`PI` → `Math.PI`, `E` → `Math.E`

### Variables

Resolved from a flat `Record<string, number>` passed to `safeEval`. The adapters handle their own syntax (`#Name`, `@Name`, `snake_case`) before calling the evaluator.

---

## Migration

### `src/utils/formula/formulaEngine.ts`

Current flow:
```
tokenize → substitute variables to numbers → build expr string → dynamic code construction → execute
```

New flow:
```
tokenize → substitute variables to numbers → safeEval(expr, {})
```

Replace lines 123-130 (the dynamic code block + sanitization regex) with `safeEval(expr)`. The tokenizer stays — it already resolves identifiers to numeric literals. The regex sanity check on line 125 is removed (the parser rejects invalid input by construction).

### `src/utils/seamly2d/formulaEvaluator.ts`

Current flow:
```
regex substitution (#Var, @Meas, snake_case, math functions) → SAFE_FORMULA_RE check → assignment check → dynamic code construction → execute
```

New flow:
```
regex substitution (#Var, @Meas, snake_case, math functions) → safeEval(expr, {})
```

Remove:
- `SAFE_FORMULA_RE` constant (line 18)
- Safety regex check (lines 93-96)
- Assignment operator check (lines 98-102)
- Dynamic code block (lines 104-116)

Replace with a single `safeEval(expr)` call. The regex substitution phase stays — it handles Seamly2D-specific syntax.

### Silent zero fallbacks → errors

Fix silent `return '0'` fallbacks for unknown references:
- Line 40: `return '0'` for unknown `Line_*` → `throw new Error('Unknown variable: ${match}')`
- Line 50: `return '0'` for unknown `@Meas` → `throw new Error('Unknown measurement: @${name}')`

---

## Error Handling

`safeEval` throws descriptive errors:
- `"Unexpected token ')' at position 12"` — syntax error
- `"Unknown function: xyz"` — disallowed function name
- `"Undefined variable: foo"` — variable not in scope
- `"Formula resulted in invalid number"` — NaN or Infinity result

Adapters convert to their existing contracts:
- `formulaEngine.ts` → `{ value: NaN, error: 'message' }` (unchanged API)
- `seamly2d/formulaEvaluator.ts` → throws Error (unchanged API)

Post-evaluation guard: if result is `NaN` or `±Infinity`, `safeEval` throws rather than returning silently.

---

## Testing

### New: `src/utils/formula/__tests__/safeEval.test.ts`

- **Arithmetic:** `2 + 3`, `10 - 4`, `6 * 7`, `15 / 3`, `10 % 3`, precedence `2 + 3 * 4 = 14`
- **Parentheses:** `(2 + 3) * 4 = 20`, nested
- **Unary:** `-5`, `--5 = 5`, `-(-3)`
- **Comparison:** `1 < 2`, `3 >= 3`, `1 == 1`, `1 != 2`
- **Boolean:** `1 && 0 = 0`, `0 || 1 = 1`, `!0 = 1`
- **Ternary:** `1 > 0 ? 10 : 20 = 10`, nested
- **Functions:** `sqrt(16) = 4`, `min(3, 1, 2) = 1`, `max(1, 5, 3) = 5`, `abs(-7) = 7`, `round(3.6) = 4`, `atan2(1, 1)`, `pow(2, 8) = 256`
- **Constants:** `PI ≈ 3.14159`, `E ≈ 2.71828`
- **Variables:** `safeEval('x + y', { x: 3, y: 4 }) = 7`
- **Security:** attempts to call dangerous functions throw, unknown function throws
- **Errors:** unknown variable throws, syntax error throws, empty string throws, `1/0` → throws (Infinity)

### Existing tests must continue passing

- `src/__tests__/formula.test.ts`
- `src/utils/seamly2d/__tests__/formulaEvaluator.test.ts`

---

## Files

### New

| File | Purpose |
|------|---------|
| `src/utils/formula/safeEval.ts` | Recursive descent parser (~200 lines) |
| `src/utils/formula/__tests__/safeEval.test.ts` | Parser tests |

### Modified

| File | Changes |
|------|---------|
| `src/utils/formula/formulaEngine.ts` | Replace dynamic code construction with `safeEval` call |
| `src/utils/seamly2d/formulaEvaluator.ts` | Replace dynamic code construction + regex checks with `safeEval`, fix silent zero fallbacks |

### Acceptance Criteria (from issue)

- [x] Formula evaluation does not use dynamic code construction
- [x] Formula errors produce user-visible messages, not silent NaN
