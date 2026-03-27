import { tokenize } from '../../validator/tokenizer';
import { parse } from '../../validator/parser';
import { ASTNode, FunctionCallNode, BracketEvalNode } from '../../validator/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseExpr(expr: string) {
  return parse(tokenize(expr));
}

function errorCodes(expr: string): string[] {
  return parseExpr(expr).diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.code);
}

function warnCodes(expr: string): string[] {
  return parseExpr(expr).diagnostics
    .filter((d) => d.severity === 'warning')
    .map((d) => d.code);
}

function nodeTypes(nodes: ASTNode[]): string[] {
  return nodes.map((n) => n.type);
}

// ---------------------------------------------------------------------------
// Valid expressions — no structural errors
// ---------------------------------------------------------------------------

describe('parser — valid expressions', () => {
  it('empty string parses to empty nodes, no errors', () => {
    const { nodes, diagnostics } = parseExpr('');
    expect(nodes).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  it('plain text parses to RawText node', () => {
    const { nodes, diagnostics } = parseExpr('hello world');
    expect(diagnostics).toHaveLength(0);
    expect(nodes[0]).toMatchObject({ type: 'RawText', value: 'hello' });
  });

  it('simple function call: add(2,3)', () => {
    const { nodes, diagnostics } = parseExpr('add(2,3)');
    expect(diagnostics).toHaveLength(0);
    expect(nodes).toHaveLength(1);
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.type).toBe('FunctionCall');
    expect(fn.name).toBe('add');
    expect(fn.args).toHaveLength(2);
  });

  it('function with zero args: pi()', () => {
    const { nodes, diagnostics } = parseExpr('pi()');
    expect(diagnostics).toHaveLength(0);
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(0);
  });

  it('nested function calls: add(mul(2,3),4)', () => {
    const { nodes, diagnostics } = parseExpr('add(mul(2,3),4)');
    expect(diagnostics).toHaveLength(0);
    const outer = nodes[0] as FunctionCallNode;
    expect(outer.name).toBe('add');
    expect(outer.args).toHaveLength(2);
    const inner = outer.args[0][0] as FunctionCallNode;
    expect(inner.type).toBe('FunctionCall');
    expect(inner.name).toBe('mul');
    expect(inner.args).toHaveLength(2);
  });

  it('deeply nested: a(b(c(d(1))))', () => {
    const { nodes, diagnostics } = parseExpr('a(b(c(d(1))))');
    expect(diagnostics).toHaveLength(0);
    expect(nodes[0]).toMatchObject({ type: 'FunctionCall', name: 'a' });
  });

  it('bracket eval: [add(2,3)]', () => {
    const { nodes, diagnostics } = parseExpr('[add(2,3)]');
    expect(diagnostics).toHaveLength(0);
    expect(nodes[0]).toMatchObject({ type: 'BracketEval' });
    const bracket = nodes[0] as BracketEvalNode;
    expect(bracket.nodes[0]).toMatchObject({ type: 'FunctionCall', name: 'add' });
  });

  it('bracket eval inside function arg: add([strlen(hi)],3)', () => {
    const { nodes, diagnostics } = parseExpr('add([strlen(hi)],3)');
    expect(diagnostics).toHaveLength(0);
    const fn = nodes[0] as FunctionCallNode;
    // First arg contains a BracketEval
    expect(fn.args[0][0]).toMatchObject({ type: 'BracketEval' });
  });

  it('substitution is preserved as-is', () => {
    const { nodes, diagnostics } = parseExpr('name(%#)');
    expect(diagnostics).toHaveLength(0);
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args[0][0]).toMatchObject({ type: 'Substitution', raw: '%#' });
  });

  it('escaped paren in arg: add(\\(1\\),2)', () => {
    const { nodes, diagnostics } = parseExpr('add(\\(1\\),2)');
    expect(diagnostics).toHaveLength(0);
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(2);
    // First arg has ESC, TEXT, ESC nodes
    expect(fn.args[0].some((n) => n.type === 'RawText' && n.value === '(')).toBe(true);
  });

  it('top-level comma is literal text', () => {
    const { nodes, diagnostics } = parseExpr('a,b');
    expect(diagnostics).toHaveLength(0);
    // Nodes: TEXT('a'), RawText(','), TEXT('b')
    const commaNode = nodes.find((n) => n.type === 'RawText' && (n as any).value === ',');
    expect(commaNode).toBeDefined();
  });

  it('function call with substitution args: u(%#/ATTR,%0)', () => {
    const { nodes, diagnostics } = parseExpr('u(%#/ATTR,%0)');
    expect(diagnostics).toHaveLength(0);
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(2);
  });

  it('multiple top-level functions: add(1,2) sub(3,1)', () => {
    const { nodes, diagnostics } = parseExpr('add(1,2) sub(3,1)');
    expect(diagnostics).toHaveLength(0);
    const fns = nodes.filter((n) => n.type === 'FunctionCall');
    expect(fns).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// E001 — Unclosed parenthesis
// ---------------------------------------------------------------------------

describe('parser — E001 unclosed parenthesis', () => {
  it('unclosed single function: add(2,3', () => {
    expect(errorCodes('add(2,3')).toContain('E001');
  });

  it('unclosed nested function: add(mul(2,3),4', () => {
    expect(errorCodes('add(mul(2,3),4')).toContain('E001');
  });

  it('EOF right after opening paren: add(', () => {
    expect(errorCodes('add(')).toContain('E001');
  });

  it('best-effort parse still produces function node even with E001', () => {
    const { nodes } = parseExpr('add(2,3');
    expect(nodes[0]).toMatchObject({ type: 'FunctionCall', name: 'add' });
  });

  it('unclosed inner but closed outer: add(mul(2,3)', () => {
    // mul closes, add does not
    expect(errorCodes('add(mul(2,3)')).toContain('E001');
  });
});

// ---------------------------------------------------------------------------
// E002 — Stray closing parenthesis
// ---------------------------------------------------------------------------

describe('parser — E002 stray )', () => {
  it('stray ) at top level', () => {
    expect(errorCodes(')')).toContain('E002');
  });

  it('stray ) after valid expression', () => {
    expect(errorCodes('add(2,3))')).toContain('E002');
  });

  it('stray ) inside bracket eval', () => {
    expect(errorCodes('[add(2)])')).toContain('E002');
  });
});

// ---------------------------------------------------------------------------
// E003 — Unclosed bracket
// ---------------------------------------------------------------------------

describe('parser — E003 unclosed bracket', () => {
  it('unclosed bracket: [add(2,3)', () => {
    expect(errorCodes('[add(2,3)')).toContain('E003');
  });

  it('EOF right after [: [', () => {
    expect(errorCodes('[')).toContain('E003');
  });

  it('nested unclosed bracket: [[add(2)]', () => {
    expect(errorCodes('[[add(2)]')).toContain('E003');
  });
});

// ---------------------------------------------------------------------------
// E004 — Stray closing bracket
// ---------------------------------------------------------------------------

describe('parser — E004 stray ]', () => {
  it('stray ] at top level', () => {
    expect(errorCodes(']')).toContain('E004');
  });

  it('stray ] after valid bracket eval', () => {
    expect(errorCodes('[add(2,3)]]')).toContain('E004');
  });

  it('stray ] inside function argument', () => {
    expect(errorCodes('add(],3)')).toContain('E004');
  });
});

// ---------------------------------------------------------------------------
// Argument structure
// ---------------------------------------------------------------------------

describe('parser — argument structure', () => {
  it('single-arg function', () => {
    const { nodes } = parseExpr('abs(-1)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(1);
  });

  it('three-arg function: switch(x,a,b)', () => {
    const { nodes } = parseExpr('switch(x,a,b)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(3);
  });

  it('empty arg list: pi()', () => {
    const { nodes } = parseExpr('pi()');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(0);
  });

  it('trailing comma produces empty final arg', () => {
    const { nodes } = parseExpr('add(2,)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args).toHaveLength(2);
    expect(fn.args[1]).toHaveLength(0);
  });

  it('preserves arg node types: add(%0,3)', () => {
    const { nodes } = parseExpr('add(%0,3)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args[0][0]).toMatchObject({ type: 'Substitution', raw: '%0' });
    expect(fn.args[1][0]).toMatchObject({ type: 'RawText', value: '3' });
  });

  it('arg containing mixed nodes: add(%0 text [fn()], 2)', () => {
    const { nodes } = parseExpr('add(%0 [abs(1)],2)');
    expect(nodes[0]).toMatchObject({ type: 'FunctionCall', name: 'add' });
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.args[0].length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Offset tracking
// ---------------------------------------------------------------------------

describe('parser — offsets', () => {
  it('function nameOffset points to start of name', () => {
    const { nodes } = parseExpr('add(2,3)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.nameOffset).toBe(0);
  });

  it('function offset points to opening paren', () => {
    const { nodes } = parseExpr('add(2,3)');
    const fn = nodes[0] as FunctionCallNode;
    expect(fn.offset).toBe(3);
  });

  it('nested function nameOffset', () => {
    const { nodes } = parseExpr('add(mul(2,3),4)');
    const outer = nodes[0] as FunctionCallNode;
    const inner = outer.args[0][0] as FunctionCallNode;
    expect(inner.nameOffset).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Multiple errors in one expression
// ---------------------------------------------------------------------------

describe('parser — multiple errors', () => {
  it('stray ) and stray ] both reported', () => {
    const codes = errorCodes(')]');
    expect(codes).toContain('E002');
    expect(codes).toContain('E004');
  });

  it('unclosed paren AND stray ]: add(2] reports both', () => {
    const codes = errorCodes('add(2]');
    // The ] inside an arg triggers E004, EOF triggers E001
    expect(codes).toContain('E004');
    expect(codes).toContain('E001');
  });
});
