import { validate } from '../validator';
import type { SnapshotContext } from '../expect';

export interface OfflineCounter {
  behavioralSkips: number;
}

/**
 * Offline-reduced version of RhostExpect.
 *
 * Behavioral matchers (toBe, toMatch, etc.) are skipped — they require a live
 * server to evaluate. The expression is syntax-checked on construction; if it
 * contains errors the next matcher call throws immediately.
 *
 * Shape is intentionally identical to RhostExpect so test files need no changes.
 */
export class ReducedExpect {
  private readonly syntaxError: string | null;

  constructor(
    private readonly expression: string,
    private readonly negated = false,
    _snapshotCtx?: SnapshotContext,
    private readonly counter?: OfflineCounter,
  ) {
    const result = validate(expression);
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    this.syntaxError = errors.length > 0
      ? errors.map(d => `[${d.code}] ${d.message}`).join('; ')
      : null;
  }

  get not(): ReducedExpect {
    return new ReducedExpect(this.expression, !this.negated, undefined, this.counter);
  }

  private checkSyntax(): void {
    if (this.syntaxError) {
      throw new Error(
        `offline: syntax error in expression ${JSON.stringify(this.expression)}\n    ${this.syntaxError}`
      );
    }
  }

  private skip(): void {
    this.checkSyntax();
    if (this.counter) this.counter.behavioralSkips++;
  }

  // -------------------------------------------------------------------------
  // Behavioral matchers — skipped in offline mode
  // -------------------------------------------------------------------------

  async toBe(_expected: string): Promise<void> { this.skip(); }
  async toMatch(_pattern: RegExp | string): Promise<void> { this.skip(); }
  async toContain(_substring: string): Promise<void> { this.skip(); }
  async toStartWith(_prefix: string): Promise<void> { this.skip(); }
  async toEndWith(_suffix: string): Promise<void> { this.skip(); }
  async toBeCloseTo(_expected: number, _precision?: number): Promise<void> { this.skip(); }
  async toBeTruthy(): Promise<void> { this.skip(); }
  async toBeFalsy(): Promise<void> { this.skip(); }
  async toBeError(): Promise<void> { this.skip(); }
  async toBeDbref(): Promise<void> { this.skip(); }
  async toBeNumber(): Promise<void> { this.skip(); }
  async toContainWord(_word: string, _sep?: string): Promise<void> { this.skip(); }
  async toHaveWordCount(_n: number, _sep?: string): Promise<void> { this.skip(); }

  async toMatchSnapshot(): Promise<void> {
    if (this.negated) return;
    this.skip();
  }
}
