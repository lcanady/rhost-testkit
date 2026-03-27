/**
 * SECURITY EXPLOIT TEST — C-1: No validation on server-returned dbref values
 *
 * Vulnerability: world.create() and world.dig() parse dbrefs from server
 * output using regex, but do not validate the final dbref stored in the
 * world's cleanup list. A compromised or misconfigured server could return
 * malformed output that passes the regex but produces an invalid dbref,
 * causing incorrect behavior or silent test failures.
 *
 * Fix: after parsing, validate that stored dbrefs always match #\d+.
 * world.create() already does this correctly (^#(\d+)$ match). Ensure
 * world.dig() also validates and that both throw clearly on bad server output.
 */

import { MockMushServer } from '../mock-server';
import { RhostClient } from '../../client';
import { RhostWorld } from '../../world';

describe('C-1: world must reject invalid dbref responses from the server', () => {
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

    it('create() throws a descriptive error when server returns non-dbref output', async () => {
        // MockMushServer evaluator returns MOCK:create(BadName) — not a dbref
        await expect(world.create('BadName')).rejects.toThrow(/unexpected value/i);
    });

    it('create() error message includes the bad server response', async () => {
        try {
            await world.create('BadName');
            fail('expected to throw');
        } catch (err) {
            expect(String(err)).toContain('BadName');
        }
    });

    it('create() does not add the failed dbref to the cleanup list', async () => {
        const sizeBefore = world.size;
        await expect(world.create('BadName')).rejects.toThrow();
        expect(world.size).toBe(sizeBefore);
    });

    it('dig() throws a descriptive error when server output contains no dbref', async () => {
        // MockMushServer drops @dig lines (unknown command), so no dbref in output
        await expect(world.dig('TestRoom')).rejects.toThrow(/could not parse dbref/i);
    });

    it('dig() error message includes the room name', async () => {
        try {
            await world.dig('TestRoom');
            fail('expected to throw');
        } catch (err) {
            expect(String(err)).toContain('TestRoom');
        }
    });

    it('dig() does not add a phantom dbref to the cleanup list when it fails', async () => {
        const sizeBefore = world.size;
        await expect(world.dig('TestRoom')).rejects.toThrow();
        expect(world.size).toBe(sizeBefore);
    });

    it('a valid #\\d+ response from create() is stored and tracked for cleanup', async () => {
        // Override evaluator to return a proper dbref
        srv.setEvaluator(() => '#42');
        const dbref = await world.create('GoodName');
        expect(dbref).toBe('#42');
        expect(world.size).toBe(1);
    });
});
