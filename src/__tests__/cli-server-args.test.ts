// ---------------------------------------------------------------------------
// Unit tests for parseArgs() in src/cli/server.ts
// ---------------------------------------------------------------------------

// Mock testcontainers so no Docker calls happen
jest.mock('testcontainers', () => ({
    GenericContainer: jest.fn(),
    Wait: { forListeningPorts: jest.fn(() => ({ withStartupTimeout: jest.fn() })) },
}));

// Mock fs so no filesystem calls happen (loadConfig returns null by default)
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
}));

import * as path from 'path';
import { parseArgs, ServerOptions } from '../cli/server';

// Silence console output during tests
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('parseArgs()', () => {
    let exitSpy: jest.SpyInstance;

    beforeEach(() => {
        // Prevent actual process.exit; capture calls instead
        exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as never);
    });

    afterEach(() => {
        exitSpy.mockRestore();
    });

    // 1. Defaults
    it('returns defaults when no args are given', () => {
        const opts = parseArgs([]) as ServerOptions;
        expect(opts).not.toBeNull();
        expect(opts.port).toBe(4201);
        expect(opts.image).toBe('lcanady/rhostmush:latest');
        expect(opts.buildFromSource).toBe(false);
        expect(opts.config.build).toBeUndefined();
        expect(opts.config.stunnel).toBeUndefined();
    });

    // 2. --port
    it('--port 7000 sets port to 7000', () => {
        const opts = parseArgs(['--port', '7000']) as ServerOptions;
        expect(opts.port).toBe(7000);
    });

    // 3. --image
    it('--image sets image correctly', () => {
        const opts = parseArgs(['--image', 'my/image:tag']) as ServerOptions;
        expect(opts.image).toBe('my/image:tag');
    });

    // 4. --build-from-source
    it('--build-from-source sets buildFromSource true and image null', () => {
        const opts = parseArgs(['--build-from-source']) as ServerOptions;
        expect(opts.buildFromSource).toBe(true);
        expect(opts.image).toBeNull();
    });

    // 5. --enable-websockets
    it('--enable-websockets sets config.build.enableWebSockets true', () => {
        const opts = parseArgs(['--enable-websockets']) as ServerOptions;
        expect(opts.config.build?.enableWebSockets).toBe(true);
    });

    // 6. --enable-reality
    it('--enable-reality sets config.build.enableReality true', () => {
        const opts = parseArgs(['--enable-reality']) as ServerOptions;
        expect(opts.config.build?.enableReality).toBe(true);
    });

    // 7. --extra-cflags
    it('--extra-cflags sets config.build.extraCflags', () => {
        const opts = parseArgs(['--extra-cflags', '-DFOO']) as ServerOptions;
        expect(opts.config.build?.extraCflags).toBe('-DFOO');
    });

    // 8. --stunnel
    it('--stunnel sets config.stunnel.enable true', () => {
        const opts = parseArgs(['--stunnel']) as ServerOptions;
        expect(opts.config.stunnel?.enable).toBe(true);
    });

    // 9. --stunnel-port
    it('--stunnel-port 9000 sets acceptPort and enables stunnel', () => {
        const opts = parseArgs(['--stunnel-port', '9000']) as ServerOptions;
        expect(opts.config.stunnel?.acceptPort).toBe(9000);
        expect(opts.config.stunnel?.enable).toBe(true);
    });

    // 10. --stunnel-connect-port
    it('--stunnel-connect-port 4201 sets connectPort', () => {
        const opts = parseArgs(['--stunnel-connect-port', '4201']) as ServerOptions;
        expect(opts.config.stunnel?.connectPort).toBe(4201);
    });

    // 11. --stunnel-cert resolves to absolute path
    it('--stunnel-cert resolves to an absolute path', () => {
        const opts = parseArgs(['--stunnel-cert', './cert.pem']) as ServerOptions;
        expect(path.isAbsolute(opts.config.stunnel!.certFile!)).toBe(true);
        expect(opts.config.stunnel!.certFile).toBe(path.resolve('./cert.pem'));
    });

    // 12. --stunnel-key resolves to absolute path
    it('--stunnel-key resolves to an absolute path', () => {
        const opts = parseArgs(['--stunnel-key', './key.pem']) as ServerOptions;
        expect(path.isAbsolute(opts.config.stunnel!.keyFile!)).toBe(true);
        expect(opts.config.stunnel!.keyFile).toBe(path.resolve('./key.pem'));
    });

    // 13. Unknown flag → process.exit(1)
    it('unknown flag calls process.exit(1)', () => {
        expect(() => parseArgs(['--unknown-flag'])).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    // 14. --help → returns null
    it('--help returns null', () => {
        const result = parseArgs(['--help']);
        expect(result).toBeNull();
    });

    // 15. CLI flag overrides config file value
    it('--enable-websockets overrides config file enableWebSockets: false', () => {
        // Simulate loadConfig returning a config with enableWebSockets: false
        const fs = require('fs') as jest.Mocked<typeof import('fs')>;
        fs.existsSync.mockReturnValue(true);
        (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
        fs.readFileSync.mockReturnValue(
            JSON.stringify({ build: { enableWebSockets: false } })
        );

        const opts = parseArgs(['-c', '/fake/rhost.config.json', '--enable-websockets']) as ServerOptions;
        expect(opts.config.build?.enableWebSockets).toBe(true);

        // Reset mocks for subsequent tests
        fs.existsSync.mockReturnValue(false);
        (fs.readFileSync as jest.Mock).mockReturnValue(undefined);
    });
});
