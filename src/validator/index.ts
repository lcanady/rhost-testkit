// ---------------------------------------------------------------------------
// Public API for the RhostMUSH softcode offline validator
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { semanticCheck } from './checker';
import { Diagnostic, ValidationResult } from './types';

export { ValidationResult, Diagnostic, Severity } from './types';
export { FunctionSignature, BUILTIN_FUNCTIONS } from './builtins';

/**
 * Validate a RhostMUSH softcode expression without a server connection.
 *
 * The validator runs three stages:
 *  1. **Tokenizer** — converts the expression to a flat token stream
 *  2. **Parser** — builds an AST; detects structural errors (unbalanced parens/brackets)
 *  3. **Semantic checker** — validates function names and argument counts
 *
 * `valid` is `true` unless at least one diagnostic has `severity: 'error'`.
 * Warnings do not affect validity.
 *
 * @example
 *   import { validate } from '@rhost/testkit/validator';
 *
 *   const result = validate('add(2,3)');
 *   // { valid: true, diagnostics: [] }
 *
 *   const bad = validate('add(2,3');
 *   // { valid: false, diagnostics: [{ code: 'E001', severity: 'error', ... }] }
 *
 * @example Catch wrong arg count
 *   validate('abs(1,2)');
 *   // { valid: false, diagnostics: [{ code: 'E007', ... }] }
 *
 * @example Unknown function (warning, still valid)
 *   validate('myfunc(arg)');
 *   // { valid: true, diagnostics: [{ code: 'W005', severity: 'warning', ... }] }
 */
export function validate(expr: string): ValidationResult {
  // Empty expression: valid but warn
  if (expr.trim() === '') {
    const diagnostics: Diagnostic[] = [
      {
        severity: 'warning',
        code: 'W001',
        message: 'Expression is empty',
        offset: 0,
        length: 0,
      },
    ];
    return { valid: true, diagnostics };
  }

  const tokens = tokenize(expr);
  const { nodes, diagnostics: structural } = parse(tokens);
  const semantic = semanticCheck(nodes);

  const all = [...structural, ...semantic];
  const valid = !all.some((d) => d.severity === 'error');

  return { valid, diagnostics: all };
}

/**
 * Validate the softcode expression contained in a file.
 *
 * The entire file content is treated as a single expression.
 * For files with multiple expressions (e.g. one per line) consider
 * reading and validating each line individually.
 *
 * @throws If the file cannot be read.
 */
export function validateFile(filePath: string): ValidationResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return validate(content);
}
