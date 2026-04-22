import { lintContent } from '../../validator/mush-lint';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEP       = '@@ ' + '='.repeat(75);                    // 78 chars
const UNINSTALL = '@@ ---[ UNINSTALL ]---' + '-'.repeat(56); // 78 chars

function makeInstaller(
  body: string,
  opts: {
    header?: boolean; footer?: boolean; uninstall?: boolean;
    version?: boolean; requires?: boolean;
  } = {}
): string {
  const {
    header    = true,
    footer    = true,
    uninstall = true,
    version   = true,
    requires  = true,
  } = opts;
  return [
    SEP,
    header    ? '@@ Mushcode Installer for: Test' : null,
    version   ? '@@ Version: 1.0.0'               : null,
    requires  ? '@@ Requires: None'               : null,
    SEP,
    body || null,
    uninstall ? UNINSTALL                         : null,
    footer    ? '@@ [END OF FILE]'                : null,
  ].filter((l): l is string => l !== null).join('\n');
}

function hasDiag(content: string, code: string): boolean {
  return lintContent(content).diagnostics.some(d => d.code === code);
}

// ---------------------------------------------------------------------------
// S1 — Bare user input in @pemit / @emit
// ---------------------------------------------------------------------------

describe('S1 — bare user input in output commands', () => {
  it('flags bare %0 in @pemit value', () => {
    expect(hasDiag('&CMD_TEST me=$+test *:@pemit %#=%0', 'S1')).toBe(true);
  });

  it('flags bare %1 in @pemit value', () => {
    expect(hasDiag('&CMD_TEST me=$+test *:@pemit %#=%1', 'S1')).toBe(true);
  });

  it('does not flag %0 wrapped in a function call', () => {
    expect(hasDiag('&CMD_TEST me=$+test *:@pemit %#=[name(%0)]', 'S1')).toBe(false);
  });

  it('does not flag %# (not a user-input code)', () => {
    expect(hasDiag('&CMD_TEST me=$+test *:@pemit %#=%#', 'S1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S2 — @create without @lock
// ---------------------------------------------------------------------------

describe('S2 — @create without @lock', () => {
  it('flags @create with no corresponding @lock', () => {
    expect(hasDiag('@create MyObject', 'S2')).toBe(true);
  });

  it('does not flag @create when @lock follows', () => {
    expect(hasDiag('@create MyObject\n@lock MyObject=owner', 'S2')).toBe(false);
  });

  it('does not flag when no @create exists', () => {
    expect(hasDiag('@lock SomeObj=flag', 'S2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S3 — execscript() with user input
// ---------------------------------------------------------------------------

describe('S3 — execscript() with user input', () => {
  it('flags execscript() whose first arg contains %0', () => {
    expect(hasDiag('&CMD_EXEC me=$+exec *:[execscript(%0,/path)]', 'S3')).toBe(true);
  });

  it('does not flag execscript() with a safe literal first arg', () => {
    expect(hasDiag('&CMD_EXEC me=$+exec *:[execscript(safe,/path)]', 'S3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S4 — User input in @switch case label
// ---------------------------------------------------------------------------

describe('S4 — user input in @switch case label', () => {
  it('flags %0 appearing as a case label value', () => {
    expect(hasDiag('&CMD_TEST me=$+test *:@switch %1=%0,{@pemit %#=yes}', 'S4')).toBe(true);
  });

  it('does not flag @switch with literal case labels only', () => {
    const content = '&CMD_TEST me=$+test *:@switch %0=yes,{@pemit %#=done},no,{@pemit %#=nope}';
    expect(hasDiag(content, 'S4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S5 — Hardcoded dbref in HELP* attributes
// ---------------------------------------------------------------------------

describe('S5 — hardcoded dbref in HELP* attrs', () => {
  it('flags #dbref in a HELP attribute value', () => {
    expect(hasDiag('&HELP_TEST me=See #42 for more info', 'S5')).toBe(true);
  });

  it('does not flag #dbref in non-HELP attributes', () => {
    expect(hasDiag('&CMD_TEST me=#42', 'S5')).toBe(false);
  });

  it('does not flag a HELP attr with no dbref', () => {
    expect(hasDiag('&HELP_TEST me=Just plain text', 'S5')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C1 — FN_* without input guard
// ---------------------------------------------------------------------------

describe('C1 — FN_* without input guard', () => {
  it('flags FN_* that uses %0 without an if/ifelse guard', () => {
    expect(hasDiag('&FN_DOUBLE me=[mul(%0,2)]', 'C1')).toBe(true);
  });

  it('does not flag FN_* guarded with if()', () => {
    expect(hasDiag('&FN_DOUBLE me=[if(%0,[mul(%0,2)],#-1 MISSING ARG)]', 'C1')).toBe(false);
  });

  it('does not flag FN_* that does not use %0-%9', () => {
    expect(hasDiag('&FN_VERSION me=[v(D_VERSION)]', 'C1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C2 — CMD_* with no HELP entry
// ---------------------------------------------------------------------------

describe('C2 — CMD_* with no HELP entry', () => {
  it('flags CMD_FOO when no HELP_FOO or HELPFOO exists', () => {
    expect(hasDiag('&CMD_FOO me=$+foo:@pemit %#=hi', 'C2')).toBe(true);
  });

  it('does not flag CMD_FOO when HELP_FOO exists', () => {
    const content = '&CMD_FOO me=$+foo:@pemit %#=hi\n&HELP_FOO me=Help text';
    expect(hasDiag(content, 'C2')).toBe(false);
  });

  it('does not flag CMD_FOO when HELPFOO exists (no underscore)', () => {
    const content = '&CMD_FOO me=$+foo:@pemit %#=hi\n&HELPFOO me=Help text';
    expect(hasDiag(content, 'C2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C3 — Installer missing header/footer markers
// ---------------------------------------------------------------------------

describe('C3 — installer header/footer structure', () => {
  it('flags missing "@@ Mushcode Installer for:" header', () => {
    const content = makeInstaller('', { header: false });
    expect(hasDiag(content, 'C3')).toBe(true);
  });

  it('flags missing "@@ [END OF FILE]" footer', () => {
    const content = makeInstaller('', { footer: false });
    expect(hasDiag(content, 'C3')).toBe(true);
  });

  it('does not flag a complete installer', () => {
    const content = makeInstaller('');
    expect(hasDiag(content, 'C3')).toBe(false);
  });

  it('does not run installer checks on plain .mush files', () => {
    expect(hasDiag('&CMD_TEST me=$+test:@pemit %#=hi\n', 'C3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C4 — Installer missing UNINSTALL section
// ---------------------------------------------------------------------------

describe('C4 — missing UNINSTALL section', () => {
  it('flags installer with no UNINSTALL block', () => {
    const content = makeInstaller('', { uninstall: false });
    expect(hasDiag(content, 'C4')).toBe(true);
  });

  it('does not flag when UNINSTALL block is present', () => {
    const content = makeInstaller('');
    expect(hasDiag(content, 'C4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F1 — @@ comment line > 78 chars
// ---------------------------------------------------------------------------

describe('F1 — long @@ comment lines', () => {
  it('flags a @@ comment line exceeding 78 chars', () => {
    const longLine = '@@ ' + 'x'.repeat(76);  // 79 chars, not a separator
    const content = makeInstaller(longLine);
    expect(hasDiag(content, 'F1')).toBe(true);
  });

  it('does not flag a @@ comment line of exactly 78 chars', () => {
    const line78 = '@@ ' + 'a'.repeat(75);   // 78 chars, not a separator
    expect(line78.length).toBe(78);
    const content = makeInstaller(line78);
    expect(hasDiag(content, 'F1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F2 — Separator line not exactly 78 chars
// ---------------------------------------------------------------------------

describe('F2 — separator line length', () => {
  it('flags a @@ === separator that is not 78 chars', () => {
    const shortSep = '@@ ' + '='.repeat(10);  // 13 chars
    const content = makeInstaller(shortSep);
    expect(hasDiag(content, 'F2')).toBe(true);
  });

  it('does not flag the standard 78-char separator', () => {
    const content = makeInstaller('');
    expect(hasDiag(content, 'F2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F3 — Wrong attribute order
// ---------------------------------------------------------------------------

describe('F3 — wrong attribute order', () => {
  it('flags CMD_* that follows HELP* on the same object', () => {
    const content = '&HELP_FOO me=Help text\n&CMD_FOO me=$+foo:@pemit %#=hi';
    expect(hasDiag(content, 'F3')).toBe(true);
  });

  it('does not flag correct Config → UDF → Command → Help order', () => {
    const content = [
      '&D_VERSION me=1.0',
      '&FN_FOO me=[add(1,2)]',
      '&CMD_FOO me=$+foo:@pemit %#=hi',
      '&HELP_FOO me=Help',
    ].join('\n');
    expect(hasDiag(content, 'F3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F4 — Comment style mismatch
// ---------------------------------------------------------------------------

describe('F4 — comment style mismatch', () => {
  it('flags // comment lines in an installer file', () => {
    const content = makeInstaller('// This should be a @@ comment');
    expect(hasDiag(content, 'F4')).toBe(true);
  });

  it('flags ## comment lines in an installer file', () => {
    const content = makeInstaller('## This should be a @@ comment');
    expect(hasDiag(content, 'F4')).toBe(true);
  });

  it('does not flag proper @@ comment lines', () => {
    const content = makeInstaller('@@ This is a proper comment');
    expect(hasDiag(content, 'F4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L1 — Attribute body > 7500 chars
// ---------------------------------------------------------------------------

describe('L1 — attribute body exceeds 7500 chars', () => {
  it('flags an attribute with > 7500 char value', () => {
    const content = `&BIG_ATTR me=${'x'.repeat(7501)}`;
    expect(hasDiag(content, 'L1')).toBe(true);
  });

  it('does not flag an attribute with exactly 7500 chars', () => {
    const content = `&BIG_ATTR me=${'x'.repeat(7500)}`;
    expect(hasDiag(content, 'L1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I1 — Attribute name not uppercase
// ---------------------------------------------------------------------------

describe('I1 — attribute name not uppercase', () => {
  it('flags a lowercase attribute name', () => {
    expect(hasDiag('&cmd_test me=hi', 'I1')).toBe(true);
  });

  it('flags a mixed-case attribute name', () => {
    expect(hasDiag('&Cmd_Test me=hi', 'I1')).toBe(true);
  });

  it('does not flag an uppercase attribute name', () => {
    expect(hasDiag('&CMD_TEST me=hi', 'I1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I2 — No Version field in installer header
// ---------------------------------------------------------------------------

describe('I2 — missing Version in installer header', () => {
  it('flags installer without @@ Version:', () => {
    const content = makeInstaller('', { version: false });
    expect(hasDiag(content, 'I2')).toBe(true);
  });

  it('does not flag installer with @@ Version:', () => {
    const content = makeInstaller('');
    expect(hasDiag(content, 'I2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I3 — No Requires field in installer header
// ---------------------------------------------------------------------------

describe('I3 — missing Requires in installer header', () => {
  it('flags installer without @@ Requires:', () => {
    const content = makeInstaller('', { requires: false });
    expect(hasDiag(content, 'I3')).toBe(true);
  });

  it('does not flag installer with @@ Requires:', () => {
    const content = makeInstaller('');
    expect(hasDiag(content, 'I3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lintContent result shape
// ---------------------------------------------------------------------------

describe('lintContent result shape', () => {
  it('returns errors/warnings/infos counts', () => {
    const result = lintContent('@create Foo');
    expect(result.errors).toBeGreaterThan(0);
    expect(typeof result.warnings).toBe('number');
    expect(typeof result.infos).toBe('number');
  });

  it('sorts diagnostics by line number', () => {
    const content = [
      '&CMD_FOO me=$+foo:@pemit %#=hi',
      '&BIG_ATTR me=' + 'x'.repeat(7501),
    ].join('\n');
    const { diagnostics } = lintContent(content);
    for (let i = 1; i < diagnostics.length; i++) {
      expect(diagnostics[i].line).toBeGreaterThanOrEqual(diagnostics[i - 1].line);
    }
  });

  it('returns zero errors for a clean .mush file', () => {
    const content = [
      '&CMD_FOO me=$+foo:@pemit %#=[name(%0)]',
      '&HELP_FOO me=Foo does things',
    ].join('\n');
    expect(lintContent(content).errors).toBe(0);
  });

  it('accepts an optional filename parameter without error', () => {
    const result = lintContent('&CMD_TEST me=hi', 'test.mush');
    expect(result).toBeDefined();
  });
});
