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
 */
import * as path from 'path';
import {
    GenericContainer,
    StartedTestContainer,
    Wait,
} from 'testcontainers';

export interface ContainerConnectionInfo {
    host: string;
    port: number;
}

type ContainerFactory = () => Promise<GenericContainer>;

export class RhostContainer {
    private started: StartedTestContainer | null = null;
    private readonly factory: ContainerFactory;

    private constructor(factory: ContainerFactory) {
        this.factory = factory;
    }

    /**
     * Use a pre-built Docker image.
     * Build it first with: `docker build -t rhostmush:latest .`
     * (run from the rhostmush-docker repo root)
     */
    static fromImage(image = 'lcanady/rhostmush:latest'): RhostContainer {
        return new RhostContainer(async () => new GenericContainer(image));
    }

    /**
     * Build the image from the Dockerfile in the rhostmush-docker project root.
     *
     * The first build clones and compiles RhostMUSH from source — allow 5-10
     * minutes. Subsequent runs reuse Docker's layer cache.
     *
     * @param projectRoot - Path to the rhostmush-docker directory.
     *   Defaults to `../` relative to this file (i.e. the repo root).
     */
    static fromSource(projectRoot?: string): RhostContainer {
        const root = projectRoot
            ? path.resolve(projectRoot)
            : path.resolve(__dirname, '../');

        return new RhostContainer(async () => {
            return GenericContainer.fromDockerfile(root).build();
        });
    }

    /**
     * Start the container. Blocks until port 4201 is accepting connections.
     * Returns the host and dynamically-assigned port to pass to `RhostClient`.
     *
     * @param startupTimeout - Max ms to wait for the server to be ready.
     *   Default: 120000 (2 min). Increase for slow machines or first builds.
     */
    async start(startupTimeout = 120_000): Promise<ContainerConnectionInfo> {
        const base = await this.factory();
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
