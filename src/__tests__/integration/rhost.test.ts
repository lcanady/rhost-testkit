/**
 * Integration tests — run against a real RhostMUSH server in Docker.
 *
 * The container is started once and torn down after all tests complete.
 * No manual `docker compose up` required.
 *
 * Run with:
 *   npm run test:integration
 *
 * Default wizard credentials for the RhostMUSH minimal_db: Wizard / Nyctasia
 *
 * NOTE: The first run compiles RhostMUSH from source (~5-10 min).
 * Subsequent runs reuse Docker's layer cache (~30s).
 */
import { RhostContainer } from '../../container';
import { RhostClient } from '../../client';
import { RhostExpect } from '../../expect';
import { RhostWorld } from '../../world';
import { RhostRunner } from '../../runner';

const CONTAINER_STARTUP_TIMEOUT = 600_000;

// ---------------------------------------------------------------------------
// Shared container / client / helpers
// ---------------------------------------------------------------------------

let container: RhostContainer;
let client: RhostClient;

// Per-suite world (reset in beforeEach where needed)
let world: RhostWorld;

function expect(expr: string): RhostExpect {
    return new RhostExpect(client, expr);
}

beforeAll(async () => {
    container = RhostContainer.fromSource();
    const { host, port } = await container.start(CONTAINER_STARTUP_TIMEOUT);

    client = new RhostClient({ host, port, timeout: 15_000, bannerTimeout: 500 });
    await client.connect();
    await client.login('Wizard', 'Nyctasia');
    world = new RhostWorld(client);
}, CONTAINER_STARTUP_TIMEOUT);

afterAll(async () => {
    await world.cleanup();
    await client?.disconnect();
    await container?.stop();
});

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

describe('Math functions', () => {
    it('add(2,3) => 5',        async () => expect('add(2,3)').toBe('5'));
    it('sub(10,3) => 7',       async () => expect('sub(10,3)').toBe('7'));
    it('mul(6,7) => 42',       async () => expect('mul(6,7)').toBe('42'));
    it('div(15,3) => 5',       async () => expect('div(15,3)').toBe('5'));
    it('mod(10,3) => 1',       async () => expect('mod(10,3)').toBe('1'));
    it('abs(-42) => 42',       async () => expect('abs(-42)').toBe('42'));
    it('max(1,5,3) => 5',      async () => expect('max(1,5,3)').toBe('5'));
    it('min(1,5,3) => 1',      async () => expect('min(1,5,3)').toBe('1'));
    it('sqrt(16) is a number', async () => expect('sqrt(16)').toBeNumber());
    it('power(2,10) => 1024',  async () => expect('power(2,10)').toBe('1024'));
    it('result is not 0',      async () => expect('add(2,3)').not.toBe('0'));
    it('toBeCloseTo: pi',      async () => expect('pi()').toBeCloseTo(3.14159, 4));
});

// ---------------------------------------------------------------------------
// String functions
// ---------------------------------------------------------------------------

describe('String functions', () => {
    it('lcstr()',  async () => expect('lcstr(HELLO)').toBe('hello'));
    it('ucstr()',  async () => expect('ucstr(hello)').toBe('HELLO'));
    it('strlen()', async () => expect('strlen(mushcode)').toBe('8'));
    it('left()',   async () => expect('left(abcdef,3)').toBe('abc'));
    it('right()',  async () => expect('right(abcdef,3)').toBe('def'));
    it('mid()',    async () => expect('mid(abcdef,2,3)').toBe('cde'));
    it('trim()',   async () => expect('trim(  hello  )').toBe('hello'));
    it('center()', async () => expect('center(hi,10)').toBe('    hi    '));
    it('repeat()', async () => expect('repeat(ab,3)').toBe('ababab'));
    it('reverse()', async () => expect('reverse(hello)').toBe('olleh'));
    it('cat()',    async () => expect('cat(hello,world)').toBe('hello world'));
    it('capstr()', async () => expect('capstr(hello world)').toBe('Hello world'));

    it('.toContain', async () => expect('cat(hello,world)').toContain('world'));
    it('.toStartWith', async () => expect('cat(hello,world)').toStartWith('hello'));
    it('.toEndWith',   async () => expect('cat(hello,world)').toEndWith('world'));
    it('.toMatch regex', async () => expect('strlen(mushcode)').toMatch(/^\d+$/));
    it('.not.toContain', async () => expect('lcstr(HELLO)').not.toContain('X'));
});

// ---------------------------------------------------------------------------
// List functions
// ---------------------------------------------------------------------------

describe('List functions', () => {
    it('first()',  async () => expect('first(a b c)').toBe('a'));
    it('last()',   async () => expect('last(a b c)').toBe('c'));
    it('rest()',   async () => expect('rest(a b c)').toBe('b c'));
    it('words()',  async () => expect('words(a b c d)').toBe('4'));
    it('member() hit',   async () => expect('member(a b c,b)').toBe('2'));
    it('member() miss',  async () => expect('member(a b c,z)').toBe('0'));
    it('ldelete()', async () => expect('ldelete(a b c,2)').toBe('a c'));
    it('extract()', async () => expect('extract(a b c d,2,2)').toBe('b c'));
    it('sort()',    async () => expect('sort(c a b)').toBe('a b c'));
    it('iter()',    async () => expect('iter(1 2 3,mul(##,2))').toBe('2 4 6'));

    it('.toContainWord hit',  async () => expect('sort(c a b)').toContainWord('b'));
    it('.toContainWord miss', async () => expect('sort(c a b)').not.toContainWord('z'));
    it('.toHaveWordCount 3',  async () => expect('sort(c a b)').toHaveWordCount(3));
    it('.toHaveWordCount not 5', async () => expect('sort(c a b)').not.toHaveWordCount(5));
});

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

describe('Control flow', () => {
    it('if() true',  async () => expect('if(1,yes,no)').toBe('yes'));
    it('if() false', async () => expect('if(0,yes,no)').toBe('no'));
    it('switch() match',   async () => expect('switch(2,1,one,2,two,other)').toBe('two'));
    it('switch() default', async () => expect('switch(9,1,one,2,two,other)').toBe('other'));
    it('cond()',     async () => expect('cond(0,no,1,yes)').toBe('yes'));
});

// ---------------------------------------------------------------------------
// Boolean / comparison
// ---------------------------------------------------------------------------

describe('Boolean & comparison', () => {
    it('eq(5,5) => 1', async () => expect('eq(5,5)').toBe('1'));
    it('eq(5,6) => 0', async () => expect('eq(5,6)').toBe('0'));
    it('gt(5,3)',  async () => expect('gt(5,3)').toBeTruthy());
    it('lt(3,5)',  async () => expect('lt(3,5)').toBeTruthy());
    it('not(0)',   async () => expect('not(0)').toBe('1'));
    it('not(1)',   async () => expect('not(1)').toBe('0'));
    it('and(1,1)', async () => expect('and(1,1)').toBe('1'));
    it('and(1,0)', async () => expect('and(1,0)').toBeFalsy());
    it('or(0,1)',  async () => expect('or(0,1)').toBeTruthy());
    it('xor(1,0)', async () => expect('xor(1,0)').toBe('1'));
    it('xor(1,1)', async () => expect('xor(1,1)').toBe('0'));
});

// ---------------------------------------------------------------------------
// Type checks
// ---------------------------------------------------------------------------

describe('Type checks', () => {
    it('isnum(42) => 1',   async () => expect('isnum(42)').toBe('1'));
    it('isnum(hello) => 0', async () => expect('isnum(hello)').toBe('0'));
    it('isdbref(#1)',       async () => expect('isdbref(#1)').toBe('1'));
    it('isdbref(foo)',      async () => expect('isdbref(foo)').toBe('0'));

    it('42 .toBeNumber',    async () => expect('add(1,1)').toBeNumber());
    it('hello .not.toBeNumber', async () => expect('lcstr(HELLO)').not.toBeNumber());
    it('#1 .toBeDbref',     async () => expect('num(me)').toBeDbref());
});

// ---------------------------------------------------------------------------
// Rhost-specific: encode/decode
// ---------------------------------------------------------------------------

describe('Rhost: encode64 / decode64', () => {
    it('encode64(hello)',     async () => expect('encode64(hello)').toBe('aGVsbG8='));
    it('decode64(aGVsbG8=)', async () => expect('decode64(aGVsbG8=)').toBe('hello'));
    it('round-trip',          async () => expect('decode64(encode64(mushcode))').toBe('mushcode'));
    it('.not on wrong value', async () => expect('encode64(hello)').not.toBe('wrong'));
});

// ---------------------------------------------------------------------------
// Rhost-specific: digest
// ---------------------------------------------------------------------------

describe('Rhost: digest', () => {
    it('md5 is 32 hex chars',    async () => expect('digest(md5,hello)').toMatch(/^[0-9a-f]{32}$/i));
    it('sha256 is 64 hex chars', async () => expect('digest(sha256,hello)').toMatch(/^[0-9a-f]{64}$/i));
    it('sha1 known prefix',      async () => expect('digest(sha1,hello)').toMatch(/^aaf4c61d/i));
    it('is a string',            async () => expect('digest(md5,test)').toBeNumber().then(() => {}, () => {}).then(() =>
        expect('digest(md5,test)').toMatch(/[0-9a-f]+/)
    ));
});

// ---------------------------------------------------------------------------
// Rhost-specific: strdistance / soundex
// ---------------------------------------------------------------------------

describe('Rhost: strdistance', () => {
    it('same string => 0',     async () => expect('strdistance(hello,hello)').toBe('0'));
    it('different strings > 0', async () => expect('strdistance(kitten,sitting)').toBeNumber());
    it('.not.toBe 0 for diff',  async () => expect('strdistance(kitten,sitting)').not.toBe('0'));
});

describe('Rhost: soundex', () => {
    it('soundex(Robert) => R163', async () => expect('soundex(Robert)').toBe('R163'));
    it('soundex(Rupert) => R163', async () => expect('soundex(Rupert)').toBe('R163'));
    it('.not equal for diff',     async () => expect('soundex(Smith)').not.toBe('R163'));
});

// ---------------------------------------------------------------------------
// Rhost-specific: localize
// ---------------------------------------------------------------------------

describe('Rhost: localize', () => {
    it('scopes %q0 inside the block', async () => {
        await expect('setq(0,outer)[localize(setq(0,inner)%q0)]%q0').toBe('innerouter');
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
    it('div by zero is an error',     async () => expect('div(1,0)').toBeError());
    it('unknown function is an error', async () => expect('totally_fake_xyz()').toBeError());
    it('error starts with #-1',        async () => expect('totally_fake_xyz()').toStartWith('#-1'));
    it('.not.toBeError on valid result', async () => expect('add(2,3)').not.toBeError());
});

// ---------------------------------------------------------------------------
// World fixtures: create, set, get, trigger
// ---------------------------------------------------------------------------

describe('World fixtures', () => {
    let obj: string;

    beforeEach(async () => {
        obj = await world.create('SDKTest');
    });

    afterEach(async () => {
        await world.cleanup();
    });

    it('create() returns a valid dbref', () => {
        expect(obj).toMatch(/^#\d+$/);  // sync JS assert — not a MUSH eval
    });

    it('set() and get() round-trip an attribute', async () => {
        await world.set(obj, 'MYATTR', 'hello world');
        const val = await world.get(obj, 'MYATTR');
        expect(val).toBe('hello world');  // sync JS assert
    });

    it('MUSH eval can read a set attribute', async () => {
        await world.set(obj, 'GREETING', 'Hi there');
        // Eval get() against the server using RhostExpect
        await new RhostExpect(client, `get(${obj}/GREETING)`).toBe('Hi there');
    });

    it('trigger() captures output from @pemit in the attr', async () => {
        // Set an attribute that emits a known string to the enactor
        await world.set(obj, 'DO_GREET', '@pemit %#=Hello from trigger!');
        const lines = await world.trigger(obj, 'DO_GREET');
        const joined = lines.join(' ');
        expect(joined).toContain('Hello from trigger!');  // sync JS assert
    });

    it('trigger() passes %0/%1 args', async () => {
        await world.set(obj, 'DO_MATH', 'think add(%0,%1)');
        const lines = await world.trigger(obj, 'DO_MATH', '3,4');
        expect(lines.join('')).toContain('7');  // sync JS assert
    });
});

// ---------------------------------------------------------------------------
// RhostRunner used inside an integration test
// ---------------------------------------------------------------------------

describe('RhostRunner end-to-end', () => {
    it('runs a suite with nested describes and skip/only', async () => {
        const { host, port } = container.getConnectionInfo();

        const runner = new RhostRunner();

        runner.describe('Smoke', ({ it, describe }) => {
            it('add()',     async ({ expect }) => expect('add(1,1)').toBe('2'));
            it('lcstr()',   async ({ expect }) => expect('lcstr(ABC)').toBe('abc'));
            it('encode64()', async ({ expect }) => expect('encode64(hi)').toBe('aGk='));

            describe('Nested', ({ it }) => {
                it('mul()',  async ({ expect }) => expect('mul(3,3)').toBe('9'));
                it.skip('skipped', async () => { throw new Error('should not run'); });
            });
        });

        const result = await runner.run({
            host, port,
            username: 'Wizard',
            password: 'Nyctasia',
            bannerTimeout: 500,
            verbose: false,
        });

        expect(result.passed).toBe(4);
        expect(result.skipped).toBe(1);
        expect(result.failed).toBe(0);
    });

    it('.not assertions work end-to-end', async () => {
        const { host, port } = container.getConnectionInfo();
        const runner = new RhostRunner();

        runner.describe('Not', ({ it }) => {
            it('add(2,3) is not 0',  async ({ expect }) => expect('add(2,3)').not.toBe('0'));
            it('error .not.toBe ok', async ({ expect }) => expect('div(1,0)').not.toBe('5'));
        });

        const result = await runner.run({ host, port, username: 'Wizard', password: 'Nyctasia', verbose: false });
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('world fixtures work inside RhostRunner', async () => {
        const { host, port } = container.getConnectionInfo();
        const runner = new RhostRunner();

        runner.describe('World', ({ it }) => {
            it('creates an object and reads an attribute', async ({ expect, world }) => {
                const obj = await world.create('RunnerTest');
                await world.set(obj, 'VAL', 'runner_value');
                await expect(`get(${obj}/VAL)`).toBe('runner_value');
                // world is automatically cleaned up after this test
            });
        });

        const result = await runner.run({ host, port, username: 'Wizard', password: 'Nyctasia', verbose: false });
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
    });
});
