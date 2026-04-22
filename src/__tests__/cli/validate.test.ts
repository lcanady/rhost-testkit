import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';
import { runValidateCli } from '../../cli/validate';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-validate-test-'));
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

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

describe('rhost-testkit validate --help', () => {
  it('exits 0 and prints usage', () => {
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['--help']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('USAGE'));
  });

  it('-h is an alias for --help', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['-h']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// No arguments
// ---------------------------------------------------------------------------

describe('rhost-testkit validate — no arguments', () => {
  it('exits 1 and prints an error when no expression or --file is given', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli([]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Valid expression
// ---------------------------------------------------------------------------

describe('rhost-testkit validate — valid expression', () => {
  it('exits 0 for a well-formed expression', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['add(2,3)']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 for a nested function call', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['add(mul(2,3),4)']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Invalid expression
// ---------------------------------------------------------------------------

describe('rhost-testkit validate — invalid expression', () => {
  it('exits 1 for an unclosed parenthesis (E001)', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['add(2,3']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 for too many arguments (E007)', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['abs(1,2)']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// --file flag
// ---------------------------------------------------------------------------

describe('rhost-testkit validate --file', () => {
  it('exits 0 when validating a file with a valid expression', () => {
    const filePath = writeTmpFile('valid.mush', 'add(2,3)');
    const exitSpy  = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['--file', filePath]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 when validating a file with an invalid expression', () => {
    const filePath = writeTmpFile('bad.mush', 'add(2,3');
    const exitSpy  = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['--file', filePath]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 when the file does not exist', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runValidateCli(['--file', path.join(tmpDir, 'nonexistent.mush')]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('-f is an alias for --file', () => {
    const filePath = writeTmpFile('valid.mush', 'add(2,3)');
    const exitSpy  = mockExit();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['-f', filePath]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// --json output
// ---------------------------------------------------------------------------

describe('rhost-testkit validate --json', () => {
  it('outputs a JSON object with a "valid" field for a valid expression', () => {
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['--json', 'add(2,3)']);
    } catch {}
    const jsonStr = logSpy.mock.calls[0][0] as string;
    const result  = JSON.parse(jsonStr) as { valid: boolean };
    expect(result.valid).toBe(true);
  });

  it('outputs a JSON object with valid=false for an invalid expression', () => {
    const exitSpy = mockExit();
    const logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runValidateCli(['--json', 'add(2,3']);
    } catch {}
    const jsonStr = logSpy.mock.calls[0][0] as string;
    const result  = JSON.parse(jsonStr) as { valid: boolean; diagnostics: unknown[] };
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusivity
// ---------------------------------------------------------------------------

describe('rhost-testkit validate — expression and --file mutual exclusion', () => {
  it('exits 1 when both an expression and --file are given', () => {
    const filePath = writeTmpFile('valid.mush', 'add(2,3)');
    const exitSpy  = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runValidateCli(['add(2,3)', '--file', filePath]);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Unknown option
// ---------------------------------------------------------------------------

describe('rhost-testkit validate — unknown option', () => {
  it('exits 1 for an unrecognised flag', () => {
    const exitSpy = mockExit();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runValidateCli(['--bogus']);
    } catch {}
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
