/**
 * SECURITY EXPLOIT TEST — A-3: client.ts login() space injection
 *
 * Vulnerability: login() constructs "connect <username> <password>" by simple
 * string interpolation.  The MUSH `connect` command is space-delimited: the
 * server takes the first word after `connect` as the character name and the
 * next word as the password.
 *
 * If an attacker supplies a username containing a space, the connect string
 * becomes:
 *
 *   connect wizard realpassword garbage
 *                ↑
 *   server parses:   name = "wizard", password = "realpassword"
 *   caller's password ("garbage") is silently discarded.
 *
 * This allows an attacker to authenticate as *any* character whose name and
 * password they know by embedding them in the username field alone, bypassing
 * whatever password the caller intended.
 *
 * Tabs are equivalent: `connect wizard\trealpassword garbage` has the same
 * effect on servers that normalise whitespace.
 *
 * Fix: reject usernames containing spaces or tabs before constructing the
 * connect command.
 */

import { RhostClient } from '../../client';

// No live server needed — the guard must fire before any bytes are sent.

describe('A-3: client.login() must reject spaces/tabs in username (space-splitting injection)', () => {
    function makeClient(): RhostClient {
        // We never call connect() so no real socket is needed.
        return new RhostClient({ host: '127.0.0.1', port: 9, timeout: 100 });
    }

    it('rejects a username containing a space', async () => {
        const client = makeClient();
        await expect(
            client.login('wizard realpassword', 'garbage')
        ).rejects.toThrow(/invalid/i);
    });

    it('rejects a username containing a tab', async () => {
        const client = makeClient();
        await expect(
            client.login('wizard\trealpassword', 'garbage')
        ).rejects.toThrow(/invalid/i);
    });

    it('rejects a username containing multiple spaces', async () => {
        const client = makeClient();
        await expect(
            client.login('wi  zard', 'pass')
        ).rejects.toThrow(/invalid/i);
    });

    it('rejects a username that is only whitespace', async () => {
        const client = makeClient();
        await expect(
            client.login('   ', 'pass')
        ).rejects.toThrow(/invalid/i);
    });

    it('still rejects newline in username (regression)', async () => {
        const client = makeClient();
        await expect(
            client.login('wiz\nard', 'pass')
        ).rejects.toThrow(/invalid/i);
    });

    it('still rejects newline in password (regression)', async () => {
        const client = makeClient();
        await expect(
            client.login('wizard', 'pass\nINJECTED')
        ).rejects.toThrow(/invalid/i);
    });
});
