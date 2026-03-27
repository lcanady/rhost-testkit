/**
 * SECURITY EXPLOIT TEST — AI-1: LLM documentation teaches hardcoded credential fallback
 *
 * Vulnerability: Documentation examples that show `process.env.RHOST_PASS ?? 'Nyctasia'`
 * teach an LLM reading the docs that hardcoded password fallbacks are the expected pattern.
 * When an LLM generates test code from this documentation, it will replicate the fallback,
 * exposing the public default password in generated scripts.
 *
 * Fix: All README.md examples must require an explicit env var and fail loudly when absent.
 * No example should contain a fallback to the literal string 'Nyctasia'.
 *
 * AI-3 extension: the same ?? 'Nyctasia' pattern is also forbidden in executable .ts example
 * files (not just docs). An LLM reading source code — not just README — will replicate the
 * pattern from any file it is trained on or given as context.
 */

import * as fs from 'fs';
import * as path from 'path';

const README     = path.resolve(__dirname, '../../../README.md');
const EX_README  = path.resolve(__dirname, '../../..', 'examples/README.md');
const EX_09      = path.resolve(__dirname, '../../..', 'examples/09-api.ts');
const EX_10      = path.resolve(__dirname, '../../..', 'examples/10-lua.ts');

describe('AI-1: README must not teach hardcoded credential fallback patterns', () => {
    let readme: string;
    let exReadme: string;

    beforeAll(() => {
        readme   = fs.readFileSync(README,    'utf8');
        exReadme = fs.readFileSync(EX_README, 'utf8');
    });

    it('README.md must not contain ?? "Nyctasia" fallback in code blocks', () => {
        // The pattern `?? 'Nyctasia'` or `?? "Nyctasia"` in a code block teaches
        // LLMs to replicate credential fallbacks in generated code.
        expect(readme).not.toMatch(/\?\?\s*['"]Nyctasia['"]/);
    });

    it('README.md must show explicit env var requirement (not silent fallback)', () => {
        // Should show fail-fast pattern when RHOST_PASS is absent
        expect(readme).toMatch(/if\s*\(!\s*PASS\)|RHOST_PASS.*required|throw.*RHOST_PASS/i);
    });

    it('README.md runner.run() examples must not embed the literal password Nyctasia', () => {
        // runner.run({ password: 'Nyctasia' }) in docs = LLM copies it verbatim
        expect(readme).not.toMatch(/password:\s*['"]Nyctasia['"]/);
    });

    it('examples/README.md curl command must not embed hardcoded Nyctasia credential', () => {
        // curl --user "#1:Nyctasia" teaches the LLM the password is always Nyctasia
        expect(exReadme).not.toMatch(/--user\s+["']#\d+:Nyctasia['"]/);
    });

    it('examples/README.md curl command must use env var placeholder', () => {
        // Should show ${RHOST_PASS} or $RHOST_PASS instead of the literal
        expect(exReadme).toMatch(/RHOST_PASS/);
    });

    it('README.md must contain a security note before or inside the env var defaults table', () => {
        // Security warning must appear at or near the table that lists Nyctasia as default
        const securityNoteIdx = readme.indexOf('change this');
        const tableIdx        = readme.indexOf('| `RHOST_PASS`');
        expect(securityNoteIdx).toBeGreaterThan(-1);
        expect(tableIdx).toBeGreaterThan(-1);
        // The emphasis ("change this") must appear at or near the table row
        expect(Math.abs(securityNoteIdx - tableIdx)).toBeLessThan(200);
    });
});

// ---------------------------------------------------------------------------
// AI-3: executable example .ts files must not contain ?? 'Nyctasia' fallback
// ---------------------------------------------------------------------------

describe('AI-3: executable example files must not teach hardcoded credential fallback', () => {
    let ex09: string;
    let ex10: string;

    beforeAll(() => {
        ex09 = fs.readFileSync(EX_09, 'utf8');
        ex10 = fs.readFileSync(EX_10, 'utf8');
    });

    it('examples/09-api.ts must not contain ?? "Nyctasia" fallback', () => {
        // LLMs read source files, not just README — the ?? fallback in executable
        // code is just as dangerous as in documentation.
        expect(ex09).not.toMatch(/\?\?\s*['"]Nyctasia['"]/);
    });

    it('examples/09-api.ts must use fail-fast env var pattern', () => {
        expect(ex09).toMatch(/if\s*\(!\s*\w*PASS\w*\)|throw.*RHOST_PASS|RHOST_PASS.*required|process\.exit/i);
    });

    it('examples/10-lua.ts must not contain ?? "Nyctasia" fallback', () => {
        expect(ex10).not.toMatch(/\?\?\s*['"]Nyctasia['"]/);
    });

    it('examples/10-lua.ts must use fail-fast env var pattern', () => {
        expect(ex10).toMatch(/if\s*\(!\s*\w*PASS\w*\)|throw.*RHOST_PASS|RHOST_PASS.*required|process\.exit/i);
    });
});
