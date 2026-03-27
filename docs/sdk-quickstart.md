# SDK Quick Start

Get from zero to a passing test suite in five minutes.

---

## Prerequisites

- Node.js 18+
- A running RhostMUSH server (see [server.md](server.md))

---

## 1. Install

```bash
cd sdk
npm install
```

---

## 2. Start a server

```bash
# From the repo root
docker compose up --build -d
```

The first build compiles RhostMUSH from source — allow 5-10 minutes. Subsequent starts are under 30 seconds.

Default credentials: **Wizard / Nyctasia**, port **4201**.

---

## 3. Write your first test

Create `my-tests.ts` anywhere:

```typescript
import { RhostRunner } from './sdk/src';

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

## 4. Use the built-in Jest integration

The SDK ships with a full Jest test suite. Run unit tests (no Docker required):

```bash
cd sdk
npm test
```

Run integration tests against a live container:

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
    // lines is a string[] of everything the trigger emitted
    console.log(lines); // ['42']
  });
});
```

---

## 6. Skip and focus tests

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
- [`examples/basic.ts`](../sdk/examples/basic.ts) — runnable example covering all major features
