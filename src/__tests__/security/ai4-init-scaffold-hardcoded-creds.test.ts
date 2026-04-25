/**
 * SECURITY EXPLOIT TEST — AI-4: rhost-testkit init scaffolds a hardcoded password fallback
 *
 * Vulnerability: The EXAMPLE_TEST template in src/cli/init.ts contains
 *   `password: process.env.RHOST_PASS ?? 'potrzebie'`
 * Every project created with `rhost-testkit init` inherits this pattern.
 * If a developer commits the generated file without setting RHOST_PASS, tests
 * silently run with the default credential — and the pattern teaches the wrong habit.
 *
 * Fix: The scaffold must require RHOST_PASS with a fail-fast guard, matching the
 * convention enforced in examples/09-api.ts and examples/10-lua.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const INIT_SRC = path.resolve(__dirname, '../../../src/cli/init.ts');

describe('AI-4: init scaffold must not generate hardcoded credential fallbacks', () => {
    let src: string;

    beforeAll(() => {
        src = fs.readFileSync(INIT_SRC, 'utf8');
    });

    it('scaffold template must not contain ?? fallback to a literal password', () => {
        // Matches `?? 'potrzebie'`, `?? "potrzebie"`, `?? 'Nyctasia'`, etc.
        expect(src).not.toMatch(/RHOST_PASS\s*\?\?\s*['"]\w+['"]/);
    });

    it('scaffold template must include a fail-fast RHOST_PASS guard', () => {
        // Generated test should show: if (!PASS) { ... process.exit(1) }
        expect(src).toMatch(/if\s*\(!\s*\w*PASS\w*\)|RHOST_PASS.*required|process\.exit\(1\)/i);
    });

    it('scaffold template must not embed a literal default password string', () => {
        expect(src).not.toMatch(/password:\s*process\.env\.RHOST_PASS\s*\?\?/);
    });
});
