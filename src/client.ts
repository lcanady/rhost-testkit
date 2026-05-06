import { randomUUID } from 'crypto';
import { MushConnection } from './connection';

// ESC [ ... m  — SGR sequences (colors, bold, etc.)
// ESC [ ... (A-Z or a-z)  — cursor movement, erase, etc.
// ESC ] ... ST  — OSC sequences
const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

/** Strip ANSI/VT100 escape sequences from a string. */
export function stripAnsi(s: string): string {
    return s.replace(ANSI_RE, '');
}

export interface CommandOptions {
    /** Override the global commandSettleMs for this single call. */
    settleMs?: number;
    /** Timeout in ms. Defaults to the client's default timeout. */
    timeout?: number;
}

export interface RhostClientOptions {
    /** Server hostname. Default: 'localhost' */
    host?: string;
    /** Server port. Default: 4201 */
    port?: number;
    /** Default timeout in milliseconds. Default: 10000 */
    timeout?: number;
    /**
     * Idle time (ms) after the last banner line before the banner is considered
     * finished. Shorter values speed up tests. Default: 300
     */
    bannerTimeout?: number;
    /**
     * Whether to strip ANSI escape codes from eval results.
     * RhostMUSH can embed color codes in output; enabling this gives clean
     * string comparison in tests. Default: true
     */
    stripAnsi?: boolean;
    /**
     * Minimum milliseconds to wait before sending each eval's commands.
     * Use when running many rapid evals to avoid MUSH flood control.
     * Default: 0 (no delay)
     */
    paceMs?: number;
    /**
     * Milliseconds to wait after sending a command and before sending the
     * sentinel. Useful when commands produce deferred output (e.g. via
     * @trigger or @wait 0) that arrives after the main response.
     * Default: 0
     */
    commandSettleMs?: number;
    /**
     * Timeout in milliseconds for the raw TCP connection to be established.
     * If the server accepts the socket but then stalls, the connect will be
     * aborted after this many milliseconds. Default: 10000
     */
    connectTimeout?: number;
    /**
     * When true, connects via WebSocket (RFC 6455) instead of raw TCP.
     * Requires RhostMUSH compiled with ENABLE_WEBSOCKETS. Default: false.
     */
    useWebSocket?: boolean;
    /**
     * WebSocket request path sent in the HTTP upgrade handshake.
     * Only relevant when useWebSocket is true. Default: '/'
     */
    websocketPath?: string;
    /**
     * Use a secure WebSocket connection (wss://) instead of plain ws://.
     * Requires the port to be fronted by stunnel or another TLS terminator.
     * Only relevant when useWebSocket is true. Default: false
     */
    websocketSecure?: boolean;
}

// ---------------------------------------------------------------------------
// Preview options
// ---------------------------------------------------------------------------

export interface PreviewOptions {
    /**
     * How to send the input to the server.
     * - `'eval'`    — wraps in `think`, returning the softcode result (default)
     * - `'command'` — sends as a raw MUSH command, capturing all output lines
     */
    mode?: 'eval' | 'command';
    /**
     * Label shown in the preview frame header.
     * Defaults to the expression/command string (truncated if long).
     */
    label?: string;
    /** Timeout in ms. Defaults to the client's default timeout. */
    timeout?: number;
    /**
     * Write the preview to stdout automatically.  Default: true.
     * Set to false to suppress output and only use the return value.
     */
    print?: boolean;
}

/**
 * High-level client for interacting with a RhostMUSH server.
 *
 * @example
 *   const client = new RhostClient({ host: 'localhost', port: 4201 });
 *   await client.connect();
 *   await client.login('Wizard', 'Nyctasia');
 *   const result = await client.eval('add(2,3)');  // => '5'
 *   await client.disconnect();
 */
export class RhostClient {
    private conn: MushConnection;
    private defaultTimeout: number;
    private bannerTimeout: number;
    private doStripAnsi: boolean;
    private paceMs: number;
    private commandSettleMs: number;

    private connectTimeout: number;

    constructor(options: RhostClientOptions = {}) {
        this.conn = new MushConnection(options.host ?? 'localhost', options.port ?? 4201, {
            useWebSocket: options.useWebSocket,
            websocketPath: options.websocketPath,
            websocketSecure: options.websocketSecure,
        });
        this.defaultTimeout = options.timeout ?? 10000;
        this.bannerTimeout = options.bannerTimeout ?? 300;
        this.doStripAnsi = options.stripAnsi !== false;
        this.commandSettleMs = options.commandSettleMs ?? 0;
        this.paceMs = options.paceMs ?? 0;
        this.connectTimeout = options.connectTimeout ?? 10000;
    }

    /**
     * Establish the TCP connection. Drains the welcome banner before returning.
     */
    async connect(): Promise<void> {
        await this.conn.connect(this.connectTimeout);
        await this.drainBanner(this.bannerTimeout);
    }

    /**
     * Log in with character credentials.
     * Uses a sentinel `@pemit` to confirm login regardless of welcome text.
     */
    async login(username: string, password: string): Promise<void> {
        if (/[\n\r]/.test(username)) {
            throw new RangeError('login: invalid username — must not contain newline or carriage return characters');
        }
        if (/[\n\r]/.test(password)) {
            throw new RangeError('login: invalid password — must not contain newline or carriage return characters');
        }
        // The MUSH `connect` command is space-delimited: embedding a space or tab
        // in the username would let the caller silently substitute a different
        // character name and password (space-splitting injection).
        if (/[ \t]/.test(username)) {
            throw new RangeError('login: invalid username — must not contain spaces or tabs');
        }
        const sentinel = `RHOST_LOGIN_${this.makeId()}`;
        this.conn.send(`connect ${username} ${password}`);
        this.conn.send(`@pemit me=${sentinel}`);
        await this.readUntilMarker(sentinel, this.defaultTimeout);
    }

    /**
     * Evaluate a MUSHcode expression and return the string result.
     *
     * Uses `think` to evaluate and `@pemit me=` sentinels to delimit output.
     * ANSI escape codes are stripped by default (see `stripAnsi` option).
     *
     * @example
     *   await client.eval('add(2,3)')          // => '5'
     *   await client.eval('lcstr(HELLO)')       // => 'hello'
     *   await client.eval('encode64(hello)')    // => 'aGVsbG8='
     */
    async eval(expression: string, timeout?: number): Promise<string> {
        return this._collectEval(expression, this.doStripAnsi, timeout);
    }

    /**
     * Run a MUSHcode command and collect all output lines until the
     * internal sentinel is received.
     *
     * The second argument can be a timeout number (legacy) or an options object.
     * Use `settleMs` to override the global commandSettleMs for a single call —
     * this lets you pay the settle cost only on commands that produce deferred
     * output (e.g. `@force`) while non-deferred commands run at full speed.
     *
     * @example
     *   const lines = await client.command('look here');
     *   const lines = await client.command('@pemit me=hello');
     *   // Only pay settle cost on @force:
     *   await client.command(`@force ${player}=+cg/submit`, { settleMs: 300 });
     */
    async command(cmd: string, timeoutOrOpts?: number | CommandOptions): Promise<string[]> {
        const opts = typeof timeoutOrOpts === 'number'
            ? { timeout: timeoutOrOpts }
            : (timeoutOrOpts ?? {});
        const settleMs = opts.settleMs ?? this.commandSettleMs;
        return this._collectCommand(cmd, this.doStripAnsi, opts.timeout, settleMs);
    }

    /**
     * Evaluate N expressions in a single pipelined batch.
     *
     * All sends are issued before waiting for any response, eliminating the
     * per-expression START-sentinel round trip. Results are returned in the
     * same order as `expressions`.
     *
     * Use this instead of sequential `await client.eval()` calls whenever
     * the expressions are independent of each other.
     *
     * @example
     *   const [cg, cgData] = await client.evalAll([
     *     'search(name=Chargen <cg>)',
     *     'search(name=Chargen Data <cg>)',
     *   ]);
     */
    async evalAll(expressions: string[], timeout?: number): Promise<string[]> {
        if (expressions.length === 0) return [];
        if (expressions.length === 1) return [await this.eval(expressions[0], timeout)];

        const ms = timeout ?? this.defaultTimeout;
        const ids = expressions.map(() => this.makeId());

        // Pipeline ALL sends before waiting for any response
        for (let i = 0; i < expressions.length; i++) {
            this.conn.send(`@pemit me=RHOST_EVAL_START_${ids[i]}`);
            this.conn.send(`think ${expressions[i]}`);
            this.conn.send(`@pemit me=RHOST_EVAL_END_${ids[i]}`);
        }

        // Read responses in order — they arrive in the same sequence MUSH processed them
        const results: string[] = [];
        for (let i = 0; i < expressions.length; i++) {
            const startMarker = `RHOST_EVAL_START_${ids[i]}`;
            const endMarker   = `RHOST_EVAL_END_${ids[i]}`;

            await this.readUntilMarker(startMarker, ms);

            const resultLines: string[] = [];
            while (true) {
                const line = await this.conn.lines.next(ms);
                const clean = this.doStripAnsi ? stripAnsi(line) : line;
                if ((this.doStripAnsi ? clean : stripAnsi(line)).includes(endMarker)) break;
                resultLines.push(clean);
            }
            results.push(resultLines.join('\n'));
        }

        return results;
    }

    /**
     * Send a command without waiting for any response.
     *
     * Useful for batching fire-and-forget setup commands in `beforeAll` where
     * you only need to confirm the last one landed.
     *
     * @example
     *   client.sendNoWait(`&_CG_STATUS ${player}=CHARGEN`);
     *   client.sendNoWait(`&_CG_METHOD ${player}=streetrat`);
     *   await client.command(`&_CG_ROLE ${player}=Solo`); // wait on last one
     */
    sendNoWait(cmd: string): void {
        this.conn.send(cmd);
    }

    /**
     * Evaluate an expression or run a command and print the raw server output
     * to stdout exactly as a MUSH client would receive it — ANSI colours,
     * formatting codes, and all.
     *
     * The output is framed in a labelled box so it is clearly demarcated in
     * test output.  The raw string is also returned so you can assert on it
     * if needed.
     *
     * By default (`mode: 'eval'`) the input is wrapped in `think`, so it
     * should be a softcode expression.  Pass `mode: 'command'` to send a raw
     * MUSH command instead (e.g. `'look here'`, `'score'`, `'@pemit me=hi'`).
     *
     * @example Softcode expression
     *   await client.preview('ansi(r,Hello!)');
     *   await client.preview('iter(lnum(1,5),##)');
     *
     * @example Raw command (room description, score screen, etc.)
     *   await client.preview('look here', { mode: 'command' });
     *   await client.preview('score',     { mode: 'command' });
     *
     * @example Suppress auto-print and only use the return value
     *   const raw = await client.preview('ansi(b,test)', { print: false });
     *   expect(stripAnsi(raw)).toBe('test');
     */
    async preview(input: string, options: PreviewOptions = {}): Promise<string> {
        const mode = options.mode ?? 'eval';
        const timeout = options.timeout;
        const doPrint = options.print !== false;

        // Always collect raw output (never strip) for preview
        const raw =
            mode === 'eval'
                ? await this._collectEval(input, false, timeout)
                : (await this._collectCommand(input, false, timeout)).join('\n');

        if (doPrint) {
            const label = options.label ?? (input.length > 60 ? input.slice(0, 57) + '…' : input);
            printPreviewFrame(label, raw, mode);
        }

        return raw;
    }

    /** Subscribe to every raw line received from the server. */
    onLine(handler: (line: string) => void): void {
        this.conn.on('line', handler);
    }

    offLine(handler: (line: string) => void): void {
        this.conn.off('line', handler);
    }

    /** Send QUIT and close the TCP connection. */
    async disconnect(): Promise<void> {
        try {
            this.conn.send('QUIT');
        } catch {
            // already closed
        }
        await this.conn.close();
    }

    // -------------------------------------------------------------------------
    // Private: core collect helpers (shared by eval/command/preview)
    // -------------------------------------------------------------------------

    private async _collectEval(
        expression: string,
        strip: boolean,
        timeout?: number,
    ): Promise<string> {
        if (this.paceMs > 0) {
            await new Promise((r) => setTimeout(r, this.paceMs));
        }
        const id = this.makeId();
        const startMarker = `RHOST_EVAL_START_${id}`;
        const endMarker = `RHOST_EVAL_END_${id}`;
        const ms = timeout ?? this.defaultTimeout;

        this.conn.send(`@pemit me=${startMarker}`);
        this.conn.send(`think ${expression}`);
        this.conn.send(`@pemit me=${endMarker}`);

        await this.readUntilMarker(startMarker, ms);

        const resultLines: string[] = [];
        while (true) {
            const line = await this.conn.lines.next(ms);
            const clean = strip ? stripAnsi(line) : line;
            if ((strip ? clean : stripAnsi(line)).includes(endMarker)) break;
            resultLines.push(clean);
        }

        return resultLines.join('\n');
    }

    private async _collectCommand(
        cmd: string,
        strip: boolean,
        timeout?: number,
        settleMs?: number,
    ): Promise<string[]> {
        const id = this.makeId();
        const endMarker = `RHOST_CMD_END_${id}`;
        const ms = timeout ?? this.defaultTimeout;
        const effectiveSettle = settleMs ?? this.commandSettleMs;

        this.conn.send(cmd);
        if (effectiveSettle > 0) {
            await new Promise(r => setTimeout(r, effectiveSettle));
        }
        this.conn.send(`@pemit me=${endMarker}`);

        const lines: string[] = [];
        while (true) {
            const line = await this.conn.lines.next(ms);
            const clean = strip ? stripAnsi(line) : line;
            if ((strip ? clean : stripAnsi(line)).includes(endMarker)) break;
            lines.push(clean);
        }

        return lines;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async readUntilMarker(marker: string, timeoutMs: number): Promise<void> {
        while (true) {
            const line = await this.conn.lines.next(timeoutMs);
            const clean = this.doStripAnsi ? stripAnsi(line) : line;
            if (clean.includes(marker)) return;
        }
    }

    private drainBanner(idleMs: number): Promise<void> {
        return new Promise((resolve) => {
            const tryNext = () => {
                this.conn.lines.next(idleMs)
                    .then(() => tryNext())
                    .catch(() => resolve());
            };
            tryNext();
        });
    }

    private makeId(): string {
        return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    }
}

// ---------------------------------------------------------------------------
// Preview frame renderer
// ---------------------------------------------------------------------------

const USE_COLOR = process.stdout.isTTY !== false;
const c = (code: string, s: string) => USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;

function printPreviewFrame(label: string, content: string, mode: 'eval' | 'command'): void {
    const termWidth = (process.stdout.columns ?? 80) - 2;
    const frameColor = mode === 'eval' ? '36' : '33'; // cyan for eval, yellow for command
    const modeTag = mode === 'eval' ? 'softcode' : 'command';

    // Header line: ─── preview [softcode]: <label> ─────────────
    const headerLeft = ` preview [${modeTag}]: `;
    const headerFull = `${headerLeft}${label} `;
    const headerPad = Math.max(0, termWidth - headerFull.length);
    const header = c(frameColor, '─'.repeat(3) + headerFull + '─'.repeat(headerPad));

    // Footer line: ─────────────────────────────────────────────
    const footer = c(frameColor, '─'.repeat(termWidth));

    process.stdout.write('\n' + header + '\n');

    if (content === '') {
        process.stdout.write(c('90', '  (empty output)\n'));
    } else {
        // Prefix each line with a subtle left margin
        const lines = content.split('\n');
        for (const line of lines) {
            process.stdout.write('  ' + line + '\n');
        }
    }

    process.stdout.write(footer + '\n\n');
}
