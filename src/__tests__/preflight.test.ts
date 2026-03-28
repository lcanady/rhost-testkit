import { RhostClient } from '../client';
import {
    preflight,
    preflightCheck,
    assertFunctionExists,
    assertFunctionMissing,
    assertConfigEquals,
    PreflightResult,
} from '../preflight';

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function mockClient(evalResults: Record<string, string>): RhostClient {
    const client = {
        eval: jest.fn(async (expr: string) => {
            for (const [pattern, result] of Object.entries(evalResults)) {
                if (expr.includes(pattern)) return result;
            }
            return '#-1 UNKNOWN';
        }),
    };
    return client as unknown as RhostClient;
}

// ---------------------------------------------------------------------------
// preflightCheck (custom)
// ---------------------------------------------------------------------------

describe('preflightCheck', () => {
    it('passes when the async fn returns passed:true', async () => {
        const client = mockClient({});
        const check = preflightCheck('custom pass', async () => ({ passed: true }));
        const result = await preflight(client, [check]);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
    });

    it('fails when the async fn returns passed:false', async () => {
        const client = mockClient({});
        const check = preflightCheck('custom fail', async () => ({
            passed: false,
            message: 'something is wrong',
        }));
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.passed).toBe(0);
        expect(result.failed).toBe(1);
        expect(result.checks[0].message).toContain('something is wrong');
    });

    it('records the check name', async () => {
        const client = mockClient({});
        const check = preflightCheck('my named check', async () => ({ passed: true }));
        const result = await preflight(client, [check]);
        expect(result.checks[0].name).toBe('my named check');
    });

    it('catches thrown errors and marks as failed', async () => {
        const client = mockClient({});
        const check = preflightCheck('throws', async () => {
            throw new Error('exploded');
        });
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.failed).toBe(1);
        expect(result.checks[0].message).toContain('exploded');
    });
});

// ---------------------------------------------------------------------------
// preflight (batch runner)
// ---------------------------------------------------------------------------

describe('preflight', () => {
    it('returns passed=0 failed=0 for empty checks', async () => {
        const client = mockClient({});
        const result = await preflight(client, []);
        expect(result.passed).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.checks).toHaveLength(0);
    });

    it('runs all checks and aggregates results', async () => {
        const client = mockClient({});
        const checks = [
            preflightCheck('ok1', async () => ({ passed: true })),
            preflightCheck('fail1', async () => ({ passed: false, message: 'bad' })),
            preflightCheck('ok2', async () => ({ passed: true })),
        ];
        const result = await preflight(client, checks, { throwOnFailure: false });
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.checks).toHaveLength(3);
    });

    it('throws PreflightError when throwOnFailure:true (default) and any check fails', async () => {
        const client = mockClient({});
        const checks = [
            preflightCheck('fail', async () => ({ passed: false, message: 'oops' })),
        ];
        await expect(preflight(client, checks)).rejects.toThrow(/preflight/i);
    });

    it('does not throw when throwOnFailure:false even if checks fail', async () => {
        const client = mockClient({});
        const checks = [
            preflightCheck('fail', async () => ({ passed: false, message: 'oops' })),
        ];
        const result = await preflight(client, checks, { throwOnFailure: false });
        expect(result.failed).toBe(1);
    });

    it('returns PreflightResult with correct shape', async () => {
        const client = mockClient({});
        const result = await preflight(client, [], { throwOnFailure: false });
        const expected: PreflightResult = { passed: 0, failed: 0, checks: [] };
        expect(result).toEqual(expected);
    });
});

// ---------------------------------------------------------------------------
// assertFunctionExists
// ---------------------------------------------------------------------------

describe('assertFunctionExists', () => {
    it('passes when eval does not return NOT FOUND', async () => {
        // json() with no args might return an error about args, but not "NOT FOUND"
        const client = mockClient({ 'json()': '#-1 FUNCTION (JSON) EXPECTS AT LEAST 1 ARGUMENT' });
        const check = assertFunctionExists('json');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.passed).toBe(1);
    });

    it('fails when eval returns NOT FOUND', async () => {
        const client = mockClient({ 'json()': '#-1 FUNCTION (JSON) NOT FOUND' });
        const check = assertFunctionExists('json');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.failed).toBe(1);
        expect(result.checks[0].message).toMatch(/json/i);
    });

    it('evals the function name with empty args', async () => {
        const evalSpy = jest.fn(async () => '#-1 FUNCTION (FOO) EXPECTS 1 ARGUMENT');
        const client = { eval: evalSpy } as unknown as RhostClient;
        const check = assertFunctionExists('foo');
        await preflight(client, [check], { throwOnFailure: false });
        expect(evalSpy).toHaveBeenCalledWith('foo()');
    });

    it('check name identifies the function', async () => {
        const client = mockClient({ 'localize()': '#-1 FUNCTION (LOCALIZE) EXPECTS 1 ARGUMENT' });
        const check = assertFunctionExists('localize');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.checks[0].name).toContain('localize');
    });
});

// ---------------------------------------------------------------------------
// assertFunctionMissing
// ---------------------------------------------------------------------------

describe('assertFunctionMissing', () => {
    it('passes when eval returns NOT FOUND', async () => {
        const client = mockClient({ 'restricted()': '#-1 FUNCTION (RESTRICTED) NOT FOUND' });
        const check = assertFunctionMissing('restricted');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.passed).toBe(1);
    });

    it('fails when the function exists', async () => {
        const client = mockClient({ 'restricted()': '#-1 FUNCTION (RESTRICTED) EXPECTS 1 ARGUMENT' });
        const check = assertFunctionMissing('restricted');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.failed).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// assertConfigEquals
// ---------------------------------------------------------------------------

describe('assertConfigEquals', () => {
    it('passes when config() matches expected value', async () => {
        const client = mockClient({ 'config(attr_limit)': '500' });
        const check = assertConfigEquals('attr_limit', '500');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.passed).toBe(1);
    });

    it('fails when config() does not match expected value', async () => {
        const client = mockClient({ 'config(attr_limit)': '200' });
        const check = assertConfigEquals('attr_limit', '500');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.failed).toBe(1);
        expect(result.checks[0].message).toMatch(/200/);
        expect(result.checks[0].message).toMatch(/500/);
    });

    it('evals config(key)', async () => {
        const evalSpy = jest.fn(async () => '100');
        const client = { eval: evalSpy } as unknown as RhostClient;
        const check = assertConfigEquals('player_quota', '100');
        await preflight(client, [check], { throwOnFailure: false });
        expect(evalSpy).toHaveBeenCalledWith('config(player_quota)');
    });

    it('check name identifies the config key', async () => {
        const client = mockClient({ 'config(player_quota)': '50' });
        const check = assertConfigEquals('player_quota', '50');
        const result = await preflight(client, [check], { throwOnFailure: false });
        expect(result.checks[0].name).toContain('player_quota');
    });
});
