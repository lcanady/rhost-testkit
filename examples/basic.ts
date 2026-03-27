/**
 * Basic example: connect to a running RhostMUSH and test softcode.
 *
 * Prerequisites:
 *   docker compose up -d   (from the rhostmush-docker root)
 *
 * Run with:
 *   npx ts-node examples/basic.ts
 *
 * Or against a custom host:
 *   RHOST_HOST=myserver.example.com RHOST_PORT=4201 npx ts-node examples/basic.ts
 */
import { RhostClient, RhostExpect, RhostRunner, RhostWorld } from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const USER = process.env.RHOST_USER ?? 'Wizard';
const PASS = process.env.RHOST_PASS ?? 'Nyctasia';

async function main() {
    const client = new RhostClient({ host: HOST, port: PORT });
    await client.connect();
    await client.login(USER, PASS);

    // Shorthand helper (same pattern used in test files)
    const e = (expr: string) => new RhostExpect(client, expr);

    // -------------------------------------------------------------------------
    // Direct assertions — useful for quick one-off checks
    // -------------------------------------------------------------------------

    console.log('=== Direct assertions ===');
    await e('add(2,3)').toBe('5');
    console.log('add(2,3)        ✓ 5');

    await e('encode64(hello)').toBe('aGVsbG8=');
    console.log('encode64(hello) ✓ aGVsbG8=');

    await e('soundex(Robert)').toBe('R163');
    console.log('soundex(Robert) ✓ R163');

    await e('digest(sha1,hello)').toMatch(/^aaf4c61d/i);
    console.log('digest(sha1,hello) ✓ starts with aaf4c61d');

    await e('totally_fake_fn()').toBeError();
    console.log('totally_fake_fn() ✓ is an error');

    await e('add(2,3)').not.toBe('0');
    console.log('add(2,3) .not.toBe("0") ✓');

    // -------------------------------------------------------------------------
    // World fixtures
    // -------------------------------------------------------------------------

    console.log('\n=== World fixtures ===');
    const world = new RhostWorld(client);

    const obj = await world.create('ExampleObj');
    console.log(`Created object: ${obj}`);

    await world.set(obj, 'GREETING', 'Hello from SDK');
    const greeting = await world.get(obj, 'GREETING');
    console.log(`GREETING attribute: ${greeting}`);

    await world.set(obj, 'DO_MATH', 'think add(%0,%1)');
    const output = await world.trigger(obj, 'DO_MATH', '10,32');
    console.log(`@trigger DO_MATH(10,32): ${output.join('')}`);

    await world.cleanup();
    console.log('World cleaned up.');

    // -------------------------------------------------------------------------
    // RhostRunner — the full jest-style API
    // -------------------------------------------------------------------------

    console.log('\n=== RhostRunner ===');
    const runner = new RhostRunner();

    runner.describe('Math', ({ it }) => {
        it('add()',   async ({ expect }) => expect('add(2,3)').toBe('5'));
        it('mul()',   async ({ expect }) => expect('mul(6,7)').toBe('42'));
        it('sqrt()',  async ({ expect }) => expect('sqrt(16)').toBeNumber());
        it('not 0',  async ({ expect }) => expect('add(2,3)').not.toBe('0'));
        it.skip('skipped example', async () => { throw new Error('would fail'); });
    });

    runner.describe('Rhost-specific', ({ it, describe }) => {
        it('encode64 round-trip', async ({ expect }) =>
            expect('decode64(encode64(mushcode))').toBe('mushcode'));
        it('soundex',  async ({ expect }) => expect('soundex(Robert)').toBe('R163'));
        it('digest',   async ({ expect }) => expect('digest(md5,hello)').toMatch(/^[0-9a-f]{32}$/i));
        it('strdistance same => 0', async ({ expect }) =>
            expect('strdistance(hello,hello)').toBe('0'));

        describe('Errors', ({ it }) => {
            it('div(1,0) is an error', async ({ expect }) => expect('div(1,0)').toBeError());
            it('not an error for valid', async ({ expect }) => expect('add(1,1)').not.toBeError());
        });
    });

    runner.describe('World in runner', ({ it }) => {
        it('creates obj, sets/gets attr', async ({ expect, world }) => {
            const o = await world.create('RunnerObj');
            await world.set(o, 'FOO', 'bar');
            await expect(`get(${o}/FOO)`).toBe('bar');
        });
    });

    const result = await runner.run({ host: HOST, port: PORT, username: USER, password: PASS });
    process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
