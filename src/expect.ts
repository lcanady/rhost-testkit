import { RhostClient } from './client';

export { isRhostError } from './assertions';
import { isRhostError } from './assertions';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class RhostExpectError extends Error {
    constructor(
        public readonly expression: string,
        public readonly matcherName: string,
        public readonly actual: string,
        public readonly expectedDesc: string,
        public readonly negated: boolean,
    ) {
        const not = negated ? '.not' : '';
        super(
            `expect(${JSON.stringify(expression)})\n` +
            `  \u25cf ${not}.${matcherName} failed\n` +
            `    Expected: ${expectedDesc}\n` +
            `    Received: ${JSON.stringify(actual)}`
        );
        this.name = 'RhostExpectError';
    }
}

// ---------------------------------------------------------------------------
// RhostExpect
// ---------------------------------------------------------------------------

/**
 * Jest-style expect wrapper for RhostMUSH softcode evaluation.
 *
 * @example
 *   const ex = new RhostExpect(client, 'add(2,3)');
 *   await ex.toBe('5');
 *   await ex.not.toBe('42');
 */
export class RhostExpect {
    private _cached: string | undefined = undefined;

    constructor(
        private readonly client: RhostClient,
        private readonly expression: string,
        private readonly negated = false,
    ) {}

    /** Negation accessor — returns a new RhostExpect with negation flipped. */
    get not(): RhostExpect {
        return new RhostExpect(this.client, this.expression, !this.negated);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    private async resolve(): Promise<string> {
        if (this._cached === undefined) {
            this._cached = (await this.client.eval(this.expression)).replace(/[\r\n]+$/, '');
        }
        return this._cached;
    }

    private pass(condition: boolean, matcherName: string, actual: string, expectedDesc: string): void {
        const success = this.negated ? !condition : condition;
        if (!success) {
            const desc = this.negated ? `NOT ${expectedDesc}` : expectedDesc;
            throw new RhostExpectError(this.expression, matcherName, actual, desc, this.negated);
        }
    }

    // -------------------------------------------------------------------------
    // Matchers
    // -------------------------------------------------------------------------

    /** Exact match (after trim). */
    async toBe(expected: string): Promise<void> {
        const actual = (await this.resolve()).trim();
        this.pass(actual === expected, 'toBe', actual, JSON.stringify(expected));
    }

    /** Regex or substring match. */
    async toMatch(pattern: RegExp | string): Promise<void> {
        const actual = await this.resolve();
        const matched = typeof pattern === 'string'
            ? actual.includes(pattern)
            : pattern.test(actual);
        const desc = pattern instanceof RegExp ? pattern.toString() : JSON.stringify(pattern);
        this.pass(matched, 'toMatch', actual, desc);
    }

    /** String contains substring. */
    async toContain(substring: string): Promise<void> {
        const actual = await this.resolve();
        this.pass(actual.includes(substring), 'toContain', actual, `string containing ${JSON.stringify(substring)}`);
    }

    /** String starts with prefix. */
    async toStartWith(prefix: string): Promise<void> {
        const actual = await this.resolve();
        this.pass(actual.startsWith(prefix), 'toStartWith', actual, `string starting with ${JSON.stringify(prefix)}`);
    }

    /** String ends with suffix. */
    async toEndWith(suffix: string): Promise<void> {
        const actual = await this.resolve();
        this.pass(actual.endsWith(suffix), 'toEndWith', actual, `string ending with ${JSON.stringify(suffix)}`);
    }

    /**
     * Numeric proximity: |actual - expected| < 10^(-precision).
     * Default precision = 3 (within 0.001).
     */
    async toBeCloseTo(expected: number, precision = 3): Promise<void> {
        const actual = await this.resolve();
        const num = Number(actual);
        const diff = Math.abs(num - expected);
        const threshold = Math.pow(10, -precision);
        this.pass(
            Number.isFinite(num) && diff < threshold,
            'toBeCloseTo',
            actual,
            `a number close to ${expected} (precision ${precision})`,
        );
    }

    /**
     * Truthy in MUSH terms: non-empty, not "0", not starting with #-1/#-2/#-3.
     */
    async toBeTruthy(): Promise<void> {
        const actual = await this.resolve();
        const truthy = actual !== '' && actual !== '0' && !isRhostError(actual);
        this.pass(truthy, 'toBeTruthy', actual, '<truthy: non-empty, non-"0", non-error>');
    }

    /**
     * Falsy in MUSH terms: empty OR "0" OR starts with #-1.
     */
    async toBeFalsy(): Promise<void> {
        const actual = await this.resolve();
        const falsy = actual === '' || actual === '0' || isRhostError(actual);
        this.pass(falsy, 'toBeFalsy', actual, '<falsy: empty, "0", or error dbref>');
    }

    /**
     * Result is a RhostMUSH error (#-1, #-2, #-3).
     */
    async toBeError(): Promise<void> {
        const actual = await this.resolve();
        this.pass(isRhostError(actual), 'toBeError', actual, '<error: starts with #-1, #-2, or #-3>');
    }

    /**
     * Result is a valid object dbref: matches /^#\d+$/ (positive dbref).
     */
    async toBeDbref(): Promise<void> {
        const actual = await this.resolve();
        this.pass(/^#\d+$/.test(actual), 'toBeDbref', actual, '<dbref: /^#\\d+$/>');
    }

    /**
     * Result parses as a finite JavaScript number.
     * Empty string is not considered a number.
     */
    async toBeNumber(): Promise<void> {
        const actual = await this.resolve();
        const isNum = actual !== '' && Number.isFinite(Number(actual));
        this.pass(isNum, 'toBeNumber', actual, '<finite number>');
    }

    /**
     * Word is present in the space-delimited (or custom sep) list.
     */
    async toContainWord(word: string, sep = ' '): Promise<void> {
        const actual = await this.resolve();
        const words = actual.split(sep).map((w) => w.trim()).filter(Boolean);
        this.pass(words.includes(word), 'toContainWord', actual, `list containing word ${JSON.stringify(word)}`);
    }

    /**
     * List has exactly n words (space-delimited by default).
     */
    async toHaveWordCount(n: number, sep = ' '): Promise<void> {
        const actual = await this.resolve();
        const words = actual === '' ? [] : actual.split(sep).map((w) => w.trim()).filter(Boolean);
        this.pass(words.length === n, 'toHaveWordCount', actual, `list with ${n} word(s) (got ${words.length})`);
    }
}
