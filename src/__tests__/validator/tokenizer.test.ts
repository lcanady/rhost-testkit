import { tokenize, Token, TokenType } from '../../validator/tokenizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function types(tokens: Token[]): TokenType[] {
  return tokens.map((t) => t.type);
}

function values(tokens: Token[]): string[] {
  return tokens.map((t) => t.value);
}

function offsets(tokens: Token[]): number[] {
  return tokens.map((t) => t.offset);
}

// ---------------------------------------------------------------------------
// Empty / trivial input
// ---------------------------------------------------------------------------

describe('tokenizer — trivial', () => {
  it('empty string produces no tokens', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('plain text produces a single TEXT token', () => {
    const toks = tokenize('hello');
    expect(types(toks)).toEqual(['TEXT']);
    expect(values(toks)).toEqual(['hello']);
    expect(offsets(toks)).toEqual([0]);
  });

  it('digits produce TEXT', () => {
    const toks = tokenize('123');
    expect(types(toks)).toEqual(['TEXT']);
    expect(values(toks)).toEqual(['123']);
  });

  it('spaces produce TEXT', () => {
    const toks = tokenize('   ');
    expect(types(toks)).toEqual(['TEXT']);
    expect(values(toks)).toEqual(['   ']);
  });
});

// ---------------------------------------------------------------------------
// Function names + parens
// ---------------------------------------------------------------------------

describe('tokenizer — function calls', () => {
  it('simple function call: add(', () => {
    const toks = tokenize('add(');
    expect(types(toks)).toEqual(['FNAME', 'LPAREN']);
    expect(values(toks)).toEqual(['add', '(']);
    expect(offsets(toks)).toEqual([0, 3]);
  });

  it('full function call: add(2,3)', () => {
    const toks = tokenize('add(2,3)');
    expect(types(toks)).toEqual(['FNAME', 'LPAREN', 'TEXT', 'COMMA', 'TEXT', 'RPAREN']);
    expect(values(toks)).toEqual(['add', '(', '2', ',', '3', ')']);
  });

  it('nested functions: add(mul(2,3),4)', () => {
    const toks = tokenize('add(mul(2,3),4)');
    expect(types(toks)).toEqual([
      'FNAME', 'LPAREN',
        'FNAME', 'LPAREN', 'TEXT', 'COMMA', 'TEXT', 'RPAREN',
      'COMMA', 'TEXT',
      'RPAREN',
    ]);
  });

  it('identifier NOT followed by ( is TEXT', () => {
    const toks = tokenize('hello world');
    expect(types(toks)).toEqual(['TEXT', 'TEXT', 'TEXT']);
    expect(values(toks)).toEqual(['hello', ' ', 'world']);
  });

  it('bare ( not after identifier is TEXT', () => {
    const toks = tokenize('(1+2)');
    // ( not after identifier → TEXT; ) is always RPAREN
    expect(types(toks)).toEqual(['TEXT', 'TEXT', 'RPAREN']);
    expect(toks[0]).toMatchObject({ type: 'TEXT', value: '(' });
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: '1+2' });
    expect(toks[2]).toMatchObject({ type: 'RPAREN', value: ')' });
  });

  it('function name with underscores and digits', () => {
    const toks = tokenize('my_func2(x)');
    expect(toks[0]).toMatchObject({ type: 'FNAME', value: 'my_func2' });
    expect(toks[1]).toMatchObject({ type: 'LPAREN' });
  });

  it('uppercase function name', () => {
    const toks = tokenize('ADD(2,3)');
    expect(toks[0]).toMatchObject({ type: 'FNAME', value: 'ADD' });
  });

  it('RPAREN alone', () => {
    const toks = tokenize(')');
    expect(types(toks)).toEqual(['RPAREN']);
  });
});

// ---------------------------------------------------------------------------
// Backslash escapes
// ---------------------------------------------------------------------------

describe('tokenizer — backslash escapes', () => {
  it('\\( is ESC, not LPAREN', () => {
    const toks = tokenize('\\(');
    expect(types(toks)).toEqual(['ESC']);
    expect(values(toks)).toEqual(['(']);
    expect(offsets(toks)).toEqual([0]);
  });

  it('\\) is ESC, not RPAREN', () => {
    const toks = tokenize('\\)');
    expect(types(toks)).toEqual(['ESC']);
    expect(values(toks)).toEqual([')']);
  });

  it('\\, is ESC, not COMMA', () => {
    const toks = tokenize('\\,');
    expect(types(toks)).toEqual(['ESC']);
    expect(values(toks)).toEqual([',']);
  });

  it('\\\\ is ESC(\\)', () => {
    const toks = tokenize('\\\\');
    expect(types(toks)).toEqual(['ESC']);
    expect(values(toks)).toEqual(['\\']);
  });

  it('\\% prevents percent-substitution', () => {
    const toks = tokenize('\\%#');
    // ESC('%') then TEXT('#')
    expect(toks[0]).toMatchObject({ type: 'ESC', value: '%' });
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: '#' });
  });

  it('trailing backslash emits TEXT(\\)', () => {
    const toks = tokenize('a\\');
    expect(toks).toHaveLength(2);
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: '\\' });
  });

  it('escape before function name prevents function call', () => {
    // \add( — escape only covers 'a', so 'dd(' becomes FNAME-like... but
    // tokenizer sees \a then dd( which IS a function call 'dd'
    // Actually: ESC('a') TEXT('dd') → wait, 'dd(' is FNAME+LPAREN
    const toks = tokenize('\\add(');
    expect(toks[0]).toMatchObject({ type: 'ESC', value: 'a' });
    expect(toks[1]).toMatchObject({ type: 'FNAME', value: 'dd' });
  });
});

// ---------------------------------------------------------------------------
// Percent substitutions
// ---------------------------------------------------------------------------

describe('tokenizer — percent substitutions', () => {
  it('%% produces TEXT(%)', () => {
    const toks = tokenize('%%');
    expect(types(toks)).toEqual(['TEXT']);
    expect(values(toks)).toEqual(['%']);
  });

  it('%# is SUBST', () => {
    const toks = tokenize('%#');
    expect(types(toks)).toEqual(['SUBST']);
    expect(values(toks)).toEqual(['%#']);
  });

  it('%N is SUBST', () => {
    expect(tokenize('%N')[0]).toMatchObject({ type: 'SUBST', value: '%N' });
  });

  it('%n is SUBST', () => {
    expect(tokenize('%n')[0]).toMatchObject({ type: 'SUBST', value: '%n' });
  });

  it('%0 through %9 are SUBST', () => {
    for (let i = 0; i <= 9; i++) {
      const toks = tokenize(`%${i}`);
      expect(toks[0]).toMatchObject({ type: 'SUBST', value: `%${i}` });
    }
  });

  it('%q0 is SUBST (3 chars)', () => {
    const toks = tokenize('%q0');
    expect(toks).toHaveLength(1);
    expect(toks[0]).toMatchObject({ type: 'SUBST', value: '%q0' });
  });

  it('%q9 is SUBST', () => {
    expect(tokenize('%q9')[0]).toMatchObject({ type: 'SUBST', value: '%q9' });
  });

  it('%Q0 is SUBST (uppercase)', () => {
    expect(tokenize('%Q0')[0]).toMatchObject({ type: 'SUBST', value: '%Q0' });
  });

  it('%i0 is SUBST (iter var)', () => {
    expect(tokenize('%i0')[0]).toMatchObject({ type: 'SUBST', value: '%i0' });
  });

  it('%r is SUBST', () => {
    expect(tokenize('%r')[0]).toMatchObject({ type: 'SUBST', value: '%r' });
  });

  it('%t is SUBST', () => {
    expect(tokenize('%t')[0]).toMatchObject({ type: 'SUBST', value: '%t' });
  });

  it('%b is SUBST', () => {
    expect(tokenize('%b')[0]).toMatchObject({ type: 'SUBST', value: '%b' });
  });

  it('unknown %X is TEXT(%)', () => {
    // %z is not in the known set
    const toks = tokenize('%z');
    expect(toks[0]).toMatchObject({ type: 'TEXT', value: '%' });
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: 'z' });
  });

  it('trailing % is TEXT', () => {
    const toks = tokenize('a%');
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: '%' });
  });

  it('%% inside expression is just TEXT(%)', () => {
    const toks = tokenize('add(%%,3)');
    // FNAME(add) LPAREN TEXT('%') COMMA TEXT(3) RPAREN
    const textTokens = toks.filter((t) => t.type === 'TEXT');
    expect(textTokens.some((t) => t.value === '%')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Brackets
// ---------------------------------------------------------------------------

describe('tokenizer — brackets', () => {
  it('[ is LBRACKET', () => {
    expect(tokenize('[')[0]).toMatchObject({ type: 'LBRACKET', value: '[' });
  });

  it('] is RBRACKET', () => {
    expect(tokenize(']')[0]).toMatchObject({ type: 'RBRACKET', value: ']' });
  });

  it('[add(2,3)] produces expected tokens', () => {
    const toks = tokenize('[add(2,3)]');
    expect(types(toks)).toEqual([
      'LBRACKET',
      'FNAME', 'LPAREN', 'TEXT', 'COMMA', 'TEXT', 'RPAREN',
      'RBRACKET',
    ]);
  });

  it('nested brackets', () => {
    const toks = tokenize('[[x]]');
    expect(toks[0]).toMatchObject({ type: 'LBRACKET' });
    expect(toks[1]).toMatchObject({ type: 'LBRACKET' });
    expect(toks[2]).toMatchObject({ type: 'TEXT', value: 'x' });
    expect(toks[3]).toMatchObject({ type: 'RBRACKET' });
    expect(toks[4]).toMatchObject({ type: 'RBRACKET' });
  });
});

// ---------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------

describe('tokenizer — offsets', () => {
  it('tracks character offsets correctly', () => {
    const toks = tokenize('add(2,3)');
    // a=0, d=1, d=2, (=3, 2=4, ,=5, 3=6, )=7
    expect(toks.find((t) => t.type === 'FNAME')!.offset).toBe(0);
    expect(toks.find((t) => t.type === 'LPAREN')!.offset).toBe(3);
    expect(toks.find((t) => t.value === '2')!.offset).toBe(4);
    expect(toks.find((t) => t.type === 'COMMA')!.offset).toBe(5);
    expect(toks.find((t) => t.value === '3')!.offset).toBe(6);
    expect(toks.find((t) => t.type === 'RPAREN')!.offset).toBe(7);
  });

  it('ESC offset points to the backslash', () => {
    const toks = tokenize('a\\(b');
    expect(toks[1]).toMatchObject({ type: 'ESC', offset: 1 });
  });

  it('%q0 offset points to the %', () => {
    const toks = tokenize('x%q0y');
    const subst = toks.find((t) => t.type === 'SUBST')!;
    expect(subst.offset).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed / edge cases
// ---------------------------------------------------------------------------

describe('tokenizer — mixed expressions', () => {
  it('handles expression with substitution as argument', () => {
    // u(#5/ATTR,%0,%1)
    const toks = tokenize('u(#5/ATTR,%0,%1)');
    expect(toks[0]).toMatchObject({ type: 'FNAME', value: 'u' });
    const substs = toks.filter((t) => t.type === 'SUBST');
    expect(substs).toHaveLength(2);
    expect(substs[0].value).toBe('%0');
    expect(substs[1].value).toBe('%1');
  });

  it('handles bracket eval inside function arg', () => {
    // add([strlen(hello)],3)
    // idx: 0=FNAME(add) 1=LPAREN 2=LBRACKET 3=FNAME(strlen) 4=LPAREN 5=TEXT(hello) 6=RPAREN 7=RBRACKET 8=COMMA 9=TEXT(3) 10=RPAREN
    const toks = tokenize('add([strlen(hello)],3)');
    expect(toks[0]).toMatchObject({ type: 'FNAME', value: 'add' });
    expect(toks[2]).toMatchObject({ type: 'LBRACKET' });
    expect(toks[3]).toMatchObject({ type: 'FNAME', value: 'strlen' });
    expect(toks[7]).toMatchObject({ type: 'RBRACKET' });
    expect(toks[8]).toMatchObject({ type: 'COMMA' });
  });

  it('mixed text and functions', () => {
    // 'hello' is an identifier not before (, so TEXT; then TEXT(' '); then LBRACKET
    const toks = tokenize('hello [name(%#)] world');
    expect(toks[0]).toMatchObject({ type: 'TEXT', value: 'hello' });
    expect(toks[1]).toMatchObject({ type: 'TEXT', value: ' ' });
    expect(toks[2]).toMatchObject({ type: 'LBRACKET' });
    expect(toks[3]).toMatchObject({ type: 'FNAME', value: 'name' });
  });

  it('escaped args do not break tokenization', () => {
    // add(\(1\),2) — literal (1) as first arg
    const toks = tokenize('add(\\(1\\),2)');
    expect(toks[0]).toMatchObject({ type: 'FNAME', value: 'add' });
    expect(toks[2]).toMatchObject({ type: 'ESC', value: '(' });
    // The ')' after ESC('(')...TEXT('1')...ESC(')') is RPAREN for add
  });
});
