/**
 * 12-personas.ts — Multi-persona test matrix
 *
 * The single biggest blind spot in MUSH testing: everyone tests as Wizard, so
 * permission bugs are invisible. This example defines tests that run against
 * multiple permission levels and asserts exactly which outputs should match and
 * which should differ.
 *
 * Requirements:
 *   Three characters must exist on the server:
 *     - Wizard (admin, WIZARD flag set)
 *     - Builder (BUILDER flag set)
 *     - Mortal (no special flags)
 *   Set their passwords in env vars:
 *     RHOST_PASS=<wizard-pass>
 *     RHOST_PASS_BUILDER=<builder-pass>
 *     RHOST_PASS_MORTAL=<mortal-pass>
 *
 * Run:
 *   npx ts-node examples/12-personas.ts
 */
import { RhostRunner } from '../src';

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = Number(process.env.RHOST_PORT ?? 4201);
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const PASS_BUILDER = process.env.RHOST_PASS_BUILDER ?? PASS!;
const PASS_MORTAL  = process.env.RHOST_PASS_MORTAL  ?? PASS!;

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Permission level: who sees what
// ---------------------------------------------------------------------------

runner.describe('Privilege gates', ({ personas }) => {

    // Built-in MUSH functions that are wizard-only
    personas(
        ['mortal', 'builder', 'wizard'],
        'doing() is readable by all',
        async ({ expect, persona: _p }) => {
            // Every player can read their own DOING
            await expect('doing(me)').not.toBeError();
        }
    );

    personas(
        ['mortal', 'builder', 'wizard'],
        'haspower() — mortals lack BUILDER power',
        async ({ expect, persona }) => {
            if (persona === 'mortal') {
                await expect('haspower(me,builder)').toBe('0');
            } else {
                await expect('haspower(me,builder)').not.toBe('0');
            }
        }
    );

    personas(
        ['mortal', 'wizard'],
        'wizards see more from doing()',
        async ({ expect, persona }) => {
            if (persona === 'mortal') {
                // Mortals cannot inspect other players' internals
                await expect('hasflag(me,WIZARD)').toBe('0');
            } else {
                await expect('hasflag(me,WIZARD)').toBe('1');
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Numeric output that differs by permission
// ---------------------------------------------------------------------------

runner.describe('Power checks', ({ personas }) => {

    personas(
        ['mortal', 'builder', 'wizard'],
        'wizards have more quota than mortals by default',
        async ({ expect, persona }) => {
            const quota = parseInt(await expect('quota(me)').evaluate(), 10);
            if (persona === 'wizard') {
                if (quota < 0) throw new Error(`Wizard quota should be unlimited (got ${quota})`);
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const PASS_VAL = PASS!;

runner.run({
    host: HOST, port: PORT,
    username: 'Wizard',
    password: PASS_VAL,
    personas: {
        wizard:  { username: 'Wizard',  password: PASS_VAL },
        builder: { username: 'Builder', password: PASS_BUILDER },
        mortal:  { username: 'Mortal',  password: PASS_MORTAL },
    },
}).then((result) => {
    console.log(`\n${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);
    process.exit(result.failed > 0 ? 1 : 0);
}).catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
