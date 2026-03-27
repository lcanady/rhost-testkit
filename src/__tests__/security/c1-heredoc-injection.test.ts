/**
 * SECURITY EXPLOIT TEST — C-1: Code injection via shell heredoc expansion
 *
 * Vulnerability: entrypoint.sh expands ${PASS} and ${PORT} directly into
 * Python source code inside a bash heredoc (unquoted PYEOF delimiter).
 * A single quote in RHOST_PASS escapes the string literal and allows
 * arbitrary Python execution inside the container on startup.
 *
 * Proof of concept:
 *   RHOST_PASS="x'; open('/tmp/pwned','w').write('pwned'); pwd='x"
 *   After shell expansion: pwd = 'x'; open('/tmp/pwned','w').write('pwned'); pwd='x'
 *
 * Fix: read credentials via os.environ.get() inside the Python script;
 *      never interpolate arbitrary strings into Python source code.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.resolve(__dirname, '../../../entrypoint.sh');
const MARKER     = path.join(os.tmpdir(), `rhost_sec_c1_${process.pid}`);

afterEach(() => { try { fs.unlinkSync(MARKER); } catch { /* already gone */ } });

// ── Static analysis ──────────────────────────────────────────────────────────

describe('C-1 static: entrypoint.sh must not interpolate shell vars into Python', () => {
    let src: string;
    beforeAll(() => { src = fs.readFileSync(ENTRYPOINT, 'utf8'); });

    it('must not contain pwd = \'${PASS}\' (vulnerable shell interpolation)', () => {
        // RED before fix: this line exists and allows single-quote injection
        expect(src).not.toMatch(/pwd\s*=\s*'\$\{PASS\}'/);
    });

    it('must not contain bare ${PORT} in Python heredoc (injectable integer substitution)', () => {
        // RED before fix: bare ${PORT:-...} inside heredoc is also injectable
        expect(src).not.toMatch(/port\s*=\s*\$\{PORT/);
    });

    it('must use os.environ.get to read RHOST_PASS inside Python', () => {
        // GREEN after fix: credential read safely via env var
        expect(src).toMatch(/os\.environ\.get\(['"]RHOST_PASS/);
    });

    it('must use os.environ.get to read RHOST_PORT inside Python', () => {
        expect(src).toMatch(/os\.environ\.get\(['"]RHOST_PORT/);
    });
});

// ── Behavioral: simulate the injection ──────────────────────────────────────

describe('C-1 behavioral: single-quote RHOST_PASS must not execute arbitrary code', () => {
    const maliciousPass = `x'; open(r'${MARKER}', 'w').write('pwned'); pwd='x`;

    it('injection payload must not create marker file when run through fixed code', () => {
        /**
         * The FIXED entrypoint passes RHOST_PASS as an env var and reads it with
         * os.environ.get() inside Python — never interpolating it into source code.
         * Run the safe equivalent and confirm the malicious string has no side-effect.
         */
        const safeCode = [
            'import os',
            `pwd = os.environ.get('RHOST_PASS', 'Nyctasia')`,
            // If injection worked, the file would be created as a side-effect of
            // parsing the string — but it can't, because we never eval the value.
        ].join('\n');

        child_process.spawnSync('python3', ['-c', safeCode], {
            env: { ...process.env, RHOST_PASS: maliciousPass },
            timeout: 3000,
        });

        expect(fs.existsSync(MARKER)).toBe(false);
    });

    it('injection payload DOES execute when interpolated directly (proves bug exists)', () => {
        /**
         * This demonstrates the vulnerability: when the shell expands ${PASS} into
         * Python source code, a crafted value escapes the string literal.
         * This test intentionally documents the exploit and is expected to PASS
         * (i.e., the marker IS created — proving the old approach is unsafe).
         */
        const expandedCode = `pwd = '${maliciousPass}'`;   // what the shell produces
        child_process.spawnSync('python3', ['-c', expandedCode], { timeout: 3000 });

        // This assertion PASSES — the marker was created by the injected code.
        // It is here to prove the vulnerability is real, not to gate CI.
        expect(fs.existsSync(MARKER)).toBe(true);
    });

    it('RHOST_PORT semicolon injection must not execute arbitrary code', () => {
        const maliciousPort = `4201; open(r'${MARKER}', 'w').write('pwned')`;

        // Fixed: read PORT as an integer from os.environ.get — int() raises ValueError
        // if the value is not a pure integer, so no semicolon payload can survive.
        const safeCode = [
            'import os',
            `port = int(os.environ.get('RHOST_PORT', '4201'))`,
        ].join('\n');

        child_process.spawnSync('python3', ['-c', safeCode], {
            env: { ...process.env, RHOST_PORT: maliciousPort },
            timeout: 3000,
        });

        expect(fs.existsSync(MARKER)).toBe(false);
    });
});
