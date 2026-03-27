import { RhostClient, stripAnsi } from '../client';
import { MockMushServer } from './mock-server';

// ---------------------------------------------------------------------------
// stripAnsi unit tests (no network)
// ---------------------------------------------------------------------------

describe('stripAnsi()', () => {
    it('strips SGR color sequences', () => {
        expect(stripAnsi('\x1b[31mhello\x1b[0m')).toBe('hello');
    });

    it('strips bold', () => {
        expect(stripAnsi('\x1b[1mworld\x1b[0m')).toBe('world');
    });

    it('strips multi-param sequences', () => {
        expect(stripAnsi('\x1b[1;32mgreen bold\x1b[0m')).toBe('green bold');
    });

    it('passes through plain strings unchanged', () => {
        expect(stripAnsi('hello world')).toBe('hello world');
    });

    it('strips cursor movement sequences', () => {
        expect(stripAnsi('\x1b[2Afoo\x1b[K')).toBe('foo');
    });

    it('handles multiple sequences in one string', () => {
        expect(stripAnsi('\x1b[31ma\x1b[32mb\x1b[0mc')).toBe('abc');
    });
});

// ---------------------------------------------------------------------------
// RhostClient against mock server (using new setEvaluator API)
// ---------------------------------------------------------------------------

describe('RhostClient (mock server)', () => {
    let server: MockMushServer;
    let client: RhostClient;

    beforeEach(async () => {
        server = new MockMushServer();
        server.setEvaluator((expr) => {
            if (expr === 'add(2,3)') return '5';
            if (expr === 'lcstr(HELLO)') return 'hello';
            return expr; // echo for unrecognised
        });
        const port = await server.listen();

        client = new RhostClient({
            host: '127.0.0.1',
            port,
            timeout: 3000,
            bannerTimeout: 50,
        });
        await client.connect();
        await client.login('Wizard', 'Nyctasia');
    });

    afterEach(async () => {
        await client.disconnect();
        await server.close();
    });

    it('eval() returns the result of think', async () => {
        const result = await client.eval('add(2,3)');
        expect(result).toBe('5');
    });

    it('eval() lcstr', async () => {
        const result = await client.eval('lcstr(HELLO)');
        expect(result).toBe('hello');
    });

    it('eval() strips ANSI from result by default', async () => {
        const server2 = new MockMushServer();
        server2.setEvaluator(() => '\x1b[31mred\x1b[0m');
        const port2 = await server2.listen();
        const c2 = new RhostClient({ host: '127.0.0.1', port: port2, timeout: 3000, bannerTimeout: 50 });
        await c2.connect();
        await c2.login('Wizard', 'Nyctasia');
        const result = await c2.eval('anything');
        expect(result).toBe('red');
        await c2.disconnect();
        await server2.close();
    });

    it('eval() preserves ANSI when stripAnsi:false', async () => {
        const server3 = new MockMushServer();
        server3.setEvaluator(() => '\x1b[32mgreen\x1b[0m');
        const port3 = await server3.listen();
        const c3 = new RhostClient({
            host: '127.0.0.1', port: port3,
            timeout: 3000, bannerTimeout: 50, stripAnsi: false,
        });
        await c3.connect();
        await c3.login('Wizard', 'Nyctasia');
        const result = await c3.eval('anything');
        expect(result).toContain('\x1b[');
        await c3.disconnect();
        await server3.close();
    });

    it('command() collects lines until sentinel', async () => {
        const lines = await client.command('think add(2,3)');
        expect(lines).toContain('5');
    });

    it('paceMs delays each eval by at least that many ms', async () => {
        const server2 = new MockMushServer();
        server2.setEvaluator(() => 'ok');
        const port2 = await server2.listen();
        const c2 = new RhostClient({
            host: '127.0.0.1', port: port2,
            timeout: 3000, bannerTimeout: 50, paceMs: 60,
        });
        await c2.connect();
        await c2.login('Wizard', 'Nyctasia');
        const t0 = Date.now();
        await c2.eval('anything');
        expect(Date.now() - t0).toBeGreaterThanOrEqual(60);
        await c2.disconnect();
        await server2.close();
    });

    it('onLine handler receives raw lines from the server', async () => {
        const received: string[] = [];
        const handler = (line: string) => received.push(line);
        client.onLine(handler);
        await client.eval('add(2,3)');
        client.offLine(handler);
        expect(received.length).toBeGreaterThan(0);
    });

    it('offLine stops the handler from receiving further lines', async () => {
        const received: string[] = [];
        const handler = (line: string) => received.push(line);
        client.onLine(handler);
        await client.eval('add(2,3)');
        client.offLine(handler);
        const countAfterOff = received.length;
        // Another eval — handler must not fire again
        await client.eval('add(2,3)');
        expect(received.length).toBe(countAfterOff);
    });
});
