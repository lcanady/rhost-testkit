/**
 * Tests for the softcode deploy pipeline:
 *   parseDeployFile  — parses &ATTR dbref=value lines
 *   snapshotObjects  — captures attr names + values per dbref
 *   restoreSnapshot  — restores attrs from a snapshot
 *   deploy           — orchestrates snapshot → apply → test → rollback
 */
import { RhostClient } from '../client';
import {
    parseDeployFile,
    snapshotObjects,
    restoreSnapshot,
    deploy,
    DeployCommand,
    DeploySnapshot,
} from '../deployer';

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

interface MockState {
    [dbref: string]: { [attr: string]: string };
}

function mockClient(state: MockState = {}): {
    client: RhostClient;
    commands: string[];
} {
    const commands: string[] = [];
    const client = {
        eval: jest.fn(async (expr: string) => {
            const lattrM = expr.match(/^lattr\(#(\d+)\)$/);
            if (lattrM) {
                const obj = state[`#${lattrM[1]}`] ?? {};
                return Object.keys(obj).join(' ');
            }
            const getM = expr.match(/^get\(#(\d+)\/([A-Z0-9_]+)\)$/);
            if (getM) {
                return state[`#${getM[1]}`]?.[getM[2]] ?? '';
            }
            return '';
        }),
        command: jest.fn(async (cmd: string) => {
            commands.push(cmd);
            // Simulate &ATTR #NN=value applying to state
            const setM = cmd.match(/^&([A-Z0-9_]+)\s+(#\d+)=(.*)$/s);
            if (setM) {
                const [, attr, dbref, value] = setM;
                if (!state[dbref]) state[dbref] = {};
                state[dbref][attr] = value;
            }
            // Simulate @wipe #NN/ATTR removing from state
            const wipeM = cmd.match(/^@wipe\s+(#\d+)\/([A-Z0-9_]+)$/);
            if (wipeM) {
                const [, dbref, attr] = wipeM;
                if (state[dbref]) delete state[dbref][attr];
            }
            return [];
        }),
    } as unknown as RhostClient;
    return { client, commands };
}

// ---------------------------------------------------------------------------
// parseDeployFile
// ---------------------------------------------------------------------------

describe('parseDeployFile', () => {
    it('parses a single &ATTR line', () => {
        const cmds = parseDeployFile('&GREET #42=Hello, %n!');
        expect(cmds).toHaveLength(1);
        expect(cmds[0]).toEqual({ dbref: '#42', attr: 'GREET', value: 'Hello, %n!' });
    });

    it('parses multiple lines', () => {
        const content = '&GREET #42=Hello\n&FAREWELL #42=Goodbye';
        const cmds = parseDeployFile(content);
        expect(cmds).toHaveLength(2);
        expect(cmds[0].attr).toBe('GREET');
        expect(cmds[1].attr).toBe('FAREWELL');
    });

    it('ignores blank lines', () => {
        const cmds = parseDeployFile('\n&GREET #42=Hello\n\n&BYE #42=Bye\n');
        expect(cmds).toHaveLength(2);
    });

    it('ignores comment lines starting with #', () => {
        const cmds = parseDeployFile('# This is a comment\n&GREET #42=Hello');
        expect(cmds).toHaveLength(1);
        expect(cmds[0].attr).toBe('GREET');
    });

    it('ignores comment lines starting with @@', () => {
        const cmds = parseDeployFile('@@ Object header\n&GREET #42=Hello');
        expect(cmds).toHaveLength(1);
    });

    it('parses different dbrefs', () => {
        const cmds = parseDeployFile('&ATTR1 #42=val1\n&ATTR2 #99=val2');
        expect(cmds[0].dbref).toBe('#42');
        expect(cmds[1].dbref).toBe('#99');
    });

    it('preserves value including spaces and commas', () => {
        const cmds = parseDeployFile('&CODE #42=iter(lnum(1,5),mul(##,2))');
        expect(cmds[0].value).toBe('iter(lnum(1,5),mul(##,2))');
    });

    it('returns empty array for empty input', () => {
        expect(parseDeployFile('')).toHaveLength(0);
        expect(parseDeployFile('   ')).toHaveLength(0);
    });

    it('returns empty array for content with only comments', () => {
        expect(parseDeployFile('# comment\n@@ header')).toHaveLength(0);
    });

    it('attr names are uppercased', () => {
        const cmds = parseDeployFile('&greet #42=hello');
        expect(cmds[0].attr).toBe('GREET');
    });
});

// ---------------------------------------------------------------------------
// snapshotObjects
// ---------------------------------------------------------------------------

describe('snapshotObjects', () => {
    it('captures attr names and values for each dbref', async () => {
        const { client } = mockClient({
            '#42': { GREET: 'hello', VALUE: '99' },
        });
        const snap = await snapshotObjects(client, ['#42']);
        expect(snap['#42']['GREET']).toBe('hello');
        expect(snap['#42']['VALUE']).toBe('99');
    });

    it('handles a dbref with no attributes', async () => {
        const { client } = mockClient({ '#42': {} });
        const snap = await snapshotObjects(client, ['#42']);
        expect(snap['#42']).toEqual({});
    });

    it('captures multiple dbrefs independently', async () => {
        const { client } = mockClient({
            '#42': { A: 'one' },
            '#99': { B: 'two' },
        });
        const snap = await snapshotObjects(client, ['#42', '#99']);
        expect(snap['#42']['A']).toBe('one');
        expect(snap['#99']['B']).toBe('two');
    });

    it('returns empty object for empty dbrefs list', async () => {
        const { client } = mockClient({});
        const snap = await snapshotObjects(client, []);
        expect(snap).toEqual({});
    });

    it('evals lattr then get for each attr', async () => {
        const evalSpy = jest.fn(async (expr: string) => {
            if (expr.startsWith('lattr')) return 'FOO';
            if (expr.startsWith('get')) return 'bar';
            return '';
        });
        const client = { eval: evalSpy, command: jest.fn() } as unknown as RhostClient;
        await snapshotObjects(client, ['#1']);
        expect(evalSpy).toHaveBeenCalledWith('lattr(#1)');
        expect(evalSpy).toHaveBeenCalledWith('get(#1/FOO)');
    });
});

// ---------------------------------------------------------------------------
// restoreSnapshot
// ---------------------------------------------------------------------------

describe('restoreSnapshot', () => {
    it('restores an attribute that was changed', async () => {
        const state: MockState = { '#42': { GREET: 'new value' } };
        const { client, commands } = mockClient(state);
        const snapshot: DeploySnapshot = { '#42': { GREET: 'original' } };
        await restoreSnapshot(client, snapshot);
        expect(commands).toContain('&GREET #42=original');
    });

    it('wipes an attribute that did not exist before deploy', async () => {
        const state: MockState = { '#42': { ORIGINAL: 'val', NEW: 'added' } };
        const { client, commands } = mockClient(state);
        const snapshot: DeploySnapshot = { '#42': { ORIGINAL: 'val' } };
        await restoreSnapshot(client, snapshot, ['#42']);
        expect(commands.some((c) => c.includes('@wipe #42/NEW'))).toBe(true);
    });

    it('does nothing for unchanged attributes', async () => {
        const state: MockState = { '#42': { GREET: 'same' } };
        const { client, commands } = mockClient(state);
        const snapshot: DeploySnapshot = { '#42': { GREET: 'same' } };
        await restoreSnapshot(client, snapshot);
        // No commands needed if value is the same
        expect(commands).toHaveLength(0);
    });

    it('handles multiple dbrefs', async () => {
        const state: MockState = {
            '#42': { A: 'changed' },
            '#99': { B: 'changed' },
        };
        const { client, commands } = mockClient(state);
        const snapshot: DeploySnapshot = {
            '#42': { A: 'orig' },
            '#99': { B: 'orig' },
        };
        await restoreSnapshot(client, snapshot);
        expect(commands).toContain('&A #42=orig');
        expect(commands).toContain('&B #99=orig');
    });
});

// ---------------------------------------------------------------------------
// deploy — success path (no rollback)
// ---------------------------------------------------------------------------

describe('deploy — success (no test)', () => {
    it('applies each command to the server', async () => {
        const { client, commands } = mockClient({ '#42': {} });
        const cmds: DeployCommand[] = [
            { dbref: '#42', attr: 'GREET', value: 'hello' },
            { dbref: '#42', attr: 'BYE', value: 'goodbye' },
        ];
        await deploy(client, cmds);
        expect(commands).toContain('&GREET #42=hello');
        expect(commands).toContain('&BYE #42=goodbye');
    });

    it('returns applied count equal to number of commands', async () => {
        const { client } = mockClient({ '#42': {} });
        const cmds: DeployCommand[] = [
            { dbref: '#42', attr: 'A', value: '1' },
            { dbref: '#42', attr: 'B', value: '2' },
        ];
        const result = await deploy(client, cmds);
        expect(result.applied).toBe(2);
    });

    it('returns rolledBack: false when no test provided', async () => {
        const { client } = mockClient({ '#42': {} });
        const result = await deploy(client, [{ dbref: '#42', attr: 'A', value: '1' }]);
        expect(result.rolledBack).toBe(false);
        expect(result.testPassed).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// deploy — test passes (no rollback)
// ---------------------------------------------------------------------------

describe('deploy — test passes', () => {
    it('calls the test function after applying commands', async () => {
        const { client } = mockClient({ '#42': {} });
        const testFn = jest.fn(async () => true);
        await deploy(client, [{ dbref: '#42', attr: 'A', value: '1' }], { test: testFn });
        expect(testFn).toHaveBeenCalledTimes(1);
    });

    it('returns testPassed: true and rolledBack: false when test passes', async () => {
        const { client } = mockClient({ '#42': {} });
        const result = await deploy(
            client,
            [{ dbref: '#42', attr: 'A', value: '1' }],
            { test: async () => true },
        );
        expect(result.testPassed).toBe(true);
        expect(result.rolledBack).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// deploy — test fails (rollback)
// ---------------------------------------------------------------------------

describe('deploy — test fails, rollback', () => {
    it('restores original attribute values when test fails', async () => {
        const state: MockState = { '#42': { GREET: 'original' } };
        const { client } = mockClient(state);
        await deploy(
            client,
            [{ dbref: '#42', attr: 'GREET', value: 'broken' }],
            { test: async () => false },
        );
        // After rollback, state should be restored
        expect(state['#42']['GREET']).toBe('original');
    });

    it('returns rolledBack: true and testPassed: false when test fails', async () => {
        const { client } = mockClient({ '#42': { A: 'orig' } });
        const result = await deploy(
            client,
            [{ dbref: '#42', attr: 'A', value: 'broken' }],
            { test: async () => false },
        );
        expect(result.rolledBack).toBe(true);
        expect(result.testPassed).toBe(false);
    });

    it('rolls back when test throws', async () => {
        const state: MockState = { '#42': { A: 'original' } };
        const { client } = mockClient(state);
        const result = await deploy(
            client,
            [{ dbref: '#42', attr: 'A', value: 'broken' }],
            { test: async () => { throw new Error('test exploded'); } },
        );
        expect(result.rolledBack).toBe(true);
        expect(state['#42']['A']).toBe('original');
    });
});

// ---------------------------------------------------------------------------
// deploy — dry-run
// ---------------------------------------------------------------------------

describe('deploy — dry-run', () => {
    it('does not apply any commands in dry-run mode', async () => {
        const { client, commands } = mockClient({ '#42': {} });
        await deploy(
            client,
            [{ dbref: '#42', attr: 'A', value: '1' }],
            { dryRun: true },
        );
        // Only snapshot reads (eval) should have been called, no commands
        expect(commands).toHaveLength(0);
    });

    it('returns applied: 0 in dry-run mode', async () => {
        const { client } = mockClient({ '#42': {} });
        const result = await deploy(
            client,
            [{ dbref: '#42', attr: 'A', value: '1' }],
            { dryRun: true },
        );
        expect(result.applied).toBe(0);
        expect(result.dryRun).toBe(true);
    });
});
