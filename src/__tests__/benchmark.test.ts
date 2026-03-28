// ---------------------------------------------------------------------------
// Benchmark Mode — TDD tests
// ---------------------------------------------------------------------------

import { RhostBenchmark, BenchmarkResult, runBench } from '../benchmark';
import { RhostClient } from '../client';

jest.mock('../client');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(evalMs = 5): jest.Mocked<RhostClient> {
    const client = new RhostClient({} as never) as jest.Mocked<RhostClient>;
    client.eval = jest.fn().mockImplementation(
        () => new Promise<string>(res => setTimeout(() => res('1'), evalMs))
    );
    return client;
}

// ---------------------------------------------------------------------------
// runBench — the low-level timing primitive
// ---------------------------------------------------------------------------

describe('runBench', () => {
    it('returns a BenchmarkResult with the expected shape', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 3, warmup: 1 });
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('iterations');
        expect(result).toHaveProperty('warmup');
        expect(result).toHaveProperty('median');
        expect(result).toHaveProperty('p95');
        expect(result).toHaveProperty('p99');
        expect(result).toHaveProperty('min');
        expect(result).toHaveProperty('max');
        expect(result).toHaveProperty('mean');
        expect(result).toHaveProperty('samples');
    });

    it('calls eval (warmup + iterations) times', async () => {
        const client = makeClient(0);
        await runBench(client, 'add(2,3)', { iterations: 5, warmup: 2 });
        expect(client.eval).toHaveBeenCalledTimes(7); // 2 warmup + 5 iterations
    });

    it('does not call eval during warmup for sample collection', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 4, warmup: 3 });
        // samples array only has iteration timings, not warmup
        expect(result.samples.length).toBe(4);
    });

    it('uses the expression as the default name', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 1, warmup: 0 });
        expect(result.name).toBe('add(2,3)');
    });

    it('uses the provided name when given', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { name: 'addition', iterations: 1, warmup: 0 });
        expect(result.name).toBe('addition');
    });

    it('reports correct iterations and warmup counts', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'rand()', { iterations: 10, warmup: 3 });
        expect(result.iterations).toBe(10);
        expect(result.warmup).toBe(3);
    });

    it('median is a non-negative number', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 5, warmup: 0 });
        expect(result.median).toBeGreaterThanOrEqual(0);
    });

    it('p95 >= median >= min', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 10, warmup: 0 });
        expect(result.p95).toBeGreaterThanOrEqual(result.median);
        expect(result.median).toBeGreaterThanOrEqual(result.min);
    });

    it('p99 >= p95', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 10, warmup: 0 });
        expect(result.p99).toBeGreaterThanOrEqual(result.p95);
    });

    it('max >= min', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)', { iterations: 5, warmup: 0 });
        expect(result.max).toBeGreaterThanOrEqual(result.min);
    });

    it('defaults to 100 iterations and 10 warmup when not specified', async () => {
        const client = makeClient(0);
        const result = await runBench(client, 'add(2,3)');
        expect(result.iterations).toBe(100);
        expect(result.warmup).toBe(10);
        expect(client.eval).toHaveBeenCalledTimes(110);
    });
});

// ---------------------------------------------------------------------------
// RhostBenchmark — fluent builder
// ---------------------------------------------------------------------------

describe('RhostBenchmark', () => {
    it('runs a single bench and returns results array', async () => {
        const client = makeClient(0);
        const bench = new RhostBenchmark(client);
        bench.add('add(2,3)', { iterations: 2, warmup: 0 });
        const results = await bench.run();
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('add(2,3)');
    });

    it('runs multiple benches in sequence', async () => {
        const client = makeClient(0);
        const bench = new RhostBenchmark(client);
        bench.add('add(2,3)', { name: 'addition', iterations: 2, warmup: 0 });
        bench.add('mul(2,3)', { name: 'multiply', iterations: 2, warmup: 0 });
        const results = await bench.run();
        expect(results).toHaveLength(2);
        expect(results.map(r => r.name)).toEqual(['addition', 'multiply']);
    });

    it('returns empty results when no benches added', async () => {
        const client = makeClient(0);
        const bench = new RhostBenchmark(client);
        const results = await bench.run();
        expect(results).toHaveLength(0);
    });

    it('supports chaining via add() returning the instance', async () => {
        const client = makeClient(0);
        const bench = new RhostBenchmark(client);
        const returned = bench.add('add(2,3)', { iterations: 1, warmup: 0 });
        expect(returned).toBe(bench);
    });
});

// ---------------------------------------------------------------------------
// formatBenchResults — report formatting
// ---------------------------------------------------------------------------

import { formatBenchResults } from '../benchmark';

describe('formatBenchResults', () => {
    const sampleResult: BenchmarkResult = {
        name: 'addition',
        iterations: 100,
        warmup: 10,
        median: 12.5,
        mean: 13.1,
        p95: 20.3,
        p99: 25.0,
        min: 10.1,
        max: 30.0,
        samples: [],
    };

    it('includes the bench name', () => {
        const output = formatBenchResults([sampleResult]);
        expect(output).toContain('addition');
    });

    it('includes median, p95, p99', () => {
        const output = formatBenchResults([sampleResult]);
        expect(output).toContain('median');
        expect(output).toContain('p95');
        expect(output).toContain('p99');
    });

    it('includes iteration count', () => {
        const output = formatBenchResults([sampleResult]);
        expect(output).toContain('100');
    });

    it('returns a string', () => {
        expect(typeof formatBenchResults([sampleResult])).toBe('string');
    });

    it('returns a header even for empty results', () => {
        const output = formatBenchResults([]);
        expect(typeof output).toBe('string');
    });
});
