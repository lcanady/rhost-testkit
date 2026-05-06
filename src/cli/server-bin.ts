#!/usr/bin/env node
// ---------------------------------------------------------------------------
// rhost-server — standalone server CLI
// ---------------------------------------------------------------------------

import { runServerCli, runStopCli, runRestartCli, runLogsCli, runPsCli } from './server';
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

    case 'stop':
        runStopCli(args.slice(1));
        break;

    case 'restart':
        runRestartCli(args.slice(1));
        break;

    case 'logs':
        runLogsCli(args.slice(1));
        break;

    case 'ps':
    case 'list':
        runPsCli(args.slice(1));
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
  start               Launch a RhostMUSH Docker container (default)
  stop   [name|port]  Stop a running instance
  restart [name|port] Restart a running instance
  logs   [name|port]  Follow logs of a running instance
  ps / list           List all running rhost instances
  init                Scaffold a rhost.config.json and supporting files

OPTIONS
  -v, --version   Print version and exit
  -h, --help      Show this help

Run \`rhost-server <command> --help\` for command-specific options.

EXAMPLES
  rhost-server                          # start on default port 4201
  rhost-server start --port 4300        # start on port 4300 (name: rhost-4300)
  rhost-server stop 4300                # stop by port
  rhost-server stop rhost-4300          # stop by name
  rhost-server logs 4300                # follow logs
  rhost-server restart 4300
  rhost-server ps                       # list running instances
  rhost-server init my-mush             # scaffold into my-mush/
`.trim());
}
