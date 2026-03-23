import { describe, it, expect } from 'vitest';
import { safeEval } from '../safeEval';

describe('safeEval — arithmetic', () => {
  it('addition', () => expect(safeEval('2 + 3')).toBe(5));
  it('subtraction', () => expect(safeEval('10 - 4')).toBe(6));
  it('multiplication', () => expect(safeEval('6 * 7')).toBe(42));
  it('division', () => expect(safeEval('15 / 3')).toBe(5));
  it('modulo', () => expect(safeEval('10 % 3')).toBe(1));
  it('precedence: 2 + 3 * 4 = 14', () => expect(safeEval('2 + 3 * 4')).toBe(14));
  it('decimal numbers', () => expect(safeEval('1.5 + 2.5')).toBe(4));
});

describe('safeEval — parentheses', () => {
  it('(2 + 3) * 4 = 20', () => expect(safeEval('(2 + 3) * 4')).toBe(20));
  it('nested', () => expect(safeEval('((1 + 2) * (3 + 4))')).toBe(21));
});

describe('safeEval — unary', () => {
  it('-5', () => expect(safeEval('-5')).toBe(-5));
  it('--5 = 5', () => expect(safeEval('--5')).toBe(5));
  it('-(-3) = 3', () => expect(safeEval('-(-3)')).toBe(3));
  it('+5 = 5', () => expect(safeEval('+5')).toBe(5));
  it('!0 = 1', () => expect(safeEval('!0')).toBe(1));
  it('!1 = 0', () => expect(safeEval('!1')).toBe(0));
});

describe('safeEval — comparison', () => {
  it('1 < 2 = 1', () => expect(safeEval('1 < 2')).toBe(1));
  it('2 > 3 = 0', () => expect(safeEval('2 > 3')).toBe(0));
  it('3 >= 3 = 1', () => expect(safeEval('3 >= 3')).toBe(1));
  it('3 <= 2 = 0', () => expect(safeEval('3 <= 2')).toBe(0));
  it('1 == 1 = 1', () => expect(safeEval('1 == 1')).toBe(1));
  it('1 != 2 = 1', () => expect(safeEval('1 != 2')).toBe(1));
});

describe('safeEval — boolean', () => {
  it('1 && 0 = 0', () => expect(safeEval('1 && 0')).toBe(0));
  it('0 || 1 = 1', () => expect(safeEval('0 || 1')).toBe(1));
  it('1 && 1 = 1', () => expect(safeEval('1 && 1')).toBe(1));
  it('0 || 0 = 0', () => expect(safeEval('0 || 0')).toBe(0));
});

describe('safeEval — ternary', () => {
  it('true branch', () => expect(safeEval('1 > 0 ? 10 : 20')).toBe(10));
  it('false branch', () => expect(safeEval('0 > 1 ? 10 : 20')).toBe(20));
  it('nested', () => expect(safeEval('1 ? 2 ? 3 : 4 : 5')).toBe(3));
  it('short-circuits', () => expect(safeEval('0 > 0 ? 1/0 : 42')).toBe(42));
});

describe('safeEval — functions', () => {
  it('sqrt(16) = 4', () => expect(safeEval('sqrt(16)')).toBe(4));
  it('abs(-7) = 7', () => expect(safeEval('abs(-7)')).toBe(7));
  it('min(3, 1, 2) = 1', () => expect(safeEval('min(3, 1, 2)')).toBe(1));
  it('max(1, 5, 3) = 5', () => expect(safeEval('max(1, 5, 3)')).toBe(5));
  it('round(3.6) = 4', () => expect(safeEval('round(3.6)')).toBe(4));
  it('floor(3.9) = 3', () => expect(safeEval('floor(3.9)')).toBe(3));
  it('ceil(3.1) = 4', () => expect(safeEval('ceil(3.1)')).toBe(4));
  it('pow(2, 8) = 256', () => expect(safeEval('pow(2, 8)')).toBe(256));
  it('sin(0) = 0', () => expect(safeEval('sin(0)')).toBe(0));
  it('cos(0) = 1', () => expect(safeEval('cos(0)')).toBe(1));
  it('atan2(1, 1)', () => expect(safeEval('atan2(1, 1)')).toBeCloseTo(Math.PI / 4));
  it('sign(-5) = -1', () => expect(safeEval('sign(-5)')).toBe(-1));
});

describe('safeEval — constants', () => {
  it('PI', () => expect(safeEval('PI')).toBeCloseTo(Math.PI));
  it('PI * 2', () => expect(safeEval('PI * 2')).toBeCloseTo(6.283185, 4));
});

describe('safeEval — variables', () => {
  it('x + y', () => expect(safeEval('x + y', { x: 3, y: 4 })).toBe(7));
  it('in expression', () => expect(safeEval('chest / 4 + 2', { chest: 88 })).toBe(24));
  it('E as variable', () => expect(safeEval('E + 1', { E: 10 })).toBe(11));
});

describe('safeEval — allowedFunctions', () => {
  it('restricts', () => expect(() => safeEval('sin(1)', {}, ['min', 'max'])).toThrow('Unknown function'));
  it('allows listed', () => expect(safeEval('min(3, 1)', {}, ['min', 'max'])).toBe(1));
});

describe('safeEval — errors', () => {
  it('empty string', () => expect(() => safeEval('')).toThrow());
  it('unknown variable', () => expect(() => safeEval('foo + 1')).toThrow('Undefined variable'));
  it('unknown function', () => expect(() => safeEval('badFunc(1)')).toThrow('Unknown function'));
  it('syntax error', () => expect(() => safeEval('2 + + +')).toThrow());
  it('unclosed paren', () => expect(() => safeEval('(2 + 3')).toThrow());
  it('division by zero', () => expect(() => safeEval('1 / 0')).toThrow('Division by zero'));
  it('modulo by zero', () => expect(() => safeEval('1 % 0')).toThrow('Division by zero'));
});

describe('safeEval — security', () => {
  it('no globals', () => {
    expect(() => safeEval('window')).toThrow('Undefined variable');
    expect(() => safeEval('document')).toThrow('Undefined variable');
    expect(() => safeEval('globalThis')).toThrow('Undefined variable');
  });
  it('constructor blocked', () => expect(() => safeEval('constructor')).toThrow('Undefined variable'));
  it('__proto__ blocked', () => expect(() => safeEval('__proto__')).toThrow('Undefined variable'));
  it('toString blocked', () => expect(() => safeEval('toString')).toThrow('Undefined variable'));
  it('valueOf blocked', () => expect(() => safeEval('valueOf')).toThrow('Undefined variable'));
  it('prototype blocked', () => expect(() => safeEval('prototype')).toThrow('Undefined variable'));
  it('hasOwnProperty blocked', () => expect(() => safeEval('hasOwnProperty')).toThrow('Undefined variable'));
});

describe('safeEval — NaN and Infinity guards', () => {
  it('sqrt(-1) throws', () => expect(() => safeEval('sqrt(-1)')).toThrow('NaN'));
  it('asin(2) throws', () => expect(() => safeEval('asin(2)')).toThrow('NaN'));
  it('pow(0, -1) throws (Infinity)', () => expect(() => safeEval('pow(0, -1)')).toThrow('Infinity'));
  it('min() with no args throws (Infinity)', () => expect(() => safeEval('min()')).toThrow('Infinity'));
  it('max() with no args throws (-Infinity)', () => expect(() => safeEval('max()')).toThrow('-Infinity'));
});

describe('safeEval — short-circuit side effects', () => {
  it('&& short-circuits (no div by zero)', () => expect(safeEval('0 && 1/0')).toBe(0));
  it('|| short-circuits (no div by zero)', () => expect(safeEval('1 || 1/0')).toBe(1));
  it('|| normalizes truthy to 1', () => expect(safeEval('5 || 0')).toBe(1));
  it('&& normalizes truthy to 1', () => expect(safeEval('1 && 5')).toBe(1));
});

describe('safeEval — edge cases', () => {
  it('chained comparison rejected', () => expect(() => safeEval('1 <= 2 <= 3')).toThrow('Chained comparisons'));
  it('leading decimal point', () => expect(safeEval('.5 + .5')).toBe(1));
  it('whitespace-only string', () => expect(() => safeEval('   ')).toThrow('Empty expression'));
  it('extra closing paren', () => expect(() => safeEval('2 + 3)')).toThrow());
  it('deeply nested parens', () => {
    const deep = '('.repeat(300) + '1' + ')'.repeat(300);
    expect(() => safeEval(deep)).toThrow('too deeply nested');
  });
});
