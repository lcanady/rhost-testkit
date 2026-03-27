import { MushConnection } from '../connection';
import { MockMushServer } from './mock-server';

// ---------------------------------------------------------------------------
// send() guard — throws when not connected
// ---------------------------------------------------------------------------

describe('MushConnection.send() guard', () => {
    it('throws "Not connected" before connect() is called', () => {
        const conn = new MushConnection('127.0.0.1', 9999);
        expect(() => conn.send('hello')).toThrow('Not connected');
    });

    it('throws "Not connected" after close()', async () => {
        const server = new MockMushServer();
        const port = await server.listen();
        const conn = new MushConnection('127.0.0.1', port);
        await conn.connect();
        await conn.close();
        expect(() => conn.send('post-close')).toThrow('Not connected');
        await server.close();
    });
});

// ---------------------------------------------------------------------------
// close() idempotent guard
// ---------------------------------------------------------------------------

describe('MushConnection.close() idempotent guard', () => {
    it('resolves without error when called before connect()', async () => {
        const conn = new MushConnection('127.0.0.1', 9999);
        await expect(conn.close()).resolves.toBeUndefined();
    });

    it('resolves without error when called twice on a connected socket', async () => {
        const server = new MockMushServer();
        const port = await server.listen();
        const conn = new MushConnection('127.0.0.1', port);
        await conn.connect();
        await conn.close();
        await expect(conn.close()).resolves.toBeUndefined();
        await server.close();
    });
});

// ---------------------------------------------------------------------------
// AsyncLineQueue.drainSync()
// ---------------------------------------------------------------------------

describe('AsyncLineQueue.drainSync()', () => {
    it('returns empty array when nothing has arrived', () => {
        const conn = new MushConnection('127.0.0.1', 9999);
        expect(conn.lines.drainSync()).toEqual([]);
    });

    it('calling drainSync() twice returns empty array on second call', () => {
        const conn = new MushConnection('127.0.0.1', 9999);
        conn.lines.drainSync();
        expect(conn.lines.drainSync()).toEqual([]);
    });

    it('next() rejects after timeout when no line arrives', async () => {
        const conn = new MushConnection('127.0.0.1', 9999);
        // No connection — nothing will ever push a line.
        await expect(conn.lines.next(50)).rejects.toThrow(/Timed out/);
    });

    it('returns buffered banner lines and empties the buffer', async () => {
        const server = new MockMushServer();
        const port = await server.listen();

        // Connect at the TCP level without going through RhostClient so the
        // banner lines land in the queue and are not consumed by drainBanner().
        const conn = new MushConnection('127.0.0.1', port);
        await conn.connect();
        // Give the banner a moment to arrive in the buffer.
        await new Promise((r) => setTimeout(r, 80));

        const drained = conn.lines.drainSync();
        expect(drained.length).toBeGreaterThan(0);           // banner arrived
        expect(conn.lines.drainSync()).toEqual([]);           // buffer now empty

        await conn.close();
        await server.close();
    });
});
