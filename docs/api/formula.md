# Formula Engine

> `src/utils/formula/`

Safe math expression evaluator for parametric pattern construction. Supports variables, math functions, and constants — without using `eval`.

## Overview

The formula engine lets users write expressions like `chest / 4 + 2` or `sqrt(a * a + b * b)` that reference named measurements and variables. Expressions are tokenized, validated, and evaluated through a sandboxed `new Function('Math', ...)` call that only exposes `Math` — no access to globals, DOM, or imports.

## Quick Example

```ts
import { evaluateFormula, getFormulaVariables, validateFormula } from '@openclo/utils/formula';

const context = {
  variables: { chest: 88, ease: 4 },
};

const result = evaluateFormula('chest / 4 + ease', context);
// { value: 26 }

const vars = getFormulaVariables('chest / 4 + ease');
// ['chest', 'ease']

const check = validateFormula('chest / 4 + ease', context);
// { valid: true }
```

## API Reference

### `evaluateFormula(formula, context): FormulaResult`

Evaluates a formula string with the given variable context.

| Param | Type | Description |
|-------|------|-------------|
| `formula` | `string` | Math expression (e.g. `'chest / 4 + 2'`) |
| `context` | `FormulaContext` | Variable name→value mapping |
| **Returns** | `FormulaResult` | `{ value: number, error?: string }` |

**Error cases:** empty formula, unknown variable, invalid characters, non-finite result, syntax errors.

### `getFormulaVariables(formula): string[]`

Extracts all variable names referenced in a formula (excluding functions and constants).

| Param | Type | Description |
|-------|------|-------------|
| `formula` | `string` | Formula to analyze |
| **Returns** | `string[]` | Unique variable names |

### `validateFormula(formula, context): { valid: boolean; error?: string }`

Checks if a formula is syntactically valid and all variables are defined.

## Supported Syntax

### Operators
`+`, `-`, `*`, `/`, `%` (modulo), parentheses `()`

### Functions
| Function | Description |
|----------|-------------|
| `min(a, b, ...)` | Minimum value |
| `max(a, b, ...)` | Maximum value |
| `abs(x)` | Absolute value |
| `round(x)` | Round to nearest integer |
| `floor(x)` | Round down |
| `ceil(x)` | Round up |
| `sqrt(x)` | Square root |

### Constants
| Constant | Value |
|----------|-------|
| `PI` | `3.141592653589793` |

### Variables
Any `[a-zA-Z_][a-zA-Z0-9_]*` identifier that isn't a function or constant is treated as a variable and resolved from `context.variables`.

## Types

### `FormulaContext`

```ts
interface FormulaContext {
  variables: Record<string, number>;
}
```

### `FormulaResult`

```ts
interface FormulaResult {
  value: number;
  error?: string;
}
```

## Security Model

1. **No `eval()`** — formulas are never passed to `eval`
2. **Sandboxed Function** — `new Function('Math', '"use strict"; return (expr)')` receives only `Math` as argument
3. **Allowlisted functions** — only `min`, `max`, `abs`, `round`, `floor`, `ceil`, `sqrt` are mapped to `Math.*`
4. **Character validation** — final expression is regex-checked against `[\s0-9+\-*/%(),.a-zA-Z]`
5. **Strict mode** — generated function runs in `"use strict"`
6. **Finite check** — result must be a finite number; `Infinity`, `-Infinity`, and `NaN` return errors

## Related

- [Grading](./grading.md) — grading rules can use formula-evaluated measurements
- [Seam Allowance](./seam-allowance.md) — seam widths can be formula-derived
