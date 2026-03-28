/**
 * 17-benchmark.ts — Benchmark mode
 *
 * Measures median / p95 / p99 latency for softcode expressions against a live
 * server. Useful for:
 *   - Establishing performance baselines before a deploy
 *   - Comparing two implementations of the same function
 *   - Finding unexpectedly slow operations
 *
 * Run:
 *   RHOST_PASS=<pass> npx ts-node examples/17-benchmark.ts
 */
import {
    RhostClient,
    RhostBenchmark,
    runBench,
    formatBenchResults,
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

    // ---------------------------------------------------------------------------
    // Single-expression benchmark with runBench()
    // ---------------------------------------------------------------------------

    console.log('Benchmarking individual expressions...\n');

    const simple = await runBench(client, 'add(2,3)', {
        name:       'simple add',
        iterations: 50,
        warmup:     5,
    });

    console.log(`${simple.name}:`);
    console.log(`  median ${simple.median.toFixed(2)}ms  p95 ${simple.p95.toFixed(2)}ms  p99 ${simple.p99.toFixed(2)}ms`);
    console.log(`  min ${simple.min.toFixed(2)}ms  max ${simple.max.toFixed(2)}ms\n`);

    // ---------------------------------------------------------------------------
    // Multi-expression suite with RhostBenchmark
    // ---------------------------------------------------------------------------

    console.log('Running benchmark suite...\n');

    const bench = new RhostBenchmark(client);

    bench
        .add('add(2,3)',                         { name: 'add — trivial',       iterations: 50, warmup: 5 })
        .add('iter(lnum(1,10),##)',              { name: 'iter — 10 items',     iterations: 50, warmup: 5 })
        .add('iter(lnum(1,50),##)',              { name: 'iter — 50 items',     iterations: 30, warmup: 5 })
        .add('sort(5 3 1 4 2)',                  { name: 'sort — 5 items',      iterations: 50, warmup: 5 })
        .add('encode64(hello world from rhost)', { name: 'encode64 — short str', iterations: 50, warmup: 5 });

    const results = await bench.run();

    console.log(formatBenchResults(results));

    // ---------------------------------------------------------------------------
    // Comparison: two implementations of the same operation
    // ---------------------------------------------------------------------------

    console.log('\nComparing two approaches to building a list...\n');

    const impl1 = await runBench(client, 'lnum(1,20)',               { name: 'lnum(1,20)',            iterations: 50, warmup: 5 });
    const impl2 = await runBench(client, 'iter(lnum(1,20),##)',      { name: 'iter(lnum(1,20),##)',   iterations: 50, warmup: 5 });
    const impl3 = await runBench(client, 'iter(lnum(1,20),mul(##,2))', { name: 'iter × 20, mul each', iterations: 50, warmup: 5 });

    console.log(formatBenchResults([impl1, impl2, impl3]));

    // ---------------------------------------------------------------------------
    // Access the raw samples for custom analysis
    // ---------------------------------------------------------------------------

    console.log('\nRaw sample analysis for "add":');
    const fast = simple.samples.filter(s => s < simple.median).length;
    const slow = simple.samples.filter(s => s > simple.p95).length;
    console.log(`  ${fast} samples below median, ${slow} samples above p95`);
    console.log(`  Total samples: ${simple.samples.length}`);

    await client.disconnect();
}

main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
