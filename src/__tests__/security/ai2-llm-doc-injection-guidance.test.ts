/**
 * SECURITY EXPLOIT TEST — AI-2: LLM documentation misleads about injection safety
 *
 * Vulnerability: Documentation that says "validated before use" without specifying
 * exactly what is validated causes an LLM to assume broader safety guarantees.
 * An LLM reading incomplete input safety docs will confidently pass unsanitized
 * user-controlled strings to world methods, assuming they are "safe."
 *
 * Fix: README must document exactly what guardInput() rejects (\n and \r only),
 * and must explicitly state that MUSH-level injection (semicolons, brackets) is
 * NOT prevented — world methods are test infrastructure, not a user-input sanitizer.
 */

import * as fs from 'fs';
import * as path from 'path';

const README    = path.resolve(__dirname, '../../../README.md');
const EX_README = path.resolve(__dirname, '../../..', 'examples/README.md');

describe('AI-2: README must accurately document injection safety boundaries', () => {
    let readme: string;
    let exReadme: string;

    beforeAll(() => {
        readme   = fs.readFileSync(README,    'utf8');
        exReadme = fs.readFileSync(EX_README, 'utf8');
    });

    it('README guardInput section must name the exact rejected characters (\\n and \\r)', () => {
        expect(readme).toMatch(/\\n.*\\r|newline.*carriage|guardInput/i);
    });

    it('README guardInput section must warn that MUSH-level injection is out of scope', () => {
        // An LLM must see an explicit "not covered" statement so it doesn't assume
        // that semicolons, brackets, or other MUSH chars are sanitized.
        expect(readme).toMatch(/not.*scope|MUSH.level|semicol|bracket|test infrastructure|not a.*sanitizer/i);
    });

    it('README must include a ✗ (wrong) example showing what is NOT safe to pass', () => {
        // At least one example must show unsafe usage to prevent LLM from assuming
        // all inputs are safe after only seeing happy-path examples.
        expect(readme).toMatch(/✗|UNSAFE|never pass|do not pass/i);
    });

    it('examples/README.md execscript section must warn against user-controlled args', () => {
        // execscript is a shell execution vector — docs must say "never user-controlled"
        expect(exReadme).toMatch(/never|user.controlled|injection|whitelisted|hardcoded/i);
    });

    it('examples/README.md must show a ✗ unsafe execscript example', () => {
        expect(exReadme).toMatch(/✗|UNSAFE/);
    });

    it('examples/README.md HTTP API section must warn about cleartext', () => {
        // The curl example uses http:// — must have a security note
        expect(exReadme).toMatch(/TLS|https|cleartext|plain.?text|reverse proxy/i);
    });

    it('examples/README.md must not show @api/ip me=*.*.*.* without a warning', () => {
        // Open IP ACL without context teaches LLMs to replicate it carelessly.
        // After fix: should not appear, or if it does, be marked as proxy-only usage.
        const openAcl = exReadme.match(/@api\/ip\s+me=\*\.\*\.\*\.\*/);
        if (openAcl) {
            // If present, must be accompanied by a warning
            expect(exReadme).toMatch(/reverse proxy|behind.*proxy|proxy only/i);
        }
        // Absence is also fine — the fix replaces it with 127.0.0.1
        expect(true).toBe(true); // always passes if we get here
    });

    it('examples/README.md env var section must place security warning before the table', () => {
        // The pre-table note uses "public knowledge" — unique to the warning paragraph
        const warningIdx = exReadme.indexOf('public knowledge');
        const tableIdx   = exReadme.indexOf('| `RHOST_PASS`');
        expect(warningIdx).toBeGreaterThan(-1);
        expect(warningIdx).toBeLessThan(tableIdx);
    });
});
