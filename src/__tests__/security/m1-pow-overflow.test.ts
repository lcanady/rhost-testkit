/**
 * SECURITY EXPLOIT TEST — M-1: math.sh pow operation has no exponent bounds
 *
 * Vulnerability: `pow` in scripts/math.sh does `echo $((A ** B))` with no
 * guard on B. When B > 62 the result silently overflows a 64-bit signed
 * integer (wraps or goes to 0/negative), returning a nonsense value instead
 * of an error. Very large B values can also cause the shell to spin for
 * seconds computing a value that will just overflow anyway.
 *
 * Fix: add a guard `if [ "$B" -gt 62 ]` that echoes `#-1 EXPONENT TOO LARGE`
 * and exits, matching the error convention used by MUSH softcode.
 */

import * as child_process from 'child_process';
import * as fs            from 'fs';
import * as path          from 'path';

const MATH_SH = path.resolve(__dirname, '../../../scripts/math.sh');

function runMath(a: string, b: string, op: string): string {
    const result = child_process.spawnSync('bash', [MATH_SH, `${a} | ${b} | ${op}`], {
        timeout: 5000,
        encoding: 'utf8',
    });
    return (result.stdout ?? '').trim();
}

describe('M-1: math.sh pow must reject exponents > 62', () => {
    it('pow with B=62 should still return a valid integer (boundary OK)', () => {
        const result = runMath('2', '62', 'pow');
        // 2^62 = 4611686018427387904 — fits in a signed 64-bit int
        expect(result).toMatch(/^[0-9]+$/);
        expect(parseInt(result, 10)).toBeGreaterThan(0);
    });

    it('pow with B=63 must return #-1 EXPONENT TOO LARGE (was: silent overflow)', () => {
        // RED before fix: 2^63 overflows signed 64-bit and returns a wrong value
        const result = runMath('2', '63', 'pow');
        expect(result).toBe('#-1 EXPONENT TOO LARGE');
    });

    it('pow with B=100 must return #-1 EXPONENT TOO LARGE', () => {
        const result = runMath('2', '100', 'pow');
        expect(result).toBe('#-1 EXPONENT TOO LARGE');
    });

    it('pow with B=0 still works (2^0 = 1)', () => {
        expect(runMath('2', '0', 'pow')).toBe('1');
    });

    it('pow with B=10 still works (2^10 = 1024)', () => {
        expect(runMath('2', '10', 'pow')).toBe('1024');
    });

    it('negative exponent must return #-1 EXPONENT TOO LARGE (integer-only script)', () => {
        // Negative exponent produces 0 via integer truncation — equally nonsensical
        const result = runMath('2', '-1', 'pow');
        expect(result).toBe('#-1 EXPONENT TOO LARGE');
    });
});
