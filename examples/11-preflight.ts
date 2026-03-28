/**
 * 11-preflight.ts — Server pre-flight assertions
 *
 * Verifies that the target server has the functions, flags, and config your
 * softcode depends on *before* tests run. Catches environment mismatches in CI
 * before they silently corrupt test results.
 *
 * Run:
 *   npx ts-node examples/11-preflight.ts
 */
import {
    RhostClient,
    preflight,
    assertFunctionExists,
    assertFunctionMissing,
    assertConfigEquals,
} from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const USER = process.env.RHOST_USER ?? 'Wizard';
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

async function main() {
    const client = new RhostClient({ host: HOST, port: PORT });
    await client.connect();
    await client.login(USER, PASS!);

    console.log('Running pre-flight checks...\n');

    // ---------------------------------------------------------------------------
    // Basic pre-flight: assert functions exist
    // ---------------------------------------------------------------------------

    const result = await preflight(client, [
        // Core math functions every build has
        assertFunctionExists('add'),
        assertFunctionExists('mul'),
        assertFunctionExists('iter'),
        assertFunctionExists('lnum'),

        // RhostMUSH-specific — will fail on PennMUSH / TinyMUX
        assertFunctionExists('encode64'),
        assertFunctionExists('decode64'),
        assertFunctionExists('digest'),
        assertFunctionExists('localize'),

        // Something that definitely doesn't exist
        assertFunctionMissing('totally_fake_fn_xyz'),
    ], { throwOnFailure: false });   // collect results instead of throwing

    // Print the report
    console.log(`Checks: ${result.passed} passed, ${result.failed} failed\n`);
    for (const check of result.results) {
        const icon = check.passed ? '✓' : '✗';
        console.log(`  ${icon}  ${check.name}`);
        if (!check.passed) console.log(`       → ${check.error}`);
    }

    // ---------------------------------------------------------------------------
    // Config check — verify a server flag value
    // ---------------------------------------------------------------------------

    console.log('\nChecking server config...');
    const configResult = await preflight(client, [
        assertConfigEquals('player_start', '#0'),
    ], { throwOnFailure: false });

    for (const check of configResult.results) {
        const icon = check.passed ? '✓' : '⚠';
        console.log(`  ${icon}  ${check.name}`);
    }

    // ---------------------------------------------------------------------------
    // Strict mode: throw if any check fails
    // (comment out if you want to proceed regardless)
    // ---------------------------------------------------------------------------

    console.log('\nRunning strict checks (will throw on failure)...');
    await preflight(client, [
        assertFunctionExists('add'),
        assertFunctionExists('sub'),
        assertFunctionExists('mul'),
    ]);
    console.log('All strict checks passed ✓');

    await client.disconnect();
}

main().catch((err) => {
    console.error('\nPre-flight failed:', err.message);
    process.exit(1);
});
