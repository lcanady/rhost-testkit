# Writing Tests

Patterns and techniques for testing real MUSHcode with the SDK.

---

## Anatomy of a test file

```typescript
import { RhostRunner } from '../sdk/src';

const runner = new RhostRunner();

// ---- Test suites go here ----

runner.run({
  username: 'Wizard',
  password: 'Nyctasia',
}).then((result) => process.exit(result.failed > 0 ? 1 : 0));
```

Run it:

```bash
npx ts-node my-softcode.test.ts
```

Or wire it into Jest's integration suite (`npm run test:integration`).

---

## Testing softcode functions

The simplest tests evaluate a softcode expression and check the result.

```typescript
runner.describe('encode/decode', ({ it }) => {
  it('encode64 round-trip', async ({ expect }) => {
    await expect('decode64(encode64(hello))').toBe('hello');
  });

  it('digest produces hex', async ({ expect }) => {
    await expect('digest(md5,hello)').toMatch(/^[0-9a-f]{32}$/i);
  });

  it('strdistance: identical strings => 0', async ({ expect }) => {
    await expect('strdistance(hello,hello)').toBe('0');
  });

  it('soundex groups similar sounds', async ({ expect }) => {
    await expect('soundex(Robert)').toBe(await /* inline compare */ 'R163');
    await expect('soundex(Rupert)').toBe('R163');
    await expect('soundex(Smith)').not.toBe('R163');
  });
});
```

### Checking numeric results

Use `.toBeNumber()` when you care that the result is a number but not the exact value:

```typescript
it('sqrt(2) is a number', async ({ expect }) => {
  await expect('sqrt(2)').toBeNumber();
});
```

Use `.toBeCloseTo()` for floating-point:

```typescript
it('pi()', async ({ expect }) => {
  await expect('pi()').toBeCloseTo(3.14159, 4);
});
```

### Checking error conditions

```typescript
runner.describe('Error handling', ({ it }) => {
  it('div by zero is an error', async ({ expect }) => {
    await expect('div(1,0)').toBeError();
  });

  it('unknown function is an error', async ({ expect }) => {
    await expect('totally_nonexistent_xyz()').toBeError();
  });

  it('valid call is NOT an error', async ({ expect }) => {
    await expect('add(2,3)').not.toBeError();
  });
});
```

---

## Testing object attributes

Use `RhostWorld` to create throwaway objects. The world is automatically destroyed after each test so fixtures never accumulate.

```typescript
runner.describe('Attributes', ({ it }) => {
  it('sets and reads back a plain attribute', async ({ expect, world }) => {
    const obj = await world.create('TestThing');
    await world.set(obj, 'MYATTR', 'hello');
    await expect(`get(${obj}/MYATTR)`).toBe('hello');
  });

  it('attribute survives a think eval', async ({ expect, world }) => {
    const obj = await world.create('DataStore');
    await world.set(obj, 'VALUE', '42');
    // Access it as a MUSH expression
    await expect(`get(${obj}/VALUE)`).toBeNumber();
    await expect(`add(get(${obj}/VALUE),8)`).toBe('50');
  });

  it('missing attribute returns empty string', async ({ expect, world }) => {
    const obj = await world.create('Empty');
    await expect(`get(${obj}/NOSUCHATTR)`).toBe('');
  });
});
```

### Shared fixtures across tests

If you need the same object in every test in a suite, create it in `beforeAll` and clean up in `afterAll`. Note that the `world` in `beforeAll` is **not** the per-test world — use a suite-level variable:

```typescript
runner.describe('Shared fixture', ({ it, beforeAll, afterAll }) => {
  let sharedObj: string;
  let suiteWorld: RhostWorld;

  beforeAll(async ({ client, world }) => {
    // Reuse the provided world — it won't auto-cleanup (we own it here)
    suiteWorld = world;
    sharedObj = await world.create('SharedHelper');
    await world.set(sharedObj, 'DOUBLE', 'think mul(%0,2)');
  });

  afterAll(async () => {
    await suiteWorld.cleanup();
  });

  it('doubles 5', async ({ expect }) => {
    const lines = await /* client */ new Promise<string[]>(async (res) => {
      // Use the client directly for commands that don't need expect()
      res([]); // placeholder — see trigger() below
    });
  });
});
```

For this pattern, `world.trigger()` is usually cleaner (see next section).

---

## Testing @trigger

`world.trigger(dbref, attr, args?)` sends `@trigger dbref/ATTR=args` and returns the output as a `string[]`. This lets you test any attribute that calls `@pemit %#=...` or `think ...`.

```typescript
runner.describe('@trigger patterns', ({ it }) => {
  it('think emits to enactor', async ({ world }) => {
    const obj = await world.create('Calculator');
    await world.set(obj, 'ADD', 'think add(%0,%1)');

    const lines = await world.trigger(obj, 'ADD', '3,4');
    // 'think' sends output directly to the enactor (us)
    expect(lines.join('')).toContain('7');  // JS assert on the captured lines
  });

  it('@pemit returns the string', async ({ world }) => {
    const obj = await world.create('Greeter');
    await world.set(obj, 'GREET', '@pemit %#=Hello, %n!');

    const lines = await world.trigger(obj, 'GREET');
    const output = lines.join('\n');
    expect(output).toContain('Hello,');
  });

  it('multiple args (%0, %1, %2)', async ({ world }) => {
    const obj = await world.create('Formatter');
    await world.set(obj, 'FMT', 'think [ucstr(%0)]-[lcstr(%1)]-[repeat(%2,3)]');

    const lines = await world.trigger(obj, 'FMT', 'hello,WORLD,x');
    expect(lines[0]).toBe('HELLO-world-xxx');
  });
});
```

> **Note:** `world.trigger()` uses the same sentinel mechanism as `client.command()`. Any output the triggered attribute sends to the enactor (via `think`, `@pemit %#`, etc.) will be captured. Output sent to other players or to the room (`@emit`, `@oemit`) is not captured.

---

## Testing flags and locks

```typescript
runner.describe('Flags', ({ it }) => {
  it('INHERIT flag allows nested function calls', async ({ expect, world }) => {
    const obj = await world.create('InheritTest');
    await world.flag(obj, 'INHERIT');
    // Now test softcode that depends on the flag...
    await expect(`hasflag(${obj},inherit)`).toBe('1');
  });

  it('clearing a flag', async ({ expect, world }) => {
    const obj = await world.create('FlagTest');
    await world.flag(obj, 'SAFE');
    await expect(`hasflag(${obj},safe)`).toBe('1');
    await world.flag(obj, 'SAFE', true);  // clear
    await expect(`hasflag(${obj},safe)`).toBe('0');
  });
});

runner.describe('Locks', ({ it }) => {
  it('@lock restricts access', async ({ expect, world }) => {
    const obj = await world.create('LockedThing');
    await world.lock(obj, 'me');   // lock to the Wizard
    await expect(`lock(${obj})`).not.toBe('');
  });
});
```

---

## Testing rooms and exits

Use `world.dig()` to create rooms:

```typescript
runner.describe('Rooms', ({ it }) => {
  it('digs a room and gets its name', async ({ expect, world }) => {
    const room = await world.dig('Test Chamber');
    await expect(`name(${room})`).toBe('Test Chamber');
  });

  it('room is type ROOM', async ({ expect, world }) => {
    const room = await world.dig('Another Room');
    await expect(`type(${room})`).toBe('ROOM');
  });
});
```

---

## Skip and only

### Skipping a test under development

```typescript
it.skip('not implemented yet', async ({ expect }) => {
  await expect('myfunc()').toBe('expected');
});
```

### Skipping a whole suite

```typescript
describe.skip('feature under construction', ({ it }) => {
  it('test 1', ...);
  it('test 2', ...);
});
```

### Focusing on a single test

When debugging a failure, add `.only` to the test you care about. All other tests in the suite are automatically skipped:

```typescript
runner.describe('Math', ({ it }) => {
  it('add()',  async ({ expect }) => expect('add(2,3)').toBe('5'));  // skipped

  it.only('mul() — debugging this', async ({ expect }) => {
    await expect('mul(6,7)').toBe('42');  // only this runs
  });

  it('div()',  async ({ expect }) => expect('div(10,2)').toBe('5')); // skipped
});
```

### Focusing on a suite

```typescript
runner.describe('Suite A', ({ it }) => { ... }); // skipped
runner.describe.only('Suite B', ({ it }) => { ... }); // only this runs
```

> **Note:** `.only` applies within the runner instance — it doesn't filter across separate `runner.run()` calls.

---

## Timeouts

The default per-test timeout is **15 seconds**. Pass a third argument to `it` to override:

```typescript
it('slow operation', async ({ expect }) => {
  await expect('some_expensive_func()').toBe('result');
}, 30000); // 30 seconds
```

If a test exceeds its timeout, it fails with:

```
✗ slow operation (30001ms)
    Test "slow operation" timed out after 30000ms
```

---

## Multi-step tests

Some softcode patterns require multiple round-trips — setting state, triggering code, then reading back results.

```typescript
runner.describe('State machine', ({ it }) => {
  it('counter increments on trigger', async ({ expect, world, client }) => {
    const obj = await world.create('Counter');
    // Attribute that increments an attribute on itself
    await world.set(obj, 'COUNT', '0');
    await world.set(obj, 'INC', `&COUNT %!=[add(get(%!/COUNT),1)]`);

    // Initial state
    await expect(`get(${obj}/COUNT)`).toBe('0');

    // Trigger the increment
    await world.trigger(obj, 'INC');
    await expect(`get(${obj}/COUNT)`).toBe('1');

    // Trigger again
    await world.trigger(obj, 'INC');
    await expect(`get(${obj}/COUNT)`).toBe('2');
  });
});
```

---

## Organising large test suites

### One file per system

```
tests/
├── math.test.ts
├── strings.test.ts
├── lists.test.ts
├── encoding.test.ts
└── mygame/
    ├── combat.test.ts
    ├── crafting.test.ts
    └── npc.test.ts
```

### Shared runner factory

```typescript
// tests/helpers.ts
import { RhostRunner, RunnerOptions } from '../sdk/src';

export const DEFAULT_OPTS: RunnerOptions = {
  username: 'Wizard',
  password: 'Nyctasia',
  host: process.env.RHOST_HOST ?? 'localhost',
  port: Number(process.env.RHOST_PORT ?? 4201),
};

export function makeRunner() {
  return new RhostRunner();
}
```

```typescript
// tests/math.test.ts
import { makeRunner, DEFAULT_OPTS } from './helpers';

const runner = makeRunner();

runner.describe('Math', ({ it }) => {
  it('add()', async ({ expect }) => expect('add(2,3)').toBe('5'));
});

runner.run(DEFAULT_OPTS).then((r) => process.exit(r.failed > 0 ? 1 : 0));
```

---

## Running in CI

### GitHub Actions example

```yaml
name: Softcode Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install SDK deps
        run: npm install
        working-directory: sdk

      - name: Unit tests (no Docker)
        run: npm test
        working-directory: sdk

      - name: Integration tests (builds RhostMUSH in Docker)
        run: npm run test:integration
        working-directory: sdk
        timeout-minutes: 30   # first build needs time
```

### Environment variables in CI

```yaml
env:
  RHOST_HOST: localhost
  RHOST_PORT: 4201
```

Or pass them directly to `runner.run()` from environment:

```typescript
runner.run({
  username: process.env.RHOST_USER ?? 'Wizard',
  password: process.env.RHOST_PASS ?? 'Nyctasia',
  host: process.env.RHOST_HOST ?? 'localhost',
  port: Number(process.env.RHOST_PORT ?? 4201),
});
```

---

## Asserting raw output

Sometimes you want to run a full command (not just evaluate a function) and inspect what gets emitted to the room or enactor. Use `client.command()` directly:

```typescript
it('look at a room', async ({ client }) => {
  const lines = await client.command('look here');
  const output = lines.join('\n');
  expect(output).toContain('Obvious exits');       // JS assert
  expect(output).not.toContain('undefined');
});
```

---

## Testing Rhost-specific features

### encode64 / decode64

```typescript
runner.describe('Base64', ({ it }) => {
  it('encode then decode', async ({ expect }) => {
    await expect('decode64(encode64(hello world))').toBe('hello world');
  });
  it('handles empty string', async ({ expect }) => {
    await expect('decode64(encode64())').toBe('');
  });
});
```

### localize()

`localize()` creates a scoped evaluation block where `%q` registers don't bleed out:

```typescript
runner.describe('localize()', ({ it }) => {
  it('inner changes do not affect outer registers', async ({ expect }) => {
    await expect('setq(0,outer)[localize(setq(0,inner)%q0)]%q0').toBe('innerouter');
  });

  it('nested localize scopes', async ({ expect }) => {
    await expect(
      'setq(0,A)[localize(setq(0,B)[localize(setq(0,C)%q0)]%q0)]%q0'
    ).toBe('CBA');
  });
});
```

### Clusters

```typescript
runner.describe('Clusters', ({ it }) => {
  it('cluster_set and cluster_get', async ({ expect }) => {
    await expect("cluster_set(testcluster,key,value)").not.toBeError();
    await expect("cluster_get(testcluster,key)").toBe('value');
  });
});
```

### SQL (if configured)

```typescript
runner.describe('SQLite', ({ it }) => {
  it('can run a query', async ({ expect }) => {
    await expect("sqlite_query(SELECT 1+1 AS n)").toContain('2');
  });
});
```

---

## Debugging tips

### See every server line

```typescript
const client = new RhostClient({ host: 'localhost', port: 4201 });
client.onLine((line) => console.log('[RAW]', line));
await client.connect();
```

### Inspect eval results directly

```typescript
const result = await client.eval('your_complex_expression()');
console.log(JSON.stringify(result));
```

### Use verbose mode

`verbose: true` (the default) prints ✓/✗/○ for every test as it runs. For deeply nested suites or CI, try `verbose: false` and only log failures:

```typescript
const result = await runner.run({ ..., verbose: false });
if (result.failed > 0) {
  for (const f of result.failures) {
    console.error(`FAIL [${f.suite}] ${f.test}`);
    console.error(f.error.message);
  }
}
```
