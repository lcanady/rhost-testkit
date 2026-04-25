import { RhostWorld } from '../world';
import { validate } from '../validator';
import { lintContent } from '../validator/mush-lint';
import type { MockRhostClient } from './mock-client';

let _nextDbref = 1;

/**
 * World proxy for offline mode.
 *
 * - create/dig/destroy/etc. are no-ops that return synthetic dbrefs.
 * - set() validates the softcode value immediately and throws if syntax errors
 *   or lint errors are found — surfacing the problem at the exact callsite.
 * - All other queries return empty/stub values.
 */
export class OfflineWorldProxy extends RhostWorld {
  constructor(client: MockRhostClient) {
    super(client as never);
  }

  override async create(_name: string): Promise<string> {
    return `#${_nextDbref++}`;
  }

  override async dig(_name: string): Promise<string> {
    return `#${_nextDbref++}`;
  }

  override async zone(_name: string): Promise<string> {
    return `#${_nextDbref++}`;
  }

  override async destroy(_dbref: string): Promise<void> {}

  override async set(dbref: string, attr: string, value: string): Promise<void> {
    // Validate expression syntax
    const vr = validate(value);
    const syntaxErrors = vr.diagnostics.filter(d => d.severity === 'error');
    if (syntaxErrors.length > 0) {
      const msgs = syntaxErrors.map(d => `[${d.code}] ${d.message}`).join('\n    ');
      throw new Error(
        `offline: syntax error in ${dbref}/${attr}\n    ${msgs}`
      );
    }

    // Run lint on the attribute as a mini-document
    const fakeSource = `&${attr} ${dbref}=${value}`;
    const lr = lintContent(fakeSource, `${dbref}/${attr}`);
    const lintErrors = lr.diagnostics.filter(d => d.severity === 'ERROR');
    if (lintErrors.length > 0) {
      const msgs = lintErrors.map(d => `[${d.code}] ${d.message}`).join('\n    ');
      throw new Error(
        `offline: lint error in ${dbref}/${attr}\n    ${msgs}`
      );
    }
  }

  override async get(_dbref: string, _attr: string): Promise<string> {
    return '';
  }

  override async lock(_dbref: string, _lockstring: string): Promise<void> {}
  override async flag(_dbref: string, _flag: string): Promise<void> {}
  override async pemit(_target: string, _msg: string): Promise<void> {}
  override async remit(_room: string, _msg: string): Promise<void> {}
  override async force(_actor: string, _cmd: string): Promise<void> {}
  override async parent(_child: string, _parentDbref: string): Promise<void> {}
  override async addToChannel(_dbref: string, _chan: string): Promise<void> {}
  override async grantQuota(_dbref: string, _n: number): Promise<void> {}
  override async trigger(_dbref: string, _attr: string, _args?: string): Promise<string[]> {
    return [];
  }
  override async cleanup(): Promise<void> {}
}
