/**
 * MockMushServer — a real TCP server that speaks enough of the RhostMUSH
 * protocol to unit-test the SDK without a running game instance.
 *
 * Protocol handled:
 *   connect <name> <pass>   → CONNECTED
 *   @pemit me=<text>        → <text>     (echoes the text back verbatim)
 *   think <expression>      → evaluator(<expression>)
 *   QUIT                    → closes the socket
 *   (all other lines are silently ignored)
 */
import * as net from 'net';

export type ThinkEvaluator = (expression: string) => string;

export class MockMushServer {
    private server: net.Server;
    private evaluator: ThinkEvaluator = (expr) => `MOCK:${expr}`;
    private sockets: net.Socket[] = [];

    constructor() {
        this.server = net.createServer((socket) => {
            this.sockets.push(socket);
            socket.once('close', () => {
                const i = this.sockets.indexOf(socket);
                if (i !== -1) this.sockets.splice(i, 1);
            });
            this.handleSocket(socket);
        });
    }

    /**
     * Configure how `think <expr>` is answered.
     * The default evaluator echoes `MOCK:<expr>`.
     */
    setEvaluator(fn: ThinkEvaluator): void {
        this.evaluator = fn;
    }

    /**
     * Start listening on a random port. Returns the assigned port number.
     */
    listen(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(0, '127.0.0.1', () => {
                this.server.removeListener('error', reject);
                resolve((this.server.address() as net.AddressInfo).port);
            });
        });
    }

    /**
     * Gracefully close the server and all open connections.
     */
    close(): Promise<void> {
        for (const s of this.sockets) s.destroy();
        this.sockets = [];
        return new Promise((resolve, reject) => {
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
    }

    // -------------------------------------------------------------------------

    private handleSocket(socket: net.Socket): void {
        socket.setEncoding('utf8');
        // Send a 2-line welcome banner — client will drain them
        socket.write('Welcome to MockRhost\r\n');
        socket.write('Use: connect <name> <pass>\r\n');

        let buf = '';
        socket.on('data', (chunk: string) => {
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, idx).replace(/\r$/, '');
                buf = buf.slice(idx + 1);
                if (line.trim()) this.dispatch(socket, line);
            }
        });
    }

    private dispatch(socket: net.Socket, line: string): void {
        if (line.startsWith('connect ')) {
            socket.write('CONNECTED\r\n');

        } else if (line.startsWith('@pemit me=')) {
            const text = line.slice('@pemit me='.length);
            socket.write(text + '\r\n');

        } else if (line.startsWith('think ')) {
            const expr = line.slice('think '.length);
            const result = this.evaluator(expr);
            socket.write(result + '\r\n');

        } else if (line.toUpperCase() === 'QUIT') {
            socket.end();
        }
        // Silently drop everything else
    }

}
