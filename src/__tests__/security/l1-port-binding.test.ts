/**
 * SECURITY EXPLOIT TEST — L-1: docker-compose.yml binds ports to 0.0.0.0
 *
 * Vulnerability: ports are published as "${RHOST_PORT:-4201}:4201" with no
 * explicit host address. Docker defaults to 0.0.0.0, exposing Telnet (4201)
 * and the cleartext HTTP API (4202) on every network interface. A single
 * firewall misconfiguration or cloud default-allow rule makes them internet-
 * reachable with only the default password as protection.
 *
 * Fix: prefix each port mapping with "127.0.0.1:" so Docker binds to
 * localhost only by default. Operators who need external access must
 * explicitly remove the prefix or use a TLS-terminating reverse proxy.
 */

import * as fs   from 'fs';
import * as path from 'path';

const COMPOSE = path.resolve(__dirname, '../../../../docker-compose.yml');

describe('L-1: docker-compose.yml must bind ports to 127.0.0.1 by default', () => {
    let src: string;
    beforeAll(() => { src = fs.readFileSync(COMPOSE, 'utf8'); });

    it('must not publish the Telnet port to all interfaces (bare port mapping)', () => {
        // A bare "4201:4201" or "${VAR}:4201" with no host IP binds to 0.0.0.0.
        // After fix: mapping starts with "127.0.0.1:" or uses a host-binding env var.
        const bareMapping = /^\s+-\s+"?\$\{RHOST_PORT[^}]*\}:\d+|^\s+-\s+"?\d+:\d+/m;
        expect(src).not.toMatch(bareMapping);
    });

    it('must not publish the HTTP API port to all interfaces (bare port mapping)', () => {
        const bareMapping = /^\s+-\s+"?\$\{RHOST_API_PORT[^}]*\}:\d+|^\s+-\s+"?\d+:\d+/m;
        expect(src).not.toMatch(bareMapping);
    });

    it('Telnet port must be explicitly bound to 127.0.0.1', () => {
        expect(src).toMatch(/127\.0\.0\.1.*4201/);
    });

    it('HTTP API port must be explicitly bound to 127.0.0.1', () => {
        expect(src).toMatch(/127\.0\.0\.1.*4202/);
    });
});
