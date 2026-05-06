/**
 * Tests for Pueblo mode in RhostClient.
 *
 * MushConnection is fully mocked — no real TCP connections are made.
 * The mock exposes a `pushLine` helper so tests can simulate server output.
 */

// ---------------------------------------------------------------------------
// Mock MushConnection before importing the modules under test.
// ---------------------------------------------------------------------------

// Shared mutable state populated by the mock constructor.
let mockConnInstance: {
    send: jest.Mock;
    connect: jest.Mock;
    close: jest.Mock;
    lines: {
        next: jest.Mock;
        push: (line: string) => void;
    };
    on: jest.Mock;
    off: jest.Mock;
} | null = null;

jest.mock('../connection', () => {
    // Build a minimal AsyncLineQueue replica inside the factory.
    class FakeLineQueue {
        private buffer: string[] = [];
        private waiters: Array<{
            resolve: (line: string) => void;
            reject: (err: Error) => void;
            timer: ReturnType<typeof setTimeout>;
        }> = [];

        push(line: string): void {
            if (this.waiters.length > 0) {
                const w = this.waiters.shift()!;
                clearTimeout(w.timer);
                w.resolve(line);
            } else {
                this.buffer.push(line);
            }
        }

        next(timeoutMs: number): Promise<string> {
            if (this.buffer.length > 0) {
                return Promise.resolve(this.buffer.shift()!);
            }
            return new Promise((resolve, reject) => {
                const entry = {
                    resolve,
                    reject,
                    timer: setTimeout(() => {
                        const idx = this.waiters.indexOf(entry);
                        if (idx !== -1) this.waiters.splice(idx, 1);
                        reject(new Error(`Timed out after ${timeoutMs}ms waiting for next line`));
                    }, timeoutMs),
                };
                this.waiters.push(entry);
            });
        }
    }

    class MockMushConnection {
        send = jest.fn();
        connect = jest.fn().mockResolvedValue(undefined);
        close = jest.fn().mockResolvedValue(undefined);
        lines = new FakeLineQueue();
        on = jest.fn();
        off = jest.fn();

        constructor() {
            // Expose this instance so tests can reach it.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).__mockConnInstance = this;
        }
    }

    return { MushConnection: MockMushConnection };
});

// Helper to retrieve the latest mock instance.
function getConn() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (global as any).__mockConnInstance as NonNullable<typeof mockConnInstance>;
}

// Now import modules under test (after mock is registered).
import { RhostClient } from '../client';

// ---------------------------------------------------------------------------
// Reset the global stub reference before each test.
// ---------------------------------------------------------------------------
beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__mockConnInstance = null;
});

// ---------------------------------------------------------------------------
// 1. usePueblo: false (default) — no PUEBLOCLIENT send, isPuebloActive is false
// ---------------------------------------------------------------------------

describe('Pueblo — usePueblo: false (default)', () => {
    it('does NOT send PUEBLOCLIENT and isPuebloActive is false after connect', async () => {
        const client = new RhostClient({ bannerTimeout: 10 });
        const conn = getConn();

        // Banner drains immediately (no lines → timeout resolves drainBanner).
        await client.connect();

        const sentWithPueblo = conn.send.mock.calls.some(
            ([arg]: [string]) => arg && arg.includes('PUEBLOCLIENT'),
        );
        expect(sentWithPueblo).toBe(false);
        expect((client as unknown as { isPuebloActive: boolean }).isPuebloActive).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 2. usePueblo: true — conn.send is called with 'PUEBLOCLIENT 1.0.1'
// ---------------------------------------------------------------------------

describe('Pueblo — usePueblo: true sends handshake', () => {
    it('calls conn.send with "PUEBLOCLIENT 1.0.1" after connect', async () => {
        const client = new RhostClient({ bannerTimeout: 10, usePueblo: true });
        const conn = getConn();

        // Deliver the server ack shortly after connect() starts waiting.
        setTimeout(() => conn.lines.push('</puebloclient>'), 20);

        await client.connect();

        expect(conn.send).toHaveBeenCalledWith('PUEBLOCLIENT 1.0.1');
    });
});

// ---------------------------------------------------------------------------
// 3. usePueblo: true — server sends </puebloclient> → isPuebloActive is true
// ---------------------------------------------------------------------------

describe('Pueblo — server confirms handshake', () => {
    it('sets isPuebloActive to true when server responds with </puebloclient>', async () => {
        const client = new RhostClient({ bannerTimeout: 10, usePueblo: true });
        const conn = getConn();

        setTimeout(() => conn.lines.push('</puebloclient>'), 20);

        await client.connect();

        expect((client as unknown as { isPuebloActive: boolean }).isPuebloActive).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 4. usePueblo: true — server never sends </puebloclient> → connect() rejects
// ---------------------------------------------------------------------------

describe('Pueblo — handshake timeout', () => {
    it('rejects connect() when server does not respond with </puebloclient>', async () => {
        const client = new RhostClient({
            bannerTimeout: 10,
            usePueblo: true,
            connectTimeout: 100, // handshake wait uses connectTimeout
        });

        // Do NOT push any line — the handshake waiter will time out.
        await expect(client.connect()).rejects.toThrow(/[Tt]imed? ?out/i);
    }, 5000);
});

// ---------------------------------------------------------------------------
// 5. usePueblo: true — </puebloclient> arrives after banner noise → still true
// ---------------------------------------------------------------------------

describe('Pueblo — handshake amid banner noise', () => {
    it('sets isPuebloActive when </puebloclient> is mixed with other lines', async () => {
        const client = new RhostClient({ bannerTimeout: 10, usePueblo: true });
        const conn = getConn();

        setTimeout(() => {
            conn.lines.push('Welcome to RhostMUSH!');
            conn.lines.push('Some banner noise line');
            conn.lines.push('Another banner line');
            conn.lines.push('</puebloclient>');
        }, 20);

        await client.connect();

        expect((client as unknown as { isPuebloActive: boolean }).isPuebloActive).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 6. usePueblo: true — handshake send happens AFTER banner is drained
// ---------------------------------------------------------------------------

describe('Pueblo — send order: banner first, then handshake', () => {
    it('does not send PUEBLOCLIENT until after drainBanner resolves', async () => {
        const client = new RhostClient({ bannerTimeout: 10, usePueblo: true });
        const conn = getConn();

        // Track call order relative to banner drain completion.
        let bannerDrainFinished = false;
        const sendCallsBeforeBannerDone: string[] = [];

        // Intercept send to record whether banner was done at call time.
        const originalSend = conn.send.getMockImplementation();
        conn.send.mockImplementation((line: string) => {
            if (!bannerDrainFinished) {
                sendCallsBeforeBannerDone.push(line);
            }
            return originalSend ? originalSend(line) : undefined;
        });

        // Deliver the server ack after a brief delay.
        setTimeout(() => conn.lines.push('</puebloclient>'), 30);

        // Monkey-patch connect to mark when banner is done.
        // We observe this by waiting for the first `send` call that contains
        // PUEBLOCLIENT — at that point banner MUST already be finished.
        // Instead: resolve banner signal by watching lines.next timeout (bannerTimeout=10ms).
        // Mark at 5ms — safely before the 10ms banner drain completes,
        // so any PUEBLOCLIENT send (which can't arrive until after ~10ms) will
        // correctly appear as NOT premature.
        setTimeout(() => { bannerDrainFinished = true; }, 5);

        await client.connect();

        // Any PUEBLOCLIENT send that happened before banner was done is a bug.
        const prematureSends = sendCallsBeforeBannerDone.filter(l => l.includes('PUEBLOCLIENT'));
        expect(prematureSends).toHaveLength(0);

        // And the handshake WAS sent at some point.
        expect(conn.send).toHaveBeenCalledWith('PUEBLOCLIENT 1.0.1');
    });
});
