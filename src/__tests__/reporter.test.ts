import { Reporter } from '../reporter';
import { RunResult } from '../runner';

// ---------------------------------------------------------------------------
// Helper — capture everything written to process.stdout
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string {
    let out = '';
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out += chunk;
        return true;
    });
    try {
        fn();
    } finally {
        spy.mockRestore();
    }
    return out;
}

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
    return {
        passed: 0, failed: 0, skipped: 0, total: 0, duration: 0, failures: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// verbose: false — every method must be a no-op
// ---------------------------------------------------------------------------

describe('Reporter verbose:false', () => {
    const r = new Reporter(false);

    it('suiteStart writes nothing', () => {
        expect(captureStdout(() => r.suiteStart('Suite', 0))).toBe('');
    });

    it('testPass writes nothing', () => {
        expect(captureStdout(() => r.testPass('test', 10, 0))).toBe('');
    });

    it('testFail writes nothing', () => {
        expect(captureStdout(() => r.testFail('test', 10, 0, new Error('boom')))).toBe('');
    });

    it('testSkip writes nothing', () => {
        expect(captureStdout(() => r.testSkip('test', 0))).toBe('');
    });

    it('summary writes nothing', () => {
        expect(captureStdout(() => r.summary(makeResult({ passed: 1, total: 1 })))).toBe('');
    });
});

// ---------------------------------------------------------------------------
// verbose: true — content assertions
// ---------------------------------------------------------------------------

describe('Reporter verbose:true — suiteStart', () => {
    it('writes the suite name', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.suiteStart('My Suite', 0));
        expect(out).toContain('My Suite');
    });

    it('depth 0 uses no indentation before the name', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.suiteStart('Root', 0));
        // The name should appear (possibly after a newline but no deep indent)
        expect(out).toMatch(/\nRoot\n/);
    });

    it('depth 2 indents more than depth 0', () => {
        const r = new Reporter(true);
        const out0 = captureStdout(() => r.suiteStart('A', 0));
        const out2 = captureStdout(() => r.suiteStart('B', 2));
        const indent0 = out0.match(/\n(\s*)A/)?.[1].length ?? 0;
        const indent2 = out2.match(/\n(\s*)B/)?.[1].length ?? 0;
        expect(indent2).toBeGreaterThan(indent0);
    });
});

describe('Reporter verbose:true — testPass', () => {
    it('writes the test name', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testPass('should add', 7, 0));
        expect(out).toContain('should add');
    });

    it('writes the elapsed time in ms', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testPass('t', 42, 0));
        expect(out).toContain('42ms');
    });

    it('depth 1 indents more than depth 0', () => {
        const r = new Reporter(true);
        const out0 = captureStdout(() => r.testPass('t', 1, 0));
        const out1 = captureStdout(() => r.testPass('t', 1, 1));
        const indent0 = out0.match(/^(\s*)/)?.[1].length ?? 0;
        const indent1 = out1.match(/^(\s*)/)?.[1].length ?? 0;
        expect(indent1).toBeGreaterThan(indent0);
    });
});

describe('Reporter verbose:true — testFail', () => {
    it('writes the test name', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testFail('bad test', 3, 0, new Error('oops')));
        expect(out).toContain('bad test');
    });

    it('writes the error message', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testFail('t', 1, 0, new Error('expected 5 got 3')));
        expect(out).toContain('expected 5 got 3');
    });

    it('writes all lines of a multiline error message', () => {
        const r = new Reporter(true);
        const err = new Error('line one\nline two\nline three');
        const out = captureStdout(() => r.testFail('t', 1, 0, err));
        expect(out).toContain('line one');
        expect(out).toContain('line two');
        expect(out).toContain('line three');
    });

    it('writes the elapsed time', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testFail('t', 99, 0, new Error('x')));
        expect(out).toContain('99ms');
    });
});

describe('Reporter verbose:true — testSkip', () => {
    it('writes the test name', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.testSkip('pending test', 0));
        expect(out).toContain('pending test');
    });
});

describe('Reporter verbose:true — summary', () => {
    it('includes passed count when > 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ passed: 3, total: 3, duration: 10 })));
        expect(out).toContain('3 passed');
    });

    it('includes failed count when > 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ failed: 2, total: 2, duration: 5 })));
        expect(out).toContain('2 failed');
    });

    it('includes skipped count when > 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ skipped: 1, total: 1, duration: 1 })));
        expect(out).toContain('1 skipped');
    });

    it('omits passed when 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ failed: 1, total: 1, duration: 1 })));
        expect(out).not.toMatch(/\b0 passed/);
    });

    it('omits failed when 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ passed: 2, total: 2, duration: 1 })));
        expect(out).not.toMatch(/\b0 failed/);
    });

    it('omits skipped when 0', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ passed: 1, total: 1, duration: 1 })));
        expect(out).not.toMatch(/\b0 skipped/);
    });

    it('always includes total', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ passed: 5, total: 5, duration: 100 })));
        expect(out).toContain('5 total');
    });

    it('includes duration in ms', () => {
        const r = new Reporter(true);
        const out = captureStdout(() => r.summary(makeResult({ passed: 1, total: 1, duration: 42 })));
        expect(out).toContain('42ms');
    });

    it('all counts together', () => {
        const r = new Reporter(true);
        const out = captureStdout(() =>
            r.summary(makeResult({ passed: 3, failed: 1, skipped: 1, total: 5, duration: 77 }))
        );
        expect(out).toContain('3 passed');
        expect(out).toContain('1 failed');
        expect(out).toContain('1 skipped');
        expect(out).toContain('5 total');
        expect(out).toContain('77ms');
    });
});
