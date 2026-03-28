/**
 * SECURITY HARDENING TEST — H-3: .env files must be gitignored
 *
 * If a .env file containing RHOST_PASS or other credentials were accidentally
 * created and not gitignored, `git add .` would commit the secrets to history.
 * This test ensures .gitignore explicitly covers .env patterns before that
 * can happen.
 */

import * as fs from 'fs';
import * as path from 'path';

const GITIGNORE = path.resolve(__dirname, '../../../.gitignore');

describe('H-3: .gitignore must exclude .env files', () => {
    let content: string;

    beforeAll(() => {
        content = fs.readFileSync(GITIGNORE, 'utf8');
    });

    it('.gitignore contains a .env entry', () => {
        expect(content).toMatch(/^\.env$/m);
    });

    it('.gitignore contains a .env.* wildcard entry', () => {
        expect(content).toMatch(/^\.env\.\*/m);
    });
});
