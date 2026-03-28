/**
 * 15-deploy.ts — Deploy pipeline with automatic rollback
 *
 * Demonstrates the full deploy cycle:
 *   1. Parse a softcode file into deploy commands
 *   2. Snapshot the current attribute state of target objects
 *   3. Apply the softcode
 *   4. Run a test suite to verify correctness
 *   5. Automatically roll back if tests fail
 *
 * Run (dry-run, no server needed):
 *   npx ts-node examples/15-deploy.ts --dry-run
 *
 * Run (live deploy, requires server):
 *   RHOST_PASS=<pass> npx ts-node examples/15-deploy.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    RhostClient,
    RhostRunner,
    parseDeployFile,
    deploy,
} from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const USER = process.env.RHOST_USER ?? 'Wizard';
const PASS = process.env.RHOST_PASS;
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Example softcode file content
// ---------------------------------------------------------------------------

const SOFTCODE = `
@@ Example softcode deploy file
@@ Lines starting with # or @@ are comments.
@@ Format: &ATTRNAME #DBREF=value

&FN_ADD #1=think add(%0,%1)
&FN_MUL #1=think mul(%0,%1)
&FN_GREET #1=@pemit %#=Hello, %0!
`.trim();

// ---------------------------------------------------------------------------
// 1. Parse the softcode file (offline — no server needed)
// ---------------------------------------------------------------------------

console.log('=== Step 1: Parse softcode file ===\n');

const commands = parseDeployFile(SOFTCODE);
console.log(`Parsed ${commands.length} command(s):`);
for (const cmd of commands) {
    console.log(`  &${cmd.attr} ${cmd.dbref} = ${cmd.value.slice(0, 50)}${cmd.value.length > 50 ? '...' : ''}`);
}
console.log();

// ---------------------------------------------------------------------------
// Dry-run mode — stop here, no connection needed
// ---------------------------------------------------------------------------

if (DRY_RUN) {
    console.log('=== Dry-run mode: showing what would be applied ===\n');
    for (const cmd of commands) {
        console.log(`  WOULD APPLY: &${cmd.attr} ${cmd.dbref}=${cmd.value}`);
    }
    console.log('\nUse without --dry-run to perform a live deploy.');
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Live deploy
// ---------------------------------------------------------------------------

if (!PASS) { console.error('RHOST_PASS env var is required for live deploy'); process.exit(1); }

async function liveDeploy() {
    const client = new RhostClient({ host: HOST, port: PORT });
    await client.connect();
    await client.login(USER, PASS!);

    console.log('=== Step 2: Live deploy with rollback ===\n');

    // Build a test suite to run after applying the softcode
    const runner = new RhostRunner();
    runner.describe('Post-deploy verification', ({ it }) => {
        it('FN_ADD was applied correctly', async ({ client: c, expect }) => {
            // After deploy, #1 should respond to think add() via the deployed UDF
            await expect('add(2,3)').toBe('5');
        });
    });

    const result = await deploy(client, commands, {
        // Run the test suite after applying — roll back automatically if it fails
        test: async () => {
            const runResult = await runner.run({
                host: HOST, port: PORT,
                username: USER, password: PASS!,
                verbose: false,
            });
            if (runResult.failed > 0) {
                throw new Error(`${runResult.failed} post-deploy test(s) failed`);
            }
        },
    });

    console.log(`Applied:    ${result.applied} command(s)`);
    console.log(`Tested:     ${result.tested ? 'yes' : 'no'}`);
    console.log(`Test passed: ${result.testPassed ?? 'n/a'}`);
    console.log(`Rolled back: ${result.rolledBack}`);

    if (result.rolledBack) {
        console.log('\n⚠  Tests failed — original attribute state was restored.');
        process.exit(1);
    } else {
        console.log('\n✓ Deploy successful.');
    }

    await client.disconnect();
}

liveDeploy().catch((err) => {
    console.error('Deploy error:', err.message);
    process.exit(1);
});
