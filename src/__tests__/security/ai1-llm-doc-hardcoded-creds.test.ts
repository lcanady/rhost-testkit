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
 */

import * as fs from 'fs';
import * as path from 'path';

const README     = path.resolve(__dirname, '../../../README.md');
const EX_README  = path.resolve(__dirname, '../../..', 'examples/README.md');

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
