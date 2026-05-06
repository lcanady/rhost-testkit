import { buildArgsFromConfig, stunnelEnvFromConfig } from '../config';

// ---------------------------------------------------------------------------
// buildArgsFromConfig()
// ---------------------------------------------------------------------------

describe('buildArgsFromConfig()', () => {
    it('returns empty object for empty config', () => {
        expect(buildArgsFromConfig({})).toEqual({});
    });

    it('sets ENABLE_WEBSOCKETS when enableWebSockets is true', () => {
        expect(buildArgsFromConfig({ enableWebSockets: true })).toEqual({
            ENABLE_WEBSOCKETS: '1',
        });
    });

    it('sets ENABLE_REALITY when enableReality is true', () => {
        expect(buildArgsFromConfig({ enableReality: true })).toEqual({
            ENABLE_REALITY: '1',
        });
    });

    it('sets both keys when both are enabled', () => {
        const result = buildArgsFromConfig({ enableWebSockets: true, enableReality: true });
        expect(result).toEqual({
            ENABLE_WEBSOCKETS: '1',
            ENABLE_REALITY: '1',
        });
    });

    it('sets EXTRA_CFLAGS when extraCflags is provided', () => {
        expect(buildArgsFromConfig({ extraCflags: '-DPUEBLO' })).toEqual({
            EXTRA_CFLAGS: '-DPUEBLO',
        });
    });

    it('returns empty object when all features are false or undefined', () => {
        expect(buildArgsFromConfig({ enableWebSockets: false, enableReality: false })).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// stunnelEnvFromConfig()
// ---------------------------------------------------------------------------

describe('stunnelEnvFromConfig()', () => {
    it('returns empty object when enable is false', () => {
        expect(stunnelEnvFromConfig({ enable: false })).toEqual({});
    });

    it('returns empty object when enable is not set', () => {
        expect(stunnelEnvFromConfig({})).toEqual({});
    });

    it('returns only STUNNEL_ENABLE when enable is true and no other fields are set', () => {
        expect(stunnelEnvFromConfig({ enable: true })).toEqual({
            STUNNEL_ENABLE: 'true',
        });
    });

    it('sets STUNNEL_ACCEPT_PORT when acceptPort is provided', () => {
        const result = stunnelEnvFromConfig({ enable: true, acceptPort: 4203 });
        expect(result).toEqual({
            STUNNEL_ENABLE: 'true',
            STUNNEL_ACCEPT_PORT: '4203',
        });
    });

    it('sets STUNNEL_CONNECT_PORT when connectPort is provided', () => {
        const result = stunnelEnvFromConfig({ enable: true, connectPort: 4201 });
        expect(result).toEqual({
            STUNNEL_ENABLE: 'true',
            STUNNEL_CONNECT_PORT: '4201',
        });
    });

    it('sets STUNNEL_CERT when certFile is provided', () => {
        const result = stunnelEnvFromConfig({ enable: true, certFile: '/tmp/cert.pem' });
        expect(result).toEqual({
            STUNNEL_ENABLE: 'true',
            STUNNEL_CERT: '/tmp/cert.pem',
        });
    });

    it('sets STUNNEL_KEY when keyFile is provided', () => {
        const result = stunnelEnvFromConfig({ enable: true, keyFile: '/tmp/key.pem' });
        expect(result).toEqual({
            STUNNEL_ENABLE: 'true',
            STUNNEL_KEY: '/tmp/key.pem',
        });
    });

    it('sets all env vars when all fields are provided', () => {
        const result = stunnelEnvFromConfig({
            enable: true,
            acceptPort: 4203,
            connectPort: 4201,
            certFile: '/tmp/cert.pem',
            keyFile: '/tmp/key.pem',
        });
        expect(result).toEqual({
            STUNNEL_ENABLE: 'true',
            STUNNEL_ACCEPT_PORT: '4203',
            STUNNEL_CONNECT_PORT: '4201',
            STUNNEL_CERT: '/tmp/cert.pem',
            STUNNEL_KEY: '/tmp/key.pem',
        });
    });
});
