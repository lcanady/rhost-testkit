import { RhostClient } from './client';

export interface AssertionResult {
    expression: string;
    expected: string;
    actual: string;
    passed: boolean;
}

export class RhostAssertionError extends Error {
    constructor(public readonly result: AssertionResult) {
        super(
            `RhostMUSH assertion failed\n` +
            `  Expression : ${result.expression}\n` +
            `  Expected   : ${JSON.stringify(result.expected)}\n` +
            `  Actual     : ${JSON.stringify(result.actual)}`
        );
        this.name = 'RhostAssertionError';
    }
}

/**
 * Whether a string is a RhostMUSH error value.
 * Rhost returns `#-1 <MESSAGE>` for most error cases.
 */
export function isRhostError(value: string): boolean {
    return value.startsWith('#-1') || value.startsWith('#-2') || value.startsWith('#-3');
}

/**
 * Assertion helpers for writing RhostMUSH softcode tests.
 *
 * Designed to work inside any test framework (Jest, Vitest, Mocha) — failed
 * assertions throw `RhostAssertionError` which the framework will catch and
 * report.
 *
 * @example
 *   const assert = new RhostAssert(client);
 *   await assert.equal('add(2,3)', '5');
 *   await assert.truthy('strlen(hello)');
 *   await assert.error('foo(BAD)');        // expects a #-1 error
 */
export class RhostAssert {
    constructor(private readonly client: RhostClient) {}

    /** Evaluate and assert the result equals `expected` (exact string match). */
    async equal(expression: string, expected: string, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const result: AssertionResult = { expression, expected, actual, passed: actual === expected };
        if (!result.passed) throw new RhostAssertionError(result);
        return result;
    }

    /** Evaluate and assert the result matches `pattern`. */
    async matches(expression: string, pattern: RegExp, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const passed = pattern.test(actual);
        const result: AssertionResult = {
            expression,
            expected: pattern.toString(),
            actual,
            passed,
        };
        if (!passed) throw new RhostAssertionError(result);
        return result;
    }

    /**
     * Evaluate and assert the result is truthy in MUSH terms:
     * non-empty, not `0`, and not a `#-1` error.
     */
    async truthy(expression: string, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const passed = actual !== '' && actual !== '0' && !isRhostError(actual);
        const result: AssertionResult = { expression, expected: '<truthy>', actual, passed };
        if (!passed) throw new RhostAssertionError(result);
        return result;
    }

    /**
     * Evaluate and assert the result is falsy in MUSH terms:
     * empty string, `0`, or a `#-1` error.
     */
    async falsy(expression: string, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const passed = actual === '' || actual === '0' || isRhostError(actual);
        const result: AssertionResult = { expression, expected: '<falsy>', actual, passed };
        if (!passed) throw new RhostAssertionError(result);
        return result;
    }

    /**
     * Evaluate and assert the result contains `substring`.
     */
    async contains(expression: string, substring: string, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const passed = actual.includes(substring);
        const result: AssertionResult = {
            expression,
            expected: `<contains: ${JSON.stringify(substring)}>`,
            actual,
            passed,
        };
        if (!passed) throw new RhostAssertionError(result);
        return result;
    }

    /**
     * Evaluate and assert the result is a `#-1` error (any kind).
     * Useful for testing that invalid arguments are properly rejected.
     *
     * @example
     *   await assert.error('div(1,0)');
     *   await assert.error('nonexistentfunc()');
     */
    async error(expression: string, timeout?: number): Promise<AssertionResult> {
        const actual = (await this.client.eval(expression, timeout)).trim();
        const passed = isRhostError(actual);
        const result: AssertionResult = { expression, expected: '<#-1 error>', actual, passed };
        if (!passed) throw new RhostAssertionError(result);
        return result;
    }

    /**
     * Run a batch of `[expression, expected]` pairs.
     * Runs all cases before throwing, returning the full result set.
     * Throws after all cases if any failed.
     */
    async batch(
        cases: Array<[expression: string, expected: string]>,
        timeout?: number
    ): Promise<AssertionResult[]> {
        const results: AssertionResult[] = [];
        for (const [expression, expected] of cases) {
            const actual = (await this.client.eval(expression, timeout)).trim();
            results.push({ expression, expected, actual, passed: actual === expected });
        }
        const failures = results.filter((r) => !r.passed);
        if (failures.length > 0) {
            const summary = failures
                .map(
                    (r) =>
                        `  [FAIL] ${r.expression}\n` +
                        `         Expected : ${JSON.stringify(r.expected)}\n` +
                        `         Actual   : ${JSON.stringify(r.actual)}`
                )
                .join('\n');
            throw new Error(`${failures.length} of ${results.length} assertions failed:\n${summary}`);
        }
        return results;
    }
}
