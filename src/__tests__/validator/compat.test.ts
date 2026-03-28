/**
 * Tests for the dialect compatibility report.
 *
 * compatibilityReport(expr) walks the expression AST and reports which
 * functions are universal vs. platform-restricted (Rhost-only, Penn+Rhost, etc.)
 */
import { compatibilityReport, CompatibilityReport } from '../../validator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasRestricted(report: CompatibilityReport, name: string): boolean {
    return report.restricted.some((e) => e.name.toLowerCase() === name.toLowerCase());
}

function platformsFor(report: CompatibilityReport, name: string): string[] | 'all' | undefined {
    return report.restricted.find((e) => e.name.toLowerCase() === name.toLowerCase())?.platforms;
}

// ---------------------------------------------------------------------------
// Universal functions
// ---------------------------------------------------------------------------

describe('compatibilityReport — universal functions', () => {
    it('add() is portable across all platforms', () => {
        const r = compatibilityReport('add(2,3)');
        expect(r.portable).toBe(true);
        expect(hasRestricted(r, 'add')).toBe(false);
    });

    it('iter() is portable', () => {
        const r = compatibilityReport('iter(lnum(1,5),##)');
        expect(r.portable).toBe(true);
    });

    it('ucstr() is portable', () => {
        const r = compatibilityReport('ucstr(hello)');
        expect(r.portable).toBe(true);
    });

    it('universal-only expression has empty restricted list', () => {
        const r = compatibilityReport('mul(add(2,3),sub(10,4))');
        expect(r.restricted).toHaveLength(0);
        expect(r.portable).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Rhost-only functions
// ---------------------------------------------------------------------------

describe('compatibilityReport — Rhost-only functions', () => {
    it('encode64() is Rhost-only', () => {
        const r = compatibilityReport('encode64(hello)');
        expect(hasRestricted(r, 'encode64')).toBe(true);
        expect(platformsFor(r, 'encode64')).toContain('rhost');
    });

    it('decode64() is Rhost-only', () => {
        const r = compatibilityReport('decode64(aGVsbG8=)');
        expect(hasRestricted(r, 'decode64')).toBe(true);
    });

    it('digest() is Rhost-only', () => {
        const r = compatibilityReport('digest(sha1,hello)');
        expect(hasRestricted(r, 'digest')).toBe(true);
    });

    it('execscript() is Rhost-only', () => {
        const r = compatibilityReport('execscript(myscript)');
        expect(hasRestricted(r, 'execscript')).toBe(true);
    });

    it('strdistance() is Rhost-only', () => {
        const r = compatibilityReport('strdistance(hello,helo)');
        expect(hasRestricted(r, 'strdistance')).toBe(true);
    });

    it('Rhost-only expression is not portable', () => {
        const r = compatibilityReport('encode64(hello)');
        expect(r.portable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Penn + Rhost (not TinyMUX)
// ---------------------------------------------------------------------------

describe('compatibilityReport — Penn+Rhost functions', () => {
    it('localize() is supported on Penn and Rhost but not TinyMUX', () => {
        const r = compatibilityReport('localize(setq(0,5))');
        expect(hasRestricted(r, 'localize')).toBe(true);
        const platforms = platformsFor(r, 'localize') as string[];
        expect(platforms).toContain('rhost');
        expect(platforms).toContain('penn');
        expect(platforms).not.toContain('mux');
    });

    it('soundex() is supported on Penn and Rhost', () => {
        const r = compatibilityReport('soundex(Robert)');
        expect(hasRestricted(r, 'soundex')).toBe(true);
        const platforms = platformsFor(r, 'soundex') as string[];
        expect(platforms).toContain('rhost');
        expect(platforms).toContain('penn');
    });
});

// ---------------------------------------------------------------------------
// Mixed expressions
// ---------------------------------------------------------------------------

describe('compatibilityReport — mixed expressions', () => {
    it('mixed portable + Rhost-only is not portable', () => {
        const r = compatibilityReport('add(encode64(hello),2)');
        expect(r.portable).toBe(false);
        expect(hasRestricted(r, 'encode64')).toBe(true);
        expect(hasRestricted(r, 'add')).toBe(false);
    });

    it('lists each restricted function once even if called multiple times', () => {
        const r = compatibilityReport('cat(encode64(a),encode64(b))');
        const enc64Entries = r.restricted.filter((e) => e.name.toLowerCase() === 'encode64');
        expect(enc64Entries).toHaveLength(1);
    });

    it('empty expression returns portable: true with empty restricted', () => {
        const r = compatibilityReport('');
        expect(r.portable).toBe(true);
        expect(r.restricted).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

describe('compatibilityReport — report shape', () => {
    it('returns an object with restricted array and portable boolean', () => {
        const r = compatibilityReport('add(2,3)');
        expect(Array.isArray(r.restricted)).toBe(true);
        expect(typeof r.portable).toBe('boolean');
    });

    it('each restricted entry has name and platforms fields', () => {
        const r = compatibilityReport('encode64(hello)');
        const entry = r.restricted[0];
        expect(typeof entry.name).toBe('string');
        expect(Array.isArray(entry.platforms)).toBe(true);
    });
});
