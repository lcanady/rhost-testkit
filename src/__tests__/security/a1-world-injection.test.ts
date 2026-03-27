/**
 * SECURITY EXPLOIT TEST — A-1: world.ts input injection via newline characters
 *
 * Vulnerability: world.ts methods interpolate user-supplied strings directly
 * into MUSH command strings. Because connection.send() appends \r\n and writes
 * raw bytes, a \n inside a name/attr/value/args string splits into two separate
 * protocol lines at the TCP level. The second fragment is executed as a new
 * command by the MUSH server.
 *
 * Example (unfixed):
 *   world.create('foo\n@pemit me=INJECTED')
 *   → sends: "think create(foo\r\n@pemit me=INJECTED)\r\n"
 *   → server sees two lines: "think create(foo" AND "@pemit me=INJECTED)"
 *
 * Fix: validate all user-supplied string inputs to world.ts methods before
 * interpolation. Reject any string containing \n or \r.
 */

import { MockMushServer } from '../mock-server';
import { RhostClient } from '../../client';
import { RhostWorld } from '../../world';

describe('A-1: world.ts must reject newline/CR injection in all inputs', () => {
    let srv: MockMushServer;
    let client: RhostClient;
    let world: RhostWorld;

    beforeEach(async () => {
        srv = new MockMushServer();
        const port = await srv.listen();
        client = new RhostClient({ port, bannerTimeout: 50, timeout: 2000 });
        await client.connect();
        await client.login('Wizard', 'pass');
        world = new RhostWorld(client);
    });

    afterEach(async () => {
        await client.disconnect();
        await srv.close();
    });

    // -------------------------------------------------------------------------
    // create()
    // -------------------------------------------------------------------------

    it('create() rejects name containing \\n (newline injection)', async () => {
        await expect(world.create('foo\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    it('create() rejects name containing \\r', async () => {
        await expect(world.create('foo\rbar')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // dig()
    // -------------------------------------------------------------------------

    it('dig() rejects name containing \\n', async () => {
        await expect(world.dig('Room\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // set()
    // -------------------------------------------------------------------------

    it('set() rejects attr name containing \\n', async () => {
        await expect(world.set('#1', 'ATTR\n@pemit me=INJECTED', 'val')).rejects.toThrow(/invalid/i);
    });

    it('set() rejects value containing \\n (command injection via value)', async () => {
        await expect(world.set('#1', 'ATTR', 'value\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    it('set() rejects value containing \\r', async () => {
        await expect(world.set('#1', 'ATTR', 'value\r')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // lock()
    // -------------------------------------------------------------------------

    it('lock() rejects lockstring containing \\n', async () => {
        await expect(world.lock('#1', 'me\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // flag()
    // -------------------------------------------------------------------------

    it('flag() rejects flag name containing \\n', async () => {
        await expect(world.flag('#1', 'WIZARD\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // trigger()
    // -------------------------------------------------------------------------

    it('trigger() rejects args containing \\n', async () => {
        await expect(world.trigger('#1', 'ATTR', 'arg\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    // -------------------------------------------------------------------------
    // Valid inputs still work (regression guard)
    // -------------------------------------------------------------------------

    it('create() accepts normal name (regression guard)', async () => {
        // MockMushServer returns MOCK:create(ValidName) which does not match #\d+
        // world.create() will throw about the unexpected return value — that is correct
        // (no real dbref in the mock). The point is it does NOT throw about invalid input.
        await expect(world.create('ValidName')).rejects.toThrow(/unexpected value/i);
    });

    it('set() accepts normal attr and value (regression guard)', async () => {
        // set() uses client.command() — mock ignores &ATTR lines, just echoes sentinel
        await expect(world.set('#1', 'MY_ATTR', 'hello world')).resolves.toBeUndefined();
    });

    it('lock() accepts normal lockstring (regression guard)', async () => {
        await expect(world.lock('#1', 'me|#2')).resolves.toBeUndefined();
    });

    it('trigger() accepts normal args (regression guard)', async () => {
        await expect(world.trigger('#1', 'ATTR', 'arg1 arg2')).resolves.toBeDefined();
    });
});
