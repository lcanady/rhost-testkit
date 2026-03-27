# @rhost/testkit Roadmap

Features are ordered by priority. The top two items (offline validator and watch mode)
are implemented in v0.2.0. Everything below is planned.

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

## Planned

### ✅ Snapshot Testing (v0.3.0)

`await expect('iter(lnum(1,10),##)').toMatchSnapshot()`

- Stored in `__snapshots__/<testfile>.snap` JSON files, auto-located
- First run writes; subsequent runs compare with diff output on mismatch
- `RHOST_UPDATE_SNAPSHOTS=1` or `updateSnapshots: true` in options to refresh
- Obsolete snapshot detection with trimming on update
- Snapshot stats in run summary (passed / written / updated / obsolete)

---

### Extended World API

Close the remaining gaps in `RhostWorld`:

| Method | Command | Use case |
|---|---|---|
| `world.pemit(target, msg)` | `@pemit` | Test output delivery |
| `world.remit(room, msg)` | `@remit` | Test room broadcasts |
| `world.force(actor, cmd)` | `@force` | Test forced commands |
| `world.zone(name)` | `@dig` + `@set INHERIT_ZONE` | Zone-based inheritance |
| `world.parent(child, parent)` | `@parent` | Parent-chain testing |
| `world.property(dbref, prop, val)` | `@property` | `@property` wrappers |
| `world.addToChannel(dbref, chan)` | `@channel/add` | Channel membership |
| `world.grantQuota(dbref, n)` | `@quota` | Quota-limited creation tests |
| `world.wait(ticks)` | `@wait` | Test `@wait`-delayed behaviors |
| `world.mail(to, subj, body)` | `@mail` | Mail system tests |

---

### Benchmark Mode

Profile softcode performance against a live server:

```typescript
runner.bench('Heavy iter', async ({ client }) => {
  await client.eval('iter(lnum(1,1000),##)');
}, { iterations: 100, warmup: 10 });
```

- Reports median, p95, p99 latency per expression
- Compares before/after across runs (regression detection)
- No other MUSH tooling exists for this — unique to testkit

---

### CI/CD Templates

```
npx rhost-testkit init --ci github
npx rhost-testkit init --ci gitlab
```

- Generates `.github/workflows/mush-tests.yml` preconfigured to spin up the
  Docker container and run the test suite
- Lowers the barrier to "tests in CI" to near zero

---

### Interactive REPL

```
npx rhost-testkit repl [--host localhost] [--port 4201]
```

- Persistent MUSH connection with readline history
- Evaluate softcode expressions interactively
- Tab completion for known built-in function names
- Create/destroy test objects inline (same world API as tests)
- Faster than raw telnet; smarter than `think` in a MUSH client

---

### Softcode Formatter

```
npx rhost-testkit fmt mycode.mush
npx rhost-testkit fmt --check  # exit non-zero if not formatted
```

- Normalise spacing around `(`, `,`, `)`
- Indent nested function calls for readability
- Like Prettier, but for MUSH softcode
- Second major use case independent of testing

---

### Test Coverage Tracking

- Track which attributes on which objects were exercised during a run
- Produce a coverage report: tested vs. untested softcode attributes
- Similar to Istanbul/c8 for JavaScript
- Novel in the MUSH ecosystem

---

### Parallel Test Execution

- Run independent `describe` blocks concurrently on separate connections
- Connection-per-suite model fits naturally with the current architecture
- Significant speedup for large codebases with independent modules
- Complex to implement correctly (world cleanup, reporter ordering)
