# SDK Quick Start

Get from zero to a passing test suite in five minutes.

---

## Prerequisites

- Node.js 18+
- A running RhostMUSH server (see [server.md](server.md))

---

## 1. Install

```bash
npm install @rhost/testkit
```

---

## 2. Start a server

### Option A — Docker (recommended for integration tests)

```bash
docker run -d -p 4201:4201 rhostmush/rhostmush
```

The image starts in seconds. Default credentials: **Wizard / Nyctasia**, port **4201**.

### Option B — Use testcontainers (automated, no manual Docker)

```typescript
import { RhostContainer } from '@rhost/testkit';

const container = RhostContainer.fromImage();
const { host, port } = await container.start();
// Connect your runner to { host, port }
```

---

## 3. Write your first test

Create `my-tests.ts` anywhere:

```typescript
import { RhostRunner } from '@rhost/testkit';

const runner = new RhostRunner();

runner.describe('Math', ({ it }) => {
  it('add()', async ({ expect }) => {
    await expect('add(2,3)').toBe('5');
  });

  it('mul()', async ({ expect }) => {
    await expect('mul(6,7)').toBe('42');
  });
});

runner.describe('Strings', ({ it }) => {
  it('lcstr()', async ({ expect }) => {
    await expect('lcstr(HELLO)').toBe('hello');
  });

  it('reverse()', async ({ expect }) => {
    await expect('reverse(hello)').toBe('olleh');
  });
});

runner.run({
  username: 'Wizard',
  password: 'Nyctasia',
}).then((result) => {
  process.exit(result.failed > 0 ? 1 : 0);
});
```

Run it:

```bash
npx ts-node my-tests.ts
```

Output:

```
  Math
    ✓ add() (4ms)
    ✓ mul() (3ms)

  Strings
    ✓ lcstr() (3ms)
    ✓ reverse() (3ms)

Tests: 4 passed, 0 failed, 4 total (52ms)
```

---

## 4. Run the built-in test suite

Unit tests (no Docker required):

```bash
npm test
```

Integration tests against a live container:

```bash
npm run test:integration
```

---

## 5. Test object fixtures

Use `world` to create and clean up in-game objects inside tests:

```typescript
runner.describe('Attributes', ({ it }) => {
  it('set and get an attribute', async ({ expect, world }) => {
    const obj = await world.create('TestObj');
    await world.set(obj, 'MYATTR', 'hello world');
    await expect(`get(${obj}/MYATTR)`).toBe('hello world');
    // world is automatically destroyed after the test
  });

  it('trigger an attribute', async ({ expect, world }) => {
    const obj = await world.create('Calculator');
    await world.set(obj, 'ADD', 'think add(%0,%1)');
    const lines = await world.trigger(obj, 'ADD', '10,32');
    console.log(lines); // ['42']
  });
});
```

---

## 6. Snapshot testing

On the first run, `toMatchSnapshot()` writes the result to a `.snap` file. On subsequent runs it compares against the stored value.

```typescript
it('iter output', async ({ expect }) => {
  await expect('iter(lnum(1,5),##)').toMatchSnapshot();
});
```

To refresh stored snapshots:

```bash
RHOST_UPDATE_SNAPSHOTS=1 npx ts-node my-tests.ts
```

---

## 7. Validate softcode offline

No server needed:

```bash
# Validate an expression
npx rhost-testkit validate "add(2,3)"

# Validate a file
npx rhost-testkit validate --file mycode.mush
```

---

## 8. Watch mode

Re-run tests on save:

```bash
npx rhost-testkit watch
```

---

## 9. Generate CI/CD templates

```bash
# GitHub Actions
npx rhost-testkit init --ci github

# GitLab CI
npx rhost-testkit init --ci gitlab
```

---

## 10. Format softcode

Strip extra whitespace around delimiters:

```bash
# Format in-place
npx rhost-testkit fmt mycode.mush

# Check without writing (exit 1 if unformatted — useful in CI)
npx rhost-testkit fmt --check mycode.mush
```

Or from TypeScript:

```typescript
import { format } from '@rhost/testkit';

const result = format('add( 2, 3 )');
// result.formatted => 'add(2,3)'
// result.changed   => true
```

---

## 11. Benchmark softcode

Measure median / p95 / p99 latency for expressions:

```typescript
import { RhostBenchmark, formatBenchResults } from '@rhost/testkit';

const bench = new RhostBenchmark(client);
bench
  .add('add(2,3)', { name: 'simple add', iterations: 100 })
  .add('iter(lnum(1,100),##)', { name: 'heavy iter', iterations: 50 });

const results = await bench.run();
console.log(formatBenchResults(results));
```

---

## 12. Skip and focus tests

```typescript
runner.describe('Suite', ({ it }) => {
  it('runs normally', async ({ expect }) => {
    await expect('add(1,1)').toBe('2');
  });

  it.skip('not ready yet', async ({ expect }) => {
    // Won't run — shows as ○ skipped in output
  });

  it.only('focus on this one', async ({ expect }) => {
    // When .only is present, all other tests in this suite are skipped
    await expect('mul(3,3)').toBe('9');
  });
});
```

---

## Next steps

- [SDK Reference](sdk-reference.md) — complete API documentation
- [Writing Tests](writing-tests.md) — patterns for real-world softcode testing
- [`examples/basic.ts`](../examples/basic.ts) — runnable example covering all major features
