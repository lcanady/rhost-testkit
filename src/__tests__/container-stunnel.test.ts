/**
 * Unit tests for stunnel certificate/key file handling in RhostContainer.start()
 *
 * Mocks: testcontainers (GenericContainer, Wait) and fs — no real Docker or filesystem.
 */

import * as fs from 'fs';
import { RhostContainer } from '../container';

// ── Constants mirrored from container.ts ─────────────────────────────────────
const CONTAINER_STUNNEL_CERT_PATH = '/home/rhost/stunnel-cert.pem';
const CONTAINER_STUNNEL_KEY_PATH  = '/home/rhost/stunnel-key.pem';

// ── Mock fs ───────────────────────────────────────────────────────────────────
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
}));

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

// ── Chainable GenericContainer mock ──────────────────────────────────────────

/** Accumulates all calls so tests can assert on them. */
interface MockBuilderState {
    envVars: Record<string, string>;
    copiedFiles: Array<{ source: string; target: string }>;
    exposedPorts: number[];
}

function makeMockBuilder(state: MockBuilderState) {
    const builder: any = {
        withEnvironment: jest.fn((env: Record<string, string>) => {
            Object.assign(state.envVars, env);
            return builder;
        }),
        withCopyFilesToContainer: jest.fn((files: Array<{ source: string; target: string }>) => {
            state.copiedFiles.push(...files);
            return builder;
        }),
        withCopyDirectoriesToContainer: jest.fn(() => builder),
        withExposedPorts: jest.fn((...ports: number[]) => {
            state.exposedPorts.push(...ports);
            return builder;
        }),
        withWaitStrategy: jest.fn(() => builder),
        start: jest.fn().mockResolvedValue({
            getHost: () => 'localhost',
            getMappedPort: (p: number) => p + 10000,
            stop: jest.fn().mockResolvedValue(undefined),
        }),
    };
    return builder;
}

jest.mock('testcontainers', () => {
    return {
        GenericContainer: jest.fn().mockImplementation(() => {
            // Will be replaced per-test via the mockBuilderFor helper
            return {};
        }),
        Wait: {
            forListeningPorts: jest.fn().mockReturnValue({
                withStartupTimeout: jest.fn().mockReturnThis(),
            }),
        },
    };
});

import { GenericContainer, Wait } from 'testcontainers';
const MockGenericContainer = GenericContainer as jest.MockedClass<typeof GenericContainer>;

// ── Helper: creates a fresh state + wires up GenericContainer mock ────────────
function setupMock(): MockBuilderState {
    const state: MockBuilderState = { envVars: {}, copiedFiles: [], exposedPorts: [] };
    MockGenericContainer.mockImplementation(() => makeMockBuilder(state) as any);
    return state;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RhostContainer stunnel start()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: every existsSync call returns false unless overridden
        mockExistsSync.mockReturnValue(false);
    });

    // 1. stunnel disabled ──────────────────────────────────────────────────────
    it('stunnel disabled: no STUNNEL_ENABLE env var, only port 4201 exposed', async () => {
        const state = setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {});
        await container.start();

        expect(state.envVars).not.toHaveProperty('STUNNEL_ENABLE');
        expect(state.exposedPorts).toEqual([4201]);
    });

    // 2. stunnel.enable: true, no certFile ────────────────────────────────────
    it('stunnel enabled, no certFile: STUNNEL_ENABLE=true set, no STUNNEL_CERT', async () => {
        const state = setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true },
        });
        await container.start();

        expect(state.envVars['STUNNEL_ENABLE']).toBe('true');
        expect(state.envVars).not.toHaveProperty('STUNNEL_CERT');
        expect(state.copiedFiles).toHaveLength(0);
    });

    // 3. stunnel enabled, certFile exists ─────────────────────────────────────
    it('stunnel enabled, certFile exists: file copied, STUNNEL_CERT set to container path', async () => {
        const state = setupMock();
        mockExistsSync.mockImplementation((p) => p === '/host/cert.pem');

        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, certFile: '/host/cert.pem' },
        });
        await container.start();

        expect(state.copiedFiles).toContainEqual({
            source: '/host/cert.pem',
            target: CONTAINER_STUNNEL_CERT_PATH,
        });
        expect(state.envVars['STUNNEL_CERT']).toBe(CONTAINER_STUNNEL_CERT_PATH);
        // STUNNEL_CERT must NOT be the host path
        expect(state.envVars['STUNNEL_CERT']).not.toBe('/host/cert.pem');
    });

    // 4. stunnel enabled, certFile does NOT exist → throws ────────────────────
    it('stunnel enabled, certFile missing: throws Error', async () => {
        setupMock();
        mockExistsSync.mockReturnValue(false);

        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, certFile: '/host/missing-cert.pem' },
        });

        await expect(container.start()).rejects.toThrow(/stunnel\.certFile not found/);
    });

    // 5. stunnel enabled, certFile + separate keyFile, both exist ─────────────
    it('stunnel enabled, certFile + separate keyFile: both copied, both env vars set', async () => {
        const state = setupMock();
        mockExistsSync.mockImplementation((p) =>
            p === '/host/cert.pem' || p === '/host/key.pem'
        );

        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, certFile: '/host/cert.pem', keyFile: '/host/key.pem' },
        });
        await container.start();

        expect(state.copiedFiles).toContainEqual({ source: '/host/cert.pem', target: CONTAINER_STUNNEL_CERT_PATH });
        expect(state.copiedFiles).toContainEqual({ source: '/host/key.pem',  target: CONTAINER_STUNNEL_KEY_PATH  });
        expect(state.envVars['STUNNEL_CERT']).toBe(CONTAINER_STUNNEL_CERT_PATH);
        expect(state.envVars['STUNNEL_KEY']).toBe(CONTAINER_STUNNEL_KEY_PATH);
    });

    // 6. keyFile === certFile (combined PEM) → only one copy, no STUNNEL_KEY ──
    it('stunnel enabled, keyFile === certFile: single file copied, STUNNEL_KEY not set', async () => {
        const state = setupMock();
        mockExistsSync.mockImplementation((p) => p === '/host/combined.pem');

        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, certFile: '/host/combined.pem', keyFile: '/host/combined.pem' },
        });
        await container.start();

        const certCopies = state.copiedFiles.filter((f) => f.source === '/host/combined.pem');
        expect(certCopies).toHaveLength(1);
        expect(state.envVars['STUNNEL_CERT']).toBe(CONTAINER_STUNNEL_CERT_PATH);
        expect(state.envVars).not.toHaveProperty('STUNNEL_KEY');
    });

    // 7. keyFile provided but does NOT exist → throws ─────────────────────────
    it('stunnel enabled, keyFile missing: throws Error', async () => {
        setupMock();
        mockExistsSync.mockImplementation((p) => p === '/host/cert.pem'); // cert exists, key does not

        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, certFile: '/host/cert.pem', keyFile: '/host/missing-key.pem' },
        });

        await expect(container.start()).rejects.toThrow(/stunnel\.keyFile not found/);
    });

    // 8. stunnel port exposure ─────────────────────────────────────────────────
    it('stunnel enabled: stunnelAcceptPort (default 4203) added to exposed ports', async () => {
        const state = setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true },
        });
        await container.start();

        expect(state.exposedPorts).toContain(4201);
        expect(state.exposedPorts).toContain(4203);
    });

    it('stunnel enabled with custom acceptPort: custom port exposed', async () => {
        const state = setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, acceptPort: 9443 },
        });
        await container.start();

        expect(state.exposedPorts).toContain(4201);
        expect(state.exposedPorts).toContain(9443);
        expect(state.exposedPorts).not.toContain(4203);
    });

    // 9. getConnectionInfo() stunnelPort populated when stunnel enabled ────────
    it('getConnectionInfo(): stunnelPort is set when stunnel is enabled', async () => {
        setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {
            stunnel: { enable: true, acceptPort: 4203 },
        });
        const info = await container.start();

        expect(info).toHaveProperty('stunnelPort');
        // getMappedPort mock returns port + 10000
        expect(info.stunnelPort).toBe(14203);
        expect(info.port).toBe(14201);
    });

    it('getConnectionInfo(): stunnelPort is undefined when stunnel is disabled', async () => {
        setupMock();
        const container = RhostContainer.fromImage('rhostmush:latest', {});
        const info = await container.start();

        expect(info.stunnelPort).toBeUndefined();
    });
});
