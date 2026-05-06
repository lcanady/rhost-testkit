/**
 * RhostContainer — wraps testcontainers to spin up a real RhostMUSH server
 * for integration tests without any manual `docker compose up`.
 *
 * Two modes:
 *   1. Pre-built image (fast):   RhostContainer.fromImage('rhostmush:latest')
 *   2. Build from source (slow first run, cached thereafter):
 *                                RhostContainer.fromSource()
 *
 * RhostMUSH takes longer to start than most servers (compiles from source on
 * first build, then initialises a flat-file database). The container waits
 * for port 4201 to be accepting connections before returning.
 *
 * Default wizard credentials for the minimal_db: Wizard / Nyctasia
 *
 * Custom scripts and config
 * ─────────────────────────
 * Pass a `RhostConfig` (or place `rhost.config.json` in your project root)
 * to inject a custom scripts directory or MUSH config file into the container
 * before it starts:
 *
 *   RhostContainer.fromSource(undefined, { scriptsDir: './my-scripts' })
 *
 * Compile-time features (fromSource only)
 * ────────────────────────────────────────
 *   RhostContainer.fromSource(undefined, {
 *     build: { enableWebSockets: true, enableSsl: true }
 *   })
 *
 * stunnel TLS wrapper
 * ───────────────────
 *   RhostContainer.fromImage('lcanady/rhostmush:latest', {
 *     stunnel: { enable: true, acceptPort: 4203, certFile: './cert.pem' }
 *   })
 *
 * See `src/config.ts` for the full `RhostConfig` interface.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    GenericContainer,
    StartedTestContainer,
    Wait,
} from 'testcontainers';
import { RhostConfig, loadConfig, buildArgsFromConfig, stunnelEnvFromConfig } from './config';

export interface ContainerConnectionInfo {
    host: string;
    /** Plain MUSH / telnet port */
    port: number;
    /** stunnel TLS port, if stunnel was enabled */
    stunnelPort?: number;
}

/** Path inside the container where execscript files live. */
const CONTAINER_SCRIPTS_PATH = '/home/rhost/game/scripts';

/** Path inside the container where mush.config lives. */
const CONTAINER_MUSH_CONFIG_PATH = '/home/rhost/game/mush.config';

/** Path inside the container where stunnel cert/key are copied. */
const CONTAINER_STUNNEL_CERT_PATH = '/home/rhost/stunnel-cert.pem';
const CONTAINER_STUNNEL_KEY_PATH  = '/home/rhost/stunnel-key.pem';

type ContainerFactory = () => Promise<GenericContainer>;

export class RhostContainer {
    private started: StartedTestContainer | null = null;
    private readonly factory: ContainerFactory;
    private readonly config: RhostConfig;

    private constructor(factory: ContainerFactory, config: RhostConfig) {
        this.factory = factory;
        this.config  = config;
    }

    /**
     * Use a pre-built Docker image.
     * Build it first with: `docker build -t rhostmush:latest .`
     *
     * @param image  Docker image name. Defaults to `lcanady/rhostmush:latest`.
     * @param config Optional config overrides. If omitted, `rhost.config.json`
     *               is loaded from `process.cwd()` when present.
     */
    static fromImage(image = 'lcanady/rhostmush:latest', config?: RhostConfig): RhostContainer {
        const cfg = config ?? loadConfig() ?? {};
        return new RhostContainer(async () => new GenericContainer(image), cfg);
    }

    /**
     * Build the image from the Dockerfile in the rhostmush-docker project root.
     *
     * The first build clones and compiles RhostMUSH from source — allow 5-10
     * minutes. Subsequent runs reuse Docker's layer cache.
     *
     * Compile-time features in `config.build` (enableWebSockets, enableSsl,
     * enablePueblo, enableReality, extraCflags) are passed as Docker build args.
     *
     * @param projectRoot Path to the rhostmush-docker directory.
     *   Defaults to `../` relative to this file (i.e. the repo root).
     * @param config Optional config overrides. If omitted, `rhost.config.json`
     *               is loaded from `process.cwd()` when present.
     */
    static fromSource(projectRoot?: string, config?: RhostConfig): RhostContainer {
        const root = projectRoot
            ? path.resolve(projectRoot)
            : path.resolve(__dirname, '../');

        const cfg = config ?? loadConfig() ?? {};

        return new RhostContainer(async () => {
            let builder = GenericContainer.fromDockerfile(root);

            if (cfg.build) {
                builder = builder.withBuildArgs(buildArgsFromConfig(cfg.build));
            }

            return builder.build();
        }, cfg);
    }

    /**
     * Start the container. Blocks until port 4201 is accepting connections.
     * Returns host/port info to pass to `RhostClient`.
     *
     * @param startupTimeout Max ms to wait for the server to be ready.
     *   Default: 120000 (2 min). Increase for slow machines or first builds.
     */
    async start(startupTimeout = 120_000): Promise<ContainerConnectionInfo> {
        let base = await this.factory();

        // ── File copies ───────────────────────────────────────────────────────
        if (this.config.scriptsDir) {
            if (!fs.existsSync(this.config.scriptsDir)) {
                throw new Error(`RhostContainer: scriptsDir not found: ${this.config.scriptsDir}`);
            }
            base = base.withCopyDirectoriesToContainer([{
                source: this.config.scriptsDir,
                target: CONTAINER_SCRIPTS_PATH,
            }]);
        }

        if (this.config.mushConfig) {
            if (!fs.existsSync(this.config.mushConfig)) {
                throw new Error(`RhostContainer: mushConfig not found: ${this.config.mushConfig}`);
            }
            base = base.withCopyFilesToContainer([{
                source: this.config.mushConfig,
                target: CONTAINER_MUSH_CONFIG_PATH,
            }]);
        }

        // ── stunnel ──────────────────────────────────────────────────────────
        const stunnelCfg = this.config.stunnel;
        const stunnelEnabled = stunnelCfg?.enable === true;
        const stunnelAcceptPort = stunnelCfg?.acceptPort ?? 4203;

        if (stunnelEnabled) {
            // Build env vars from scratch rather than using stunnelEnvFromConfig()
            // so that cert/key paths are always set to the in-container paths,
            // never host paths that wouldn't exist inside the container.
            const envVars: Record<string, string> = { STUNNEL_ENABLE: 'true' };
            if (stunnelCfg!.acceptPort)  envVars['STUNNEL_ACCEPT_PORT']  = String(stunnelCfg!.acceptPort);
            if (stunnelCfg!.connectPort) envVars['STUNNEL_CONNECT_PORT'] = String(stunnelCfg!.connectPort);

            const certFile = stunnelCfg!.certFile;
            const keyFile  = stunnelCfg!.keyFile;

            if (certFile) {
                if (!fs.existsSync(certFile)) {
                    throw new Error(`RhostContainer: stunnel.certFile not found: ${certFile}`);
                }
                base = base.withCopyFilesToContainer([{ source: certFile, target: CONTAINER_STUNNEL_CERT_PATH }]);
                envVars['STUNNEL_CERT'] = CONTAINER_STUNNEL_CERT_PATH;

                // Separate key file only when it differs from the cert file
                if (keyFile && keyFile !== certFile) {
                    if (!fs.existsSync(keyFile)) {
                        throw new Error(`RhostContainer: stunnel.keyFile not found: ${keyFile}`);
                    }
                    base = base.withCopyFilesToContainer([{ source: keyFile, target: CONTAINER_STUNNEL_KEY_PATH }]);
                    envVars['STUNNEL_KEY'] = CONTAINER_STUNNEL_KEY_PATH;
                }
                // If keyFile === certFile (combined PEM), stunnel reads key from the same file;
                // STUNNEL_KEY is left unset so entrypoint.sh defaults it to STUNNEL_CERT.
            }
            // If no certFile is given, entrypoint.sh auto-generates a self-signed cert.

            for (const [k, v] of Object.entries(envVars)) {
                base = base.withEnvironment({ [k]: v });
            }
        }

        // ── Ports ─────────────────────────────────────────────────────────────
        const exposedPorts: number[] = [4201];
        if (stunnelEnabled) exposedPorts.push(stunnelAcceptPort);

        this.started = await base
            .withExposedPorts(...exposedPorts)
            .withWaitStrategy(
                Wait.forListeningPorts().withStartupTimeout(startupTimeout)
            )
            .start();

        return this.getConnectionInfo();
    }

    /** Stop and remove the container. Safe to call if never started. */
    async stop(): Promise<void> {
        await this.started?.stop();
        this.started = null;
    }

    /** Connection details. Throws if the container is not running. */
    getConnectionInfo(): ContainerConnectionInfo {
        if (!this.started) {
            throw new Error('Container is not running — call start() first.');
        }
        const info: ContainerConnectionInfo = {
            host: this.started.getHost(),
            port: this.started.getMappedPort(4201),
        };
        const stunnelAcceptPort = this.config.stunnel?.acceptPort ?? 4203;
        if (this.config.stunnel?.enable) {
            info.stunnelPort = this.started.getMappedPort(stunnelAcceptPort);
        }
        return info;
    }
}
