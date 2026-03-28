# SDK Reference

Complete API documentation for `@rhost/testkit`.

---

## Table of contents

- [RhostRunner](#rhostrunner)
- [SuiteContext](#suitecontext)
- [TestContext](#testcontext)
- [RhostExpect](#rhostexpect)
- [RhostWorld](#rhostworld)
- [RhostClient](#rhostclient)
- [RhostContainer](#rhostcontainer)
- [Offline Validator](#offline-validator)
- [Softcode Formatter](#softcode-formatter)
- [Benchmark Mode](#benchmark-mode)
- [CLI Commands](#cli-commands)
- [Types](#types)

---

## RhostRunner

The top-level test orchestrator. Collects suites during the _collection phase_, then connects to the server and runs them during the _execution phase_.

```typescript
import { RhostRunner } from '@rhost/testkit';

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
  host: 'localhost',        // default: 'localhost'
  port: 4201,               // default: 4201
  timeout: 10000,           // default: 10000ms per operation
  bannerTimeout: 300,       // default: 300ms idle after last banner line
  verbose: true,            // default: true — print results to stdout
  snapshotFile: './snaps',  // optional; default: __snapshots__/<file>.snap
  updateSnapshots: false,   // or set RHOST_UPDATE_SNAPSHOTS=1
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
| `paceMs` | `number` | `0` | Minimum ms to wait between evals (flood control) |
| `verbose` | `boolean` | `true` | Print results to stdout |
| `snapshotFile` | `string` | auto | Path to the `.snap` file. Defaults to `__snapshots__/<test-file>.snap` |
| `updateSnapshots` | `boolean` | `false` | Overwrite stored snapshots. Also activated by `RHOST_UPDATE_SNAPSHOTS=1` |
| `personas` | `Record<string, PersonaCredentials>` | — | Map of persona name → credentials for multi-persona testing |

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
  snapshots: {
    matched:  number;   // snapshots that matched stored values
    written:  number;   // new snapshots written on first run
    updated:  number;   // snapshots overwritten in update mode
    obsolete: number;   // stored snapshots no longer touched by any test
  };
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

### `personas(names, testName, fn, timeout?)`

Run a test once per persona, each in its own ephemeral client connection. Personas are defined in `RunnerOptions.personas`. Each run of `fn` receives an augmented `TestContext` with `persona: string` identifying the current persona.

```typescript
runner.describe('Room visibility', ({ personas }) => {
  personas(
    ['mortal', 'builder', 'wizard'],
    'hidden room is only visible to builders+',
    async ({ expect, persona }) => {
      if (persona === 'mortal') {
        await expect('lsearch(me,type,room,eval,isvisible(%#,%#))').toBe('0');
      } else {
        await expect('lsearch(me,type,room,eval,isvisible(%#,%#))').not.toBe('0');
      }
    }
  );
});

await runner.run({
  username: 'Wizard', password: PASS,
  personas: {
    mortal:  { username: 'JoePlayer', password: 'joepw' },
    builder: { username: 'BuildBot',  password: 'buildpw' },
    wizard:  { username: 'Wizard',    password: PASS },
  },
});
```

Produces separate test entries named `"<testName> [<persona>]"` in the results tree.

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

#### `.toMatchSnapshot()`

On first run, writes the result to a `.snap` file. On subsequent runs, compares the result against the stored value.

```typescript
await expect('iter(lnum(1,10),##)').toMatchSnapshot();
```

Snapshot files are stored in `__snapshots__/<test-file>.snap` next to the test file. Update stored snapshots by setting `RHOST_UPDATE_SNAPSHOTS=1` or passing `updateSnapshots: true` to `runner.run()`.

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
await expect('words(a b c d)').toHaveWordCount(4);
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

All string inputs to world methods are validated against newline injection — a `RangeError` is thrown if a value contains `\n` or `\r`.

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

### `world.pemit(target, msg)`

Sends a private emit to a target object: `@pemit target=msg`.

```typescript
await world.pemit('#42', 'Hello there!');
await world.pemit('me', 'Message to self');
```

### `world.remit(room, msg)`

Broadcasts a message to all objects in a room: `@remit room=msg`.

```typescript
await world.remit(roomDbref, 'Attention all players!');
```

### `world.force(actor, cmd)`

Forces an object to execute a command: `@force actor=cmd`.

```typescript
await world.force(npcDbref, 'say Hello!');
await world.force(obj, '@trigger me/MYATTR');
```

### `world.parent(child, parentDbref)`

Sets a parent object: `@parent child=parent`.

```typescript
const parent = await world.create('BaseObj');
const child  = await world.create('ChildObj');
await world.parent(child, parent);
```

### `world.zone(name)`

Creates a zone room via `@dig` and automatically sets the `INHERIT_ZONE` flag. Registers for cleanup. Returns the dbref.

```typescript
const zone = await world.zone('MyZone');
await world.parent(obj, zone);  // obj now inherits from the zone
```

### `world.addToChannel(dbref, chan)`

Adds an object to a channel: `@channel/add chan=dbref`.

```typescript
await world.addToChannel(playerDbref, 'Public');
```

### `world.grantQuota(dbref, n)`

Sets a build quota on an object: `@quota/set dbref=n`.

```typescript
await world.grantQuota(playerDbref, 50);
```

### `world.wait(ms)`

Pauses for `ms` milliseconds. This is a plain JavaScript delay (not a MUSH `@wait`), useful for testing time-dependent behaviors.

```typescript
await world.wait(500);  // wait 500ms
```

### `world.mail(to, subj, body)`

Sends in-game mail: `@mail to=subj/body`.

```typescript
await world.mail('#42', 'Test subject', 'Message body here');
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
import { RhostClient } from '@rhost/testkit';

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
| `paceMs` | `number` | `0` | Minimum ms to wait between evals |
| `connectTimeout` | `number` | `10000` | TCP connection establishment timeout |

### `client.connect()`

Establish the TCP connection. Drains the welcome banner before resolving.

### `client.login(username, password)`

Send `connect <username> <password>` and wait for the login sentinel to confirm success.

Throws `RangeError` if:
- `username` contains `\n`, `\r`, a space, or a tab (any of these would split or misparse the MUSH `connect` command)
- `password` contains `\n` or `\r`

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

### `client.preview(input, options?)`

Evaluate an expression or run a command and print the raw server output (including ANSI color codes) in a framed block to stdout. Returns the raw output string.

```typescript
// Eval mode (default) — renders the softcode result with colors intact
await client.preview('ansi(r,hello)');

// Command mode — renders all output lines from the command
await client.preview('look here', { mode: 'command' });

// Suppress auto-print and just get the raw string
const raw = await client.preview('ansi(b,test)', { print: false });
```

#### PreviewOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'eval' \| 'command'` | `'eval'` | How to send the input to the server |
| `label` | `string` | input string | Label shown in the preview frame header |
| `timeout` | `number` | client default | Timeout in ms |
| `print` | `boolean` | `true` | Write the preview frame to stdout |

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
import { RhostContainer } from '@rhost/testkit';
```

### `RhostContainer.fromSource(projectRoot?, config?)`

Build the image from the Dockerfile on first run. Subsequent runs reuse Docker's layer cache.

```typescript
const container = RhostContainer.fromSource();
// Specify the path to the rhostmush-docker directory:
const container = RhostContainer.fromSource('/path/to/rhostmush-docker');
// Inject a custom scripts directory:
const container = RhostContainer.fromSource(undefined, { scriptsDir: './scripts' });
```

### `RhostContainer.fromImage(image?, config?)`

Use a pre-built image (default: `lcanady/rhostmush:latest`). Faster — skips the build step.

```typescript
const container = RhostContainer.fromImage();
const container = RhostContainer.fromImage('rhostmush/rhostmush:v1.2');
// Inject a custom mush config file:
const container = RhostContainer.fromImage(undefined, { mushConfig: './mush.conf' });
```

### `rhost.config.json` — project-level config

Place a `rhost.config.json` at your project root to configure the container without changing test code. Both factory methods auto-load it when no `config` argument is supplied.

```json
{
  "scriptsDir": "./scripts",
  "mushConfig": "./mush.conf"
}
```

| Field | Type | Description |
|---|---|---|
| `scriptsDir` | `string` | Path to a directory of execscript files. Copied into the container at `/home/rhost/game/scripts`, replacing the built-in scripts. Must be within the project directory. |
| `mushConfig` | `string` | Path to a MUSH server config file. Copied into the container at `/home/rhost/game/mush.config`. Must be within the project directory. |

All paths are relative to the `rhost.config.json` file's location and are validated — paths that escape the project root (e.g. `../../etc`) throw an error.

```typescript
import { loadConfig, RhostConfig } from '@rhost/testkit';

// Load manually (returns null if rhost.config.json doesn't exist):
const cfg: RhostConfig | null = loadConfig();

// Or pass config programmatically (overrides auto-load):
const container = RhostContainer.fromSource(undefined, {
  scriptsDir: './my-scripts',
});
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
    container = RhostContainer.fromImage();
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

## Offline Validator

Validate softcode expressions without a live server connection. The validator runs a Tokenizer → Parser → Semantic Checker pipeline.

```typescript
import { validate, validateFile } from '@rhost/testkit/validator';
```

### `validate(expression)`

Validates a softcode expression string. Returns a `ValidationResult`.

```typescript
const result = validate('add(2,3)');
// result.valid => true
// result.errors => []

const bad = validate('add(2,');
// bad.valid => false
// bad.errors => [{ message: 'Unbalanced parenthesis', ... }]
```

### `validateFile(filePath)`

Reads a file and validates its contents. Returns a `ValidationResult`.

```typescript
const result = validateFile('./mycode.mush');
```

### `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  errors: Array<{
    message: string;
    line?: number;
    col?: number;
  }>;
}
```

### CLI usage

```bash
# Validate an expression
rhost-testkit validate "add(2,3)"

# Validate a file
rhost-testkit validate --file mycode.mush

# Machine-readable output
rhost-testkit validate --json "add(2,"
```

Exit code is `0` on success, `1` on validation errors.

---

## Softcode Formatter

Normalize whitespace in softcode expressions. Strips extra spaces around `(`, `,`, `)` while preserving interior argument text. Optionally indents nested calls for human readability.

```typescript
import { format } from '@rhost/testkit';
```

### `format(expression, options?)`

```typescript
format(expression: string, options?: FormatOptions): FormatResult
```

**`FormatOptions`:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pretty` | `boolean` | `false` | Add newlines + indentation at each nesting level |
| `lowercase` | `boolean` | `false` | Normalize function names to lowercase |

**`FormatResult`:**

```typescript
interface FormatResult {
  formatted: string;   // the normalized expression
  changed:   boolean;  // true if formatted !== input
}
```

**Examples:**

```typescript
format('add( 2, 3 )');
// => { formatted: 'add(2,3)', changed: true }

format('add(2,3)');
// => { formatted: 'add(2,3)', changed: false }

format('add(mul(2,3),4)', { pretty: true });
// => { formatted: 'add(\n  mul(2,3),\n  4\n)', changed: true }

format('ADD(2,3)', { lowercase: true });
// => { formatted: 'add(2,3)', changed: true }

// Interior whitespace in argument text is preserved
format('pemit(%#,hello world)');
// => { formatted: 'pemit(%#,hello world)', changed: false }
```

---

## Benchmark Mode

Profile softcode performance against a live server.

```typescript
import { RhostBenchmark, runBench, formatBenchResults } from '@rhost/testkit';
```

### `runBench(client, expression, options?)`

Run a single expression and return timing statistics.

```typescript
runBench(
  client: RhostClient,
  expression: string,
  options?: BenchOptions,
): Promise<BenchmarkResult>
```

**`BenchOptions`:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | the expression | Human-readable label |
| `iterations` | `number` | `100` | Number of measured runs |
| `warmup` | `number` | `10` | Unmeasured warm-up runs before measuring |

### `RhostBenchmark`

Fluent builder for running multiple benchmarks in sequence.

```typescript
const bench = new RhostBenchmark(client);

bench
  .add('add(2,3)', { name: 'addition', iterations: 100, warmup: 10 })
  .add('iter(lnum(1,100),##)', { name: 'heavy iter', iterations: 50 });

const results = await bench.run();
console.log(formatBenchResults(results));
```

### `formatBenchResults(results)`

Format an array of `BenchmarkResult` objects into a human-readable table.

```typescript
formatBenchResults(results: BenchmarkResult[]): string
```

### `BenchmarkResult`

```typescript
interface BenchmarkResult {
  name:       string;
  iterations: number;
  warmup:     number;
  samples:    number[];   // raw per-iteration timings in ms
  mean:       number;
  median:     number;
  p95:        number;
  p99:        number;
  min:        number;
  max:        number;
}
```

---

## CLI Commands

The `rhost-testkit` binary ships with five commands.

### `rhost-testkit validate`

Validate softcode offline. See [Offline Validator](#offline-validator).

### `rhost-testkit watch`

Watch test files and re-run on change. Discovers `*.test.ts` / `*.spec.ts` files automatically.

```bash
# Watch all test files
rhost-testkit watch

# Watch a specific file
rhost-testkit watch src/__tests__/math.test.ts
```

- Re-runs changed files on save with a 300ms debounce
- Clears the terminal between runs
- Spawns `ts-node --transpile-only` for TypeScript files

### `rhost-testkit fmt`

Format softcode files. Strips extra whitespace around `(`, `,`, `)`.

```bash
# Format in-place
rhost-testkit fmt mycode.mush

# Check without writing (exit 1 if not formatted — CI-friendly)
rhost-testkit fmt --check mycode.mush

# Indent nested calls for readability
rhost-testkit fmt --pretty mycode.mush

# Normalize function names to lowercase
rhost-testkit fmt --lowercase mycode.mush

# Format from stdin
echo "add( 2, 3 )" | rhost-testkit fmt
```

### `rhost-testkit init`

Generate CI/CD workflow files for your project.

```bash
# GitHub Actions
rhost-testkit init --ci github

# GitLab CI
rhost-testkit init --ci gitlab

# Overwrite an existing file
rhost-testkit init --ci github --force
```

| Platform | Output file |
|---|---|
| `github` | `.github/workflows/mush-tests.yml` |
| `gitlab` | `.gitlab-ci.yml` |

Both templates are pre-configured to pull the `rhostmush/rhostmush` Docker image and run your test suite. Edit the generated file to enable the commented integration test block.

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

interface PersonaCredentials {
  username: string;
  password: string;
  host?:    string;
  port?:    number;
}

interface RunnerOptions extends RhostClientOptions {
  username:         string;
  password:         string;
  verbose?:         boolean;
  snapshotFile?:    string;
  updateSnapshots?: boolean;
  personas?:        Record<string, PersonaCredentials>;
}

interface RunResult {
  passed:   number;
  failed:   number;
  skipped:  number;
  total:    number;
  duration: number;
  failures: Array<{ suite: string; test: string; error: Error }>;
  snapshots: SnapshotStats;
}

interface SnapshotStats {
  matched:  number;
  written:  number;
  updated:  number;
  obsolete: number;
}

interface ContainerConnectionInfo {
  host: string;
  port: number;
}

// Softcode Formatter
interface FormatOptions {
  pretty?:    boolean;
  lowercase?: boolean;
}

interface FormatResult {
  formatted: string;
  changed:   boolean;
}

// Benchmark Mode
interface BenchOptions {
  name?:       string;
  iterations?: number;
  warmup?:     number;
}

interface BenchmarkResult {
  name:       string;
  iterations: number;
  warmup:     number;
  samples:    number[];
  mean:       number;
  median:     number;
  p95:        number;
  p99:        number;
  min:        number;
  max:        number;
}

// Deploy pipeline
type Platform = 'rhost' | 'penn' | 'mux';

interface CompatibilityEntry {
  name:      string;
  platforms: Platform[];
}

interface CompatibilityReport {
  restricted: CompatibilityEntry[];
  portable:   boolean;
}
```
