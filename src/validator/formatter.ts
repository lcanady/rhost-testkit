// ---------------------------------------------------------------------------
// Softcode Formatter — serialize an AST back to a normalized string
// ---------------------------------------------------------------------------

import { tokenize } from './tokenizer';
import { parse } from './parser';
import { ASTNode, FunctionCallNode, BracketEvalNode, SubstitutionNode, RawTextNode } from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FormatOptions {
  /** Add newlines + indentation for human readability. Default: false. */
  pretty?: boolean;
  /** Lowercase all function names. Default: false. */
  lowercase?: boolean;
}

export interface FormatResult {
  formatted: string;
  changed: boolean;
}

/**
 * Format a MUSHcode expression.
 *
 * Compact mode (default): strips extra whitespace around `(`, `,`, `)` while
 * preserving whitespace inside argument text.
 *
 * Pretty mode: additionally adds newlines + indentation at each nesting level
 * for human readability. Not suitable for direct upload to a MUSH server.
 */
export function format(expr: string, options: FormatOptions = {}): FormatResult {
  const tokens = tokenize(expr);
  const { nodes } = parse(tokens);

  const serializer = new Serializer(options);
  const formatted = serializer.serializeNodes(nodes, 0);
  return { formatted, changed: formatted !== expr };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

class Serializer {
  constructor(private readonly opts: FormatOptions) {}

  serializeNodes(nodes: ASTNode[], depth: number): string {
    return nodes.map(n => this.serializeNode(n, depth)).join('');
  }

  private serializeNode(node: ASTNode, depth: number): string {
    switch (node.type) {
      case 'FunctionCall':  return this.serializeFunctionCall(node as FunctionCallNode, depth);
      case 'BracketEval':   return this.serializeBracketEval(node as BracketEvalNode, depth);
      case 'Substitution':  return (node as SubstitutionNode).raw;
      case 'RawText':       return (node as RawTextNode).value;
    }
  }

  private serializeFunctionCall(node: FunctionCallNode, depth: number): string {
    const name = this.opts.lowercase ? node.name.toLowerCase() : node.name;

    if (node.args.length === 0) {
      return `${name}()`;
    }

    // Trim leading/trailing RawText whitespace from each arg
    const trimmedArgs = node.args.map(arg => trimArgWhitespace(arg));

    const pretty = this.opts.pretty;

    // Pretty mode: wrap if any arg contains a function call
    if (pretty && hasNestedCall(trimmedArgs)) {
      const indent = '  '.repeat(depth + 1);
      const closingIndent = '  '.repeat(depth);
      const serializedArgs = trimmedArgs.map(arg =>
        indent + this.serializeNodes(arg, depth + 1)
      );
      return `${name}(\n${serializedArgs.join(',\n')}\n${closingIndent})`;
    }

    const serializedArgs = trimmedArgs.map(arg => this.serializeNodes(arg, depth + 1));
    return `${name}(${serializedArgs.join(',')})`;
  }

  private serializeBracketEval(node: BracketEvalNode, depth: number): string {
    return `[${this.serializeNodes(node.nodes, depth)}]`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trim leading and trailing RawText-whitespace-only nodes from an arg list. */
function trimArgWhitespace(arg: ASTNode[]): ASTNode[] {
  if (arg.length === 0) return arg;

  let start = 0;
  let end = arg.length - 1;

  // Trim leading whitespace-only RawText nodes
  while (start <= end) {
    const node = arg[start];
    if (node.type === 'RawText' && (node as RawTextNode).value.trim() === '') {
      start++;
    } else {
      break;
    }
  }

  // Trim trailing whitespace-only RawText nodes
  while (end >= start) {
    const node = arg[end];
    if (node.type === 'RawText' && (node as RawTextNode).value.trim() === '') {
      end--;
    } else {
      break;
    }
  }

  if (start > end) return [];

  const trimmed = arg.slice(start, end + 1);

  // Also trim leading whitespace from the value of the first RawText node
  // (handles cases like arg starting with a non-whitespace-only RawText that begins with spaces)
  if (trimmed.length > 0 && trimmed[0].type === 'RawText') {
    const first = trimmed[0] as RawTextNode;
    const trimmedValue = first.value.trimStart();
    if (trimmedValue !== first.value) {
      trimmed[0] = { ...first, value: trimmedValue };
    }
  }

  // And trailing whitespace from the last RawText node
  if (trimmed.length > 0 && trimmed[trimmed.length - 1].type === 'RawText') {
    const last = trimmed[trimmed.length - 1] as RawTextNode;
    const trimmedValue = last.value.trimEnd();
    if (trimmedValue !== last.value) {
      trimmed[trimmed.length - 1] = { ...last, value: trimmedValue };
    }
  }

  return trimmed;
}

/** Returns true if any arg list contains a FunctionCall node (for pretty indentation decisions). */
function hasNestedCall(args: ASTNode[][]): boolean {
  return args.some(arg => arg.some(node => node.type === 'FunctionCall' || node.type === 'BracketEval'));
}
