// ---------------------------------------------------------------------------
// SnapshotManager — persistent snapshot storage for toMatchSnapshot()
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotStats {
  /** Snapshots that matched stored values */
  matched: number;
  /** New snapshots written for the first time */
  written: number;
  /** Existing snapshots overwritten in update mode */
  updated: number;
  /** Keys present in the snapshot file that were never evaluated in this run */
  obsolete: number;
}

export type SnapshotStatus = 'matched' | 'mismatch' | 'written' | 'updated';

export interface SnapshotCheckResult {
  status: SnapshotStatus;
  /** The stored/expected value. Undefined for 'written' (no prior value). */
  expected: string | undefined;
}

// ---------------------------------------------------------------------------
// SnapshotManager
// ---------------------------------------------------------------------------

/**
 * Manages a single `.snap` JSON file on disk.
 *
 * Lifecycle per test run:
 *   1. `new SnapshotManager(filePath, updateMode)` — loads existing snapshots
 *   2. For each test: `resetCounter(testName)` at test start
 *   3. For each assertion: `check(nextKey(testName), actual)` inside `toMatchSnapshot()`
 *   4. `save()` after all tests complete — writes new/updated snapshots to disk
 *   5. `stats()` — retrieve final counts for the run summary
 *
 * Snapshot file format:
 *   A sorted JSON object mapping string keys → string values, e.g.:
 *   {
 *     "Math > add returns sum: 1": "5",
 *     "Math > iter lnum(1,10): 1": "1 2 3 4 5 6 7 8 9 10"
 *   }
 *
 * Key format: `"Suite > Sub > Test Name: N"` where N resets to 1 per test.
 */
export class SnapshotManager {
  /** Snapshots loaded from disk at startup */
  private readonly stored: Record<string, string>;
  /** All key→actual values evaluated in this run */
  private readonly touched = new Map<string, string>();
  /** Per-test snapshot call counter */
  private readonly counters = new Map<string, number>();

  private _matched = 0;
  private _written = 0;
  private _updated = 0;

  constructor(
    private readonly filePath: string,
    private readonly updateMode: boolean,
  ) {
    this.stored = this.load();
  }

  // -------------------------------------------------------------------------
  // Key management
  // -------------------------------------------------------------------------

  /**
   * Advance and return the next snapshot key for `testName`.
   * Call `resetCounter(testName)` at the start of each test.
   */
  nextKey(testName: string): string {
    const n = (this.counters.get(testName) ?? 0) + 1;
    this.counters.set(testName, n);
    return `${testName}: ${n}`;
  }

  /** Reset the per-test counter. Call this at the start of every test. */
  resetCounter(testName: string): void {
    this.counters.delete(testName);
  }

  // -------------------------------------------------------------------------
  // Core assertion logic
  // -------------------------------------------------------------------------

  /**
   * Check `actual` against the stored snapshot for `key`.
   *
   * - **No prior value**: write it (returns `'written'`, always passes)
   * - **Update mode**: overwrite with `actual` (returns `'updated'` if changed, `'matched'` if same)
   * - **Normal mode**: compare; returns `'matched'` or `'mismatch'`
   */
  check(key: string, actual: string): SnapshotCheckResult {
    this.touched.set(key, actual);

    const hasStored = Object.prototype.hasOwnProperty.call(this.stored, key);

    if (!hasStored) {
      this._written++;
      return { status: 'written', expected: undefined };
    }

    const expected = this.stored[key];

    if (this.updateMode) {
      if (expected !== actual) {
        this._updated++;
        return { status: 'updated', expected };
      }
      this._matched++;
      return { status: 'matched', expected };
    }

    if (expected === actual) {
      this._matched++;
      return { status: 'matched', expected };
    }

    return { status: 'mismatch', expected };
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Flush snapshot state to disk.
   *
   * **Normal mode**: merges new snapshots into the existing file.
   * Existing values are never overwritten — failed snapshots retain
   * their previous (correct) value until the user runs `--updateSnapshot`.
   *
   * **Update mode**: writes only the snapshots evaluated in this run,
   * discarding any obsolete entries that were not touched.
   */
  save(): void {
    let toWrite: Record<string, string>;

    if (this.updateMode) {
      // Write only what was evaluated — trims obsolete entries automatically
      toWrite = Object.fromEntries(this.touched);
    } else {
      // Start from existing, add only NEW keys (never overwrite)
      toWrite = { ...this.stored };
      for (const [key, value] of this.touched) {
        if (!Object.prototype.hasOwnProperty.call(toWrite, key)) {
          toWrite[key] = value;
        }
      }
    }

    // Sort keys for stable diffs
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(toWrite).sort()) {
      sorted[key] = toWrite[key];
    }

    // If there's nothing to write, don't create (or leave) an empty snapshot file.
    // An empty {} file would be flagged as obsolete by Jest and cause exit code 1.
    if (Object.keys(sorted).length === 0) {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
      return;
    }

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  stats(): SnapshotStats {
    const touchedKeys = new Set(this.touched.keys());
    const obsolete = Object.keys(this.stored).filter((k) => !touchedKeys.has(k)).length;
    return {
      matched: this._matched,
      written: this._written,
      updated: this._updated,
      obsolete,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private load(): Record<string, string> {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // File doesn't exist or is malformed — start fresh
    }
    return {};
  }
}

// ---------------------------------------------------------------------------
// Snapshot diff formatter (used in error messages)
// ---------------------------------------------------------------------------

/**
 * Format a human-readable diff between expected and actual snapshot values.
 * Uses a simple line-by-line format (not a full diff algorithm — values are
 * single-line MUSH results in most cases).
 */
export function formatSnapshotDiff(expected: string, actual: string): string {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const maxLines = Math.max(expLines.length, actLines.length);
  const lines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const e = expLines[i];
    const a = actLines[i];
    if (e !== undefined && a !== undefined && e === a) {
      lines.push(`    ${e}`);
    } else {
      if (e !== undefined) lines.push(`  - ${e}`);
      if (a !== undefined) lines.push(`  + ${a}`);
    }
  }

  return lines.join('\n');
}
