// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit watch
// ---------------------------------------------------------------------------

import * as path from 'path';
import { RhostWatcher, WatchOptions, discoverTestFiles } from '../watcher';

export function runWatchCli(args: string[]): void {
  const opts: WatchOptions = { files: [] };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--debounce' || arg === '-d') {
      const ms = parseInt(args[++i], 10);
      if (isNaN(ms) || ms < 0) {
        die('--debounce requires a non-negative integer (milliseconds)');
      }
      opts.debounceMs = ms;
    } else if (arg === '--no-clear') {
      opts.clearScreen = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      die(`Unknown option: ${arg}`);
    }
  }

  // Resolve test files: positional args take priority, else auto-discover
  if (positional.length > 0) {
    opts.files = positional.map((f) => path.resolve(f));
    const missing = opts.files.filter((f) => {
      try { require('fs').accessSync(f); return false; } catch { return true; }
    });
    if (missing.length > 0) {
      die(`File(s) not found:\n${missing.map((f) => `  ${f}`).join('\n')}`);
    }
  } else {
    opts.files = discoverTestFiles(process.cwd());
    if (opts.files.length === 0) {
      console.error(
        'rhost-testkit watch: No test files found.\n' +
        'Test files must match: *.test.ts, *.test.js, *.spec.ts, or *.spec.js\n' +
        'Or pass specific files: rhost-testkit watch path/to/test.ts',
      );
      process.exit(1);
    }
  }

  const watcher = new RhostWatcher(opts);

  // Clean shutdown on Ctrl+C
  process.on('SIGINT', () => {
    watcher.stop().then(() => {
      console.log('\nWatch mode stopped.');
      process.exit(0);
    });
  });

  watcher.start().catch((err: unknown) => {
    console.error('rhost-testkit watch: fatal error:', (err as Error).message);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
USAGE
  rhost-testkit watch [test-files...]

If no files are given, rhost-testkit auto-discovers *.test.ts / *.spec.ts
files under the current directory (excluding node_modules, dist, .git).

OPTIONS
  -d, --debounce <ms>   Debounce delay before re-running (default: 300)
  --no-clear            Don't clear the terminal between runs
  -h, --help            Show this help

EXAMPLES
  rhost-testkit watch
  rhost-testkit watch src/__tests__/math.test.ts
  rhost-testkit watch src/__tests__/*.test.ts
  rhost-testkit watch --debounce 500 --no-clear
`.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`rhost-testkit watch: ${msg}`);
  process.exit(1);
}
