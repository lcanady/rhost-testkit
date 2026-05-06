import * as net from 'net';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * Async FIFO queue for lines received from the server.
 * Delivers directly to waiting consumers; buffers when none are waiting.
 */
class AsyncLineQueue {
    private buffer: string[] = [];
    private waiters: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];

    push(line: string): void {
        if (this.waiters.length > 0) {
            this.waiters.shift()!.resolve(line);
        } else {
            this.buffer.push(line);
        }
    }

    next(timeoutMs: number): Promise<string> {
        if (this.buffer.length > 0) {
            return Promise.resolve(this.buffer.shift()!);
        }
        return new Promise((resolve, reject) => {
            const entry = { resolve, reject };
            this.waiters.push(entry);
            const timer = setTimeout(() => {
                const idx = this.waiters.indexOf(entry);
                if (idx !== -1) {
                    this.waiters.splice(idx, 1);
                    reject(new Error(`Timed out after ${timeoutMs}ms waiting for next line`));
                }
            }, timeoutMs);
            const origResolve = entry.resolve;
            entry.resolve = (line) => {
                clearTimeout(timer);
                origResolve(line);
            };
        });
    }

    drainSync(): string[] {
        const lines = [...this.buffer];
        this.buffer = [];
        return lines;
    }

    cancelAll(reason: string): void {
        const err = new Error(reason);
        for (const w of this.waiters.splice(0)) w.reject(err);
    }
}

export interface MushConnectionOptions {
    /**
     * When true, connects via WebSocket (RFC 6455) instead of raw TCP.
     * Requires RhostMUSH compiled with ENABLE_WEBSOCKETS. Default: false.
     */
    useWebSocket?: boolean;
    /**
     * WebSocket request path. Default: '/'.
     * Only relevant when useWebSocket is true.
     */
    websocketPath?: string;
    /**
     * Use wss:// instead of ws://. Requires a TLS terminator (e.g. stunnel)
     * in front of the MUSH port. Default: false.
     */
    websocketSecure?: boolean;
}

export class MushConnection extends EventEmitter {
    private socket: net.Socket | null = null;
    private ws: WebSocket | null = null;
    private rawBuffer = '';
    readonly lines: AsyncLineQueue;
    private readonly useWebSocket: boolean;
    private readonly websocketPath: string;
    private readonly websocketSecure: boolean;

    constructor(
        private readonly host: string,
        private readonly port: number,
        options: MushConnectionOptions = {},
    ) {
        super();
        this.lines = new AsyncLineQueue();
        this.useWebSocket = options.useWebSocket ?? false;
        this.websocketPath = options.websocketPath ?? '/';
        this.websocketSecure = options.websocketSecure ?? false;
    }

    connect(connectTimeoutMs = 10000): Promise<void> {
        return this.useWebSocket
            ? this.connectWebSocket(connectTimeoutMs)
            : this.connectTcp(connectTimeoutMs);
    }

    private connectTcp(connectTimeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.setEncoding('utf8');
            this.socket.once('error', (err) => { reject(err); });
            this.socket.setTimeout(connectTimeoutMs);
            this.socket.once('timeout', () => {
                this.socket!.destroy();
                reject(new Error(`connect() timed out after ${connectTimeoutMs}ms`));
            });
            this.socket.connect(this.port, this.host, () => {
                this.socket!.setTimeout(0);
                this.socket!.removeAllListeners('error');
                this.socket!.removeAllListeners('timeout');
                this.socket!.on('error', (err) => this.emit('error', err));
                this.socket!.on('close', () => {
                    this.lines.cancelAll('Connection closed');
                    this.emit('close');
                });
                this.socket!.on('data', (chunk: string) => this.onData(chunk));
                resolve();
            });
        });
    }

    private connectWebSocket(connectTimeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const scheme = this.websocketSecure ? 'wss' : 'ws';
            const url = `${scheme}://${this.host}:${this.port}${this.websocketPath}`;
            this.ws = new WebSocket(url);

            const timer = setTimeout(() => {
                this.ws!.terminate();
                reject(new Error(`connect() timed out after ${connectTimeoutMs}ms`));
            }, connectTimeoutMs);

            this.ws.once('open', () => {
                clearTimeout(timer);
                this.ws!.on('error', (err) => this.emit('error', err));
                this.ws!.on('close', () => {
                    this.lines.cancelAll('Connection closed');
                    this.emit('close');
                });
                this.ws!.on('message', (data) => {
                    this.onData(data.toString());
                });
                resolve();
            });

            this.ws.once('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    private onData(chunk: string): void {
        this.rawBuffer += chunk;
        let newlineIdx: number;
        while ((newlineIdx = this.rawBuffer.indexOf('\n')) !== -1) {
            const line = this.rawBuffer.slice(0, newlineIdx).replace(/\r$/, '');
            this.rawBuffer = this.rawBuffer.slice(newlineIdx + 1);
            this.emit('line', line);
            this.lines.push(line);
        }
    }

    send(command: string): void {
        if (this.useWebSocket) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                throw new Error('Not connected');
            }
            this.ws.send(command + '\r\n');
        } else {
            if (!this.socket || this.socket.destroyed) {
                throw new Error('Not connected');
            }
            this.socket.write(command + '\r\n');
        }
    }

    close(): Promise<void> {
        if (this.useWebSocket) {
            return new Promise((resolve) => {
                if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                    resolve();
                    return;
                }
                this.ws.once('close', () => resolve());
                this.ws.close();
            });
        }
        return new Promise((resolve) => {
            if (!this.socket || this.socket.destroyed) {
                resolve();
                return;
            }
            this.socket.once('close', () => resolve());
            this.socket.end();
        });
    }
}
