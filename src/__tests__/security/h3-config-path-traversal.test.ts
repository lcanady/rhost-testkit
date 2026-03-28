/**
 * SECURITY EXPLOIT TEST — H3: rhost.config.json path traversal
 *
 * Vulnerability: loadConfig() resolves scriptsDir and mushConfig with
 * path.resolve(), which accepts absolute paths and "../.." sequences.
 * A malicious rhost.config.json committed to a shared repo could cause
 * arbitrary host directories (e.g. ~/.ssh, /etc) to be copied into a
 * Docker container when another developer runs `npm run test:integration`.
 *
 * Fix: after resolving, assert the path is contained within the project
 * root (searchDir). Throw a clear error if it escapes.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../../config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(config: object): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-audit-'));
    fs.writeFileSync(
        path.join(dir, 'rhost.config.json'),
        JSON.stringify(config),
        'utf8'
    );
    return dir;
}

// ---------------------------------------------------------------------------
// Exploit: scriptsDir escapes project root
// ---------------------------------------------------------------------------

describe('H3 — config path traversal: scriptsDir', () => {
    let tmpDir: string;

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('EXPLOIT: relative traversal (../../..) is rejected', () => {
        tmpDir = makeTmpProject({ scriptsDir: '../../..' });
        expect(() => loadConfig(tmpDir)).toThrow(/outside.*project|path.*traversal|must be within/i);
    });

    it('EXPLOIT: absolute path outside project is rejected', () => {
        tmpDir = makeTmpProject({ scriptsDir: '/etc' });
        expect(() => loadConfig(tmpDir)).toThrow(/outside.*project|path.*traversal|must be within/i);
    });

    it('EXPLOIT: absolute home dir path is rejected', () => {
        tmpDir = makeTmpProject({ scriptsDir: os.homedir() });
        expect(() => loadConfig(tmpDir)).toThrow(/outside.*project|path.*traversal|must be within/i);
    });

    it('safe: relative path within project is accepted', () => {
        tmpDir = makeTmpProject({ scriptsDir: './scripts' });
        const cfg = loadConfig(tmpDir);
        expect(cfg?.scriptsDir).toContain(tmpDir);
    });

    it('safe: nested relative path within project is accepted', () => {
        tmpDir = makeTmpProject({ scriptsDir: 'subdir/scripts' });
        const cfg = loadConfig(tmpDir);
        expect(cfg?.scriptsDir).toContain(tmpDir);
    });
});

// ---------------------------------------------------------------------------
// Exploit: mushConfig escapes project root
// ---------------------------------------------------------------------------

describe('H3 — config path traversal: mushConfig', () => {
    let tmpDir: string;

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('EXPLOIT: relative traversal (../../etc/passwd) is rejected', () => {
        tmpDir = makeTmpProject({ mushConfig: '../../etc/passwd' });
        expect(() => loadConfig(tmpDir)).toThrow(/outside.*project|path.*traversal|must be within/i);
    });

    it('EXPLOIT: absolute path to SSH key is rejected', () => {
        tmpDir = makeTmpProject({ mushConfig: path.join(os.homedir(), '.ssh', 'id_rsa') });
        expect(() => loadConfig(tmpDir)).toThrow(/outside.*project|path.*traversal|must be within/i);
    });

    it('safe: relative mushConfig within project is accepted', () => {
        tmpDir = makeTmpProject({ mushConfig: './mush.conf' });
        const cfg = loadConfig(tmpDir);
        expect(cfg?.mushConfig).toContain(tmpDir);
    });
});
