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
 * See `src/config.ts` for the full `RhostConfig` interface.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    GenericContainer,
    StartedTestContainer,
    Wait,
} from 'testcontainers';
import { RhostConfig, loadConfig } from './config';

export interface ContainerConnectionInfo {
    host: string;
    port: number;
}

/** Path inside the container where execscript files live. */
const CONTAINER_SCRIPTS_PATH = '/home/rhost/game/scripts';

/** Path inside the container where mush.config lives. */
const CONTAINER_MUSH_CONFIG_PATH = '/home/rhost/game/mush.config';

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
            return GenericContainer.fromDockerfile(root).build();
        }, cfg);
    }

    /**
     * Start the container. Blocks until port 4201 is accepting connections.
     * Returns the host and dynamically-assigned port to pass to `RhostClient`.
     *
     * If `config.scriptsDir` is set, the directory is copied into the container
     * at `/home/rhost/game/scripts` before startup.
     *
     * If `config.mushConfig` is set, the file is copied into the container at
     * `/home/rhost/game/mush.config` before startup.
     *
     * @param startupTimeout Max ms to wait for the server to be ready.
     *   Default: 120000 (2 min). Increase for slow machines or first builds.
     */
    async start(startupTimeout = 120_000): Promise<ContainerConnectionInfo> {
        let base = await this.factory();

        if (this.config.scriptsDir) {
            if (!fs.existsSync(this.config.scriptsDir)) {
                throw new Error(
                    `RhostContainer: scriptsDir not found: ${this.config.scriptsDir}`
                );
            }
            base = base.withCopyDirectoriesToContainer([{
                source: this.config.scriptsDir,
                target: CONTAINER_SCRIPTS_PATH,
            }]);
        }

        if (this.config.mushConfig) {
            if (!fs.existsSync(this.config.mushConfig)) {
                throw new Error(
                    `RhostContainer: mushConfig not found: ${this.config.mushConfig}`
                );
            }
            base = base.withCopyFilesToContainer([{
                source: this.config.mushConfig,
                target: CONTAINER_MUSH_CONFIG_PATH,
            }]);
        }

        this.started = await base
            .withExposedPorts(4201)
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
        return {
            host: this.started.getHost(),
            port: this.started.getMappedPort(4201),
        };
    }
}
