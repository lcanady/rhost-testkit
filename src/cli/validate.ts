// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit validate
// ---------------------------------------------------------------------------

import { validate, validateFile, ValidationResult, Diagnostic } from '../validator';

export function runValidateCli(args: string[]): void {
  let expression: string | null = null;
  let filePath: string | null = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--file' || arg === '-f') {
      filePath = args[++i];
      if (!filePath) {
        die('--file requires a path argument');
      }
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      expression = arg;
    } else {
      die(`Unknown option: ${arg}`);
    }
  }

  if (!expression && !filePath) {
    console.error('Error: provide a softcode expression or --file <path>\n');
    printHelp();
    process.exit(1);
  }

  if (expression && filePath) {
    die('Provide either an expression or --file, not both');
  }

  let result: ValidationResult;
  try {
    result = filePath ? validateFile(filePath) : validate(expression!);
  } catch (err) {
    die(`Could not read file: ${(err as Error).message}`);
    return; // unreachable — die() throws
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, filePath ?? expression!);
  }

  process.exit(result.valid ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Human-readable output
// ---------------------------------------------------------------------------

function printHuman(result: ValidationResult, source: string): void {
  const { valid, diagnostics } = result;
  const statusIcon = valid ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const statusWord = valid ? '\x1b[32mvalid\x1b[0m' : '\x1b[31minvalid\x1b[0m';

  console.log(`${statusIcon} ${statusWord}  \x1b[90m${source}\x1b[0m`);

  if (diagnostics.length === 0) return;

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  for (const d of errors) {
    console.log(formatDiag(d));
  }
  for (const d of warnings) {
    console.log(formatDiag(d));
  }
}

function formatDiag(d: Diagnostic): string {
  const icon = d.severity === 'error' ? '\x1b[31m  ✗\x1b[0m' : '\x1b[33m  ⚠\x1b[0m';
  return `${icon} \x1b[2m[${d.code}]\x1b[0m ${d.message} \x1b[90m(offset ${d.offset})\x1b[0m`;
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
USAGE
  rhost-testkit validate "<expression>"
  rhost-testkit validate --file <path>

OPTIONS
  -f, --file <path>   Validate a softcode expression stored in a file
  --json              Output machine-readable JSON instead of human text
  -h, --help          Show this help

EXIT CODES
  0   Expression is valid (no errors; warnings are allowed)
  1   Expression has one or more errors

DIAGNOSTIC CODES
  E001  Unclosed '(' — missing closing ')'
  E002  Unexpected ')' with no matching '('
  E003  Unclosed '[' — missing closing ']'
  E004  Unexpected ']' with no matching '['
  E006  Too few arguments for a known built-in function
  E007  Too many arguments for a known built-in function
  W001  Empty expression
  W002  Empty argument (e.g. add(,3))
  W003  Deprecated function
  W005  Unknown function name (may be a UDF — only a warning)

EXAMPLES
  rhost-testkit validate "add(2,3)"
  rhost-testkit validate "add(2,3"            # E001: unclosed paren
  rhost-testkit validate "abs(1,2)"           # E007: too many args
  rhost-testkit validate --file funcs.mush
  rhost-testkit validate --json "add(2,3)"
`.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`rhost-testkit validate: ${msg}`);
  process.exit(1);
}
