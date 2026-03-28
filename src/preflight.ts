import { RhostClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreflightCheckResult {
    name: string;
    passed: boolean;
    message?: string;
}

export interface PreflightResult {
    passed: number;
    failed: number;
    checks: PreflightCheckResult[];
}

export interface PreflightCheck {
    name: string;
    run(client: RhostClient): Promise<{ passed: boolean; message?: string }>;
}

export interface PreflightOptions {
    /**
     * Throw a PreflightError if any check fails. Default: true.
     * Set false to collect all results without throwing.
     */
    throwOnFailure?: boolean;
}

export class PreflightError extends Error {
    constructor(public readonly result: PreflightResult) {
        const failedNames = result.checks
            .filter((c) => !c.passed)
            .map((c) => `  ✗ ${c.name}${c.message ? ': ' + c.message : ''}`)
            .join('\n');
        super(`preflight: ${result.failed} check(s) failed\n${failedNames}`);
        this.name = 'PreflightError';
    }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a set of pre-flight checks against a live server before tests start.
 *
 * By default throws `PreflightError` if any check fails. Pass
 * `{ throwOnFailure: false }` to collect results without throwing.
 *
 * @example
 *   await preflight(client, [
 *     assertFunctionExists('json'),
 *     assertFunctionExists('localize'),
 *     assertConfigEquals('attr_limit', '500'),
 *   ]);
 */
export async function preflight(
    client: RhostClient,
    checks: PreflightCheck[],
    options: PreflightOptions = {},
): Promise<PreflightResult> {
    const throwOnFailure = options.throwOnFailure !== false;
    const results: PreflightCheckResult[] = [];

    for (const check of checks) {
        let checkResult: PreflightCheckResult;
        try {
            const outcome = await check.run(client);
            checkResult = { name: check.name, passed: outcome.passed, message: outcome.message };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            checkResult = { name: check.name, passed: false, message };
        }
        results.push(checkResult);
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const result: PreflightResult = { passed, failed, checks: results };

    if (throwOnFailure && failed > 0) {
        throw new PreflightError(result);
    }

    return result;
}

// ---------------------------------------------------------------------------
// Built-in check factories
// ---------------------------------------------------------------------------

/**
 * Factory for a custom preflight check with an arbitrary async predicate.
 */
export function preflightCheck(
    name: string,
    fn: (client: RhostClient) => Promise<{ passed: boolean; message?: string }>,
): PreflightCheck {
    return { name, run: fn };
}

/**
 * Assert that a softcode function is available on the server.
 *
 * Evals `funcname()` and checks that the response does not include "NOT FOUND".
 * A "wrong number of arguments" error means the function exists.
 */
export function assertFunctionExists(name: string): PreflightCheck {
    return {
        name: `function exists: ${name}`,
        async run(client) {
            const result = await client.eval(`${name}()`);
            const passed = !result.toUpperCase().includes('NOT FOUND');
            return passed
                ? { passed: true }
                : { passed: false, message: `function '${name}' is not available on this server` };
        },
    };
}

/**
 * Assert that a softcode function is NOT available on the server.
 *
 * Useful to confirm a restricted or removed function is absent.
 */
export function assertFunctionMissing(name: string): PreflightCheck {
    return {
        name: `function absent: ${name}`,
        async run(client) {
            const result = await client.eval(`${name}()`);
            const passed = result.toUpperCase().includes('NOT FOUND');
            return passed
                ? { passed: true }
                : { passed: false, message: `function '${name}' exists but was expected to be absent` };
        },
    };
}

/**
 * Assert that a server config key equals an expected value.
 *
 * Evals `config(key)` and compares the trimmed result to `expected`.
 */
export function assertConfigEquals(key: string, expected: string): PreflightCheck {
    return {
        name: `config: ${key} = ${expected}`,
        async run(client) {
            const actual = (await client.eval(`config(${key})`)).trim();
            const passed = actual === expected;
            return passed
                ? { passed: true }
                : { passed: false, message: `config(${key}): expected '${expected}', got '${actual}'` };
        },
    };
}
