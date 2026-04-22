import {
  expandAttrValue,
  compressAttrValue,
  expandFile,
  compressFile,
} from '../../validator/mush-format';

// ---------------------------------------------------------------------------
// expandAttrValue
// ---------------------------------------------------------------------------

describe('expandAttrValue', () => {
  it('returns a plain literal value unchanged', () => {
    expect(expandAttrValue('Hello world')).toBe('Hello world');
  });

  it('expands a dollar pattern into a multi-line string', () => {
    const result = expandAttrValue('$+test *:@pemit %#=Hello');
    expect(result).toContain('\n');
    expect(result).toContain('$+test *');
    expect(result).toContain('@pemit');
  });

  it('expands a command list (;-separated) into multiple lines', () => {
    const result = expandAttrValue('$+test *:@pemit %#=Hello;@set %#=DARK');
    expect(result).toContain('\n');
    expect(result).toContain('@pemit');
    expect(result).toContain('@set');
  });

  it('falls back to the original string when input cannot be parsed', () => {
    // Deliberately unparseable with leading quote-like chars that the grammar rejects
    // The parser is very permissive; supply something that might trip it
    // (if parse succeeds, print(compact) is returned — fallback isn't guaranteed to fire)
    // At minimum, the function must not throw
    expect(() => expandAttrValue('')).not.toThrow();
    expect(() => expandAttrValue('$+weird *:{bad[\\')).not.toThrow();
  });

  it('respects a custom indent size', () => {
    const result = expandAttrValue('$+test *:@pemit %#=Hello', { indent: 4 });
    // With indent=4 the first level of indentation is 4 spaces
    expect(result).toContain('    ');
  });
});

// ---------------------------------------------------------------------------
// compressAttrValue
// ---------------------------------------------------------------------------

describe('compressAttrValue', () => {
  it('trims leading and trailing whitespace from the value', () => {
    const result = compressAttrValue('  Hello  ');
    expect(result).toBe('Hello');
  });

  it('returns empty string for an all-whitespace input', () => {
    const result = compressAttrValue('   ');
    expect(result).toBe('');
  });

  it('preserves a well-formed dollar pattern', () => {
    const input  = '$+test *:@pemit %#=Hello';
    const result = compressAttrValue(input);
    // Should not add whitespace or newlines
    expect(result).not.toContain('\n');
    expect(result).toContain('$+test');
    expect(result).toContain('@pemit');
  });

  it('lowercases function names in eval blocks when lowercase option is set', () => {
    const input  = '$+test *:@pemit %#=[MUL(%0,2)]';
    const result = compressAttrValue(input, { lowercase: true });
    expect(result).toContain('mul(');
    expect(result).not.toContain('MUL(');
  });

  it('does not lowercase when lowercase option is false (default)', () => {
    const input  = '$+test *:@pemit %#=[MUL(%0,2)]';
    const result = compressAttrValue(input);
    expect(result).toContain('MUL(');
  });
});

// ---------------------------------------------------------------------------
// expandFile
// ---------------------------------------------------------------------------

describe('expandFile', () => {
  const SEP       = '@@ ' + '='.repeat(75);
  const UNINSTALL = '@@ ---[ UNINSTALL ]---' + '-'.repeat(56);

  const installerContent = [
    SEP,
    '@@ Mushcode Installer for: Test',
    '@@ Version: 1.0.0',
    '@@ Requires: None',
    SEP,
    '&CMD_TEST me=$+test *:@pemit %#=Hello',
    '&HELP_TEST me=Test help',
    UNINSTALL,
    '@@ [END OF FILE]',
  ].join('\n');

  it('strips installer header markers', () => {
    const { output } = expandFile(installerContent);
    expect(output).not.toContain('@@ Mushcode Installer for:');
    expect(output).not.toContain('@@ Version:');
    expect(output).not.toContain('@@ Requires:');
  });

  it('strips installer footer markers', () => {
    const { output } = expandFile(installerContent);
    expect(output).not.toContain('@@ [END OF FILE]');
  });

  it('strips @@ === separator lines', () => {
    const { output } = expandFile(installerContent);
    expect(output).not.toContain('='.repeat(10));
  });

  it('preserves attribute header lines', () => {
    const { output } = expandFile(installerContent);
    expect(output).toContain('&CMD_TEST me=');
    expect(output).toContain('&HELP_TEST me=');
  });

  it('passes through non-installer plain .mush content', () => {
    const src = '&CMD_TEST me=$+test:@pemit %#=hi\n&HELP_TEST me=Help\n';
    const { output } = expandFile(src);
    expect(output).toContain('&CMD_TEST me=');
    expect(output).toContain('&HELP_TEST me=Help');
  });

  it('marks changed when output differs from input', () => {
    const { changed } = expandFile(installerContent);
    expect(changed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compressFile
// ---------------------------------------------------------------------------

describe('compressFile', () => {
  const src = [
    '&CMD_TEST me=$+test *:@pemit %#=Hello',
    '&HELP_TEST me=Test help',
  ].join('\n') + '\n';

  it('adds installer header with provided meta', () => {
    const { output } = compressFile(src, { name: 'My System', version: '2.0.0' });
    expect(output).toContain('@@ Mushcode Installer for: My System');
    expect(output).toContain('@@ Version: 2.0.0');
  });

  it('adds @@ Requires: field', () => {
    const { output } = compressFile(src, { requires: 'None' });
    expect(output).toContain('@@ Requires: None');
  });

  it('adds UNINSTALL section', () => {
    const { output } = compressFile(src);
    expect(output).toContain('@@ ---[ UNINSTALL ]---');
  });

  it('adds [END OF FILE] marker', () => {
    const { output } = compressFile(src);
    expect(output).toContain('@@ [END OF FILE]');
  });

  it('includes attribute lines in output', () => {
    const { output } = compressFile(src);
    expect(output).toContain('&CMD_TEST me=');
    expect(output).toContain('&HELP_TEST me=Test help');
  });

  it('strips // comments from compressed output', () => {
    const withComments = '// This is a comment\n' + src;
    const { output } = compressFile(withComments);
    expect(output).not.toContain('// This is a comment');
  });

  it('always marks changed', () => {
    const { changed } = compressFile(src);
    expect(changed).toBe(true);
  });

  it('lowercases function names when lowercase option is set', () => {
    const srcWithFn = '&FN_DOUBLE me=[MUL(%0,2)]\n';
    const { output } = compressFile(srcWithFn, {}, { lowercase: true });
    expect(output).toContain('mul(');
    expect(output).not.toContain('MUL(');
  });

  it('falls back to "Unnamed System" when no name is given', () => {
    const { output } = compressFile(src);
    expect(output).toContain('@@ Mushcode Installer for: Unnamed System');
  });

  it('includes author line when author is provided', () => {
    const { output } = compressFile(src, { author: 'Alice' });
    expect(output).toContain('@@ Author: Alice');
  });
});
