// ---------------------------------------------------------------------------
// safeEval — recursive-descent math expression evaluator
// NO dynamic code construction (no eval, no Function constructor).
// This is a SECURITY REPLACEMENT for dangerous dynamic evaluation patterns.
// ---------------------------------------------------------------------------

// -- Token types ------------------------------------------------------------

type TokenType = 'number' | 'ident' | 'op' | 'paren' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
}

// -- Tokenizer --------------------------------------------------------------

const IDENT_START = /[\p{L}_]/u;
const IDENT_CONT = /[\p{L}\p{N}_]/u;
const DIGIT = /[0-9]/;
const TWO_CHAR_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||']);
const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!', '?', ':']);

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Numbers: 123, 1.5, .5
    if (DIGIT.test(ch) || (ch === '.' && i + 1 < expr.length && DIGIT.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && DIGIT.test(expr[i])) {
        num += expr[i++];
      }
      if (i < expr.length && expr[i] === '.') {
        num += expr[i++];
        while (i < expr.length && DIGIT.test(expr[i])) {
          num += expr[i++];
        }
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifiers
    if (IDENT_START.test(ch)) {
      let id = '';
      while (i < expr.length && IDENT_CONT.test(expr[i])) {
        id += expr[i++];
      }
      tokens.push({ type: 'ident', value: id });
      continue;
    }

    // Two-char operators
    if (i + 1 < expr.length) {
      const two = ch + expr[i + 1];
      if (TWO_CHAR_OPS.has(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    // Parentheses
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    // Comma
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

// -- Built-in functions -----------------------------------------------------

const BUILTIN_NAMES = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sqrt', 'abs', 'min', 'max', 'pow', 'floor', 'ceil', 'round', 'sign',
]);

const BUILTINS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  atan2: (y, x) => Math.atan2(y, x),
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (b, e) => Math.pow(b, e),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  sign: (x) => Math.sign(x),
};

// -- Constants --------------------------------------------------------------

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
};

// -- Comparison operators ---------------------------------------------------

const COMPARISON_OPS = new Set(['<', '>', '<=', '>=', '==', '!=']);

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

// -- Parser -----------------------------------------------------------------
// The parser uses a `skip` depth counter for short-circuit evaluation.
// When skip > 0, the grammar is traversed (tokens consumed) but runtime
// errors like division-by-zero and undefined-variable are suppressed,
// and intermediate values are meaningless (returned as 0).

class Parser {
  private static MAX_DEPTH = 256;
  private tokens: Token[];
  private pos: number;
  private vars: Record<string, number>;
  private allowedFns: Set<string> | null;
  private skip: number; // > 0 means we are inside a skipped branch
  private depth: number;

  constructor(
    tokens: Token[],
    vars: Record<string, number>,
    allowedFunctions: string[] | undefined,
  ) {
    this.tokens = tokens;
    this.pos = 0;
    this.vars = vars;
    this.allowedFns = allowedFunctions ? new Set(allowedFunctions) : null;
    this.skip = 0;
    this.depth = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.advance();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(
        `Expected ${value ?? type} but got '${tok.value}' at position ${this.pos - 1}`,
      );
    }
    return tok;
  }

  // entry
  parse(): number {
    const result = this.expression();
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token '${this.peek().value}' after expression`);
    }
    return result;
  }

  // expression -> ternary
  private expression(): number {
    if (++this.depth > Parser.MAX_DEPTH) {
      throw new Error('Expression too deeply nested');
    }
    try {
      return this.ternary();
    } finally {
      this.depth--;
    }
  }

  // ternary -> or ('?' ternary ':' ternary)?   SHORT-CIRCUIT
  private ternary(): number {
    const cond = this.or();
    if (this.peek().type === 'op' && this.peek().value === '?') {
      this.advance(); // consume '?'
      if (this.skip > 0) {
        // Already skipping — parse both branches in skip mode
        this.ternary();
        this.expect('op', ':');
        this.ternary();
        return 0;
      }
      if (cond !== 0) {
        const trueVal = this.ternary();
        this.expect('op', ':');
        this.skip++;
        this.ternary();
        this.skip--;
        return trueVal;
      } else {
        this.skip++;
        this.ternary();
        this.skip--;
        this.expect('op', ':');
        return this.ternary();
      }
    }
    return cond;
  }

  // or -> and ('||' and)*   SHORT-CIRCUIT
  private or(): number {
    let left = this.and();
    while (this.peek().type === 'op' && this.peek().value === '||') {
      this.advance();
      if (this.skip > 0) {
        this.and();
      } else if (left !== 0) {
        // short-circuit: parse right side in skip mode
        this.skip++;
        this.and();
        this.skip--;
        left = 1; // normalize to boolean
      } else {
        const right = this.and();
        left = right !== 0 ? 1 : 0;
      }
    }
    return left;
  }

  // and -> comparison ('&&' comparison)*   SHORT-CIRCUIT
  private and(): number {
    let left = this.comparison();
    while (this.peek().type === 'op' && this.peek().value === '&&') {
      this.advance();
      if (this.skip > 0) {
        this.comparison();
      } else if (left === 0) {
        // short-circuit: parse right side in skip mode
        this.skip++;
        this.comparison();
        this.skip--;
        // left stays 0
      } else {
        const right = this.comparison();
        left = right !== 0 ? 1 : 0;
      }
    }
    return left;
  }

  // comparison -> addition (op addition)?   [one comparison only]
  private comparison(): number {
    let left = this.addition();
    const tok = this.peek();
    if (tok.type === 'op' && COMPARISON_OPS.has(tok.value)) {
      const op = this.advance().value;
      const right = this.addition();
      if (this.skip === 0) {
        left = this.applyComparison(op, left, right);
      }

      // Check for chained comparison (even in skip mode — it's a syntax error)
      const next = this.peek();
      if (next.type === 'op' && COMPARISON_OPS.has(next.value)) {
        throw new Error(
          'Chained comparisons not supported. Use a <= x && x <= b instead.',
        );
      }
    }
    return left;
  }

  private applyComparison(op: string, a: number, b: number): number {
    switch (op) {
      case '<':
        return a < b ? 1 : 0;
      case '>':
        return a > b ? 1 : 0;
      case '<=':
        return a <= b ? 1 : 0;
      case '>=':
        return a >= b ? 1 : 0;
      case '==':
        return a === b ? 1 : 0;
      case '!=':
        return a !== b ? 1 : 0;
      default:
        throw new Error(`Unknown comparison operator: ${op}`);
    }
  }

  // addition -> multiplication (('+' | '-') multiplication)*
  private addition(): number {
    let left = this.multiplication();
    while (
      this.peek().type === 'op' &&
      (this.peek().value === '+' || this.peek().value === '-')
    ) {
      const op = this.advance().value;
      const right = this.multiplication();
      if (this.skip === 0) {
        left = op === '+' ? left + right : left - right;
      }
    }
    return left;
  }

  // multiplication -> unary (('*' | '/' | '%') unary)*
  private multiplication(): number {
    let left = this.unary();
    while (
      this.peek().type === 'op' &&
      (this.peek().value === '*' ||
        this.peek().value === '/' ||
        this.peek().value === '%')
    ) {
      const op = this.advance().value;
      const right = this.unary();
      if (this.skip === 0) {
        if ((op === '/' || op === '%') && right === 0) {
          throw new Error('Division by zero');
        }
        if (op === '*') left = left * right;
        else if (op === '/') left = left / right;
        else left = left % right;
      }
    }
    return left;
  }

  // unary -> ('+' | '-' | '!') unary | call
  private unary(): number {
    const tok = this.peek();
    if (tok.type === 'op' && (tok.value === '+' || tok.value === '-' || tok.value === '!')) {
      this.advance();
      const val = this.unary();
      if (this.skip > 0) return 0;
      if (tok.value === '-') return -val;
      if (tok.value === '!') return val === 0 ? 1 : 0;
      return val; // unary +
    }
    return this.call();
  }

  // call -> IDENT '(' args? ')' | primary
  private call(): number {
    if (
      this.peek().type === 'ident' &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1].type === 'paren' &&
      this.tokens[this.pos + 1].value === '('
    ) {
      const name = this.advance().value;
      this.advance(); // consume '('

      // Validate function (even in skip mode — catch unknown functions early)
      if (this.allowedFns !== null) {
        if (!this.allowedFns.has(name)) {
          throw new Error(`Unknown function: ${name}`);
        }
      }
      if (!BUILTIN_NAMES.has(name)) {
        throw new Error(`Unknown function: ${name}`);
      }

      // Parse arguments
      const args: number[] = [];
      if (!(this.peek().type === 'paren' && this.peek().value === ')')) {
        args.push(this.expression());
        while (this.peek().type === 'comma') {
          this.advance(); // consume ','
          args.push(this.expression());
        }
      }
      this.expect('paren', ')');

      if (this.skip > 0) return 0;
      const fnResult = BUILTINS[name](...args);
      if (!Number.isFinite(fnResult)) {
        throw new Error(`Function ${name}(${args.join(', ')}) produced ${Number.isNaN(fnResult) ? 'NaN' : fnResult}`);
      }
      return fnResult;
    }
    return this.primary();
  }

  // primary -> NUMBER | IDENT | '(' expression ')'
  private primary(): number {
    const tok = this.peek();

    // Number
    if (tok.type === 'number') {
      this.advance();
      if (this.skip > 0) return 0;
      return parseFloat(tok.value);
    }

    // Identifier (constant or variable)
    if (tok.type === 'ident') {
      this.advance();
      if (this.skip > 0) return 0;
      if (hasOwn(this.vars, tok.value)) {
        return this.vars[tok.value];
      }
      if (hasOwn(CONSTANTS, tok.value)) {
        return CONSTANTS[tok.value];
      }
      throw new Error(`Undefined variable: ${tok.value}`);
    }

    // Parenthesized expression
    if (tok.type === 'paren' && tok.value === '(') {
      this.advance(); // consume '('
      const val = this.expression();
      this.expect('paren', ')');
      return val;
    }

    throw new Error(
      `Unexpected token '${tok.value}' at position ${this.pos}`,
    );
  }
}

// -- Public API -------------------------------------------------------------
// This function is a SAFE ALTERNATIVE to dynamic code construction.
// It parses and evaluates math expressions using a recursive descent parser.

export function safeEval(
  expr: string,
  vars: Record<string, number> = {},
  allowedFunctions?: string[],
): number {
  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    throw new Error('Empty expression');
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens, vars, allowedFunctions);
  const result = parser.parse();

  if (!Number.isFinite(result)) {
    throw new Error('Formula resulted in invalid number');
  }

  return result;
}
