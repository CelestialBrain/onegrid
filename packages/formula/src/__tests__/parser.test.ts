import { describe, expect, it } from 'vitest';
import { parseFormula } from '../parser';

describe('parseFormula', () => {
  it('parses a number literal', () => {
    expect(parseFormula('=42')).toEqual({ kind: 'number', value: 42 });
  });

  it('parses a string literal with escaped quote', () => {
    expect(parseFormula('="he said ""hi"""')).toEqual({
      kind: 'string',
      value: 'he said "hi"',
    });
  });

  it('parses TRUE/FALSE as boolean literals', () => {
    expect(parseFormula('=TRUE')).toEqual({ kind: 'boolean', value: true });
    expect(parseFormula('=False')).toEqual({ kind: 'boolean', value: false });
  });

  it('parses cell and range refs', () => {
    expect(parseFormula('=A1')).toEqual({ kind: 'cellRef', ref: 'A1' });
    expect(parseFormula('=$A$1')).toEqual({ kind: 'cellRef', ref: '$A$1' });
    expect(parseFormula('=A1:B10')).toEqual({ kind: 'rangeRef', ref: 'A1:B10' });
  });

  it('respects operator precedence: 1 + 2 * 3 → 1 + (2*3)', () => {
    const ast = parseFormula('=1 + 2 * 3');
    expect(ast).toEqual({
      kind: 'binary',
      op: '+',
      left: { kind: 'number', value: 1 },
      right: {
        kind: 'binary',
        op: '*',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 3 },
      },
    });
  });

  it('parses unary minus tighter than exponent (Excel semantics)', () => {
    // Excel parses `-2^2` as `(-2)^2 = 4`, i.e. unary is tighter than ^.
    // Our grammar matches: parseExponent calls parseUnary on its base.
    const ast = parseFormula('=-2^3');
    expect(ast).toEqual({
      kind: 'binary',
      op: '^',
      left: {
        kind: 'unary',
        op: '-',
        operand: { kind: 'number', value: 2 },
      },
      right: { kind: 'number', value: 3 },
    });
  });

  it('parses function calls with multiple args', () => {
    const ast = parseFormula('=SUM(A1:A10, 5, B2)');
    expect(ast.kind).toBe('call');
    if (ast.kind !== 'call') throw new Error('expected call');
    expect(ast.name).toBe('SUM');
    expect(ast.args).toHaveLength(3);
    expect(ast.args[0]?.kind).toBe('rangeRef');
    expect(ast.args[1]?.kind).toBe('number');
    expect(ast.args[2]?.kind).toBe('cellRef');
  });

  it('parses comparison operators', () => {
    expect((parseFormula('=A1 = 5') as { op: string }).op).toBe('=');
    expect((parseFormula('=A1 <> 5') as { op: string }).op).toBe('<>');
    expect((parseFormula('=A1 >= 5') as { op: string }).op).toBe('>=');
  });

  it('throws FormulaSyntaxError on unbalanced parens', () => {
    expect(() => parseFormula('=(1 + 2')).toThrow();
  });

  it('parses percent suffix', () => {
    expect(parseFormula('=50%')).toEqual({
      kind: 'percent',
      operand: { kind: 'number', value: 50 },
    });
  });
});
