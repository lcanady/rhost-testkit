import { RhostClient } from '../client';
import { RhostExpect, RhostExpectError } from '../expect';

// ---------------------------------------------------------------------------
// Helper: build a mock client that returns a preset string from eval()
// ---------------------------------------------------------------------------

function mockClient(evalResult: string): RhostClient {
    return {
        eval: jest.fn().mockResolvedValue(evalResult),
    } as unknown as RhostClient;
}

function ex(result: string, expr = 'test_expr'): RhostExpect {
    return new RhostExpect(mockClient(result), expr);
}

// ---------------------------------------------------------------------------
// toBe
// ---------------------------------------------------------------------------

describe('RhostExpect.toBe()', () => {
    it('passes when values match', async () => {
        await expect(ex('5').toBe('5')).resolves.toBeUndefined();
    });

    it('trims before compare', async () => {
        await expect(ex('  5  ').toBe('5')).resolves.toBeUndefined();
    });

    it('throws RhostExpectError on mismatch', async () => {
        await expect(ex('42').toBe('5')).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('error message is human-readable', async () => {
        try {
            await ex('42', 'add(2,3)').toBe('5');
        } catch (e) {
            expect((e as Error).message).toMatch('add(2,3)');
            expect((e as Error).message).toMatch('"5"');
            expect((e as Error).message).toMatch('"42"');
        }
    });

    it('.not.toBe passes when values differ', async () => {
        await expect(ex('42').not.toBe('5')).resolves.toBeUndefined();
    });

    it('.not.toBe throws when values match', async () => {
        await expect(ex('5').not.toBe('5')).rejects.toBeInstanceOf(RhostExpectError);
    });
});

// ---------------------------------------------------------------------------
// toMatch
// ---------------------------------------------------------------------------

describe('RhostExpect.toMatch()', () => {
    it('passes with matching RegExp', async () => {
        await expect(ex('hello world').toMatch(/hello/)).resolves.toBeUndefined();
    });

    it('passes with matching string', async () => {
        await expect(ex('hello world').toMatch('world')).resolves.toBeUndefined();
    });

    it('throws on non-match RegExp', async () => {
        await expect(ex('hello').toMatch(/goodbye/)).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toMatch passes on non-match', async () => {
        await expect(ex('hello').not.toMatch(/goodbye/)).resolves.toBeUndefined();
    });

    it('.not.toMatch throws on match', async () => {
        await expect(ex('hello').not.toMatch(/hello/)).rejects.toBeInstanceOf(RhostExpectError);
    });
});

// ---------------------------------------------------------------------------
// toContain
// ---------------------------------------------------------------------------

describe('RhostExpect.toContain()', () => {
    it('passes when substring is present', async () => {
        await expect(ex('hello world').toContain('world')).resolves.toBeUndefined();
    });

    it('throws when substring is absent', async () => {
        await expect(ex('hello').toContain('world')).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toContain passes when absent', async () => {
        await expect(ex('hello').not.toContain('world')).resolves.toBeUndefined();
    });

    it('.not.toContain throws when present', async () => {
        await expect(ex('hello world').not.toContain('world')).rejects.toBeInstanceOf(RhostExpectError);
    });
});

// ---------------------------------------------------------------------------
// toStartWith / toEndWith
// ---------------------------------------------------------------------------

describe('RhostExpect.toStartWith()', () => {
    it('passes when string starts with prefix', async () => {
        await expect(ex('foobar').toStartWith('foo')).resolves.toBeUndefined();
    });

    it('throws when string does not start with prefix', async () => {
        await expect(ex('barfoo').toStartWith('foo')).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toStartWith passes on non-match', async () => {
        await expect(ex('barfoo').not.toStartWith('foo')).resolves.toBeUndefined();
    });
});

describe('RhostExpect.toEndWith()', () => {
    it('passes when string ends with suffix', async () => {
        await expect(ex('foobar').toEndWith('bar')).resolves.toBeUndefined();
    });

    it('throws when string does not end with suffix', async () => {
        await expect(ex('foobar').toEndWith('foo')).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toEndWith passes on non-match', async () => {
        await expect(ex('foobar').not.toEndWith('foo')).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toBeCloseTo
// ---------------------------------------------------------------------------

describe('RhostExpect.toBeCloseTo()', () => {
    it('passes when within default precision (0.001)', async () => {
        await expect(ex('3.14159').toBeCloseTo(3.14159)).resolves.toBeUndefined();
    });

    it('passes with custom precision', async () => {
        await expect(ex('3.1').toBeCloseTo(3.14, 1)).resolves.toBeUndefined();
    });

    it('throws when outside tolerance', async () => {
        await expect(ex('3.2').toBeCloseTo(3.14159)).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('throws when value is not a number', async () => {
        await expect(ex('hello').toBeCloseTo(3.14)).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeCloseTo passes when outside range', async () => {
        await expect(ex('10').not.toBeCloseTo(3.14)).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toBeTruthy / toBeFalsy
// ---------------------------------------------------------------------------

describe('RhostExpect.toBeTruthy()', () => {
    it('passes for non-zero non-empty non-error', async () => {
        await expect(ex('hello').toBeTruthy()).resolves.toBeUndefined();
        await expect(ex('1').toBeTruthy()).resolves.toBeUndefined();
    });

    it('throws for empty string', async () => {
        await expect(ex('').toBeTruthy()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('throws for "0"', async () => {
        await expect(ex('0').toBeTruthy()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('throws for #-1 error', async () => {
        await expect(ex('#-1 FUNCTION NOT FOUND').toBeTruthy()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeTruthy passes for "0"', async () => {
        await expect(ex('0').not.toBeTruthy()).resolves.toBeUndefined();
    });
});

describe('RhostExpect.toBeFalsy()', () => {
    it('passes for "0"', async () => {
        await expect(ex('0').toBeFalsy()).resolves.toBeUndefined();
    });

    it('passes for empty string', async () => {
        await expect(ex('').toBeFalsy()).resolves.toBeUndefined();
    });

    it('passes for #-1 error', async () => {
        await expect(ex('#-1 NO MATCH').toBeFalsy()).resolves.toBeUndefined();
    });

    it('throws for truthy value', async () => {
        await expect(ex('hello').toBeFalsy()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeFalsy passes for truthy value', async () => {
        await expect(ex('hello').not.toBeFalsy()).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toBeError
// ---------------------------------------------------------------------------

describe('RhostExpect.toBeError()', () => {
    it('passes for #-1', async () => {
        await expect(ex('#-1 FUNCTION NOT FOUND').toBeError()).resolves.toBeUndefined();
    });

    it('passes for #-2', async () => {
        await expect(ex('#-2 ERROR').toBeError()).resolves.toBeUndefined();
    });

    it('passes for #-3', async () => {
        await expect(ex('#-3 ERROR').toBeError()).resolves.toBeUndefined();
    });

    it('throws for normal value', async () => {
        await expect(ex('5').toBeError()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeError passes for normal value', async () => {
        await expect(ex('5').not.toBeError()).resolves.toBeUndefined();
    });

    it('.not.toBeError throws for error', async () => {
        await expect(ex('#-1 FOO').not.toBeError()).rejects.toBeInstanceOf(RhostExpectError);
    });
});

// ---------------------------------------------------------------------------
// toBeDbref
// ---------------------------------------------------------------------------

describe('RhostExpect.toBeDbref()', () => {
    it('passes for #0', async () => {
        await expect(ex('#0').toBeDbref()).resolves.toBeUndefined();
    });

    it('passes for #42', async () => {
        await expect(ex('#42').toBeDbref()).resolves.toBeUndefined();
    });

    it('throws for #-1 (error dbref)', async () => {
        await expect(ex('#-1').toBeDbref()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('throws for plain string', async () => {
        await expect(ex('hello').toBeDbref()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeDbref passes for non-dbref', async () => {
        await expect(ex('hello').not.toBeDbref()).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toBeNumber
// ---------------------------------------------------------------------------

describe('RhostExpect.toBeNumber()', () => {
    it('passes for integer string', async () => {
        await expect(ex('42').toBeNumber()).resolves.toBeUndefined();
    });

    it('passes for float string', async () => {
        await expect(ex('3.14').toBeNumber()).resolves.toBeUndefined();
    });

    it('throws for non-numeric string', async () => {
        await expect(ex('hello').toBeNumber()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('throws for empty string', async () => {
        await expect(ex('').toBeNumber()).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('.not.toBeNumber passes for non-numeric', async () => {
        await expect(ex('hello').not.toBeNumber()).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toContainWord / toHaveWordCount
// ---------------------------------------------------------------------------

describe('RhostExpect.toContainWord()', () => {
    it('passes when word is in the list', async () => {
        await expect(ex('a b c').toContainWord('b')).resolves.toBeUndefined();
    });

    it('throws when word is not in the list', async () => {
        await expect(ex('a b c').toContainWord('z')).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('supports custom separator', async () => {
        await expect(ex('a|b|c').toContainWord('b', '|')).resolves.toBeUndefined();
    });

    it('.not.toContainWord passes when word is absent', async () => {
        await expect(ex('a b c').not.toContainWord('z')).resolves.toBeUndefined();
    });
});

describe('RhostExpect.toHaveWordCount()', () => {
    it('passes with correct count', async () => {
        await expect(ex('a b c').toHaveWordCount(3)).resolves.toBeUndefined();
    });

    it('throws with wrong count', async () => {
        await expect(ex('a b c').toHaveWordCount(2)).rejects.toBeInstanceOf(RhostExpectError);
    });

    it('counts 0 for empty string', async () => {
        await expect(ex('').toHaveWordCount(0)).resolves.toBeUndefined();
    });

    it('.not.toHaveWordCount passes when count differs', async () => {
        await expect(ex('a b c').not.toHaveWordCount(2)).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Result caching: eval() is only called once per RhostExpect instance
// ---------------------------------------------------------------------------

describe('RhostExpect result caching', () => {
    it('calls eval() only once even with multiple matchers', async () => {
        const evalFn = jest.fn().mockResolvedValue('5');
        const client = { eval: evalFn } as unknown as RhostClient;
        const e = new RhostExpect(client, 'add(2,3)');
        await e.toBe('5');
        await e.toBeNumber();
        expect(evalFn).toHaveBeenCalledTimes(1);
    });
});
