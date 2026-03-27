import { RhostAssert, RhostAssertionError, isRhostError } from '../assertions';
import { RhostClient } from '../client';

// ---------------------------------------------------------------------------
// isRhostError unit tests (no network)
// ---------------------------------------------------------------------------

describe('isRhostError()', () => {
    it('recognises #-1 errors', () => {
        expect(isRhostError('#-1 FUNCTION NOT FOUND')).toBe(true);
        expect(isRhostError('#-1')).toBe(true);
    });
    it('recognises #-2 and #-3 errors', () => {
        expect(isRhostError('#-2 ERROR')).toBe(true);
        expect(isRhostError('#-3 ERROR')).toBe(true);
    });
    it('returns false for normal values', () => {
        expect(isRhostError('5')).toBe(false);
        expect(isRhostError('hello')).toBe(false);
        expect(isRhostError('0')).toBe(false);
        expect(isRhostError('')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// RhostAssert (mock client)
// ---------------------------------------------------------------------------

function makeClient(evalResult: string): RhostClient {
    return {
        eval: jest.fn().mockResolvedValue(evalResult),
    } as unknown as RhostClient;
}

describe('RhostAssert.equal()', () => {
    it('passes when values match', async () => {
        const assert = new RhostAssert(makeClient('5'));
        const result = await assert.equal('add(2,3)', '5');
        expect(result.passed).toBe(true);
    });

    it('throws RhostAssertionError on mismatch', async () => {
        const assert = new RhostAssert(makeClient('6'));
        await expect(assert.equal('add(2,3)', '5')).rejects.toBeInstanceOf(RhostAssertionError);
    });

    it('error message includes expression, expected, actual', async () => {
        const assert = new RhostAssert(makeClient('6'));
        try {
            await assert.equal('add(2,3)', '5');
        } catch (e) {
            expect((e as Error).message).toMatch('add(2,3)');
            expect((e as Error).message).toMatch('"5"');
            expect((e as Error).message).toMatch('"6"');
        }
    });
});

describe('RhostAssert.truthy()', () => {
    it('passes for non-zero, non-empty, non-error', async () => {
        const assert = new RhostAssert(makeClient('hello'));
        await expect(assert.truthy('something')).resolves.toBeDefined();
    });

    it('fails for empty string', async () => {
        const assert = new RhostAssert(makeClient(''));
        await expect(assert.truthy('something')).rejects.toBeInstanceOf(RhostAssertionError);
    });

    it('fails for 0', async () => {
        const assert = new RhostAssert(makeClient('0'));
        await expect(assert.truthy('something')).rejects.toBeInstanceOf(RhostAssertionError);
    });

    it('fails for #-1 error', async () => {
        const assert = new RhostAssert(makeClient('#-1 FUNCTION NOT FOUND'));
        await expect(assert.truthy('something')).rejects.toBeInstanceOf(RhostAssertionError);
    });
});

describe('RhostAssert.falsy()', () => {
    it('passes for 0', async () => {
        await expect(new RhostAssert(makeClient('0')).falsy('x')).resolves.toBeDefined();
    });
    it('passes for empty string', async () => {
        await expect(new RhostAssert(makeClient('')).falsy('x')).resolves.toBeDefined();
    });
    it('passes for #-1 error', async () => {
        await expect(new RhostAssert(makeClient('#-1 NO MATCH')).falsy('x')).resolves.toBeDefined();
    });
    it('fails for truthy value', async () => {
        await expect(new RhostAssert(makeClient('hello')).falsy('x')).rejects.toBeInstanceOf(RhostAssertionError);
    });
});

describe('RhostAssert.error()', () => {
    it('passes when result is a #-1 error', async () => {
        const assert = new RhostAssert(makeClient('#-1 FUNCTION NOT FOUND'));
        await expect(assert.error('badfunc()')).resolves.toBeDefined();
    });

    it('fails when result is a normal value', async () => {
        const assert = new RhostAssert(makeClient('5'));
        await expect(assert.error('add(2,3)')).rejects.toBeInstanceOf(RhostAssertionError);
    });
});

describe('RhostAssert.matches()', () => {
    it('passes when result matches pattern', async () => {
        const assert = new RhostAssert(makeClient('hello world'));
        await expect(assert.matches('something', /hello/)).resolves.toBeDefined();
    });

    it('fails when result does not match', async () => {
        const assert = new RhostAssert(makeClient('goodbye'));
        await expect(assert.matches('something', /hello/)).rejects.toBeInstanceOf(RhostAssertionError);
    });
});

describe('RhostAssert.contains()', () => {
    it('passes when result contains substring', async () => {
        const assert = new RhostAssert(makeClient('hello world'));
        await expect(assert.contains('something', 'world')).resolves.toBeDefined();
    });

    it('fails when result does not contain substring', async () => {
        const assert = new RhostAssert(makeClient('hello'));
        await expect(assert.contains('something', 'world')).rejects.toBeInstanceOf(RhostAssertionError);
    });
});

describe('RhostAssert.batch()', () => {
    it('passes all cases', async () => {
        const client = {
            eval: jest.fn()
                .mockResolvedValueOnce('5')
                .mockResolvedValueOnce('hello'),
        } as unknown as RhostClient;
        const assert = new RhostAssert(client);
        const results = await assert.batch([
            ['add(2,3)', '5'],
            ['lcstr(HELLO)', 'hello'],
        ]);
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.passed)).toBe(true);
    });

    it('throws with summary after running all cases', async () => {
        const client = {
            eval: jest.fn()
                .mockResolvedValueOnce('5')
                .mockResolvedValueOnce('wrong'),
        } as unknown as RhostClient;
        const assert = new RhostAssert(client);
        await expect(
            assert.batch([['add(2,3)', '5'], ['lcstr(HELLO)', 'hello']])
        ).rejects.toThrow('1 of 2');
    });
});
