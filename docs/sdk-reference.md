# SDK Reference

Complete API documentation for `rhostmush-sdk`.

---

## Table of contents

- [RhostRunner](#rhostrunner)
- [SuiteContext](#suitecontext)
- [TestContext](#testcontext)
- [RhostExpect](#rhostexpect)
- [RhostWorld](#rhostworld)
- [RhostClient](#rhostclient)
- [RhostContainer](#rhostcontainer)
- [Types](#types)

---

## RhostRunner

The top-level test orchestrator. Collects suites during the _collection phase_, then connects to the server and runs them during the _execution phase_.

```typescript
import { RhostRunner } from 'rhostmush-sdk';

const runner = new RhostRunner();
```

### `runner.describe(name, fn)`

Registers a top-level test suite.

```typescript
runner.describe('Suite name', (ctx: SuiteContext) => {
  ctx.it('test name', async ({ expect }) => {
    await expect('add(2,3)').toBe('5');
  });
});
```

Returns `this` for chaining:

```typescript
runner
  .describe('Math', ...)
  .describe('Strings', ...);
```

### `runner.run(options)`

Connects to the server, runs all registered suites, disconnects, and returns a `RunResult`.

```typescript
const result = await runner.run({
  username: 'Wizard',
  password: 'Nyctasia',
  host: 'localhost',    // default: 'localhost'
  port: 4201,           // default: 4201
  timeout: 10000,       // default: 10000ms per operation
  bannerTimeout: 300,   // default: 300ms idle after last banner line
  verbose: true,        // default: true — print results to stdout
});
```

#### RunnerOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | — | Character name to connect as |
| `password` | `string` | — | Character password |
| `host` | `string` | `'localhost'` | Server hostname or IP |
| `port` | `number` | `4201` | Server port |
| `timeout` | `number` | `10000` | Per-operation timeout in ms |
| `bannerTimeout` | `number` | `300` | Ms of idle time before treating the welcome banner as finished |
| `stripAnsi` | `boolean` | `true` | Strip ANSI color codes from eval results |
| `verbose` | `boolean` | `true` | Print results to stdout |

#### RunResult

```typescript
interface RunResult {
  passed:   number;
  failed:   number;
  skipped:  number;
  total:    number;
  duration: number;   // ms
  failures: Array<{
    suite: string;
    test:  string;
    error: Error;
  }>;
}
```

---

## SuiteContext

Passed as the argument to every `describe` callback. Provides the full Jest-like API for registering tests and hooks.

```typescript
runner.describe('name', (ctx: SuiteContext) => {
  const { it, test, describe, beforeAll, afterAll, beforeEach, afterEach } = ctx;
});
```

### `it(name, fn, timeout?)`

Register a test.

```typescript
it('test name', async ({ expect, client, world }) => {
  await expect('add(2,3)').toBe('5');
}, 10000); // optional per-test timeout in ms (default: 15000)
```

### `it.skip(name, fn)`

Register a test that will be marked as skipped and not executed.

```typescript
it.skip('not implemented yet', async ({ expect }) => {
  // never runs
});
```

### `it.only(name, fn)`

Focus on this test. When any test in a suite is marked `.only`, all other tests in that suite are skipped automatically.

```typescript
it.only('focus here', async ({ expect }) => {
  await expect('add(2,3)').toBe('5');
});
```

### `test(name, fn, timeout?)`

Alias for `it`.

### `describe(name, fn)`

Register a nested suite. Supports arbitrary nesting depth.

```typescript
describe('outer', (ctx) => {
  ctx.describe('inner', (ctx) => {
    ctx.it('deeply nested', async ({ expect }) => {
      await expect('lcstr(HELLO)').toBe('hello');
    });
  });
});
```

### `describe.skip(name, fn)`

Skip all tests in a suite.

### `describe.only(name, fn)`

Run only this suite's tests (skips sibling suites).

### `beforeAll(fn)` / `afterAll(fn)`

Run once before/after all tests in the suite. Receives `{ client, world }`.

```typescript
let sharedObj: string;

beforeAll(async ({ world }) => {
  sharedObj = await world.create('SharedFixture');
  await world.set(sharedObj, 'READY', '1');
});

afterAll(async ({ world }) => {
  await world.cleanup();
});
```

### `beforeEach(fn)` / `afterEach(fn)`

Run before/after each test. Receives `{ client, world }` — the same `world` instance the test itself will see.

```typescript
beforeEach(async ({ world }) => {
  // This world is the same object passed to the test below
  await world.create('PerTestSetup');
});
```

---

## TestContext

Passed as the argument to every `it`/`test` callback.

```typescript
interface TestContext {
  expect(expression: string): RhostExpect;
  client: RhostClient;
  world:  RhostWorld;
}
```

| Property | Description |
|---|---|
| `expect(expr)` | Creates a `RhostExpect` wrapping the given softcode expression |
| `client` | The live `RhostClient` connection for the current run |
| `world` | A fresh `RhostWorld` per test; auto-cleaned up after the test completes |

---

## RhostExpect

The core assertion object. Created by calling `expect(expression)` inside a test.

```typescript
const ex = expect('add(2,3)');
await ex.toBe('5');
await ex.not.toBe('0');
```

The expression is evaluated lazily — the first matcher call that needs the result will send `think <expression>` to the server. The result is **cached**, so chaining multiple matchers on the same instance costs only one server round-trip.

### `.not`

Negates all matchers:

```typescript
await expect('add(2,3)').not.toBe('0');
await expect('div(1,0)').not.toBe('5');
await expect('totally_fake()').not.toBeNumber();
```

---

### String matchers

#### `.toBe(expected)`

Exact string match (result is trimmed before comparison).

```typescript
await expect('lcstr(HELLO)').toBe('hello');
await expect('add(2,3)').toBe('5');
```

#### `.toMatch(pattern)`

Match a regular expression or substring.

```typescript
await expect('digest(sha1,hello)').toMatch(/^aaf4c61d/i);
await expect('cat(foo,bar)').toMatch('foo');
```

#### `.toContain(substring)`

The result contains the given substring.

```typescript
await expect('cat(hello,world)').toContain('world');
```

#### `.toStartWith(prefix)`

```typescript
await expect('cat(hello,world)').toStartWith('hello');
```

#### `.toEndWith(suffix)`

```typescript
await expect('cat(hello,world)').toEndWith('world');
```

---

### Numeric matchers

#### `.toBeNumber()`

The result parses as a finite JavaScript number. Empty string fails.

```typescript
await expect('add(2,3)').toBeNumber();
await expect('pi()').toBeNumber();
await expect('lcstr(hello)').not.toBeNumber();
```

#### `.toBeCloseTo(expected, precision?)`

`|actual - expected| < 10^(-precision)`. Default precision is 3 (within 0.001).

```typescript
await expect('pi()').toBeCloseTo(3.14159, 4);
await expect('div(1,3)').toBeCloseTo(0.333, 2);
```

---

### MUSH type matchers

#### `.toBeTruthy()`

The result is truthy in MUSH terms: non-empty, not `"0"`, and not a `#-1`/`#-2`/`#-3` error.

```typescript
await expect('gt(5,3)').toBeTruthy();
await expect('strlen(hello)').toBeTruthy();
```

#### `.toBeFalsy()`

The result is falsy in MUSH terms: empty string, `"0"`, or a `#-1` error.

```typescript
await expect('eq(5,6)').toBeFalsy();
await expect('member(a b c,z)').toBeFalsy();
```

#### `.toBeError()`

The result starts with `#-1`, `#-2`, or `#-3`.

```typescript
await expect('div(1,0)').toBeError();
await expect('totally_nonexistent_func()').toBeError();
```

#### `.toBeDbref()`

The result is a valid object dbref: matches `/^#\d+$/`.

```typescript
await expect('num(me)').toBeDbref();
await expect('create(TestObj)').toBeDbref();
```

---

### MUSH list matchers

These operate on the space-delimited (or custom-separator) lists that MUSH functions typically return.

#### `.toContainWord(word, sep?)`

The word is present in the list. Default separator is a single space.

```typescript
await expect('sort(c a b)').toContainWord('b');
await expect('iter(1 2 3,mul(##,2))').toContainWord('4');
// Custom separator (comma-separated list)
await expect('lattr(#1)').toContainWord('MYATTR', ' ');
```

#### `.toHaveWordCount(n, sep?)`

The list contains exactly `n` words.

```typescript
await expect('words(a b c d)').toHaveWordCount(4);  // evaluates to '4', but...
// More directly useful:
await expect('sort(c a b)').toHaveWordCount(3);
```

---

### Error messages

When an assertion fails, `RhostExpectError` is thrown with a readable message:

```
expect('mul(6,7)')
  ● toBe failed
    Expected: "42"
    Received: "41"
```

For `.not` failures:

```
expect('add(2,3)')
  ● .not.toBe failed
    Expected: NOT "5"
    Received: "5"
```

---

## RhostWorld

Manages in-game object fixtures. Each test receives a fresh `RhostWorld` via `TestContext.world`. The runner automatically calls `world.cleanup()` after every test — even if the test throws.

```typescript
it('attribute round-trip', async ({ expect, world }) => {
  const obj = await world.create('TestThing');
  await world.set(obj, 'GREET', 'hello');
  await expect(`get(${obj}/GREET)`).toBe('hello');
  // obj is automatically @nuked after this test
});
```

### `world.create(name, cost?)`

Creates a THING using RhostMUSH's `create()` softcode function. Registers the dbref for cleanup.

Returns the dbref string (e.g. `'#42'`).

```typescript
const obj = await world.create('MyThing');
const obj2 = await world.create('ExpensiveThing', 10);  // with penny cost
```

### `world.dig(name)`

Creates a ROOM using `@dig`. Parses the server output for the dbref. Registers for cleanup.

```typescript
const room = await world.dig('Test Chamber');
```

### `world.destroy(dbref)`

Immediately destroys an object with `@nuke`. Does not remove it from the cleanup list — call `cleanup()` to batch-destroy everything.

```typescript
await world.destroy('#42');
```

### `world.set(dbref, attr, value)`

Sets an attribute using `&ATTR dbref=value` syntax.

```typescript
await world.set(obj, 'MYATTR', 'hello world');
await world.set(obj, 'DO_MATH', 'think add(%0,%1)');
```

### `world.get(dbref, attr)`

Gets an attribute value by evaluating `get(dbref/ATTR)`.

```typescript
const val = await world.get(obj, 'MYATTR');  // => 'hello world'
```

### `world.lock(dbref, lockstring)`

Locks an object: `@lock dbref=<lockstring>`.

```typescript
await world.lock(obj, 'me');               // lock to self
await world.lock(obj, '#1');               // lock to Wizard
await world.lock(obj, 'FLAG^WIZARD');      // lock to WIZARD flag
```

### `world.flag(dbref, flag, clear?)`

Sets or clears a flag: `@set dbref=FLAG` / `@set dbref=!FLAG`.

```typescript
await world.flag(obj, 'INHERIT');          // set INHERIT flag
await world.flag(obj, 'INHERIT', true);    // clear INHERIT flag
await world.flag(obj, 'SAFE');
```

### `world.trigger(dbref, attr, args?)`

Triggers an attribute: `@trigger dbref/ATTR=args`. Returns an array of output lines captured before the sentinel.

```typescript
await world.set(obj, 'ADD', 'think add(%0,%1)');
const lines = await world.trigger(obj, 'ADD', '10,32');
// lines => ['42']

// No args
await world.set(obj, 'GREET', '@pemit %#=Hello!');
const lines2 = await world.trigger(obj, 'GREET');
// lines2 => ['Hello!']
```

### `world.cleanup()`

Destroys all objects created by this world instance, in reverse creation order. Called automatically by the runner after each test.

```typescript
// Manually if needed (e.g. in afterAll):
await world.cleanup();
```

### `world.size`

Number of objects currently tracked for cleanup.

```typescript
console.log(world.size); // 0
await world.create('Foo');
console.log(world.size); // 1
await world.cleanup();
console.log(world.size); // 0
```

---

## RhostClient

Low-level TCP client. Usually you interact with the server through `TestContext.expect()`, `TestContext.client.command()`, or `RhostWorld`. Use `RhostClient` directly when you need fine-grained control.

```typescript
import { RhostClient } from 'rhostmush-sdk';

const client = new RhostClient({ host: 'localhost', port: 4201 });
await client.connect();
await client.login('Wizard', 'Nyctasia');
```

### Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'localhost'` | Server hostname |
| `port` | `number` | `4201` | Server port |
| `timeout` | `number` | `10000` | Default operation timeout in ms |
| `bannerTimeout` | `number` | `300` | Idle time after last banner line |
| `stripAnsi` | `boolean` | `true` | Strip ANSI escape codes from eval results |

### `client.connect()`

Establish the TCP connection. Drains the welcome banner before resolving.

### `client.login(username, password)`

Send `connect <username> <password>` and wait for the login sentinel to confirm success.

### `client.eval(expression, timeout?)`

Evaluate a softcode expression and return the string result.

Internally sends:
```
@pemit me=RHOST_EVAL_START_<id>
think <expression>
@pemit me=RHOST_EVAL_END_<id>
```

Collects lines between the sentinels and joins them with `\n`. ANSI codes are stripped by default.

```typescript
const result = await client.eval('add(2,3)');       // => '5'
const result = await client.eval('lcstr(HELLO)');   // => 'hello'
const result = await client.eval('encode64(hello)'); // => 'aGVsbG8='
```

Multi-line results are joined with `\n`:

```typescript
const result = await client.eval('iter(1 2 3,add(##,0)%r)');
// => '1\n2\n3'
```

### `client.command(cmd, timeout?)`

Send a command and collect all output lines until the internal sentinel is received.

```typescript
const lines = await client.command('look here');
const lines = await client.command('@pemit me=hello');
const lines = await client.command('@trigger #42/MYATTR=arg1,arg2');
```

Returns `string[]`.

### `client.onLine(handler)` / `client.offLine(handler)`

Subscribe/unsubscribe to every raw line from the server. Useful for debugging.

```typescript
client.onLine((line) => console.log('[SERVER]', line));
```

### `client.disconnect()`

Send `QUIT` and close the TCP connection.

---

## RhostContainer

Wraps [testcontainers](https://node.testcontainers.org/) to spin up a real RhostMUSH server for integration tests — no manual `docker compose up` required.

```typescript
import { RhostContainer } from 'rhostmush-sdk';
```

### `RhostContainer.fromSource(projectRoot?)`

Build the image from the Dockerfile on first run. Subsequent runs reuse Docker's layer cache.

```typescript
const container = RhostContainer.fromSource();
// Or specify the path to the rhostmush-docker directory:
const container = RhostContainer.fromSource('/path/to/rhostmush-docker');
```

### `RhostContainer.fromImage(image?)`

Use a pre-built image (default: `rhostmush:latest`). Faster — skips the build step.

```typescript
const container = RhostContainer.fromImage();
const container = RhostContainer.fromImage('myregistry/rhostmush:v1.2');
```

### `container.start(startupTimeout?)`

Start the container. Waits until port 4201 is accepting connections. Returns `{ host, port }`.

```typescript
const { host, port } = await container.start();           // 2 min default
const { host, port } = await container.start(600_000);    // 10 min for first build
```

### `container.stop()`

Stop and remove the container.

### `container.getConnectionInfo()`

Returns `{ host, port }` without waiting. Throws if the container is not running.

### Usage in Jest tests

```typescript
describe('integration', () => {
  let container: RhostContainer;
  let client: RhostClient;

  beforeAll(async () => {
    container = RhostContainer.fromSource();
    const { host, port } = await container.start(600_000);
    client = new RhostClient({ host, port });
    await client.connect();
    await client.login('Wizard', 'Nyctasia');
  }, 600_000);

  afterAll(async () => {
    await client.disconnect();
    await container.stop();
  });

  it('add()', async () => {
    expect(await client.eval('add(2,3)')).toBe('5');
  });
});
```

---

## Types

```typescript
// Test function — receives TestContext
type TestFn = (ctx: TestContext) => Promise<void> | void;

// Hook function — receives a subset of TestContext
type HookFn = (ctx: { client: RhostClient; world: RhostWorld }) => Promise<void> | void;

// it() / test() signature
type ItFn = (name: string, fn: TestFn, timeout?: number) => void;

// describe() signature
type DescribeFn = (name: string, fn: (ctx: SuiteContext) => void) => void;

interface SuiteContext {
  it:         ItFn & { skip: ItFn; only: ItFn };
  test:       ItFn & { skip: ItFn; only: ItFn };
  describe:   DescribeFn & { skip: DescribeFn; only: DescribeFn };
  beforeAll(fn: HookFn): void;
  afterAll(fn: HookFn): void;
  beforeEach(fn: HookFn): void;
  afterEach(fn: HookFn): void;
}

interface TestContext {
  expect(expression: string): RhostExpect;
  client: RhostClient;
  world:  RhostWorld;
}

interface RunResult {
  passed:   number;
  failed:   number;
  skipped:  number;
  total:    number;
  duration: number;
  failures: Array<{ suite: string; test: string; error: Error }>;
}

interface ContainerConnectionInfo {
  host: string;
  port: number;
}
```
