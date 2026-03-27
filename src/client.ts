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
     * Timeout in milliseconds for the raw TCP connection to be established.
     * If the server accepts the socket but then stalls, the connect will be
     * aborted after this many milliseconds. Default: 10000
     */
    connectTimeout?: number;
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

    private connectTimeout: number;

    constructor(options: RhostClientOptions = {}) {
        this.conn = new MushConnection(options.host ?? 'localhost', options.port ?? 4201);
        this.defaultTimeout = options.timeout ?? 10000;
        this.bannerTimeout = options.bannerTimeout ?? 300;
        this.doStripAnsi = options.stripAnsi !== false;
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
     * @example
     *   const lines = await client.command('look here');
     *   const lines = await client.command('@pemit me=hello');
     */
    async command(cmd: string, timeout?: number): Promise<string[]> {
        return this._collectCommand(cmd, this.doStripAnsi, timeout);
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
    ): Promise<string[]> {
        const id = this.makeId();
        const endMarker = `RHOST_CMD_END_${id}`;
        const ms = timeout ?? this.defaultTimeout;

        this.conn.send(cmd);
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
