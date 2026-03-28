/**
 * SECURITY EXPLOIT TEST — H4: jobs_db.py leaks DB internals via exception messages
 *
 * Vulnerability: the main() exception handler calls err(str(e)) on raw Python/
 * psycopg2 exception objects. psycopg2 Error.__str__() can include PostgreSQL
 * DETAIL, HINT, CONTEXT, and QUERY diagnostic lines that expose internal
 * schema names, column values, or query structure to MUSH softcode callers.
 *
 * Fix: strip diagnostic lines (DETAIL / HINT / CONTEXT / QUERY) from the
 * exception message before returning it as a MUSH error string.
 */
import * as child_process from 'child_process';
import * as path from 'path';

const JOBS_DB = path.resolve(__dirname, '../../../scripts/jobs_db.py');

/**
 * Run a Python snippet that imports the sanitizer from jobs_db.py and tests it.
 * Returns stdout trimmed.
 */
function runPythonSnippet(code: string): string {
    const result = child_process.spawnSync('python3', ['-c', code], {
        encoding: 'utf8',
        timeout: 5000,
    });
    return (result.stdout ?? '').trim();
}

// ---------------------------------------------------------------------------
// The sanitizer must exist and strip DETAIL / HINT / CONTEXT / QUERY lines
// ---------------------------------------------------------------------------

describe('H4 — DB error detail leak: _sanitize_db_error()', () => {
    it('EXPLOIT: raw psycopg2 error string with DETAIL is stripped', () => {
        // Simulate what psycopg2 produces for a FK violation
        const exploitMsg = [
            'insert or update on table "jobs" violates foreign key constraint "jobs_bucket_fkey"',
            'DETAIL:  Key (bucket)=(NOSUCHBUCKET) is not present in table "buckets".',
        ].join('\\n');

        const code = `
import sys
sys.path.insert(0, '${path.dirname(JOBS_DB)}')
import importlib.util, types
spec = importlib.util.spec_from_file_location('jobs_db', '${JOBS_DB}')
mod = importlib.util.module_from_spec(spec)
# Stub psycopg2 so import doesn't fail if not installed in test env
import sys
sys.modules.setdefault('psycopg2', types.ModuleType('psycopg2'))
sys.modules.setdefault('psycopg2.extras', types.ModuleType('psycopg2.extras'))
sys.modules.setdefault('psycopg2.errors', types.ModuleType('psycopg2.errors'))
spec.loader.exec_module(mod)
msg = '${exploitMsg}'.replace('\\\\n', '\\n')
result = mod._sanitize_db_error(msg)
print(result)
`;
        const output = runPythonSnippet(code);
        // The sanitized output must NOT contain the DETAIL line
        expect(output).not.toMatch(/DETAIL/i);
        // But must still contain the primary error message
        expect(output).toContain('foreign key constraint');
    });

    it('EXPLOIT: HINT line is stripped', () => {
        const code = `
import sys, types
sys.modules.setdefault('psycopg2', types.ModuleType('psycopg2'))
sys.modules.setdefault('psycopg2.extras', types.ModuleType('psycopg2.extras'))
sys.modules.setdefault('psycopg2.errors', types.ModuleType('psycopg2.errors'))
import importlib.util
spec = importlib.util.spec_from_file_location('jobs_db', '${JOBS_DB}')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
msg = 'column "nonexistent" does not exist\\nHINT:  Perhaps you meant to reference the column "jobs.id".'
print(mod._sanitize_db_error(msg))
`;
        const output = runPythonSnippet(code);
        expect(output).not.toMatch(/HINT/i);
        expect(output).toContain('column');
    });

    it('safe: plain error message is returned unchanged', () => {
        const code = `
import sys, types
sys.modules.setdefault('psycopg2', types.ModuleType('psycopg2'))
sys.modules.setdefault('psycopg2.extras', types.ModuleType('psycopg2.extras'))
sys.modules.setdefault('psycopg2.errors', types.ModuleType('psycopg2.errors'))
import importlib.util
spec = importlib.util.spec_from_file_location('jobs_db', '${JOBS_DB}')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod._sanitize_db_error('bucket not found: ADMIN'))
`;
        const output = runPythonSnippet(code);
        expect(output).toBe('bucket not found: ADMIN');
    });
});
