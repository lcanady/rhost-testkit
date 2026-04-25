import { RhostClient } from '../client';

/**
 * Stub client used in offline mode.
 * connect/login/disconnect are no-ops; eval/command return empty results.
 * All expressions passed to eval() are recorded for inspection.
 */
export class MockRhostClient extends RhostClient {
  readonly capturedEvals: string[] = [];

  constructor() {
    // Dummy options — no real connection is ever made
    super({ host: 'localhost', port: 0 } as never);
  }

  override async connect(): Promise<void> {}

  override async login(_username: string, _password: string): Promise<void> {}

  override async disconnect(): Promise<void> {}

  override async eval(expression: string): Promise<string> {
    this.capturedEvals.push(expression);
    return '';
  }

  override async evalAll(expressions: string[]): Promise<string[]> {
    this.capturedEvals.push(...expressions);
    return expressions.map(() => '');
  }

  override async command(_cmd: string): Promise<string[]> {
    return [];
  }

  override async preview(_input: string): Promise<string> {
    return '';
  }

  override sendNoWait(_cmd: string): void {}
}
