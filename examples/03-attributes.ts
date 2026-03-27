/**
 * 03-attributes.ts — Object attributes and the RhostWorld fixture manager
 *
 * Covers: creating objects, setting/getting attributes, flags, locks,
 * and verifying attribute-stored data with MUSH expressions.
 *
 * Every test gets a fresh world; objects are automatically @nuked after
 * each test completes (pass or fail).
 *
 * Run:
 *   npx ts-node examples/03-attributes.ts
 */
import { RhostRunner } from '../src';

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Basic create / set / get
// ---------------------------------------------------------------------------

runner.describe('Object creation', ({ it }) => {
    it('create() returns a valid dbref', async ({ expect, world }) => {
        const obj = await world.create('TestThing');
        // JS-level regex check (sync — not a MUSH eval)
        if (!/^#\d+$/.test(obj)) throw new Error(`Bad dbref: ${obj}`);
        // MUSH-level check
        await expect(`isdbref(${obj})`).toBe('1');
    });

    it('created object has the right name', async ({ expect, world }) => {
        const obj = await world.create('NamedThing');
        await expect(`name(${obj})`).toBe('NamedThing');
    });

    it('created object is a THING', async ({ expect, world }) => {
        const obj = await world.create('TypeCheck');
        await expect(`type(${obj})`).toBe('THING');
    });

    it('multiple objects get distinct dbrefs', async ({ expect, world }) => {
        const a = await world.create('ObjA');
        const b = await world.create('ObjB');
        if (a === b) throw new Error('Objects share a dbref');
        await expect(`eq(${a},${b})`).toBe('0');
    });

    it('world.size tracks created objects', async ({ world }) => {
        const before = world.size;
        if (before !== 0) throw new Error('Expected empty world');
        await world.create('Obj1');
        await world.create('Obj2');
        const after = world.size;
        if (after !== 2) throw new Error(`Expected size 2, got ${after}`);
    });
});

// ---------------------------------------------------------------------------
// Setting and getting attributes
// ---------------------------------------------------------------------------

runner.describe('Attribute set / get', ({ it }) => {
    it('set and get a plain string attribute', async ({ expect, world }) => {
        const obj = await world.create('DataStore');
        await world.set(obj, 'MYATTR', 'hello world');
        await expect(`get(${obj}/MYATTR)`).toBe('hello world');
    });

    it('world.get() is equivalent to MUSH get()', async ({ expect, world }) => {
        const obj = await world.create('GetTest');
        await world.set(obj, 'VALUE', 'forty-two');
        const sdkVal = await world.get(obj, 'VALUE');
        if (sdkVal !== 'forty-two') throw new Error(`SDK get returned: ${sdkVal}`);
        await expect(`get(${obj}/VALUE)`).toBe('forty-two');
    });

    it('missing attribute returns empty string', async ({ expect, world }) => {
        const obj = await world.create('EmptyObj');
        await expect(`get(${obj}/NOSUCHATTR)`).toBe('');
        await expect(`get(${obj}/NOSUCHATTR)`).toBeFalsy();
    });

    it('attribute can store a number (as string)', async ({ expect, world }) => {
        const obj = await world.create('NumStore');
        await world.set(obj, 'COUNT', '42');
        await expect(`get(${obj}/COUNT)`).toBe('42');
        await expect(`get(${obj}/COUNT)`).toBeNumber();
    });

    it('attribute value is usable in expressions', async ({ expect, world }) => {
        const obj = await world.create('Calculator');
        await world.set(obj, 'X', '10');
        await world.set(obj, 'Y', '32');
        // Use both attributes in an add() call
        await expect(`add(get(${obj}/X),get(${obj}/Y))`).toBe('42');
    });

    it('overwriting an attribute replaces the value', async ({ expect, world }) => {
        const obj = await world.create('Mutable');
        await world.set(obj, 'STATUS', 'first');
        await expect(`get(${obj}/STATUS)`).toBe('first');
        await world.set(obj, 'STATUS', 'second');
        await expect(`get(${obj}/STATUS)`).toBe('second');
    });

    it('hasflag() before and after setting', async ({ expect, world }) => {
        const obj = await world.create('FlagTest');
        await expect(`hasflag(${obj},inherit)`).toBe('0');
        await world.flag(obj, 'INHERIT');
        await expect(`hasflag(${obj},inherit)`).toBe('1');
    });

    it('clearing a flag', async ({ expect, world }) => {
        const obj = await world.create('ClearFlag');
        await world.flag(obj, 'SAFE');
        await expect(`hasflag(${obj},safe)`).toBe('1');
        await world.flag(obj, 'SAFE', true);   // clear=true
        await expect(`hasflag(${obj},safe)`).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// Attribute stored MUSHcode — softcode on objects
// ---------------------------------------------------------------------------

runner.describe('Softcode attributes', ({ it }) => {
    it('attribute containing an expression evaluates correctly', async ({ expect, world }) => {
        const obj = await world.create('Evaluator');
        // Store the source code in the attribute
        await world.set(obj, 'DOUBLE', 'mul(%0,2)');
        // Retrieve and evaluate it with u()
        await expect(`u(${obj}/DOUBLE,21)`).toBe('42');
    });

    it('u() passes multiple args as %0 %1 %2', async ({ expect, world }) => {
        const obj = await world.create('AddHelper');
        await world.set(obj, 'ADD3', 'add(%0,add(%1,%2))');
        await expect(`u(${obj}/ADD3,10,20,12)`).toBe('42');
    });

    it('attribute references %! (self) correctly', async ({ expect, world }) => {
        const obj = await world.create('SelfRef');
        await world.set(obj, 'WHOAMI', 'name(%!)');
        await expect(`u(${obj}/WHOAMI)`).toBe('SelfRef');
    });

    it('chained u() calls', async ({ expect, world }) => {
        const obj = await world.create('Chain');
        await world.set(obj, 'DOUBLE', 'mul(%0,2)');
        await world.set(obj, 'QUAD',   `u(${obj}/DOUBLE,u(${obj}/DOUBLE,%0))`);
        await expect(`u(${obj}/QUAD,3)`).toBe('12');
    });
});

// ---------------------------------------------------------------------------
// Multiple objects interacting
// ---------------------------------------------------------------------------

runner.describe('Multi-object interactions', ({ it }) => {
    it('two objects can reference each other', async ({ expect, world }) => {
        const a = await world.create('ObjA');
        const b = await world.create('ObjB');
        await world.set(a, 'PARTNER', b);       // store dbref of b in a
        await world.set(b, 'PARTNER', a);       // store dbref of a in b

        // Traverse the reference
        await expect(`get(get(${a}/PARTNER)/PARTNER)`).toBe(a);
    });

    it('count objects by type', async ({ expect, world }) => {
        // Create three things
        for (let i = 0; i < 3; i++) {
            await world.create(`CountedThing${i}`);
        }
        // world.size includes all created objects
        if (world.size !== 3) throw new Error(`Expected 3, got ${world.size}`);
    });
});

// ---------------------------------------------------------------------------
// Room creation
// ---------------------------------------------------------------------------

runner.describe('Room fixtures', ({ it }) => {
    it('dig() creates a room with the given name', async ({ expect, world }) => {
        const room = await world.dig('Test Chamber');
        await expect(`name(${room})`).toBe('Test Chamber');
    });

    it('dug room is of type ROOM', async ({ expect, world }) => {
        const room = await world.dig('Type Room');
        await expect(`type(${room})`).toBe('ROOM');
    });

    it('room has a valid dbref', async ({ expect, world }) => {
        const room = await world.dig('Dbref Room');
        await expect(`isdbref(${room})`).toBe('1');
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
