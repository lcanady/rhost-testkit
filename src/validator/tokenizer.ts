// ---------------------------------------------------------------------------
// RhostMUSH softcode tokenizer
// ---------------------------------------------------------------------------

export type TokenType =
  | 'FNAME'      // identifier immediately before '(' → function name
  | 'LPAREN'     // '(' immediately following a FNAME
  | 'RPAREN'     // ')'
  | 'COMMA'      // ','
  | 'LBRACKET'   // '['
  | 'RBRACKET'   // ']'
  | 'SUBST'      // percent substitution: %#, %N, %q0, %0–%9, %r, etc.
  | 'ESC'        // backslash escape: \X — value is the literal escaped character
  | 'TEXT';      // any other run of characters

export interface Token {
  type: TokenType;
  /** The raw text of this token as it appears in the source */
  value: string;
  /** Character offset in the original expression string */
  offset: number;
}

// Characters that end a plain-text accumulation run.
// These must be checked before starting a new TEXT run.
const STRUCTURAL_RE = /[\\%\[\]()\,,a-zA-Z_]/;

function isIdentStart(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; // A-Z, a-z, _
}

function isIdentChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95
  ); // A-Z, a-z, 0-9, _
}

/**
 * Single-character percent substitutions recognised by RhostMUSH.
 * Anything else after % is treated as a literal %, not a substitution.
 */
const SINGLE_CHAR_SUBST = new Set([
  '#', 'N', 'n', 'L', 'l', 'P', 'p', 'T', 't', 'B', 'b',
  'R', 'r', 'A', 'a', 'O', 'o', 'S', 's', 'X', 'x', '+',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'C', 'c',  // ANSI carry
  'v', 'V',  // attribute value
  'w', 'W',  // attribute name
  'u', 'U',  // room name
  'f', 'F',  // from
  'k', 'K',  // money
  'm', 'M',  // last entered command
]);

/**
 * Tokenize a RhostMUSH softcode expression into a flat token stream.
 *
 * Rules (in priority order):
 *   1. `\X`           → ESC(X)                   — escape always wins
 *   2. `%%`           → TEXT('%')                 — literal percent
 *   3. `%qX` / `%iX`  → SUBST('%qX')             — 3-char register subst
 *   4. `%X` (known)   → SUBST('%X')               — 2-char substitution
 *   5. `%`  (unknown) → TEXT('%')                 — treat as literal
 *   6. `[`            → LBRACKET
 *   7. `]`            → RBRACKET
 *   8. `)`            → RPAREN
 *   9. `,`            → COMMA
 *  10. `word(`        → FNAME(word) + LPAREN('(')
 *  11. `word`         → TEXT(word)                — identifier not before (
 *  12. `(`            → TEXT('(')                 — ( not after identifier
 *  13. <run>          → TEXT(run)                 — anything else
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const ch = input[pos];

    // ---- 1. Backslash escape ----
    if (ch === '\\') {
      if (pos + 1 < len) {
        tokens.push({ type: 'ESC', value: input[pos + 1], offset: pos });
        pos += 2;
      } else {
        // Trailing backslash: literal backslash
        tokens.push({ type: 'TEXT', value: '\\', offset: pos });
        pos++;
      }
      continue;
    }

    // ---- 2–5. Percent substitutions ----
    if (ch === '%') {
      if (pos + 1 >= len) {
        tokens.push({ type: 'TEXT', value: '%', offset: pos });
        pos++;
        continue;
      }

      const next = input[pos + 1];

      // %% → literal %
      if (next === '%') {
        tokens.push({ type: 'TEXT', value: '%', offset: pos });
        pos += 2;
        continue;
      }

      // %q0–%q9, %qA–%qZ (q-register), %i0–%i9 (iter var) → 3-char subst
      if ((next === 'q' || next === 'Q' || next === 'i' || next === 'I') &&
          pos + 2 < len && /[0-9a-zA-Z]/.test(input[pos + 2])) {
        tokens.push({ type: 'SUBST', value: input.slice(pos, pos + 3), offset: pos });
        pos += 3;
        continue;
      }

      // Single-char known substitutions
      if (SINGLE_CHAR_SUBST.has(next)) {
        tokens.push({ type: 'SUBST', value: input.slice(pos, pos + 2), offset: pos });
        pos += 2;
        continue;
      }

      // Unknown %X: literal %
      tokens.push({ type: 'TEXT', value: '%', offset: pos });
      pos++;
      continue;
    }

    // ---- 6–9. Single structural characters ----
    if (ch === '[') {
      tokens.push({ type: 'LBRACKET', value: '[', offset: pos });
      pos++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'RBRACKET', value: ']', offset: pos });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', offset: pos });
      pos++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', offset: pos });
      pos++;
      continue;
    }

    // ---- 10–11. Identifier: FNAME+LPAREN or plain TEXT ----
    if (isIdentStart(ch)) {
      const start = pos;
      while (pos < len && isIdentChar(input[pos])) {
        pos++;
      }
      const word = input.slice(start, pos);

      if (pos < len && input[pos] === '(') {
        // Function call: emit FNAME then LPAREN
        tokens.push({ type: 'FNAME', value: word, offset: start });
        tokens.push({ type: 'LPAREN', value: '(', offset: pos });
        pos++;
      } else {
        // Bare identifier — text
        tokens.push({ type: 'TEXT', value: word, offset: start });
      }
      continue;
    }

    // ---- 12. '(' not after an identifier: literal ----
    if (ch === '(') {
      tokens.push({ type: 'TEXT', value: '(', offset: pos });
      pos++;
      continue;
    }

    // ---- 13. Plain text accumulation ----
    {
      const start = pos;
      while (pos < len) {
        const c = input[pos];
        // Stop at any character that starts a higher-priority rule
        if (
          c === '\\' || c === '%' ||
          c === '[' || c === ']' ||
          c === '(' || c === ')' ||
          c === ',' ||
          isIdentStart(c)
        ) {
          break;
        }
        pos++;
      }
      if (pos > start) {
        tokens.push({ type: 'TEXT', value: input.slice(start, pos), offset: start });
      }
    }
  }

  return tokens;
}
