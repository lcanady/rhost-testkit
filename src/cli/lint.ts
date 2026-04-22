// ---------------------------------------------------------------------------
// rhost-testkit lint — static analysis CLI
// ---------------------------------------------------------------------------

import * as fs   from 'fs';
import * as path from 'path';
import { lintContent, LintDiag, LintSeverity } from '../validator/mush-lint';

export function runLintCli(args: string[], cwd: string = process.cwd()): void {
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    const jsonMode = args.includes('--json');
    const strict   = args.includes('--strict');   // exit 1 on any WARN too
    const files    = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        const result = lintContent(input, '<stdin>');
        printResult('<stdin>', result.diagnostics, jsonMode);
        process.exit(exitCode(result.errors, result.warnings, strict));
        return;
    }

    let totalErrors = 0;
    let totalWarnings = 0;
    let exitWithError = false;

    for (const file of files) {
        const resolved = path.resolve(cwd, file);
        if (!fs.existsSync(resolved)) {
            console.error(`rhost-testkit lint: file not found: ${resolved}`);
            process.exit(1);
        }

        const content = fs.readFileSync(resolved, 'utf8');
        const result  = lintContent(content, file);

        printResult(path.relative(cwd, resolved), result.diagnostics, jsonMode);

        totalErrors   += result.errors;
        totalWarnings += result.warnings;

        if (exitCode(result.errors, result.warnings, strict) > 0) {
            exitWithError = true;
        }
    }

    if (files.length > 1 && !jsonMode) {
        console.log(`\nTotal: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${files.length} file(s)`);
    }

    process.exit(exitWithError ? 1 : 0);
}

function exitCode(errors: number, warnings: number, strict: boolean): number {
    if (errors > 0) return 1;
    if (strict && warnings > 0) return 1;
    return 0;
}

function printResult(filename: string, diags: LintDiag[], jsonMode: boolean): void {
    if (jsonMode) {
        console.log(JSON.stringify({ file: filename, diagnostics: diags }));
        return;
    }

    if (diags.length === 0) {
        console.log(`${filename}: clean`);
        return;
    }

    const errors   = diags.filter(d => d.severity === 'ERROR').length;
    const warnings = diags.filter(d => d.severity === 'WARN').length;
    const infos    = diags.filter(d => d.severity === 'INFO').length;

    const hdr = `mush-lint: ${filename}`;
    console.log(hdr);
    console.log('='.repeat(hdr.length));

    for (const d of diags) {
        const attrPart = d.attr ? `  [${d.attr}]` : '';
        const loc      = `line ${d.line}`;
        console.log(`${padRight(d.severity, 7)} ${padRight(d.code, 4)} ${padRight(loc, 10)}${attrPart}  ${d.message}`);
    }

    const summary: string[] = [];
    if (errors > 0)   summary.push(`${errors} error(s)`);
    if (warnings > 0) summary.push(`${warnings} warning(s)`);
    if (infos > 0)    summary.push(`${infos} info`);
    console.log(`\n${summary.join(', ')}`);

    if (errors > 0) {
        console.log('Packaging blocked until errors are resolved.');
    }
}

function padRight(s: string, n: number): string {
    return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printHelp(): void {
    console.log(`
USAGE
  rhost-testkit lint [options] [file...]

OPTIONS
  --json      Output diagnostics as JSON (one object per file, newline-delimited)
  --strict    Exit 1 on warnings as well as errors

SEVERITY
  ERROR  Must fix before packaging (blocks mush-build Phase 6)
  WARN   Should fix; explain if skipping
  INFO   Style suggestion

CHECKS
  S1  Bare user input in @pemit/@emit/think
  S2  @create without @lock
  S3  execscript() with user-controlled argument
  S4  User input in @switch case label
  S5  Hardcoded dbref in HELP* attributes
  C1  FN_* accepts %0 without input guard
  C2  CMD_* with no HELP* entry
  C3  Installer missing header/footer markers
  C4  Installer missing UNINSTALL section
  F1  @@ comment line exceeds 78 chars
  F2  Separator line not exactly 78 chars
  F3  Wrong attribute order (Config→UDFs→Commands→Help)
  F4  Comment style mismatch (// or ## instead of @@)
  L1  Attribute body exceeds 7500 chars (approaching Rhost limit)
  I1  Attribute name not uppercase
  I2  No Version field in installer header
  I3  No Requires field in installer header

EXAMPLES
  rhost-testkit lint softcode/my-system.mush
  rhost-testkit lint dist/my-system.installer.txt
  rhost-testkit lint --strict softcode/*.mush
  rhost-testkit lint --json dist/my-system.installer.txt
`.trim());
}
