#!/usr/bin/env node
// ---------------------------------------------------------------------------
// rhost-testkit CLI entry point
// ---------------------------------------------------------------------------

import { runValidateCli } from './validate';
import { runWatchCli } from './watch';
import { runInitCli } from './init';
import { runDeployCli } from './deploy';
import { runFmtCli } from './fmt';

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'validate':
    runValidateCli(args.slice(1));
    break;

  case 'watch':
    runWatchCli(args.slice(1));
    break;

  case 'init':
    runInitCli(args.slice(1));
    break;

  case 'deploy':
    runDeployCli(args.slice(1));
    break;

  case 'fmt':
    runFmtCli(args.slice(1));
    break;

  case '--version':
  case '-v': {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string };
    console.log(pkg.version);
    break;
  }

  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;

  default:
    console.error(`rhost-testkit: unknown command '${cmd}'\n`);
    printHelp();
    process.exit(1);
}

function printHelp(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('../../package.json') as { version: string };
  console.log(`
rhost-testkit v${pkg.version} — MUSHcode testing toolkit

USAGE
  rhost-testkit <command> [options]

COMMANDS
  validate    Validate a softcode expression offline (no server needed)
  watch       Watch test files and re-run on change
  init        Generate CI/CD workflow templates
  deploy      Deploy a softcode file with automatic rollback on failure
  fmt         Format a softcode file (normalize whitespace)

OPTIONS
  -v, --version   Print version and exit
  -h, --help      Show this help

Run \`rhost-testkit <command> --help\` for command-specific options.

EXAMPLES
  rhost-testkit validate "add(2,3)"
  rhost-testkit validate --file mycode.mush
  rhost-testkit watch
  rhost-testkit watch src/__tests__/math.test.ts
  rhost-testkit init --ci github
  rhost-testkit init --ci gitlab
  rhost-testkit deploy --file mycode.mush --dry-run
  rhost-testkit fmt mycode.mush
  rhost-testkit fmt --check mycode.mush
`.trim());
}
