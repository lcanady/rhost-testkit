import { compatibilityReport } from './document';
import type { OfflineDocument, OfflineExpectChain } from './types';

export class OfflineExpectError extends Error {
  constructor(
    public readonly matcherName: string,
    public readonly actual: unknown,
    public readonly expectedDesc: string,
    public readonly negated: boolean,
  ) {
    const not = negated ? '.not' : '';
    super(
      `offline.expect\n` +
      `  ● ${not}.${matcherName} failed\n` +
      `    Expected: ${expectedDesc}\n` +
      `    Received: ${JSON.stringify(actual)}`
    );
    this.name = 'OfflineExpectError';
  }
}

export class OfflineExpect implements OfflineExpectChain {
  constructor(
    private readonly doc: OfflineDocument,
    private readonly negated = false,
  ) {}

  get not(): OfflineExpectChain {
    return new OfflineExpect(this.doc, !this.negated);
  }

  private pass(condition: boolean, matcherName: string, actual: unknown, expectedDesc: string): this {
    const success = this.negated ? !condition : condition;
    if (!success) {
      throw new OfflineExpectError(matcherName, actual, this.negated ? `NOT ${expectedDesc}` : expectedDesc, this.negated);
    }
    return this;
  }

  noSyntaxErrors(): OfflineExpectChain {
    const errors = this.doc.validationResult.diagnostics.filter(d => d.severity === 'error');
    return this.pass(
      errors.length === 0,
      'noSyntaxErrors',
      errors.map(d => `[${d.code}] ${d.message}`),
      'no syntax errors',
    );
  }

  noLintErrors(): OfflineExpectChain {
    return this.pass(
      this.doc.lintResult.errors === 0,
      'noLintErrors',
      this.doc.lintResult.diagnostics.filter(d => d.severity === 'ERROR').map(d => `[${d.code}] ${d.message}`),
      'no lint errors',
    );
  }

  noLintWarnings(): OfflineExpectChain {
    return this.pass(
      this.doc.lintResult.warnings === 0,
      'noLintWarnings',
      this.doc.lintResult.diagnostics.filter(d => d.severity === 'WARN').map(d => `[${d.code}] ${d.message}`),
      'no lint warnings',
    );
  }

  hasFunction(name: string): OfflineExpectChain {
    const needle = name.toLowerCase();
    // Quick text scan: name followed by ( is sufficient for this check
    const found = this.doc.attrs.some(a => new RegExp(`\\b${needle}\\s*\\(`, 'i').test(a.value));
    return this.pass(found, 'hasFunction', `searched ${this.doc.attrs.length} attr(s)`, `function '${name}' present`);
  }

  hasAttribute(name: string): OfflineExpectChain {
    const upper = name.toUpperCase();
    const found = this.doc.attrs.some(a => a.name === upper);
    return this.pass(found, 'hasAttribute', this.doc.attrs.map(a => a.name), `attribute '${upper}' present`);
  }

  attributeCount(n: number): OfflineExpectChain {
    return this.pass(
      this.doc.attrs.length === n,
      'attributeCount',
      this.doc.attrs.length,
      `exactly ${n} attribute(s)`,
    );
  }

  noUndefinedFunctions(): OfflineExpectChain {
    const unknowns = this.doc.validationResult.diagnostics.filter(d => d.code === 'W005');
    return this.pass(
      unknowns.length === 0,
      'noUndefinedFunctions',
      unknowns.map(d => d.message),
      'no unknown functions',
    );
  }

  noClobber(): OfflineExpectChain {
    const clobbers = this.doc.validationResult.diagnostics.filter(d => d.code === 'W006');
    return this.pass(
      clobbers.length === 0,
      'noClobber',
      clobbers.map(d => d.message),
      'no register clobber warnings',
    );
  }

  isPortable(): OfflineExpectChain {
    // Check each attr body for portability
    const restricted: string[] = [];
    for (const attr of this.doc.attrs) {
      const report = compatibilityReport(attr.value);
      if (!report.portable) {
        restricted.push(...report.restricted.map(r => `${attr.name}: ${r.name} (${r.platforms.join(',')})`));
      }
    }
    return this.pass(restricted.length === 0, 'isPortable', restricted, 'all functions portable across MUSH platforms');
  }

  hasDiagnostic(code: string): OfflineExpectChain {
    const upper = code.toUpperCase();
    const inValidation = this.doc.validationResult.diagnostics.some(d => d.code.toUpperCase() === upper);
    const inLint = this.doc.lintResult.diagnostics.some(d => d.code.toUpperCase() === upper);
    return this.pass(inValidation || inLint, 'hasDiagnostic', `searched all diagnostics`, `diagnostic '${code}' present`);
  }

  maxAttributeLength(chars = 7500): OfflineExpectChain {
    const over = this.doc.attrs.filter(a => a.value.length > chars);
    return this.pass(
      over.length === 0,
      'maxAttributeLength',
      over.map(a => `${a.name}: ${a.value.length} chars`),
      `all attrs <= ${chars} chars`,
    );
  }
}
