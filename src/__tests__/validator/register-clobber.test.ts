/**
 * Tests for the register clobber / re-entrancy analyzer.
 *
 * Detects setq() calls inside loop-body arguments (iter, parse, filter, map,
 * fold, step, munge, filterfun) where concurrent invocations can silently
 * overwrite each other's %q registers.
 *
 * Safe when wrapped in localize() — which creates a new register scope.
 */
import { validate } from '../../validator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasW006(expr: string): boolean {
    return validate(expr).diagnostics.some((d) => d.code === 'W006');
}

function w006Count(expr: string): number {
    return validate(expr).diagnostics.filter((d) => d.code === 'W006').length;
}

// ---------------------------------------------------------------------------
// Should NOT warn (safe patterns)
// ---------------------------------------------------------------------------

describe('register clobber — safe (no W006)', () => {
    it('bare setq outside any loop is safe', () => {
        expect(hasW006('setq(0,5)')).toBe(false);
    });

    it('setq in list argument of iter (not in body) is safe', () => {
        // setq in the list position is fine
        expect(hasW006('iter(setq(0,lnum(1,5)),##)')).toBe(false);
    });

    it('setq wrapped in localize inside iter body is safe', () => {
        expect(hasW006('iter(lnum(1,5),localize(setq(0,##)))')).toBe(false);
    });

    it('no setq anywhere is safe', () => {
        expect(hasW006('iter(lnum(1,5),mul(##,2))')).toBe(false);
    });

    it('nested localize around setq inside iter is safe', () => {
        expect(hasW006('iter(lnum(1,3),[localize(setq(0,##)%q0)])')).toBe(false);
    });

    it('simple expression with no loops is safe', () => {
        expect(hasW006('add(2,3)')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Should warn (W006)
// ---------------------------------------------------------------------------

describe('register clobber — warned (W006 emitted)', () => {
    it('setq in iter body warns', () => {
        expect(hasW006('iter(lnum(1,5),setq(0,add(%q0,##)))')).toBe(true);
    });

    it('setq in parse body warns', () => {
        expect(hasW006('parse(1 2 3,setq(0,##))')).toBe(true);
    });

    it('setq in filter body warns', () => {
        expect(hasW006('filter(myattr,setq(0,##))')).toBe(true);
    });

    it('setq in map body warns', () => {
        expect(hasW006('map(myattr,setq(0,##))')).toBe(true);
    });

    it('setq in fold body warns', () => {
        expect(hasW006('fold(myattr,0,setq(0,add(%q0,##)))')).toBe(true);
    });

    it('setq in step body warns', () => {
        expect(hasW006('step(myattr,setq(0,##))')).toBe(true);
    });

    it('setq in munge body warns', () => {
        expect(hasW006('munge(fn,setq(0,##),list)')).toBe(true);
    });

    it('setq in filterfun body warns', () => {
        expect(hasW006('filterfun(fn,setq(0,##))')).toBe(true);
    });

    it('warns once per setq inside a single iter', () => {
        expect(w006Count('iter(lnum(1,5),setq(0,##))')).toBe(1);
    });

    it('warns for each setq when multiple appear in the body', () => {
        expect(w006Count('iter(lnum(1,5),setq(0,##)setq(1,##))')).toBe(2);
    });

    it('setq nested inside a bracket eval inside iter body warns', () => {
        expect(hasW006('iter(lnum(1,5),[setq(0,##)])')).toBe(true);
    });

    it('setq deeply nested inside non-loop function inside iter body warns', () => {
        expect(hasW006('iter(lnum(1,5),add(setq(0,##),1))')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// W006 diagnostic shape
// ---------------------------------------------------------------------------

describe('register clobber — diagnostic shape', () => {
    it('diagnostic has severity warning', () => {
        const result = validate('iter(lnum(1,5),setq(0,##))');
        const d = result.diagnostics.find((d) => d.code === 'W006');
        expect(d?.severity).toBe('warning');
    });

    it('diagnostic message mentions localize', () => {
        const result = validate('iter(lnum(1,5),setq(0,##))');
        const d = result.diagnostics.find((d) => d.code === 'W006');
        expect(d?.message).toMatch(/localize/i);
    });

    it('W006 does not make the expression invalid (warnings only)', () => {
        const result = validate('iter(lnum(1,5),setq(0,##))');
        expect(result.valid).toBe(true);
    });

    it('offset points into the setq call', () => {
        const expr = 'iter(lnum(1,5),setq(0,##))';
        const result = validate(expr);
        const d = result.diagnostics.find((d) => d.code === 'W006');
        expect(d?.offset).toBeGreaterThan(0);
        // The expr starts setq at position 15
        expect(expr.slice(d!.offset, d!.offset + 4)).toBe('setq');
    });
});
