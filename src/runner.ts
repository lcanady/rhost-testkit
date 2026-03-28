import * as path from 'path';
import { RhostClient, RhostClientOptions, PreviewOptions } from './client';
import { RhostAssert } from './assertions';
import { RhostExpect, SnapshotContext } from './expect';
import { RhostWorld } from './world';
import { Reporter } from './reporter';
import { SnapshotManager, SnapshotStats } from './snapshots';

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
    snapshots: SnapshotStats;
}

export interface TestContext {
    expect(expression: string): RhostExpect;
    client: RhostClient;
    world: RhostWorld;
    /**
     * Evaluate a softcode expression (default) or run a raw MUSH command and
     * print the raw server output to stdout exactly as a player would see it —
     * ANSI colours, formatting, all of it.
     *
     * Returns the raw string so you can still assert on it if needed.
     *
     * @example Softcode result with colour
     *   await preview('ansi(rh,CRITICAL HIT!)');
     *
     * @example Room description as a player sees it
     *   await preview('look here', { mode: 'command' });
     *
     * @example Score screen
     *   await preview('score', { mode: 'command' });
     */
    preview(input: string, options?: PreviewOptions): Promise<string>;
}

export type TestFn = (ctx: TestContext) => Promise<void> | void;
export type HookFn = (ctx: { client: RhostClient; world: RhostWorld }) => Promise<void> | void;
export type PersonaTestFn = (ctx: TestContext & { persona: string }) => Promise<void> | void;

export type ItFn = (name: string, fn: TestFn, timeout?: number) => void;
export type DescribeFn = (name: string, fn: (ctx: SuiteContext) => void) => void;
export type PersonasFn = (names: string[], testName: string, fn: PersonaTestFn, timeout?: number) => void;

export interface SuiteContext {
    it: ItFn & { skip: ItFn; only: ItFn };
    test: ItFn & { skip: ItFn; only: ItFn };
    describe: DescribeFn & { skip: DescribeFn; only: DescribeFn };
    beforeAll(fn: HookFn): void;
    afterAll(fn: HookFn): void;
    beforeEach(fn: HookFn): void;
    afterEach(fn: HookFn): void;
    /**
     * Register one test per persona. Each test connects to the MUSH server
     * using the credentials defined under `runner.run({ personas: {...} })`.
     *
     * @example
     *   personas(
     *     ['mortal', 'builder', 'wizard'],
     *     'hidden room visibility',
     *     async ({ expect, persona }) => {
     *       if (persona === 'mortal') {
     *         await expect('can_see_hidden()').toBe('0');
     *       } else {
     *         await expect('can_see_hidden()').toBe('1');
     *       }
     *     },
     *   );
     */
    personas: PersonasFn;
}

export interface PersonaCredentials {
    username: string;
    password: string;
}

export interface RunnerOptions extends RhostClientOptions {
    /** Character name. Required. */
    username: string;
    /** Character password. Required. */
    password: string;
    /** Print results to stdout while running. Default: true */
    verbose?: boolean;
    /**
     * Credentials for named personas used by `personas()` tests.
     *
     * @example
     *   runner.run({
     *     username: 'Wizard',
     *     password: 'Nyctasia',
     *     personas: {
     *       mortal:  { username: 'TestMortal',  password: 'mortalpass' },
     *       builder: { username: 'TestBuilder', password: 'builderpass' },
     *     },
     *   });
     */
    personas?: Record<string, PersonaCredentials>;
    /**
     * Absolute or relative path to the snapshot file.
     * Default: `__snapshots__/<calling-file>.snap` next to the test file,
     * or `__snapshots__/testkit.snap` in cwd if the caller cannot be determined.
     */
    snapshotFile?: string;
    /**
     * Overwrite stored snapshots with current values instead of comparing.
     * Also activated by the `RHOST_UPDATE_SNAPSHOTS=1` environment variable.
     * Default: false
     */
    updateSnapshots?: boolean;
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
 * per-test timeouts, lifecycle hooks, automatic world cleanup, and snapshot
 * testing via `expect().toMatchSnapshot()`.
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
    /** Set at the start of run() so persona test closures can access credentials. */
    private _options: RunnerOptions | undefined;

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
        this._options = options;
        const verbose = options.verbose !== false;
        const updateMode =
            options.updateSnapshots === true ||
            process.env['RHOST_UPDATE_SNAPSHOTS'] === '1';

        const snapshotFile = this.resolveSnapshotFile(options);
        const snapshots = new SnapshotManager(snapshotFile, updateMode);

        const client = new RhostClient(options);
        await client.connect();
        await client.login(options.username, options.password);

        const reporter = new Reporter(verbose);
        const result: RunResult = {
            passed: 0, failed: 0, skipped: 0, total: 0, duration: 0,
            failures: [],
            snapshots: { matched: 0, written: 0, updated: 0, obsolete: 0 },
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

        await this._runSuite(root, client, reporter, result, [], 0, [], snapshots);

        result.duration = Date.now() - start;

        snapshots.save();
        result.snapshots = snapshots.stats();

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

        const personasFn: PersonasFn = (names, testName, personaFn, timeout?) => {
            for (const personaName of names) {
                const wrappedFn: TestFn = async (ctx) => {
                    const opts = this._options;
                    const creds = opts?.personas?.[personaName];
                    if (!creds) {
                        throw new Error(
                            `personas(): persona '${personaName}' not defined — ` +
                            `add it to runner.run({ personas: { ${personaName}: { username, password } } })`
                        );
                    }
                    const personaClient = new RhostClient({ ...opts, ...creds });
                    await personaClient.connect();
                    await personaClient.login(creds.username, creds.password);
                    const personaWorld = new RhostWorld(personaClient);
                    try {
                        await personaFn({ ...ctx, client: personaClient, world: personaWorld, persona: personaName });
                    } finally {
                        try { await personaWorld.cleanup(); } catch { /* ignore */ }
                        await personaClient.disconnect();
                    }
                };
                node.children.push({
                    kind: 'test',
                    name: `${testName} [${personaName}]`,
                    fn: wrappedFn,
                    mode: 'normal',
                    timeout,
                });
            }
        };

        fn({
            it: itFn,
            test: itFn,
            describe: describeFn,
            beforeAll: (h) => node.beforeAll.push(h),
            afterAll:  (h) => node.afterAll.push(h),
            beforeEach: (h) => node.beforeEach.push(h),
            afterEach:  (h) => node.afterEach.push(h),
            personas: personasFn,
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
        suitePath: string[],
        snapshots: SnapshotManager,
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

        // Build the path for this suite's children
        const childPath = suite.name ? [...suitePath, suite.name] : suitePath;

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
                await this._runSuite(
                    childWithMode, client, reporter, result, combinedBeforeEach,
                    depth + (suite.name ? 1 : 0),
                    childPath,
                    snapshots,
                );
            } else {
                const skip = !activeChildren.includes(child) || child.mode === 'skip';
                await this._runTest(
                    child, skip, client, reporter, result,
                    combinedBeforeEach, suite.afterEach,
                    childPath,
                    depth + (suite.name ? 1 : 0),
                    snapshots,
                );
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
        suitePath: string[],
        depth: number,
        snapshots: SnapshotManager,
    ): Promise<void> {
        result.total++;

        if (skip || test.mode === 'skip') {
            result.skipped++;
            reporter.testSkip(test.name, depth);
            return;
        }

        // Full path used as the snapshot key prefix and for failure reporting
        const testKey = [...suitePath, test.name].join(' > ');
        const suiteName = suitePath[suitePath.length - 1] ?? '';

        // Reset snapshot counter for this test
        snapshots.resetCounter(testKey);

        const world = new RhostWorld(client);
        const hookCtx = { client, world };

        const snapshotCtx: SnapshotContext = {
            manager: snapshots,
            testName: testKey,
        };

        const testCtx: TestContext = {
            client,
            world,
            expect: (expr: string) => new RhostExpect(client, expr, false, snapshotCtx),
            preview: (input: string, opts?: PreviewOptions) => client.preview(input, opts),
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

    // -------------------------------------------------------------------------
    // Snapshot file resolution
    // -------------------------------------------------------------------------

    private resolveSnapshotFile(options: RunnerOptions): string {
        if (options.snapshotFile) return path.resolve(options.snapshotFile);

        const callerFile = this.getCallerFile();
        if (callerFile) {
            const dir = path.dirname(callerFile);
            const base = path.basename(callerFile);
            return path.join(dir, '__snapshots__', `${base}.snap`);
        }

        return path.join(process.cwd(), '__snapshots__', 'testkit.snap');
    }

    /**
     * Walk the Error.stack to find the first file that is not the runner
     * itself and not inside node_modules. Used to auto-derive the snapshot
     * file path from the test file's location.
     */
    private getCallerFile(): string | null {
        const lines = (new Error().stack ?? '').split('\n').slice(1);
        for (const line of lines) {
            const match =
                line.match(/\((.+?):\d+:\d+\)/) ??
                line.match(/at (.+?):\d+:\d+\s*$/);
            if (!match) continue;
            const file = match[1];
            if (!file) continue;
            if (
                file.includes('node_modules') ||
                file.startsWith('internal/') ||
                file.startsWith('node:') ||
                /[\\/]runner\.[jt]s$/.test(file)
            ) continue;
            return file;
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// Backward-compat re-export so old code using RhostAssert still compiles
// ---------------------------------------------------------------------------
export { RhostAssert };
