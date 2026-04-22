import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';
import { runLintCli } from '../../cli/lint';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-lint-test-'));
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

function writeTmpFile(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const CLEAN_FILE = '&CMD_FOO me=$+foo:@pemit %#=[name(%0)]\n&HELP_FOO me=Foo help\n';

const ERROR_FILE = '&CMD_FOO me=$+foo:@pemit %#=%0\n';   // S1 — bare %0 in @pemit

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

describe('rhost-testkit lint --help', () => {
  it('exits 0 and prints usage', () => {
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['--help'], tmpDir);
    } catch (e: unknown) {
      expect((e as Error).message).toBe('process.exit(0)');
    }
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('USAGE'));
  });

  it('-h is an alias for --help', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['-h'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// File not found
// ---------------------------------------------------------------------------

describe('rhost-testkit lint — file not found', () => {
  it('exits 1 when the file does not exist', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runLintCli(['nonexistent.mush'], tmpDir);
    } catch (e: unknown) {
      expect((e as Error).message).toBe('process.exit(1)');
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Clean file
// ---------------------------------------------------------------------------

describe('rhost-testkit lint — clean file', () => {
  it('exits 0 and prints "clean" for a file with no errors', () => {
    writeTmpFile('clean.mush', CLEAN_FILE);
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['clean.mush'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('clean'));
  });
});

// ---------------------------------------------------------------------------
// File with errors
// ---------------------------------------------------------------------------

describe('rhost-testkit lint — file with errors', () => {
  it('exits 1 when errors are found', () => {
    writeTmpFile('bad.mush', ERROR_FILE);
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['bad.mush'], tmpDir);
    } catch (e: unknown) {
      expect((e as Error).message).toBe('process.exit(1)');
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints a diagnostic table when errors are found', () => {
    writeTmpFile('bad.mush', ERROR_FILE);
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['bad.mush'], tmpDir);
    } catch {}
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('S1');
  });
});

// ---------------------------------------------------------------------------
// --json mode
// ---------------------------------------------------------------------------

describe('rhost-testkit lint --json', () => {
  it('outputs one JSON object per file', () => {
    writeTmpFile('bad.mush', ERROR_FILE);
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['--json', 'bad.mush'], tmpDir);
    } catch {}
    expect(logSpy).toHaveBeenCalledTimes(1);
    const jsonStr = logSpy.mock.calls[0][0] as string;
    const parsed  = JSON.parse(jsonStr) as { file: string; diagnostics: unknown[] };
    expect(parsed).toHaveProperty('file');
    expect(parsed).toHaveProperty('diagnostics');
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
  });

  it('emits separate JSON objects for multiple files', () => {
    writeTmpFile('a.mush', CLEAN_FILE);
    writeTmpFile('b.mush', CLEAN_FILE);
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['--json', 'a.mush', 'b.mush'], tmpDir);
    } catch {}
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// --strict mode
// ---------------------------------------------------------------------------

describe('rhost-testkit lint --strict', () => {
  it('exits 1 on warnings when --strict is set', () => {
    // F3 generates WARN (wrong attribute order)
    const warnFile = '&HELP_FOO me=Help\n&CMD_FOO me=$+foo:@pemit %#=hi\n';
    writeTmpFile('warn.mush', warnFile);
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    let exited = false;
    try {
      runLintCli(['--strict', 'warn.mush'], tmpDir);
    } catch (e: unknown) {
      if ((e as Error).message.startsWith('process.exit(')) exited = true;
    }
    // Strict mode should exit 1 if there are any warnings
    if (exited) {
      expect(exitSpy).toHaveBeenCalledWith(1);
    } else {
      // No warnings were produced — strict had no effect, exits 0
      expect(exitSpy).toHaveBeenCalledWith(0);
    }
  });

  it('exits 0 on a clean file even with --strict', () => {
    writeTmpFile('clean.mush', CLEAN_FILE);
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['--strict', 'clean.mush'], tmpDir);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple files
// ---------------------------------------------------------------------------

describe('rhost-testkit lint — multiple files', () => {
  it('prints a totals line after linting multiple files', () => {
    writeTmpFile('a.mush', CLEAN_FILE);
    writeTmpFile('b.mush', CLEAN_FILE);
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runLintCli(['a.mush', 'b.mush'], tmpDir);
    } catch {}
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Total:');
  });
});
