/**
 * Tests for world.snapshot() / WorldSnapshot — side-effect assertion mode.
 *
 * snapshot() captures the current state of all tracked objects.
 * assertNoChanges() re-inspects and throws if anything changed.
 * diff() returns a structured description of what changed.
 */
import { RhostClient } from '../client';
import { RhostWorld } from '../world';

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

type EvalFn = (expr: string) => Promise<string>;

function mockClient(evalFn: EvalFn): RhostClient {
    return {
        eval: jest.fn(evalFn),
        command: jest.fn(async () => []),
    } as unknown as RhostClient;
}

/** Build a mock that returns lattr lists and get values from a map. */
function mockClientFromState(
    state: Record<string, Record<string, string>>,
): RhostClient {
    return mockClient(async (expr: string) => {
        // lattr(#N) → space-separated attr list
        const lattrMatch = expr.match(/^lattr\(#(\d+)\)$/);
        if (lattrMatch) {
            const dbref = `#${lattrMatch[1]}`;
            const obj = state[dbref] ?? {};
            return Object.keys(obj).join(' ');
        }
        // get(#N/ATTR)
        const getMatch = expr.match(/^get\(#(\d+)\/([A-Z0-9_]+)\)$/);
        if (getMatch) {
            const dbref = `#${getMatch[1]}`;
            const attr = getMatch[2];
            return state[dbref]?.[attr] ?? '';
        }
        // create() → return #NN based on how many objects exist
        const createMatch = expr.match(/^create\(([^)]+)\)$/);
        if (createMatch) {
            const nextId = Object.keys(state).length + 10;
            const dbref = `#${nextId}`;
            state[dbref] = {};
            return dbref;
        }
        return '';
    });
}

// ---------------------------------------------------------------------------
// world.snapshot()
// ---------------------------------------------------------------------------

describe('world.snapshot()', () => {
    it('returns a WorldSnapshot object', async () => {
        const client = mockClientFromState({ '#42': { MYATTR: 'hello' } });
        const world = new RhostWorld(client);
        // Manually register a dbref (simulate world.create having run)
        await (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        expect(snap).toBeDefined();
        expect(typeof snap.assertNoChanges).toBe('function');
        expect(typeof snap.diff).toBe('function');
    });

    it('captures each tracked dbref and its attribute list', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello', VALUE: '99' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        // Capture internal state for verification
        const internal = (snap as any)._state;
        expect(internal['#42']).toBeDefined();
        expect(internal['#42'].attrs).toContain('GREET');
        expect(internal['#42'].attrs).toContain('VALUE');
    });

    it('handles world with no tracked objects', async () => {
        const client = mockClientFromState({});
        const world = new RhostWorld(client);
        const snap = await world.snapshot();
        await expect(snap.assertNoChanges()).resolves.not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// snapshot.diff() — no changes
// ---------------------------------------------------------------------------

describe('snapshot.diff() — clean', () => {
    it('returns clean:true when nothing has changed', async () => {
        const state = { '#42': { GREET: 'hello' } };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        const diff = await snap.diff();

        expect(diff.clean).toBe(true);
        expect(diff.created).toHaveLength(0);
        expect(diff.destroyed).toHaveLength(0);
        expect(diff.modified).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// snapshot.diff() — object created
// ---------------------------------------------------------------------------

describe('snapshot.diff() — new object', () => {
    it('reports created when a new dbref appears in world after snapshot', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();

        // Simulate a new object being tracked after snapshot
        state['#99'] = { NEWATTR: 'value' };
        (world as any).dbrefs.push('#99');

        const diff = await snap.diff();
        expect(diff.clean).toBe(false);
        expect(diff.created).toContain('#99');
    });
});

// ---------------------------------------------------------------------------
// snapshot.diff() — object destroyed
// ---------------------------------------------------------------------------

describe('snapshot.diff() — destroyed object', () => {
    it('reports destroyed when a tracked dbref disappears from world after snapshot', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello' },
            '#43': { OTHER: 'value' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42', '#43');

        const snap = await world.snapshot();

        // Simulate #43 being removed from tracking
        (world as any).dbrefs = ['#42'];

        const diff = await snap.diff();
        expect(diff.clean).toBe(false);
        expect(diff.destroyed).toContain('#43');
    });
});

// ---------------------------------------------------------------------------
// snapshot.diff() — attribute added
// ---------------------------------------------------------------------------

describe('snapshot.diff() — attribute added', () => {
    it('reports modified with added attr when a new attribute appears', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();

        // Add an attribute after snapshot
        state['#42']['NEWATTR'] = 'newval';

        const diff = await snap.diff();
        expect(diff.clean).toBe(false);
        const mod = diff.modified.find((m) => m.dbref === '#42');
        expect(mod).toBeDefined();
        expect(mod!.added).toContain('NEWATTR');
    });
});

// ---------------------------------------------------------------------------
// snapshot.diff() — attribute removed
// ---------------------------------------------------------------------------

describe('snapshot.diff() — attribute removed', () => {
    it('reports modified with removed attr when an attribute disappears', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello', TEMP: 'gone' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();

        // Remove an attribute
        delete state['#42']['TEMP'];

        const diff = await snap.diff();
        expect(diff.clean).toBe(false);
        const mod = diff.modified.find((m) => m.dbref === '#42');
        expect(mod!.removed).toContain('TEMP');
    });
});

// ---------------------------------------------------------------------------
// snapshot.assertNoChanges()
// ---------------------------------------------------------------------------

describe('snapshot.assertNoChanges()', () => {
    it('resolves cleanly when nothing changed', async () => {
        const state = { '#42': { GREET: 'hello' } };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        await expect(snap.assertNoChanges()).resolves.not.toThrow();
    });

    it('throws a WorldSideEffectError when an attribute is added', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        state['#42']['SIDEEFFECT'] = 'oops';

        await expect(snap.assertNoChanges()).rejects.toThrow(/side.?effect|changed|SIDEEFFECT/i);
    });

    it('throws when a new object is created after snapshot', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { GREET: 'hello' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        state['#77'] = {};
        (world as any).dbrefs.push('#77');

        await expect(snap.assertNoChanges()).rejects.toThrow(/#77|created/i);
    });

    it('error message lists what changed', async () => {
        const state: Record<string, Record<string, string>> = {
            '#42': { A: '1' },
        };
        const client = mockClientFromState(state);
        const world = new RhostWorld(client);
        (world as any).dbrefs.push('#42');

        const snap = await world.snapshot();
        state['#42']['B'] = '2';

        let msg = '';
        try {
            await snap.assertNoChanges();
        } catch (err) {
            msg = (err as Error).message;
        }
        expect(msg).toMatch(/#42/);
        expect(msg).toMatch(/B/);
    });
});
