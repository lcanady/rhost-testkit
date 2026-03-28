import { RhostClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single parsed command from a softcode deploy file. */
export interface DeployCommand {
    dbref: string;
    attr: string;
    value: string;
}

/**
 * A snapshot of object attribute state captured before deployment.
 * Shape: `{ [dbref]: { [attr]: value } }`
 */
export type DeploySnapshot = Record<string, Record<string, string>>;

export interface DeployOptions {
    /**
     * Optional test function. Called after all commands are applied.
     * Return `true` (or resolve) to indicate success; return `false` or throw to trigger rollback.
     */
    test?: (client: RhostClient) => Promise<boolean>;
    /**
     * Dry-run mode: snapshot objects and report what would be applied,
     * but do not send any commands to the server.
     */
    dryRun?: boolean;
}

export interface DeployResult {
    /** Number of commands applied (0 in dry-run). */
    applied: number;
    /** Whether the test function was called. */
    tested: boolean;
    /** Result of the test function, or null if no test was provided. */
    testPassed: boolean | null;
    /** Whether a rollback was performed. */
    rolledBack: boolean;
    /** true when dryRun option was set. */
    dryRun: boolean;
    /** The snapshot taken before applying commands. */
    snapshot: DeploySnapshot;
}

// ---------------------------------------------------------------------------
// File parser
// ---------------------------------------------------------------------------

/**
 * Parse a softcode deploy file into a list of `DeployCommand` objects.
 *
 * Supported line formats:
 *   `&ATTRNAME #NN=value`   — set an attribute
 *
 * Lines starting with `#` or `@@` are treated as comments and ignored.
 * Blank lines are ignored.
 *
 * @example
 *   const cmds = parseDeployFile(fs.readFileSync('mycode.mush', 'utf8'));
 */
export function parseDeployFile(content: string): DeployCommand[] {
    const commands: DeployCommand[] = [];
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#') || line.startsWith('@@')) continue;

        // &ATTRNAME #DBREF=value
        const m = line.match(/^&([A-Za-z0-9_]+)\s+(#\d+)=(.*)$/s);
        if (m) {
            commands.push({
                dbref: m[2],
                attr: m[1].toUpperCase(),
                value: m[3],
            });
        }
    }
    return commands;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Capture the current state (all attributes and their values) of the given
 * dbrefs. Returns a `DeploySnapshot` suitable for passing to `restoreSnapshot`.
 */
export async function snapshotObjects(
    client: RhostClient,
    dbrefs: string[],
): Promise<DeploySnapshot> {
    const snapshot: DeploySnapshot = {};
    for (const dbref of dbrefs) {
        const attrsStr = await client.eval(`lattr(${dbref})`);
        const attrs = attrsStr ? attrsStr.split(' ').filter(Boolean) : [];
        snapshot[dbref] = {};
        for (const attr of attrs) {
            snapshot[dbref][attr] = await client.eval(`get(${dbref}/${attr})`);
        }
    }
    return snapshot;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore object attribute state from a snapshot.
 *
 * For each dbref in the snapshot:
 * - Attributes that changed are reset to their original value.
 * - Attributes that did not exist before deployment (i.e. appear in
 *   `currentDbrefs` but not in `snapshot[dbref]`) are wiped.
 *
 * @param currentDbrefs Optional list of dbrefs currently tracked, used to
 *   detect and wipe attrs added during deployment.
 */
export async function restoreSnapshot(
    client: RhostClient,
    snapshot: DeploySnapshot,
    currentDbrefs?: string[],
): Promise<void> {
    for (const [dbref, originalAttrs] of Object.entries(snapshot)) {
        // Restore changed / deleted attrs
        for (const [attr, value] of Object.entries(originalAttrs)) {
            const current = await client.eval(`get(${dbref}/${attr})`);
            if (current !== value) {
                await client.command(`&${attr} ${dbref}=${value}`);
            }
        }

        // Wipe attrs added after the snapshot
        if (currentDbrefs?.includes(dbref)) {
            const nowStr = await client.eval(`lattr(${dbref})`);
            const nowAttrs = nowStr ? nowStr.split(' ').filter(Boolean) : [];
            for (const attr of nowAttrs) {
                if (!(attr in originalAttrs)) {
                    await client.command(`@wipe ${dbref}/${attr}`);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Deploy pipeline
// ---------------------------------------------------------------------------

/**
 * Deploy softcode commands to the server with automatic rollback on failure.
 *
 * Flow:
 *   1. Snapshot all target objects.
 *   2. Apply each command (unless dryRun).
 *   3. Call the optional test function.
 *   4. If the test fails or throws, restore the snapshot (rollback).
 *
 * @example
 *   const cmds = parseDeployFile(fs.readFileSync('mycode.mush', 'utf8'));
 *   const result = await deploy(client, cmds, {
 *     test: async (c) => (await c.eval('smoke_test()')).startsWith('OK'),
 *   });
 *   if (result.rolledBack) console.error('Deployment failed — rolled back.');
 */
export async function deploy(
    client: RhostClient,
    commands: DeployCommand[],
    options: DeployOptions = {},
): Promise<DeployResult> {
    const { test, dryRun = false } = options;

    // Unique dbrefs from the command list
    const dbrefs = [...new Set(commands.map((c) => c.dbref))];

    // 1. Snapshot
    const snapshot = await snapshotObjects(client, dbrefs);

    // 2. Apply (skip in dry-run)
    if (!dryRun) {
        for (const cmd of commands) {
            await client.command(`&${cmd.attr} ${cmd.dbref}=${cmd.value}`);
        }
    }

    const result: DeployResult = {
        applied: dryRun ? 0 : commands.length,
        tested: false,
        testPassed: null,
        rolledBack: false,
        dryRun,
        snapshot,
    };

    if (dryRun || !test) return result;

    // 3. Test
    result.tested = true;
    let testPassed = false;
    try {
        testPassed = await test(client);
    } catch {
        testPassed = false;
    }
    result.testPassed = testPassed;

    // 4. Rollback if test failed
    if (!testPassed) {
        await restoreSnapshot(client, snapshot, dbrefs);
        result.rolledBack = true;
    }

    return result;
}
