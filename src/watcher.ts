// ---------------------------------------------------------------------------
// RhostWatcher — file-watch driven test re-runner
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface WatchOptions {
  /** Absolute paths of test files to watch and run */
  files: string[];
  /** Debounce delay in ms before re-running after a change. Default: 300 */
  debounceMs?: number;
  /** Clear terminal between runs. Default: true */
  clearScreen?: boolean;
}

// ---------------------------------------------------------------------------
// RhostWatcher class
// ---------------------------------------------------------------------------

export class RhostWatcher {
  private readonly debounceMs: number;
  private readonly clearScreen: boolean;

  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingFiles: Set<string> = new Set();
  private currentProcess: ChildProcess | null = null;
  private stopped = false;
  private runCount = 0;

  constructor(private readonly options: WatchOptions) {
    this.debounceMs = options.debounceMs ?? 300;
    this.clearScreen = options.clearScreen !== false;
  }

  /**
   * Start watching.  Runs an initial pass immediately, then re-runs on change.
   * Blocks until `stop()` is called (or SIGINT).
   */
  async start(): Promise<void> {
    const files = this.options.files;

    if (files.length === 0) {
      console.error('rhost-testkit: No test files to watch.');
      return;
    }

    this.printBanner(files);

    // Initial run
    await this.runFiles(files, 'initial');
    if (this.stopped) return;

    // Set up filesystem watching
    const watchRoot = this.commonRoot(files.map((f) => path.dirname(f)));
    this.setupWatcher(watchRoot, new Set(files.map((f) => path.resolve(f))));

    // Block until stopped
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (this.stopped) {
          clearInterval(poll);
          resolve();
        }
      }, 100);
      // Ensure this timer doesn't prevent Node from exiting naturally
      if (typeof poll.unref === 'function') poll.unref();
    });
  }

  /** Graceful shutdown: cancel pending timers, close watcher, kill child. */
  async stop(): Promise<void> {
    this.stopped = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
      } catch {
        // already exited
      }
      this.currentProcess = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: filesystem watcher setup
  // -------------------------------------------------------------------------

  private setupWatcher(watchRoot: string, testFileSet: Set<string>): void {
    try {
      this.watcher = fs.watch(watchRoot, { recursive: true }, (event, filename) => {
        if (!filename || this.stopped) return;

        const resolved = path.isAbsolute(filename)
          ? filename
          : path.resolve(watchRoot, filename);

        if (!testFileSet.has(resolved)) return;

        this.pendingFiles.add(resolved);

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          const changed = Array.from(this.pendingFiles);
          this.pendingFiles.clear();
          this.runFiles(changed, 'changed').catch((err: unknown) => {
            console.error('Watch run error:', (err as Error).message);
          });
        }, this.debounceMs);
      });

      this.watcher.on('error', (err: Error) => {
        if (!this.stopped) {
          console.error('\nWatcher error:', err.message);
        }
      });
    } catch (err) {
      console.error(
        `\nrhost-testkit: Failed to start file watcher: ${(err as Error).message}`,
      );
      console.error(
        'Tip: if you need recursive watching on older Linux, install chokidar: npm install chokidar --save-dev',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internal: running files
  // -------------------------------------------------------------------------

  private async runFiles(files: string[], reason: 'initial' | 'changed'): Promise<void> {
    if (this.stopped) return;

    // Kill any already-running child process
    if (this.currentProcess) {
      try { this.currentProcess.kill('SIGTERM'); } catch { /* ignore */ }
      this.currentProcess = null;
    }

    this.runCount++;

    if (this.clearScreen && this.runCount > 1) {
      process.stdout.write('\x1b[2J\x1b[H');
    }

    this.printRunHeader(files, reason);

    for (const file of files) {
      if (this.stopped) break;
      await this.spawnFile(file);
    }
  }

  private spawnFile(file: string): Promise<void> {
    return new Promise((resolve) => {
      const ext = path.extname(file).toLowerCase();
      const isTs = ext === '.ts' || ext === '.tsx';

      // For TypeScript files, prefer ts-node via npx (always available in devDeps).
      // For JS, use the current Node binary directly.
      const cmd = isTs ? 'npx' : process.execPath;
      const args = isTs ? ['ts-node', '--transpile-only', file] : [file];

      const proc = spawn(cmd, args, {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env },
      });

      this.currentProcess = proc;

      proc.on('close', () => {
        this.currentProcess = null;
        resolve();
      });

      proc.on('error', (err: Error) => {
        if (isTs && err.message.includes('ENOENT')) {
          console.error(
            `\nrhost-testkit: could not find ts-node. Install it: npm install ts-node --save-dev`,
          );
        } else {
          console.error(`\nrhost-testkit: failed to run ${path.basename(file)}: ${err.message}`);
        }
        this.currentProcess = null;
        resolve();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Internal: output formatting
  // -------------------------------------------------------------------------

  private printBanner(files: string[]): void {
    const cwd = process.cwd();
    const rel = files.map((f) => path.relative(cwd, f));
    console.log('\x1b[36m╔══════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  rhost-testkit  \x1b[33mwatch mode\x1b[0m' + ' '.repeat(20) + '\x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════════╝\x1b[0m');
    console.log(`\nWatching ${files.length} file${files.length !== 1 ? 's' : ''}:`);
    for (const f of rel) {
      console.log(`  \x1b[90m${f}\x1b[0m`);
    }
    console.log('\nPress \x1b[1mCtrl+C\x1b[0m to stop.\n');
  }

  private printRunHeader(files: string[], reason: 'initial' | 'changed'): void {
    const sep = '─'.repeat(50);
    const cwd = process.cwd();
    const rel = files.map((f) => path.relative(cwd, f)).join(', ');

    if (reason === 'initial') {
      console.log(`\x1b[36m${sep}\x1b[0m`);
      console.log(` \x1b[1mInitial run\x1b[0m — ${files.length} file${files.length !== 1 ? 's' : ''}`);
      console.log(`\x1b[36m${sep}\x1b[0m\n`);
    } else {
      const now = new Date().toLocaleTimeString();
      console.log(`\x1b[33m${sep}\x1b[0m`);
      console.log(` \x1b[1mChanged\x1b[0m [${now}]: \x1b[33m${rel}\x1b[0m`);
      console.log(`\x1b[33m${sep}\x1b[0m\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: utilities
  // -------------------------------------------------------------------------

  /**
   * Find the longest common directory path shared by all given dirs.
   * Falls back to '/' (or drive root on Windows) if nothing in common.
   */
  private commonRoot(dirs: string[]): string {
    if (dirs.length === 0) return process.cwd();
    if (dirs.length === 1) return dirs[0];

    const sep = path.sep;
    const parts = dirs.map((d) => path.resolve(d).split(sep));
    const reference = parts[0];
    const common: string[] = [];

    for (let i = 0; i < reference.length; i++) {
      if (parts.every((p) => p[i] === reference[i])) {
        common.push(reference[i]);
      } else {
        break;
      }
    }

    const result = common.join(sep);
    return result || sep;
  }
}

// ---------------------------------------------------------------------------
// File discovery helper (used by the CLI)
// ---------------------------------------------------------------------------

/**
 * Recursively walk `rootDir` and return all test files matching
 * `*.test.ts`, `*.test.js`, `*.spec.ts`, `*.spec.js`.
 * Skips `node_modules`, `dist`, `.git`, `.next`, `.turbo`.
 */
export function discoverTestFiles(rootDir: string): string[] {
  const files: string[] = [];
  walkDir(path.resolve(rootDir), files);
  return files;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.next', '.turbo', 'coverage']);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

function walkDir(dir: string, out: string[]): void {
  if (SKIP_DIRS.has(path.basename(dir))) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, out);
    } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
}
