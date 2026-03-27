import { RhostClient } from './client';

/**
 * RhostWorld — fixture manager for creating and cleaning up in-game objects
 * during test runs.
 *
 * @example
 *   const world = new RhostWorld(client);
 *   const obj = await world.create('TestThing');
 *   await world.set(obj, 'MYATTR', 'hello');
 *   const val = await world.get(obj, 'MYATTR');  // => 'hello'
 *   await world.cleanup();   // auto-nukes everything
 */
export class RhostWorld {
    private dbrefs: string[] = [];

    constructor(private readonly client: RhostClient) {}

    private guardInput(field: string, value: string): void {
        if (/[\n\r]/.test(value)) {
            throw new RangeError(
                `world: invalid ${field} — value must not contain newline or carriage return characters`
            );
        }
    }

    /**
     * Creates a THING via `@create name`.
     * Parses the dbref from the command output (e.g. "name created as object #42").
     * Registers the dbref for automatic cleanup.
     * Returns the dbref string like '#42'.
     */
    async create(name: string, cost?: number): Promise<string> {
        this.guardInput('name', name);
        const expr = cost !== undefined ? `create(${name},${cost})` : `create(${name})`;
        const result = (await this.client.eval(expr)).trim();
        const m = result.match(/^#(\d+)$/);
        if (m) {
            const dbref = `#${m[1]}`;
            this.dbrefs.push(dbref);
            return dbref;
        }
        throw new Error(`world.create(${JSON.stringify(name)}) returned unexpected value: ${JSON.stringify(result)}`);
    }

    /**
     * Creates a ROOM via `@dig name`.
     * Parses the output for the dbref (e.g. "name created as room #NN.").
     * Registers the dbref for automatic cleanup.
     */
    async dig(name: string): Promise<string> {
        this.guardInput('name', name);
        const lines = await this.client.command(`@dig ${name}`);
        // Match "#42" or "room number 42" or "room number #42"
        for (const line of lines) {
            const m = line.match(/(?:room number\s+#?|#)(\d+)/i);
            if (m) {
                const dbref = `#${m[1]}`;
                this.dbrefs.push(dbref);
                return dbref;
            }
        }
        throw new Error(`world.dig(${JSON.stringify(name)}) could not parse dbref from output: ${JSON.stringify(lines)}`);
    }

    /**
     * Destroys an object with `@nuke dbref`.
     */
    async destroy(dbref: string): Promise<void> {
        await this.client.command(`@nuke ${dbref}`);
    }

    /**
     * Sets an attribute: `&ATTR dbref=value`.
     */
    async set(dbref: string, attr: string, value: string): Promise<void> {
        this.guardInput('attr', attr);
        this.guardInput('value', value);
        await this.client.command(`&${attr} ${dbref}=${value}`);
    }

    /**
     * Gets an attribute by evaluating `get(dbref/ATTR)`.
     */
    async get(dbref: string, attr: string): Promise<string> {
        // Strip the '#' for the get() call — Rhost expects get(#42/ATTR)
        return (await this.client.eval(`get(${dbref}/${attr})`)).trim();
    }

    /**
     * Locks an object: `@lock dbref=<lockstring>`.
     */
    async lock(dbref: string, lockstring: string): Promise<void> {
        this.guardInput('lockstring', lockstring);
        await this.client.command(`@lock ${dbref}=${lockstring}`);
    }

    /**
     * Sets a flag: `@set dbref=FLAG` or `@set dbref=!FLAG` to clear.
     */
    async flag(dbref: string, flag: string, clear = false): Promise<void> {
        this.guardInput('flag', flag);
        const flagStr = clear ? `!${flag}` : flag;
        await this.client.command(`@set ${dbref}=${flagStr}`);
    }

    /**
     * Triggers `@trigger dbref/ATTR=args`. Returns captured output lines.
     */
    async trigger(dbref: string, attr: string, args?: string): Promise<string[]> {
        this.guardInput('attr', attr);
        if (args !== undefined) this.guardInput('args', args);
        const cmd = args
            ? `@trigger ${dbref}/${attr}=${args}`
            : `@trigger ${dbref}/${attr}`;
        return this.client.command(cmd);
    }

    /**
     * Destroys all objects created by this world instance (in reverse order).
     */
    async cleanup(): Promise<void> {
        const toDestroy = this.dbrefs.splice(0).reverse();
        for (const dbref of toDestroy) {
            try {
                await this.destroy(dbref);
            } catch {
                // Ignore cleanup errors — object may already be gone
            }
        }
    }

    /** How many objects are tracked for cleanup. */
    get size(): number {
        return this.dbrefs.length;
    }
}
