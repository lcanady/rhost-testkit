// ---------------------------------------------------------------------------
// CLI handler: rhost-server init
// ---------------------------------------------------------------------------

import * as fs   from 'fs';
import * as path from 'path';

interface InitOptions {
    dir: string;
    websocket: boolean;
    stunnel: boolean;
    reality: boolean;
    force: boolean;
}

function parseArgs(args: string[]): InitOptions | null {
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        return null;
    }

    let dir       = process.cwd();
    let websocket = false;
    let stunnel   = false;
    let reality   = false;
    let force     = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--websocket' || arg === '--ws') {
            websocket = true;
        } else if (arg === '--stunnel') {
            stunnel   = true;
            websocket = true; // stunnel implies websocket
        } else if (arg === '--reality') {
            reality = true;
        } else if (arg === '--force' || arg === '-f') {
            force = true;
        } else if (!arg.startsWith('-')) {
            dir = path.resolve(arg);
        } else {
            console.error(`rhost-server init: unknown option '${arg}'\n`);
            printHelp();
            process.exit(1);
        }
    }

    return { dir, websocket, stunnel, reality, force };
}

function printHelp(): void {
    console.log(`
rhost-server init — scaffold a server configuration

USAGE
  rhost-server init [dir] [options]

ARGUMENTS
  dir               Directory to scaffold (default: current directory)

OPTIONS
  --websocket, --ws   Enable WebSocket support in the generated config
  --stunnel           Enable stunnel TLS wrapper (implies --websocket)
  --reality           Enable Reality Levels in the generated config
  --force, -f         Overwrite existing files
  -h, --help          Show this help

OUTPUT
  rhost.config.json    Server configuration file
  .env                 Environment variable overrides
  certs/               Directory for TLS certificates (when --stunnel)
  scripts/             Directory for execscript files
  persistent_data/     Directory for persistent game data

EXAMPLES
  rhost-server init
  rhost-server init my-mush
  rhost-server init . --websocket
  rhost-server init . --stunnel --force
`.trim());
}

function write(filePath: string, content: string, force: boolean): void {
    if (fs.existsSync(filePath) && !force) {
        console.log(`  skip   ${path.basename(filePath)}  (already exists — use --force to overwrite)`);
        return;
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  write  ${path.relative(process.cwd(), filePath)}`);
}

function mkdir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  mkdir  ${path.relative(process.cwd(), dirPath)}/`);
    }
}

export function runServerInitCli(args: string[]): void {
    const opts = parseArgs(args);
    if (!opts) return;

    const { dir, websocket, stunnel, reality, force } = opts;

    mkdir(dir);

    console.log(`\nScaffolding RhostMUSH server config in ${path.relative(process.cwd(), dir) || '.'}\n`);

    // ── rhost.config.json ──────────────────────────────────────────────────
    const config: Record<string, unknown> = {
        scriptsDir: './scripts',
    };

    if (websocket || reality) {
        const build: Record<string, unknown> = {};
        if (websocket) build.enableWebSockets = true;
        if (reality)   build.enableReality    = true;
        config.build = build;
    }

    if (stunnel) {
        config.stunnel = {
            enable:      true,
            acceptPort:  4203,
            connectPort: 4201,
            certFile:    './certs/server.pem',
            keyFile:     './certs/server.key',
        };
    }

    write(
        path.join(dir, 'rhost.config.json'),
        JSON.stringify(config, null, 2) + '\n',
        force,
    );

    // ── .env ───────────────────────────────────────────────────────────────
    const envLines = [
        '# RhostMUSH server settings',
        'RHOST_PORT=4201',
        'RHOST_MUD_NAME=RhostMUSH',
        'RHOST_API_PORT=4202',
        '# Change this before exposing the server to any network:',
        'RHOST_PASS=Nyctasia',
        '',
        '# Persistent game data directory',
        'RHOST_DATA_DIR=./persistent_data',
    ];

    if (stunnel) {
        envLines.push(
            '',
            '# stunnel TLS wrapper',
            'STUNNEL_ENABLE=true',
            'STUNNEL_ACCEPT_PORT=4203',
            'STUNNEL_CONNECT_PORT=4201',
            '# STUNNEL_CERT=./certs/server.pem',
            '# STUNNEL_KEY=./certs/server.key',
        );
    }

    write(path.join(dir, '.env'), envLines.join('\n') + '\n', force);

    // ── directories ────────────────────────────────────────────────────────
    mkdir(path.join(dir, 'scripts'));
    mkdir(path.join(dir, 'persistent_data'));

    if (stunnel) {
        mkdir(path.join(dir, 'certs'));
        write(
            path.join(dir, 'certs', '.gitkeep'),
            '',
            force,
        );
        // gitignore the actual cert files, keep the directory
        write(
            path.join(dir, 'certs', '.gitignore'),
            '*.pem\n*.key\n*.crt\n*.p12\n',
            force,
        );
    }

    // ── .gitignore ─────────────────────────────────────────────────────────
    const ignoreLines = [
        '.env',
        'persistent_data/',
        'node_modules/',
    ];
    if (stunnel) ignoreLines.push('certs/*.pem', 'certs/*.key');

    write(path.join(dir, '.gitignore'), ignoreLines.join('\n') + '\n', force);

    // ── summary ────────────────────────────────────────────────────────────
    console.log('\nDone. Next steps:\n');

    if (stunnel) {
        console.log('  1. Add your TLS certificate and key to certs/');
        console.log('     (or omit them — a self-signed cert will be generated automatically)');
        console.log('  2. Edit .env to set RHOST_PASS and RHOST_MUD_NAME');
        console.log('  3. Run: rhost-server start --build-from-source --config rhost.config.json');
    } else {
        console.log('  1. Edit .env to set RHOST_PASS and RHOST_MUD_NAME');
        console.log('  2. Run: rhost-server start');
        if (websocket) {
            console.log('     (with WebSocket: rhost-server start --build-from-source)');
        }
    }
    console.log();
}
