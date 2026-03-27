#!/usr/bin/env node
// ---------------------------------------------------------------------------
// rhost-testkit CLI entry point
// ---------------------------------------------------------------------------

import { runValidateCli } from './validate';
import { runWatchCli } from './watch';
import { runInitCli } from './init';

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
`.trim());
}
