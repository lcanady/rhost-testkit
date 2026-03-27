// ---------------------------------------------------------------------------
// Semantic checker: validates the AST against the built-in function database
// ---------------------------------------------------------------------------

import { ASTNode, Diagnostic, FunctionCallNode } from './types';
import { BUILTIN_FUNCTIONS } from './builtins';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Walk the AST and emit semantic diagnostics.
 *
 * Checks performed per `FunctionCallNode`:
 *   E005 — Unknown function (warning, not error — may be a UDF)
 *   E006 — Too few arguments
 *   E007 — Too many arguments
 *   W002 — Empty argument
 *   W003 — Deprecated function
 */
export function semanticCheck(nodes: ASTNode[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  walkNodes(nodes, diagnostics);
  return diagnostics;
}

// ---------------------------------------------------------------------------
// AST walkers
// ---------------------------------------------------------------------------

function walkNodes(nodes: ASTNode[], diagnostics: Diagnostic[]): void {
  for (const node of nodes) {
    walkNode(node, diagnostics);
  }
}

function walkNode(node: ASTNode, diagnostics: Diagnostic[]): void {
  switch (node.type) {
    case 'FunctionCall':
      checkFunctionCall(node, diagnostics);
      break;
    case 'BracketEval':
      walkNodes(node.nodes, diagnostics);
      break;
    case 'RawText':
    case 'Substitution':
      // Nothing to validate at the leaf level
      break;
  }
}

function checkFunctionCall(node: FunctionCallNode, diagnostics: Diagnostic[]): void {
  const key = node.name.toLowerCase();
  const sig = BUILTIN_FUNCTIONS.get(key);

  if (!sig) {
    // Unknown function — warn rather than error because MUSHcoders heavily
    // use user-defined @functions and inline u() attribute patterns.
    diagnostics.push({
      severity: 'warning',
      code: 'W005',
      message: `Unknown function '${node.name}' — not in built-in database (may be a UDF or @function)`,
      offset: node.nameOffset,
      length: node.name.length,
    });
  } else {
    const argCount = node.args.length;

    if (argCount < sig.minArgs) {
      diagnostics.push({
        severity: 'error',
        code: 'E006',
        message: argCount === 0
          ? `'${node.name}' requires at least ${sig.minArgs} argument${sig.minArgs !== 1 ? 's' : ''}, but got none`
          : `'${node.name}' requires at least ${sig.minArgs} argument${sig.minArgs !== 1 ? 's' : ''}, but got ${argCount}`,
        offset: node.nameOffset,
        length: node.name.length,
      });
    } else if (isFinite(sig.maxArgs) && argCount > sig.maxArgs) {
      diagnostics.push({
        severity: 'error',
        code: 'E007',
        message: `'${node.name}' accepts at most ${sig.maxArgs} argument${sig.maxArgs !== 1 ? 's' : ''}, but got ${argCount}`,
        offset: node.nameOffset,
        length: node.name.length,
      });
    }

    if (sig.deprecated) {
      diagnostics.push({
        severity: 'warning',
        code: 'W003',
        message: `'${node.name}' is deprecated`,
        offset: node.nameOffset,
        length: node.name.length,
      });
    }
  }

  // Check for empty arguments (potential typos like `add(,3)`)
  for (let i = 0; i < node.args.length; i++) {
    if (node.args[i].length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'W002',
        message: `Argument ${i + 1} of '${node.name}' is empty`,
        offset: node.offset,
        length: 1,
      });
    }
  }

  // Recurse into each argument's nodes
  for (const arg of node.args) {
    walkNodes(arg, diagnostics);
  }
}
