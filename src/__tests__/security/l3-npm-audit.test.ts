/**
 * SECURITY EXPLOIT TEST — L-3: npm audit not run in CI
 *
 * Vulnerability: the CI pipeline does not run `npm audit`, so known
 * high/critical CVEs in dependencies could be merged undetected.
 *
 * Fix: the security-tests workflow must include an `npm audit` step
 * with --audit-level=high so that high/critical dependency CVEs
 * fail the build.
 */

import * as fs   from 'fs';
import * as path from 'path';

const WORKFLOW_DIR = path.resolve(__dirname, '../../../.github/workflows');

function readSecurityWorkflow(): string {
    const files = fs.existsSync(WORKFLOW_DIR)
        ? fs.readdirSync(WORKFLOW_DIR).filter(f => f.includes('security'))
        : [];
    if (files.length === 0) return '';
    return fs.readFileSync(path.join(WORKFLOW_DIR, files[0]), 'utf8');
}

describe('L-3: npm audit must be part of CI', () => {
    it('the security workflow must run npm audit', () => {
        const src = readSecurityWorkflow();
        expect(src).toMatch(/npm audit/);
    });

    it('npm audit must use --audit-level=high to block on high/critical CVEs', () => {
        const src = readSecurityWorkflow();
        expect(src).toMatch(/audit-level.*(high|critical)/i);
    });
});
