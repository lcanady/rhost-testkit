/**
 * 08-execscript.ts — RhostMUSH execscript: external scripts from softcode
 *
 * execscript() lets MUSH softcode call shell scripts (or any executable) on
 * the host filesystem.  RhostMUSH passes arguments as environment variables
 * and returns stdout as the softcode result — bridging the MUSH world to the
 * full power of the OS.
 *
 * How it works
 * ────────────
 *   execscript(script_name, arg1, |, arg2, |, arg3)
 *
 *   The pipe character "|" separates arguments.  Each argument is exposed to
 *   the script as:
 *     MUSHQ_0, MUSHQ_1, MUSHQ_2, …   positional arguments
 *     MUSHQ_U                          calling user's dbref (#1, #42, …)
 *     MUSHQ_N                          calling user's name
 *     MUSHN_<NAME>                     named registers set with setr(name,val)
 *
 *   Scripts live in the directory configured as `execscripthome` in
 *   netrhost.conf — in this container: /home/rhost/game/scripts/
 *
 * Prerequisites
 * ─────────────
 *   docker compose up --build -d   ← runs the container with scripts/ baked in
 *
 *   The entrypoint automatically grants the EXECSCRIPT power to Wizard on
 *   first startup.  You can also grant it manually:
 *     @power me=execscript
 *
 * Run:
 *   npx ts-node examples/08-execscript.ts
 */
import { RhostRunner } from '../src';

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Setup: grant EXECSCRIPT power (idempotent — safe to run repeatedly)
// ---------------------------------------------------------------------------

runner.describe('execscript setup', ({ beforeAll }) => {
    beforeAll(async ({ client }) => {
        // Grant the EXECSCRIPT power to the calling object (Wizard) at
        // Councilor level — required for execscript() to execute.
        // The entrypoint does this automatically; this is a safety net.
        await client.command('@power/councilor me=EXECSCRIPT');
        await client.command('@set me=SIDEFX');
    });

    // No tests in this block — it just runs the hook.
});

// ---------------------------------------------------------------------------
// 1. Basic execution — no arguments
// ---------------------------------------------------------------------------

runner.describe('execscript basics', ({ it }) => {
    it('hello.sh returns a greeting string', async ({ expect }) => {
        await expect('execscript(hello.sh)').toContain('Hello');
    });

    it('result is a non-empty string', async ({ expect }) => {
        await expect('strlen(execscript(hello.sh))').toBeNumber();
        // strlen returns a number, so we know we got a real string back
        const len = await (async () => {
            const r = new (await import('../src')).RhostExpect(
                // @ts-ignore — accessing internal client for demonstration
                null, 'strlen(execscript(hello.sh))'
            );
            return r;
        })();
        await expect('gt(strlen(execscript(hello.sh)),0)').toBe('1');
    });
});

// ---------------------------------------------------------------------------
// 2. Argument passing (shell arithmetic via math.sh)
// ---------------------------------------------------------------------------

runner.describe('execscript arg passing', ({ it }) => {
    it('add(10, 5) via shell = 15', async ({ expect }) => {
        await expect('execscript(math.sh,10,|,5,|,add)').toBe('15');
    });

    it('sub(100, 37) via shell = 63', async ({ expect }) => {
        await expect('execscript(math.sh,100,|,37,|,sub)').toBe('63');
    });

    it('mul(6, 7) via shell = 42', async ({ expect }) => {
        await expect('execscript(math.sh,6,|,7,|,mul)').toBe('42');
    });

    it('div(100, 4) via shell = 25', async ({ expect }) => {
        await expect('execscript(math.sh,100,|,4,|,div)').toBe('25');
    });

    it('mod(17, 5) via shell = 2', async ({ expect }) => {
        await expect('execscript(math.sh,17,|,5,|,mod)').toBe('2');
    });

    it('pow(2, 10) via shell = 1024', async ({ expect }) => {
        await expect('execscript(math.sh,2,|,10,|,pow)').toBe('1024');
    });

    it('div by zero returns error token', async ({ expect }) => {
        await expect('execscript(math.sh,42,|,0,|,div)').toStartWith('#-1');
    });

    it('unknown op returns error token', async ({ expect }) => {
        await expect('execscript(math.sh,1,|,1,|,xor)').toStartWith('#-1');
    });
});

// ---------------------------------------------------------------------------
// 3. MUSH expressions can be composed around execscript results
// ---------------------------------------------------------------------------

runner.describe('execscript in softcode expressions', ({ it }) => {
    it('result is usable in further arithmetic', async ({ expect }) => {
        // execscript gives 6*7=42, then MUSH adds 8 → 50
        await expect('add(execscript(math.sh,6,|,7,|,mul),8)').toBe('50');
    });

    it('result can be stored in a register', async ({ expect }) => {
        // setq(0, result) stores silently; r(0) retrieves it
        await expect('setq(0,execscript(math.sh,3,|,3,|,pow))[r(0)]').toBe('27');
    });

    it('result can drive switch()', async ({ expect }) => {
        await expect(
            'switch(execscript(math.sh,10,|,2,|,mul),' +
            '20,twenty,' +
            '30,thirty,' +
            'other)'
        ).toBe('twenty');
    });
});

// ---------------------------------------------------------------------------
// 4. Word counting (shell wc wrapper)
// ---------------------------------------------------------------------------

runner.describe('execscript wordcount.sh', ({ it }) => {
    it('counts words in a string', async ({ expect }) => {
        await expect('execscript(wordcount.sh,the quick brown fox,|,words)').toBe('4');
    });

    it('counts characters', async ({ expect }) => {
        await expect('execscript(wordcount.sh,hello,|,chars)').toBe('5');
    });

    it('bad mode returns error token', async ({ expect }) => {
        await expect('execscript(wordcount.sh,hello,|,bytes)').toStartWith('#-1');
    });
});

// ---------------------------------------------------------------------------
// 5. Python script — multilingual greeting
// ---------------------------------------------------------------------------

runner.describe('execscript Python (greet.py)', ({ it }) => {
    it('greets in English by default', async ({ expect }) => {
        await expect('execscript(greet.py,World)').toContain('Hello');
    });

    it('greets in Spanish', async ({ expect }) => {
        await expect('execscript(greet.py,Alice,|,es)').toContain('Hola');
    });

    it('greets in French', async ({ expect }) => {
        await expect('execscript(greet.py,Bob,|,fr)').toContain('Bonjour');
    });

    it('greets with a dynamic name from MUSH', async ({ expect }) => {
        // The name comes from a softcode expression evaluated before the call
        await expect('execscript(greet.py,name([me]),|,en)').toContain('Hello');
    });
});

// ---------------------------------------------------------------------------
// 6. Python JSON extraction (json_get.py)
// ---------------------------------------------------------------------------

runner.describe('execscript Python JSON (json_get.py)', ({ it }) => {
    it('extracts a numeric value by key', async ({ expect }) => {
        await expect('execscript(json_get.py,{"hp":42\\,"mp":10},|,hp)').toBe('42');
    });

    it('extracts a string value by key', async ({ expect }) => {
        await expect('execscript(json_get.py,{"name":"Aragorn"},|,name)').toBe('Aragorn');
    });

    it('returns error on missing key', async ({ expect }) => {
        await expect('execscript(json_get.py,{"hp":10},|,mp)').toStartWith('#-1');
    });

    it('returns error on invalid JSON', async ({ expect }) => {
        await expect('execscript(json_get.py,not-json,|,key)').toStartWith('#-1');
    });
});

// ---------------------------------------------------------------------------
// 7. Named registers are passed as MUSHN_<NAME> env vars
// ---------------------------------------------------------------------------

runner.describe('execscript named register env vars', ({ it }) => {
    it('MUSHQ_U and MUSHQ_N are set (userinfo.sh)', async ({ expect }) => {
        // The script echoes "Name=#dbref" — both should be non-empty
        const result = await expect('execscript(userinfo.sh)');
        // Result format: "SomeName=#N"
        await result.toMatch(/^.+=\#\d+$/);
    });

    it('calling user is a valid dbref', async ({ expect }) => {
        // Extract just the dbref part: last token after "="
        await expect(
            'last(execscript(userinfo.sh),=)'
        ).toBeDbref();
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
