// ---------------------------------------------------------------------------
// mush-format — full-file softcode formatter
//
// Handles the two-way conversion mandated by mush-architect's FILE FORMAT
// CONTRACT:
//
//   expand   dist/*.installer.txt  →  src/*.mush   (compressed → readable)
//   compress src/*.mush            →  dist/*.installer.txt  (readable → compressed)
//
// The key capability that the existing `fmt` module lacks: this formatter
// understands the full attribute-value structure — dollar patterns, @commands,
// command lists (`;`), and braced content — by using the compiled PEG grammar.
// Braced content is re-parsed recursively so `{@switch ...}` gets indented
// as nested commands rather than rendered as an opaque string.
// ---------------------------------------------------------------------------

import { parse, print } from '@ursamu/mushcode';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExpandOptions {
  /** Indent size in spaces. Default: 2. */
  indent?: number;
}

export interface CompressOptions {
  /** Normalise function names to lowercase. Default: false. */
  lowercase?: boolean;
}

export interface FileFormatResult {
  output: string;
  changed: boolean;
}

/**
 * Expand a compressed installer line's attribute value into pretty
 * multi-line format for use in a src/*.mush file.
 *
 * expandAttrValue('$+finger *:@pemit %#=[u(me/FN_FINGER,%0)]')
 * →
 *   $+finger *:
 *     @pemit %#=
 *       [u(me/FN_FINGER, %0)]
 */
export function expandAttrValue(value: string, opts: ExpandOptions = {}): string {
  const indent = opts.indent ?? 2;
  try {
    const ast = parse(value);
    return prettyNode(ast as AnyNode, 0, indent);
  } catch {
    // Not parseable (syntax error, RhostMUSH-specific syntax, etc.) — return as-is
    return value;
  }
}

/**
 * Compress a pretty src/*.mush attribute value to a single line suitable
 * for an installer file.  Strips leading/trailing whitespace per argument
 * and collapses multi-line indentation.
 */
export function compressAttrValue(value: string, opts: CompressOptions = {}): string {
  // Strip leading/trailing whitespace from the whole value
  const trimmed = value.trim();
  try {
    const ast = parse(trimmed);
    let result = print(ast, { mode: 'compact' });
    if (opts.lowercase) {
      result = result.replace(/([A-Za-z][A-Za-z0-9_]*)\(/g, (_: string, name: string) => name.toLowerCase() + '(');
    }
    return result;
  } catch {
    // Fall back to simple whitespace collapse
    return trimmed.replace(/\s+/g, ' ');
  }
}

/**
 * Expand a full installer file to pretty src format.
 */
export function expandFile(content: string, opts: ExpandOptions = {}): FileFormatResult {
  const lines = content.split('\n');
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Strip installer @@ header/footer comments — they're generated on compress
    if (line.startsWith('@@ ===') || line.startsWith('@@ ---[')) continue;
    if (line.match(/^@@ Mushcode Installer/i)) continue;
    if (line.match(/^@@ \[END OF FILE\]/i)) continue;
    if (line.match(/^@@ Version:/i)) continue;
    if (line.match(/^@@ Requires:/i)) continue;
    if (line.match(/^@@ Author:/i)) continue;
    if (line.match(/^@@ $/)) continue;

    // Convert @@ section markers to // comments
    if (line.startsWith('@@')) {
      const comment = line.replace(/^@@\s*/, '').trim();
      if (comment) out.push(`// ${comment}`);
      else out.push('');
      continue;
    }

    // Attribute set: &ATTR obj=value
    const attrMatch = line.match(/^(&[A-Za-z_][A-Za-z0-9_-]*(?:\.[0-9]+)?\s+[^=]+)=(.*)$/);
    if (attrMatch) {
      const header = attrMatch[1];
      const value  = attrMatch[2];
      if (!value.trim()) {
        out.push(`${header}=`);
      } else {
        const pretty = expandAttrValue(value, opts);
        const ind = ' '.repeat(opts.indent ?? 2);
        // Multi-line value: put value on new line indented
        if (pretty.includes('\n')) {
          out.push(`${header}=`);
          out.push(pretty.split('\n').map(l => ind + l).join('\n'));
        } else {
          out.push(`${header}=${pretty}`);
        }
      }
      out.push('');  // blank line between attrs for readability
      continue;
    }

    // @command with value: @cmd obj=value
    const cmdMatch = line.match(/^(@[a-zA-Z][a-zA-Z0-9_/-]*)(\s+[^=]+=)(.+)$/);
    if (cmdMatch) {
      const [, cmd, objPart, value] = cmdMatch;
      const pretty = expandAttrValue(value, opts);
      if (pretty.includes('\n')) {
        const ind = ' '.repeat(opts.indent ?? 2);
        out.push(`${cmd}${objPart}`);
        out.push(pretty.split('\n').map(l => ind + l).join('\n'));
      } else {
        out.push(`${cmd}${objPart}${pretty}`);
      }
      continue;
    }

    // Everything else (@create, @set, @lock, connect, QUIT, etc.) — pass through
    out.push(line);
  }

  const output = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { output, changed: output !== content };
}

/**
 * Compress a pretty src/*.mush file to installer format.
 */
export function compressFile(
  content: string,
  meta: { name?: string; version?: string; author?: string; requires?: string } = {},
  opts: CompressOptions = {}
): FileFormatResult {
  const lines = content.split('\n');
  const installerLines: string[] = [];

  // Collect non-comment logical lines, joining multi-line attribute values
  const logicalLines: string[] = [];
  let currentLine = '';

  for (const raw of lines) {
    const line = raw.trim();

    // Skip // comments entirely in compressed output
    if (line.startsWith('//')) continue;
    // Skip blank lines
    if (!line) {
      if (currentLine) {
        logicalLines.push(currentLine);
        currentLine = '';
      }
      continue;
    }

    // A new logical line starts with a command-level keyword or &
    const isNewCommand = /^[@&a-zA-Z+]/.test(line) || line === 'QUIT' || line === 'think';

    if (isNewCommand && currentLine) {
      logicalLines.push(currentLine);
      currentLine = line;
    } else if (isNewCommand) {
      currentLine = line;
    } else {
      // Continuation line: append with a space (collapsing indentation)
      currentLine += (currentLine ? ' ' : '') + line;
    }
  }
  if (currentLine) logicalLines.push(currentLine);

  // Build installer output
  const name    = meta.name    ?? 'Unnamed System';
  const version = meta.version ?? '0.0.0';
  const author  = meta.author  ?? '';
  const requires = meta.requires ?? 'None';
  const sep = '@@ ' + '='.repeat(75);

  installerLines.push(sep);
  installerLines.push(`@@ Mushcode Installer for: ${name}`);
  installerLines.push(`@@ Version: ${version}`);
  if (author)  installerLines.push(`@@ Author: ${author}`);
  installerLines.push(`@@ Requires: ${requires}`);
  installerLines.push(sep);
  installerLines.push('');

  for (const logical of logicalLines) {
    // Attribute set: compress the value
    const attrMatch = logical.match(/^(&[A-Za-z_][A-Za-z0-9_-]*(?:\.[0-9]+)?\s+[^=]+)=(.*)$/);
    if (attrMatch) {
      const header = attrMatch[1];
      const value  = attrMatch[2].trim();
      const compressed = value ? compressAttrValue(value, opts) : '';
      installerLines.push(`${header}=${compressed}`);
      continue;
    }

    // @command with value: compress the value part
    const cmdMatch = logical.match(/^(@[a-zA-Z][a-zA-Z0-9_/-]*)(\s+[^=]+=)(.+)$/);
    if (cmdMatch) {
      const [, cmd, objPart, value] = cmdMatch;
      const compressed = compressAttrValue(value.trim(), opts);
      installerLines.push(`${cmd}${objPart}${compressed}`);
      continue;
    }

    installerLines.push(logical);
  }

  installerLines.push('');
  installerLines.push(sep);
  installerLines.push('@@ ---[ UNINSTALL ]---');
  installerLines.push('@@ @@ To uninstall: destroy all objects created by the installer above.');
  installerLines.push(sep);
  installerLines.push('@@ [END OF FILE]');

  const output = installerLines.join('\n') + '\n';
  return { output, changed: true };
}

// ---------------------------------------------------------------------------
// Pretty-printer (expand direction)
// Produces indented, multi-line output from a parsed AST node.
// ---------------------------------------------------------------------------

// Loose type for grammar AST nodes
type AnyNode = Record<string, unknown> & { type: string };

function prettyNode(node: AnyNode, depth: number, indent: number): string {
  const pad = (d: number) => ' '.repeat(d * indent);

  switch (node.type) {

    case 'DollarPattern': {
      const pattern = prettyNode(node.pattern as AnyNode, depth, indent);
      const action  = prettyNode(node.action  as AnyNode, depth + 1, indent);
      return `${pattern}:\n${pad(depth + 1)}${action}`;
    }

    case 'ListenPattern': {
      // Pattern prettyNode adds '$'; for ListenPattern we need '^', so access parts directly
      const patParts = (node.pattern as AnyNode).parts as AnyNode[];
      const pattern = '^' + patParts.map(p => prettyInline(p)).join('');
      const action  = prettyNode(node.action as AnyNode, depth + 1, indent);
      return `${pattern}:\n${pad(depth + 1)}${action}`;
    }

    case 'Pattern':
      return '$' + (node.parts as AnyNode[]).map(p => prettyInline(p)).join('');

    case 'PatternAlts': {
      const pats = (node.patterns as AnyNode[]).map(p =>
        (p.parts as AnyNode[]).map(pp => prettyInline(pp)).join('')
      );
      return '$' + pats.join(';');
    }

    case 'Wildcard':
      return node.wildcard as string;

    case 'CommandList': {
      const cmds = (node.commands as AnyNode[])
        .map(c => pad(depth) + prettyNode(c, depth, indent));
      return cmds.join(';\n');
    }

    case 'AtCommand': {
      const sw  = (node.switches as string[]).map(s => '/' + s).join('');
      const obj = node.object ? ' ' + prettyNode(node.object as AnyNode, depth, indent) : '';
      const val = node.value
        ? formatAtCmdValue(node.name as string, node.value as AnyNode, depth, indent)
        : '';
      return `@${node.name as string}${sw}${obj}${val}`;
    }

    case 'AttributeSet': {
      const attrObj = prettyNode(node.object as AnyNode, depth, indent);
      const val     = prettyNode(node.value  as AnyNode, depth + 1, indent);
      if (val.includes('\n')) {
        return `&${node.attribute as string} ${attrObj}=\n${pad(depth + 1)}${val}`;
      }
      return `&${node.attribute as string} ${attrObj}=${val}`;
    }

    case 'UserCommand': {
      return formatUserCommand(node.parts as AnyNode[], depth, indent);
    }

    case 'Text':
      return (node.parts as AnyNode[]).map(p => prettyInline(p)).join('');

    case 'EvalBlock':
      return '[' + prettyEvalInline(node.parts as AnyNode[]) + ']';

    case 'FunctionCall':
      return prettyFunctionCall(node, depth, indent);

    case 'BracedString':
      return prettyBraced(node.parts as AnyNode[], depth, indent);

    case 'Substitution':  return '%' + (node.code as string);
    case 'SpecialVar':    return node.code as string;
    case 'Escape':        return '\\' + (node.char as string);
    case 'Literal':       return node.value as string;

    default: return '';
  }
}

/**
 * Format an @command value.  For @switch, detect case-list pattern and
 * break each `pattern, {action}` pair onto its own indented block.
 */
function formatAtCmdValue(
  cmdName: string,
  valNode: AnyNode,
  depth: number,
  indent: number
): string {
  const pad = (d: number) => ' '.repeat(d * indent);
  const valText = prettyNode(valNode, depth + 1, indent);

  // @switch / @switchall — try to format as a case list.
  // formatCaseList already applies pad(depth+1) to each line — don't double-add it.
  if (cmdName === 'switch' || cmdName === 'switchall') {
    const caseList = formatSwitchValue(valNode, depth + 1, indent);
    if (caseList) {
      return `=\n${caseList}`;
    }
  }

  // CommandList values already carry pad(depth+1) on each line from prettyNode.
  if (valText.includes('\n')) {
    return `=\n${valText}`;
  }
  // Long single-line value: push to next line with one indent
  if (valText.length > 60) {
    return `=\n${pad(depth + 1)}${valText}`;
  }
  return `=${valText}`;
}

/**
 * Format a UserCommand node.
 * Detects the @switch case-list pattern: alternating text-patterns and
 * BracedString actions separated by commas.
 */
function formatUserCommand(parts: AnyNode[], depth: number, indent: number): string {
  // Count BracedStrings in the parts
  const braceCount = parts.filter(p => p.type === 'BracedString').length;

  // If there are braced strings, split at them and format as a case list
  if (braceCount >= 1) {
    return formatCaseList(parts, depth, indent);
  }

  // Otherwise just inline
  return parts.map(p => prettyInline(p)).join('');
}

/**
 * Split a list of UserCommand parts at BracedString nodes, producing a
 * formatted case-list like:
 *
 *   1, {
 *     @pemit %#=Error
 *   }, {
 *     @switch ...
 *   }
 */
function formatCaseList(parts: AnyNode[], depth: number, indent: number): string {
  const pad = (d: number) => ' '.repeat(d * indent);
  const chunks: string[] = [];
  let buf = '';

  for (const part of parts) {
    if (part.type === 'BracedString') {
      // Flush the text buffer as a case label (trim trailing comma+space)
      const label = buf.replace(/,\s*$/, '').trimEnd();
      if (label) chunks.push(label);
      buf = '';
      // Format the brace content
      chunks.push(prettyBraced(part.parts as AnyNode[], depth, indent));
    } else {
      buf += prettyInline(part);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  // Reassemble: label, brace, comma-separator, label, brace, ...
  const lines: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const next  = chunks[i + 1];

    if (chunk.startsWith('{')) {
      // It's a brace — does it need a trailing comma?
      const hasMore = next !== undefined;
      lines.push(pad(depth) + chunk + (hasMore ? ',' : ''));
    } else {
      // It's a label — attach to next brace if the brace is coming
      if (next && next.startsWith('{')) {
        lines.push(pad(depth) + chunk + ', ' + next + (chunks[i + 2] !== undefined ? ',' : ''));
        i++; // skip the brace we just attached
      } else {
        lines.push(pad(depth) + chunk);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a BracedString by re-parsing its text content as a CommandList
 * when it looks like command content.  Falls back to inline rendering if
 * re-parsing fails or the content is simple.
 */
function prettyBraced(parts: AnyNode[], depth: number, indent: number): string {
  const pad = (d: number) => ' '.repeat(d * indent);
  const text = extractText(parts);

  // Simple content (no @ & commands, no semicolons): keep inline
  const isComplex = /^[@&]|;/.test(text.trim());
  if (!isComplex) {
    return `{${text}}`;
  }

  // Try to re-parse braced content as a command sequence
  try {
    const inner = parse(text.trim()) as AnyNode;
    const formatted = prettyNode(inner, depth + 1, indent);
    return `{\n${pad(depth + 1)}${formatted}\n${pad(depth)}}`;
  } catch {
    return `{${text}}`;
  }
}

/**
 * Detect @switch value pattern and format it as aligned case blocks.
 * Returns null if the pattern isn't recognised.
 */
function formatSwitchValue(valNode: AnyNode, depth: number, indent: number): string | null {
  if (valNode.type !== 'UserCommand') return null;
  const parts = valNode.parts as AnyNode[];
  const braceCount = parts.filter(p => p.type === 'BracedString').length;
  if (braceCount < 1) return null;
  return formatCaseList(parts, depth, indent);
}

// ---------------------------------------------------------------------------
// Helpers for inline rendering (no newlines)
// ---------------------------------------------------------------------------

function prettyInline(node: AnyNode): string {
  switch (node.type) {
    case 'Literal':      return node.value as string;
    case 'Substitution': return '%' + (node.code as string);
    case 'SpecialVar':   return node.code as string;
    case 'Escape':       return '\\' + (node.char as string);
    case 'Wildcard':     return node.wildcard as string;
    case 'EvalBlock':    return '[' + prettyEvalInline(node.parts as AnyNode[]) + ']';
    case 'BracedString': return '{' + extractText(node.parts as AnyNode[]) + '}';
    case 'FunctionCall': return prettyFunctionCallInline(node);
    case 'Text':         return (node.parts as AnyNode[]).map(p => prettyInline(p)).join('');
    case 'Arg':          return (node.parts as AnyNode[]).map(p => prettyInline(p)).join('');
    default:             return '';
  }
}

function prettyEvalInline(parts: AnyNode[]): string {
  return parts.map(p => prettyInline(p)).join('');
}

function prettyFunctionCallInline(node: AnyNode): string {
  const name = node.name as string;
  const args = node.args as AnyNode[];
  if (args.length === 0) return `${name}()`;
  // Trim each arg's serialised text so we don't double-space after commas that
  // already had trailing/leading whitespace in the original source.
  const argStrs = args.map(a =>
    (a.parts as AnyNode[]).map(p => prettyInline(p)).join('').trim()
  );
  return `${name}(${argStrs.join(', ')})`;
}

/**
 * Pretty-print a FunctionCall node.
 * Stays inline if all args are simple; wraps to multi-line otherwise.
 */
function prettyFunctionCall(node: AnyNode, depth: number, indent: number): string {
  const pad = (d: number) => ' '.repeat(d * indent);
  const name = node.name as string;
  const args = node.args as AnyNode[];

  if (args.length === 0) return `${name}()`;

  const hasNested = args.some(a =>
    (a.parts as AnyNode[]).some(p =>
      p.type === 'FunctionCall' || p.type === 'EvalBlock' || p.type === 'BracedString'
    )
  );

  if (!hasNested) {
    return prettyFunctionCallInline(node);
  }

  const serialized = args.map(a =>
    pad(depth + 1) + (a.parts as AnyNode[]).map(p => prettyInline(p)).join('')
  ).join(',\n');

  return `${name}(\n${serialized}\n${pad(depth)})`;
}

// ---------------------------------------------------------------------------
// Text extractor — collapses AST nodes back to raw text for re-parsing
// ---------------------------------------------------------------------------

function extractText(parts: AnyNode[]): string {
  return parts.map(p => {
    switch (p.type) {
      case 'Literal':      return p.value as string;
      case 'Substitution': return '%' + (p.code as string);
      case 'SpecialVar':   return p.code as string;
      case 'Escape':       return '\\' + (p.char as string);
      case 'EvalBlock':    return '[' + extractText(p.parts as AnyNode[]) + ']';
      case 'BracedString': return '{' + extractText(p.parts as AnyNode[]) + '}';
      case 'FunctionCall': {
        const name = p.name as string;
        const args = p.args as AnyNode[];
        if (args.length === 0) return `${name}()`;
        return `${name}(${args.map(a => extractText(a.parts as AnyNode[])).join(',')})`;
      }
      default: return '';
    }
  }).join('');
}
