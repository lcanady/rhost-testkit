/**
 * 13-side-effects.ts — Side-effect assertions with WorldSnapshot
 *
 * MUSHcode's "function side effects" means calling a function for its return
 * value can secretly create objects, write attributes, or emit to players.
 * This example shows how to capture a world snapshot and assert that an eval
 * had no unintended side effects — or verify that the expected ones occurred.
 *
 * Run:
 *   npx ts-node examples/13-side-effects.ts
 */
import { RhostRunner } from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const USER = process.env.RHOST_USER ?? 'Wizard';
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Pure functions: assert no side effects
// ---------------------------------------------------------------------------

runner.describe('Pure expressions have no side effects', ({ it }) => {

    it('add() changes nothing in the world', async ({ world, client }) => {
        const obj = await world.create('Fixture');
        // Take a snapshot of all tracked objects
        const snap = await world.snapshot();

        await client.eval('add(2,3)');

        // Verify nothing changed
        await snap.assertNoChanges();
    });

    it('iter(lnum()) changes nothing in the world', async ({ world, client }) => {
        const obj = await world.create('Fixture');
        const snap = await world.snapshot();

        await client.eval('iter(lnum(1,10),mul(##,2))');

        await snap.assertNoChanges();
    });
});

// ---------------------------------------------------------------------------
// Attribute writes: verify expected side effects
// ---------------------------------------------------------------------------

runner.describe('Attribute writes are detectable', ({ it }) => {

    it('detects when an attribute is added', async ({ world, client }) => {
        const obj = await world.create('Target');
        const snap = await world.snapshot();

        // Write an attribute — this IS a side effect
        await client.command(`&NEW_ATTR ${obj}=hello`);

        // Confirm the snapshot diff captures it
        const diff = await snap.diff();
        const objDiff = diff.changed.find(d => d.dbref === obj);
        if (!objDiff) throw new Error('Expected object to appear in diff');
        if (!objDiff.added.includes('NEW_ATTR')) {
            throw new Error(`Expected NEW_ATTR in added list, got: ${objDiff.added}`);
        }
        console.log(`  Detected added attr: ${objDiff.added.join(', ')}`);
    });

    it('detects when an attribute is removed', async ({ world, client }) => {
        const obj = await world.create('Target');
        await world.set(obj, 'WILL_BE_REMOVED', 'temporary');
        const snap = await world.snapshot();

        await client.command(`&WILL_BE_REMOVED ${obj}`);   // clear the attr

        const diff = await snap.diff();
        const objDiff = diff.changed.find(d => d.dbref === obj);
        if (!objDiff) throw new Error('Expected object to appear in diff');
        if (!objDiff.removed.includes('WILL_BE_REMOVED')) {
            throw new Error(`Expected WILL_BE_REMOVED in removed list, got: ${objDiff.removed}`);
        }
        console.log(`  Detected removed attr: ${objDiff.removed.join(', ')}`);
    });
});

// ---------------------------------------------------------------------------
// Verifying a command's intended side effect (positive assertion)
// ---------------------------------------------------------------------------

runner.describe('Softcode command side effects', ({ it }) => {

    it('a @set command changes the flag list', async ({ world, client }) => {
        const obj = await world.create('FlagTarget');
        const snap = await world.snapshot();

        await client.command(`@set ${obj}=SAFE`);

        // We EXPECT a change here — verify it happened
        let changed = false;
        try {
            await snap.assertNoChanges();
        } catch {
            changed = true;
        }
        if (!changed) throw new Error('Expected @set to produce a side effect');
        console.log('  @set SAFE produced a detectable change ✓');
    });
});

runner.run({
    host: HOST, port: PORT,
    username: USER,
    password: PASS!,
}).then((result) => {
    process.exit(result.failed > 0 ? 1 : 0);
}).catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
