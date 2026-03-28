// ---------------------------------------------------------------------------
// rhost-testkit fmt — softcode formatter
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { format } from '../validator/formatter';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runFmtCli(args: string[], cwd: string = process.cwd()): void {
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    const checkMode = args.includes('--check');
    const pretty = args.includes('--pretty');
    const lowercase = args.includes('--lowercase');

    // Collect file paths (all non-flag args)
    const files = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        // Read from stdin
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        const result = format(input.trim(), { pretty, lowercase });
        if (!checkMode) {
            process.stdout.write(result.formatted + '\n');
        }
        if (checkMode && result.changed) {
            process.stderr.write('<stdin>: not formatted\n');
            process.exit(1);
        }
        return;
    }

    let anyChanged = false;

    for (const file of files) {
        const resolved = path.resolve(cwd, file);
        if (!fs.existsSync(resolved)) {
            console.error(`rhost-testkit fmt: file not found: ${resolved}`);
            process.exit(1);
        }

        const content = fs.readFileSync(resolved, 'utf8');
        const result = format(content.trim(), { pretty, lowercase });

        if (checkMode) {
            if (result.changed) {
                console.error(`${file}: not formatted`);
                anyChanged = true;
            }
        } else {
            if (result.changed) {
                fs.writeFileSync(resolved, result.formatted + '\n', 'utf8');
                console.log(`${file}: formatted`);
            } else {
                console.log(`${file}: already formatted`);
            }
        }
    }

    if (checkMode && anyChanged) {
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
    console.log(`
USAGE
  rhost-testkit fmt [options] [file...]

OPTIONS
  --check        Exit non-zero if any file is not formatted (no writes)
  --pretty       Indent nested function calls for human readability
  --lowercase    Normalise function names to lowercase
  -h, --help     Show this help

EXAMPLES
  rhost-testkit fmt mycode.mush
  rhost-testkit fmt --check mycode.mush
  rhost-testkit fmt --pretty mycode.mush
  echo "add( 2, 3 )" | rhost-testkit fmt
`.trim());
}
