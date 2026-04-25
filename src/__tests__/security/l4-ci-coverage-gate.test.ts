/**
 * SECURITY EXPLOIT TEST — L-4: No coverage threshold enforced in CI
 *
 * Vulnerability: security-tests.yml runs `npx jest --testPathPattern='security/'`
 * without a coverage flag or threshold. Coverage can silently regress —
 * a developer could remove security tests and CI would still pass.
 *
 * Fix: Add --coverage and --coverageThreshold to the full test run in CI,
 * or add a jest.config coverage threshold so the threshold is always enforced.
 */

import * as fs from 'fs';
import * as path from 'path';

const PKG = path.resolve(__dirname, '../../../package.json');
const SECURITY_WORKFLOW = path.resolve(__dirname, '../../../.github/workflows/security-tests.yml');

describe('L-4: CI must enforce a coverage threshold', () => {
    it('package.json jest config must declare a coverageThreshold', () => {
        const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
        const threshold = pkg?.jest?.coverageThreshold;
        expect(threshold).toBeDefined();
        // Must require at least 80% line coverage globally
        const global = threshold?.global ?? {};
        const lines = global.lines ?? global.statements ?? 0;
        expect(lines).toBeGreaterThanOrEqual(80);
    });

    it('security-tests workflow must run the full test suite (not just security subset)', () => {
        const src = fs.readFileSync(SECURITY_WORKFLOW, 'utf8');
        // Must have a step that runs npm test (the full suite) — already present
        expect(src).toMatch(/npm test|npm run test/);
    });
});
