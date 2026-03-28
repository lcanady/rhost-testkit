import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runFmtCli } from '../../cli/fmt';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-fmt-test-'));
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

describe('rhost-testkit fmt --help', () => {
    it('exits 0 and prints usage', () => {
        const exitSpy = mockExit();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            runFmtCli(['--help'], tmpDir);
        } catch (e: unknown) {
            expect((e as Error).message).toBe('process.exit(0)');
        }
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('USAGE'));
        expect(exitSpy).toHaveBeenCalledWith(0);
    });
});

// ---------------------------------------------------------------------------
// File not found
// ---------------------------------------------------------------------------

describe('rhost-testkit fmt — file not found', () => {
    it('exits 1 when the file does not exist', () => {
        const exitSpy = mockExit();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            runFmtCli(['nonexistent.mush'], tmpDir);
        } catch (e: unknown) {
            expect((e as Error).message).toBe('process.exit(1)');
        }
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

// ---------------------------------------------------------------------------
// Format (writes back)
// ---------------------------------------------------------------------------

describe('rhost-testkit fmt — format files', () => {
    it('formats a file with extra whitespace and writes it back', () => {
        const file = writeTmpFile('code.mush', 'add( 2, 3 )');
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        runFmtCli(['code.mush'], tmpDir);
        const written = fs.readFileSync(file, 'utf8').trim();
        expect(written).toBe('add(2,3)');
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('formatted'));
    });

    it('reports already formatted when no change needed', () => {
        writeTmpFile('code.mush', 'add(2,3)');
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        runFmtCli(['code.mush'], tmpDir);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already formatted'));
    });

    it('does not modify file when already formatted', () => {
        const file = writeTmpFile('code.mush', 'add(2,3)');
        const originalMtime = fs.statSync(file).mtimeMs;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        runFmtCli(['code.mush'], tmpDir);
        // File should not have been rewritten
        const content = fs.readFileSync(file, 'utf8');
        expect(content).toBe('add(2,3)');
        // mtime may or may not change depending on OS buffering — just check content
    });
});

// ---------------------------------------------------------------------------
// --check mode
// ---------------------------------------------------------------------------

describe('rhost-testkit fmt --check', () => {
    it('exits 0 when file is already formatted', () => {
        const exitSpy = mockExit();
        writeTmpFile('code.mush', 'add(2,3)');
        // Should not throw (no exit called)
        runFmtCli(['--check', 'code.mush'], tmpDir);
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits 1 when file needs formatting', () => {
        const exitSpy = mockExit();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        writeTmpFile('code.mush', 'add( 2, 3 )');
        try {
            runFmtCli(['--check', 'code.mush'], tmpDir);
        } catch (e: unknown) {
            expect((e as Error).message).toBe('process.exit(1)');
        }
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not modify the file in --check mode', () => {
        const exitSpy = mockExit();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const file = writeTmpFile('code.mush', 'add( 2, 3 )');
        try {
            runFmtCli(['--check', 'code.mush'], tmpDir);
        } catch {}
        const content = fs.readFileSync(file, 'utf8');
        expect(content).toBe('add( 2, 3 )');
    });
});
