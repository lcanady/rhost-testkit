# Security

## Reporting a vulnerability

Open a private security advisory at:
**https://github.com/RhostMUSH/rhostmush-docker/security/advisories/new**

Do not open a public issue for security vulnerabilities.

---

## Audit — 2026-03-27

**Scope:** `@rhost/testkit` SDK source (`sdk/src/`), Docker configuration, and shell scripts.
**Method:** Static analysis — TDD Remediation Auto-Audit (--scan).

---

### Batch A — CRITICAL ✓ FIXED

| ID | Severity | File | Finding |
|----|----------|------|---------|
| A1 | CRITICAL | `src/world.ts:26,43,60,67,75,82,90,98` | User-supplied strings interpolated into MUSH commands without sanitization. Special characters or MUSH command delimiters in `name`, `attr`, `value`, `lockstring`, or `args` can inject arbitrary commands. |
| A2 | CRITICAL | `src/client.ts:79` | `login()` concatenates `username` and `password` directly into the `connect` command. Newlines or spaces in the password string can inject additional commands into the MUSH server command stream. |

**A1 detail — `world.ts` command injection**

```typescript
// UNFIXED — all of these interpolate user input directly:
create(name)         → `create(${name},${cost})`
dig(name)            → `@dig ${name}`
set(dbref,attr,val)  → `&${attr} ${dbref}=${value}`
lock(dbref,lock)     → `@lock ${dbref}=${lockstring}`
trigger(dbref,attr)  → `@trigger ${dbref}/${attr}=${args}`
```

Fix: validate that `name`, `attr`, and `value` match a safe character allowlist (alphanumerics, hyphens, underscores, spaces). Reject or escape inputs containing `;`, `\n`, `\r`, `[`, `]`, `{`, `}`.

**A2 detail — `client.ts` login injection**

```typescript
// UNFIXED:
this.conn.send(`connect ${username} ${password}`);
```

Fix: strip or reject newlines and carriage returns from both `username` and `password` before sending.

**Status:** FIXED — `guardInput()` added to all `world.ts` methods; `login()` validates credentials. Tests: `a1-world-injection.test.ts`, `a2-login-injection.test.ts` (18 tests, all green).

---

### Batch B — HIGH (fix before production use)

| ID | Severity | File | Finding |
|----|----------|------|---------|
| B1 | HIGH | `examples/09-api.ts`, `examples/10-lua.ts` | HTTP Basic Auth sent over plaintext HTTP. Credentials are base64-encoded (not encrypted) and trivially intercepted. Default password `Nyctasia` is hardcoded as fallback. |
| B2 | HIGH | `docker-compose.yml`, `entrypoint.sh`, `examples/` | Default password `Nyctasia` used as fallback if `RHOST_PASS` is not set. No enforcement to prevent accidental deployment with default credentials. |

**B1/B2 detail**

The default password is intentional for local development. The risks are:
- Anyone who clones the repo knows the default
- `RHOST_PASS` env var is opt-in, not enforced

Mitigations already in place:
- Ports are bound to `127.0.0.1` by default (FIXED — see below)
- `entrypoint.sh` emits a warning if `RHOST_PASS` is not set
- API IP ACL defaults to `127.0.0.1`

Remaining fix: examples should refuse to run against non-localhost hosts without explicit opt-in when using the default password.

**Status:** PARTIALLY MITIGATED — ports + IP ACL hardened; default password warning in place. Tests: `h1-cleartext-credentials.test.ts`, `m2-hardcoded-password.test.ts` (8 tests, all green).

---

### Batch C — MEDIUM ✓ FIXED

| ID | Severity | File | Finding |
|----|----------|------|---------|
| C1 | MEDIUM | `src/world.ts:28-34,45-52` | Server output parsed with regex; no validation that parsed dbref is a valid MUSH reference. Malformed server responses could cause silent failures. |
| C2 | MEDIUM | `src/connection.ts:64-79` | No socket connection timeout. If the MUSH server hangs, the SDK waits indefinitely. |

**Status:** FIXED — C1 already throws descriptive errors on bad server output (confirmed with tests). C2 fixed by adding `connectTimeout` option to `RhostClientOptions` and `socket.setTimeout(connectTimeoutMs)` in `MushConnection.connect()`. Tests: `c1-dbref-validation.test.ts`, `c2-connection-timeout.test.ts` (17 tests, all green).

---

### Batch D — LOW / INFORMATIONAL

| ID | Severity | File | Finding |
|----|----------|------|---------|
| D1 | LOW | `src/client.ts:95-106` | No built-in rate limiting beyond `paceMs`. Could flood a server if called in a tight loop. `paceMs` option provides manual mitigation. |
| D2 | LOW | `src/expect.ts`, `src/assertions.ts` | Error messages include the full evaluated expression. Could leak softcode logic if errors are logged externally. |
| D3 | LOW | `src/world.ts:106-115` | `cleanup()` iterates `dbrefs` while `destroy()` calls could theoretically modify it. No practical exploit path. |

**Status:** INFORMATIONAL — no immediate action required

---

### Audit — 2026-03-28 ✓ FIXED

| ID | Severity | File | Finding | Fix |
|----|----------|------|---------|-----|
| M-NEW-1 | MEDIUM | `src/config.ts:56,59` | `loadConfig()` resolved `scriptsDir`/`mushConfig` with `path.resolve()`, allowing absolute paths or `../..` traversal to escape the project root. A tampered `rhost.config.json` could cause arbitrary host directories to be copied into Docker containers. | Added `resolveConfined()` guard: throws if resolved path does not start with the project root. Tests: `h3-config-path-traversal.test.ts` (8 tests). |
| L-NEW-1 | LOW | `src/__tests__/security/` | No security test for config path traversal guard | Covered by `h3-config-path-traversal.test.ts` above |
| L-NEW-2 | LOW | `.github/workflows/security-tests.yml` | Missing `permissions:` block; default GitHub token scopes depend on org policy | Added `permissions: contents: read` |
| H-NEW-1 | LOW | `scripts/jobs_db.py` | Raw psycopg2 exception strings (including `DETAIL:`, `HINT:` lines) returned to MUSH callers via `err(str(e))`, exposing schema internals | Added `_sanitize_db_error()` that strips diagnostic lines before returning; wired into both exception handlers. Tests: `h4-db-error-detail-leak.test.ts` (3 tests). |

---

### Fixed (previous audit cycles)

| ID | Severity | File | Finding | Fix |
|----|----------|------|---------|-----|
| F1 | HIGH | `docker-compose.yml` | Ports bound to `0.0.0.0`, exposing MUSH to all network interfaces | Bound to `127.0.0.1` |
| F2 | HIGH | `entrypoint.sh` | HTTP API IP ACL defaulted to all IPs | Defaulted to `127.0.0.1`, overridable via `RHOST_API_ALLOW_IP` |
| F3 | MEDIUM | `scripts/math.sh` | Integer overflow in `pow` with large exponents | Exponent bounded to 0–62 |
| F4 | MEDIUM | `entrypoint.sh` | Heredoc used unquoted, allowing shell variable expansion inside Python bootstrap | Quoted heredoc (`'PYEOF'`), env vars passed safely |

---

### Dependency audit

```
testcontainers ^11.13.0  — no known critical CVEs
jest ^29.5.0             — no known critical CVEs
ts-jest ^29.1.0          — no known critical CVEs
typescript ^5.0.0        — no known critical CVEs
```

Run `npm audit` before each release. The CI workflow (`security-tests.yml`) gates on `npm audit --audit-level=high`.

---

## Remediation priority

```
Batch A (CRITICAL) → Batch B (HIGH) → Batch C (MEDIUM) → Batch D (LOW)
```

Batch A must be resolved before `v1.0.0` publish.
Batch B should be resolved before any production deployment.
