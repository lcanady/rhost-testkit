#!/usr/bin/env python3
"""
RhostMUSH execscript: Jobs system database bridge

Usage: execscript(jobs_db.py, <op>|<arg1>|<arg2>|...)

All arguments arrive as a single sys.argv[1], pipe-delimited.
The first token is the operation name; remaining tokens are op-specific args.

Connection info is read from environment variables:
  PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE

Returns OK on success, or #-1 ERROR: <message> on failure.
"""
import os
import sys
import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def connect():
    return psycopg2.connect(
        host=os.environ.get('PGHOST', 'localhost'),
        port=int(os.environ.get('PGPORT', '5432')),
        user=os.environ.get('PGUSER', 'mush'),
        password=os.environ.get('PGPASSWORD', 'mushpass'),
        dbname=os.environ.get('PGDATABASE', 'jobs'),
    )

def err(msg):
    print(f'#-1 ERROR: {msg}')

def _sanitize_db_error(text: str) -> str:
    """Strip PostgreSQL diagnostic lines (DETAIL / HINT / CONTEXT / QUERY)
    from an exception message before returning it to MUSH callers.

    psycopg2 Error.__str__() appends these lines verbatim from the server
    response; they can expose internal schema names, column values, and
    query fragments that callers should not see.
    """
    import re
    lines = text.splitlines()
    cleaned = [
        line for line in lines
        if not re.match(r'^\s*(DETAIL|HINT|CONTEXT|QUERY)\s*:', line, re.IGNORECASE)
    ]
    return '\n'.join(cleaned).strip()

def strip_pipes(s):
    """Remove pipe characters from user-supplied text to prevent arg-splitting."""
    return s.replace('|', '')

# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

def op_init_db(conn, args):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS buckets (
                name  TEXT PRIMARY KEY,
                title TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id            SERIAL PRIMARY KEY,
                bucket        TEXT NOT NULL REFERENCES buckets(name),
                title         TEXT NOT NULL,
                body          TEXT NOT NULL DEFAULT '',
                status        TEXT NOT NULL DEFAULT 'open',
                owner_dbref   TEXT NOT NULL,
                assigned_dbref TEXT,
                created_at    TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id          SERIAL PRIMARY KEY,
                job_id      INTEGER NOT NULL REFERENCES jobs(id),
                author_dbref TEXT NOT NULL,
                body        TEXT NOT NULL,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
    conn.commit()
    print('OK')


def op_create_bucket(conn, args):
    if len(args) < 2:
        return err('create_bucket requires name|title')
    name  = strip_pipes(args[0].strip())
    title = strip_pipes(args[1].strip())
    if not name:
        return err('bucket name cannot be empty')
    with conn.cursor() as cur:
        try:
            cur.execute(
                'INSERT INTO buckets (name, title) VALUES (%s, %s)',
                (name, title)
            )
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            return err(f'bucket already exists: {name}')
    conn.commit()
    print('OK')


def op_delete_bucket(conn, args):
    if not args:
        return err('delete_bucket requires name')
    name = args[0].strip()
    with conn.cursor() as cur:
        cur.execute('DELETE FROM buckets WHERE name = %s', (name,))
        if cur.rowcount == 0:
            conn.rollback()
            return err(f'bucket not found: {name}')
    conn.commit()
    print('OK')


def op_list_buckets(conn, args):
    with conn.cursor() as cur:
        cur.execute('SELECT name, title FROM buckets ORDER BY name')
        rows = cur.fetchall()
    for name, title in rows:
        print(f'{name}|{title}')


def op_create_job(conn, args):
    if len(args) < 4:
        return err('create_job requires bucket|title|body|owner_dbref')
    bucket      = args[0].strip()
    title       = strip_pipes(args[1].strip())
    body        = strip_pipes(args[2].strip())
    owner_dbref = args[3].strip()
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO jobs (bucket, title, body, owner_dbref)
                VALUES (%s, %s, %s, %s) RETURNING id
                """,
                (bucket, title, body, owner_dbref)
            )
        except psycopg2.errors.ForeignKeyViolation:
            conn.rollback()
            return err(f'bucket not found: {bucket}')
        job_id = cur.fetchone()[0]
    conn.commit()
    print(str(job_id))


def op_get_job(conn, args):
    if not args:
        return err('get_job requires job_id')
    try:
        job_id = int(args[0].strip())
    except ValueError:
        return err('job_id must be an integer')
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, bucket, title, body, status,
                   owner_dbref, assigned_dbref, created_at
            FROM jobs WHERE id = %s
            """,
            (job_id,)
        )
        row = cur.fetchone()
    if row is None:
        return err(f'job not found: {job_id}')
    (jid, bucket, title, body, status, owner, assigned, created) = row
    print(f'{jid}|{bucket}|{title}|{body}|{status}|{owner}|{assigned or ""}|{created}')


def op_list_jobs(conn, args):
    bucket = args[0].strip() if args else ''
    status = args[1].strip() if len(args) > 1 else ''
    query = 'SELECT id, bucket, title, status, owner_dbref FROM jobs WHERE 1=1'
    params = []
    if bucket:
        query += ' AND bucket = %s'
        params.append(bucket)
    if status:
        query += ' AND status = %s'
        params.append(status)
    query += ' ORDER BY id'
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    for jid, bkt, title, sts, owner in rows:
        print(f'{jid}|{bkt}|{title}|{sts}|{owner}')


def op_list_jobs_by_owner(conn, args):
    if not args:
        return err('list_jobs_by_owner requires owner_dbref')
    owner = args[0].strip()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, bucket, title, status, owner_dbref
            FROM jobs WHERE owner_dbref = %s ORDER BY id
            """,
            (owner,)
        )
        rows = cur.fetchall()
    for jid, bucket, title, status, owner_dbref in rows:
        print(f'{jid}|{bucket}|{title}|{status}|{owner_dbref}')


def op_comment(conn, args):
    if len(args) < 3:
        return err('comment requires job_id|author_dbref|body')
    try:
        job_id = int(args[0].strip())
    except ValueError:
        return err('job_id must be an integer')
    author = args[1].strip()
    body   = strip_pipes(args[2].strip())
    with conn.cursor() as cur:
        try:
            cur.execute(
                'INSERT INTO comments (job_id, author_dbref, body) VALUES (%s, %s, %s)',
                (job_id, author, body)
            )
        except psycopg2.errors.ForeignKeyViolation:
            conn.rollback()
            return err(f'job not found: {job_id}')
    conn.commit()
    print('OK')


def op_assign(conn, args):
    if len(args) < 2:
        return err('assign requires job_id|assignee_dbref')
    try:
        job_id = int(args[0].strip())
    except ValueError:
        return err('job_id must be an integer')
    assignee = args[1].strip()
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE jobs SET assigned_dbref = %s WHERE id = %s',
            (assignee, job_id)
        )
        if cur.rowcount == 0:
            conn.rollback()
            return err(f'job not found: {job_id}')
    conn.commit()
    print('OK')


def op_set_status(conn, args):
    if len(args) < 2:
        return err('set_status requires job_id|status')
    try:
        job_id = int(args[0].strip())
    except ValueError:
        return err('job_id must be an integer')
    status = args[1].strip()
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE jobs SET status = %s WHERE id = %s',
            (status, job_id)
        )
        if cur.rowcount == 0:
            conn.rollback()
            return err(f'job not found: {job_id}')
    conn.commit()
    print('OK')


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

DISPATCH = {
    'init_db':            op_init_db,
    'create_bucket':      op_create_bucket,
    'delete_bucket':      op_delete_bucket,
    'list_buckets':       op_list_buckets,
    'create_job':         op_create_job,
    'get_job':            op_get_job,
    'list_jobs':          op_list_jobs,
    'list_jobs_by_owner': op_list_jobs_by_owner,
    'comment':            op_comment,
    'assign':             op_assign,
    'set_status':         op_set_status,
}

def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else ''
    parts = raw.split('|')
    op   = parts[0].strip() if parts else ''
    args = parts[1:]

    if not op:
        err('no operation specified')
        sys.exit(0)

    handler = DISPATCH.get(op)
    if handler is None:
        err(f'unknown op: {op}')
        sys.exit(0)

    try:
        conn = connect()
    except Exception as e:
        err(f'db connection failed: {_sanitize_db_error(str(e))}')
        sys.exit(0)

    try:
        handler(conn, args)
    except Exception as e:
        conn.rollback()
        err(_sanitize_db_error(str(e)))
    finally:
        conn.close()

if __name__ == '__main__':
    main()
