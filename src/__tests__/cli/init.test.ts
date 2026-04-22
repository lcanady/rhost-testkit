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
// Project scaffolding (no --ci required)
// ---------------------------------------------------------------------------

describe('rhost-testkit init — project scaffold', () => {
    it('creates softcode/ directory', () => {
        runInitCli([], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'softcode'))).toBe(true);
    });

    it('creates src/__tests__/ directory', () => {
        runInitCli([], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'src', '__tests__'))).toBe(true);
    });

    it('creates dist/ directory', () => {
        runInitCli([], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'dist'))).toBe(true);
    });

    it('writes softcode/example.mush', () => {
        runInitCli([], tmpDir);
        const file = path.join(tmpDir, 'softcode', 'example.mush');
        expect(fs.existsSync(file)).toBe(true);
    });

    it('example.mush contains installer header', () => {
        runInitCli([], tmpDir);
        const content = fs.readFileSync(path.join(tmpDir, 'softcode', 'example.mush'), 'utf8');
        expect(content).toContain('@@ Mushcode Installer for:');
    });

    it('writes src/__tests__/example.test.ts', () => {
        runInitCli([], tmpDir);
        const file = path.join(tmpDir, 'src', '__tests__', 'example.test.ts');
        expect(fs.existsSync(file)).toBe(true);
    });

    it('example.test.ts imports RhostRunner', () => {
        runInitCli([], tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'src', '__tests__', 'example.test.ts'), 'utf8'
        );
        expect(content).toContain('RhostRunner');
    });

    it('does not overwrite existing starter files without --force', () => {
        const file = path.join(tmpDir, 'softcode', 'example.mush');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'SENTINEL', 'utf8');

        runInitCli([], tmpDir);

        expect(fs.readFileSync(file, 'utf8')).toBe('SENTINEL');
    });

    it('overwrites existing starter files with --force', () => {
        const file = path.join(tmpDir, 'softcode', 'example.mush');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'SENTINEL', 'utf8');

        runInitCli(['--force'], tmpDir);

        expect(fs.readFileSync(file, 'utf8')).not.toBe('SENTINEL');
    });
});

// ---------------------------------------------------------------------------
// [dir] positional argument
// ---------------------------------------------------------------------------

describe('rhost-testkit init [dir]', () => {
    it('scaffolds into a named subdirectory', () => {
        runInitCli(['my-project'], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'my-project', 'softcode'))).toBe(true);
    });

    it('creates the named directory if it does not exist', () => {
        const newDir = path.join(tmpDir, 'brand-new');
        expect(fs.existsSync(newDir)).toBe(false);
        runInitCli(['brand-new'], tmpDir);
        expect(fs.existsSync(newDir)).toBe(true);
    });

    it('"." targets the cwd itself', () => {
        runInitCli(['.'], tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'softcode'))).toBe(true);
    });
});

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
// --force behavior for CI files
// ---------------------------------------------------------------------------

describe('rhost-testkit init --force (CI files)', () => {
    it('does not overwrite when file exists and --force is absent', () => {
        runInitCli(['--ci', 'github'], tmpDir);
        const outPath = path.join(tmpDir, '.github', 'workflows', 'mush-tests.yml');
        fs.writeFileSync(outPath, 'SENTINEL_CONTENT', 'utf8');

        runInitCli(['--ci', 'github'], tmpDir);

        expect(fs.readFileSync(outPath, 'utf8')).toBe('SENTINEL_CONTENT');
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
