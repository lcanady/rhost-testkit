/**
 * SECURITY EXPLOIT TEST — L-2: No CI/CD security test gate
 *
 * Vulnerability: there is no GitHub Actions workflow that runs the security
 * test suite on pull requests. The 6 M-1 failures (and any future regressions)
 * would be invisible to reviewers; a broken security fix could be merged without
 * anyone noticing.
 *
 * Fix: add .github/workflows/security-tests.yml that runs
 * `npx jest --testPathPattern='security/'` on every pull request.
 */

import * as fs   from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');

describe('L-2: CI security gate must exist', () => {
    it('.github/workflows/ directory must exist', () => {
        expect(fs.existsSync(WORKFLOW_DIR)).toBe(true);
    });

    it('a security-tests workflow file must exist', () => {
        const files = fs.existsSync(WORKFLOW_DIR) ? fs.readdirSync(WORKFLOW_DIR) : [];
        const hasSecurityWorkflow = files.some(f => f.includes('security'));
        expect(hasSecurityWorkflow).toBe(true);
    });

    it('the security workflow must run on pull_request', () => {
        if (!fs.existsSync(WORKFLOW_DIR)) return;
        const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.includes('security'));
        if (files.length === 0) return;
        const src = fs.readFileSync(path.join(WORKFLOW_DIR, files[0]), 'utf8');
        expect(src).toMatch(/pull_request/);
    });

    it('the security workflow must invoke the jest security tests', () => {
        if (!fs.existsSync(WORKFLOW_DIR)) return;
        const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.includes('security'));
        if (files.length === 0) return;
        const src = fs.readFileSync(path.join(WORKFLOW_DIR, files[0]), 'utf8');
        expect(src).toMatch(/security/);
        expect(src).toMatch(/jest|npm.*test/i);
    });
});
