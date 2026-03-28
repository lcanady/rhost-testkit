// ---------------------------------------------------------------------------
// Softcode Formatter — TDD tests
// ---------------------------------------------------------------------------

import { format } from '../../validator/formatter';

// ---------------------------------------------------------------------------
// Compact mode (default): strip extra whitespace around ( , )
// ---------------------------------------------------------------------------

describe('format — compact mode (default)', () => {
  it('passes through a clean expression unchanged', () => {
    const result = format('add(2,3)');
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(false);
  });

  it('strips a space after the opening paren', () => {
    const result = format('add( 2,3)');
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(true);
  });

  it('strips a space before the closing paren', () => {
    const result = format('add(2,3 )');
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(true);
  });

  it('strips spaces after commas', () => {
    const result = format('add(2, 3)');
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(true);
  });

  it('strips spaces on both sides of all delimiters', () => {
    const result = format('add( 2 , 3 )');
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(true);
  });

  it('handles nested function calls', () => {
    const result = format('iter( lnum(1,10) , ## )');
    expect(result.formatted).toBe('iter(lnum(1,10),##)');
    expect(result.changed).toBe(true);
  });

  it('handles deeply nested calls', () => {
    const result = format('add( mul( 2, 3 ), div( 10, 5 ) )');
    expect(result.formatted).toBe('add(mul(2,3),div(10,5))');
    expect(result.changed).toBe(true);
  });

  it('preserves substitutions', () => {
    const result = format('pemit( %# , hello world )');
    expect(result.formatted).toBe('pemit(%#,hello world)');
    expect(result.changed).toBe(true);
  });

  it('preserves interior whitespace within argument text', () => {
    // "hello world" — the space in the middle must not be stripped
    const result = format('pemit(%#,hello world)');
    expect(result.formatted).toBe('pemit(%#,hello world)');
    expect(result.changed).toBe(false);
  });

  it('handles a zero-arg function', () => {
    const result = format('rand()');
    expect(result.formatted).toBe('rand()');
    expect(result.changed).toBe(false);
  });

  it('handles a single-arg function', () => {
    const result = format('abs( -5 )');
    expect(result.formatted).toBe('abs(-5)');
    expect(result.changed).toBe(true);
  });

  it('handles bracket eval expressions', () => {
    const result = format('[add( 2, 3 )]');
    expect(result.formatted).toBe('[add(2,3)]');
    expect(result.changed).toBe(true);
  });

  it('handles mixed text + function calls', () => {
    const result = format('Hello, [add( 1, 2 )] world');
    expect(result.formatted).toBe('Hello, [add(1,2)] world');
    expect(result.changed).toBe(true);
  });

  it('handles top-level plain text with no functions', () => {
    const result = format('just some text');
    expect(result.formatted).toBe('just some text');
    expect(result.changed).toBe(false);
  });

  it('handles percent substitutions in arguments', () => {
    const result = format('setq( 0, %# )');
    expect(result.formatted).toBe('setq(0,%#)');
    expect(result.changed).toBe(true);
  });

  it('handles multi-arg mixed content', () => {
    const result = format('switch( %0 , 1, one, 2, two, other )');
    expect(result.formatted).toBe('switch(%0,1,one,2,two,other)');
    expect(result.changed).toBe(true);
  });

  it('normalises function names to lowercase', () => {
    const result = format('ADD(2,3)', { lowercase: true });
    expect(result.formatted).toBe('add(2,3)');
    expect(result.changed).toBe(true);
  });

  it('does not change casing by default', () => {
    const result = format('ADD(2,3)');
    expect(result.formatted).toBe('ADD(2,3)');
    expect(result.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pretty mode: indented for human readability
// ---------------------------------------------------------------------------

describe('format — pretty mode', () => {
  it('formats a simple call with no nesting', () => {
    const result = format('add(2,3)', { pretty: true });
    expect(result.formatted).toBe('add(2,3)');
  });

  it('indents nested function calls', () => {
    const result = format('add(mul(2,3),4)', { pretty: true });
    expect(result.formatted).toBe(
      'add(\n  mul(2,3),\n  4\n)'
    );
    expect(result.changed).toBe(true);
  });

  it('indents deeply nested calls', () => {
    const result = format('add(mul(2,sub(5,1)),4)', { pretty: true });
    expect(result.formatted).toBe(
      'add(\n  mul(\n    2,\n    sub(5,1)\n  ),\n  4\n)'
    );
    expect(result.changed).toBe(true);
  });

  it('does not wrap a single-arg call', () => {
    const result = format('abs(-5)', { pretty: true });
    expect(result.formatted).toBe('abs(-5)');
  });

  it('strips extra spaces even in pretty mode', () => {
    const result = format('add( 2, 3 )', { pretty: true });
    expect(result.formatted).toBe('add(2,3)');
  });
});

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

describe('format — return shape', () => {
  it('returns { formatted, changed } keys', () => {
    const result = format('add(2,3)');
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('changed');
  });

  it('changed is false when input === output', () => {
    expect(format('add(2,3)').changed).toBe(false);
  });

  it('changed is true when output differs', () => {
    expect(format('add( 2, 3 )').changed).toBe(true);
  });
});
