// ---------------------------------------------------------------------------
// RhostMUSH softcode recursive-descent parser
// ---------------------------------------------------------------------------

import { Token } from './tokenizer';
import { ASTNode, BracketEvalNode, Diagnostic, FunctionCallNode, RawTextNode, SubstitutionNode } from './types';

export interface ParseResult {
  nodes: ASTNode[];
  /** Structural diagnostics: unclosed parens/brackets, stray ), ], etc. */
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    if (this.pos >= this.tokens.length) {
      throw new Error('Unexpected end of token stream');
    }
    return this.tokens[this.pos++];
  }

  // -------------------------------------------------------------------------
  // Top-level entry point
  // -------------------------------------------------------------------------

  /**
   * Parse the entire token stream as a top-level expression.
   * Stray `)` and `]` at the top level are reported as errors.
   * Top-level commas are treated as literal text.
   */
  parseTopLevel(): ASTNode[] {
    const nodes: ASTNode[] = [];

    while (this.peek() !== null) {
      const tok = this.peek()!;

      if (tok.type === 'RPAREN') {
        this.diagnostics.push({
          severity: 'error',
          code: 'E002',
          message: `Unexpected ')' — no matching '(' was opened`,
          offset: tok.offset,
          length: 1,
        });
        this.consume();
        continue;
      }

      if (tok.type === 'RBRACKET') {
        this.diagnostics.push({
          severity: 'error',
          code: 'E004',
          message: `Unexpected ']' — no matching '[' was opened`,
          offset: tok.offset,
          length: 1,
        });
        this.consume();
        continue;
      }

      if (tok.type === 'COMMA') {
        // Top-level comma is literal text (not inside a function call)
        nodes.push({ type: 'RawText', value: ',', offset: tok.offset });
        this.consume();
        continue;
      }

      const node = this.parseNode();
      if (node !== null) nodes.push(node);
    }

    return nodes;
  }

  // -------------------------------------------------------------------------
  // Node dispatch
  // -------------------------------------------------------------------------

  /**
   * Parse a single AST node.  Returns null only at EOF.
   */
  private parseNode(): ASTNode | null {
    const tok = this.peek();
    if (tok === null) return null;

    if (tok.type === 'FNAME') {
      return this.parseFunctionCall();
    }

    if (tok.type === 'LBRACKET') {
      return this.parseBracketEval();
    }

    if (tok.type === 'SUBST') {
      this.consume();
      return { type: 'Substitution', raw: tok.value, offset: tok.offset } as SubstitutionNode;
    }

    // ESC, TEXT, LPAREN (bare paren not after identifier), anything else → RawText
    this.consume();
    return { type: 'RawText', value: tok.value, offset: tok.offset } as RawTextNode;
  }

  // -------------------------------------------------------------------------
  // Function call: FNAME LPAREN [arglist] RPAREN
  // -------------------------------------------------------------------------

  private parseFunctionCall(): FunctionCallNode {
    const nameTok = this.consume(); // FNAME
    // Tokenizer guarantees LPAREN immediately follows FNAME
    const lparenTok = this.consume(); // LPAREN

    const node: FunctionCallNode = {
      type: 'FunctionCall',
      name: nameTok.value,
      nameOffset: nameTok.offset,
      args: [],
      offset: lparenTok.offset,
    };

    // Immediately closed: name()
    if (this.peek()?.type === 'RPAREN') {
      this.consume();
      return node;
    }

    // EOF immediately after opening paren
    if (this.peek() === null) {
      this.diagnostics.push(this.unclosedParen(nameTok.value, lparenTok.offset));
      return node;
    }

    // Parse comma-separated argument expressions
    while (true) {
      const arg = this.parseArgExpression(nameTok.value);
      node.args.push(arg);

      const next = this.peek();

      if (next === null) {
        // EOF without closing paren
        this.diagnostics.push(this.unclosedParen(nameTok.value, lparenTok.offset));
        break;
      }

      if (next.type === 'RPAREN') {
        this.consume();
        break;
      }

      if (next.type === 'COMMA') {
        this.consume();
        // Trailing comma — push one final empty arg and close on next RPAREN
        if (this.peek()?.type === 'RPAREN') {
          node.args.push([]);
          this.consume();
          break;
        }
        if (this.peek() === null) {
          node.args.push([]);
          this.diagnostics.push(this.unclosedParen(nameTok.value, lparenTok.offset));
          break;
        }
        continue;
      }

      // Unexpected token — shouldn't happen with a well-formed token stream
      break;
    }

    return node;
  }

  /**
   * Parse one argument expression, stopping (without consuming) at a
   * COMMA or RPAREN that closes the current function call.
   * LBRACKET/RBRACKET are handled recursively by parseBracketEval, so
   * they do NOT prematurely end an argument even if they contain commas.
   */
  private parseArgExpression(funcName: string): ASTNode[] {
    const nodes: ASTNode[] = [];

    while (true) {
      const tok = this.peek();
      if (tok === null) break;

      // These end the current argument
      if (tok.type === 'COMMA' || tok.type === 'RPAREN') break;

      // Stray ] inside a function argument
      if (tok.type === 'RBRACKET') {
        this.diagnostics.push({
          severity: 'error',
          code: 'E004',
          message: `Unexpected ']' inside argument of '${funcName}'`,
          offset: tok.offset,
          length: 1,
        });
        this.consume();
        continue;
      }

      const node = this.parseNode();
      if (node !== null) nodes.push(node);
    }

    return nodes;
  }

  // -------------------------------------------------------------------------
  // Bracket eval: LBRACKET expression RBRACKET
  // -------------------------------------------------------------------------

  private parseBracketEval(): BracketEvalNode {
    const lbracketTok = this.consume(); // LBRACKET
    const innerNodes: ASTNode[] = [];

    while (true) {
      const tok = this.peek();

      if (tok === null) {
        this.diagnostics.push({
          severity: 'error',
          code: 'E003',
          message: `Unclosed '[' — missing closing ']'`,
          offset: lbracketTok.offset,
          length: 1,
        });
        break;
      }

      if (tok.type === 'RBRACKET') {
        this.consume();
        break;
      }

      // Stray ) inside a bracket eval at the bracket's top level
      if (tok.type === 'RPAREN') {
        this.diagnostics.push({
          severity: 'error',
          code: 'E002',
          message: `Unexpected ')' inside '[ ]' expression`,
          offset: tok.offset,
          length: 1,
        });
        this.consume();
        continue;
      }

      // Top-level comma inside a bracket eval is literal text
      if (tok.type === 'COMMA') {
        innerNodes.push({ type: 'RawText', value: ',', offset: tok.offset });
        this.consume();
        continue;
      }

      const node = this.parseNode();
      if (node !== null) innerNodes.push(node);
    }

    return { type: 'BracketEval', nodes: innerNodes, offset: lbracketTok.offset };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private unclosedParen(funcName: string, offset: number): Diagnostic {
    return {
      severity: 'error',
      code: 'E001',
      message: `Unclosed '(' for function '${funcName}' — missing closing ')'`,
      offset,
      length: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parse a flat token stream into an AST.
 *
 * Structural errors (unbalanced parens/brackets) are embedded in `diagnostics`.
 * The returned `nodes` array always contains the best-effort parse even when
 * there are errors, enabling downstream semantic checks to still run.
 */
export function parse(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const nodes = parser.parseTopLevel();
  return { nodes, diagnostics: parser.diagnostics };
}
