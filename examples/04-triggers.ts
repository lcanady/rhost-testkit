/**
 * 04-triggers.ts — Testing @trigger and output capture
 *
 * Covers: @trigger with and without args, @pemit output capture,
 * side-effect verification via get() after trigger, trigger chains,
 * and testing code that branches on arguments.
 *
 * Run:
 *   npx ts-node examples/04-triggers.ts
 */
import { RhostRunner } from '../src';

const runner = new RhostRunner();

// ---------------------------------------------------------------------------
// Basic trigger output
// ---------------------------------------------------------------------------

runner.describe('@trigger — output capture', ({ it }) => {
    it('think emits its result to the enactor', async ({ world }) => {
        const obj = await world.create('Thinker');
        await world.set(obj, 'SAY', 'think Hello from trigger!');

        const lines = await world.trigger(obj, 'SAY');
        const out = lines.join('\n');
        if (!out.includes('Hello from trigger!')) {
            throw new Error(`Expected output, got: ${JSON.stringify(out)}`);
        }
    });

    it('@pemit %# sends output to the enactor', async ({ world }) => {
        const obj = await world.create('Emitter');
        await world.set(obj, 'GREET', '@pemit %#=Greetings, wizard!');

        const lines = await world.trigger(obj, 'GREET');
        const out = lines.join('\n');
        if (!out.includes('Greetings, wizard!')) {
            throw new Error(`Missing output: ${JSON.stringify(out)}`);
        }
    });

    it('trigger with no output produces an empty array', async ({ world }) => {
        const obj = await world.create('Silent');
        await world.set(obj, 'NOP', '@switch 0=1,noop');   // never matches → no output

        const lines = await world.trigger(obj, 'NOP');
        // Lines may be empty or contain only whitespace
        const meaningful = lines.filter((l) => l.trim().length > 0);
        if (meaningful.length > 0) {
            throw new Error(`Expected no output, got: ${JSON.stringify(lines)}`);
        }
    });
});

// ---------------------------------------------------------------------------
// Passing arguments (%0, %1, ...)
// ---------------------------------------------------------------------------

runner.describe('@trigger — arguments', ({ it }) => {
    it('single arg is accessible as %0', async ({ world }) => {
        const obj = await world.create('EchoArg');
        await world.set(obj, 'ECHO', 'think You said: %0');

        const lines = await world.trigger(obj, 'ECHO', 'mushcode');
        const out = lines.join('\n');
        if (!out.includes('You said: mushcode')) {
            throw new Error(`Output mismatch: ${JSON.stringify(out)}`);
        }
    });

    it('multiple args are %0, %1, %2', async ({ world }) => {
        const obj = await world.create('MultiArg');
        await world.set(obj, 'FORMAT', 'think [ucstr(%0)]-[lcstr(%1)]-[repeat(%2,3)]');

        const lines = await world.trigger(obj, 'FORMAT', 'hello,WORLD,x');
        const out = lines.join('');
        if (out !== 'HELLO-world-xxx') {
            throw new Error(`Expected "HELLO-world-xxx", got: ${JSON.stringify(out)}`);
        }
    });

    it('numeric args can be used in math', async ({ world }) => {
        const obj = await world.create('MathTrigger');
        await world.set(obj, 'ADD', 'think add(%0,%1)');

        const lines = await world.trigger(obj, 'ADD', '17,25');
        if (lines.join('').trim() !== '42') {
            throw new Error(`Expected 42, got: ${JSON.stringify(lines)}`);
        }
    });

    it('%# is the enactor (Wizard) inside a trigger', async ({ world }) => {
        const obj = await world.create('WhoAmI');
        await world.set(obj, 'ID', 'think name(%#)');

        const lines = await world.trigger(obj, 'ID');
        // The enactor is Wizard
        if (!lines.join('').toLowerCase().includes('wizard')) {
            throw new Error(`Expected Wizard, got: ${JSON.stringify(lines)}`);
        }
    });
});

// ---------------------------------------------------------------------------
// Side-effects: trigger modifies object state
// ---------------------------------------------------------------------------

runner.describe('@trigger — side effects', ({ it }) => {
    it('trigger can write back to an attribute on itself', async ({ expect, world }) => {
        const obj = await world.create('Counter');
        await world.set(obj, 'COUNT', '0');
        // &COUNT %! sets the COUNT attribute on self to the new value
        await world.set(obj, 'INC', '&COUNT %!=[add(get(%!/COUNT),1)]');

        await expect(`get(${obj}/COUNT)`).toBe('0');
        await world.trigger(obj, 'INC');
        await expect(`get(${obj}/COUNT)`).toBe('1');
        await world.trigger(obj, 'INC');
        await expect(`get(${obj}/COUNT)`).toBe('2');
        await world.trigger(obj, 'INC');
        await expect(`get(${obj}/COUNT)`).toBe('3');
    });

    it('trigger can append to a list attribute', async ({ expect, world }) => {
        const obj = await world.create('Collector');
        await world.set(obj, 'LOG', '');
        await world.set(obj, 'APPEND', '&LOG %!=[trim(get(%!/LOG) %0)]');

        await world.trigger(obj, 'APPEND', 'first');
        await world.trigger(obj, 'APPEND', 'second');
        await world.trigger(obj, 'APPEND', 'third');

        await expect(`get(${obj}/LOG)`).toBe('first second third');
        await expect(`get(${obj}/LOG)`).toHaveWordCount(3);
        await expect(`get(${obj}/LOG)`).toContainWord('second');
    });

    it('trigger can modify a separate object', async ({ expect, world }) => {
        const store  = await world.create('DataStore');
        const writer = await world.create('Writer');

        await world.set(store, 'VALUE', 'original');
        await world.set(writer, 'WRITE', `&VALUE ${store}=%0`);

        await expect(`get(${store}/VALUE)`).toBe('original');
        await world.trigger(writer, 'WRITE', 'updated');
        await expect(`get(${store}/VALUE)`).toBe('updated');
    });
});

// ---------------------------------------------------------------------------
// Conditional branching inside triggered code
// ---------------------------------------------------------------------------

runner.describe('@trigger — branching', ({ it }) => {
    it('@switch on %0 routes to the right branch', async ({ world }) => {
        const obj = await world.create('Router');
        await world.set(obj, 'ROUTE',
            '@switch %0=greet,@pemit %#=Hello!,bye,@pemit %#=Goodbye!,@pemit %#=Unknown.'
        );

        const greetOut = await world.trigger(obj, 'ROUTE', 'greet');
        if (!greetOut.join('').includes('Hello!'))
            throw new Error(`Expected Hello!, got: ${greetOut}`);

        const byeOut = await world.trigger(obj, 'ROUTE', 'bye');
        if (!byeOut.join('').includes('Goodbye!'))
            throw new Error(`Expected Goodbye!, got: ${byeOut}`);

        const otherOut = await world.trigger(obj, 'ROUTE', 'other');
        if (!otherOut.join('').includes('Unknown.'))
            throw new Error(`Expected Unknown., got: ${otherOut}`);
    });

    it('@pemit only fires when condition is true', async ({ world }) => {
        const obj = await world.create('Guard');
        await world.set(obj, 'GUARDED', '@tr/if gt(%0,10)=me/PASS,me/FAIL');
        await world.set(obj, 'PASS', '@pemit %#=Passed!');
        await world.set(obj, 'FAIL', '@pemit %#=Failed!');

        const passOut = await world.trigger(obj, 'GUARDED', '15');
        if (!passOut.join('').includes('Passed!'))
            throw new Error(`Expected Passed!, got: ${passOut}`);

        const failOut = await world.trigger(obj, 'GUARDED', '5');
        if (!failOut.join('').includes('Failed!'))
            throw new Error(`Expected Failed!, got: ${failOut}`);
    });
});

// ---------------------------------------------------------------------------
// Trigger chains
// ---------------------------------------------------------------------------

runner.describe('@trigger — chains', ({ it }) => {
    it('one trigger can fire another', async ({ world }) => {
        const obj = await world.create('Chain');
        await world.set(obj, 'STEP1', '@tr %!=STEP2=%0');
        await world.set(obj, 'STEP2', 'think Step 2 received: %0');

        const lines = await world.trigger(obj, 'STEP1', 'payload');
        if (!lines.join('').includes('Step 2 received: payload'))
            throw new Error(`Chain failed: ${JSON.stringify(lines)}`);
    });
});

// ---------------------------------------------------------------------------

runner.run({ username: 'Wizard', password: 'Nyctasia' })
    .then((r) => process.exit(r.failed > 0 ? 1 : 0));
