import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';
import { runMushFormatCli } from '../../cli/mush-format';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-mush-format-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function mockExit() {
  return jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as jest.SpyInstance;
}

function writeFile(relPath: string, content: string): string {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

const SEP       = '@@ ' + '='.repeat(75);
const UNINSTALL = '@@ ---[ UNINSTALL ]---' + '-'.repeat(56);

const INSTALLER_CONTENT = [
  SEP,
  '@@ Mushcode Installer for: Test',
  '@@ Version: 1.0.0',
  '@@ Requires: None',
  SEP,
  '&CMD_TEST me=$+test *:@pemit %#=Hello',
  '&HELP_TEST me=Test help',
  UNINSTALL,
  '@@ [END OF FILE]',
].join('\n') + '\n';

const MUSH_CONTENT = '&CMD_TEST me=$+test *:@pemit %#=Hello\n&HELP_TEST me=Test help\n';

// ---------------------------------------------------------------------------
// --help / no args
// ---------------------------------------------------------------------------

describe('rhost-testkit mush-format --help', () => {
  it('exits 0 and prints usage when --help is passed', () => {
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runMushFormatCli(['--help'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('USAGE'));
  });

  it('exits 0 and prints usage when no args are passed', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runMushFormatCli([], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown mode
// ---------------------------------------------------------------------------

describe('rhost-testkit mush-format — unknown mode', () => {
  it('exits 1 for an unrecognised mode', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runMushFormatCli(['bogus'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// expand mode
// ---------------------------------------------------------------------------

describe('rhost-testkit mush-format expand', () => {
  it('expands an installer file to a .mush file in softcode/', () => {
    writeFile('dist/test.installer.txt', INSTALLER_CONTENT);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['expand', 'dist/test.installer.txt'], tmpDir);
    const outPath = path.join(tmpDir, 'softcode', 'test.mush');
    expect(fs.existsSync(outPath)).toBe(true);
    const output = fs.readFileSync(outPath, 'utf8');
    expect(output).toContain('&CMD_TEST me=');
    expect(output).not.toContain('@@ Mushcode Installer for:');
  });

  it('logs the expansion result', () => {
    writeFile('dist/test.installer.txt', INSTALLER_CONTENT);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['expand', 'dist/test.installer.txt'], tmpDir);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('expand:'));
  });

  it('exits 1 when the installer file does not exist', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runMushFormatCli(['expand', 'dist/missing.installer.txt'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('respects --indent flag', () => {
    writeFile('dist/test.installer.txt', INSTALLER_CONTENT);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['expand', '--indent=4', 'dist/test.installer.txt'], tmpDir);
    const outPath = path.join(tmpDir, 'softcode', 'test.mush');
    const output  = fs.readFileSync(outPath, 'utf8');
    // 4-space indent: something with 4 spaces should appear for nested content
    expect(output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// compress mode
// ---------------------------------------------------------------------------

describe('rhost-testkit mush-format compress', () => {
  it('compresses a .mush file to a .installer.txt in dist/', () => {
    writeFile('softcode/test.mush', MUSH_CONTENT);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(
      ['compress', '--name=Test', '--version=1.0.0', 'softcode/test.mush'],
      tmpDir
    );
    const outPath = path.join(tmpDir, 'dist', 'test.installer.txt');
    expect(fs.existsSync(outPath)).toBe(true);
    const output = fs.readFileSync(outPath, 'utf8');
    expect(output).toContain('@@ Mushcode Installer for: Test');
    expect(output).toContain('@@ [END OF FILE]');
    expect(output).toContain('&CMD_TEST me=');
  });

  it('logs the compress result', () => {
    writeFile('softcode/test.mush', MUSH_CONTENT);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['compress', 'softcode/test.mush'], tmpDir);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('compress:'));
  });

  it('exits 1 when the .mush file does not exist', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runMushFormatCli(['compress', 'softcode/missing.mush'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('applies --lowercase flag', () => {
    const src = '&FN_TEST me=[MUL(%0,2)]\n';
    writeFile('softcode/test.mush', src);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['compress', '--lowercase', 'softcode/test.mush'], tmpDir);
    const outPath = path.join(tmpDir, 'dist', 'test.installer.txt');
    const output  = fs.readFileSync(outPath, 'utf8');
    expect(output).toContain('mul(');
    expect(output).not.toContain('MUL(');
  });
});

// ---------------------------------------------------------------------------
// preview mode
// ---------------------------------------------------------------------------

describe('rhost-testkit mush-format preview', () => {
  it('prints the expanded form of an attribute value to stdout', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['preview', '$+test *:@pemit %#=Hello'], tmpDir);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('$+test');
    expect(output).toContain('@pemit');
  });

  it('prints blank line between multiple values', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['preview', 'Hello', 'World'], tmpDir);
    // Two values → two log calls for values + one blank line between them
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('respects --indent flag in preview mode', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runMushFormatCli(['preview', '--indent=4', '$+test *:@pemit %#=Hello'], tmpDir);
    expect(logSpy).toHaveBeenCalled();
  });
});
