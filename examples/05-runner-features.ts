/**
 * 05-runner-features.ts — RhostRunner features
 *
 * Demonstrates: nested describes, it.skip, it.only, describe.skip,
 * beforeAll/afterAll/beforeEach/afterEach hooks, per-test timeouts,
 * and how to inspect the RunResult programmatically.
 *
 * Run:
 *   npx ts-node examples/05-runner-features.ts
 */
import { RhostRunner, RhostWorld } from '../src';

// ---------------------------------------------------------------------------
// Nested describes
// ---------------------------------------------------------------------------

const runner = new RhostRunner();

runner.describe('Nested suites', ({ it, describe }) => {
    it('top-level test', async ({ expect }) => {
        await expect('add(1,1)').toBe('2');
    });

    describe('Level 2', ({ it, describe }) => {
        it('level-2 test', async ({ expect }) => {
            await expect('mul(3,3)').toBe('9');
        });

        describe('Level 3', ({ it }) => {
            it('level-3 test', async ({ expect }) => {
                await expect('power(2,8)').toBe('256');
            });
        });
    });
});

// ---------------------------------------------------------------------------
// it.skip — mark tests as pending
// ---------------------------------------------------------------------------

runner.describe('it.skip examples', ({ it }) => {
    it('this test runs', async ({ expect }) => {
        await expect('add(2,3)').toBe('5');
    });

    it.skip('not implemented yet — tracked as skipped', async ({ expect }) => {
        // This body never executes
        await expect('some_future_func()').toBe('result');
    });

    it.skip('another pending test', async () => {
        throw new Error('should never run');
    });
});

// ---------------------------------------------------------------------------
// describe.skip — skip an entire suite
// ---------------------------------------------------------------------------

runner.describe('Outer suite (runs)', ({ it, describe }) => {
    it('this runs', async ({ expect }) => {
        await expect('lcstr(HELLO)').toBe('hello');
    });

    describe.skip('Skipped inner suite', ({ it }) => {
        it('skipped test A', async () => { throw new Error('should not run'); });
        it('skipped test B', async () => { throw new Error('should not run'); });
    });
});

// ---------------------------------------------------------------------------
// it.only — focus on specific tests
// (comment/uncomment to try; .only skips all non-only siblings)
// ---------------------------------------------------------------------------

runner.describe('it.only example (currently all run)', ({ it }) => {
    // Uncomment .only on one test to see the others get skipped:

    it('test A', async ({ expect }) => {
        await expect('add(1,2)').toBe('3');
    });

    it('test B', async ({ expect }) => {
        await expect('add(2,3)').toBe('5');
    });

    it('test C', async ({ expect }) => {
        await expect('add(3,4)').toBe('7');
    });
});

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

runner.describe('Hooks', ({ it, beforeAll, afterAll, beforeEach, afterEach }) => {
    // Shared state set up once for the whole suite
    let sharedObj: string;
    let suiteWorld: RhostWorld;

    beforeAll(async ({ world }) => {
        suiteWorld = world;
        sharedObj = await world.create('SharedFixture');
        await world.set(sharedObj, 'MULTIPLIER', '10');
        console.log(`  [beforeAll] Created shared object: ${sharedObj}`);
    });

    afterAll(async () => {
        await suiteWorld.cleanup();
        console.log('  [afterAll]  Cleaned up shared object');
    });

    // Per-test logging
    beforeEach(async ({ world }) => {
        console.log('  [beforeEach] Starting test');
        // Can also set up per-test objects here via world
    });

    afterEach(async () => {
        console.log('  [afterEach]  Test complete\n');
    });

    it('uses the shared object from beforeAll', async ({ expect }) => {
        await expect(`get(${sharedObj}/MULTIPLIER)`).toBe('10');
    });

    it('reads multiplier and uses it in a calculation', async ({ expect }) => {
        await expect(`mul(get(${sharedObj}/MULTIPLIER),5)`).toBe('50');
    });

    it('creates a per-test object (auto-cleaned)', async ({ expect, world }) => {
        const perTest = await world.create('PerTestObj');
        await world.set(perTest, 'VAL', 'test-value');
        await expect(`get(${perTest}/VAL)`).toBe('test-value');
        // perTest is destroyed automatically; sharedObj survives to the next test
    });
});

// ---------------------------------------------------------------------------
// Per-test timeout
// ---------------------------------------------------------------------------

runner.describe('Timeouts', ({ it }) => {
    it('fast test with explicit short timeout', async ({ expect }) => {
        await expect('add(2,3)').toBe('5');
    }, 5000);  // 5 seconds — more than enough

    // Uncomment to see a timeout failure:
    // it('this would time out', async () => {
    //   await new Promise((resolve) => setTimeout(resolve, 99999));
    // }, 500);
});

// ---------------------------------------------------------------------------
// Inspecting RunResult programmatically
// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' }).then((result) => {
    // The runner already prints a summary, but you can also inspect the result:
    if (result.failures.length > 0) {
        console.error('\nFailed tests:');
        for (const f of result.failures) {
            console.error(`  [${f.suite}] ${f.test}`);
            console.error(`  ${f.error.message}\n`);
        }
    }

    console.log(`\nFinal: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);
    process.exit(result.failed > 0 ? 1 : 0);
});
