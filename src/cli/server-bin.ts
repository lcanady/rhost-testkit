#!/usr/bin/env node
// ---------------------------------------------------------------------------
// rhost-server — standalone server CLI
// ---------------------------------------------------------------------------

import { runServerCli } from './server';
import { runServerInitCli } from './server-init';

const args = process.argv.slice(2);
const cmd  = args[0];

switch (cmd) {
    case 'start':
    case undefined:
        // bare `rhost-server` or `rhost-server start` both launch the server
        runServerCli(cmd === 'start' ? args.slice(1) : args);
        break;

    case 'init':
        runServerInitCli(args.slice(1));
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
        printHelp();
        break;

    default:
        // treat unknown first arg as a flag for `start` (e.g. `rhost-server --port 7000`)
        if (cmd.startsWith('-')) {
            runServerCli(args);
        } else {
            console.error(`rhost-server: unknown command '${cmd}'\n`);
            printHelp();
            process.exit(1);
        }
}

function printHelp(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string };
    console.log(`
rhost-server v${pkg.version} — RhostMUSH Docker server

USAGE
  rhost-server [command] [options]

COMMANDS
  start   Launch a RhostMUSH Docker container (default when no command given)
  init    Scaffold a rhost.config.json and supporting files in a directory

OPTIONS
  -v, --version   Print version and exit
  -h, --help      Show this help

Run \`rhost-server <command> --help\` for command-specific options.

EXAMPLES
  rhost-server                          # start with defaults
  rhost-server start --port 7000
  rhost-server init                     # scaffold config in current directory
  rhost-server init my-mush             # scaffold into my-mush/
  rhost-server init . --websocket --stunnel
`.trim());
}
