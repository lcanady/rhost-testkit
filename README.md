# @rhost/testkit

[![npm version](https://img.shields.io/npm/v/@rhost/testkit.svg)](https://www.npmjs.com/package/@rhost/testkit)
[![npm downloads](https://img.shields.io/npm/dm/@rhost/testkit.svg)](https://www.npmjs.com/package/@rhost/testkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/RhostMUSH/rhostmush-docker/actions/workflows/security-tests.yml/badge.svg)](https://github.com/RhostMUSH/rhostmush-docker/actions/workflows/security-tests.yml)
[![Security](https://img.shields.io/badge/Security-Audited-brightgreen.svg)](./SECURITY.md)

A Jest-like testing framework for [RhostMUSH](https://github.com/RhostMUSH/trunk) softcode.
Write tests that run directly against a real MUSH server — local, CI container, or remote.

```bash
npm install @rhost/testkit
```

---

## Contents

- [What it does](#what-it-does)
- [Installation](#installation)
- [How the runner works](#how-the-runner-works)
- [Quick start](#quick-start)
- [API reference — RhostRunner](#api-reference--rhostrunner)
- [API reference — RhostExpect](#api-reference--rhostexpect)
- [Snapshot testing](#snapshot-testing)
- [API reference — RhostWorld](#api-reference--rhostworld)
- [API reference — RhostClient](#api-reference--rhostclient)
- [API reference — RhostContainer](#api-reference--rhostcontainer)
- [Offline validator](#offline-validator)
- [Softcode formatter](#softcode-formatter)
- [Benchmark mode](#benchmark-mode)
- [Watch mode](#watch-mode)
- [CI/CD templates](#cicd-templates)
- [MUSH output format](#mush-output-format)
- [Using with LLM skills](#using-with-llm-skills)
- [Environment variables](#environment-variables)
- [Examples](#examples)
- [Roadmap](#roadmap)

---

## What it does

`@rhost/testkit` gives you a full test-runner loop for MUSHcode:

- **Eval** softcode expressions and capture their output
- **Assert** results with a Jest-like `expect()` API and MUSH-aware matchers
- **Snapshot test** softcode output — first run writes, subsequent runs compare with a diff on mismatch
- **Preview** raw server output exactly as a MUSH client sees it — ANSI colours and all
- **Manage fixtures** — create/destroy objects, set attributes, force commands, send mail, and more
- **Validate softcode offline** — catch syntax errors, wrong arg counts, register clobber risks, and dialect compatibility without a server
- **Format softcode** — normalize whitespace and optionally indent nested calls (`rhost-testkit fmt`)
- **Benchmark** expressions — measure median / p95 / p99 latency per softcode call against a live server
- **Watch mode** — re-run tests on save with a 300ms debounce
- **Generate CI/CD workflows** — one command to get GitHub Actions or GitLab CI configured
- **Spin up RhostMUSH in Docker** for isolated, reproducible CI runs
- **Report** results with a pretty, indented pass/fail tree

---

## Installation

```bash
npm install @rhost/testkit
```

**Peer requirements:**
- Node.js ≥ 18
- Docker (only for `RhostContainer` — not required when connecting to an existing server)
- TypeScript ≥ 5.0 (if using TypeScript)

---

## How the runner works

`RhostRunner` uses a **two-phase** collect → run model identical to Jest:

```
Phase 1 — collect:  runner.describe() / runner.describe.skip() calls build a tree in memory.
Phase 2 — run:      runner.run(options) connects to the MUSH server and executes the tree.
```

The `describe()` callback runs **synchronously** during collection.
The `it()` callback runs **asynchronously** during execution.
All `await` calls belong inside `it()` callbacks, not inside `describe()` callbacks.

```typescript
import { RhostRunner } from '@rhost/testkit';

const runner = new RhostRunner();

// Phase 1 — synchronous collection
runner.describe('add()', ({ it }) => {
    it('adds two numbers', async ({ expect }) => {
        await expect('add(2,3)').toBe('5');
    });
    it('handles negatives', async ({ expect }) => {
        await expect('add(-1,1)').toBe('0');
    });
});

// Phase 2 — async execution (require explicit password — no fallback)
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const result = await runner.run({
    host: 'localhost',
    port: 4201,
    username: 'Wizard',
    password: PASS,
});

process.exit(result.failed > 0 ? 1 : 0);
```

---

## Quick start

### Against an existing server

```typescript
import { RhostClient } from '@rhost/testkit';

const PASS = process.env.RHOST_PASS;
if (!PASS) throw new Error('RHOST_PASS env var is required');

const client = new RhostClient({ host: 'localhost', port: 4201 });
await client.connect();
await client.login('Wizard', PASS);

const result = await client.eval('add(2,3)');
console.log(result); // '5'

await client.disconnect();
```

### Spinning up Docker for CI

```typescript
import { RhostRunner, RhostContainer } from '@rhost/testkit';

const PASS = process.env.RHOST_PASS;
if (!PASS) throw new Error('RHOST_PASS env var is required');

// Build from the rhostmush-docker source (first run is slow — compiles from source)
const container = RhostContainer.fromSource();
const info = await container.start(); // { host, port }

const runner = new RhostRunner();
runner.describe('sanity', ({ it }) => {
    it('add works', async ({ expect }) => {
        await expect('add(1,1)').toBe('2');
    });
});

const result = await runner.run({ ...info, username: 'Wizard', password: PASS });
await container.stop();
process.exit(result.failed > 0 ? 1 : 0);
```

### Using the world fixture manager

```typescript
import { RhostRunner } from '@rhost/testkit';

const runner = new RhostRunner();

runner.describe('attributes', ({ it, beforeEach, afterEach }) => {
    // world is auto-created fresh for each test and auto-cleaned after
    it('set and get attribute', async ({ world, client }) => {
        const obj = await world.create('TestObj');
        await world.set(obj, 'HP', '100');
        const val = await client.eval(`get(${obj}/HP)`);
        if (val.trim() !== '100') throw new Error(`Expected 100, got ${val}`);
    });
    // world.cleanup() is called automatically — no afterEach needed
});
```

> **Note:** A fresh `RhostWorld` instance is provided to each `it()` test via the `TestContext`.
> It is automatically cleaned up (all created objects destroyed) after the test finishes, even on failure.

---

## API reference — RhostRunner

### Constructor

```typescript
const runner = new RhostRunner();
// No arguments. Use runner.run(options) to set connection details.
```

### Collection methods

```typescript
runner.describe(name: string, fn: (ctx: SuiteContext) => void): this
runner.describe.skip(name: string, fn: (ctx: SuiteContext) => void): this
runner.describe.only(name: string, fn: (ctx: SuiteContext) => void): this
```

Calling `describe.only()` causes only suites marked `only` (at that level) to run; all others are skipped.

### `runner.run(options)`

```typescript
await runner.run(options: RunnerOptions): Promise<RunResult>
```

Connects to the MUSH server, runs all collected tests, disconnects, and returns the result.

**`RunnerOptions`** (extends `RhostClientOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `username` | `string` | — | **Required.** Character name to log in as. |
| `password` | `string` | — | **Required.** Character password. |
| `host` | `string` | `'localhost'` | MUSH server hostname. |
| `port` | `number` | `4201` | MUSH telnet port. |
| `verbose` | `boolean` | `true` | Print per-test results to stdout while running. |
| `timeout` | `number` | `10000` | Per-eval/command timeout in ms. |
| `bannerTimeout` | `number` | `300` | Ms to wait for welcome banner to finish. |
| `connectTimeout` | `number` | `10000` | Raw TCP connection timeout in ms. |
| `paceMs` | `number` | `0` | Delay between sent commands in ms (flood control). |
| `stripAnsi` | `boolean` | `true` | Strip ANSI color codes from eval results. |

**`RunResult`:**

```typescript
interface RunResult {
    passed:   number;                                              // tests that threw no error
    failed:   number;                                              // tests that threw
    skipped:  number;                                             // tests marked skip
    total:    number;                                              // passed + failed + skipped
    duration: number;                                             // wall-clock ms
    failures: Array<{ suite: string; test: string; error: Error }>;
}
```

### `SuiteContext` — what `describe()` receives

```typescript
interface SuiteContext {
    it(name: string, fn: TestFn, timeout?: number): void
    it.skip(name: string, fn: TestFn, timeout?: number): void
    it.only(name: string, fn: TestFn, timeout?: number): void

    test(name: string, fn: TestFn, timeout?: number): void  // alias for it
    test.skip / test.only                                    // same as it.skip / it.only

    describe(name: string, fn: (ctx: SuiteContext) => void): void
    describe.skip(...)
    describe.only(...)

    beforeAll(fn: HookFn): void    // runs once before all tests in this suite
    afterAll(fn: HookFn): void     // runs once after all tests in this suite
    beforeEach(fn: HookFn): void   // runs before every test in this suite (inherited by nested suites)
    afterEach(fn: HookFn): void    // runs after every test in this suite
}
```

### `TestContext` — what `it()` receives

```typescript
interface TestContext {
    expect(expression: string): RhostExpect              // create an expect for a softcode expression
    preview(input: string, opts?: PreviewOptions): Promise<string>  // print raw server output
    client: RhostClient                                  // the live MUSH connection
    world:  RhostWorld                                   // fresh per-test fixture manager (auto-cleaned)
}
```

### `HookFn` — what `beforeAll` / `beforeEach` / etc. receive

```typescript
type HookFn = (ctx: { client: RhostClient; world: RhostWorld }) => Promise<void> | void
```

### Hook execution order

```
beforeAll      (suite level, once)
  beforeEach   (inherited from parent suites, then this suite)
    test body
  afterEach    (this suite only)
afterAll       (suite level, once)
```

`beforeEach` hooks are **inherited** by nested `describe` blocks.
`afterEach` hooks are **not** inherited — they only run for tests in the suite where they were registered.

If a `beforeAll` hook throws, all tests in that suite (and nested suites) are counted as failed. The error is reported for each test.

If a `beforeEach` hook throws, that individual test is counted as failed and `afterEach` is skipped.

### `it.only` / `describe.only` semantics

`only` applies at the **sibling level**. If any sibling at a given level is marked `only`, all siblings NOT marked `only` are skipped. `only` does not affect other describe blocks.

---

## API reference — RhostExpect

Inside a test, `expect('expression')` evaluates the softcode expression and returns a `RhostExpect`. The result is **lazily evaluated and cached** — calling multiple matchers on the same `expect()` call evaluates the expression only once.

```typescript
// Inside it():
async ({ expect }) => {
    await expect('add(2,3)').toBe('5');
    await expect('strlen(hello)').toBeNumber();
    await expect('lattr(#1)').toContainWord('ALIAS');
}
```

### Negation

```typescript
await expect('add(1,1)').not.toBe('3');
await expect('add(1,1)').not.toBeError();
```

### All matchers

| Matcher | Behavior |
|---------|----------|
| `.toBe(expected: string)` | Exact match after `.trim()`. |
| `.toContain(substring: string)` | Result includes the substring. |
| `.toMatch(pattern: RegExp \| string)` | Regex test, or substring inclusion if string. |
| `.toStartWith(prefix: string)` | Result starts with prefix. |
| `.toEndWith(suffix: string)` | Result ends with suffix. |
| `.toBeNumber()` | Result parses as a finite number. Empty string fails. |
| `.toBeCloseTo(expected: number, precision?: number)` | `\|actual − expected\| < 10^(−precision)`. Default precision: 3. |
| `.toBeTruthy()` | Non-empty, not `"0"`, and not a MUSH error (`#-1`/`#-2`/`#-3`). |
| `.toBeFalsy()` | Empty string, `"0"`, or a MUSH error. |
| `.toBeError()` | Result starts with `#-1`, `#-2`, or `#-3`. |
| `.toBeDbref()` | Result matches `/^#\d+$/` (a positive object reference). |
| `.toContainWord(word: string, sep?: string)` | Word is present in the space-delimited list (or custom separator). |
| `.toHaveWordCount(n: number, sep?: string)` | List has exactly `n` words. Empty string has 0. |
| `.toMatchSnapshot()` | Compare output against a stored snapshot; writes on first run. |

### Failure message format

When a matcher fails, it throws `RhostExpectError` with this message:

```
expect("add(2,3)")
  ● .toBe failed
    Expected: "6"
    Received: "5"
```

### Using `RhostExpect` without the runner

```typescript
import { RhostClient, RhostExpect } from '@rhost/testkit';

const client = new RhostClient({ host: 'localhost', port: 4201 });
await client.connect();
await client.login('Wizard', 'Nyctasia');

const ex = new RhostExpect(client, 'add(2,3)');
await ex.toBe('5');
await ex.not.toBe('6');  // expression is already cached from toBe() above

await client.disconnect();
```

---

## Snapshot testing

Snapshot tests lock in the output of a softcode expression. The first run writes the value to a `.snap` file; subsequent runs compare against it and diff on mismatch.

```typescript
runner.describe('iter output', ({ it }) => {
    it('produces the right sequence', async ({ expect }) => {
        await expect('iter(lnum(1,5),##)').toMatchSnapshot();
    });
});
```

On first run, a file like `__snapshots__/my-tests.test.ts.snap` is created:
```json
{
  "iter output > produces the right sequence: 1": "1 2 3 4 5"
}
```

On subsequent runs the stored value is compared. If it differs, the test fails with a line-by-line diff:
```
- 1 2 3 4 5
+ 1 2 3 4 5 6
```

To update all snapshots (e.g. after an intentional change):

```bash
RHOST_UPDATE_SNAPSHOTS=1 npx ts-node my-tests.test.ts
```

Or pass `updateSnapshots: true` to `runner.run()`.

The runner prints a snapshot summary after each run: `Snapshots: 3 passed, 1 written, 0 updated`.

**Snapshot key format:** `"Suite > Sub-suite > Test name: N"` — where `N` is the 1-based call count within the test. Calling `.toMatchSnapshot()` twice in one test produces two separate keys.

---

## API reference — RhostWorld

`RhostWorld` manages MUSH object fixtures. Objects created through `world` are registered and destroyed automatically in `world.cleanup()`. In the runner, `cleanup()` is called after every `it()` test — even on failure.

### Constructor

```typescript
const world = new RhostWorld(client: RhostClient);
```

### Methods

```typescript
await world.create(name: string, cost?: number): Promise<string>
```
Creates a THING via `create(name)` or `create(name,cost)`. Returns the dbref (`#42`). Registers for cleanup.

```typescript
await world.dig(name: string): Promise<string>
```
Creates a ROOM via `@dig name`. Returns the room dbref. Registers for cleanup.

```typescript
await world.set(dbref: string, attr: string, value: string): Promise<void>
```
Sets an attribute: `&attr dbref=value`.

```typescript
await world.get(dbref: string, attr: string): Promise<string>
```
Gets an attribute value via `get(dbref/attr)`.

```typescript
await world.flag(dbref: string, flag: string, clear?: boolean): Promise<void>
```
Sets (`@set dbref=FLAG`) or clears (`@set dbref=!FLAG`) a flag. `clear` defaults to `false`.

```typescript
await world.lock(dbref: string, lockstring: string): Promise<void>
```
Locks an object: `@lock dbref=lockstring`.

```typescript
await world.trigger(dbref: string, attr: string, args?: string): Promise<string[]>
```
Triggers `@trigger dbref/attr=args`. Returns all output lines captured before the sentinel.

```typescript
await world.pemit(target: string, msg: string): Promise<void>
```
Emits a message to a target: `@pemit target=msg`.

```typescript
await world.remit(room: string, msg: string): Promise<void>
```
Emits a message to all objects in a room: `@remit room=msg`.

```typescript
await world.force(actor: string, cmd: string): Promise<void>
```
Forces an object to run a command: `@force actor=cmd`.

```typescript
await world.parent(child: string, parent: string): Promise<void>
```
Sets a parent object: `@parent child=parent`.

```typescript
await world.zone(name: string): Promise<string>
```
Creates a zone room via `@dig name` and sets `INHERIT_ZONE`. Returns the room dbref. Registers for cleanup.

```typescript
await world.addToChannel(dbref: string, chan: string): Promise<void>
```
Adds an object to a channel: `@channel/add chan=dbref`.

```typescript
await world.grantQuota(dbref: string, n: number): Promise<void>
```
Sets the build quota for an object: `@quota/set dbref=n`.

```typescript
await world.wait(ms: number): Promise<void>
```
Pauses the test for `ms` milliseconds. Plain JavaScript delay — not a MUSH `@wait`.

```typescript
await world.mail(to: string, subj: string, body: string): Promise<void>
```
Sends in-game mail: `@mail to=subj/body`.

```typescript
await world.destroy(dbref: string): Promise<void>
```
Destroys a single object with `@nuke`. Also removes it from the cleanup list.

```typescript
await world.cleanup(): Promise<void>
```
Destroys all registered objects in reverse-creation order. Errors from individual destroys are silently swallowed (the object may already be gone).

```typescript
world.size: number
```
Number of objects currently registered for cleanup.

### Input safety

All string inputs to `world` methods are validated by `guardInput()` before interpolation into MUSH commands. The guard rejects any string containing `\n` (newline) or `\r` (carriage return), which are the characters that split a single TCP send into multiple MUSH command lines.

**Accepted:** any string without `\n` or `\r` — including spaces, punctuation, and special MUSH characters.
**Rejected:** strings containing `\n` or `\r` — throws `RangeError`.

```typescript
await world.create('Test Obj-42');              // ✓ OK
await world.set('#1', 'HP', '100');             // ✓ OK
await world.set('#1', 'ATTR', 'a;b');           // ✓ OK (semicolons are not split chars)
await world.create('name\n@pemit me=injected'); // ✗ throws RangeError
await world.set('#1', 'AT\rTR', 'val');         // ✗ throws RangeError
```

> **LLM note:** The guard covers newline-based command splitting. MUSH-level injection (e.g., semicolons or `[` brackets in softcode contexts) is out of scope — `world` methods are test infrastructure, not a user-input sanitizer. Do not pass arbitrary end-user input directly to `world` methods.

---

## API reference — RhostClient

Low-level TCP client. All higher-level classes are built on top of this.

### Constructor

```typescript
const client = new RhostClient(options?: RhostClientOptions);
```

**`RhostClientOptions`:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | `'localhost'` | Server hostname |
| `port` | `number` | `4201` | Telnet port |
| `timeout` | `number` | `10000` | Per-eval/command timeout (ms) |
| `bannerTimeout` | `number` | `300` | Ms to wait for welcome banner |
| `stripAnsi` | `boolean` | `true` | Strip ANSI/VT100 codes from results |
| `paceMs` | `number` | `0` | Delay between commands (flood control) |
| `connectTimeout` | `number` | `10000` | TCP connection establishment timeout (ms) |

### Methods

```typescript
await client.connect(): Promise<void>
```
Establishes the TCP connection and drains the welcome banner.

```typescript
await client.login(username: string, password: string): Promise<void>
```
Sends `connect <username> <password>` and waits for the login sentinel. Throws `RangeError` if the username contains `\n`, `\r`, spaces, or tabs (which would split the MUSH connect command), or if the password contains `\n` or `\r`.

```typescript
await client.eval(expression: string, timeout?: number): Promise<string>
```
Evaluates a softcode expression using `think` and captures the output. Trims trailing newlines. Strips ANSI if `stripAnsi: true` (the default). Returns the raw output string — may be empty, a number, a dbref, an error code, or a space-delimited list.

```typescript
await client.command(cmd: string, timeout?: number): Promise<string[]>
```
Sends a MUSH command and captures all output lines until the sentinel. Returns an array of lines (may be empty).

```typescript
await client.preview(input: string, options?: PreviewOptions): Promise<string>
```
Evaluate an expression or run a command and print the raw server output to stdout exactly as a MUSH client receives it — ANSI colours, formatting codes, and all. Output is rendered in a labelled frame. Returns the raw string so you can still assert on it.

**`PreviewOptions`:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'eval' \| 'command'` | `'eval'` | `'eval'` wraps in `think`; `'command'` sends as a raw MUSH command |
| `label` | `string` | the input string | Custom frame header label |
| `timeout` | `number` | client default | Per-call timeout (ms) |
| `print` | `boolean` | `true` | Set `false` to suppress stdout and only use the return value |

```typescript
// Softcode expression — see the raw colour output
await preview('ansi(rh,CRITICAL HIT!)');

// Room description as a player sees it
await preview('look here', { mode: 'command' });

// Assert without printing
const raw = await preview('ansi(b,test)', { print: false });
expect(stripAnsi(raw)).toBe('test');
```

```typescript
client.onLine(handler: (line: string) => void): void
client.offLine(handler: (line: string) => void): void
```
Subscribe/unsubscribe to every raw line received from the server. Useful for debugging or log capture.

```typescript
await client.disconnect(): Promise<void>
```
Sends `QUIT` and closes the TCP connection.

### `stripAnsi` utility

```typescript
import { stripAnsi } from '@rhost/testkit';
stripAnsi('\x1b[32mgreen\x1b[0m'); // => 'green'
```

### `isRhostError` utility

```typescript
import { isRhostError } from '@rhost/testkit';
isRhostError('#-1 NO MATCH');    // => true
isRhostError('#-2');             // => true
isRhostError('#42');             // => false
isRhostError('5');               // => false
```

Returns `true` if the string starts with `#-1`, `#-2`, or `#-3`.

---

## API reference — RhostContainer

Spins up a RhostMUSH Docker container for isolated test runs. Uses [testcontainers](https://node.testcontainers.org/) under the hood.

### Factory methods

```typescript
RhostContainer.fromImage(image?: string): RhostContainer
```
Use a pre-built Docker image. Default image: `'rhostmush:latest'`.
Build it first: `docker build -t rhostmush:latest .` (from the rhostmush-docker repo root).

```typescript
RhostContainer.fromSource(projectRoot?: string): RhostContainer
```
Build the image from the `Dockerfile` in the rhostmush-docker project root.
First run: ~5–10 minutes (clones and compiles RhostMUSH from source). Subsequent runs use Docker layer cache.
`projectRoot` defaults to `'../'` relative to the installed package location.

### Instance methods

```typescript
await container.start(startupTimeout?: number): Promise<ContainerConnectionInfo>
```
Starts the container and waits for port 4201 to accept connections.
`startupTimeout` defaults to `120000` ms (2 minutes).
Returns `{ host: string; port: number }` — the dynamically assigned host/port.

```typescript
await container.stop(): Promise<void>
```
Stops and removes the container. Safe to call even if `start()` was never called.

```typescript
container.getConnectionInfo(): ContainerConnectionInfo
```
Returns the current `{ host, port }`. Throws if the container is not running.

### Full usage example

```typescript
import { RhostRunner, RhostContainer } from '@rhost/testkit';

const container = RhostContainer.fromSource();
const info = await container.start();
// info = { host: 'localhost', port: 32XXX }  (random high port)

const runner = new RhostRunner();
runner.describe('my system', ({ it }) => {
    it('works', async ({ expect }) => {
        await expect('add(1,1)').toBe('2');
    });
});

const PASS = process.env.RHOST_PASS;
if (!PASS) throw new Error('RHOST_PASS env var is required');

const result = await runner.run({
    ...info,                    // spreads host + port
    username: 'Wizard',
    password: PASS,
});

await container.stop();
process.exit(result.failed > 0 ? 1 : 0);
```

---

## Offline validator

Validate softcode expressions without a server connection. Catches structural errors (unbalanced parens/brackets), wrong argument counts, and unknown built-in functions.

### Programmatic API

```typescript
import { validate, validateFile } from '@rhost/testkit/validator';

const result = validate('add(2,3)');
// result.valid       => true
// result.diagnostics => []

const bad = validate('add(2,3');
// bad.valid                 => false
// bad.diagnostics[0].code   => 'E001'
// bad.diagnostics[0].message => "Unclosed '(' ..."
```

```typescript
const result = validateFile('./mycode.mush');
```

### CLI

```bash
npx rhost-testkit validate "add(2,3)"
npx rhost-testkit validate --file mycode.mush
npx rhost-testkit validate --json "abs(1,2)"   # machine-readable output
```

Exit code `0` = valid (warnings allowed), `1` = one or more errors.

### Diagnostic codes

| Code | Severity | Meaning |
|------|----------|---------|
| `E001` | error | Unclosed `(` |
| `E002` | error | Unexpected `)` |
| `E003` | error | Unclosed `[` |
| `E004` | error | Unexpected `]` |
| `E006` | error | Too few arguments for known built-in |
| `E007` | error | Too many arguments for known built-in |
| `W001` | warning | Empty expression |
| `W002` | warning | Empty argument (e.g. `add(,3)`) |
| `W003` | warning | Deprecated function |
| `W005` | warning | Unknown function name (may be a UDF) |
| `W006` | warning | Register clobber risk — `setq()` inside a loop body may overwrite registers in concurrent iterations |

### Dialect compatibility report

Report which functions are portable across MUSH platforms (RhostMUSH, PennMUSH, TinyMUX):

```typescript
import { compatibilityReport } from '@rhost/testkit';

const report = compatibilityReport('json(get,key)');
// report.portable  => false
// report.restricted => [{ name: 'json', platforms: ['rhost'] }]
```

```bash
npx rhost-testkit validate --compat mycode.mush
```

### Register clobber analysis

`%q0`–`%q9` registers are scoped per queue entry. The validator warns when `setq()` appears inside a loop body (`iter()`, `parse()`, `map()`, etc.) where concurrent invocations can silently overwrite each other's registers:

```bash
$ rhost-testkit validate --file combat.mush

WARNING W006: register clobber risk
  setq() writes %q0 inside iter() at offset 14.
  Wrap in localize() to scope registers to each iteration.
```

---

## Softcode formatter

Normalize whitespace in softcode files — strips extra spaces around `(`, `,`, `)` while preserving interior argument text.

### CLI

```bash
# Format a file in-place
npx rhost-testkit fmt mycode.mush

# Check without writing (exit 1 if not formatted — useful in CI)
npx rhost-testkit fmt --check mycode.mush

# Indent nested function calls for human readability
npx rhost-testkit fmt --pretty mycode.mush

# Normalize function names to lowercase
npx rhost-testkit fmt --lowercase mycode.mush

# Format from stdin
echo "add( 2, 3 )" | npx rhost-testkit fmt
```

### Programmatic API

```typescript
import { format } from '@rhost/testkit';

const result = format('add( 2, 3 )');
// result.formatted => 'add(2,3)'
// result.changed   => true

// Pretty mode — indents nested calls for readability (not for upload)
const pretty = format('add(mul(2,3),4)', { pretty: true });
// pretty.formatted => 'add(\n  mul(2,3),\n  4\n)'

// Lowercase function names
const lower = format('ADD(2,3)', { lowercase: true });
// lower.formatted => 'add(2,3)'
```

Interior whitespace within argument text is preserved — `pemit(%#,hello world)` is not changed.

---

## Benchmark mode

Profile softcode performance against a live server. Reports median, p95, and p99 latency per expression.

### Programmatic API

```typescript
import { RhostBenchmark, formatBenchResults } from '@rhost/testkit';

const bench = new RhostBenchmark(client);

bench
  .add('add(2,3)', { name: 'addition', iterations: 100, warmup: 10 })
  .add('iter(lnum(1,100),##)', { name: 'heavy iter', iterations: 50, warmup: 5 });

const results = await bench.run();
console.log(formatBenchResults(results));
```

Output:

```
Benchmark Results
────────────────────────────────────────────────────────────────────────
  addition
  iterations: 100  warmup: 10
  median: 4.231ms  mean: 4.512ms  p95: 7.820ms  p99: 12.003ms
  min: 3.901ms  max: 14.221ms

  heavy iter
  iterations: 50  warmup: 5
  median: 18.440ms  mean: 19.201ms  p95: 31.100ms  p99: 38.500ms
  min: 16.002ms  max: 41.300ms
────────────────────────────────────────────────────────────────────────
```

### `runBench` — single expression

```typescript
import { runBench } from '@rhost/testkit';

const result = await runBench(client, 'iter(lnum(1,1000),##)', {
  name: 'heavy iter',
  iterations: 100,
  warmup: 10,
});

console.log(`median: ${result.median.toFixed(2)}ms`);
console.log(`p95: ${result.p95.toFixed(2)}ms`);
```

### `BenchmarkResult` shape

```typescript
interface BenchmarkResult {
  name:       string;
  iterations: number;
  warmup:     number;
  samples:    number[];   // raw timings in ms, in run order
  mean:       number;
  median:     number;
  p95:        number;
  p99:        number;
  min:        number;
  max:        number;
}
```

---

## Watch mode

Re-run test files automatically on save.

```bash
# Auto-discover *.test.ts / *.spec.ts under the current directory
npx rhost-testkit watch

# Watch specific files
npx rhost-testkit watch src/__tests__/math.test.ts

# Options
npx rhost-testkit watch --debounce 500   # longer debounce (default: 300ms)
npx rhost-testkit watch --no-clear       # don't clear terminal between runs
```

TypeScript files are run with `ts-node --transpile-only`. Plain JS files are run with Node directly. Watch mode exits cleanly on Ctrl+C.

---

## CI/CD templates

Generate a ready-to-use workflow file for your CI platform with one command:

```bash
# GitHub Actions → .github/workflows/mush-tests.yml
npx rhost-testkit init --ci github

# GitLab CI → .gitlab-ci.yml
npx rhost-testkit init --ci gitlab

# Overwrite an existing file
npx rhost-testkit init --ci github --force
```

The generated file includes:
- Node.js 20 setup
- `npm ci` + `npm test`
- A commented-out block for optional integration tests against a `rhostmush/rhostmush` Docker container — uncomment and set `RHOST_PASS` in your secrets to enable

---

## MUSH output format

Understanding what `client.eval()` returns is essential for writing correct assertions.

### Normal results

| Softcode | Returns |
|----------|---------|
| `add(2,3)` | `'5'` |
| `strlen(hello)` | `'5'` |
| `lcstr(HELLO)` | `'hello'` |
| `list(a b c)` | `'a b c'` (space-delimited) |
| `lattr(#1)` | `'ALIAS MONIKER ...'` (space-delimited attribute names) |
| `encode64(hello)` | `'aGVsbG8='` |
| `create(Foo)` | `'#42'` (a dbref) |

### MUSH error codes

| Value | Meaning |
|-------|---------|
| `#-1` or `#-1 NO MATCH` | Generic error / object not found |
| `#-2` | Permission denied |
| `#-3` | Invalid arguments |

Use `isRhostError(result)` or `.toBeError()` to detect these.

### Multi-line output

`client.eval()` captures everything between the start and end sentinels and joins with `\n`. Most functions return a single line. `client.command()` returns an array of lines.

### ANSI codes

Color codes are stripped by default (`stripAnsi: true`). To preserve them, set `stripAnsi: false` in `RhostClientOptions`.

### Trailing whitespace

`client.eval()` trims trailing newlines. The `.toBe()` matcher trims both ends before comparing. Other matchers compare the raw (trimmed-newline-only) value.

---

## Using with LLM skills

This section describes the standard workflow for an LLM (such as a Claude skill) to write and verify MUSHcode using `@rhost/testkit`.

### Security considerations for LLM-generated code

When an LLM uses this SDK to generate and deploy softcode:

1. **Never auto-deploy from user input.** Generate softcode, present it for human review, then deploy.
2. **Always use environment variables for credentials.** Never hardcode passwords — not even the default.
3. **`world` methods are for test fixtures only.** Do not pass arbitrary end-user strings to `world.create()`, `world.set()`, etc. without review. The newline guard prevents command splitting, but not MUSH-level injection in values.
4. **`execscript()` runs shell code.** Never pass user-controlled strings as script names or arguments to `execscript()`.
5. **Use `paceMs`** to avoid flooding the server when generating many rapid eval calls.
6. **Telnet and the HTTP API are cleartext protocols.** Use them only on localhost or a private network.

```typescript
// ✗ UNSAFE — passes unreviewed user input to the server
const userInput = getUserInput();
await world.create(userInput);

// ✓ SAFE — validate, present for review, then act
if (!/^[A-Za-z0-9 _-]+$/.test(userInput)) throw new Error('Invalid object name');
console.log(`Deploying: create object "${userInput}" — review before proceeding`);
await world.create(userInput); // only after human approval
```

---

### The workflow

```
1. Deploy softcode to the MUSH server
   └─ Paste commands into the running container via scripts/eval.js
       node scripts/eval.js "@create MySystem"
       node scripts/eval.js "&CMD_DOSOMETHING #42=..."

2. Write a test file
   └─ Use RhostRunner + describe/it/expect

3. Run the tests
   └─ RHOST_PASS=<your-password> npx ts-node my-system.test.ts

4. Red → fix softcode → Green → refactor
```

### Minimal test file template

```typescript
import { RhostRunner } from '@rhost/testkit';

// Require explicit password — never fall back to a default
const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const runner = new RhostRunner();

runner.describe('MySystem', ({ it, beforeAll }) => {
    // Suppress background cron/queue output that can bleed into eval results.
    // @halt/all me clears any pending server-side queue for the logged-in character.
    beforeAll(async ({ client }) => {
        await client.command('@halt/all me');
    });

    // Test the happy path
    it('does the thing', async ({ expect }) => {
        // Replace #42 with the actual dbref of your system object
        await expect('u(#42/FN_MYTHING,arg1)').toBe('expected output');
    });

    // Test that bad input is handled correctly
    it('returns error on bad input', async ({ expect }) => {
        await expect('u(#42/FN_MYTHING,)').toBeError();
    });
});

runner
    .run({ host: 'localhost', port: 4201, username: 'Wizard', password: PASS, timeout: 10000 })
    .then((r) => {
        console.log(`${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped`);
        process.exit(r.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
        console.error('Fatal: could not connect to MUSH server:', err.message);
        process.exit(1);
    });
```

### Testing with object fixtures (world)

```typescript
runner.describe('stat system', ({ it }) => {
    it('sets and reads HP', async ({ world, client, expect }) => {
        // world is fresh per test and auto-cleaned after
        const char = await world.create('TestChar');
        await world.set(char, 'HP', '50');
        await world.set(char, 'HP_MAX', '100');

        // Load your system's UDFs onto the char or call via #dbref
        await expect(`u(#42/FN_GETHP,${char})`).toBe('50');
    });

    it('triggers a command', async ({ world, client }) => {
        const char = await world.create('TestChar');
        const lines = await world.trigger(char, 'CMD_ATTACK', 'goblin');
        if (!lines.some(l => l.includes('attacks'))) {
            throw new Error(`Expected attack output, got: ${JSON.stringify(lines)}`);
        }
    });
});
```

### Common patterns

**Test a user-defined function (UDF):**
```typescript
await expect(`u(#42/FN_GREET,Alice)`).toBe('Hello, Alice!');
```

**Test a command's output:**
```typescript
const lines = await client.command('+vote Alice');
// lines is string[] of all output until the sentinel
```

**Test that a command modifies an attribute:**
```typescript
const obj = await world.create('Target');
await client.command(`+setstat ${obj}=STR/18`);
await expect(`get(${obj}/STAT.STR)`).toBe('18');
```

**Test MUSH error handling:**
```typescript
await expect('u(#42/FN_DIVIDE,10,0)').toBeError();
await expect('u(#42/FN_DIVIDE,10,0)').toMatch(/#-1/);
```

**Test a list result:**
```typescript
await expect('iter(1 2 3,mul(##,2))').toBe('2 4 6');
await expect('lattr(#1)').toContainWord('ALIAS');
await expect('lattr(#1)').toHaveWordCount(5);
```

**Test numeric output:**
```typescript
await expect('add(0.1,0.2)').toBeCloseTo(0.3, 2);
await expect('sqrt(2)').toBeNumber();
```

**Suppress MUSH background output:**
```typescript
beforeAll(async ({ client }) => {
    await client.command('@halt/all me');
    await client.command('@pemit me=ready');
});
```

### Connecting to the Docker development server

```bash
# Start the server (from the repo root)
docker compose up --build -d

# Run tests (from sdk/) — set your own password
RHOST_PASS=<your-password> npx ts-node my-system.test.ts
```

### Running tests in a self-contained container (no pre-existing server)

```typescript
import { RhostRunner, RhostContainer } from '@rhost/testkit';

const container = RhostContainer.fromImage('rhostmush:latest'); // or fromSource()
const info = await container.start(); // waits until port 4201 is ready

// Deploy softcode using the scripts/eval.js tool first, or inline:
// const { execSync } = require('child_process');
// execSync(`node scripts/eval.js "@create MySystem" --host ${info.host} --port ${info.port}`);

const runner = new RhostRunner();
// ... add describe blocks ...

const result = await runner.run({ ...info, username: 'Wizard', password: process.env.RHOST_PASS! });
await container.stop();
```

---

## Environment variables

> **Security:** `RHOST_PASS` defaults to `Nyctasia`, which is public knowledge. Always set it explicitly — in any environment, including local dev. The examples in this README require it to be set; they will fail loudly if it is absent.

| Variable | Dev default | Description |
|----------|-------------|-------------|
| `RHOST_HOST` | `localhost` | Server hostname |
| `RHOST_PORT` | `4201` | Telnet port |
| `RHOST_USER` | `Wizard` | Login character name |
| `RHOST_PASS` | `Nyctasia` **(change this)** | Login password — always override explicitly |
| `RHOST_API_PORT` | `4202` | HTTP API port (examples 09–10) |

```bash
# Correct — explicit password
RHOST_PASS=my-secret-pass npx ts-node my-system.test.ts

# Wrong — relies on the public default
npx ts-node my-system.test.ts
```

---

## Examples

The [`examples/`](https://github.com/RhostMUSH/rhostmush-docker/tree/main/sdk/examples) directory contains runnable test files. Start a server first (`docker compose up --build -d` from the repo root), then:

```bash
cd sdk
npx ts-node examples/01-functions.ts
# or via npm:
npm run example:01
```

| File | What it covers |
|------|----------------|
| `01-functions.ts` | Math, strings, lists, control flow, type checks |
| `02-rhost-specific.ts` | encode64, digest, strdistance, soundex, localize |
| `03-attributes.ts` | Create objects, set/get attributes, flags, softcode |
| `04-triggers.ts` | @trigger: output capture, argument passing, chaining |
| `05-runner-features.ts` | it.skip, it.only, hooks, timeouts, RunResult |
| `06-game-system.ts` | End-to-end: stat system, modifiers, dice, character sheets |
| `07-direct-client.ts` | Low-level `RhostClient` without the runner |
| `08-execscript.ts` | Call shell/Python scripts from softcode via execscript() |
| `09-api.ts` | HTTP API: eval softcode over HTTP with Basic Auth |
| `10-lua.ts` | Embedded Lua via HTTP API |

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for full details and implementation notes.

### ✅ Shipped

| Version | Features |
|---------|----------|
| v0.2.0 | Offline validator · Watch mode · Snapshot testing |
| v1.0.0 | Extended world API · CI/CD templates |
| v1.1.0 | Server pre-flight assertions · Multi-persona test matrix · Side-effect assertion mode |
| v1.2.0 | Register clobber analyzer · Deploy pipeline with rollback · Dialect compatibility report |
| v1.3.0 | **Softcode formatter** (`rhost-testkit fmt`) · **Benchmark mode** (`RhostBenchmark`) |
| v1.4.0 | **PostgreSQL sidecar** (`docker-compose.yml`) · **`execscript` Jobs bridge** (`scripts/jobs_db.py`) · **`rhost.config.json`** custom scripts dir + mush config · `softcode/` directory |

### Planned

**Test coverage tracking** — report which attributes on which objects were exercised during a run.

**Interactive REPL** — persistent connection with readline history and tab-complete for built-in functions.

**Parallel test execution** — run independent `describe` blocks concurrently on separate connections.

**Recursion depth profiler** — track max call depth per expression, warn before hitting server recursion limits.

---

## License

MIT
