import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInitCli } from '../../cli/init';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-init-test-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Spy on process.exit so it throws instead of killing Jest */
function mockExit() {
    return jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code ?? 0})`);
    }) as jest.SpyInstance;
}

// ---------------------------------------------------------------------------
// GitHub workflow
// ---------------------------------------------------------------------------

describe('rhost-testkit init --ci github', () => {
    it('creates .github/workflows/mush-tests.yml', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const out = path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml');
        expect(fs.existsSync(out)).toBe(true);
    });

    it('output contains actions/setup-node@v4', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml'), 'utf8');
        expect(content).toContain('actions/setup-node@v4');
    });

    it('output contains node-version 20', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml'), 'utf8');
        expect(content).toContain("node-version: '20'");
    });

    it('output contains npm ci', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml'), 'utf8');
        expect(content).toContain('npm ci');
    });

    it('output contains npm test', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml'), 'utf8');
        expect(content).toContain('npm test');
    });

    it('output references the rhostmush docker image', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml'), 'utf8');
        expect(content).toContain('rhostmush/rhostmush');
    });
});

// ---------------------------------------------------------------------------
// GitLab CI
// ---------------------------------------------------------------------------

describe('rhost-testkit init --ci gitlab', () => {
    it('creates .gitlab-ci.yml', () => {
        runInitCli(['--ci', 'gitlab'], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, '.gitlab-ci.yml'))).toBe(true);
    });

    it('output contains image: node:20', () => {
        runInitCli(['--ci', 'gitlab'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'utf8');
        expect(content).toContain('node:20');
    });

    it('output contains npm ci', () => {
        runInitCli(['--ci', 'gitlab'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'utf8');
        expect(content).toContain('npm ci');
    });

    it('output contains npm test', () => {
        runInitCli(['--ci', 'gitlab'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'utf8');
        expect(content).toContain('npm test');
    });

    it('output references the rhostmush docker image', () => {
        runInitCli(['--ci', 'gitlab'], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'utf8');
        expect(content).toContain('rhostmush/rhostmush');
    });
});

// ---------------------------------------------------------------------------
// --force behavior
// ---------------------------------------------------------------------------

describe('rhost-testkit init --force', () => {
    it('warns and does not overwrite when file exists and --force is absent', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const outPath = path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml');
        fs.writeFileSync(outPath, 'SENTINEL_CONTENT', 'utf8');

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const exitSpy = mockExit();

        try {
            expect(() => runInitCli(['--ci', 'github'], tmpDir)).toThrow('process.exit(0)');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/already exists/i));
            expect(fs.readFileSync(outPath, 'utf8')).toBe('SENTINEL_CONTENT');
        } finally {
            warnSpy.mockRestore();
            exitSpy.mockRestore();
        }
    });

    it('overwrites existing file when --force is present', () => {
        const outPath = path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, 'SENTINEL_CONTENT', 'utf8');

        runInitCli(['--ci', 'github', '--force'], tmpDir);

        const content = fs.readFileSync(outPath, 'utf8');
        expect(content).not.toContain('SENTINEL_CONTENT');
        expect(content).toContain('setup-node@v4');
    });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('rhost-testkit init — error cases', () => {
    it('exits 1 for unknown --ci platform', () => {
        const exitSpy = mockExit();
        try {
            expect(() => runInitCli(['--ci', 'bitbucket'], tmpDir)).toThrow('process.exit(1)');
        } finally {
            exitSpy.mockRestore();
        }
    });

    it('exits 1 when --ci flag is missing', () => {
        const exitSpy = mockExit();
        try {
            expect(() => runInitCli([], tmpDir)).toThrow('process.exit(1)');
        } finally {
            exitSpy.mockRestore();
        }
    });

    it('exits 0 for --help', () => {
        const exitSpy = mockExit();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            expect(() => runInitCli(['--help'], tmpDir)).toThrow('process.exit(0)');
        } finally {
            exitSpy.mockRestore();
            logSpy.mockRestore();
        }
    });
});
