/**
 * 02-rhost-specific.ts — RhostMUSH-specific functions
 *
 * Covers features unique to Rhost: encode64/decode64, digest, strdistance,
 * soundex, localize, and the bang (!) logical operators.
 *
 * Run:
 *   npx ts-node examples/02-rhost-specific.ts
 */
import { RhostRunner } from '../src';

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Base64 encoding
// ---------------------------------------------------------------------------

runner.describe('encode64 / decode64', ({ it }) => {
    it('encodes hello', async ({ expect }) => {
        await expect('encode64(hello)').toBe('aGVsbG8=');
    });

    it('decodes back to the original', async ({ expect }) => {
        await expect('decode64(aGVsbG8=)').toBe('hello');
    });

    it('round-trip is lossless', async ({ expect }) => {
        await expect('decode64(encode64(mushcode is fun))').toBe('mushcode is fun');
    });

    it('round-trip with special characters', async ({ expect }) => {
        await expect('decode64(encode64(hello world 123))').toBe('hello world 123');
    });

    it('encoded output is not plaintext', async ({ expect }) => {
        await expect('encode64(hello)').not.toBe('hello');
        await expect('encode64(hello)').not.toBeError();
    });
});

// ---------------------------------------------------------------------------
// Cryptographic digest
// ---------------------------------------------------------------------------

runner.describe('digest()', ({ it }) => {
    it('md5 produces 32 hex characters', async ({ expect }) => {
        await expect('digest(md5,hello)').toMatch(/^[0-9a-f]{32}$/i);
    });

    it('sha1 produces 40 hex characters', async ({ expect }) => {
        await expect('digest(sha1,hello)').toMatch(/^[0-9a-f]{40}$/i);
    });

    it('sha256 produces 64 hex characters', async ({ expect }) => {
        await expect('digest(sha256,hello)').toMatch(/^[0-9a-f]{64}$/i);
    });

    it('sha1(hello) has known prefix', async ({ expect }) => {
        // SHA-1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
        await expect('digest(sha1,hello)').toStartWith('aaf4c61d');
    });

    it('same input always produces same digest', async ({ expect }) => {
        const a = await (async () => {
            // Evaluate twice and compare at the JS level
            return true; // placeholder — real check below
        })();
        await expect('eq(digest(md5,test),digest(md5,test))').toBe('1');
    });

    it('different inputs produce different digests', async ({ expect }) => {
        await expect('eq(digest(md5,hello),digest(md5,world))').toBe('0');
    });

    it('digest is not empty', async ({ expect }) => {
        await expect('digest(sha256,anything)').toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// String distance (Levenshtein)
// ---------------------------------------------------------------------------

runner.describe('strdistance()', ({ it }) => {
    it('identical strings => 0', async ({ expect }) => {
        await expect('strdistance(hello,hello)').toBe('0');
        await expect('strdistance(mushcode,mushcode)').toBe('0');
    });

    it('completely different strings => positive number', async ({ expect }) => {
        await expect('strdistance(kitten,sitting)').toBeNumber();
        await expect('strdistance(kitten,sitting)').not.toBe('0');
    });

    it('single character change => 1', async ({ expect }) => {
        await expect('strdistance(cat,bat)').toBe('1');
        await expect('strdistance(cat,car)').toBe('1');
    });

    it('distance is symmetric', async ({ expect }) => {
        // strdistance(a,b) == strdistance(b,a)
        await expect('eq(strdistance(kitten,sitting),strdistance(sitting,kitten))').toBe('1');
    });

    it('empty vs non-empty => length of non-empty', async ({ expect }) => {
        await expect('strdistance(hello,)').toBe('5');
        await expect('strdistance(,hello)').toBe('5');
    });
});

// ---------------------------------------------------------------------------
// Soundex (phonetic matching)
// ---------------------------------------------------------------------------

runner.describe('soundex()', ({ it }) => {
    it('Robert and Rupert share a soundex code', async ({ expect }) => {
        await expect('soundex(Robert)').toBe('R163');
        await expect('soundex(Rupert)').toBe('R163');
    });

    it('Smith encodes correctly', async ({ expect }) => {
        await expect('soundex(Smith)').toBe('S530');
        await expect('soundex(Smythe)').toBe('S530');
    });

    it('different first letters => different codes', async ({ expect }) => {
        await expect('soundex(Robert)').not.toBe(await (async () => 'S163')());
        // More directly:
        await expect('eq(soundex(Robert),soundex(Smith))').toBe('0');
    });

    it('soundex is a 4-character code', async ({ expect }) => {
        await expect('strlen(soundex(Johnson))').toBe('4');
        await expect('soundex(Johnson)').toMatch(/^[A-Z]\d{3}$/);
    });

    it('can detect phonetically similar names', async ({ expect }) => {
        // Use soundex to compare phonetic similarity
        await expect('eq(soundex(Catherine),soundex(Kathryn))').toBe('1');
    });
});

// ---------------------------------------------------------------------------
// localize() — scoped %q register blocks
// ---------------------------------------------------------------------------

runner.describe('localize()', ({ it }) => {
    it('inner setq does not affect outer %q0', async ({ expect }) => {
        await expect('setq(0,outer)[localize(setq(0,inner)%q0)]%q0')
            .toBe('innerouter');
    });

    it('outer register is unchanged after localize block', async ({ expect }) => {
        // Set outer, enter localize and change it, confirm outer restored
        await expect('setq(0,A)before:[localize(setq(0,B)inside)]after:%q0')
            .toBe('before:insideafter:A');
    });

    it('nested localize scopes are independent', async ({ expect }) => {
        await expect(
            'setq(0,A)[localize(setq(0,B)[localize(setq(0,C)%q0)]%q0)]%q0'
        ).toBe('CBA');
    });

    it('multiple registers are all localized', async ({ expect }) => {
        await expect(
            'setq(0,X)setq(1,Y)[localize(setq(0,a)setq(1,b)%q0%q1)]%q0%q1'
        ).toBe('abXY');
    });

    it('localize returns the value of its argument', async ({ expect }) => {
        await expect('localize(add(2,3))').toBe('5');
    });
});

// ---------------------------------------------------------------------------
// Bang (!) logical operators — Rhost-specific shorthand
// ---------------------------------------------------------------------------

runner.describe('Bang operators', ({ it }) => {
    it('![expr] negates truthiness', async ({ expect }) => {
        await expect('![1]').toBe('0');
        await expect('![0]').toBe('1');
    });

    it('!![expr] double-negation normalises to 0 or 1', async ({ expect }) => {
        await expect('!![5]').toBe('1');
        await expect('!![0]').toBe('0');
        await expect('!![hello]').toBe('1');
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
