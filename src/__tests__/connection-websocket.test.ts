/**
 * Unit tests for the WebSocket transport path in MushConnection.
 * The `ws` package is fully mocked — no real network connections are opened.
 */

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mock the `ws` package.
// jest.mock() factories are hoisted before any import/class declaration, so
// we cannot reference a class defined later in this file. Instead we build
// the entire mock inside the factory and expose it via a module-level ref
// that the factory populates through a shared mutable object.
// ---------------------------------------------------------------------------

// Shared mutable reference written by the factory, read by tests.
let lastMockWs: {
    url: string;
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
    terminate: jest.Mock;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    once: (event: string, cb: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    simulateOpen: () => void;
    simulateMessage: (data: string) => void;
} | null = null;

jest.mock('ws', () => {
    const { EventEmitter } = require('events') as typeof import('events');

    const CONNECTING = 0;
    const OPEN = 1;
    const CLOSING = 2;
    const CLOSED = 3;

    class MockWebSocket extends EventEmitter {
        static readonly CONNECTING = CONNECTING;
        static readonly OPEN = OPEN;
        static readonly CLOSING = CLOSING;
        static readonly CLOSED = CLOSED;

        readyState: number;
        url: string;

        send = jest.fn();
        close = jest.fn(function (this: MockWebSocket) {
            this.readyState = CLOSING;
            setImmediate(() => {
                this.readyState = CLOSED;
                this.emit('close');
            });
        });
        terminate = jest.fn(function (this: MockWebSocket) {
            this.readyState = CLOSED;
            this.emit('close');
        });

        constructor(url: string) {
            super();
            this.url = url;
            this.readyState = CONNECTING;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).__lastMockWs = this;
        }

        simulateOpen(): void {
            this.readyState = OPEN;
            this.emit('open');
        }

        simulateMessage(data: string): void {
            this.emit('message', data);
        }
    }

    // CommonJS-style export that also acts as a default export
    const mock = MockWebSocket as typeof MockWebSocket & { default: typeof MockWebSocket };
    mock.default = MockWebSocket;
    return mock;
});

// After the mock is hoisted and registered, pull the instance ref via global
// in a beforeEach so each test gets the latest one.
function getLastWs() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (global as any).__lastMockWs as NonNullable<typeof lastMockWs>;
}

// Now import the modules under test (after mock registration).
import { MushConnection } from '../connection';
import { RhostClient } from '../client';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeConn(options: ConstructorParameters<typeof MushConnection>[2] = {}): MushConnection {
    return new MushConnection('localhost', 4201, options);
}

// Reset the global stub reference before each test.
beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__lastMockWs = null;
});

// ---------------------------------------------------------------------------
// 1. Constructor — useWebSocket flag drives routing (verified via behavior)
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — constructor routing', () => {
    it('routes to connectWebSocket when useWebSocket:true (open fires, connect resolves)', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        expect(ws).not.toBeNull();
        ws.simulateOpen();
        await expect(p).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// 2. connectWebSocket — open fires immediately, connect() resolves
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — connectWebSocket', () => {
    it('resolves when open event fires', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(2000);
        getLastWs().simulateOpen();
        await expect(p).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// 3. URL construction
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — URL construction', () => {
    it('uses ws:// when websocketSecure is not set', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;
        expect(ws.url).toMatch(/^ws:\/\//);
    });

    it('uses wss:// when websocketSecure:true', async () => {
        const conn = makeConn({ useWebSocket: true, websocketSecure: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;
        expect(ws.url).toMatch(/^wss:\/\//);
    });

    it('includes custom websocketPath in URL', async () => {
        const conn = makeConn({ useWebSocket: true, websocketPath: '/mush' });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;
        expect(ws.url).toContain('/mush');
    });
});

// ---------------------------------------------------------------------------
// 4. send() via WebSocket — calls ws.send(), not socket.write()
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — send()', () => {
    it('calls ws.send() when connected via WebSocket', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        conn.send('think add(1,2)');
        expect(ws.send).toHaveBeenCalledWith('think add(1,2)\r\n');
    });

    // ---------------------------------------------------------------------------
    // 5. send() throws when WebSocket is not OPEN
    // ---------------------------------------------------------------------------

    it('throws when WebSocket is not yet connected (null ws)', () => {
        const conn = makeConn({ useWebSocket: true });
        expect(() => conn.send('anything')).toThrow('Not connected');
    });

    it('throws when WebSocket readyState is CLOSING', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        // Manually move to CLOSING without emitting close yet
        // Need to access via the underlying object; our mock exposes readyState directly
        (ws as { readyState: number }).readyState = 2; // CLOSING
        expect(() => conn.send('anything')).toThrow('Not connected');
    });
});

// ---------------------------------------------------------------------------
// 6. close() via WebSocket — calls ws.close(), resolves when close event fires
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — close()', () => {
    it('calls ws.close() and resolves when close event fires', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        const closePromise = conn.close();
        expect(ws.close).toHaveBeenCalled();
        await expect(closePromise).resolves.toBeUndefined();
    });

    it('resolves immediately when ws is already CLOSED', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        (ws as { readyState: number }).readyState = 3; // CLOSED
        await expect(conn.close()).resolves.toBeUndefined();
        // Should NOT call ws.close() again since already closed
        expect(ws.close).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 7. Connect timeout — connect() rejects if open never fires
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — connect timeout', () => {
    it('rejects after timeout when open never fires', async () => {
        jest.useFakeTimers();
        try {
            const conn = makeConn({ useWebSocket: true });
            const p = conn.connect(500);
            jest.advanceTimersByTime(600);
            await expect(p).rejects.toThrow(/timed out after 500ms/);
        } finally {
            jest.useRealTimers();
        }
    });
});

// ---------------------------------------------------------------------------
// 8. Lines queue — message events are parsed into lines and pushed to this.lines
// ---------------------------------------------------------------------------

describe('MushConnection WebSocket — lines queue', () => {
    it('pushes incoming message lines into conn.lines', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        ws.simulateMessage('Hello world\r\n');
        const line = await conn.lines.next(500);
        expect(line).toBe('Hello world');
    });

    it('handles multiple lines in a single message', async () => {
        const conn = makeConn({ useWebSocket: true });
        const p = conn.connect(1000);
        const ws = getLastWs();
        ws.simulateOpen();
        await p;

        ws.simulateMessage('line one\r\nline two\r\n');
        const first = await conn.lines.next(500);
        const second = await conn.lines.next(500);
        expect(first).toBe('line one');
        expect(second).toBe('line two');
    });
});

// ---------------------------------------------------------------------------
// 9. RhostClientOptions propagation
// ---------------------------------------------------------------------------

describe('RhostClient — WebSocket option propagation', () => {
    it('passes useWebSocket, websocketSecure, and websocketPath to MushConnection', async () => {
        const fastClient = new RhostClient({
            useWebSocket: true,
            websocketSecure: true,
            websocketPath: '/ws',
            host: 'localhost',
            port: 4201,
            connectTimeout: 1000,
            bannerTimeout: 50, // short banner drain so test finishes quickly
        });

        const cp = fastClient.connect();
        // Allow the MushConnection constructor + connect() to run
        await Promise.resolve();
        const ws = getLastWs();
        ws.simulateOpen();

        // Banner drain uses conn.lines.next(50ms) — will timeout after 50ms
        // with no messages, which resolves drainBanner normally.
        await expect(cp).resolves.toBeUndefined();

        // Verify URL reflects all three propagated options
        expect(ws.url).toMatch(/^wss:\/\//);
        expect(ws.url).toContain('/ws');
    });
});
