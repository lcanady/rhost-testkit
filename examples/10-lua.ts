/**
 * 10-lua.ts — RhostMUSH Lua: embedded scripting through the HTTP API
 *
 * RhostMUSH embeds a full Lua 5.x interpreter that is exposed through the
 * HTTP API layer.  When the `API_LUA` totem is set on an object, HTTP
 * requests authenticated as that object run their `Exec:` header as *Lua
 * code* instead of MUSHcode.
 *
 * Inside those Lua scripts, three C-bridged functions reach back into MUSH:
 *
 *   rhost.get(dbref, attr)           — read an object attribute
 *   rhost.strfunc(fn, args, delim)   — call any MUSHcode function
 *   rhost.parseansi(text)            — strip/parse ANSI sequences
 *
 * Security / WARNING — cleartext HTTP / change the default password
 * ──────────────────────────────────────────────────────────────────
 *   The RhostMUSH HTTP API uses plain HTTP (no TLS). Basic Auth credentials
 *   are base64-encoded, NOT encrypted; any observer on the network path can
 *   decode them in milliseconds. Use this API only on localhost or a private
 *   network. In production, place it behind a TLS-terminating reverse proxy.
 *
 *   The default password "Nyctasia" (RHOST_PASS env var) MUST be changed
 *   before exposing this server to any network.
 *
 *   Dangerous Lua functions are removed: assert, collectgarbage, load,
 *   loadfile, print (use io.write instead).
 *   A 5 ms execution alarm terminates runaway scripts.
 *
 * Setup (done automatically by the entrypoint on first startup)
 * ─────
 *   @api/enable me              — enable HTTP API for this object
 *   @api/password me=<pass>     — set Basic Auth password
 *   @api/ip me=127.0.0.1        — allow source IPs (default: localhost only)
 *                                 Set RHOST_API_ALLOW_IP=*.*.*.* to widen;
 *                                 restrict in production behind a TLS proxy.
 *   @totem me=API_LUA           — switch Exec: evaluation to Lua mode
 *
 * Wire format
 * ───────────
 *   GET http://localhost:4202/
 *     Authorization: Basic <base64(#dbref:password)>
 *     Exec: return rhost.strfunc("add","2,3",",")
 *   → Return: 5          (in response header)
 *
 * Prerequisites
 * ─────────────
 *   docker compose up --build -d
 *
 * Run:
 *   npx ts-node examples/10-lua.ts
 */
import * as http from 'http';
import { RhostClient } from '../src';

// ── Connection config ───────────────────────────────────────────────────────
const API_HOST  = process.env.RHOST_HOST     ?? 'localhost';
const API_PORT  = Number(process.env.RHOST_API_PORT ?? 4202);
const MUSH_HOST = process.env.RHOST_HOST     ?? 'localhost';
const MUSH_PORT = Number(process.env.RHOST_PORT    ?? 4201);
const USER      = process.env.RHOST_USER     ?? 'Wizard';
const PASS      = process.env.RHOST_PASS     ?? 'Nyctasia';

// ── Setup: enable API + API_LUA totem for Wizard ────────────────────────────

async function setup(): Promise<string> {
    const client = new RhostClient({ host: MUSH_HOST, port: MUSH_PORT });
    await client.connect();
    await client.login(USER, PASS);

    const dbref = (await client.eval('num(me)')).trim();

    await client.command('@api/enable me');
    await client.command(`@api/password me=${PASS}`);
    await client.command('@api/ip me=*.*.*.*');
    await client.command('@totem me=API_LUA');   // ← enables Lua mode for API requests

    await client.disconnect();
    return dbref;
}

// ── Lua HTTP API client ─────────────────────────────────────────────────────
// With API_LUA set, the Exec: header is evaluated as Lua code.
// The result of the last `return` statement becomes the Return: header value.

async function lua(dbref: string, code: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${dbref}:${PASS}`).toString('base64');
        const req = http.request(
            {
                hostname: API_HOST,
                port:     API_PORT,
                path:     '/',
                method:   'GET',
                headers: {
                    Authorization: `Basic ${auth}`,
                    Exec: code,
                },
            },
            (res) => {
                const val = (res.headers['return'] as string | undefined) ?? '';
                res.resume();
                resolve(val);
            },
        );
        req.on('error', reject);
        req.end();
    });
}

// Also need a MUSH-mode client (without API_LUA) for setting up attributes.
// We create a second Wizard object flagged without API_LUA for MUSH eval.
async function mushEval(expr: string): Promise<string> {
    const client = new RhostClient({ host: MUSH_HOST, port: MUSH_PORT });
    await client.connect();
    await client.login(USER, PASS);
    const result = await client.eval(expr);
    await client.disconnect();
    return result.trim();
}

async function mushCmd(...cmds: string[]): Promise<void> {
    const client = new RhostClient({ host: MUSH_HOST, port: MUSH_PORT });
    await client.connect();
    await client.login(USER, PASS);
    for (const cmd of cmds) await client.command(cmd);
    await client.disconnect();
}

// ── Test harness ─────────────────────────────────────────────────────────────

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

function expect(actual: string) {
    return {
        toBe(expected: string) {
            if (actual !== expected)
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        },
        toContain(sub: string) {
            if (!actual.includes(sub))
                throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(sub)}`);
        },
        toMatch(re: RegExp) {
            if (!re.test(actual))
                throw new Error(`Expected ${JSON.stringify(actual)} to match ${re}`);
        },
        toStartWith(prefix: string) {
            if (!actual.startsWith(prefix))
                throw new Error(`Expected ${JSON.stringify(actual)} to start with ${JSON.stringify(prefix)}`);
        },
        toBeCloseTo(n: number, digits = 2) {
            const v = Number(actual);
            if (isNaN(v)) throw new Error(`Expected a number, got ${JSON.stringify(actual)}`);
            const delta = Math.pow(10, -digits) / 2;
            if (Math.abs(v - n) >= delta)
                throw new Error(`Expected ~${n} (±${delta}), got ${v}`);
        },
    };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('Setting up API_LUA access for Wizard …');
    let wizDbref: string;
    try {
        wizDbref = await setup();
        console.log(`Wizard dbref: ${wizDbref}  (API_LUA totem set)`);
        console.log(`Lua API at http://${API_HOST}:${API_PORT}/\n`);
    } catch (err) {
        console.error('Setup failed:', err);
        process.exit(1);
    }

    // ── 1. Pure Lua arithmetic ───────────────────────────────────────────────
    console.log('=== Pure Lua arithmetic ===');

    await test('integer addition', async () => {
        expect(await lua(wizDbref, 'return 2 + 2')).toBe('4');
    });

    await test('multiplication', async () => {
        expect(await lua(wizDbref, 'return 6 * 7')).toBe('42');
    });

    await test('real float division (unlike MUSH div() which truncates)', async () => {
        expect(await lua(wizDbref, 'return 10 / 4')).toBeCloseTo(2.5, 1);
    });

    await test('math.sqrt()', async () => {
        expect(await lua(wizDbref, 'return math.sqrt(144)')).toBe('12.0');
    });

    await test('math.floor()', async () => {
        expect(await lua(wizDbref, 'return math.floor(3.9)')).toBe('3');
    });

    await test('exponentiation ^', async () => {
        expect(await lua(wizDbref, 'return 2 ^ 10')).toBe('1024.0');
    });

    // ── 2. Lua string operations ─────────────────────────────────────────────
    console.log('\n=== Lua string library ===');

    await test('string.upper()', async () => {
        expect(await lua(wizDbref, 'return string.upper("hello")')).toBe('HELLO');
    });

    await test('string.rep()', async () => {
        expect(await lua(wizDbref, 'return string.rep("ab", 3)')).toBe('ababab');
    });

    await test('string.reverse()', async () => {
        expect(await lua(wizDbref, 'return string.reverse("racecar")')).toBe('racecar');
    });

    await test('string.format() — zero-padded number', async () => {
        expect(await lua(wizDbref, 'return string.format("%05d", 42)')).toBe('00042');
    });

    await test('string.gsub() — replace all', async () => {
        const result = await lua(wizDbref, 'return (string.gsub("foo bar foo", "foo", "baz"))');
        expect(result).toBe('baz bar baz');
    });

    await test('Lua pattern match — extract digits', async () => {
        expect(await lua(wizDbref, 'return string.match("abc123def", "%d+")')).toBe('123');
    });

    await test('string concatenation ..', async () => {
        expect(await lua(wizDbref, 'return "Hello" .. ", " .. "World!"')).toBe('Hello, World!');
    });

    // ── 3. Lua table operations ──────────────────────────────────────────────
    console.log('\n=== Lua tables ===');

    await test('table.concat() — join to string', async () => {
        expect(await lua(wizDbref, 'return table.concat({"a","b","c"}, ",")')).toBe('a,b,c');
    });

    await test('table.sort() — numeric', async () => {
        expect(await lua(wizDbref,
            'local t = {3,1,4,1,5,9}; table.sort(t); return table.concat(t," ")'
        )).toBe('1 1 3 4 5 9');
    });

    await test('# operator — table length', async () => {
        expect(await lua(wizDbref, 'return #{10,20,30,40,50}')).toBe('5');
    });

    await test('ipairs loop — sum', async () => {
        expect(await lua(wizDbref,
            'local sum=0; for _,v in ipairs({1,2,3,4,5}) do sum=sum+v end; return sum'
        )).toBe('15');
    });

    // ── 4. rhost.strfunc() — call MUSHcode from inside Lua ──────────────────
    console.log('\n=== rhost.strfunc(): Lua → MUSHcode ===');

    await test('add(2,3) via rhost.strfunc', async () => {
        expect(await lua(wizDbref,
            'return rhost.strfunc("add","2,3",",")'
        )).toBe('5');
    });

    await test('encode64(hello) via rhost.strfunc', async () => {
        expect(await lua(wizDbref,
            'return rhost.strfunc("encode64","hello",",")'
        )).toBe('aGVsbG8=');
    });

    await test('digest(sha1,hello) via rhost.strfunc — 40-char hex', async () => {
        const r = await lua(wizDbref,
            'return rhost.strfunc("digest","sha1,hello",",")'
        );
        expect(r).toMatch(/^[0-9a-f]{40}$/);
    });

    await test('sort() a Lua-built list via rhost.strfunc', async () => {
        expect(await lua(wizDbref,
            'local words = table.concat({"cherry","apple","banana"}," ");' +
            'return rhost.strfunc("sort", words, " ")'
        )).toBe('apple banana cherry');
    });

    await test('Lua computes; MUSH formats the result', async () => {
        // Lua sums 1..10, then rhost.strfunc wraps it
        expect(await lua(wizDbref,
            'local sum=0; for i=1,10 do sum=sum+i end;' +
            'return rhost.strfunc("add", tostring(sum) .. ",0", ",")'
        )).toBe('55');
    });

    // ── 5. rhost.get() — read MUSH object attributes from Lua ───────────────
    console.log('\n=== rhost.get(): Lua reads MUSH attributes ===');

    // Create a test object with some attributes via Telnet, then read from Lua
    let testDbref = '';
    try {
        testDbref = await mushEval('think create(LuaTestObj)');
        await mushCmd(
            `&GREETING ${testDbref}=Hello from MUSH!`,
            `&HP ${testDbref}=42`,
            `&CLASS ${testDbref}=Warrior`,
        );
    } catch (err) {
        console.error('  ! Could not create test object:', err);
    }

    if (testDbref) {
        await test('rhost.get() reads a string attribute', async () => {
            expect(await lua(wizDbref,
                `return rhost.get("${testDbref}", "GREETING")`
            )).toBe('Hello from MUSH!');
        });

        await test('rhost.get() reads a numeric attribute and uses it in Lua math', async () => {
            expect(await lua(wizDbref,
                `local hp = tonumber(rhost.get("${testDbref}", "HP"));` +
                `return hp * 2`
            )).toBe('84');
        });

        await test('rhost.get() + rhost.strfunc() combined', async () => {
            // Read the class from MUSH, uppercase it in Lua via strfunc
            expect(await lua(wizDbref,
                `local cls = rhost.get("${testDbref}", "CLASS");` +
                `return rhost.strfunc("ucstr", cls, ",")`
            )).toBe('WARRIOR');
        });

        await test('Lua builds a character summary from live MUSH attributes', async () => {
            const result = await lua(wizDbref,
                `local name = rhost.get("${testDbref}", "CLASS");` +
                `local hp   = tonumber(rhost.get("${testDbref}", "HP")) or 0;` +
                `local mod  = math.floor((hp - 10) / 2);` +
                `local sign = mod >= 0 and "+" or "";` +
                `return name .. " — HP: " .. hp .. " (" .. sign .. mod .. ")"`
            );
            expect(result).toBe('Warrior — HP: 42 (+16)');
        });

        // Cleanup
        try { await mushCmd(`@nuke ${testDbref}`); } catch (_) { /* ignore */ }
    }

    // ── 6. Multi-statement Lua scripts ──────────────────────────────────────
    console.log('\n=== Multi-statement Lua scripts ===');

    await test('FizzBuzz (first 15 results as comma list)', async () => {
        const result = await lua(wizDbref, `
            local out = {}
            for i = 1, 15 do
                if i % 15 == 0 then table.insert(out, "FizzBuzz")
                elseif i % 3 == 0 then table.insert(out, "Fizz")
                elseif i % 5 == 0 then table.insert(out, "Buzz")
                else table.insert(out, tostring(i))
                end
            end
            return table.concat(out, ",")
        `);
        expect(result).toBe('1,2,Fizz,4,Buzz,Fizz,7,8,Fizz,Buzz,11,Fizz,13,14,FizzBuzz');
    });

    await test('D&D modifier function', async () => {
        // floor((stat - 10) / 2) for stats 8..18
        const result = await lua(wizDbref, `
            local function mod(stat) return math.floor((stat - 10) / 2) end
            local out = {}
            for _, stat in ipairs({8, 10, 12, 14, 16, 18}) do
                local m = mod(stat)
                table.insert(out, (m >= 0 and "+" or "") .. m)
            end
            return table.concat(out, " ")
        `);
        expect(result).toBe('-1 +0 +1 +2 +3 +4');
    });

    await test('binary search in a sorted Lua table', async () => {
        expect(await lua(wizDbref, `
            local t = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91}
            local function bsearch(arr, val)
                local lo, hi = 1, #arr
                while lo <= hi do
                    local mid = math.floor((lo + hi) / 2)
                    if arr[mid] == val then return mid
                    elseif arr[mid] < val then lo = mid + 1
                    else hi = mid - 1
                    end
                end
                return -1
            end
            return bsearch(t, 23)   -- 23 is at index 6
        `)).toBe('6');
    });

    // ── 7. 5 ms timeout protection ───────────────────────────────────────────
    console.log('\n=== Lua safety: 5 ms execution alarm ===');

    await test('infinite loop is killed by the 5 ms alarm', async () => {
        const result = await lua(wizDbref, 'while true do end; return "done"');
        // The server kills runaway scripts; exact error text varies
        expect(result).toMatch(/error|timeout|alarm|killed/i);
    });

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    const total = passed + failed;
    console.log(`${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
