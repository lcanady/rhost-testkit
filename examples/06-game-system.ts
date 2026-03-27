/**
 * 06-game-system.ts — Testing a real-world softcode system end to end
 *
 * Simulates building and testing a small MUSH stat system:
 *   - A character sheet object stores stats (STR, DEX, INT, etc.)
 *   - Helper attributes calculate derived values (modifier, roll)
 *   - A validation attribute enforces ranges
 *   - Tests verify every layer
 *
 * This is the pattern you'd use when developing actual game code.
 *
 * Run:
 *   npx ts-node examples/06-game-system.ts
 */
import { RhostRunner, RhostWorld } from '../src';

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Fixture: install the stat system on an object once for the suite.
// ---------------------------------------------------------------------------

runner.describe('Stat system', ({ it, beforeAll, afterAll, describe }) => {
    let sys: string;         // the "system" object holding helper code
    let suiteWorld: RhostWorld;

    beforeAll(async ({ world }) => {
        suiteWorld = world;
        sys = await world.create('StatSystem');

        // ── Core stat modifier: stat_mod(value) ──────────────────────────
        // D&D-style: floor((stat - 10) / 2)
        await world.set(sys, 'STAT_MOD', 'floor(div(sub(%0,10),2))');

        // ── Roll XdY: roll(num,sides) ─────────────────────────────────────
        // Returns the sum of rolling <num> dice each with <sides> faces.
        // rand(N) returns 0..N-1, so rand(sides)+1 is 1..sides.
        await world.set(sys, 'ROLL',
            'iter(lnum(%0),add(rand(%1),1),, +)'
            // lnum(N) => "0 1 2 … N-1"; iter sums N dice
            // Note: + is the list separator here, so we join with +
            // then evaluate the resulting expression
        );
        // Simpler deterministic version for testing:
        await world.set(sys, 'ROLL_SUM',
            // roll(n, sides): sum n dice of <sides> faces — min n, max n*sides
            'add(iter(lnum(%0),add(rand(%1),1)))'
        );

        // ── Stat validation: valid_stat(value) ───────────────────────────
        // Returns 1 if value is between 1 and 25 (inclusive), else 0.
        await world.set(sys, 'VALID_STAT',
            'and(gte(%0,1),lte(%0,25))'
        );

        // ── Stat label: stat_label(value) ────────────────────────────────
        // Maps a stat value to a descriptive word.
        await world.set(sys, 'STAT_LABEL',
            'switch(1,' +
            'lte(%0,4),Terrible,' +
            'lte(%0,7),Poor,' +
            'lte(%0,9),Below Average,' +
            'eq(%0,10),Average,' +
            'lte(%0,12),Above Average,' +
            'lte(%0,15),Good,' +
            'lte(%0,18),Excellent,' +
            'Legendary' +
            ')'
        );

        // ── Character sheet: new_sheet() ─────────────────────────────────
        // Initialises default stats on %0 (the character object).
        await world.set(sys, 'NEW_SHEET',
            '&STR %0=10 ' +
            '&DEX %0=10 ' +
            '&CON %0=10 ' +
            '&INT %0=10 ' +
            '&WIS %0=10 ' +
            '&CHA %0=10'
        );
    });

    afterAll(async () => {
        await suiteWorld.cleanup();
    });

    // -------------------------------------------------------------------------
    // stat_mod() — modifier calculation
    // -------------------------------------------------------------------------

    describe('stat_mod()', ({ it }) => {
        it('10 => modifier 0 (baseline)', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,10)`).toBe('0');
        });

        it('12 => modifier +1', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,12)`).toBe('1');
        });

        it('8 => modifier -1', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,8)`).toBe('-1');
        });

        it('18 => modifier +4', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,18)`).toBe('4');
        });

        it('3 => modifier -4 (minimum stat)', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,3)`).toBe('-4');
        });

        it('20 => modifier +5', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,20)`).toBe('5');
        });

        it('modifier is always a number', async ({ expect }) => {
            await expect(`u(${sys}/STAT_MOD,15)`).toBeNumber();
        });
    });

    // -------------------------------------------------------------------------
    // valid_stat() — range validation
    // -------------------------------------------------------------------------

    describe('valid_stat()', ({ it }) => {
        it('accepts boundary values 1 and 25', async ({ expect }) => {
            await expect(`u(${sys}/VALID_STAT,1)`).toBe('1');
            await expect(`u(${sys}/VALID_STAT,25)`).toBe('1');
        });

        it('accepts mid-range values', async ({ expect }) => {
            await expect(`u(${sys}/VALID_STAT,10)`).toBeTruthy();
            await expect(`u(${sys}/VALID_STAT,17)`).toBeTruthy();
        });

        it('rejects 0 (below minimum)', async ({ expect }) => {
            await expect(`u(${sys}/VALID_STAT,0)`).toBeFalsy();
        });

        it('rejects 26 (above maximum)', async ({ expect }) => {
            await expect(`u(${sys}/VALID_STAT,26)`).toBeFalsy();
        });

        it('rejects negative numbers', async ({ expect }) => {
            await expect(`u(${sys}/VALID_STAT,-5)`).toBeFalsy();
        });
    });

    // -------------------------------------------------------------------------
    // stat_label() — descriptive label
    // -------------------------------------------------------------------------

    describe('stat_label()', ({ it }) => {
        const cases: [number, string][] = [
            [3,  'Terrible'],
            [6,  'Poor'],
            [8,  'Below Average'],
            [10, 'Average'],
            [11, 'Above Average'],
            [14, 'Good'],
            [17, 'Excellent'],
            [20, 'Legendary'],
        ];

        for (const [value, label] of cases) {
            it(`${value} => "${label}"`, async ({ expect }) => {
                await expect(`u(${sys}/STAT_LABEL,${value})`).toBe(label);
            });
        }
    });

    // -------------------------------------------------------------------------
    // Character sheet: new_sheet() + per-character stat access
    // -------------------------------------------------------------------------

    describe('Character sheet', ({ it }) => {
        it('new_sheet() initialises all stats to 10', async ({ expect, world }) => {
            const char = await world.create('Hero');
            await world.trigger(sys, 'NEW_SHEET', char);

            for (const stat of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
                await expect(`get(${char}/${stat})`).toBe('10');
            }
        });

        it('stats can be changed individually', async ({ expect, world }) => {
            const char = await world.create('Warrior');
            await world.trigger(sys, 'NEW_SHEET', char);

            await world.set(char, 'STR', '18');
            await world.set(char, 'INT', '6');

            await expect(`get(${char}/STR)`).toBe('18');
            await expect(`get(${char}/INT)`).toBe('6');
            // Other stats unchanged
            await expect(`get(${char}/DEX)`).toBe('10');
        });

        it('modifier is calculated from live stat value', async ({ expect, world }) => {
            const char = await world.create('StrongChar');
            await world.trigger(sys, 'NEW_SHEET', char);
            await world.set(char, 'STR', '16');

            // u(sys/STAT_MOD, get(char/STR)) — pass the live value in
            await expect(`u(${sys}/STAT_MOD,get(${char}/STR))`).toBe('3');
        });

        it('label reflects the current stat', async ({ expect, world }) => {
            const char = await world.create('LabelChar');
            await world.trigger(sys, 'NEW_SHEET', char);
            await world.set(char, 'CHA', '18');

            await expect(`u(${sys}/STAT_LABEL,get(${char}/CHA))`).toBe('Excellent');
        });

        it('full stat block is usable in expressions', async ({ expect, world }) => {
            const char = await world.create('FullBlock');
            await world.trigger(sys, 'NEW_SHEET', char);
            await world.set(char, 'STR', '14');
            await world.set(char, 'DEX', '12');
            await world.set(char, 'CON', '16');

            // Total physical stats
            await expect(
                `add(get(${char}/STR),get(${char}/DEX),get(${char}/CON))`
            ).toBe('42');
        });
    });

    // -------------------------------------------------------------------------
    // Roll function — stochastic, tested by range rather than exact value
    // -------------------------------------------------------------------------

    describe('roll_sum()', ({ it }) => {
        it('1d6 result is between 1 and 6', async ({ expect }) => {
            // Roll 10 times and verify each is in range
            for (let i = 0; i < 10; i++) {
                await expect(`u(${sys}/ROLL_SUM,1,6)`).toBeNumber();
                const rolled = Number(await (async () => '')());
                // Use MUSH expressions to check range
                await expect(`and(gte(u(${sys}/ROLL_SUM,1,6),1),lte(u(${sys}/ROLL_SUM,1,6),6))`).toBe('1');
            }
        });

        it('4d6 result is at least 4 (min roll)', async ({ expect }) => {
            await expect(`gte(u(${sys}/ROLL_SUM,4,6),4)`).toBe('1');
        });

        it('4d6 result is at most 24 (max roll)', async ({ expect }) => {
            await expect(`lte(u(${sys}/ROLL_SUM,4,6),24)`).toBe('1');
        });

        it('0d6 sums to 0', async ({ expect }) => {
            await expect(`u(${sys}/ROLL_SUM,0,6)`).toBe('0');
        });
    });
});

// ---------------------------------------------------------------------------
// Standalone: testing a softcode library (no beforeAll needed)
// ---------------------------------------------------------------------------

runner.describe('Inline library test', ({ it }) => {
    it('builds a formatter and tests it', async ({ expect, world }) => {
        const lib = await world.create('Formatter');

        // Format a stat line: "STR: 18 (+4)"
        await world.set(lib, 'STATLINE',
            '[ucstr(%0)]: %1 ([if(gte(floor(div(sub(%1,10),2)),0),+,)][floor(div(sub(%1,10),2))])'
        );

        await expect(`u(${lib}/STATLINE,str,18)`).toBe('STR: 18 (+4)');
        await expect(`u(${lib}/STATLINE,dex,10)`).toBe('DEX: 10 (+0)');
        await expect(`u(${lib}/STATLINE,int,8)`).toBe('INT: 8 (-1)');
    });

    it('builds a list formatter', async ({ expect, world }) => {
        const lib = await world.create('ListFormatter');

        // Pad each element of a list to a fixed width
        await world.set(lib, 'PADLIST', 'iter(%0,ljust(##,%1))');

        await expect(`trim(first(u(${lib}/PADLIST,hello world foo,10)))`).toBe('hello');
        await expect(`words(u(${lib}/PADLIST,a b c,5))`).toBe('3');
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
