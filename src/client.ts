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
            const clean = this.doStripAnsi ? stripAnsi(line) : line;
            if (clean.includes(endMarker)) break;
            resultLines.push(clean);
        }

        return resultLines.join('\n');
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
        const id = this.makeId();
        const endMarker = `RHOST_CMD_END_${id}`;
        const ms = timeout ?? this.defaultTimeout;

        this.conn.send(cmd);
        this.conn.send(`@pemit me=${endMarker}`);

        const lines: string[] = [];
        while (true) {
            const line = await this.conn.lines.next(ms);
            const clean = this.doStripAnsi ? stripAnsi(line) : line;
            if (clean.includes(endMarker)) break;
            lines.push(clean);
        }

        return lines;
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
