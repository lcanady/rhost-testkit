/**
 * CJS-compatible shim for @ursamu/mushcode.
 *
 * The published JSR package is ESM-only, which Jest's CJS mode cannot load
 * directly.  This shim provides parse() and print() using:
 *   - parse(): the bundled CJS Peggy grammar (parser/mux-softcode.js)
 *   - print(): a compact serializer matching the AST produced by that grammar
 *
 * Only used during Jest test runs via moduleNameMapper.
 * Production code loads the real ESM package via Node's native ESM support.
 */
'use strict';

const grammar = require('../node_modules/@ursamu/mushcode/parser/mux-softcode.js');

function parse(text, startRule = 'Start') {
  return grammar.parse(text, { startRule });
}

function print(ast, opts) {
  return compactNode(ast);
}

function compactNode(node) {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'UserCommand':
      return node.parts.map(compactNode).join('');

    case 'CommandList':
      return node.commands.map(compactNode).join(';');

    case 'DollarPattern':
      return compactPattern(node.pattern) + ':' + compactNode(node.action);

    case 'ListenPattern':
      return '^' + node.pattern.parts.map(compactInline).join('') +
             ':' + compactNode(node.action);

    case 'Pattern':
      return '$' + node.parts.map(compactInline).join('');

    case 'PatternAlts': {
      const pats = node.patterns.map(p =>
        p.parts.map(compactInline).join('')
      );
      return '$' + pats.join(';');
    }

    case 'Wildcard':
      return node.wildcard;

    case 'AtCommand': {
      const sw  = node.switches.map(s => '/' + s).join('');
      const obj = node.object ? ' ' + compactNode(node.object) : '';
      const val = node.value  ? '=' + compactNode(node.value)  : '';
      return '@' + node.name + sw + obj + val;
    }

    case 'AttributeSet':
      return '&' + node.attribute + ' ' +
             compactNode(node.object) + '=' + compactNode(node.value);

    case 'FunctionCall': {
      if (node.args.length === 0) return node.name + '()';
      return node.name + '(' + node.args.map(compactNode).join(',') + ')';
    }

    case 'Arg':
      return node.parts.map(compactNode).join('');

    case 'EvalBlock':
      return '[' + node.parts.map(compactNode).join('') + ']';

    case 'BracedString':
      return '{' + node.parts.map(compactNode).join('') + '}';

    case 'Text':
      return node.parts.map(compactNode).join('');

    case 'Literal':
      return node.value;

    case 'Substitution':
      return '%' + node.code;

    case 'SpecialVar':
      // code already includes the leading % for special variables
      return node.code;

    case 'Escape':
      return '\\' + node.char;

    default:
      return '';
  }
}

function compactInline(node) {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'Literal':     return node.value;
    case 'Substitution': return '%' + node.code;
    case 'SpecialVar':  return node.code;
    case 'Escape':      return '\\' + node.char;
    case 'Wildcard':    return node.wildcard;
    default:            return compactNode(node);
  }
}

function compactPattern(patNode) {
  if (!patNode || typeof patNode !== 'object') return '';
  if (patNode.type === 'Pattern') {
    return '$' + patNode.parts.map(compactInline).join('');
  }
  if (patNode.type === 'PatternAlts') {
    const pats = patNode.patterns.map(p => p.parts.map(compactInline).join(''));
    return '$' + pats.join(';');
  }
  return compactNode(patNode);
}

module.exports = { parse, print };
