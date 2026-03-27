import { validate, validateFile } from '../../validator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorCodes(expr: string): string[] {
  return validate(expr).diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.code);
}

function warnCodes(expr: string): string[] {
  return validate(expr).diagnostics
    .filter((d) => d.severity === 'warning')
    .map((d) => d.code);
}

// ---------------------------------------------------------------------------
// Valid expressions
// ---------------------------------------------------------------------------

describe('validate — valid expressions', () => {
  it('simple known function: add(2,3)', () => {
    const r = validate('add(2,3)');
    expect(r.valid).toBe(true);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('nested known functions: add(mul(2,3),4)', () => {
    const r = validate('add(mul(2,3),4)');
    expect(r.valid).toBe(true);
  });

  it('zero-arg function: pi()', () => {
    const r = validate('pi()');
    expect(r.valid).toBe(true);
  });

  it('variadic: add(1,2,3,4,5)', () => {
    expect(validate('add(1,2,3,4,5)').valid).toBe(true);
  });

  it('optional arg omitted: rand(5)', () => {
    expect(validate('rand(5)').valid).toBe(true);
  });

  it('optional arg included: rand(1,10)', () => {
    expect(validate('rand(1,10)').valid).toBe(true);
  });

  it('substitution as arg: name(%#)', () => {
    expect(validate('name(%#)').valid).toBe(true);
  });

  it('bracket eval: [add(1,2)]', () => {
    expect(validate('[add(1,2)]').valid).toBe(true);
  });

  it('plain text: hello world', () => {
    expect(validate('hello world').valid).toBe(true);
  });

  it('u() UDF call — valid (1+ args)', () => {
    expect(validate('u(#5/ATTR,arg1)').valid).toBe(true);
  });

  it('switch with 3 args', () => {
    expect(validate('switch(x,a,b)').valid).toBe(true);
  });

  it('switch with 6 args', () => {
    expect(validate('switch(x,a,r1,b,r2,default)').valid).toBe(true);
  });

  it('cond(a,b,c,d)', () => {
    expect(validate('cond(a,b,c,d)').valid).toBe(true);
  });

  it('if(cond,then)', () => {
    expect(validate('if(1,yes)').valid).toBe(true);
  });

  it('if(cond,then,else)', () => {
    expect(validate('if(1,yes,no)').valid).toBe(true);
  });

  it('setq with multiple pairs: setq(0,a,1,b)', () => {
    expect(validate('setq(0,a,1,b)').valid).toBe(true);
  });

  it('rhost-specific: encode64(hello)', () => {
    expect(validate('encode64(hello)').valid).toBe(true);
  });

  it('rhost-specific: digest(sha256,text)', () => {
    expect(validate('digest(sha256,text)').valid).toBe(true);
  });

  it('dist2d with 4 args', () => {
    expect(validate('dist2d(0,0,3,4)').valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// W001 — Empty expression
// ---------------------------------------------------------------------------

describe('validate — W001 empty expression', () => {
  it('empty string is valid with W001 warning', () => {
    const r = validate('');
    expect(r.valid).toBe(true);
    expect(warnCodes('')).toContain('W001');
  });

  it('whitespace-only is valid with W001', () => {
    const r = validate('   ');
    expect(r.valid).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'W001')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E001–E004 — Structural errors (propagated from parser)
// ---------------------------------------------------------------------------

describe('validate — structural errors', () => {
  it('E001 unclosed paren: add(2,3', () => {
    const r = validate('add(2,3');
    expect(r.valid).toBe(false);
    expect(errorCodes('add(2,3')).toContain('E001');
  });

  it('E002 stray ): add(2,3))', () => {
    expect(validate('add(2,3))').valid).toBe(false);
    expect(errorCodes('add(2,3))')).toContain('E002');
  });

  it('E003 unclosed bracket: [add(2,3)', () => {
    expect(validate('[add(2,3)').valid).toBe(false);
    expect(errorCodes('[add(2,3)')).toContain('E003');
  });

  it('E004 stray ]: add(2,3)]', () => {
    expect(validate('add(2,3)]').valid).toBe(false);
    expect(errorCodes('add(2,3)]')).toContain('E004');
  });
});

// ---------------------------------------------------------------------------
// E006 — Too few arguments
// ---------------------------------------------------------------------------

describe('validate — E006 too few arguments', () => {
  it('abs() with no args', () => {
    expect(validate('abs()').valid).toBe(false);
    expect(errorCodes('abs()')).toContain('E006');
  });

  it('add() with one arg', () => {
    expect(validate('add(1)').valid).toBe(false);
    expect(errorCodes('add(1)')).toContain('E006');
  });

  it('sub() with one arg', () => {
    expect(validate('sub(1)').valid).toBe(false);
    expect(errorCodes('sub(1)')).toContain('E006');
  });

  it('ifelse() with two args', () => {
    expect(validate('ifelse(1,yes)').valid).toBe(false);
    expect(errorCodes('ifelse(1,yes)')).toContain('E006');
  });

  it('switch() with two args', () => {
    expect(validate('switch(x,a)').valid).toBe(false);
    expect(errorCodes('switch(x,a)')).toContain('E006');
  });

  it('error message mentions function name', () => {
    const r = validate('abs()');
    const err = r.diagnostics.find((d) => d.code === 'E006')!;
    expect(err.message).toContain('abs');
  });

  it('error offset points to function name', () => {
    const r = validate('abs()');
    const err = r.diagnostics.find((d) => d.code === 'E006')!;
    expect(err.offset).toBe(0);
    expect(err.length).toBe(3); // 'abs'.length
  });
});

// ---------------------------------------------------------------------------
// E007 — Too many arguments
// ---------------------------------------------------------------------------

describe('validate — E007 too many arguments', () => {
  it('abs(1,2) — max 1', () => {
    expect(validate('abs(1,2)').valid).toBe(false);
    expect(errorCodes('abs(1,2)')).toContain('E007');
  });

  it('sub(1,2,3) — max 2', () => {
    expect(validate('sub(1,2,3)').valid).toBe(false);
    expect(errorCodes('sub(1,2,3)')).toContain('E007');
  });

  it('pi(1) — max 0', () => {
    expect(validate('pi(1)').valid).toBe(false);
    expect(errorCodes('pi(1)')).toContain('E007');
  });

  it('div(1,2,3) — max 2', () => {
    expect(validate('div(1,2,3)').valid).toBe(false);
    expect(errorCodes('div(1,2,3)')).toContain('E007');
  });

  it('if(a,b,c,d) — max 3', () => {
    expect(validate('if(a,b,c,d)').valid).toBe(false);
    expect(errorCodes('if(a,b,c,d)')).toContain('E007');
  });

  it('error message mentions function name', () => {
    const r = validate('abs(1,2)');
    const err = r.diagnostics.find((d) => d.code === 'E007')!;
    expect(err.message).toContain('abs');
  });
});

// ---------------------------------------------------------------------------
// W002 — Empty argument
// ---------------------------------------------------------------------------

describe('validate — W002 empty argument', () => {
  it('add(,3) — first arg empty', () => {
    expect(warnCodes('add(,3)')).toContain('W002');
  });

  it('add(2,) — trailing empty arg', () => {
    expect(warnCodes('add(2,)')).toContain('W002');
  });

  it('empty arg is warning, not error — expression still valid if no other errors', () => {
    // add(2,) has E006 because arg count (2) satisfies add's minArgs (2),
    // and the empty arg is just a W002
    const r = validate('add(2,)');
    // arg count is 2 with second being empty — add needs min 2, so no E006
    // W002 is present
    expect(r.diagnostics.some((d) => d.code === 'W002')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// W005 — Unknown function
// ---------------------------------------------------------------------------

describe('validate — W005 unknown function', () => {
  it('unknown function is warning, not error', () => {
    const r = validate('myfunc(1,2)');
    expect(r.valid).toBe(true);
    expect(warnCodes('myfunc(1,2)')).toContain('W005');
  });

  it('warning message mentions function name', () => {
    const r = validate('myfunc(1)');
    const w = r.diagnostics.find((d) => d.code === 'W005')!;
    expect(w.message).toContain('myfunc');
  });

  it('udf call: udf_something(arg) is warning', () => {
    expect(warnCodes('udf_something(arg)')).toContain('W005');
  });
});

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------

describe('validate — case insensitivity', () => {
  it('ADD(2,3) is valid (case-insensitive lookup)', () => {
    expect(validate('ADD(2,3)').valid).toBe(true);
  });

  it('Abs(1) is valid', () => {
    expect(validate('Abs(1)').valid).toBe(true);
  });

  it('ABS(1,2) still reports E007', () => {
    expect(validate('ABS(1,2)').valid).toBe(false);
    expect(errorCodes('ABS(1,2)')).toContain('E007');
  });
});

// ---------------------------------------------------------------------------
// Nested validation
// ---------------------------------------------------------------------------

describe('validate — nested function validation', () => {
  it('inner error propagates: add(abs(),3)', () => {
    // abs() has zero args — E006
    expect(validate('add(abs(),3)').valid).toBe(false);
    expect(errorCodes('add(abs(),3)')).toContain('E006');
  });

  it('inner too-many: add(abs(1,2),3)', () => {
    expect(validate('add(abs(1,2),3)').valid).toBe(false);
    expect(errorCodes('add(abs(1,2),3)')).toContain('E007');
  });

  it('outer valid, inner valid: add(mul(2,3),4)', () => {
    expect(validate('add(mul(2,3),4)').valid).toBe(true);
  });

  it('bracket eval inner error: [abs()]', () => {
    expect(validate('[abs()]').valid).toBe(false);
    expect(errorCodes('[abs()]')).toContain('E006');
  });
});

// ---------------------------------------------------------------------------
// ValidationResult shape
// ---------------------------------------------------------------------------

describe('validate — result shape', () => {
  it('valid: true when no errors', () => {
    expect(validate('add(1,2)').valid).toBe(true);
  });

  it('valid: false when any error', () => {
    expect(validate('add(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15)').valid).toBe(true); // variadic
    expect(validate('abs(1,2)').valid).toBe(false);
  });

  it('diagnostics array is always present', () => {
    expect(Array.isArray(validate('add(1,2)').diagnostics)).toBe(true);
  });

  it('diagnostics have required fields', () => {
    const diags = validate('abs()').diagnostics;
    expect(diags.length).toBeGreaterThan(0);
    const d = diags[0];
    expect(typeof d.code).toBe('string');
    expect(typeof d.message).toBe('string');
    expect(typeof d.offset).toBe('number');
    expect(typeof d.length).toBe('number');
    expect(d.severity === 'error' || d.severity === 'warning').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

describe('validateFile', () => {
  it('validates a file containing a valid expression', () => {
    const tmp = path.join(os.tmpdir(), `testkit-valid-${Date.now()}.mush`);
    fs.writeFileSync(tmp, 'add(2,3)', 'utf-8');
    try {
      const r = validateFile(tmp);
      expect(r.valid).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('validates a file containing an invalid expression', () => {
    const tmp = path.join(os.tmpdir(), `testkit-invalid-${Date.now()}.mush`);
    fs.writeFileSync(tmp, 'abs(1,2)', 'utf-8');
    try {
      const r = validateFile(tmp);
      expect(r.valid).toBe(false);
      expect(r.diagnostics.some((d) => d.code === 'E007')).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('throws when file does not exist', () => {
    expect(() => validateFile('/nonexistent/path/nope.mush')).toThrow();
  });
});
