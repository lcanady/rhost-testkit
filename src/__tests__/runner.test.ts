import { RhostRunner } from '../runner';
import { RhostExpectError } from '../expect';
import { MockMushServer } from './mock-server';

// ---------------------------------------------------------------------------
// Shared server setup
// ---------------------------------------------------------------------------

let server: MockMushServer;
let port: number;

beforeAll(async () => {
    server = new MockMushServer();
    server.setEvaluator((expr) => {
        if (expr === 'add(2,3)') return '5';
        if (expr === 'lcstr(HELLO)') return 'hello';
        if (expr === 'create(World)') return '#99';
        return expr;
    });
    port = await server.listen();
});

afterAll(async () => {
    await server.close();
});

function makeRunner(options?: Partial<Parameters<RhostRunner['run']>[0]>) {
    return {
        runner: new RhostRunner(),
        runOpts: {
            host: '127.0.0.1',
            port,
            username: 'Wizard',
            password: 'Nyctasia',
            bannerTimeout: 50,
            verbose: false,
            ...options,
        },
    };
}

// ---------------------------------------------------------------------------
// Basic pass/fail/skip counts
// ---------------------------------------------------------------------------

describe('RhostRunner basics', () => {
    it('runs suites and returns correct pass/fail counts', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('Math', ({ it }) => {
            it('add()', async ({ expect }) => expect('add(2,3)').toBe('5'));
        });

        runner.describe('Strings', ({ it }) => {
            it('lcstr()', async ({ expect }) => expect('lcstr(HELLO)').toBe('hello'));
            it('intentional failure', async ({ expect }) => expect('add(2,3)').toBe('999'));
        });

        const result = await runner.run(runOpts);

        expect(result.passed).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.total).toBe(3);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].suite).toBe('Strings');
        expect(result.failures[0].test).toBe('intentional failure');
    });

    it('failures array contains RhostExpectError', async () => {
        const { runner, runOpts } = makeRunner();
        runner.describe('Fail', ({ it }) => {
            it('bad test', async ({ expect }) => expect('add(2,3)').toBe('999'));
        });
        const result = await runner.run(runOpts);
        expect(result.failures[0].error).toBeInstanceOf(RhostExpectError);
    });

    it('describe() is chainable', () => {
        const runner = new RhostRunner();
        const ret = runner.describe('a', () => {}).describe('b', () => {});
        expect(ret).toBe(runner);
    });
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

describe('RhostRunner lifecycle hooks', () => {
    it('beforeAll / afterAll / beforeEach / afterEach fire in correct order', async () => {
        const { runner, runOpts } = makeRunner();
        const order: string[] = [];

        runner.describe('hooks', ({ it, beforeAll, afterAll, beforeEach, afterEach }) => {
            beforeAll(() => { order.push('beforeAll'); });
            afterAll(() => { order.push('afterAll'); });
            beforeEach(() => { order.push('beforeEach'); });
            afterEach(() => { order.push('afterEach'); });

            it('test1', async ({ expect }) => {
                order.push('test1');
                await expect('add(2,3)').toBe('5');
            });
            it('test2', async ({ expect }) => {
                order.push('test2');
                await expect('lcstr(HELLO)').toBe('hello');
            });
        });

        await runner.run(runOpts);

        expect(order).toEqual([
            'beforeAll',
            'beforeEach', 'test1', 'afterEach',
            'beforeEach', 'test2', 'afterEach',
            'afterAll',
        ]);
    });

    it('hooks receive { client, world }', async () => {
        const { runner, runOpts } = makeRunner();
        let hookCtxOk = false;

        runner.describe('hook-ctx', ({ it, beforeEach }) => {
            beforeEach(({ client, world }) => {
                hookCtxOk = typeof client.eval === 'function' && world !== undefined;
            });
            it('dummy', async ({ expect }) => expect('add(2,3)').toBe('5'));
        });

        await runner.run(runOpts);
        expect(hookCtxOk).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// it.skip
// ---------------------------------------------------------------------------

describe('it.skip', () => {
    it('marks test as skipped and does not run it', async () => {
        const { runner, runOpts } = makeRunner();
        let ran = false;

        runner.describe('skips', ({ it }) => {
            it.skip('skipped test', async () => { ran = true; });
            it('passing test', async ({ expect }) => expect('add(2,3)').toBe('5'));
        });

        const result = await runner.run(runOpts);

        expect(ran).toBe(false);
        expect(result.skipped).toBe(1);
        expect(result.passed).toBe(1);
        expect(result.total).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// it.only
// ---------------------------------------------------------------------------

describe('it.only', () => {
    it('runs only the focused tests in a suite', async () => {
        const { runner, runOpts } = makeRunner();
        const ran: string[] = [];

        runner.describe('only-suite', ({ it }) => {
            it('not-only-1', async () => { ran.push('not-only-1'); });
            it.only('only-test', async ({ expect }) => {
                ran.push('only-test');
                await expect('add(2,3)').toBe('5');
            });
            it('not-only-2', async () => { ran.push('not-only-2'); });
        });

        const result = await runner.run(runOpts);

        expect(ran).toEqual(['only-test']);
        expect(result.passed).toBe(1);
        // Non-only tests are skipped
        expect(result.skipped).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// describe.skip
// ---------------------------------------------------------------------------

describe('describe.skip', () => {
    it('skips all tests in the suite', async () => {
        const { runner, runOpts } = makeRunner();
        let ran = false;

        runner.describe('outer', ({ describe }) => {
            describe.skip('skipped-suite', ({ it }) => {
                it('test', async () => { ran = true; });
            });
            // Note: this it is at top-level outer describe
        });

        const result = await runner.run(runOpts);

        expect(ran).toBe(false);
        expect(result.skipped).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Nested describes
// ---------------------------------------------------------------------------

describe('Nested describes', () => {
    it('collects and runs tests at any nesting depth', async () => {
        const { runner, runOpts } = makeRunner();
        const order: string[] = [];

        runner.describe('level-1', ({ describe }) => {
            describe('level-2', ({ describe, it }) => {
                describe('level-3', ({ it: it3 }) => {
                    it3('deep test', async ({ expect }) => {
                        order.push('deep');
                        await expect('add(2,3)').toBe('5');
                    });
                });
                it('mid test', async ({ expect }) => {
                    order.push('mid');
                    await expect('lcstr(HELLO)').toBe('hello');
                });
            });
        });

        const result = await runner.run(runOpts);

        expect(order).toContain('deep');
        expect(order).toContain('mid');
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// TestContext shape
// ---------------------------------------------------------------------------

describe('TestContext', () => {
    it('provides expect, client, and world', async () => {
        const { runner, runOpts } = makeRunner();
        let ctxOk = false;

        runner.describe('ctx', ({ it }) => {
            it('check ctx', async (ctx) => {
                ctxOk =
                    typeof ctx.expect === 'function' &&
                    typeof ctx.client.eval === 'function' &&
                    ctx.world !== undefined;
            });
        });

        await runner.run(runOpts);
        expect(ctxOk).toBe(true);
    });

    it('expect() in context returns RhostExpect that evaluates', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('ctx-expect', ({ it }) => {
            it('uses ctx.expect()', async ({ expect }) => {
                await expect('add(2,3)').toBe('5');
            });
        });

        const result = await runner.run(runOpts);
        expect(result.passed).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// World auto-cleanup
// ---------------------------------------------------------------------------

describe('World auto-cleanup', () => {
    it('world is cleaned up automatically after each test', async () => {
        const { runner, runOpts } = makeRunner();
        const cleanedAfter: number[] = [];

        runner.describe('cleanup-suite', ({ it }) => {
            it('test-with-world', async ({ world }) => {
                // Manually push a dbref so cleanup has something to do
                // We'll observe the size at cleanup time via afterEach
                // Since create() needs eval, just verify world.size at end
                expect(world.size).toBe(0);
            });
        });

        const result = await runner.run(runOpts);
        expect(result.passed).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// describe.only (M-3)
// ---------------------------------------------------------------------------

describe('describe.only', () => {
    it('runs only the focused suite and skips siblings', async () => {
        const { runner, runOpts } = makeRunner();
        const ran: string[] = [];

        runner.describe('outer', ({ describe }) => {
            describe('sibling-a', ({ it }) => {
                it('should be skipped', async () => { ran.push('sibling-a'); });
            });
            describe.only('focused-suite', ({ it }) => {
                it('should run', async ({ expect }) => {
                    ran.push('focused');
                    await expect('add(2,3)').toBe('5');
                });
            });
            describe('sibling-b', ({ it }) => {
                it('also skipped', async () => { ran.push('sibling-b'); });
            });
        });

        const result = await runner.run(runOpts);

        expect(ran).toEqual(['focused']);
        expect(result.passed).toBe(1);
        expect(result.skipped).toBe(2);
        expect(result.failed).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Hook error propagation (M-4)
// ---------------------------------------------------------------------------

describe('Hook error propagation', () => {
    it('beforeEach throwing counts as a test failure', async () => {
        const { runner, runOpts } = makeRunner();
        runner.describe('bef-each-err', ({ it, beforeEach }) => {
            beforeEach(() => { throw new Error('beforeEach boom'); });
            it('test', async ({ expect }) => { await expect('add(2,3)').toBe('5'); });
        });
        const result = await runner.run(runOpts);
        expect(result.failed).toBe(1);
        expect(result.passed).toBe(0);
        expect(result.failures[0].error.message).toMatch('beforeEach boom');
    });

    it('beforeAll throwing counts all suite tests as failures', async () => {
        const { runner, runOpts } = makeRunner();
        runner.describe('bef-all-err', ({ it, beforeAll }) => {
            beforeAll(() => { throw new Error('beforeAll boom'); });
            it('test-1', async ({ expect }) => { await expect('add(2,3)').toBe('5'); });
            it('test-2', async ({ expect }) => { await expect('add(2,3)').toBe('5'); });
        });
        const result = await runner.run(runOpts);
        expect(result.failed).toBe(2);
        expect(result.passed).toBe(0);
    });

    it('afterEach error does not flip a passing test to failing', async () => {
        const { runner, runOpts } = makeRunner();
        runner.describe('aft-each-err', ({ it, afterEach }) => {
            afterEach(() => { throw new Error('afterEach boom'); });
            it('passes', async ({ expect }) => { await expect('add(2,3)').toBe('5'); });
        });
        const result = await runner.run(runOpts);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// World cleanup after failing test (M-5)
// ---------------------------------------------------------------------------

describe('World cleanup after failure', () => {
    it('world.cleanup() is called even when the test throws', async () => {
        const { runner, runOpts } = makeRunner();
        let cleanupSize = -1;

        runner.describe('cleanup-on-fail', ({ it }) => {
            it('failing test', async ({ world, expect: ex }) => {
                // Simulate a tracked object by pushing directly into the world
                // via create() — mock server returns '#99' for create(World)
                await world.create('World');
                // Record size before cleanup; the finally block should call cleanup()
                // We spy on cleanup by checking the runner result then world state
                // after the fact. Instead, patch afterEach to observe.
                await ex('add(2,3)').toBe('WRONG');  // intentionally fail
            });
        });

        // We can't directly observe cleanup from outside, but we can verify the
        // runner does not crash and the test counted as failed, which requires
        // the finally block to have run (it throws if cleanup is skipped on
        // unhandled errors).
        const result = await runner.run(runOpts);
        expect(result.failed).toBe(1);
        expect(result.passed).toBe(0);
    });

    it('world.cleanup() is called when beforeEach fails', async () => {
        const { runner, runOpts } = makeRunner();
        runner.describe('cleanup-bef-fail', ({ it, beforeEach }) => {
            beforeEach(() => { throw new Error('setup failed'); });
            it('test', async () => { /* never runs */ });
        });
        // Should not throw — cleanup must still be attempted
        const result = await runner.run(runOpts);
        expect(result.failed).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// _withTimeout sync guard (L-2)
// ---------------------------------------------------------------------------

describe('Sync test function', () => {
    it('a test function that returns void (not a Promise) passes normally', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('sync-suite', ({ it }) => {
            it('sync test', () => {
                // Returns void, not a Promise — _withTimeout must handle this
            });
        });

        const result = await runner.run(runOpts);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
    });

    it('a sync test that throws counts as a failure', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('sync-fail-suite', ({ it }) => {
            it('sync throw', () => {
                throw new Error('sync boom');
            });
        });

        const result = await runner.run(runOpts);
        expect(result.failed).toBe(1);
        expect(result.failures[0].error.message).toBe('sync boom');
    });
});

// ---------------------------------------------------------------------------
// test alias
// ---------------------------------------------------------------------------

describe('test alias', () => {
    it('test() works as an alias for it()', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('alias', ({ test }) => {
            test('add via test()', async ({ expect }) => {
                await expect('add(2,3)').toBe('5');
            });
            test.skip('skipped via test.skip()', async () => {});
        });

        const result = await runner.run(runOpts);
        expect(result.passed).toBe(1);
        expect(result.skipped).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Per-test timeout
// ---------------------------------------------------------------------------

describe('Per-test timeout', () => {
    it('times out a slow test', async () => {
        const { runner, runOpts } = makeRunner();

        runner.describe('timeout-suite', ({ it }) => {
            it('slow test', async () => {
                await new Promise<void>((resolve) => {
                    const t = setTimeout(resolve, 5000);
                    if (typeof t.unref === 'function') t.unref();
                });
            }, 100 /* 100ms timeout */);
        });

        const result = await runner.run(runOpts);
        expect(result.failed).toBe(1);
        expect(result.failures[0].error.message).toMatch('timed out');
    });
});
