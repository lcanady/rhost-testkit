// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit server  (also exposed as `rhost-server` bin)
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync, spawn } from 'child_process';
import { loadConfig, RhostConfig, buildArgsFromConfig } from '../config';

const CONTAINER_SCRIPTS_PATH    = '/home/rhost/game/scripts';
const CONTAINER_MUSH_CONFIG_PATH = '/home/rhost/game/mush.config';
const CONTAINER_STUNNEL_CERT_PATH = '/home/rhost/stunnel-cert.pem';
const CONTAINER_STUNNEL_KEY_PATH  = '/home/rhost/stunnel-key.pem';

export interface ServerOptions {
    port: number;
    image: string | null;           // null = build from source
    buildFromSource: boolean;
    projectRoot: string;
    config: RhostConfig;
    startupTimeout: number;
}

export function parseArgs(args: string[]): ServerOptions | null {
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        return null;
    }

    let port = 4201;
    let image: string | null = 'lcanady/rhostmush:latest';
    let buildFromSource = false;
    let projectRoot = process.cwd();
    let configPath: string | null = null;
    let startupTimeout = 120_000;

    // Inline build flag overrides (merged on top of any config file)
    let enableWebSockets: boolean | undefined;
    let enableReality: boolean | undefined;
    let extraCflags: string | undefined;

    // Inline stunnel overrides
    let stunnelEnable: boolean | undefined;
    let stunnelAcceptPort: number | undefined;
    let stunnelConnectPort: number | undefined;
    let stunnelCert: string | undefined;
    let stunnelKey: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = () => {
            if (!args[i + 1]) { console.error(`${arg} requires a value`); process.exit(1); }
            return args[++i];
        };
        const nextInt = (flag: string) => {
            const n = parseInt(next(), 10);
            if (isNaN(n)) { console.error(`${flag} must be a number`); process.exit(1); }
            return n;
        };

        switch (arg) {
            case '-p': case '--port':            port = nextInt('--port'); break;
            case '--image':                      image = next(); break;
            case '--build-from-source':          buildFromSource = true; image = null; break;
            case '--project-root':               projectRoot = path.resolve(next()); break;
            case '-c': case '--config':          configPath = path.resolve(next()); break;
            case '--startup-timeout':            startupTimeout = nextInt('--startup-timeout'); break;
            // compile-time build flags
            case '--enable-websockets':          enableWebSockets = true; break;
            case '--disable-websockets':         enableWebSockets = false; break;
            case '--enable-reality':             enableReality = true; break;
            case '--extra-cflags':               extraCflags = next(); break;
            // stunnel
            case '--stunnel':                    stunnelEnable = true; break;
            case '--stunnel-port':               stunnelAcceptPort = nextInt('--stunnel-port'); stunnelEnable = true; break;
            case '--stunnel-connect-port':       stunnelConnectPort = nextInt('--stunnel-connect-port'); break;
            case '--stunnel-cert':               stunnelCert = path.resolve(next()); break;
            case '--stunnel-key':                stunnelKey = path.resolve(next()); break;
            default:
                console.error(`rhost-server: unknown option '${arg}'\n`);
                printHelp();
                process.exit(1);
        }
    }

    // Load config file
    let config: RhostConfig = {};
    if (configPath) {
        const stat = fs.existsSync(configPath) && fs.statSync(configPath);
        const dir = stat && stat.isDirectory() ? configPath : path.dirname(configPath);
        config = loadConfig(dir) ?? {};
    } else {
        config = loadConfig() ?? {};
    }

    // Merge CLI build flags on top of config file
    if (enableWebSockets !== undefined || enableReality !== undefined || extraCflags !== undefined) {
        config.build = {
            ...config.build,
            ...(enableWebSockets !== undefined && { enableWebSockets }),
            ...(enableReality !== undefined    && { enableReality }),
            ...(extraCflags !== undefined      && { extraCflags }),
        };
    }

    // Merge CLI stunnel flags on top of config file
    if (stunnelEnable !== undefined || stunnelAcceptPort !== undefined ||
        stunnelConnectPort !== undefined || stunnelCert !== undefined || stunnelKey !== undefined) {
        config.stunnel = {
            ...config.stunnel,
            ...(stunnelEnable !== undefined       && { enable: stunnelEnable }),
            ...(stunnelAcceptPort !== undefined   && { acceptPort: stunnelAcceptPort }),
            ...(stunnelConnectPort !== undefined  && { connectPort: stunnelConnectPort }),
            ...(stunnelCert !== undefined         && { certFile: stunnelCert }),
            ...(stunnelKey !== undefined          && { keyFile: stunnelKey }),
        };
    }

    return { port, image, buildFromSource, projectRoot, config, startupTimeout };
}

function printHelp(): void {
    console.log(`
rhost-server — Start a RhostMUSH Docker server

USAGE
  rhost-server [options]
  rhost-testkit server [options]

SERVER OPTIONS
  -p, --port <n>              Host port to publish the MUSH on. Default: 4201
  --image <name>              Docker image to use. Default: lcanady/rhostmush:latest
  --build-from-source         Build the image from source instead of pulling
  --project-root <path>       Path to the rhostmush-docker repo (with --build-from-source)
  -c, --config <path>         Path to rhost.config.json (or its directory)
  --startup-timeout <ms>      Max ms to wait for ready. Default: 120000

COMPILE-TIME FLAGS  (require --build-from-source)
  --enable-websockets         Enable WebSocket (RFC 6455) support
  --disable-websockets        Disable WebSocket support
  --enable-reality            Enable REALMS/Reality Levels system
  --extra-cflags <flags>      Additional raw CFLAGS (e.g. "-DFOO -DBAR")

STUNNEL OPTIONS
  --stunnel                   Wrap the MUSH port in TLS via stunnel
  --stunnel-port <n>          Port stunnel listens on for TLS. Default: 4203
  --stunnel-connect-port <n>  Internal port stunnel forwards to. Default: 4201
  --stunnel-cert <path>       PEM certificate file (auto-generated if omitted)
  --stunnel-key <path>        PEM private key file (defaults to --stunnel-cert)

  -h, --help                  Show this help

EXAMPLES
  rhost-server
  rhost-server --port 7000
  rhost-server --config ./rhost.config.json
  rhost-server --build-from-source --enable-websockets
  rhost-server --stunnel --stunnel-port 4203 --stunnel-cert ./cert.pem
  rhost-server --build-from-source --enable-websockets --stunnel
`.trim());
}

export async function runServerCli(args: string[]): Promise<void> {
    const opts = parseArgs(args);
    if (!opts) return;

    const { port, image, buildFromSource, projectRoot, config, startupTimeout } = opts;
    const stunnelEnabled = config.stunnel?.enable === true;
    const stunnelAccept  = config.stunnel?.acceptPort ?? 4203;

    console.log(`\nStarting RhostMUSH — ${buildFromSource ? 'building from source' : `image: ${image}`}`);
    if (config.build && buildFromSource) {
        const flags = Object.entries(buildArgsFromConfig(config.build))
            .map(([k, v]) => `${k}=${v}`).join(', ');
        if (flags) console.log(`Build flags: ${flags}`);
    }
    if (stunnelEnabled) {
        console.log(`stunnel: TLS on :${stunnelAccept} → :${config.stunnel?.connectPort ?? 4201}`);
    }
    console.log('Pulling/building image and booting container… (first build may take several minutes)\n');

    // ── Build image if needed ────────────────────────────────────────────────
    let runImage = image!;

    if (buildFromSource) {
        runImage = `rhost-testkit-local:${Date.now()}`;
        const buildArgs: string[] = ['build', '-t', runImage];
        if (config.build) {
            for (const [k, v] of Object.entries(buildArgsFromConfig(config.build))) {
                buildArgs.push('--build-arg', `${k}=${v}`);
            }
        }
        buildArgs.push(projectRoot);
        const built = spawnSync('docker', buildArgs, { stdio: 'inherit' });
        if (built.status !== 0) {
            console.error('rhost-server: docker build failed');
            process.exit(1);
        }
    }

    // ── Assemble `docker run` arguments ─────────────────────────────────────
    const runArgs: string[] = ['run', '--rm', '-p', `${port}:4201`];

    if (stunnelEnabled) {
        runArgs.push('-p', `${stunnelAccept}:${stunnelAccept}`);
        runArgs.push('-e', 'STUNNEL_ENABLE=true');
        if (config.stunnel?.acceptPort)  runArgs.push('-e', `STUNNEL_ACCEPT_PORT=${config.stunnel.acceptPort}`);
        if (config.stunnel?.connectPort) runArgs.push('-e', `STUNNEL_CONNECT_PORT=${config.stunnel.connectPort}`);

        const certFile = config.stunnel?.certFile;
        const keyFile  = config.stunnel?.keyFile;
        if (certFile) {
            if (!fs.existsSync(certFile)) {
                console.error(`rhost-server: stunnel cert not found: ${certFile}`);
                process.exit(1);
            }
            runArgs.push('-v', `${certFile}:${CONTAINER_STUNNEL_CERT_PATH}:ro`);
            runArgs.push('-e', `STUNNEL_CERT=${CONTAINER_STUNNEL_CERT_PATH}`);
            if (keyFile && keyFile !== certFile) {
                if (!fs.existsSync(keyFile)) {
                    console.error(`rhost-server: stunnel key not found: ${keyFile}`);
                    process.exit(1);
                }
                runArgs.push('-v', `${keyFile}:${CONTAINER_STUNNEL_KEY_PATH}:ro`);
                runArgs.push('-e', `STUNNEL_KEY=${CONTAINER_STUNNEL_KEY_PATH}`);
            }
        }
    }

    if (config.scriptsDir) {
        if (!fs.existsSync(config.scriptsDir)) {
            console.error(`rhost-server: scriptsDir not found: ${config.scriptsDir}`);
            process.exit(1);
        }
        runArgs.push('-v', `${path.resolve(config.scriptsDir)}:${CONTAINER_SCRIPTS_PATH}:ro`);
    }

    if (config.mushConfig) {
        if (!fs.existsSync(config.mushConfig)) {
            console.error(`rhost-server: mushConfig not found: ${config.mushConfig}`);
            process.exit(1);
        }
        runArgs.push('-v', `${path.resolve(config.mushConfig)}:${CONTAINER_MUSH_CONFIG_PATH}:ro`);
    }

    runArgs.push(runImage);

    // ── Wait for port to be reachable, then print banner ────────────────────
    const container = spawn('docker', runArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let ready = false;
    const deadline = Date.now() + startupTimeout;

    const waitForPort = (): Promise<void> => new Promise((resolve, reject) => {
        const { createConnection } = require('net') as typeof import('net');
        const tryConnect = () => {
            if (Date.now() > deadline) {
                reject(new Error(`rhost-server: timed out waiting for port ${port} after ${startupTimeout}ms`));
                return;
            }
            const sock = createConnection({ port, host: '127.0.0.1' });
            sock.once('connect', () => { sock.destroy(); resolve(); });
            sock.once('error',   () => { sock.destroy(); setTimeout(tryConnect, 500); });
        };
        tryConnect();
    });

    container.stderr.on('data', (d: Buffer) => process.stderr.write(d));

    // Stream stdout until ready, then suppress (MUSH is chatty)
    container.stdout.on('data', (d: Buffer) => {
        if (!ready) process.stdout.write(d);
    });

    container.on('exit', (code) => {
        if (!ready) {
            console.error(`\nrhost-server: container exited with code ${code}`);
            process.exit(code ?? 1);
        }
    });

    try {
        await waitForPort();
    } catch (err) {
        container.kill();
        console.error((err as Error).message);
        process.exit(1);
    }

    ready = true;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  RhostMUSH is running');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Host:      localhost`);
    console.log(`  Port:      ${port}`);
    if (config.build?.enableWebSockets) {
        const wsProto = stunnelEnabled ? 'wss' : 'ws';
        const wsPort  = stunnelEnabled ? stunnelAccept : port;
        console.log(`  WebSocket: ${wsProto}://localhost:${wsPort}`);
    }
    if (stunnelEnabled) {
        console.log(`  TLS port:  ${stunnelAccept}  (via stunnel)`);
    }
    console.log(`  Image:     ${buildFromSource ? 'built from source' : image}`);
    console.log('  Wizard:    Wizard / Nyctasia  (default credentials)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nPress Ctrl+C to stop.\n');

    const shutdown = () => {
        console.log('\nShutting down…');
        container.kill('SIGTERM');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await new Promise<void>((resolve) => container.on('exit', resolve));
}
