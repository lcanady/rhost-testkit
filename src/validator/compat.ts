// ---------------------------------------------------------------------------
// Dialect compatibility report
//
// Walks the AST and reports which functions are restricted to specific
// platforms (Rhost-only, Penn+Rhost, etc.) vs. universally available.
// ---------------------------------------------------------------------------

import { ASTNode, FunctionCallNode } from './types';
import { BUILTIN_FUNCTIONS, Platform } from './builtins';

export interface CompatibilityEntry {
    name: string;
    /** Platforms that support this function. */
    platforms: Platform[];
}

export interface CompatibilityReport {
    /** Functions that are not available on all platforms. */
    restricted: CompatibilityEntry[];
    /** true if every known function in the expression is universally portable. */
    portable: boolean;
}

/**
 * Walk a parsed AST and collect any platform-restricted function calls.
 * Called internally by `compatibilityReport` in the validator index.
 */
export function compatibilityCheck(nodes: ASTNode[]): CompatibilityReport {
    const seen = new Map<string, Platform[]>();
    walkNodes(nodes, seen);

    const restricted: CompatibilityEntry[] = Array.from(seen.entries()).map(
        ([name, platforms]) => ({ name, platforms }),
    );

    return {
        restricted,
        portable: restricted.length === 0,
    };
}

// ---------------------------------------------------------------------------
// Internal walkers
// ---------------------------------------------------------------------------

function walkNodes(nodes: ASTNode[], seen: Map<string, Platform[]>): void {
    for (const node of nodes) {
        walkNode(node, seen);
    }
}

function walkNode(node: ASTNode, seen: Map<string, Platform[]>): void {
    switch (node.type) {
        case 'FunctionCall':
            checkFunction(node, seen);
            break;
        case 'BracketEval':
            walkNodes(node.nodes, seen);
            break;
        default:
            break;
    }
}

function checkFunction(node: FunctionCallNode, seen: Map<string, Platform[]>): void {
    const key = node.name.toLowerCase();
    const sig = BUILTIN_FUNCTIONS.get(key);

    if (sig?.platforms && sig.platforms.length > 0) {
        // Deduplicate — only record each restricted function once
        if (!seen.has(key)) {
            seen.set(key, sig.platforms);
        }
    }

    // Recurse into arguments
    for (const arg of node.args) {
        walkNodes(arg, seen);
    }
}
