import { RhostClient, RhostClientOptions } from './client';
import { RhostAssert } from './assertions';
import { RhostExpect } from './expect';
import { RhostWorld } from './world';
import { Reporter } from './reporter';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunResult {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
    failures: Array<{ suite: string; test: string; error: Error }>;
}

export interface TestContext {
    expect(expression: string): RhostExpect;
    client: RhostClient;
    world: RhostWorld;
}

export type TestFn = (ctx: TestContext) => Promise<void> | void;
export type HookFn = (ctx: { client: RhostClient; world: RhostWorld }) => Promise<void> | void;

export type ItFn = (name: string, fn: TestFn, timeout?: number) => void;
export type DescribeFn = (name: string, fn: (ctx: SuiteContext) => void) => void;

export interface SuiteContext {
    it: ItFn & { skip: ItFn; only: ItFn };
    test: ItFn & { skip: ItFn; only: ItFn };
    describe: DescribeFn & { skip: DescribeFn; only: DescribeFn };
    beforeAll(fn: HookFn): void;
    afterAll(fn: HookFn): void;
    beforeEach(fn: HookFn): void;
    afterEach(fn: HookFn): void;
}

export interface RunnerOptions extends RhostClientOptions {
    /** Character name. Required. */
    username: string;
    /** Character password. Required. */
    password: string;
    /** Print results to stdout while running. Default: true */
    verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Internal tree nodes
// ---------------------------------------------------------------------------

type NodeMode = 'normal' | 'skip' | 'only';

interface TestNode {
    kind: 'test';
    name: string;
    fn: TestFn;
    mode: NodeMode;
    timeout?: number;
}

interface SuiteNode {
    kind: 'suite';
    name: string;
    mode: NodeMode;
    children: Array<TestNode | SuiteNode>;
    beforeAll: HookFn[];
    afterAll: HookFn[];
    beforeEach: HookFn[];
    afterEach: HookFn[];
}

// ---------------------------------------------------------------------------
// RhostRunner
// ---------------------------------------------------------------------------

/**
 * Jest-style test runner for RhostMUSH softcode.
 *
 * Supports nested describes, it.skip/it.only, describe.skip/describe.only,
 * per-test timeouts, lifecycle hooks, and automatic world cleanup.
 *
 * @example
 *   const runner = new RhostRunner();
 *
 *   runner.describe('Math', ({ it }) => {
 *     it('add(2,3)', async ({ expect }) => {
 *       await expect('add(2,3)').toBe('5');
 *     });
 *   });
 *
 *   const result = await runner.run({ username: 'Wizard', password: 'Nyctasia' });
 *   process.exit(result.failed > 0 ? 1 : 0);
 */
export class RhostRunner {
    private topLevel: Array<SuiteNode | TestNode> = [];

    // -------------------------------------------------------------------------
    // Collection-phase API
    // -------------------------------------------------------------------------

    describe(name: string, fn: (ctx: SuiteContext) => void): this {
        this.topLevel.push(this._buildSuite(name, fn, 'normal'));
        return this;
    }

    // -------------------------------------------------------------------------
    // Execution phase
    // -------------------------------------------------------------------------

    async run(options: RunnerOptions): Promise<RunResult> {
        const verbose = options.verbose !== false;
        const client = new RhostClient(options);
        await client.connect();
        await client.login(options.username, options.password);

        const reporter = new Reporter(verbose);
        const result: RunResult = {
            passed: 0, failed: 0, skipped: 0, total: 0, duration: 0, failures: [],
        };
        const start = Date.now();

        // Wrap top-level nodes in a root suite for uniform execution
        const root: SuiteNode = {
            kind: 'suite',
            name: '',
            mode: 'normal',
            children: this.topLevel,
            beforeAll: [], afterAll: [], beforeEach: [], afterEach: [],
        };

        await this._runSuite(root, client, reporter, result, [], 0);

        result.duration = Date.now() - start;
        reporter.summary(result);

        await client.disconnect();
        return result;
    }

    // -------------------------------------------------------------------------
    // Internal: building the tree
    // -------------------------------------------------------------------------

    private _buildSuite(name: string, fn: (ctx: SuiteContext) => void, mode: NodeMode): SuiteNode {
        const node: SuiteNode = {
            kind: 'suite', name, mode,
            children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [],
        };

        const makeItFn = (itMode: NodeMode): ItFn => (testName, testFn, timeout?) => {
            node.children.push({ kind: 'test', name: testName, fn: testFn, mode: itMode, timeout });
        };

        const makeDescribeFn = (descMode: NodeMode): DescribeFn => (descName, descFn) => {
            node.children.push(this._buildSuite(descName, descFn, descMode));
        };

        const itFn = makeItFn('normal') as ItFn & { skip: ItFn; only: ItFn };
        itFn.skip = makeItFn('skip');
        itFn.only = makeItFn('only');

        const describeFn = makeDescribeFn('normal') as DescribeFn & { skip: DescribeFn; only: DescribeFn };
        describeFn.skip = makeDescribeFn('skip');
        describeFn.only = makeDescribeFn('only');

        fn({
            it: itFn,
            test: itFn,
            describe: describeFn,
            beforeAll: (h) => node.beforeAll.push(h),
            afterAll:  (h) => node.afterAll.push(h),
            beforeEach: (h) => node.beforeEach.push(h),
            afterEach:  (h) => node.afterEach.push(h),
        });

        return node;
    }

    // -------------------------------------------------------------------------
    // Internal: executing the tree
    // -------------------------------------------------------------------------

    private async _runSuite(
        suite: SuiteNode,
        client: RhostClient,
        reporter: Reporter,
        result: RunResult,
        inheritedBeforeEach: HookFn[],
        depth: number,
    ): Promise<void> {
        // Skip entire suite if marked skip
        if (suite.mode === 'skip') {
            this._countSkipped(suite, result, reporter, depth);
            return;
        }

        if (suite.name) reporter.suiteStart(suite.name, depth);

        // Resolve which children are active given `only` semantics
        const activeChildren = this._resolveOnly(suite.children);

        // Build the cumulative beforeEach/afterEach stack (inherited + suite-level)
        const combinedBeforeEach = [...inheritedBeforeEach, ...suite.beforeEach];

        // Run suite-level beforeAll hooks — if one throws, count all suite tests as failures
        const hookCtx = { client, world: new RhostWorld(client) };
        for (const hook of suite.beforeAll) {
            try {
                await hook(hookCtx);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                this._countFailedFromBeforeAll(suite, result, reporter, depth, error);
                return;
            }
        }

        for (const child of suite.children) {
            if (child.kind === 'suite') {
                const effectiveMode = activeChildren.includes(child) ? child.mode : 'skip';
                const childWithMode: SuiteNode = effectiveMode !== child.mode
                    ? { ...child, mode: effectiveMode }
                    : child;
                await this._runSuite(childWithMode, client, reporter, result, combinedBeforeEach, depth + (suite.name ? 1 : 0));
            } else {
                const skip = !activeChildren.includes(child) || child.mode === 'skip';
                await this._runTest(child, skip, client, reporter, result, combinedBeforeEach, suite.afterEach, suite.name, depth + (suite.name ? 1 : 0));
            }
        }

        // Run suite-level afterAll hooks
        for (const hook of suite.afterAll) {
            await hook(hookCtx);
        }
    }

    private async _runTest(
        test: TestNode,
        skip: boolean,
        client: RhostClient,
        reporter: Reporter,
        result: RunResult,
        beforeEachHooks: HookFn[],
        afterEachHooks: HookFn[],
        suiteName: string,
        depth: number,
    ): Promise<void> {
        result.total++;

        if (skip || test.mode === 'skip') {
            result.skipped++;
            reporter.testSkip(test.name, depth);
            return;
        }

        const world = new RhostWorld(client);
        const hookCtx = { client, world };
        const testCtx: TestContext = {
            client,
            world,
            expect: (expr: string) => new RhostExpect(client, expr),
        };

        // Run inherited + suite beforeEach — if one throws, count as a test failure
        for (const hook of beforeEachHooks) {
            try {
                await hook(hookCtx);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                result.failed++;
                result.failures.push({ suite: suiteName, test: test.name, error });
                reporter.testFail(test.name, 0, depth, error);
                try { await world.cleanup(); } catch { /* ignore */ }
                return;
            }
        }

        const t0 = Date.now();
        try {
            const timeoutMs = test.timeout ?? 15000;
            await this._withTimeout(test.fn(testCtx), timeoutMs, test.name);
            const ms = Date.now() - t0;
            result.passed++;
            reporter.testPass(test.name, ms, depth);
        } catch (err) {
            const ms = Date.now() - t0;
            result.failed++;
            const error = err instanceof Error ? err : new Error(String(err));
            result.failures.push({ suite: suiteName, test: test.name, error });
            reporter.testFail(test.name, ms, depth, error);
        } finally {
            // Auto-cleanup world (ignore errors)
            try { await world.cleanup(); } catch { /* ignore */ }
        }

        // Run suite afterEach
        for (const hook of afterEachHooks) {
            try { await hook(hookCtx); } catch { /* ignore */ }
        }
    }

    /**
     * Apply `only` semantics: if ANY direct child has mode 'only', only run
     * those. Otherwise run all non-skip children.
     */
    private _resolveOnly(children: Array<TestNode | SuiteNode>): Array<TestNode | SuiteNode> {
        const hasOnly = children.some((c) => c.mode === 'only');
        if (hasOnly) {
            return children.filter((c) => c.mode === 'only');
        }
        return children.filter((c) => c.mode !== 'skip');
    }

    private _countFailedFromBeforeAll(
        suite: SuiteNode,
        result: RunResult,
        reporter: Reporter,
        depth: number,
        error: Error,
    ): void {
        for (const child of suite.children) {
            if (child.kind === 'suite') {
                this._countFailedFromBeforeAll(child, result, reporter, depth + 1, error);
            } else {
                result.total++;
                result.failed++;
                result.failures.push({ suite: suite.name, test: child.name, error });
                reporter.testFail(child.name, 0, depth + 1, error);
            }
        }
    }

    private _countSkipped(
        suite: SuiteNode,
        result: RunResult,
        reporter: Reporter,
        depth: number,
    ): void {
        if (suite.name) reporter.suiteStart(suite.name, depth);
        for (const child of suite.children) {
            if (child.kind === 'suite') {
                this._countSkipped(child, result, reporter, depth + 1);
            } else {
                result.total++;
                result.skipped++;
                reporter.testSkip(child.name, depth + 1);
            }
        }
    }

    private _withTimeout(p: Promise<void> | void, ms: number, name: string): Promise<void> {
        if (!(p instanceof Promise)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`Test "${name}" timed out after ${ms}ms`)),
                ms,
            );
            // Unref so Node won't keep the process alive if the test hangs
            if (typeof timer.unref === 'function') timer.unref();
            p.then(
                () => { clearTimeout(timer); resolve(); },
                (err) => { clearTimeout(timer); reject(err); },
            );
        });
    }
}

// ---------------------------------------------------------------------------
// Backward-compat re-export so old code using RhostAssert still compiles
// ---------------------------------------------------------------------------
export { RhostAssert };
