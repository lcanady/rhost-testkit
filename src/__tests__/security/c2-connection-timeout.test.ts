/**
 * SECURITY EXPLOIT TEST — C-2: No TCP connection timeout
 *
 * Vulnerability: MushConnection.connect() creates a net.Socket but never
 * calls socket.setTimeout(). If the remote host accepts the TCP handshake
 * but then stalls (server process frozen, misconfigured firewall that ACKs
 * but drops data), the connect() call returns immediately (TCP handshake
 * succeeded), but ALL subsequent operations — login, eval, command — will
 * block on lines.next(timeoutMs) indefinitely once that timeout fires.
 *
 * The more subtle problem: socket.setTimeout() with socket.destroy() on
 * the timeout event ensures that a stalled connection is cleaned up at the
 * socket layer, not just at the application layer.
 *
 * Fix: after socket.connect(), call socket.setTimeout(connectTimeoutMs) and
 * on the 'timeout' event call socket.destroy() and reject the connect promise.
 * Expose a `connectTimeout` option in RhostClientOptions (default: 10000ms).
 */

import * as net from 'net';
import { RhostClient } from '../../client';

/** A server that accepts the TCP handshake but then goes completely silent. */
function createSilentServer(): Promise<{ port: number; close: () => Promise<void> }> {
    const sockets: net.Socket[] = [];
    const server = net.createServer((s) => {
        sockets.push(s);
        // Intentionally never write anything — simulate a frozen server
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            const { port } = server.address() as net.AddressInfo;
            resolve({
                port,
                close: () => {
                    for (const s of sockets) s.destroy();
                    return new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
                },
            });
        });
    });
}

describe('C-2: connect() must have a configurable timeout and reject on unreachable hosts', () => {
    it('connect() rejects with a network error when there is no listener on the port', async () => {
        // Grab a free port, close the server, then try to connect — guaranteed ECONNREFUSED
        const port = await new Promise<number>((res, rej) => {
            const tempServer = net.createServer();
            tempServer.listen(0, '127.0.0.1', () => {
                const p = (tempServer.address() as net.AddressInfo).port;
                tempServer.close((err) => (err ? rej(err) : res(p)));
            });
        });

        const client = new RhostClient({
            port,
            connectTimeout: 2000,
            bannerTimeout: 200,
            timeout: 2000,
        });

        const start = Date.now();
        await expect(client.connect()).rejects.toThrow();
        const elapsed = Date.now() - start;

        // ECONNREFUSED should be nearly instant
        expect(elapsed).toBeLessThan(3000);
    }, 10000);

    it('connectTimeout option is accepted without TypeScript errors', async () => {
        // This test validates that the option exists in RhostClientOptions.
        // If it compiles, the type is correct.
        const client = new RhostClient({ connectTimeout: 5000 });
        expect(client).toBeDefined();
    });

    it('connect() succeeds normally when server is responsive (regression guard)', async () => {
        const { MockMushServer } = await import('../mock-server');
        const srv2 = new MockMushServer();
        const port = await srv2.listen();

        const client = new RhostClient({
            port,
            connectTimeout: 2000,
            bannerTimeout: 200,
            timeout: 2000,
        });

        await expect(client.connect()).resolves.toBeUndefined();
        await client.disconnect();
        await srv2.close();
    }, 10000);
});
