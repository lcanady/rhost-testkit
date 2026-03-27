import { RhostClient } from '../client';
import { RhostWorld } from '../world';

// ---------------------------------------------------------------------------
// Helper: mock client builder
// ---------------------------------------------------------------------------

interface MockClientOpts {
    /** Result returned from eval() calls */
    evalResults?: string[];
    /** Lines returned from command() calls */
    commandResults?: string[][];
}

function mockClient(opts: MockClientOpts = {}): RhostClient {
    const evalQueue = [...(opts.evalResults ?? [])];
    const cmdQueue  = [...(opts.commandResults ?? [])];

    return {
        eval: jest.fn().mockImplementation(() =>
            Promise.resolve(evalQueue.shift() ?? '')
        ),
        command: jest.fn().mockImplementation(() =>
            Promise.resolve(cmdQueue.shift() ?? [])
        ),
    } as unknown as RhostClient;
}

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe('RhostWorld.create()', () => {
    it('evaluates create(name) and returns the dbref', async () => {
        const client = mockClient({ evalResults: ['#42'] });
        const world = new RhostWorld(client);

        const dbref = await world.create('TestThing');
        expect(dbref).toBe('#42');
        expect(client.eval).toHaveBeenCalledWith('create(TestThing)');
    });

    it('passes cost when provided', async () => {
        const client = mockClient({ evalResults: ['#43'] });
        const world = new RhostWorld(client);

        await world.create('ExpensiveThing', 10);
        expect(client.eval).toHaveBeenCalledWith('create(ExpensiveThing,10)');
    });

    it('registers the dbref for cleanup', async () => {
        const client = mockClient({ evalResults: ['#42'], commandResults: [[]] });
        const world = new RhostWorld(client);

        await world.create('TestThing');
        expect(world.size).toBe(1);
    });

    it('throws if eval returns an unexpected value', async () => {
        const client = mockClient({ evalResults: ['#-1 CANNOT CREATE'] });
        const world = new RhostWorld(client);

        await expect(world.create('Bad')).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// dig()
// ---------------------------------------------------------------------------

describe('RhostWorld.dig()', () => {
    it('sends @dig and parses #NN from output', async () => {
        const client = mockClient({
            commandResults: [['TestRoom created as room #55.']],
        });
        const world = new RhostWorld(client);

        const dbref = await world.dig('TestRoom');
        expect(dbref).toBe('#55');
        expect(client.command).toHaveBeenCalledWith('@dig TestRoom');
    });

    it('throws if no dbref found in output', async () => {
        const client = mockClient({ commandResults: [['Permission denied.']] });
        const world = new RhostWorld(client);

        await expect(world.dig('Forbidden')).rejects.toThrow();
    });

    it('registers the dbref for cleanup', async () => {
        const client = mockClient({
            commandResults: [['Room #99 created.'], []],
        });
        const world = new RhostWorld(client);

        await world.dig('ARoom');
        expect(world.size).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// set() / get()
// ---------------------------------------------------------------------------

describe('RhostWorld.set()', () => {
    it('sends &ATTR dbref=value command', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);

        await world.set('#42', 'MYATTR', 'hello world');
        expect(client.command).toHaveBeenCalledWith('&MYATTR #42=hello world');
    });
});

describe('RhostWorld.get()', () => {
    it('evaluates get(dbref/ATTR)', async () => {
        const client = mockClient({ evalResults: ['hello world'] });
        const world = new RhostWorld(client);

        const val = await world.get('#42', 'MYATTR');
        expect(val).toBe('hello world');
        expect(client.eval).toHaveBeenCalledWith('get(#42/MYATTR)');
    });

    it('trims whitespace from result', async () => {
        const client = mockClient({ evalResults: ['  trimmed  '] });
        const world = new RhostWorld(client);

        const val = await world.get('#1', 'FOO');
        expect(val).toBe('trimmed');
    });
});

// ---------------------------------------------------------------------------
// lock() / flag()
// ---------------------------------------------------------------------------

describe('RhostWorld.lock()', () => {
    it('sends @lock dbref=lockstring', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);

        await world.lock('#42', 'Wizard');
        expect(client.command).toHaveBeenCalledWith('@lock #42=Wizard');
    });
});

describe('RhostWorld.flag()', () => {
    it('sets a flag with @set dbref=FLAG', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);

        await world.flag('#42', 'SAFE');
        expect(client.command).toHaveBeenCalledWith('@set #42=SAFE');
    });

    it('clears a flag with @set dbref=!FLAG', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);

        await world.flag('#42', 'SAFE', true);
        expect(client.command).toHaveBeenCalledWith('@set #42=!SAFE');
    });
});

// ---------------------------------------------------------------------------
// trigger()
// ---------------------------------------------------------------------------

describe('RhostWorld.trigger()', () => {
    it('sends @trigger dbref/ATTR without args', async () => {
        const client = mockClient({ commandResults: [['triggered output']] });
        const world = new RhostWorld(client);

        const lines = await world.trigger('#42', 'MYATTR');
        expect(client.command).toHaveBeenCalledWith('@trigger #42/MYATTR');
        expect(lines).toEqual(['triggered output']);
    });

    it('sends @trigger dbref/ATTR=args with args', async () => {
        const client = mockClient({ commandResults: [['result line']] });
        const world = new RhostWorld(client);

        await world.trigger('#42', 'MYATTR', 'arg1,arg2');
        expect(client.command).toHaveBeenCalledWith('@trigger #42/MYATTR=arg1,arg2');
    });
});

// ---------------------------------------------------------------------------
// cleanup()
// ---------------------------------------------------------------------------

describe('RhostWorld.cleanup()', () => {
    it('destroys all objects in reverse creation order', async () => {
        const commandCalls: string[] = [];
        const client = {
            eval: jest.fn()
                .mockResolvedValueOnce('#10')
                .mockResolvedValueOnce('#11')
                .mockResolvedValueOnce('#12'),
            command: jest.fn().mockImplementation((cmd: string) => {
                commandCalls.push(cmd);
                return Promise.resolve([]);
            }),
        } as unknown as RhostClient;

        const world = new RhostWorld(client);
        await world.create('A');
        await world.create('B');
        await world.create('C');

        await world.cleanup();

        // Should @nuke in reverse order: C (#12), B (#11), A (#10)
        expect(commandCalls).toEqual([
            '@nuke #12',
            '@nuke #11',
            '@nuke #10',
        ]);
    });

    it('resets size to 0 after cleanup', async () => {
        const client = mockClient({ evalResults: ['#42'], commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.create('Temp');
        await world.cleanup();
        expect(world.size).toBe(0);
    });

    it('ignores errors during destroy', async () => {
        const client = {
            eval: jest.fn().mockResolvedValue('#42'),
            command: jest.fn().mockRejectedValue(new Error('nuke failed')),
        } as unknown as RhostClient;

        const world = new RhostWorld(client);
        await world.create('Doomed');
        await expect(world.cleanup()).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// pemit()
// ---------------------------------------------------------------------------

describe('RhostWorld.pemit()', () => {
    it('sends @pemit target=msg', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.pemit('#42', 'Hello there');
        expect(client.command).toHaveBeenCalledWith('@pemit #42=Hello there');
    });

    it('throws on \\n in target', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.pemit('#42\n@pemit me=INJECTED', 'msg')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in msg', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.pemit('#42', 'msg\n@pemit me=INJECTED')).rejects.toThrow(/invalid/i);
    });

    it('does not register a dbref', async () => {
        const world = new RhostWorld(mockClient({ commandResults: [[]] }));
        await world.pemit('#1', 'hi');
        expect(world.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// remit()
// ---------------------------------------------------------------------------

describe('RhostWorld.remit()', () => {
    it('sends @remit room=msg', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.remit('#10', 'Room message');
        expect(client.command).toHaveBeenCalledWith('@remit #10=Room message');
    });

    it('throws on \\n in room', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.remit('#10\n@quit', 'msg')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in msg', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.remit('#10', 'msg\n@quit')).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// force()
// ---------------------------------------------------------------------------

describe('RhostWorld.force()', () => {
    it('sends @force actor=cmd', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.force('#42', 'say Hello');
        expect(client.command).toHaveBeenCalledWith('@force #42=say Hello');
    });

    it('throws on \\n in actor', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.force('#42\n@pemit me=X', 'say hi')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in cmd', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.force('#42', 'say hi\n@nuke me')).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// parent()
// ---------------------------------------------------------------------------

describe('RhostWorld.parent()', () => {
    it('sends @parent child=parent', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.parent('#42', '#1');
        expect(client.command).toHaveBeenCalledWith('@parent #42=#1');
    });

    it('throws on \\n in child', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.parent('#42\n@quit', '#1')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in parent', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.parent('#42', '#1\n@quit')).rejects.toThrow(/invalid/i);
    });

    it('does not register a dbref', async () => {
        const world = new RhostWorld(mockClient({ commandResults: [[]] }));
        await world.parent('#42', '#1');
        expect(world.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// zone()
// ---------------------------------------------------------------------------

describe('RhostWorld.zone()', () => {
    it('digs a room then sets INHERIT_ZONE, returns dbref', async () => {
        const client = mockClient({
            commandResults: [
                ['ZoneRoom created as room #77.'],
                [],  // @set response
            ],
        });
        const world = new RhostWorld(client);
        const dbref = await world.zone('ZoneRoom');
        expect(dbref).toBe('#77');
        expect(client.command).toHaveBeenNthCalledWith(1, '@dig ZoneRoom');
        expect(client.command).toHaveBeenNthCalledWith(2, '@set #77=INHERIT_ZONE');
    });

    it('registers the zone room for cleanup', async () => {
        const client = mockClient({
            commandResults: [['Zone #88 created.'], []],
        });
        const world = new RhostWorld(client);
        await world.zone('MyZone');
        expect(world.size).toBe(1);
    });

    it('throws if no dbref found in dig output', async () => {
        const client = mockClient({ commandResults: [['Permission denied.']] });
        const world = new RhostWorld(client);
        await expect(world.zone('Forbidden')).rejects.toThrow(/could not parse dbref/i);
    });

    it('throws on \\n in name', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.zone('Zone\n@quit')).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// addToChannel()
// ---------------------------------------------------------------------------

describe('RhostWorld.addToChannel()', () => {
    it('sends @channel/add chan=dbref', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.addToChannel('#42', 'Public');
        expect(client.command).toHaveBeenCalledWith('@channel/add Public=#42');
    });

    it('throws on \\n in dbref', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.addToChannel('#42\n@quit', 'Public')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in chan', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.addToChannel('#42', 'Public\n@quit')).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// grantQuota()
// ---------------------------------------------------------------------------

describe('RhostWorld.grantQuota()', () => {
    it('sends @quota/set dbref=n', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.grantQuota('#42', 50);
        expect(client.command).toHaveBeenCalledWith('@quota/set #42=50');
    });

    it('throws on \\n in dbref', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.grantQuota('#42\n@quit', 10)).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// wait()
// ---------------------------------------------------------------------------

describe('RhostWorld.wait()', () => {
    it('resolves after the given number of milliseconds', async () => {
        const world = new RhostWorld(mockClient());
        const t0 = Date.now();
        await world.wait(50);
        expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    });

    it('does not affect world.size', async () => {
        const world = new RhostWorld(mockClient());
        await world.wait(0);
        expect(world.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// mail()
// ---------------------------------------------------------------------------

describe('RhostWorld.mail()', () => {
    it('sends @mail to=subj/body', async () => {
        const client = mockClient({ commandResults: [[]] });
        const world = new RhostWorld(client);
        await world.mail('#42', 'Test subject', 'Hello body');
        expect(client.command).toHaveBeenCalledWith('@mail #42=Test subject/Hello body');
    });

    it('throws on \\n in to', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.mail('#42\n@quit', 'subj', 'body')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in subj', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.mail('#42', 'subj\n@quit', 'body')).rejects.toThrow(/invalid/i);
    });

    it('throws on \\n in body', async () => {
        const world = new RhostWorld(mockClient());
        await expect(world.mail('#42', 'subj', 'body\n@quit')).rejects.toThrow(/invalid/i);
    });
});

// ---------------------------------------------------------------------------
// size getter
// ---------------------------------------------------------------------------

describe('RhostWorld.size', () => {
    it('tracks creation count', async () => {
        const client = mockClient({ evalResults: ['#1', '#2', '#3'] });
        const world = new RhostWorld(client);
        expect(world.size).toBe(0);
        await world.create('A');
        expect(world.size).toBe(1);
        await world.create('B');
        expect(world.size).toBe(2);
    });
});
