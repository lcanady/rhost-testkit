/**
 * 01-functions.ts — Testing built-in softcode functions
 *
 * Covers: math, strings, lists, control flow, type checks.
 * No object creation needed — pure expression evaluation.
 *
 * Run:
 *   npx ts-node examples/01-functions.ts
 */
import { RhostRunner } from '../src';

const runner = new RhostRunner();

// Suppress background cron job output that can bleed into eval results
runner.describe('setup', ({ beforeAll }) => {
    beforeAll(async ({ client }) => {
        // Halt any pending queue items that could interleave with our evals
        await client.command('@halt/all me');
    });
});

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

runner.describe('Math functions', ({ it }) => {
    it('basic arithmetic',        async ({ expect }) => {
        await expect('add(2,3)').toBe('5');
        await expect('sub(10,3)').toBe('7');
        await expect('mul(6,7)').toBe('42');
        await expect('div(15,3)').toBe('5');
        await expect('mod(10,3)').toBe('1');
    });

    it('abs() strips the sign',   async ({ expect }) => {
        await expect('abs(-42)').toBe('42');
        await expect('abs(42)').toBe('42');
    });

    it('max() and min()',          async ({ expect }) => {
        await expect('max(1,5,3,2,4)').toBe('5');
        await expect('min(1,5,3,2,4)').toBe('1');
    });

    it('power(base,exp)',          async ({ expect }) => {
        await expect('power(2,10)').toBe('1024');
        await expect('power(3,3)').toBe('27');
    });

    it('sqrt() returns a number', async ({ expect }) => {
        await expect('sqrt(16)').toBeNumber();
        await expect('sqrt(16)').toBeCloseTo(4, 4);
    });

    it('pi() is approximately 3.14159', async ({ expect }) => {
        await expect('pi()').toBeCloseTo(3.14159, 4);
    });

    it('non-zero result is truthy', async ({ expect }) => {
        await expect('add(1,1)').toBeTruthy();
        await expect('mul(0,99)').toBeFalsy();
    });

    it('result is NOT something wrong', async ({ expect }) => {
        await expect('add(2,3)').not.toBe('0');
        await expect('add(2,3)').not.toBeError();
    });
});

// ---------------------------------------------------------------------------
// String functions
// ---------------------------------------------------------------------------

runner.describe('String functions', ({ it }) => {
    it('case conversion', async ({ expect }) => {
        await expect('lcstr(HELLO WORLD)').toBe('hello world');
        await expect('ucstr(hello world)').toBe('HELLO WORLD');
        await expect('capstr(hello world)').toBe('Hello world');
    });

    it('slicing and padding', async ({ expect }) => {
        await expect('left(abcdef,3)').toBe('abc');
        await expect('right(abcdef,3)').toBe('def');
        await expect('mid(abcdef,2,3)').toBe('cde');
        await expect('center(hi,10)').toBe('    hi    ');
    });

    it('strlen()', async ({ expect }) => {
        await expect('strlen(mushcode)').toBe('8');
        await expect('strlen()').toBe('0');
    });

    it('trim() strips whitespace', async ({ expect }) => {
        await expect('trim(  hello  )').toBe('hello');
        await expect('trim(hello)').toBe('hello');
    });

    it('repeat()', async ({ expect }) => {
        await expect('repeat(ab,3)').toBe('ababab');
        await expect('repeat(x,0)').toBe('');
    });

    it('reverse()', async ({ expect }) => {
        await expect('reverse(hello)').toBe('olleh');
        await expect('reverse(racecar)').toBe('racecar');
    });

    it('cat() joins with a space', async ({ expect }) => {
        await expect('cat(hello,world)').toBe('hello world');
        await expect('cat(a,b,c,d)').toBe('a b c d');
    });

    it('contains / starts / ends', async ({ expect }) => {
        await expect('cat(hello,world)').toContain('world');
        await expect('cat(hello,world)').toStartWith('hello');
        await expect('cat(hello,world)').toEndWith('world');
        await expect('lcstr(HELLO)').not.toContain('X');
    });

    it('match() pattern matching', async ({ expect }) => {
        await expect('match(hello world,hello*)').toBe('1');
        await expect('match(hello world,*world)').toBe('2');  // returns 1-indexed position of matching word
        await expect('match(hello world,foo*)').toBe('0');
    });

    it('result matches a regex', async ({ expect }) => {
        await expect('strlen(mushcode)').toMatch(/^\d+$/);
        await expect('lcstr(HELLO123)').toMatch(/^[a-z0-9]+$/);
    });
});

// ---------------------------------------------------------------------------
// List functions
// ---------------------------------------------------------------------------

runner.describe('List functions', ({ it }) => {
    it('first() / last() / rest()', async ({ expect }) => {
        await expect('first(a b c d)').toBe('a');
        await expect('last(a b c d)').toBe('d');
        await expect('rest(a b c d)').toBe('b c d');
    });

    it('words() counts elements', async ({ expect }) => {
        await expect('words(a b c d)').toBe('4');
        await expect('words()').toBe('0');
        await expect('words(solo)').toBe('1');
    });

    it('member() finds position (1-indexed)', async ({ expect }) => {
        await expect('member(a b c,b)').toBe('2');
        await expect('member(a b c,d)').toBe('0');  // not found => 0
        await expect('member(a b c,b)').not.toBe('0');
    });

    it('ldelete() removes by position', async ({ expect }) => {
        await expect('ldelete(a b c d,2)').toBe('a c d');
        await expect('ldelete(a b c,1)').toBe('b c');
    });

    it('extract() returns a slice', async ({ expect }) => {
        await expect('extract(a b c d e,2,3)').toBe('b c d');
        await expect('extract(a b c d e,1,1)').toBe('a');
    });

    it('sort() alpha ascending', async ({ expect }) => {
        await expect('sort(c a b e d)').toBe('a b c d e');
    });

    it('iter() maps over each element', async ({ expect }) => {
        await expect('iter(1 2 3 4,mul(##,2))').toBe('2 4 6 8');
        await expect('iter(hello world,ucstr(##))').toBe('HELLO WORLD');
    });

    it('list matchers', async ({ expect }) => {
        await expect('sort(c a b)').toContainWord('b');
        await expect('sort(c a b)').toHaveWordCount(3);
        await expect('sort(c a b)').not.toContainWord('z');
        await expect('sort(c a b)').not.toHaveWordCount(5);
    });

    it('setunion() / setdiff() / setinter()', async ({ expect }) => {
        await expect('setunion(a b c,b c d)').toContainWord('a');
        await expect('setunion(a b c,b c d)').toContainWord('d');
        await expect('setdiff(a b c,b c)').toBe('a');
        await expect('setinter(a b c,b c d)').toBe('b c');
    });
});

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

runner.describe('Control flow', ({ it }) => {
    it('if() / ifelse()', async ({ expect }) => {
        await expect('if(1,yes,no)').toBe('yes');
        await expect('if(0,yes,no)').toBe('no');
        await expect('if(gt(5,3),big,small)').toBe('big');
    });

    it('switch() with default', async ({ expect }) => {
        await expect('switch(2,1,one,2,two,three,three,other)').toBe('two');
        await expect('switch(9,1,one,2,two,other)').toBe('other');
    });

    it('nested if() picks first true branch', async ({ expect }) => {
        // RhostMUSH has no cond(); use nested if() instead
        await expect('if(0,no,if(0,also-no,if(1,yes,never)))').toBe('yes');
    });

    it('and() / or() / not() / xor()', async ({ expect }) => {
        await expect('and(1,1,1)').toBe('1');
        await expect('and(1,0,1)').toBe('0');
        await expect('or(0,0,1)').toBe('1');
        await expect('not(0)').toBe('1');
        await expect('not(1)').toBe('0');
        await expect('xor(1,0)').toBe('1');
        await expect('xor(1,1)').toBe('0');
    });

    it('eq() / gt() / lt() / gte() / lte()', async ({ expect }) => {
        await expect('eq(5,5)').toBeTruthy();
        await expect('eq(5,6)').toBeFalsy();
        await expect('gt(10,5)').toBeTruthy();
        await expect('lt(3,5)').toBeTruthy();
        await expect('gte(5,5)').toBeTruthy();
        await expect('lte(4,5)').toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Type checks
// ---------------------------------------------------------------------------

runner.describe('Type checks', ({ it }) => {
    it('isnum()', async ({ expect }) => {
        await expect('isnum(42)').toBe('1');
        await expect('isnum(3.14)').toBe('1');
        await expect('isnum(-7)').toBe('1');
        await expect('isnum(hello)').toBe('0');
        await expect('isnum()').toBe('0');
    });

    it('isdbref()', async ({ expect }) => {
        await expect('isdbref(#1)').toBe('1');
        await expect('isdbref(#0)').toBe('1');
        await expect('isdbref(foo)').toBe('0');
        await expect('isdbref(42)').toBe('0');
    });

    it('result type matchers', async ({ expect }) => {
        await expect('add(1,1)').toBeNumber();
        await expect('lcstr(HELLO)').not.toBeNumber();
        await expect('loc(me)').toBeDbref();  // num(me) emits quota warnings; loc(me) returns room dbref cleanly
        await expect('lcstr(HELLO)').not.toBeDbref();
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

runner.describe('Error handling', ({ it }) => {
    it('div by zero is a #-1 error', async ({ expect }) => {
        await expect('div(1,0)').toBeError();
        await expect('div(1,0)').toStartWith('#-1');
    });

    it('unknown function returns its literal text (not a #-1 error)', async ({ expect }) => {
        // RhostMUSH returns the unparsed literal for unknown functions, not #-1
        await expect('totally_nonexistent_func_xyz()').toMatch('totally_nonexistent_func_xyz');
    });

    it('valid call is NOT an error', async ({ expect }) => {
        await expect('add(2,3)').not.toBeError();
        await expect('lcstr(HELLO)').not.toBeError();
    });

    it('missing required arg gives an error', async ({ expect }) => {
        await expect('left(hello)').toBeError();
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia', paceMs: 150 })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
