/**
 * rhost.config.json loader
 *
 * Users can place a `rhost.config.json` at the root of their project to
 * customise how RhostContainer starts.  All paths in the config are resolved
 * relative to the directory that contains the config file.
 *
 * Minimal example:
 * ```json
 * {
 *   "scriptsDir": "./scripts",
 *   "mushConfig": "./mush.conf"
 * }
 * ```
 *
 * Full example with build flags and stunnel:
 * ```json
 * {
 *   "scriptsDir": "./scripts",
 *   "mushConfig": "./mush.conf",
 *   "build": {
 *     "enableWebSockets": true,
 *     "enableSsl": true,
 *     "extraCflags": "-DPUEBLO"
 *   },
 *   "stunnel": {
 *     "enable": true,
 *     "acceptPort": 4203,
 *     "connectPort": 4201,
 *     "certFile": "./certs/server.pem",
 *     "keyFile": "./certs/server.key"
 *   }
 * }
 * ```
 */
import * as fs from 'fs';
import * as path from 'path';

export const CONFIG_FILENAME = 'rhost.config.json';

export interface RhostBuildConfig {
    /**
     * Compile RhostMUSH with WebSocket (RFC 6455) support.
     * Equivalent to the ENABLE_WEBSOCKETS compile-time flag.
     * Default: false
     */
    enableWebSockets?: boolean;
    /**
     * Compile RhostMUSH with the reality levels system.
     * Default: false
     */
    enableReality?: boolean;
    /**
     * Arbitrary extra compiler flags passed directly to CFLAGS.
     * Use for any compile-time feature not covered above.
     * Example: "-DSOME_FEATURE -DANOTHER"
     */
    extraCflags?: string;
}

export interface RhostStunnelConfig {
    /**
     * Launch a stunnel process inside the container to wrap the MUSH port
     * (or WebSocket port) in TLS.  Required when clients connect via wss://
     * or a browser enforces mixed-content rules.
     * Default: false
     */
    enable?: boolean;
    /**
     * Port stunnel listens on for incoming TLS connections.
     * This is the port clients connect to (e.g. for wss://).
     * Default: 4203
     */
    acceptPort?: number;
    /**
     * Internal port stunnel forwards decrypted traffic to.
     * Should match RHOST_PORT (plain MUSH) or the WebSocket port.
     * Default: 4201
     */
    connectPort?: number;
    /**
     * Path to the PEM certificate file.
     * If omitted, a self-signed certificate is generated automatically
     * (suitable for testing; not for production).
     * Relative to the directory containing rhost.config.json.
     */
    certFile?: string;
    /**
     * Path to the PEM private key file.
     * Defaults to certFile if not set (combined cert+key PEM).
     * Relative to the directory containing rhost.config.json.
     */
    keyFile?: string;
}

export interface RhostConfig {
    /**
     * Path to a directory of execscript files that will be copied into the
     * container at `/home/rhost/game/scripts`, replacing the built-in scripts.
     * Relative to the directory containing `rhost.config.json` (or the cwd
     * when config is supplied programmatically).
     */
    scriptsDir?: string;

    /**
     * Path to a MUSH server configuration file that will be copied into the
     * container, replacing the default `mush.config` used by RhostMUSH.
     * Relative to the directory containing `rhost.config.json`.
     */
    mushConfig?: string;

    /**
     * Compile-time feature flags.  Only relevant when building the image from
     * source via `RhostContainer.fromSource()` or `rhost-server --build-from-source`.
     * Has no effect when using a pre-built image.
     */
    build?: RhostBuildConfig;

    /**
     * stunnel TLS wrapper configuration.
     * When enabled, a stunnel process is launched inside the container that
     * accepts TLS connections and forwards them to the plain MUSH port.
     * This lets browser clients use wss:// even when the MUSH itself is plain TCP.
     */
    stunnel?: RhostStunnelConfig;
}

/**
 * Load `rhost.config.json` from `searchDir` (default: `process.cwd()`).
 *
 * Returns `null` when no config file is found — this is not an error; the
 * container simply starts with its built-in defaults.
 *
 * @throws SyntaxError  when the file exists but is not valid JSON.
 * @throws Error        when path fields resolve outside the project directory.
 */
export function loadConfig(searchDir: string = process.cwd()): RhostConfig | null {
    const configPath = path.join(searchDir, CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return null;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as RhostConfig;

    const root = path.resolve(searchDir) + path.sep;
    const base = path.dirname(configPath);

    function resolveConfined(field: string, value: string): string {
        const resolved = path.resolve(base, value);
        if (!resolved.startsWith(root) && resolved !== path.resolve(searchDir)) {
            throw new Error(
                `rhost.config.json: "${field}" must be within the project directory.\n` +
                `  Project root : ${path.resolve(searchDir)}\n` +
                `  Resolved path: ${resolved}`
            );
        }
        return resolved;
    }

    if (parsed.scriptsDir) {
        parsed.scriptsDir = resolveConfined('scriptsDir', parsed.scriptsDir);
    }
    if (parsed.mushConfig) {
        parsed.mushConfig = resolveConfined('mushConfig', parsed.mushConfig);
    }
    if (parsed.stunnel?.certFile) {
        parsed.stunnel.certFile = resolveConfined('stunnel.certFile', parsed.stunnel.certFile);
    }
    if (parsed.stunnel?.keyFile) {
        parsed.stunnel.keyFile = resolveConfined('stunnel.keyFile', parsed.stunnel.keyFile);
    }

    return parsed;
}

/** Convert a RhostBuildConfig into Docker build-arg key/value pairs. */
export function buildArgsFromConfig(build: RhostBuildConfig): Record<string, string> {
    const args: Record<string, string> = {};
    if (build.enableWebSockets) args['ENABLE_WEBSOCKETS'] = '1';
    if (build.enableReality)    args['ENABLE_REALITY']    = '1';
    if (build.extraCflags)      args['EXTRA_CFLAGS']      = build.extraCflags;
    return args;
}

/** Convert a RhostStunnelConfig into container environment variables. */
export function stunnelEnvFromConfig(stunnel: RhostStunnelConfig): Record<string, string> {
    const env: Record<string, string> = {};
    if (stunnel.enable) {
        env['STUNNEL_ENABLE'] = 'true';
        if (stunnel.acceptPort)  env['STUNNEL_ACCEPT_PORT']  = String(stunnel.acceptPort);
        if (stunnel.connectPort) env['STUNNEL_CONNECT_PORT'] = String(stunnel.connectPort);
        if (stunnel.certFile)    env['STUNNEL_CERT']         = stunnel.certFile;
        if (stunnel.keyFile)     env['STUNNEL_KEY']          = stunnel.keyFile;
    }
    return env;
}
