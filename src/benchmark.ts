// ---------------------------------------------------------------------------
// Benchmark Mode — profile softcode performance against a live server
// ---------------------------------------------------------------------------

import { RhostClient } from './client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BenchOptions {
    /** Human-readable label. Defaults to the expression string. */
    name?: string;
    /** Number of measured iterations (after warmup). Default: 100. */
    iterations?: number;
    /** Number of un-measured warmup runs. Default: 10. */
    warmup?: number;
}

export interface BenchmarkResult {
    name: string;
    iterations: number;
    warmup: number;
    /** All measured samples in milliseconds, in run order. */
    samples: number[];
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
}

// ---------------------------------------------------------------------------
// runBench — low-level timing primitive
// ---------------------------------------------------------------------------

/**
 * Run a single softcode expression against `client` and return timing stats.
 */
export async function runBench(
    client: RhostClient,
    expression: string,
    options: BenchOptions = {},
): Promise<BenchmarkResult> {
    const name = options.name ?? expression;
    const iterations = options.iterations ?? 100;
    const warmup = options.warmup ?? 10;

    // Warmup runs — not measured
    for (let i = 0; i < warmup; i++) {
        await client.eval(expression);
    }

    // Measured iterations
    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.eval(expression);
        const elapsed = performance.now() - start;
        samples.push(elapsed);
    }

    return {
        name,
        iterations,
        warmup,
        samples,
        ...computeStats(samples),
    };
}

// ---------------------------------------------------------------------------
// RhostBenchmark — fluent builder for running multiple benchmarks
// ---------------------------------------------------------------------------

interface BenchEntry {
    expression: string;
    options: BenchOptions;
}

export class RhostBenchmark {
    private readonly entries: BenchEntry[] = [];

    constructor(private readonly client: RhostClient) {}

    /**
     * Register a benchmark expression. Returns `this` for chaining.
     */
    add(expression: string, options: BenchOptions = {}): this {
        this.entries.push({ expression, options });
        return this;
    }

    /**
     * Run all registered benchmarks in sequence and return their results.
     */
    async run(): Promise<BenchmarkResult[]> {
        const results: BenchmarkResult[] = [];
        for (const { expression, options } of this.entries) {
            const result = await runBench(this.client, expression, options);
            results.push(result);
        }
        return results;
    }
}

// ---------------------------------------------------------------------------
// formatBenchResults — human-readable report
// ---------------------------------------------------------------------------

/**
 * Format an array of BenchmarkResults into a human-readable table string.
 */
export function formatBenchResults(results: BenchmarkResult[]): string {
    if (results.length === 0) {
        return 'No benchmark results.';
    }

    const lines: string[] = ['Benchmark Results', '─'.repeat(72)];

    for (const r of results) {
        lines.push('');
        lines.push(`  ${r.name}`);
        lines.push(`  iterations: ${r.iterations}  warmup: ${r.warmup}`);
        lines.push(
            `  median: ${fmt(r.median)}ms  mean: ${fmt(r.mean)}ms` +
            `  p95: ${fmt(r.p95)}ms  p99: ${fmt(r.p99)}ms`
        );
        lines.push(`  min: ${fmt(r.min)}ms  max: ${fmt(r.max)}ms`);
    }

    lines.push('');
    lines.push('─'.repeat(72));
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal stats helpers
// ---------------------------------------------------------------------------

function computeStats(samples: number[]): Omit<BenchmarkResult, 'name' | 'iterations' | 'warmup' | 'samples'> {
    if (samples.length === 0) {
        return { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

    return {
        mean,
        median: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
}

/** Compute the p-th percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 1) return sorted[0];
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function fmt(n: number): string {
    return n.toFixed(3);
}
