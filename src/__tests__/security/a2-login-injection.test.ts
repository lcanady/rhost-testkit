/**
 * SECURITY EXPLOIT TEST — A-2: client.ts login() newline injection
 *
 * Vulnerability: login() concatenates username and password directly into
 * "connect <username> <password>" and passes it to connection.send(). Because
 * send() writes raw bytes + \r\n, a \n inside either field splits the TCP
 * stream into multiple protocol lines. The fragment after the \n is executed
 * as a separate command by the server.
 *
 * Example (unfixed):
 *   client.login('Wizard', 'pass\n@pemit me=INJECTED')
 *   → sends: "connect Wizard pass\r\n@pemit me=INJECTED\r\n"
 *   → server sees two lines: "connect Wizard pass" AND "@pemit me=INJECTED"
 *
 * Fix: strip or reject \n and \r from both username and password before
 * constructing the connect command string.
 */

import { MockMushServer } from '../mock-server';
import { RhostClient } from '../../client';

describe('A-2: client.login() must reject newline/CR injection in credentials', () => {
    let srv: MockMushServer;
    let receivedLines: string[];

    beforeEach(async () => {
        receivedLines = [];
        srv = new MockMushServer();

        // Intercept all raw protocol lines the server receives
        const origDispatch = (srv as unknown as { dispatch: (s: unknown, l: string) => void }).dispatch.bind(srv);
        (srv as unknown as { dispatch: (s: unknown, l: string) => void }).dispatch = (socket, line) => {
            receivedLines.push(line);
            origDispatch(socket, line);
        };
    });

    afterEach(async () => {
        await srv.close();
    });

    it('login() rejects password containing \\n (injection into connect command)', async () => {
        const port = await srv.listen();
        const client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();

        await expect(
            client.login('Wizard', 'pass\n@pemit me=INJECTED')
        ).rejects.toThrow(/invalid/i);

        await client.disconnect();
    });

    it('login() rejects password containing \\r', async () => {
        const port = await srv.listen();
        const client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();

        await expect(
            client.login('Wizard', 'pass\rX')
        ).rejects.toThrow(/invalid/i);

        await client.disconnect();
    });

    it('login() rejects username containing \\n', async () => {
        const port = await srv.listen();
        const client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();

        await expect(
            client.login('Wiz\nard', 'pass')
        ).rejects.toThrow(/invalid/i);

        await client.disconnect();
    });

    it('login() rejects username containing \\r', async () => {
        const port = await srv.listen();
        const client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();

        await expect(
            client.login('Wiz\rard', 'pass')
        ).rejects.toThrow(/invalid/i);

        await client.disconnect();
    });

    it('login() accepts normal credentials (regression guard)', async () => {
        const port = await srv.listen();
        const client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();

        // Should succeed — mock responds to "connect" with CONNECTED
        await expect(client.login('Wizard', 'Nyctasia')).resolves.toBeUndefined();

        await client.disconnect();
    });
});
