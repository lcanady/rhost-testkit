/**
 * 07-direct-client.ts — Using RhostClient directly
 *
 * Shows raw client usage without the runner: eval(), command(), onLine().
 * Useful for one-off scripts, admin tasks, and debugging.
 *
 * Run:
 *   npx ts-node examples/07-direct-client.ts
 */
import { RhostClient, RhostExpect, RhostWorld } from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const USER = process.env.RHOST_USER ?? 'Wizard';
const PASS = process.env.RHOST_PASS ?? 'Nyctasia';

// Shorthand: creates a RhostExpect bound to `client`
function e(client: RhostClient, expr: string) {
    return new RhostExpect(client, expr);
}

async function main() {
    const client = new RhostClient({ host: HOST, port: PORT });

    // ── Optional: log every raw line for debugging ────────────────────────
    // client.onLine((line) => console.log('[RAW]', line));

    await client.connect();
    await client.login(USER, PASS);
    console.log('Connected as', USER, '\n');

    // ── 1. eval(): evaluate a softcode expression ─────────────────────────
    console.log('=== eval() ===');
    const r1 = await client.eval('add(2,3)');
    console.log('add(2,3)             =>', r1);                          // 5

    const r2 = await client.eval('encode64(hello)');
    console.log('encode64(hello)      =>', r2);                          // aGVsbG8=

    const r3 = await client.eval('digest(sha1,hello)');
    console.log('digest(sha1,hello)   =>', r3);

    const r4 = await client.eval('strdistance(kitten,sitting)');
    console.log('strdistance(...)     =>', r4);

    // Multi-line result (iter with %r separator)
    const r5 = await client.eval('iter(1 2 3,add(##,10),%r)');
    console.log('iter(1 2 3,add...) =>\n ', r5.split('\n').join('\n  '));

    // ── 2. RhostExpect: fluent assertions on eval results ────────────────
    console.log('\n=== RhostExpect ===');

    await e(client, 'add(2,3)').toBe('5');
    console.log('add(2,3) .toBe("5")           ✓');

    await e(client, 'pi()').toBeCloseTo(3.14159, 4);
    console.log('pi() .toBeCloseTo(3.14159)    ✓');

    await e(client, 'sort(c b a)').toContainWord('b');
    console.log('sort(c b a) .toContainWord(b) ✓');

    await e(client, 'div(1,0)').toBeError();
    console.log('div(1,0) .toBeError()          ✓');

    await e(client, 'add(2,3)').not.toBe('0');
    console.log('add(2,3) .not.toBe("0")        ✓');

    // ── 3. command(): run a command and capture all output ────────────────
    console.log('\n=== command() ===');

    const lookLines = await client.command('look here');
    console.log('look here output:');
    for (const line of lookLines) console.log(' ', line);

    const whoLines = await client.command('WHO');
    console.log('\nWHO output:');
    for (const line of whoLines.slice(0, 5)) console.log(' ', line);
    if (whoLines.length > 5) console.log(`  ... (${whoLines.length} lines total)`);

    // ── 4. RhostWorld: create and interact with objects ───────────────────
    console.log('\n=== RhostWorld ===');

    const world = new RhostWorld(client);

    const obj = await world.create('ScriptObj');
    console.log(`Created: ${obj}`);

    await world.set(obj, 'GREETING', 'Hello from direct client!');
    const greeting = await world.get(obj, 'GREETING');
    console.log(`GREETING: ${greeting}`);

    await world.set(obj, 'ADD', 'think add(%0,%1)');
    const trigLines = await world.trigger(obj, 'ADD', '19,23');
    console.log(`@trigger ADD(19,23): ${trigLines.join('')}`);

    await world.flag(obj, 'INHERIT');
    const hasFlag = await client.eval(`hasflag(${obj},inherit)`);
    console.log(`Has INHERIT flag: ${hasFlag}`);

    await world.cleanup();
    console.log(`Cleaned up (size: ${world.size})`);

    // ── 5. Inspect server info ────────────────────────────────────────────
    console.log('\n=== Server info ===');

    const version = await client.eval('version()');
    console.log('version():', version);

    const conns = await client.eval('conntotal(me)');
    console.log('conntotal(me):', conns);

    // ── Done ──────────────────────────────────────────────────────────────
    await client.disconnect();
    console.log('\nDisconnected.');
}

main().catch((err) => { console.error(err); process.exit(1); });
