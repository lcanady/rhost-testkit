// ---------------------------------------------------------------------------
// rhost-testkit deploy — softcode deploy pipeline with rollback
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { parseDeployFile } from '../deployer';

// ---------------------------------------------------------------------------
// Public entry point (testable with injected cwd)
// ---------------------------------------------------------------------------

export function runDeployCli(args: string[], cwd: string = process.cwd()): void {
    // --help
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    // Parse flags
    const fileIndex = args.indexOf('--file');
    const filePath = fileIndex !== -1 ? args[fileIndex + 1] : undefined;
    const dryRun = args.includes('--dry-run');
    const parseOnly = args.includes('--parse-only');

    if (!filePath) {
        console.error('rhost-testkit deploy: --file <path> is required\n');
        printHelp();
        process.exit(1);
    }

    const resolved = path.resolve(cwd, filePath);
    if (!fs.existsSync(resolved)) {
        console.error(`rhost-testkit deploy: file not found: ${resolved}`);
        process.exit(1);
    }

    const content = fs.readFileSync(resolved, 'utf8');
    const commands = parseDeployFile(content);

    // --parse-only: validate file contents and exit
    if (parseOnly) {
        if (commands.length === 0) {
            console.error('rhost-testkit deploy: no commands found in file');
            process.exit(1);
        }
        console.log(`rhost-testkit deploy: ${commands.length} command(s) parsed OK`);
        for (const cmd of commands) {
            console.log(`  &${cmd.attr} ${cmd.dbref}=<value>`);
        }
        process.exit(0);
    }

    // --dry-run: show what would be applied without connecting
    if (dryRun) {
        console.log(`rhost-testkit deploy (dry-run): ${commands.length} command(s) would be applied`);
        for (const cmd of commands) {
            console.log(`  &${cmd.attr} ${cmd.dbref}=${cmd.value}`);
        }
        return;
    }

    // Live deploy requires connection flags — remind the user
    console.error(
        'rhost-testkit deploy: live deploy requires --host, --port, --user, --pass.\n' +
        'Use --dry-run to preview without connecting, or the programmatic API for full deploy.'
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
    console.log(`
USAGE
  rhost-testkit deploy --file <path> [options]

OPTIONS
  --file <path>    Path to softcode file (required)
  --dry-run        Preview commands without connecting to the server
  --parse-only     Validate the file format and exit
  -h, --help       Show this help

FILE FORMAT
  Lines of the form:  &ATTRNAME #DBREF=value
  Lines starting with # or @@ are treated as comments.

EXAMPLES
  rhost-testkit deploy --file mycode.mush --dry-run
  rhost-testkit deploy --file mycode.mush --parse-only

For live deployment with rollback, use the programmatic API:
  import { deploy, parseDeployFile } from '@rhost/testkit';
`.trim());
}
