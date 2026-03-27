import { RhostClient, stripAnsi } from '../client';

// ---------------------------------------------------------------------------
// Mock factory
//
// All sends happen before the first lines.next() call (the client sends all
// three commands — @pemit START, think expr, @pemit END — synchronously, then
// awaits the response queue).  The mock returns responses by call index.
// ---------------------------------------------------------------------------

interface MockHandle {
    client: RhostClient;
    /** Lines sent to the server (for inspection) */
    sent: string[];
}

/**
 * Build a mock RhostClient.
 *
 * `responseFactory` is called on each `lines.next()` invocation with:
 *   - `callIndex` — 0-based call counter
 *   - `sent`      — all lines sent so far (fully populated by the time next() is called)
 *
 * Return the raw line the server would send back.
 */
function makeMockClient(
    responseFactory: (callIndex: number, sent: string[]) => string,
): MockHandle {
    const sent: string[] = [];
    let callIndex = 0;

    const client = new RhostClient({});
    const mockConn = {
        send: (line: string) => { sent.push(line); },
        lines: {
            next: async (_timeout: number): Promise<string> => {
                return responseFactory(callIndex++, sent);
            },
        },
        on: () => {},
        off: () => {},
        connect: async () => {},
        close: async () => {},
    };

    (client as any).conn = mockConn;
    (client as any).doStripAnsi = true; // instance default (eval/command strip; preview overrides)
    (client as any).defaultTimeout = 5000;
    (client as any).paceMs = 0;

    return { client, sent };
}

/**
 * Standard eval response factory.
 *
 * Call sequence for `_collectEval`:
 *   call 0 → readUntilMarker(startMarker)  — must return the start marker line
 *   call 1 → first content line            — return actual content
 *   call 2 → readUntilMarker loop (end)    — return the end marker line
 *
 * Since all three sends complete before the first next(), `sent` is fully
 * populated by the time call 0 happens:
 *   sent[0] = '@pemit me=RHOST_EVAL_START_XXXX'
 *   sent[1] = 'think <expression>'
 *   sent[2] = '@pemit me=RHOST_EVAL_END_XXXX'
 */
function evalResponseFactory(content: string) {
    return (callIndex: number, sent: string[]): string => {
        if (callIndex === 0) return sent[0].replace('@pemit me=', ''); // start marker
        if (callIndex === 1) return content;                           // actual output
        return sent[2].replace('@pemit me=', '');                     // end marker
    };
}

/** Empty eval (no output between markers) */
function emptyEvalResponseFactory() {
    return (callIndex: number, sent: string[]): string => {
        if (callIndex === 0) return sent[0].replace('@pemit me=', ''); // start marker
        return sent[2].replace('@pemit me=', '');                     // end marker immediately
    };
}

// ---------------------------------------------------------------------------
// preview() — raw output preservation
// ---------------------------------------------------------------------------

describe('RhostClient.preview — ANSI preservation', () => {
    it('returns raw output with ANSI codes intact (not stripped)', async () => {
        const ansiContent = '\x1b[31mHello\x1b[0m';
        const { client } = makeMockClient(evalResponseFactory(ansiContent));
        const raw = await client.preview('ansi(r,Hello)', { print: false });
        expect(raw).toContain('\x1b[');
        expect(stripAnsi(raw)).toBe('Hello');
    });

    it('returns plain string unchanged when no ANSI codes present', async () => {
        const { client } = makeMockClient(evalResponseFactory('5'));
        const raw = await client.preview('add(2,3)', { print: false });
        expect(raw).toBe('5');
    });

    it('returns empty string for empty server output', async () => {
        const { client } = makeMockClient(emptyEvalResponseFactory());
        const raw = await client.preview('null()', { print: false });
        expect(raw).toBe('');
    });

    it('eval mode wraps expression in think', async () => {
        const { client, sent } = makeMockClient(emptyEvalResponseFactory());
        await client.preview('strlen(hello)', { print: false });
        expect(sent.some((s) => s.startsWith('think '))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// preview() — print:false suppresses stdout
// ---------------------------------------------------------------------------

describe('RhostClient.preview — print:false', () => {
    it('does not write anything to stdout', async () => {
        const { client } = makeMockClient(emptyEvalResponseFactory());
        const writes: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            writes.push(String(chunk));
            return true;
        });
        try {
            await client.preview('add(1,2)', { print: false });
            expect(writes).toHaveLength(0);
        } finally {
            spy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// preview() — print:true renders a framed block
// ---------------------------------------------------------------------------

describe('RhostClient.preview — print:true', () => {
    it('writes output to stdout including the label and content', async () => {
        const { client } = makeMockClient(evalResponseFactory('3.14'));
        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview('pi()', { print: true });
            const all = chunks.join('');
            expect(all).toContain('pi()');
            expect(all).toContain('3.14');
            expect(all).toMatch(/─/);
        } finally {
            spy.mockRestore();
        }
    });

    it('labels frame with "softcode" for eval mode', async () => {
        const { client } = makeMockClient(emptyEvalResponseFactory());
        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview('strlen(hi)', { print: true });
            expect(chunks.join('')).toContain('softcode');
        } finally {
            spy.mockRestore();
        }
    });

    it('truncates labels longer than 60 characters', async () => {
        const longExpr = 'a'.repeat(80);
        const { client } = makeMockClient(emptyEvalResponseFactory());
        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview(longExpr, { print: true });
            expect(stripAnsi(chunks.join(''))).toContain('…');
        } finally {
            spy.mockRestore();
        }
    });

    it('uses custom label when provided', async () => {
        const { client } = makeMockClient(evalResponseFactory('result'));
        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview('complex_expr()', {
                print: true,
                label: 'My Custom Label',
            });
            expect(chunks.join('')).toContain('My Custom Label');
        } finally {
            spy.mockRestore();
        }
    });

    it('shows "(empty output)" message for empty content', async () => {
        const { client } = makeMockClient(emptyEvalResponseFactory());
        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview('null()', { print: true });
            expect(chunks.join('')).toContain('empty output');
        } finally {
            spy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// preview() — command mode
// ---------------------------------------------------------------------------

describe('RhostClient.preview — command mode', () => {
    it('sends the command directly without wrapping in think', async () => {
        // For command mode, _collectCommand is used instead of _collectEval.
        // Sequence: send(cmd), send(@pemit END)
        // next() calls: return content lines, then end marker
        const sent: string[] = [];
        let callIdx = 0;
        const client = new RhostClient({});
        const mockConn = {
            send: (line: string) => { sent.push(line); },
            lines: {
                next: async (_timeout: number): Promise<string> => {
                    callIdx++;
                    if (callIdx === 1) return 'The Great Hall';
                    // Return end marker (sent[1] = '@pemit me=RHOST_CMD_END_...')
                    return sent[1].replace('@pemit me=', '');
                },
            },
            on: () => {},
            off: () => {},
        };
        (client as any).conn = mockConn;
        (client as any).doStripAnsi = true;
        (client as any).defaultTimeout = 5000;
        (client as any).paceMs = 0;

        const raw = await client.preview('look here', { mode: 'command', print: false });
        expect(raw).toBe('The Great Hall');
        // Should NOT have wrapped in think
        expect(sent.some((s) => s.startsWith('think '))).toBe(false);
        // First send should be the raw command
        expect(sent[0]).toBe('look here');
    });

    it('labels frame with "command" for command mode', async () => {
        const sent: string[] = [];
        let callIdx = 0;
        const client = new RhostClient({});
        const mockConn = {
            send: (line: string) => { sent.push(line); },
            lines: {
                next: async (_timeout: number): Promise<string> => {
                    callIdx++;
                    return sent[1]?.replace('@pemit me=', '') ?? '';
                },
            },
            on: () => {},
            off: () => {},
        };
        (client as any).conn = mockConn;
        (client as any).doStripAnsi = true;
        (client as any).defaultTimeout = 5000;
        (client as any).paceMs = 0;

        const chunks: string[] = [];
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        try {
            await client.preview('score', { mode: 'command', print: true });
            expect(chunks.join('')).toContain('command');
        } finally {
            spy.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// stripAnsi utility (re-exported from client)
// ---------------------------------------------------------------------------

describe('stripAnsi', () => {
    it('removes SGR color sequences', () => {
        expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    });

    it('removes bold', () => {
        expect(stripAnsi('\x1b[1mbold\x1b[0m')).toBe('bold');
    });

    it('leaves plain text unchanged', () => {
        expect(stripAnsi('hello world')).toBe('hello world');
    });

    it('handles multiple sequences in one string', () => {
        expect(stripAnsi('\x1b[32mgreen\x1b[0m and \x1b[31mred\x1b[0m')).toBe('green and red');
    });

    it('handles empty string', () => {
        expect(stripAnsi('')).toBe('');
    });
});
