# @rhost/testkit Roadmap

Features are ranked by priority — highest value, lowest friction first.
Shipped items are marked ✅.

---

## ✅ v0.2.0 — Offline Validator + Watch Mode

**Offline Softcode Validator** (`validate`, `validateFile`, `rhost-testkit validate`)
- Tokenizer → Parser → Semantic checker pipeline, no server connection needed
- Catches unbalanced parens/brackets, unknown functions, wrong argument counts
- 150+ built-in function signatures with min/max arg counts
- CLI with human-readable and `--json` output; exit code 0/1

**Watch Mode** (`rhost-testkit watch`)
- Auto-discovers `*.test.ts` / `*.spec.ts` files
- Re-runs changed files on save with 300ms debounce
- Persistent terminal output with clear-between-runs
- Spawns `ts-node --transpile-only` for TypeScript test files

---

## ✅ v1.0.0 — Snapshot Testing + Extended World API + CI/CD Templates

**Snapshot Testing** — `await expect('iter(lnum(1,10),##)').toMatchSnapshot()`
- Stored in `__snapshots__/<testfile>.snap` JSON files, auto-located
- First run writes; subsequent runs compare with diff output on mismatch
- `RHOST_UPDATE_SNAPSHOTS=1` or `updateSnapshots: true` in options to refresh
- Obsolete snapshot detection with trimming on update

**Extended World API** — closes remaining gaps in `RhostWorld`:
`pemit` · `remit` · `force` · `parent` · `zone` · `addToChannel` · `grantQuota` · `wait` · `mail`

**CI/CD Templates** — `rhost-testkit init --ci github|gitlab`
- Generates `.github/workflows/mush-tests.yml` or `.gitlab-ci.yml`
- Lowers the barrier to "tests in CI" to near zero

---

## ✅ v1.1.0 — Tier 1 Features

### ✅ 1. Server Pre-flight Assertions

Verify the server's configuration matches what your softcode requires, before deploying or running tests. Especially valuable in CI where the target server may differ from dev.

```typescript
import { preflight } from '@rhost/testkit';

await preflight(client, [
  assertFunctionExists('json'),
  assertFunctionExists('lsearch'),
  assertServerFlag('FUNCTION_SIDE_EFFECTS', false),
  assertAttributeLimit(500),
]);
// Throws a summary error if any check fails — stops CI before tests run
```

- Zero new infrastructure — pure `client.eval()` calls
- Natural extension of the CI/CD templates just shipped
- Returns a structured report: passed / failed / skipped

---

### ✅ 2. Multi-Persona Test Matrix

The single biggest blind spot in MUSH testing: everyone tests as Wizard, so permission bugs are invisible. Define a test once and run it against multiple permission levels, asserting which outputs should match and which should differ.

```typescript
runner.describe('Room visibility', ({ personas }) => {
  personas(
    ['mortal', 'builder', 'wizard'],
    'hidden room is only visible to builders+',
    async ({ expect, persona }) => {
      if (persona === 'mortal') {
        await expect(`lsearch(me,type,room,eval,isvisible(%#,%#))`).toBe('0');
      } else {
        await expect(`lsearch(me,type,room,eval,isvisible(%#,%#))`).not.toBe('0');
      }
    }
  );
});
```

- Runner connects as each persona in sequence using separate credentials
- Clearly marks which permission level a failure occurred at
- No other MUSH tool — including PennMUSH's `kilt` — does this
- Source: documented as the #1 class of bugs missed in wizard-only testing

---

### ✅ 3. Side-Effect Assertion Mode

MUSHcode's "function side effects" feature means calling a function for its return value can secretly create objects, write attributes, or emit to players. Tests today only check return values. This catches the invisible class.

```typescript
it('add() has no side effects', async ({ expect }) => {
  await expect('add(2,3)')
    .toBe('5')
    .withNoSideEffects();  // fails if any object was created/modified
});

it('this attr must only emit to enactor', async ({ expect, world }) => {
  const obj = await world.create('Greeter');
  await world.set(obj, 'GREET', '@pemit %#=hello');
  await expect.sideEffects(async () => {
    await world.trigger(obj, 'GREET');
  }).toOnlyEmitTo('me');
});
```

- Implemented by snapshotting world state (dbrefs + attributes) before/after eval
- `world` already tracks creation — extend to also track attribute writes
- Analogous to Jest's `expect(fn).not.toHaveBeenCalled()` spy assertions
- Source: described as "Satan's spawn" in MUSH security community

---

## ✅ v1.2.0 — Tier 2 Features

### ✅ 4. Register Clobber / Re-entrancy Analyzer

`%q0`–`%q9` registers are scoped per queue entry. Attributes called inside `iter()`, `@dolist`, or recursive `@trigger` chains that also write registers can silently clobber each other — the softcode equivalent of a race condition. This is a static analysis pass in the offline validator.

```
$ rhost-testkit validate --file combat.mush

WARNING: register clobber risk
  COMBAT_ROLL writes %q0 and is called inside iter() at line 14.
  Concurrent invocations will overwrite each other's %q0.
  Consider wrapping in localize().
```

- Pure static analysis — no server needed
- Extends the existing semantic checker
- Source: documented in practical-mush-coding guides as a frequent silent bug

---

### ✅ 5. Deploy Pipeline with Rollback

The current softcode deployment workflow is manual paste-and-pray with no rollback. This addresses it directly.

```bash
npx rhost-testkit deploy --file mycode.mush --target '#42' --test
```

1. **Snapshot** — `@decomp` all target objects, store attribute state
2. **Upload** — apply the softcode file to the target object(s)
3. **Test** — run the test suite
4. **Rollback** — if tests fail, restore every attribute to pre-deploy state atomically

- Source: Faraday (AresMUSH creator) cited explicitly: *"when something breaks, the players are immediately affected — there's no form of revision history"*
- Highest real-world operational impact of anything on this list
- Most complex to implement correctly (ordering, partial failure, `@decomp` parsing)

---

### ✅ 6. Dialect Compatibility Report

PennMUSH 1.8.5 is compatible with 359 community softcode files; RhostMUSH 3.9.4 with only 119. Developers sharing code across servers have no way to know which functions are portable. Given a softcode file, emit a compatibility report.

```bash
$ rhost-testkit validate --compat mycode.mush

DIALECT COMPATIBILITY
  ✓ add, sub, mul, div          — all platforms
  ✓ iter, lnum, sort            — all platforms
  ⚠ localize()                  — RhostMUSH, PennMUSH only (not TinyMUX)
  ✗ json(), jsonquery()         — RhostMUSH only
  ✗ cluster_set(), cluster_get() — RhostMUSH only
```

- The function signature table already exists in the validator — add a `platforms` field per function
- Community-wide value: like a browser-compat table for softcode
- Source: documented cross-platform portability failures across PennMUSH/TinyMUX/Rhost

---

## ✅ v1.3.0 — Tier 3 Features (Batch 1)

### ✅ 7. Benchmark Mode

Profile softcode performance against a live server:

```typescript
runner.bench('Heavy iter', async ({ client }) => {
  await client.eval('iter(lnum(1,1000),##)');
}, { iterations: 100, warmup: 10 });
```

- Reports median, p95, p99 latency per expression
- Compares before/after across runs (regression detection)
- **Recursion depth profiler** (extension): track max call depth reached, warn when approaching server limits — gives context to opaque `#-1 FUNCTION RECURSION LIMIT` errors
- No other MUSH tooling exists for this

---

### ✅ 8. Softcode Formatter

```bash
npx rhost-testkit fmt mycode.mush
npx rhost-testkit fmt --check  # exit non-zero if not formatted
```

- Normalise spacing around `(`, `,`, `)`
- Indent nested function calls for readability
- Like Prettier, but for MUSH softcode

---

## Planned — Tier 3 (Remaining)

### 9. Test Coverage Tracking

- Track which attributes on which objects were exercised during a run
- Produce a coverage report: tested vs. untested softcode attributes
- Similar to Istanbul/c8 for JavaScript
- Novel in the MUSH ecosystem

---

### 10. Interactive REPL

```bash
npx rhost-testkit repl [--host localhost] [--port 4201]
```

- Persistent MUSH connection with readline history
- Tab completion for known built-in function names
- Full world API available inline (create/destroy objects, set attributes)
- Faster than raw telnet; smarter than `think` in a MUSH client

---

### 11. Parallel Test Execution

- Run independent `describe` blocks concurrently on separate connections
- Connection-per-suite model fits naturally with the current architecture
- Significant speedup for large codebases with independent modules
- Complex to implement correctly (world cleanup, reporter ordering)
