/**
 * SECURITY EXPLOIT TEST — L-3: Unpinned GitHub Actions (supply chain risk)
 *
 * Vulnerability: `uses: actions/checkout@v4` uses a mutable version tag.
 * If the v4 tag is moved to a malicious commit, every subsequent CI run
 * executes attacker-controlled code with access to NPM_TOKEN.
 *
 * Fix: Pin every `uses:` to a full commit SHA. The tag can remain as a comment
 * so humans know which version it corresponds to.
 *
 * Reference: ASI09 — Unpinned GitHub Actions (Supply Chain)
 */

import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW_DIR = path.resolve(__dirname, '../../../.github/workflows');

function readWorkflows(): { name: string; src: string }[] {
    if (!fs.existsSync(WORKFLOW_DIR)) return [];
    return fs.readdirSync(WORKFLOW_DIR)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(f => ({ name: f, src: fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8') }));
}

describe('L-3: GitHub Actions must be pinned to full commit SHAs', () => {
    it('no workflow uses a mutable @vN version tag', () => {
        const mutableTagPattern = /uses:\s+\S+@v\d+(\.\d+)*\b(?!\s*#)/gm;
        const violations: string[] = [];

        for (const { name, src } of readWorkflows()) {
            const matches = src.match(mutableTagPattern) ?? [];
            for (const m of matches) {
                violations.push(`${name}: ${m.trim()}`);
            }
        }

        expect(violations).toEqual([]);
    });

    it('no workflow uses a mutable @main or @master branch ref', () => {
        const mutableBranchPattern = /uses:\s+\S+@(main|master)\b/gm;
        const violations: string[] = [];

        for (const { name, src } of readWorkflows()) {
            const matches = src.match(mutableBranchPattern) ?? [];
            for (const m of matches) {
                violations.push(`${name}: ${m.trim()}`);
            }
        }

        expect(violations).toEqual([]);
    });
});
