/**
 * SECURITY EXPLOIT TEST — H-2: HTTP API ACL defaults to all IPs (*.*.*.*)
 *
 * Vulnerability: entrypoint.sh runs `@api/ip me=*.*.*.*` which grants API
 * access from any source IP. If the container port is exposed publicly (e.g.
 * cloud with no security group), the API is reachable from the internet with
 * only a password as protection.
 *
 * Fix: entrypoint.sh should default to 127.0.0.1 (localhost-only). Production
 * operators who need broader access can override via the RHOST_API_ALLOW_IP
 * env var. Both examples (09, 10) must document the IP ACL risk.
 */

import * as fs   from 'fs';
import * as path from 'path';

const ENTRYPOINT = path.resolve(__dirname, '../../../entrypoint.sh');
const EXAMPLE_09 = path.resolve(__dirname, '../../..', 'examples/09-api.ts');
const EXAMPLE_10 = path.resolve(__dirname, '../../..', 'examples/10-lua.ts');

describe('H-2: HTTP API IP ACL must not default to all IPs', () => {
    let entrypoint: string;
    let src09: string;
    let src10: string;

    beforeAll(() => {
        entrypoint = fs.readFileSync(ENTRYPOINT, 'utf8');
        src09      = fs.readFileSync(EXAMPLE_09, 'utf8');
        src10      = fs.readFileSync(EXAMPLE_10, 'utf8');
    });

    it('entrypoint.sh must not hardcode @api/ip me=*.*.*.* without a configurable override', () => {
        // RED before fix: the line is hardcoded with no env-var escape hatch.
        // After fix: it reads RHOST_API_ALLOW_IP (default 127.0.0.1).
        expect(entrypoint).not.toMatch(/@api\/ip me=\*\.\*\.\*\.\*/);
    });

    it('entrypoint.sh must use RHOST_API_ALLOW_IP env var for the IP ACL', () => {
        expect(entrypoint).toMatch(/RHOST_API_ALLOW_IP/);
    });

    it('09-api.ts must document the IP ACL / restrict-in-production guidance', () => {
        expect(src09).toMatch(/restrict.*prod|production.*restrict|IP.*ACL|ACL.*IP|RHOST_API_ALLOW_IP|allow.*IP.*prod/i);
    });

    it('10-lua.ts must document the IP ACL / restrict-in-production guidance', () => {
        expect(src10).toMatch(/restrict.*prod|production.*restrict|IP.*ACL|ACL.*IP|RHOST_API_ALLOW_IP|allow.*IP.*prod/i);
    });
});
