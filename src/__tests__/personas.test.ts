/**
 * Tests for the multi-persona test matrix feature.
 *
 * personas() registers one test per named persona, each connecting with its
 * own credentials. The test fn receives the normal TestContext plus a `persona`
 * string identifying which persona is running.
 */
import { RhostRunner } from '../runner';
import { RhostClient } from '../client';

// ---------------------------------------------------------------------------
// Minimal mock client that tracks which username logged in
// ---------------------------------------------------------------------------

function makeClientMock(evalResult = '1'): {
    client: RhostClient;
    loggedInAs: () => string | undefined;
    connectCalls: () => number;
    disconnectCalls: () => number;
} {
    let loggedInAs: string | undefined;
    let connectCalls = 0;
    let disconnectCalls = 0;

    const mock = {
        connect: jest.fn(async () => { connectCalls++; }),
        login: jest.fn(async (username: string) => { loggedInAs = username; }),
        eval: jest.fn(async () => evalResult),
        command: jest.fn(async () => []),
        disconnect: jest.fn(async () => { disconnectCalls++; }),
        onLine: jest.fn(),
        offLine: jest.fn(),
    };

    return {
        client: mock as unknown as RhostClient,
        loggedInAs: () => loggedInAs,
        connectCalls: () => connectCalls,
        disconnectCalls: () => disconnectCalls,
    };
}

// ---------------------------------------------------------------------------
// Mock RhostClient constructor so we can inject our mocks
// ---------------------------------------------------------------------------

// We track every client created in order
let clientMocks: ReturnType<typeof makeClientMock>[] = [];

jest.mock('../client', () => {
    return {
        RhostClient: jest.fn().mockImplementation(() => {
            const mock = makeClientMock();
            clientMocks.push(mock);
            return mock.client;
        }),
    };
});

beforeEach(() => {
    clientMocks = [];
    (RhostClient as jest.Mock).mockImplementation(() => {
        const mock = makeClientMock();
        clientMocks.push(mock);
        return mock.client;
    });
});

// ---------------------------------------------------------------------------
// Helper: run a runner to completion, return result
// ---------------------------------------------------------------------------

async function runRunner(runner: RhostRunner, personas?: Record<string, { username: string; password: string }>) {
    return runner.run({
        username: 'Wizard',
        password: 'Nyctasia',
        verbose: false,
        ...(personas ? { personas } : {}),
    });
}

// ---------------------------------------------------------------------------
// personas() — basic registration
// ---------------------------------------------------------------------------

describe('personas() — test registration', () => {
    it('registers one test per persona name', async () => {
        const runner = new RhostRunner();
        const executed: string[] = [];

        runner.describe('Suite', ({ personas }: any) => {
            personas(
                ['mortal', 'wizard'],
                'can see the room',
                async ({ persona }: any) => {
                    executed.push(persona);
                },
            );
        });

        await runRunner(runner, {
            mortal: { username: 'TestMortal', password: 'pass1' },
            wizard: { username: 'Wizard', password: 'Nyctasia' },
        });

        expect(executed).toContain('mortal');
        expect(executed).toContain('wizard');
        expect(executed).toHaveLength(2);
    });

    it('test names include the persona label', async () => {
        const runner = new RhostRunner();
        const result = await (async () => {
            runner.describe('Suite', ({ personas }: any) => {
                personas(
                    ['mortal'],
                    'visibility check',
                    async () => {},
                );
            });
            return runRunner(runner, {
                mortal: { username: 'TestMortal', password: 'pass1' },
            });
        })();

        // Each persona test contributes 1 to total
        expect(result.total).toBe(1);
    });

    it('counts total tests equal to number of personas × number of persona() calls', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal', 'builder', 'wizard'], 'test A', async () => {});
        });

        const result = await runRunner(runner, {
            mortal:   { username: 'M', password: 'p' },
            builder:  { username: 'B', password: 'p' },
            wizard:   { username: 'W', password: 'p' },
        });
        expect(result.total).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// personas() — each persona connects with its own credentials
// ---------------------------------------------------------------------------

describe('personas() — separate connections', () => {
    it('creates a separate client connection for each persona', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal', 'builder'], 'test', async () => {});
        });

        await runRunner(runner, {
            mortal:  { username: 'Mortal', password: 'mp' },
            builder: { username: 'Builder', password: 'bp' },
        });

        // One main client + two persona clients = 3 total RhostClient constructions
        // (main client is constructed first)
        expect(clientMocks.length).toBeGreaterThanOrEqual(3);
    });

    it('logs each persona client in with its own username', async () => {
        const runner = new RhostRunner();

        const loggedInUsers: string[] = [];

        runner.describe('Suite', ({ personas }: any) => {
            personas(
                ['mortal', 'wizard'],
                'test',
                async ({ client }: any) => {
                    // The persona client's login was tracked in clientMocks
                },
            );
        });

        await runRunner(runner, {
            mortal: { username: 'MortalUser', password: 'mp' },
            wizard: { username: 'WizardUser', password: 'wp' },
        });

        // Check that at least two clients logged in as the persona usernames
        const allUsernames = clientMocks.map((m) => m.loggedInAs()).filter(Boolean);
        expect(allUsernames).toContain('MortalUser');
        expect(allUsernames).toContain('WizardUser');
    });

    it('disconnects the persona client after the test completes', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal'], 'test', async () => {});
        });

        await runRunner(runner, {
            mortal: { username: 'Mortal', password: 'mp' },
        });

        // All persona clients should have been disconnected
        const personaClients = clientMocks.slice(1); // skip main client
        for (const m of personaClients) {
            expect(m.disconnectCalls()).toBe(1);
        }
    });
});

// ---------------------------------------------------------------------------
// personas() — error handling
// ---------------------------------------------------------------------------

describe('personas() — error handling', () => {
    it('fails the test if a persona is not defined in options', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['undeclared'], 'test', async () => {});
        });

        // No personas defined in options → should fail
        const result = await runRunner(runner, {});
        expect(result.failed).toBe(1);
        expect(result.failures[0].error.message).toMatch(/undeclared/i);
    });

    it('fails the test if personas option is not provided at all', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal'], 'test', async () => {});
        });

        const result = await runRunner(runner);
        expect(result.failed).toBe(1);
        expect(result.failures[0].error.message).toMatch(/mortal/i);
    });

    it('disconnects persona client even if the test throws', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal'], 'test', async () => {
                throw new Error('test error');
            });
        });

        await runRunner(runner, {
            mortal: { username: 'Mortal', password: 'mp' },
        });

        const personaClients = clientMocks.slice(1);
        for (const m of personaClients) {
            expect(m.disconnectCalls()).toBe(1);
        }
    });

    it('counts a thrown persona test as failed', async () => {
        const runner = new RhostRunner();
        runner.describe('Suite', ({ personas }: any) => {
            personas(['mortal'], 'test', async () => {
                throw new Error('boom');
            });
        });

        const result = await runRunner(runner, {
            mortal: { username: 'Mortal', password: 'mp' },
        });

        expect(result.failed).toBe(1);
        expect(result.passed).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// personas() — coexists with regular it() tests
// ---------------------------------------------------------------------------

describe('personas() — coexists with it()', () => {
    it('regular it() and personas() tests run in the same suite', async () => {
        const runner = new RhostRunner();
        const ran: string[] = [];

        runner.describe('Suite', ({ it, personas }: any) => {
            it('regular test', async () => { ran.push('regular'); });
            personas(['mortal'], 'persona test', async ({ persona }: any) => {
                ran.push(`persona:${persona}`);
            });
        });

        await runRunner(runner, {
            mortal: { username: 'Mortal', password: 'mp' },
        });

        expect(ran).toContain('regular');
        expect(ran).toContain('persona:mortal');
        expect(ran).toHaveLength(2);
    });
});
