import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnapshotManager, formatSnapshotDiff } from '../snapshots';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpFile(): string {
  return path.join(os.tmpdir(), `rhost-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.snap`);
}

function readSnap(filePath: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// SnapshotManager — construction and loading
// ---------------------------------------------------------------------------

describe('SnapshotManager — construction', () => {
  it('starts empty when file does not exist', () => {
    const mgr = new SnapshotManager('/nonexistent/path/snap.json', false);
    // No stored values: any check is a 'written'
    const r = mgr.check(mgr.nextKey('test'), 'hello');
    expect(r.status).toBe('written');
  });

  it('loads existing snapshot file', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'Suite > Test: 1': 'hello' }), 'utf-8');
    const mgr = new SnapshotManager(f, false);
    mgr.resetCounter('Suite > Test');
    const r = mgr.check(mgr.nextKey('Suite > Test'), 'hello');
    expect(r.status).toBe('matched');
    fs.unlinkSync(f);
  });

  it('treats malformed snapshot file as empty', () => {
    const f = tmpFile();
    fs.writeFileSync(f, 'NOT JSON', 'utf-8');
    const mgr = new SnapshotManager(f, false);
    const r = mgr.check(mgr.nextKey('test'), 'x');
    expect(r.status).toBe('written');
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

describe('SnapshotManager — key management', () => {
  it('nextKey increments counter per test name', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    expect(mgr.nextKey('A')).toBe('A: 1');
    expect(mgr.nextKey('A')).toBe('A: 2');
    expect(mgr.nextKey('A')).toBe('A: 3');
  });

  it('counters are independent per test name', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    expect(mgr.nextKey('A')).toBe('A: 1');
    expect(mgr.nextKey('B')).toBe('B: 1');
    expect(mgr.nextKey('A')).toBe('A: 2');
    expect(mgr.nextKey('B')).toBe('B: 2');
  });

  it('resetCounter resets back to 1', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    mgr.nextKey('A'); // 1
    mgr.nextKey('A'); // 2
    mgr.resetCounter('A');
    expect(mgr.nextKey('A')).toBe('A: 1');
  });

  it('resetCounter on unknown key is a no-op', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    expect(() => mgr.resetCounter('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// check() — normal mode
// ---------------------------------------------------------------------------

describe('SnapshotManager.check() — normal mode', () => {
  it('returns written for a new key', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    const r = mgr.check('Suite > Test: 1', 'value');
    expect(r.status).toBe('written');
    expect(r.expected).toBeUndefined();
  });

  it('returns matched when actual equals stored', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'hello' }));
    const mgr = new SnapshotManager(f, false);
    const r = mgr.check('T: 1', 'hello');
    expect(r.status).toBe('matched');
    expect(r.expected).toBe('hello');
    fs.unlinkSync(f);
  });

  it('returns mismatch when actual differs from stored', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'hello' }));
    const mgr = new SnapshotManager(f, false);
    const r = mgr.check('T: 1', 'world');
    expect(r.status).toBe('mismatch');
    expect(r.expected).toBe('hello');
    fs.unlinkSync(f);
  });

  it('mismatch does NOT update the stored value', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'original' }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('T: 1', 'changed');
    mgr.save();
    const saved = readSnap(f);
    expect(saved['T: 1']).toBe('original'); // NOT overwritten
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// check() — update mode
// ---------------------------------------------------------------------------

describe('SnapshotManager.check() — update mode', () => {
  it('returns updated when actual differs from stored', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'old' }));
    const mgr = new SnapshotManager(f, true);
    const r = mgr.check('T: 1', 'new');
    expect(r.status).toBe('updated');
    expect(r.expected).toBe('old');
    fs.unlinkSync(f);
  });

  it('returns matched when actual equals stored (even in update mode)', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'same' }));
    const mgr = new SnapshotManager(f, true);
    const r = mgr.check('T: 1', 'same');
    expect(r.status).toBe('matched');
    fs.unlinkSync(f);
  });

  it('update mode save() overwrites existing value', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'old' }));
    const mgr = new SnapshotManager(f, true);
    mgr.check('T: 1', 'new');
    mgr.save();
    expect(readSnap(f)['T: 1']).toBe('new');
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// save() — normal mode
// ---------------------------------------------------------------------------

describe('SnapshotManager.save() — normal mode', () => {
  it('creates the snapshot file and its directory if needed', () => {
    const dir = path.join(os.tmpdir(), `rhost-test-dir-${Date.now()}`);
    const f = path.join(dir, '__snapshots__', 'test.snap');
    const mgr = new SnapshotManager(f, false);
    mgr.check('T: 1', 'hello');
    mgr.save();
    expect(fs.existsSync(f)).toBe(true);
    expect(readSnap(f)['T: 1']).toBe('hello');
    fs.rmSync(dir, { recursive: true });
  });

  it('adds new snapshots without removing existing ones', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'old key: 1': 'old value' }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('new key: 1', 'new value');
    mgr.save();
    const saved = readSnap(f);
    expect(saved['old key: 1']).toBe('old value');  // preserved
    expect(saved['new key: 1']).toBe('new value');  // added
    fs.unlinkSync(f);
  });

  it('does not overwrite existing matched values', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'expected' }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('T: 1', 'expected');
    mgr.save();
    expect(readSnap(f)['T: 1']).toBe('expected');
    fs.unlinkSync(f);
  });

  it('sorts keys alphabetically for stable diffs', () => {
    const f = tmpFile();
    const mgr = new SnapshotManager(f, false);
    mgr.check('Z test: 1', 'z');
    mgr.check('A test: 1', 'a');
    mgr.check('M test: 1', 'm');
    mgr.save();
    const keys = Object.keys(readSnap(f));
    expect(keys).toEqual([...keys].sort());
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// save() — update mode
// ---------------------------------------------------------------------------

describe('SnapshotManager.save() — update mode', () => {
  it('trims obsolete keys not evaluated in this run', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({
      'active: 1': 'value',
      'obsolete: 1': 'old',
    }));
    const mgr = new SnapshotManager(f, true);
    mgr.check('active: 1', 'value');
    // 'obsolete: 1' is NOT checked
    mgr.save();
    const saved = readSnap(f);
    expect(saved['active: 1']).toBe('value');
    expect(saved['obsolete: 1']).toBeUndefined(); // trimmed
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// stats()
// ---------------------------------------------------------------------------

describe('SnapshotManager.stats()', () => {
  it('counts written correctly', () => {
    const mgr = new SnapshotManager(tmpFile(), false);
    mgr.check('T: 1', 'a');
    mgr.check('T: 2', 'b');
    expect(mgr.stats().written).toBe(2);
    expect(mgr.stats().matched).toBe(0);
  });

  it('counts matched correctly', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'a', 'T: 2': 'b' }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('T: 1', 'a');
    mgr.check('T: 2', 'b');
    expect(mgr.stats().matched).toBe(2);
    expect(mgr.stats().written).toBe(0);
    fs.unlinkSync(f);
  });

  it('counts obsolete correctly', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({
      'active: 1': 'v',
      'obsolete-a: 1': 'x',
      'obsolete-b: 1': 'y',
    }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('active: 1', 'v');
    // obsolete-a and obsolete-b are not touched
    expect(mgr.stats().obsolete).toBe(2);
    fs.unlinkSync(f);
  });

  it('counts updated correctly in update mode', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'old' }));
    const mgr = new SnapshotManager(f, true);
    mgr.check('T: 1', 'new');
    expect(mgr.stats().updated).toBe(1);
    fs.unlinkSync(f);
  });

  it('mismatch in normal mode is not counted in stats (test fails before save)', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ 'T: 1': 'stored' }));
    const mgr = new SnapshotManager(f, false);
    mgr.check('T: 1', 'different'); // mismatch — test would throw, but stats still work
    // mismatch is not counted in matched, written, or updated
    const s = mgr.stats();
    expect(s.matched).toBe(0);
    expect(s.written).toBe(0);
    expect(s.updated).toBe(0);
    fs.unlinkSync(f);
  });
});

// ---------------------------------------------------------------------------
// Multiple snapshots per test
// ---------------------------------------------------------------------------

describe('SnapshotManager — multiple snapshots per test', () => {
  it('stores distinct keys for multiple calls in same test', () => {
    const f = tmpFile();
    const mgr = new SnapshotManager(f, false);
    mgr.resetCounter('Suite > My Test');
    mgr.check(mgr.nextKey('Suite > My Test'), 'first');
    mgr.check(mgr.nextKey('Suite > My Test'), 'second');
    mgr.check(mgr.nextKey('Suite > My Test'), 'third');
    mgr.save();
    const saved = readSnap(f);
    expect(saved['Suite > My Test: 1']).toBe('first');
    expect(saved['Suite > My Test: 2']).toBe('second');
    expect(saved['Suite > My Test: 3']).toBe('third');
    fs.unlinkSync(f);
  });

  it('counter resets correctly between test invocations', () => {
    const mgr = new SnapshotManager(tmpFile(), false);

    mgr.resetCounter('Test A');
    expect(mgr.nextKey('Test A')).toBe('Test A: 1');
    expect(mgr.nextKey('Test A')).toBe('Test A: 2');

    mgr.resetCounter('Test A'); // simulate new test run
    expect(mgr.nextKey('Test A')).toBe('Test A: 1');
  });
});

// ---------------------------------------------------------------------------
// formatSnapshotDiff
// ---------------------------------------------------------------------------

describe('formatSnapshotDiff', () => {
  it('returns unchanged lines with leading spaces', () => {
    const diff = formatSnapshotDiff('hello', 'hello');
    expect(diff).toContain('hello');
    expect(diff).not.toContain('-');
    expect(diff).not.toContain('+');
  });

  it('shows - for expected and + for actual when different', () => {
    const diff = formatSnapshotDiff('old value', 'new value');
    expect(diff).toContain('- old value');
    expect(diff).toContain('+ new value');
  });

  it('handles multiline values', () => {
    const diff = formatSnapshotDiff('line1\nline2', 'line1\nchanged');
    expect(diff).toContain('line1');
    expect(diff).toContain('- line2');
    expect(diff).toContain('+ changed');
  });

  it('handles extra lines in actual', () => {
    const diff = formatSnapshotDiff('one', 'one\ntwo');
    expect(diff).toContain('+ two');
  });

  it('handles extra lines in expected', () => {
    const diff = formatSnapshotDiff('one\ntwo', 'one');
    expect(diff).toContain('- two');
  });
});
