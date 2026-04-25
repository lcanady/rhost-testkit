import { parseDocument, parseDocumentFile, loadGlob as loadGlobFn } from './document';
import { OfflineExpect } from './expect';
import type {
  OfflineDocument,
  OfflineSuiteContext,
  OfflineTestContext,
  OfflineTestFn,
  OfflineHookFn,
  OfflineItFn,
  OfflineDescribeFn,
  OfflineRunOptions,
  OfflineRunResult,
} from './types';

// ---------------------------------------------------------------------------
// Internal tree nodes
// ---------------------------------------------------------------------------

type NodeMode = 'normal' | 'skip' | 'only';

interface TestNode {
  kind: 'test';
  name: string;
  fn: OfflineTestFn;
  mode: NodeMode;
}

interface SuiteNode {
  kind: 'suite';
  name: string;
  children: Array<TestNode | SuiteNode>;
  beforeAll: OfflineHookFn[];
  afterAll: OfflineHookFn[];
  beforeEach: OfflineHookFn[];
  afterEach: OfflineHookFn[];
  mode: NodeMode;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function makeTestContext(): OfflineTestContext {
  return {
    parse: (source, filename?) => parseDocument(source, filename),
    expect: (doc) => new OfflineExpect(doc),
    loadFile: (filePath) => parseDocumentFile(filePath),
    loadGlob: (pattern, cwd?) => loadGlobFn(pattern, cwd),
  };
}

function makeSuiteContext(suite: SuiteNode): OfflineSuiteContext {
  function makeIt(mode: NodeMode): OfflineItFn {
    return (name, fn) => suite.children.push({ kind: 'test', name, fn, mode });
  }

  function makeDescribe(mode: NodeMode): OfflineDescribeFn {
    return (name, fn) => {
      const child: SuiteNode = { kind: 'suite', name, children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], mode };
      suite.children.push(child);
      fn(makeSuiteContext(child));
    };
  }

  const it = makeIt('normal') as OfflineSuiteContext['it'];
  it.skip = makeIt('skip');
  it.only = makeIt('only');

  const test = makeIt('normal') as OfflineSuiteContext['test'];
  test.skip = makeIt('skip');
  test.only = makeIt('only');

  const describe = makeDescribe('normal') as OfflineSuiteContext['describe'];
  describe.skip = makeDescribe('skip');
  describe.only = makeDescribe('only');

  return {
    it,
    test,
    describe,
    beforeAll: fn => suite.beforeAll.push(fn),
    afterAll: fn => suite.afterAll.push(fn),
    beforeEach: fn => suite.beforeEach.push(fn),
    afterEach: fn => suite.afterEach.push(fn),
  };
}

// ---------------------------------------------------------------------------
// OfflineRunner
// ---------------------------------------------------------------------------

export class OfflineRunner {
  private readonly root: SuiteNode = {
    kind: 'suite', name: '<root>', children: [],
    beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], mode: 'normal',
  };

  describe(name: string, fn: (ctx: OfflineSuiteContext) => void): this {
    const suite: SuiteNode = { kind: 'suite', name, children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [], mode: 'normal' };
    this.root.children.push(suite);
    fn(makeSuiteContext(suite));
    return this;
  }

  run(options: OfflineRunOptions = {}): OfflineRunResult {
    const useJest = options.useJest ?? (typeof describe !== 'undefined' && typeof it !== 'undefined');

    if (useJest) {
      return this._runJest(this.root, options);
    }
    return this._runStandalone(this.root, options);
  }

  // -------------------------------------------------------------------------
  // Jest delegation
  // -------------------------------------------------------------------------

  private _runJest(root: SuiteNode, _opts: OfflineRunOptions): OfflineRunResult {
    // When Jest globals are present we register describe/it blocks and let
    // Jest drive execution. Return a placeholder result — Jest owns reporting.
    for (const child of root.children) {
      this._registerJestNode(child);
    }
    return { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0, failures: [] };
  }

  private _registerJestNode(node: TestNode | SuiteNode): void {
    if (node.kind === 'test') {
      const jestIt = node.mode === 'skip' ? it.skip : node.mode === 'only' ? it.only : it;
      jestIt(node.name, async () => {
        await node.fn(makeTestContext());
      });
    } else {
      const jestDescribe = node.mode === 'skip' ? describe.skip : node.mode === 'only' ? describe.only : describe;
      jestDescribe(node.name, () => {
        if (node.beforeAll.length) beforeAll(async () => { for (const h of node.beforeAll) await h(); });
        if (node.afterAll.length) afterAll(async () => { for (const h of node.afterAll) await h(); });
        if (node.beforeEach.length) beforeEach(async () => { for (const h of node.beforeEach) await h(); });
        if (node.afterEach.length) afterEach(async () => { for (const h of node.afterEach) await h(); });
        for (const child of node.children) this._registerJestNode(child);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Standalone executor
  // -------------------------------------------------------------------------

  private _runStandalone(root: SuiteNode, opts: OfflineRunOptions): OfflineRunResult {
    const result: OfflineRunResult = { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0, failures: [] };
    const start = Date.now();
    this._execSuite(root, [], result, opts);
    result.duration = Date.now() - start;
    return result;
  }

  private async _execSuite(
    suite: SuiteNode,
    ancestors: string[],
    result: OfflineRunResult,
    opts: OfflineRunOptions,
  ): Promise<void> {
    if (suite.mode === 'skip') {
      const count = this._countTests(suite);
      result.skipped += count;
      result.total += count;
      return;
    }
    const path = suite.name === '<root>' ? ancestors : [...ancestors, suite.name];

    for (const h of suite.beforeAll) await h();

    for (const child of suite.children) {
      if (child.kind === 'suite') {
        await this._execSuite(child, path, result, opts);
      } else {
        await this._execTest(child, path, suite, result, opts);
      }
    }

    for (const h of suite.afterAll) await h();
  }

  private async _execTest(
    node: TestNode,
    suitePath: string[],
    suite: SuiteNode,
    result: OfflineRunResult,
    opts: OfflineRunOptions,
  ): Promise<void> {
    result.total++;

    if (node.mode === 'skip') {
      result.skipped++;
      if (opts.verbose) console.log(`  SKIP  ${[...suitePath, node.name].join(' > ')}`);
      return;
    }

    for (const h of suite.beforeEach) await h();

    try {
      await node.fn(makeTestContext());
      result.passed++;
      if (opts.verbose) console.log(`  PASS  ${[...suitePath, node.name].join(' > ')}`);
    } catch (err) {
      result.failed++;
      const error = err instanceof Error ? err : new Error(String(err));
      result.failures.push({ suite: suitePath.join(' > '), test: node.name, error });
      if (opts.verbose) console.error(`  FAIL  ${[...suitePath, node.name].join(' > ')}\n        ${error.message}`);
    }

    for (const h of suite.afterEach) await h();
  }

  private _countTests(suite: SuiteNode): number {
    let n = 0;
    for (const child of suite.children) {
      n += child.kind === 'test' ? 1 : this._countTests(child);
    }
    return n;
  }
}
