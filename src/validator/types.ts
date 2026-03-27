// ---------------------------------------------------------------------------
// Shared types for the RhostMUSH softcode validator
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning';

/** A single diagnostic produced by the validator. */
export interface Diagnostic {
  severity: Severity;
  /** Error/warning code, e.g. 'E001', 'W002' */
  code: string;
  message: string;
  /** Character offset in the original expression string */
  offset: number;
  /** Span length in characters (0 = point diagnostic) */
  length: number;
}

/** Result returned by `validate()` */
export interface ValidationResult {
  /** false if any diagnostic has severity 'error' */
  valid: boolean;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type ASTNode =
  | FunctionCallNode
  | BracketEvalNode
  | SubstitutionNode
  | RawTextNode;

/** A function call: `name(arg1, arg2, ...)` */
export interface FunctionCallNode {
  type: 'FunctionCall';
  /** Original casing preserved from source */
  name: string;
  /** Offset of the first character of the name */
  nameOffset: number;
  /**
   * Each element is the list of nodes forming one argument.
   * An empty inner array means an empty/missing argument.
   */
  args: ASTNode[][];
  /** Offset of the opening parenthesis */
  offset: number;
}

/** An inline evaluation: `[expression]` */
export interface BracketEvalNode {
  type: 'BracketEval';
  nodes: ASTNode[];
  /** Offset of the '[' */
  offset: number;
}

/** A percent-substitution: `%#`, `%N`, `%q0`, `%0`–`%9`, `%%`, etc. */
export interface SubstitutionNode {
  type: 'Substitution';
  /** The raw substitution text as it appears in the source */
  raw: string;
  offset: number;
}

/** Literal text or an escaped character that requires no further analysis */
export interface RawTextNode {
  type: 'RawText';
  value: string;
  offset: number;
}
