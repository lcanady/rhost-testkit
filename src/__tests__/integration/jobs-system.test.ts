/**
 * Jobs system integration tests — run against RhostMUSH + PostgreSQL via
 * docker-compose, exercising jobs_db.py through execscript().
 *
 * Run with:
 *   npm run test:integration -- --testPathPattern jobs-system
 *
 * Default wizard credentials for the RhostMUSH minimal_db: Wizard / Nyctasia
 *
 * NOTE: The first run builds the RhostMUSH image from source (~5-10 min).
 * Subsequent runs reuse Docker's layer cache (~30s).
 */
import * as path from 'path';
import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { RhostClient } from '../../client';

const COMPOSE_FILE  = 'docker-compose.yml';
const COMPOSE_ROOT  = path.resolve(__dirname, '../../../');
const STARTUP_TIMEOUT = 600_000;

// ---------------------------------------------------------------------------
// Shared environment / client
// ---------------------------------------------------------------------------

let env: StartedDockerComposeEnvironment;
let client: RhostClient;

beforeAll(async () => {
    env = await new DockerComposeEnvironment(COMPOSE_ROOT, COMPOSE_FILE)
        .withWaitStrategy('rhostmush', Wait.forListeningPorts())
        .up();

    const container = env.getContainer('rhostmush');
    const host = container.getHost();
    const port = container.getMappedPort(4201);

    client = new RhostClient({ host, port, timeout: 15_000, bannerTimeout: 500 });
    await client.connect();
    await client.login('Wizard', 'Nyctasia');
}, STARTUP_TIMEOUT);

afterAll(async () => {
    await client?.disconnect();
    await env?.down();
});

// ---------------------------------------------------------------------------
// Helper: run an execscript op and return the trimmed output line(s)
// ---------------------------------------------------------------------------
async function execjobs(op: string, ...args: string[]): Promise<string> {
    const argStr = [op, ...args].join('|');
    const result = await client.send(`think execscript(jobs_db.py,${argStr})`);
    return result.trim();
}

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------

describe('jobs_db.py — init_db', () => {
    it('creates the schema and returns OK (idempotent)', async () => {
        const result = await execjobs('init_db');
        expect(result).toBe('OK');
    });

    it('is idempotent — second call also returns OK', async () => {
        const result = await execjobs('init_db');
        expect(result).toBe('OK');
    });
});

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

describe('jobs_db.py — buckets', () => {
    it('create_bucket returns OK', async () => {
        const result = await execjobs('create_bucket', 'ADMIN', 'Admin Tasks');
        expect(result).toBe('OK');
    });

    it('list_buckets includes the created bucket', async () => {
        const result = await execjobs('list_buckets');
        expect(result).toContain('ADMIN');
    });

    it('create_bucket rejects a duplicate name', async () => {
        const result = await execjobs('create_bucket', 'ADMIN', 'Duplicate');
        expect(result).toMatch(/^#-1 ERROR/);
    });

    it('delete_bucket removes the bucket', async () => {
        await execjobs('create_bucket', 'TMP', 'Temporary');
        const del = await execjobs('delete_bucket', 'TMP');
        expect(del).toBe('OK');
    });

    it('delete_bucket on missing bucket returns error', async () => {
        const result = await execjobs('delete_bucket', 'NO_SUCH_BUCKET');
        expect(result).toMatch(/^#-1 ERROR/);
    });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

describe('jobs_db.py — jobs', () => {
    it('create_job returns a numeric id', async () => {
        const result = await execjobs('create_job', 'ADMIN', 'Test Job', 'Body text', '#1');
        expect(result).toMatch(/^\d+$/);
    });

    it('get_job returns pipe-delimited fields', async () => {
        const id = await execjobs('create_job', 'ADMIN', 'Get Test', 'Details', '#1');
        const row = await execjobs('get_job', id);
        expect(row).toContain(`${id}|ADMIN|Get Test`);
    });

    it('list_jobs returns jobs for a bucket', async () => {
        await execjobs('create_job', 'ADMIN', 'List Test', 'body', '#1');
        const result = await execjobs('list_jobs', 'ADMIN');
        expect(result).toContain('ADMIN');
    });

    it('list_jobs_by_owner returns only jobs owned by that dbref', async () => {
        await execjobs('create_job', 'ADMIN', 'Owner Test', 'body', '#42');
        const result = await execjobs('list_jobs_by_owner', '#42');
        expect(result).toContain('#42');
    });

    it('create_job on missing bucket returns error', async () => {
        const result = await execjobs('create_job', 'NOSUCHBUCKET', 'Bad Job', 'body', '#1');
        expect(result).toMatch(/^#-1 ERROR/);
    });
});

// ---------------------------------------------------------------------------
// Comments, assign, set_status
// ---------------------------------------------------------------------------

describe('jobs_db.py — comments and workflow', () => {
    let jobId: string;

    beforeAll(async () => {
        jobId = await execjobs('create_job', 'ADMIN', 'Workflow Job', 'body', '#1');
    });

    it('comment returns OK', async () => {
        const result = await execjobs('comment', jobId, '#1', 'This is a note');
        expect(result).toBe('OK');
    });

    it('assign returns OK', async () => {
        const result = await execjobs('assign', jobId, '#5');
        expect(result).toBe('OK');
    });

    it('get_job reflects the new assignee', async () => {
        const row = await execjobs('get_job', jobId);
        expect(row).toContain('#5');
    });

    it('set_status returns OK', async () => {
        const result = await execjobs('set_status', jobId, 'closed');
        expect(result).toBe('OK');
    });

    it('get_job reflects the new status', async () => {
        const row = await execjobs('get_job', jobId);
        expect(row).toContain('closed');
    });

    it('comment on missing job returns error', async () => {
        const result = await execjobs('comment', '99999', '#1', 'ghost comment');
        expect(result).toMatch(/^#-1 ERROR/);
    });
});
