import type { ValidationResult, Diagnostic } from '../validator/types';
import type { LintResult, LintDiag } from '../validator/mush-lint';

export type { ValidationResult, Diagnostic, LintResult, LintDiag };

export interface OfflineAttr {
  name: string;
  object: string;
  value: string;
  line: number;
}

export interface OfflineDocument {
  source: string;
  filename: string;
  attrs: OfflineAttr[];
  validationResult: ValidationResult;
  lintResult: LintResult;
  /** Shorthand: start an assertion chain directly on this document. */
  readonly expect: OfflineExpectChain;
}

export interface OfflineExpectChain {
  not: OfflineExpectChain;
  noSyntaxErrors(): OfflineExpectChain;
  noLintErrors(): OfflineExpectChain;
  noLintWarnings(): OfflineExpectChain;
  hasFunction(name: string): OfflineExpectChain;
  hasAttribute(name: string): OfflineExpectChain;
  attributeCount(n: number): OfflineExpectChain;
  noUndefinedFunctions(): OfflineExpectChain;
  noClobber(): OfflineExpectChain;
  isPortable(): OfflineExpectChain;
  hasDiagnostic(code: string): OfflineExpectChain;
  maxAttributeLength(chars?: number): OfflineExpectChain;
}

export interface OfflineTestContext {
  parse(source: string, filename?: string): OfflineDocument;
  expect(doc: OfflineDocument): OfflineExpectChain;
  loadFile(filePath: string): OfflineDocument;
  loadGlob(pattern: string, cwd?: string): OfflineDocument[];
}

export interface OfflineSuiteContext {
  it: OfflineItFn & { skip: OfflineItFn; only: OfflineItFn };
  test: OfflineItFn & { skip: OfflineItFn; only: OfflineItFn };
  describe: OfflineDescribeFn & { skip: OfflineDescribeFn; only: OfflineDescribeFn };
  beforeAll(fn: OfflineHookFn): void;
  afterAll(fn: OfflineHookFn): void;
  beforeEach(fn: OfflineHookFn): void;
  afterEach(fn: OfflineHookFn): void;
}

export type OfflineItFn = (name: string, fn: OfflineTestFn) => void;
export type OfflineDescribeFn = (name: string, fn: (ctx: OfflineSuiteContext) => void) => void;
export type OfflineTestFn = (ctx: OfflineTestContext) => void | Promise<void>;
export type OfflineHookFn = () => void | Promise<void>;

export interface OfflineRunOptions {
  verbose?: boolean;
  /** Delegate to Jest's describe/it when Jest globals are detected */
  useJest?: boolean;
}

export interface OfflineRunResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  failures: Array<{ suite: string; test: string; error: Error }>;
}
