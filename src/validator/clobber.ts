// ---------------------------------------------------------------------------
// Register clobber / re-entrancy analyzer
//
// Detects `setq()` calls inside loop-body arguments (iter, parse, filter,
// map, fold, step, munge, filterfun).  Because MUSH registers (%q0–%q9) are
// scoped per queue entry, concurrent or nested invocations of the same
// attribute can silently overwrite each other's register values.
//
// Safe escape hatch: wrapping the body in `localize()` creates a fresh
// register scope, so setq() inside localize() is not flagged.
// ---------------------------------------------------------------------------

import { ASTNode, Diagnostic, FunctionCallNode } from './types';

// Functions whose body argument is evaluated once per list element.
// Value is the index of the first "body" argument (0-based).
// All arguments at index >= bodyArgIndex are treated as body.
const LOOP_FUNCTIONS = new Map<string, number>([
    ['iter',      1],   // iter(list, BODY, ...)
    ['parse',     1],   // parse(list, BODY, ...)
    ['filter',    0],   // filter(BODY/attr, list, ...)
    ['filterfun', 0],   // filterfun(BODY/attr, list, ...)
    ['map',       0],   // map(BODY/attr, list, ...)
    ['fold',      0],   // fold(BODY/attr, base, list, ...)
    ['step',      0],   // step(BODY/attr, list, ...)
    ['munge',     0],   // munge(BODY/attr, list, ...)
    ['matchall',  1],   // matchall(list, pattern, ...) — pattern is text, not code
    ['graball',   1],   // graball(list, pattern, ...)
    ['sortby',    0],   // sortby(BODY/attr, list, ...)
]);

// Functions that create a new register scope — safe for setq()
const SCOPE_WRAPPERS = new Set(['localize']);

/**
 * Walk the AST and emit W006 warnings for every `setq()` call that appears
 * inside a loop-body argument without an intervening `localize()`.
 */
export function registerClobberCheck(nodes: ASTNode[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    walkNodes(nodes, false, diagnostics);
    return diagnostics;
}

// ---------------------------------------------------------------------------
// Internal walkers
// ---------------------------------------------------------------------------

function walkNodes(nodes: ASTNode[], inLoop: boolean, out: Diagnostic[]): void {
    for (const node of nodes) {
        walkNode(node, inLoop, out);
    }
}

function walkNode(node: ASTNode, inLoop: boolean, out: Diagnostic[]): void {
    switch (node.type) {
        case 'BracketEval':
            walkNodes(node.nodes, inLoop, out);
            break;

        case 'FunctionCall':
            walkFunctionCall(node, inLoop, out);
            break;

        // RawText / Substitution — nothing to check
        default:
            break;
    }
}

function walkFunctionCall(node: FunctionCallNode, inLoop: boolean, out: Diagnostic[]): void {
    const key = node.name.toLowerCase();

    // localize() creates a new register scope — safe to setq() inside
    if (SCOPE_WRAPPERS.has(key)) {
        for (const arg of node.args) {
            walkNodes(arg, false, out); // reset inLoop to false
        }
        return;
    }

    // setq() inside a loop body is the hazard
    if (inLoop && key === 'setq') {
        out.push({
            severity: 'warning',
            code: 'W006',
            message:
                `'setq' inside a loop body risks register clobber on re-entrant calls — ` +
                `wrap the body with localize() to create a safe register scope`,
            offset: node.nameOffset,
            length: node.name.length,
        });
        // Still recurse so nested loops / deeper setqs are also caught
        for (const arg of node.args) {
            walkNodes(arg, inLoop, out);
        }
        return;
    }

    const bodyArgIndex = LOOP_FUNCTIONS.get(key);
    if (bodyArgIndex !== undefined) {
        for (let i = 0; i < node.args.length; i++) {
            // Arguments before the body start index are data (list, base value, etc.) — not loop body
            const isBodyArg = i >= bodyArgIndex;
            walkNodes(node.args[i], isBodyArg, out);
        }
        return;
    }

    // Regular function — propagate current inLoop state
    for (const arg of node.args) {
        walkNodes(arg, inLoop, out);
    }
}
