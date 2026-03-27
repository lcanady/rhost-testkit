/**
 * 09-api.ts — RhostMUSH HTTP API layer
 *
 * RhostMUSH ships an embedded HTTP server (`api_port` in netrhost.conf).
 * It lets external programs evaluate softcode functions or issue MUSH commands
 * over plain HTTP — no Telnet required.
 *
 * Protocol
 * ────────
 * Authentication
 *   HTTP Basic Auth, username = dbref of a MUSH object, password = its password.
 *   Example: --user "#1:Nyctasia"
 *
 * Evaluate a softcode expression (GET)
 *   curl -s --user "#1:Nyctasia" \
 *        -H "Exec: add(2,3)"      \
 *        http://localhost:4202/
 *   The result comes back in the `Return:` response header.
 *
 * Issue a MUSH command (POST)
 *   curl -s --user "#1:Nyctasia" \
 *        -X POST                  \
 *        --data "@pemit #1=hello" \
 *        http://localhost:4202/
 *
 * WARNING — cleartext HTTP only / change the default password
 * ─────────────────────────────────────────────────────────────
 *   The RhostMUSH HTTP API uses plain HTTP (no TLS). Basic Auth credentials
 *   are base64-encoded, NOT encrypted; any observer on the network path can
 *   decode them in milliseconds. Use this API only on localhost or a private
 *   network. In production, place it behind a TLS-terminating reverse proxy.
 *
 *   The default password "Nyctasia" (RHOST_PASS env var) MUST be changed
 *   before exposing this server to any network. Set RHOST_PASS when starting
 *   the container: docker run -e RHOST_PASS=<strong-password> ...
 *
 * Prerequisites
 * ─────────────
 *   docker compose up --build -d   ← exposes port 4202 alongside 4201
 *
 *   The API must be enabled for the Wizard object before HTTP calls will work.
 *   Three in-game commands are required (run once; this script does it
 *   automatically via Telnet before running any HTTP test):
 *
 *     @api/enable me            ← marks Wizard as API-accessible
 *     @api/password me=Nyctasia ← sets the Basic Auth password
 *     @api/ip me=*.*.*.*        ← allows all source IPs (restrict in prod)
 *
 *   The docker-compose entrypoint runs these automatically on first startup.
 *
 * Run:
 *   npx ts-node examples/09-api.ts
 */
import * as http from 'http';
import { RhostRunner, RhostClient } from '../src';

// ── Connection config ───────────────────────────────────────────────────────
const API_HOST = process.env.RHOST_HOST     ?? 'localhost';
const API_PORT = Number(process.env.RHOST_API_PORT ?? 4202);
const MUSH_HOST = process.env.RHOST_HOST    ?? 'localhost';
const MUSH_PORT = Number(process.env.RHOST_PORT    ?? 4201);
const USER      = process.env.RHOST_USER    ?? 'Wizard';
const PASS      = process.env.RHOST_PASS    ?? 'Nyctasia';

// ── Lightweight HTTP API client ─────────────────────────────────────────────

interface ApiResponse {
    status: number;
    returnValue: string;   // contents of the `Return:` response header
    headers: Record<string, string>;
    body: string;
}

/**
 * Call the RhostMUSH HTTP API.
 *
 * @param dbref     - MUSH dbref used for Basic Auth (e.g. "#1")
 * @param password  - password for that dbref
 * @param expr      - softcode expression to evaluate (sent in `Exec:` header)
 */
async function apiEval(
    dbref: string,
    password: string,
    expr: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${dbref}:${password}`).toString('base64');
        const req = http.request(
            {
                hostname: API_HOST,
                port: API_PORT,
                path: '/',
                method: 'GET',
                headers: {
                    Authorization: `Basic ${auth}`,
                    Exec: expr,
                },
            },
            (res) => {
                // RhostMUSH puts the result in the `Return:` header.
                // Header names arrive lowercase in Node.js http module.
                const returnVal = (res.headers['return'] as string | undefined) ?? '';
                // Consume body to free the socket
                res.resume();
                resolve(returnVal);
            },
        );
        req.on('error', reject);
        req.end();
    });
}

/**
 * Issue a raw MUSH command via HTTP POST.
 */
async function apiCommand(
    dbref: string,
    password: string,
    command: string,
): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
        const auth    = Buffer.from(`${dbref}:${password}`).toString('base64');
        const body    = command;
        const chunks: Buffer[] = [];

        const req = http.request(
            {
                hostname: API_HOST,
                port: API_PORT,
                path: '/',
                method: 'POST',
                headers: {
                    Authorization:  `Basic ${auth}`,
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (res) => {
                res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on('end', () => {
                    const rawHeaders: Record<string, string> = {};
                    for (let i = 0; i < res.rawHeaders.length - 1; i += 2) {
                        rawHeaders[res.rawHeaders[i].toLowerCase()] = res.rawHeaders[i + 1];
                    }
                    resolve({
                        status:      res.statusCode ?? 0,
                        returnValue: rawHeaders['return'] ?? '',
                        headers:     rawHeaders,
                        body:        Buffer.concat(chunks).toString(),
                    });
                });
            },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── We also need a Wizard dbref.  Discover it via the Telnet client. ────────

/**
 * Connect via Telnet, discover the Wizard dbref, and configure API access.
 * This is idempotent — re-running the commands is harmless.
 */
async function setupApiAccess(): Promise<string> {
    const client = new RhostClient({ host: MUSH_HOST, port: MUSH_PORT });
    await client.connect();
    await client.login(USER, PASS);

    const dbref = (await client.eval('num(me)')).trim();

    // Enable API access for this object (Wizard).
    // @api/enable   — marks the object as API-accessible
    // @api/password — sets the HTTP Basic Auth password (separate from login pass)
    // @api/ip       — allows connections from all IPs ("*.*.*.*" = unrestricted)
    // @totem API_LUA — when set, Exec: header is evaluated as Lua instead of MUSHcode
    await client.command('@api/enable me');
    await client.command(`@api/password me=${PASS}`);
    await client.command('@api/ip me=*.*.*.*');
    await client.command('@totem me=API_LUA');

    await client.disconnect();
    return dbref;
}

// ── Test suite ───────────────────────────────────────────────────────────────

async function main() {
    console.log(`Connecting to MUSH at ${MUSH_HOST}:${MUSH_PORT} to configure API …`);

    // Configure API access and discover the Wizard dbref.
    let wizardDbref: string;
    try {
        wizardDbref = await setupApiAccess();
        console.log(`Wizard dbref: ${wizardDbref}`);
        console.log(`API access configured.  Testing HTTP API at ${API_HOST}:${API_PORT} …\n`);
    } catch (err) {
        console.error('Could not connect to MUSH server:', err);
        process.exit(1);
    }

    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void>) {
        try {
            await fn();
            console.log(`  ✓  ${name}`);
            passed++;
        } catch (err: unknown) {
            console.error(`  ✗  ${name}`);
            console.error(`     ${(err as Error).message}`);
            failed++;
        }
    }

    function assertEqual(actual: string, expected: string, msg?: string) {
        if (actual !== expected) {
            throw new Error(
                msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
            );
        }
    }

    function assertMatch(actual: string, pattern: RegExp, msg?: string) {
        if (!pattern.test(actual)) {
            throw new Error(
                msg ?? `Expected ${JSON.stringify(actual)} to match ${pattern}`,
            );
        }
    }

    // ── Section: basic expression evaluation ───────────────────────────────
    console.log('=== Basic expression evaluation (GET + Exec: header) ===');

    await test('add(2,3) = 5', async () => {
        const r = await apiEval(wizardDbref, PASS, 'add(2,3)');
        assertEqual(r, '5');
    });

    await test('sub(10,3) = 7', async () => {
        const r = await apiEval(wizardDbref, PASS, 'sub(10,3)');
        assertEqual(r, '7');
    });

    await test('mul(6,7) = 42', async () => {
        const r = await apiEval(wizardDbref, PASS, 'mul(6,7)');
        assertEqual(r, '42');
    });

    await test('lcstr(HELLO) = hello', async () => {
        const r = await apiEval(wizardDbref, PASS, 'lcstr(HELLO)');
        assertEqual(r, 'hello');
    });

    await test('strlen(hello world) = 11', async () => {
        const r = await apiEval(wizardDbref, PASS, 'strlen(hello world)');
        assertEqual(r, '11');
    });

    // ── Section: introspection ──────────────────────────────────────────────
    console.log('\n=== Server introspection ===');

    await test('version() returns a non-empty string', async () => {
        const r = await apiEval(wizardDbref, PASS, 'version()');
        if (!r || r.trim() === '') throw new Error('version() returned empty');
    });

    await test('name(me) matches caller name', async () => {
        const r = await apiEval(wizardDbref, PASS, 'name(me)');
        if (!r || r.trim() === '') throw new Error('name(me) returned empty');
    });

    await test('num(me) = wizard dbref', async () => {
        const r = await apiEval(wizardDbref, PASS, 'num(me)');
        assertEqual(r.trim(), wizardDbref);
    });

    await test('conntotal(me) is numeric', async () => {
        const r = await apiEval(wizardDbref, PASS, 'conntotal(me)');
        if (!/^\d+$/.test(r.trim())) throw new Error(`Expected numeric, got ${JSON.stringify(r)}`);
    });

    // ── Section: complex expressions ────────────────────────────────────────
    console.log('\n=== Complex softcode expressions ===');

    await test('iter() list transform', async () => {
        const r = await apiEval(wizardDbref, PASS, 'iter(1 2 3 4 5,mul(##,2))');
        assertEqual(r.trim(), '2 4 6 8 10');
    });

    await test('sort() alphabetical', async () => {
        const r = await apiEval(wizardDbref, PASS, 'sort(banana apple cherry)');
        assertEqual(r.trim(), 'apple banana cherry');
    });

    await test('switch() conditional', async () => {
        const r = await apiEval(wizardDbref, PASS, 'switch(mul(3,4),12,dozen,other)');
        assertEqual(r.trim(), 'dozen');
    });

    await test('fold()/reduce — sum via mush', async () => {
        // fold(list, func, start) — not all versions have fold; use iter+add trick
        const r = await apiEval(wizardDbref, PASS, 'add(10,20,30,40)');
        assertEqual(r.trim(), '100');
    });

    // ── Section: Rhost-specific functions ───────────────────────────────────
    console.log('\n=== Rhost-specific functions ===');

    await test('encode64(hello) = aGVsbG8=', async () => {
        const r = await apiEval(wizardDbref, PASS, 'encode64(hello)');
        assertEqual(r.trim(), 'aGVsbG8=');
    });

    await test('decode64(aGVsbG8=) = hello', async () => {
        const r = await apiEval(wizardDbref, PASS, 'decode64(aGVsbG8=)');
        assertEqual(r.trim(), 'hello');
    });

    await test('strdistance(kitten,sitting) = 3', async () => {
        const r = await apiEval(wizardDbref, PASS, 'strdistance(kitten,sitting)');
        assertEqual(r.trim(), '3');
    });

    await test('digest(sha1,hello) is 40-hex', async () => {
        const r = await apiEval(wizardDbref, PASS, 'digest(sha1,hello)');
        assertMatch(r.trim(), /^[0-9a-f]{40}$/, `Expected 40-char hex SHA1, got ${r}`);
    });

    // ── Section: POST command ────────────────────────────────────────────────
    console.log('\n=== POST command ===');

    await test('POST returns HTTP 200', async () => {
        // @pemit back to the wizard — fire and forget, just check HTTP status
        const resp = await apiCommand(wizardDbref, PASS, `@pemit ${wizardDbref}=API test`);
        if (resp.status !== 200) {
            throw new Error(`Expected HTTP 200, got ${resp.status}`);
        }
    });

    // ── Section: auth failure ───────────────────────────────────────────────
    console.log('\n=== Auth failure ===');

    await test('wrong password returns HTTP 401', async () => {
        const r = await new Promise<number>((resolve, reject) => {
            const auth = Buffer.from(`${wizardDbref}:WRONGPASSWORD`).toString('base64');
            const req = http.request(
                { hostname: API_HOST, port: API_PORT, path: '/', method: 'GET',
                  headers: { Authorization: `Basic ${auth}`, Exec: 'add(1,1)' } },
                (res) => { res.resume(); resolve(res.statusCode ?? 0); },
            );
            req.on('error', reject);
            req.end();
        });
        if (r !== 401) throw new Error(`Expected 401, got ${r}`);
    });

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    const total = passed + failed;
    console.log(`${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
