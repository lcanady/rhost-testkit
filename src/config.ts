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
 */
import * as fs from 'fs';
import * as path from 'path';

export const CONFIG_FILENAME = 'rhost.config.json';

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
}

/**
 * Load `rhost.config.json` from `searchDir` (default: `process.cwd()`).
 *
 * Returns `null` when no config file is found — this is not an error; the
 * container simply starts with its built-in defaults.
 *
 * @throws SyntaxError  when the file exists but is not valid JSON.
 * @throws Error        when `scriptsDir` or `mushConfig` resolve to a path
 *                      outside the project directory (path traversal guard).
 */
export function loadConfig(searchDir: string = process.cwd()): RhostConfig | null {
    const configPath = path.join(searchDir, CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
        return null;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as RhostConfig;

    // Resolve relative paths to absolute, anchored at the config file location,
    // then assert they remain within the project root (searchDir).
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
    return parsed;
}
