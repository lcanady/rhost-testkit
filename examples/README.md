# Examples

Each file is a standalone runnable test suite. Start a server first:

```bash
# From the repo root
docker compose up --build -d
```

Then run any example from the `sdk/` directory:

```bash
cd sdk
npx ts-node examples/01-functions.ts
# or via npm:
npm run example:01
```

To run all examples in sequence:

```bash
npm run examples
```

---

## Files

| File | What it covers |
|---|---|
| [`basic.ts`](basic.ts) | Quick tour: eval, RhostExpect, RhostWorld, RhostRunner |
| [`01-functions.ts`](01-functions.ts) | Built-in softcode functions: math, strings, lists, control flow, type checks, errors |
| [`02-rhost-specific.ts`](02-rhost-specific.ts) | Rhost-only features: encode64/decode64, digest, strdistance, soundex, localize, bang operators |
| [`03-attributes.ts`](03-attributes.ts) | Object fixtures: create, set, get, flags, softcode attributes, u(), multi-object interactions, rooms |
| [`04-triggers.ts`](04-triggers.ts) | @trigger: output capture, argument passing, side-effects, branching, trigger chains |
| [`05-runner-features.ts`](05-runner-features.ts) | RhostRunner API: nested describes, it.skip, it.only, describe.skip, hooks, timeouts, RunResult |
| [`06-game-system.ts`](06-game-system.ts) | End-to-end: a complete stat system with modifiers, labels, validation, character sheets, dice rolls |
| [`07-direct-client.ts`](07-direct-client.ts) | Low-level RhostClient: eval, command, onLine, RhostExpect and RhostWorld without the runner |
| [`08-execscript.ts`](08-execscript.ts) | **execscript**: call shell/Python scripts from softcode — arg passing, env vars, JSON, user context |
| [`09-api.ts`](09-api.ts) | **HTTP API layer**: evaluate softcode and run commands over HTTP with Basic Auth and `Exec:` header |
| [`10-lua.ts`](10-lua.ts) | **Embedded Lua via HTTP API**: set `API_LUA` totem → `Exec:` header runs Lua; `rhost.strfunc()`, `rhost.get()`, pattern matching, multi-statement scripts, 5 ms alarm |
| [`11-preflight.ts`](11-preflight.ts) | **Pre-flight assertions**: `preflight()`, `assertFunctionExists()`, `assertFunctionMissing()`, `assertConfigEquals()`, non-throwing mode |
| [`12-personas.ts`](12-personas.ts) | **Multi-persona test matrix**: `personas()` in SuiteContext — run the same test as mortal, builder, and wizard, with per-persona credential config |
| [`13-side-effects.ts`](13-side-effects.ts) | **World snapshots / side-effect detection**: `world.snapshot()`, `snap.assertNoChanges()`, `snap.diff()` — catch attribute adds, removes, and flag changes |
| [`14-validator-advanced.ts`](14-validator-advanced.ts) | **Offline validator** — register clobber detection (W006), dialect compatibility report (`compatibilityReport()`); no server required |
| [`15-deploy.ts`](15-deploy.ts) | **Deploy pipeline with rollback**: `parseDeployFile()`, `deploy()` with test callback, automatic rollback on failure; `--dry-run` mode needs no server |
| [`16-formatter.ts`](16-formatter.ts) | **Softcode formatter** (offline): compact mode, pretty-print with indentation, lowercase normalization, `changed` flag for CI lint |
| [`17-benchmark.ts`](17-benchmark.ts) | **Benchmark mode**: `runBench()` for single expressions, `RhostBenchmark` multi-suite builder, `formatBenchResults()`, raw sample analysis |

---

## Power features (examples 08–10)

These three examples showcase what sets RhostMUSH apart from other MUSH servers.
They require the full Docker container (scripts and ports baked in):

```bash
docker compose up --build -d
cd sdk
npm run examples:power
# or individually:
npm run example:08   # execscript
npm run example:09   # HTTP API
npm run example:10   # Lua
```

### execscript (`08-execscript.ts`)

> **Security:** `execscript()` runs shell executables with MUSH server privileges. Only use whitelisted, hardcoded script names. Never pass user-controlled strings as script names or arguments — doing so enables shell command injection.

RhostMUSH can call shell scripts (or any executable) from softcode. The scripts
live in `game/scripts/` and receive arguments as `MUSHQ_0`, `MUSHQ_1`, … env
vars. Stdout is returned as the softcode result.

```mushcode
; ✓ Hardcoded script name and sanitized args
execscript(math.sh,6,|,7,|,mul)          → 42
execscript(greet.py,Alice,|,es)          → Hola, Alice!
execscript(json_get.py,{"hp":42},|,hp)   → 42

; ✗ Never do this — user-controlled script or args = command injection
execscript(%0,%1)                         → UNSAFE
```

### HTTP API (`09-api.ts`)

> **Security:** The HTTP API uses Basic Auth over **plaintext HTTP** (`http://`). This is acceptable for localhost-only use. For any non-localhost deployment, use a TLS-terminating reverse proxy and `https://`. Never hardcode credentials — use `RHOST_PASS` env var.

RhostMUSH runs an embedded HTTP server on `api_port` (default 4202).
External programs can evaluate softcode or run commands over plain HTTP:

```bash
# ✓ localhost only — credentials travel only on the loopback interface
curl -s --user "#1:${RHOST_PASS}" -H "Exec: add(2,3)" http://localhost:4202/
# → Return: 5 (in response header)
```

The example uses only Node.js built-in `http` — no extra dependencies.

### Embedded Lua via HTTP API (`10-lua.ts`)
RhostMUSH embeds a full Lua interpreter accessible through the HTTP API.
Set the `API_LUA` totem on an object and its API requests run the `Exec:`
header as **Lua code** instead of MUSHcode:

```bash
# Without API_LUA — Exec: is MUSHcode:
curl -H "Exec: add(2,3)"             → Return: 5

# With API_LUA set — Exec: is Lua:
curl -H "Exec: return 2 + 3"                                    → Return: 5
curl -H "Exec: return rhost.strfunc('encode64','hello',',')"    → Return: aGVsbG8=
curl -H "Exec: return rhost.get('#1','ALIAS')"                  → Return: Wiz
curl -H "Exec: return string.match('abc123','%d+')"             → Return: 123
```

Available C-to-MUSH bridges inside Lua:
- `rhost.strfunc(fn, args, delim)` — call any MUSHcode function
- `rhost.get(dbref, attr)` — read an object attribute
- `rhost.parseansi(text)` — strip/parse ANSI sequences

**Full activation** (done automatically by the entrypoint on first startup):
```
@api/enable me             ← enable HTTP API for this object
@api/password me=<pass>    ← set Basic Auth password
@api/ip me=127.0.0.1       ← restrict to localhost (use * only behind a reverse proxy)
@totem me=API_LUA          ← switch Exec: evaluation to Lua mode
@power me=execscript       ← allow execscript() calls from softcode
```

---

## Offline examples (14, 16)

These examples require no server connection and run instantly:

```bash
npm run example:14   # validator: register clobber + dialect compat
npm run example:16   # softcode formatter

# or both at once:
npm run examples:offline
```

---

## v1.3.0 features (examples 11–17)

| Example | Requires server? |
|---|---|
| `11-preflight.ts` | Yes |
| `12-personas.ts` | Yes |
| `13-side-effects.ts` | Yes |
| `14-validator-advanced.ts` | **No** |
| `15-deploy.ts` | `--dry-run`: No / live: Yes |
| `16-formatter.ts` | **No** |
| `17-benchmark.ts` | Yes |

---

## Environment variables

> **Always set `RHOST_PASS` explicitly.** The default `Nyctasia` is public knowledge and should never be used on any server you care about.

All examples respect:

| Variable | Default | Description |
|---|---|---|
| `RHOST_HOST` | `localhost` | Server hostname |
| `RHOST_PORT` | `4201` | MUSH telnet port |
| `RHOST_USER` | `Wizard` | Login name |
| `RHOST_PASS` | `Nyctasia` **(always override)** | Login password |
| `RHOST_API_PORT` | `4202` | HTTP API port (examples 09) |

```bash
RHOST_HOST=myserver.example.com npm run example:01
```
