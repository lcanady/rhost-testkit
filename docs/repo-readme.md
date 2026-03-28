# @rhost/testkit

A TypeScript SDK for testing MUSHcode — the closest thing to Jest for softcode development.

```
rhost-testkit/
├── src/
│   ├── client.ts      RhostClient  — TCP connection, eval, command, preview
│   ├── world.ts       RhostWorld   — object fixture manager
│   ├── runner.ts      RhostRunner  — describe/it/skip/only test runner
│   ├── expect.ts      RhostExpect  — Jest-like assertions for MUSHcode
│   ├── snapshots.ts   SnapshotManager — snapshot read/write/diff
│   ├── container.ts   RhostContainer  — testcontainers integration
│   └── cli/
│       ├── index.ts   CLI entry point
│       ├── validate.ts  rhost-testkit validate
│       ├── watch.ts     rhost-testkit watch
│       └── init.ts      rhost-testkit init
└── src/validator/     Offline softcode validator (no server needed)
```

## Documentation

| Topic | File |
|---|---|
| SDK quick start | [docs/sdk-quickstart.md](docs/sdk-quickstart.md) |
| Full SDK reference | [docs/sdk-reference.md](docs/sdk-reference.md) |
| Writing tests | [docs/writing-tests.md](docs/writing-tests.md) |

## Quick start

```bash
npm install @rhost/testkit
```

```typescript
import { RhostRunner } from '@rhost/testkit';

const runner = new RhostRunner();

runner.describe('Math', ({ it }) => {
  it('add()', async ({ expect }) => {
    await expect('add(2,3)').toBe('5');
  });
});

runner.run({ username: 'Wizard', password: 'Nyctasia' })
  .then((r) => process.exit(r.failed > 0 ? 1 : 0));
```

## CLI commands

```bash
# Validate softcode offline (no server needed)
npx rhost-testkit validate "add(2,3)"
npx rhost-testkit validate --file mycode.mush

# Watch test files and re-run on save
npx rhost-testkit watch

# Generate CI/CD workflow files
npx rhost-testkit init --ci github
npx rhost-testkit init --ci gitlab
```
