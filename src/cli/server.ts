// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit server  (also exposed as `rhost-server` bin)
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { GenericContainer, Wait } from 'testcontainers';
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
    const stunnelEnabled  = config.stunnel?.enable === true;
    const stunnelAccept   = config.stunnel?.acceptPort ?? 4203;

    const imageLabel = buildFromSource ? `source (${projectRoot})` : image;
    console.log(`\nStarting RhostMUSH — ${buildFromSource ? 'building from source' : `image: ${image}`}`);
    if (config.build && buildFromSource) {
        const flags = Object.entries(buildArgsFromConfig(config.build))
            .map(([k, v]) => `${k}=${v}`).join(', ');
        if (flags) console.log(`Build flags: ${flags}`);
    }
    if (stunnelEnabled) {
        console.log(`stunnel: TLS on :${stunnelAccept} → :${config.stunnel?.connectPort ?? port}`);
    }
    console.log('Pulling/building image and booting container… (first build may take several minutes)\n');

    // ── Build the GenericContainer ──────────────────────────────────────────
    let container: GenericContainer;

    if (buildFromSource) {
        let builder = GenericContainer.fromDockerfile(projectRoot);
        if (config.build) {
            builder = builder.withBuildArgs(buildArgsFromConfig(config.build));
        }
        container = await builder.build();
    } else {
        container = new GenericContainer(image!);
    }

    // ── Copy files into the container ────────────────────────────────────────
    if (config.scriptsDir) {
        if (!fs.existsSync(config.scriptsDir)) {
            console.error(`rhost-server: scriptsDir not found: ${config.scriptsDir}`);
            process.exit(1);
        }
        container = container.withCopyDirectoriesToContainer([{
            source: config.scriptsDir,
            target: CONTAINER_SCRIPTS_PATH,
        }]);
    }

    if (config.mushConfig) {
        if (!fs.existsSync(config.mushConfig)) {
            console.error(`rhost-server: mushConfig not found: ${config.mushConfig}`);
            process.exit(1);
        }
        container = container.withCopyFilesToContainer([{
            source: config.mushConfig,
            target: CONTAINER_MUSH_CONFIG_PATH,
        }]);
    }

    // ── stunnel environment + cert files ─────────────────────────────────────
    if (stunnelEnabled) {
        const stunnel = config.stunnel!;
        const envVars: Record<string, string> = { STUNNEL_ENABLE: 'true' };
        if (stunnel.acceptPort)  envVars['STUNNEL_ACCEPT_PORT']  = String(stunnel.acceptPort);
        if (stunnel.connectPort) envVars['STUNNEL_CONNECT_PORT'] = String(stunnel.connectPort);

        const certFile = stunnel.certFile;
        const keyFile  = stunnel.keyFile;

        if (certFile) {
            if (!fs.existsSync(certFile)) {
                console.error(`rhost-server: stunnel cert not found: ${certFile}`);
                process.exit(1);
            }
            container = container.withCopyFilesToContainer([{ source: certFile, target: CONTAINER_STUNNEL_CERT_PATH }]);
            envVars['STUNNEL_CERT'] = CONTAINER_STUNNEL_CERT_PATH;

            if (keyFile && keyFile !== certFile) {
                if (!fs.existsSync(keyFile)) {
                    console.error(`rhost-server: stunnel key not found: ${keyFile}`);
                    process.exit(1);
                }
                container = container.withCopyFilesToContainer([{ source: keyFile, target: CONTAINER_STUNNEL_KEY_PATH }]);
                envVars['STUNNEL_KEY'] = CONTAINER_STUNNEL_KEY_PATH;
            }
        }
        // If no certFile, entrypoint.sh auto-generates a self-signed cert.

        container = container.withEnvironment(envVars);
    }

    // ── Ports ─────────────────────────────────────────────────────────────────
    const exposedPorts: Array<number | { container: number; host: number }> = [
        { container: 4201, host: port },
    ];
    if (stunnelEnabled) {
        exposedPorts.push({ container: stunnelAccept, host: stunnelAccept });
    }

    const started = await container
        .withExposedPorts(...exposedPorts)
        .withWaitStrategy(Wait.forListeningPorts().withStartupTimeout(startupTimeout))
        .start();

    const host       = started.getHost();
    const mappedPort = started.getMappedPort(4201);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  RhostMUSH is running');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Host:      ${host}`);
    console.log(`  Port:      ${mappedPort}`);
    if (config.build?.enableWebSockets) {
        const wsProto = stunnelEnabled ? 'wss' : 'ws';
        const wsPort  = stunnelEnabled ? started.getMappedPort(stunnelAccept) : mappedPort;
        console.log(`  WebSocket: ${wsProto}://${host}:${wsPort}`);
    }
    if (stunnelEnabled) {
        const tlsPort = started.getMappedPort(stunnelAccept);
        console.log(`  TLS port:  ${tlsPort}  (via stunnel)`);
    }
    console.log(`  Image:     ${buildFromSource ? 'built from source' : imageLabel}`);
    console.log('  Wizard:    Wizard / Nyctasia  (default credentials)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nPress Ctrl+C to stop.\n');

    const shutdown = async () => {
        console.log('\nShutting down…');
        await started.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await new Promise(() => { /* runs until signal */ });
}
