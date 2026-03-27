/**
 * SECURITY EXPLOIT TEST — M-2: Hardcoded default password with no production warning
 *
 * Vulnerability: The string "Nyctasia" appears as a hardcoded fallback in
 * entrypoint.sh, docker-compose.yml, and example files. There is no warning
 * that this default MUST be changed before exposing the server to any network.
 * A publicly reachable RhostMUSH instance with the default password is
 * immediately pwnable via the Telnet and HTTP API ports.
 *
 * Fix: entrypoint.sh must emit a prominent WARNING when RHOST_PASS is not set
 * (i.e. the default is in use). The examples should also carry a note that
 * the password must be overridden in production.
 */

import * as fs   from 'fs';
import * as path from 'path';

const ENTRYPOINT  = path.resolve(__dirname, '../../../entrypoint.sh');
const COMPOSE     = path.resolve(__dirname, '../../../docker-compose.yml');
const EXAMPLE_09  = path.resolve(__dirname, '../../..', 'examples/09-api.ts');
const EXAMPLE_10  = path.resolve(__dirname, '../../..', 'examples/10-lua.ts');

describe('M-2: default password Nyctasia must warn when unchanged', () => {
    let entrypoint: string;
    let compose: string;
    let src09: string;
    let src10: string;

    beforeAll(() => {
        entrypoint = fs.readFileSync(ENTRYPOINT, 'utf8');
        compose    = fs.readFileSync(COMPOSE, 'utf8');
        src09      = fs.readFileSync(EXAMPLE_09, 'utf8');
        src10      = fs.readFileSync(EXAMPLE_10, 'utf8');
    });

    it('entrypoint.sh must warn when RHOST_PASS is unset (default Nyctasia in use)', () => {
        // RED before fix: no such warning exists
        expect(entrypoint).toMatch(/RHOST_PASS.*warn|warn.*RHOST_PASS|default.*password.*change|change.*default.*password|WARNING.*Nyctasia|Nyctasia.*production/i);
    });

    it('09-api.ts must note that the default password must be changed in production', () => {
        expect(src09).toMatch(/default.*password|password.*default|RHOST_PASS.*production|production.*RHOST_PASS|change.*password|password.*change/i);
    });

    it('10-lua.ts must note that the default password must be changed in production', () => {
        expect(src10).toMatch(/default.*password|password.*default|RHOST_PASS.*production|production.*RHOST_PASS|change.*password|password.*change/i);
    });
});
