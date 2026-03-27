import * as net from 'net';
import { EventEmitter } from 'events';

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

export class MushConnection extends EventEmitter {
    private socket: net.Socket | null = null;
    private rawBuffer = '';
    readonly lines: AsyncLineQueue;

    constructor(private readonly host: string, private readonly port: number) {
        super();
        this.lines = new AsyncLineQueue();
    }

    connect(connectTimeoutMs = 10000): Promise<void> {
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
                this.socket!.setTimeout(0); // disable timeout after connection established
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
        if (!this.socket || this.socket.destroyed) {
            throw new Error('Not connected');
        }
        this.socket.write(command + '\r\n');
    }

    close(): Promise<void> {
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
