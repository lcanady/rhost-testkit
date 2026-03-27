import { RunResult } from './runner';
import { SnapshotStats } from './snapshots';

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const USE_COLOR = process.stdout.isTTY === true;

function colorize(code: string, text: string): string {
    return USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
}

const green  = (s: string) => colorize('32', s);
const red    = (s: string) => colorize('31', s);
const yellow = (s: string) => colorize('33', s);
const cyan   = (s: string) => colorize('36', s);
const gray   = (s: string) => colorize('90', s);
const bold   = (s: string) => colorize('1',  s);

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

export class Reporter {
    constructor(private readonly verbose: boolean) {}

    suiteStart(name: string, depth: number): void {
        if (!this.verbose) return;
        const indent = '  '.repeat(depth);
        process.stdout.write(`\n${indent}${bold(name)}\n`);
    }

    testPass(name: string, ms: number, depth: number): void {
        if (!this.verbose) return;
        const indent = '  '.repeat(depth + 1);
        process.stdout.write(`${indent}${green('✓')} ${name} ${gray(`(${ms}ms)`)}\n`);
    }

    testFail(name: string, ms: number, depth: number, error: Error): void {
        if (!this.verbose) return;
        const indent = '  '.repeat(depth + 1);
        const errIndent = '  '.repeat(depth + 3);
        process.stdout.write(`${indent}${red('✗')} ${name} ${gray(`(${ms}ms)`)}\n`);
        const lines = error.message.split('\n');
        for (const line of lines) {
            process.stdout.write(`${errIndent}${line}\n`);
        }
    }

    testSkip(name: string, depth: number): void {
        if (!this.verbose) return;
        const indent = '  '.repeat(depth + 1);
        process.stdout.write(`${indent}${yellow('○')} ${gray(name)}\n`);
    }

    summary(result: RunResult): void {
        if (!this.verbose) return;
        const parts: string[] = [];
        if (result.passed > 0)  parts.push(green(`${result.passed} passed`));
        if (result.failed > 0)  parts.push(red(`${result.failed} failed`));
        if (result.skipped > 0) parts.push(yellow(`${result.skipped} skipped`));
        parts.push(`${result.total} total`);
        process.stdout.write(`\nTests:     ${parts.join(', ')} ${gray(`(${result.duration}ms)`)}\n`);
        this.snapshotSummary(result.snapshots);
    }

    snapshotSummary(stats: SnapshotStats): void {
        if (!this.verbose) return;
        const { matched, written, updated, obsolete } = stats;
        const total = matched + written + updated;
        if (total === 0 && obsolete === 0) return;

        const parts: string[] = [];
        if (matched > 0)  parts.push(green(`${matched} passed`));
        if (written > 0)  parts.push(cyan(`${written} written`));
        if (updated > 0)  parts.push(yellow(`${updated} updated`));
        if (obsolete > 0) parts.push(gray(`${obsolete} obsolete`));

        process.stdout.write(`Snapshots: ${parts.join(', ')}\n`);

        if (obsolete > 0) {
            process.stdout.write(
                gray(`           Run with RHOST_UPDATE_SNAPSHOTS=1 to remove obsolete snapshots.\n`)
            );
        }
    }
}
