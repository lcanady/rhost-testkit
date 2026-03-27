/**
 * SECURITY EXPLOIT TEST — H-1: Basic Auth credentials over cleartext HTTP
 *
 * Vulnerability: sdk/examples/09-api.ts and 10-lua.ts send HTTP Basic Auth
 * credentials over plain http:// — no TLS. The Authorization header is
 * base64-encoded, not encrypted: any observer on the network path can
 * decode "#dbref:password" in milliseconds with base64 -d.
 *
 * Fix: the API client helpers must emit a warning when connecting to a
 * non-localhost http:// endpoint, and document that TLS is required in
 * production. Additionally, the examples must guard against accidental
 * production use by checking the target host.
 */

import * as fs   from 'fs';
import * as path from 'path';

const EXAMPLE_09 = path.resolve(__dirname, '../../..', 'examples/09-api.ts');
const EXAMPLE_10 = path.resolve(__dirname, '../../..', 'examples/10-lua.ts');

describe('H-1: Basic Auth must not be sent to non-localhost without a warning', () => {
    let src09: string;
    let src10: string;

    beforeAll(() => {
        src09 = fs.readFileSync(EXAMPLE_09, 'utf8');
        src10 = fs.readFileSync(EXAMPLE_10, 'utf8');
    });

    it('09-api.ts must warn when API_HOST is not localhost/127.0.0.1', () => {
        // RED: no such guard currently exists
        expect(src09).toMatch(/localhost|127\.0\.0\.1.*warn|warn.*localhost|non.?local|cleartext|TLS.*production|production.*TLS/i);
    });

    it('10-lua.ts must warn when API_HOST is not localhost/127.0.0.1', () => {
        // RED: no such guard currently exists
        expect(src10).toMatch(/localhost|127\.0\.0\.1.*warn|warn.*localhost|non.?local|cleartext|TLS.*production|production.*TLS/i);
    });

    it('09-api.ts must document the cleartext limitation in its header comment', () => {
        // RED: no TLS/cleartext warning in the existing doc comment
        expect(src09).toMatch(/cleartext|plain.?text|no TLS|http only|WARNING.*http|Basic Auth.*not encrypt/i);
    });

    it('10-lua.ts must document the cleartext limitation in its header comment', () => {
        expect(src10).toMatch(/cleartext|plain.?text|no TLS|http only|WARNING.*http|Basic Auth.*not encrypt/i);
    });

    it('proof: Authorization header value is trivially base64-decodable', () => {
        // This is a behavioral proof that Basic Auth over HTTP is cleartext-equivalent.
        // A real attacker intercepting the packet gets "Authorization: Basic <b64>"
        // and can decode it with: Buffer.from(b64, 'base64').toString()
        const credential = '#1:Nyctasia';
        const encoded    = Buffer.from(credential).toString('base64');
        const decoded    = Buffer.from(encoded, 'base64').toString('utf8');

        // This always passes — it documents that the encoding is reversible by anyone.
        expect(decoded).toBe(credential);

        // Real protection requires TLS; base64 is NOT encryption.
        expect(encoded).not.toBe(credential); // sanity: it IS encoded
        expect(decoded).toBe(credential);     // but trivially decoded
    });
});
