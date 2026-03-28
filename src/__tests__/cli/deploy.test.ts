import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runDeployCli } from '../../cli/deploy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-deploy-test-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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

describe('rhost-testkit deploy --help', () => {
    it('exits 0 for --help', () => {
        const exitSpy = mockExit();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            expect(() => runDeployCli(['--help'])).toThrow('process.exit(0)');
        } finally {
            exitSpy.mockRestore();
            logSpy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// Missing required flags
// ---------------------------------------------------------------------------

describe('rhost-testkit deploy — missing flags', () => {
    it('exits 1 when --file is missing', () => {
        const exitSpy = mockExit();
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() => runDeployCli([])).toThrow('process.exit(1)');
            expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/--file/i));
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });

    it('exits 1 when --file path does not exist', () => {
        const exitSpy = mockExit();
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() => runDeployCli(['--file', '/nonexistent/path.mush'])).toThrow('process.exit(1)');
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// --dry-run parses the file without connecting
// ---------------------------------------------------------------------------

describe('rhost-testkit deploy --dry-run', () => {
    it('prints the commands that would be applied', () => {
        const file = writeTmpFile('code.mush', '&GREET #42=Hello\n&BYE #42=Goodbye');
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            runDeployCli(['--file', file, '--dry-run']);
            const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
            expect(output).toMatch(/GREET/);
            expect(output).toMatch(/BYE/);
            expect(output).toMatch(/#42/);
        } finally {
            logSpy.mockRestore();
        }
    });

    it('reports the count of commands that would be applied', () => {
        const file = writeTmpFile('code.mush', '&GREET #42=Hello\n&BYE #42=Goodbye');
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            runDeployCli(['--file', file, '--dry-run']);
            const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
            expect(output).toMatch(/2/);
        } finally {
            logSpy.mockRestore();
        }
    });

    it('handles an empty file gracefully in dry-run', () => {
        const file = writeTmpFile('empty.mush', '# just comments\n');
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            runDeployCli(['--file', file, '--dry-run']);
        } finally {
            logSpy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// --parse-only: validate the file and exit
// ---------------------------------------------------------------------------

describe('rhost-testkit deploy --parse-only', () => {
    it('exits 0 for a valid softcode file', () => {
        const file = writeTmpFile('code.mush', '&GREET #42=Hello');
        const exitSpy = mockExit();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            expect(() => runDeployCli(['--file', file, '--parse-only'])).toThrow('process.exit(0)');
        } finally {
            exitSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('exits 1 for a file with no parseable commands', () => {
        const file = writeTmpFile('empty.mush', '# nothing here');
        const exitSpy = mockExit();
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() => runDeployCli(['--file', file, '--parse-only'])).toThrow('process.exit(1)');
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });
});
