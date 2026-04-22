// ---------------------------------------------------------------------------
// rhost-testkit mush-format — two-way .mush ↔ .installer.txt converter
// ---------------------------------------------------------------------------

import * as fs   from 'fs';
import * as path from 'path';
import { expandFile, compressFile, expandAttrValue } from '../validator/mush-format';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runMushFormatCli(args: string[], cwd: string = process.cwd()): void {
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
    }

    const mode = args[0];

    if (mode === 'expand') {
        runExpand(args.slice(1), cwd);
    } else if (mode === 'compress') {
        runCompress(args.slice(1), cwd);
    } else if (mode === 'preview') {
        runPreview(args.slice(1));
    } else {
        console.error(`rhost-testkit mush-format: unknown mode '${mode}'\n`);
        printHelp();
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// expand: dist/*.installer.txt  →  src/*.mush
// ---------------------------------------------------------------------------

function runExpand(args: string[], cwd: string): void {
    const indent = parseInt(getFlag(args, '--indent') ?? '2', 10);
    const files  = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        const { output } = expandFile(input, { indent });
        process.stdout.write(output);
        return;
    }

    for (const file of files) {
        const resolved = path.resolve(cwd, file);

        if (!fs.existsSync(resolved)) {
            console.error(`mush-format expand: file not found: ${resolved}`);
            process.exit(1);
        }

        const content = fs.readFileSync(resolved, 'utf8');
        const { output, changed } = expandFile(content, { indent });

        // Determine output path: dist/foo.installer.txt → src/foo.mush
        const outPath = installerToSrc(resolved);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, output, 'utf8');

        if (changed) {
            console.log(`expand: ${path.relative(cwd, resolved)} → ${path.relative(cwd, outPath)}`);
        } else {
            console.log(`expand: ${path.relative(cwd, resolved)} → unchanged`);
        }
    }
}

// ---------------------------------------------------------------------------
// compress: src/*.mush  →  dist/*.installer.txt
// ---------------------------------------------------------------------------

function runCompress(args: string[], cwd: string): void {
    const lowercase = args.includes('--lowercase');
    const name      = getFlag(args, '--name');
    const version   = getFlag(args, '--version');
    const author    = getFlag(args, '--author');
    const requires  = getFlag(args, '--requires');
    const files     = args.filter(a => !a.startsWith('-'));

    if (files.length === 0) {
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        const { output } = compressFile(input, { name, version, author, requires }, { lowercase });
        process.stdout.write(output);
        return;
    }

    for (const file of files) {
        const resolved = path.resolve(cwd, file);

        if (!fs.existsSync(resolved)) {
            console.error(`mush-format compress: file not found: ${resolved}`);
            process.exit(1);
        }

        const content = fs.readFileSync(resolved, 'utf8');

        // Try to read meta from a nearby package.json or manifest.json
        const meta = readMeta(path.dirname(resolved), { name, version, author, requires });
        const { output } = compressFile(content, meta, { lowercase });

        // Determine output path: src/foo.mush → dist/foo.installer.txt
        const outPath = srcToInstaller(resolved);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, output, 'utf8');

        console.log(`compress: ${path.relative(cwd, resolved)} → ${path.relative(cwd, outPath)}`);
    }
}

// ---------------------------------------------------------------------------
// preview: print the expanded form of a single attribute value to stdout
// Used for quick interactive inspection without touching files.
//
// Usage:  rhost-testkit mush-format preview '$+finger *:@pemit %#=[u(me/FN,0)]'
// ---------------------------------------------------------------------------

function runPreview(args: string[]): void {
    const indent = parseInt(getFlag(args, '--indent') ?? '2', 10);
    const values = args.filter(a => !a.startsWith('-'));

    if (values.length === 0) {
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        console.log(expandAttrValue(input.trim(), { indent }));
        return;
    }

    for (const v of values) {
        console.log(expandAttrValue(v, { indent }));
        if (values.length > 1) console.log();
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function installerToSrc(filePath: string): string {
    // dist/foo.installer.txt → softcode/foo.mush
    const dir  = path.dirname(filePath);
    const base = path.basename(filePath, '.installer.txt');
    const softDir = dir.replace(/[/\\]dist([/\\]|$)/, '/softcode$1');
    return path.join(softDir === dir ? path.join(dir, '..', 'softcode') : softDir, `${base}.mush`);
}

function srcToInstaller(filePath: string): string {
    // softcode/foo.mush → dist/foo.installer.txt
    const dir  = path.dirname(filePath);
    const base = path.basename(filePath, '.mush');
    const distDir = dir.replace(/[/\\]softcode([/\\]|$)/, '/dist$1');
    return path.join(distDir === dir ? path.join(dir, '..', 'dist') : distDir, `${base}.installer.txt`);
}

function getFlag(args: string[], flag: string): string | undefined {
    const idx = args.findIndex(a => a === flag || a.startsWith(flag + '='));
    if (idx === -1) return undefined;
    const arg = args[idx];
    if (arg.includes('=')) return arg.split('=').slice(1).join('=');
    return args[idx + 1];
}

function readMeta(
    dir: string,
    overrides: { name?: string; version?: string; author?: string; requires?: string }
): { name?: string; version?: string; author?: string; requires?: string } {
    // Try manifest.json first, then package.json
    for (const fname of ['manifest.json', 'package.json']) {
        const p = path.join(dir, fname);
        const up = path.join(dir, '..', fname);
        for (const candidate of [p, up]) {
            if (fs.existsSync(candidate)) {
                try {
                    const data = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
                    return {
                        name:     overrides.name     ?? (data.displayName as string) ?? (data.name as string),
                        version:  overrides.version  ?? (data.version as string),
                        author:   overrides.author   ?? (data.author as string),
                        requires: overrides.requires ?? (data.requires as string),
                    };
                } catch {
                    // ignore
                }
            }
        }
    }
    return overrides;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
    console.log(`
USAGE
  rhost-testkit mush-format <mode> [options] [file...]

MODES
  expand    dist/*.installer.txt → softcode/*.mush  (compressed → readable)
  compress  softcode/*.mush → dist/*.installer.txt  (readable → compressed)
  preview   Print expanded form of a single attribute value

EXPAND OPTIONS
  --indent=N        Indent size in spaces (default: 2)

COMPRESS OPTIONS
  --name=NAME       System name for the installer header
  --version=VER     Version string (default: reads from manifest.json)
  --author=AUTHOR   Author name
  --requires=DEPS   Prerequisite note (default: None)
  --lowercase       Normalise function names to lowercase

EXAMPLES
  rhost-testkit mush-format expand dist/my-system.installer.txt
  rhost-testkit mush-format compress src/my-system.mush
  rhost-testkit mush-format preview '$+finger *:@pemit %#=[u(me/FN_FINGER,%0)]'
  echo "add( 2 , 3 )" | rhost-testkit mush-format preview
`.trim());
}
