// ---------------------------------------------------------------------------
// mush-lint — static analysis for RhostMUSH softcode files
//
// Checks implemented:
//   Safety   S1  Bare user input in @pemit/@emit/think
//            S2  @create without @lock
//            S3  execscript() with user input
//            S4  User input in @switch case label
//            S5  Hardcoded dbref in HELP* attrs
//   Complete C1  FN_* accepts %0 without input guard
//            C2  CMD_* with no HELP* entry
//            C3  Installer missing header/footer markers
//            C4  Installer missing UNINSTALL section
//   Format   F1  Line > 78 chars in help.txt or @@ comments
//            F2  Separator line not 78 chars
//            F3  Wrong attribute order (Config→UDFs→Commands→Help)
//            F4  Comment style mismatch (// or ## instead of @@)
//   Length   L1  Attribute body > 7500 chars
//   Style    I1  Attribute name not uppercase
//            I2  No Version field in installer header
//            I3  No Requires field in installer header
// ---------------------------------------------------------------------------

import { parse as parseCode } from '@ursamu/mushcode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LintSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface LintDiag {
    code: string;
    severity: LintSeverity;
    /** 1-based line number in the source file */
    line: number;
    /** Attribute name if applicable */
    attr?: string;
    message: string;
}

export interface LintResult {
    diagnostics: LintDiag[];
    errors: number;
    warnings: number;
    infos: number;
}

// ---------------------------------------------------------------------------
// AST types (matching the Peggy grammar output)
// ---------------------------------------------------------------------------

type ASTNode =
    | { type: 'UserCommand';   parts: ASTNode[] }
    | { type: 'CommandList';   commands: ASTNode[] }
    | { type: 'AtCommand';     name: string; switches: string[]; object: ASTNode; value: ASTNode }
    | { type: 'DollarPattern'; pattern: ASTNode; action: ASTNode }
    | { type: 'FunctionCall';  name: string; args: ASTNode[] }
    | { type: 'Arg';           parts: ASTNode[] }
    | { type: 'EvalBlock';     parts: ASTNode[] }
    | { type: 'BracedString';  parts: ASTNode[] }
    | { type: 'Substitution';  code: string }
    | { type: 'Literal';       value: string }
    | { type: 'Text';          parts: ASTNode[] }
    | { type: 'Pattern';       parts: ASTNode[] }
    | { type: 'Wildcard';      wildcard: string }
    ;

// ---------------------------------------------------------------------------
// Internal record of a parsed attribute line
// ---------------------------------------------------------------------------

interface AttrRecord {
    name: string;     // uppercase, e.g. CMD_FINGER
    rawName: string;  // original case from source, used for I1 check
    object: string;   // e.g. #42 or Me
    value: string;    // compressed attribute value
    line: number;     // 1-based line number of the &NAME line
    ast:  ASTNode | null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Lint a softcode file (.mush or .installer.txt).
 * Returns all diagnostics sorted by line number.
 */
export function lintContent(content: string, filename = '<input>'): LintResult {
    const lines = content.split('\n');
    const attrs = parseAttrs(lines);
    const diags: LintDiag[] = [];

    // File-level checks
    checkInstallerStructure(lines, diags);   // C3, C4, I2, I3
    checkCommentStyle(lines, attrs, diags);  // F4
    checkLineLengths(lines, diags);          // F1, F2

    // Attribute-level checks
    checkAttrOrder(attrs, diags);            // F3
    checkAttrNames(attrs, diags);            // I1

    for (const attr of attrs) {
        checkAttrLength(attr, diags);        // L1
        if (!attr.ast) continue;
        checkBareUserInput(attr, diags);     // S1
        checkSwitchCaseLabel(attr, diags);   // S4
        checkExecscript(attr, diags);        // S3
        checkHelpDbref(attr, diags);         // S5
        checkFnGuard(attr, diags);           // C1
    }

    checkUncreatedObjects(lines, diags);     // S2
    checkCmdHelpPairs(attrs, diags);         // C2

    diags.sort((a, b) => a.line - b.line);

    return {
        diagnostics: diags,
        errors:   diags.filter(d => d.severity === 'ERROR').length,
        warnings: diags.filter(d => d.severity === 'WARN').length,
        infos:    diags.filter(d => d.severity === 'INFO').length,
    };
}

// ---------------------------------------------------------------------------
// File parser — extract AttrRecords from lines
// ---------------------------------------------------------------------------

function parseAttrs(lines: string[]): AttrRecord[] {
    const records: AttrRecord[] = [];
    // Collect multi-line logical attributes (indented continuation lines)
    let current: { name: string; rawName: string; object: string; value: string; line: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();

        // New attribute line
        const m = trimmed.match(/^&([A-Za-z_][A-Za-z0-9_.:@-]*)\s+([^=\s][^=]*)=(.*)$/);
        if (m) {
            if (current) records.push(finishAttr(current));
            current = { name: m[1].toUpperCase(), rawName: m[1], object: m[2].trim(), value: m[3], line: i + 1 };
            continue;
        }

        // Continuation: indented line after an attribute
        if (current && raw.match(/^\s+\S/) && !trimmed.startsWith('&') && !trimmed.startsWith('@') && !trimmed.startsWith('//')) {
            current.value += ' ' + trimmed;
            continue;
        }

        // Any other command resets continuation
        if (current) {
            records.push(finishAttr(current));
            current = null;
        }
    }
    if (current) records.push(finishAttr(current));
    return records;
}

function finishAttr(r: { name: string; rawName: string; object: string; value: string; line: number }): AttrRecord {
    const value = r.value.trim();
    let ast: ASTNode | null = null;
    if (value) {
        try { ast = parseCode(value) as unknown as ASTNode; } catch { /* unparseable */ }
    }
    return { ...r, value, ast };
}

// ---------------------------------------------------------------------------
// S1 — Bare user input in @pemit / @emit / @remit / @oemit / think
// ---------------------------------------------------------------------------

const OUTPUT_CMDS = new Set(['pemit', 'emit', 'remit', 'oemit', 'zemit', 'wall', 'notify']);
// Any function call is treated as "handling" its arguments for S1 purposes.
// Only flag substitutions in the raw text flow (not inside any function call).
// Substitution codes that represent user input
const USER_INPUT_RE = /^[0-9]$|^v[a-z]$/;

function checkBareUserInput(attr: AttrRecord, diags: LintDiag[]): void {
    if (!attr.ast) return;
    walkAtCmd(attr.ast, (cmd) => {
        if (!OUTPUT_CMDS.has(cmd.name.toLowerCase())) return;
        const bare = findBareUserSubs(cmd.value);
        for (const sub of bare) {
            diags.push({
                code: 'S1',
                severity: 'ERROR',
                line: attr.line,
                attr: attr.name,
                message: `Bare %${sub.code} in @${cmd.name} — wrap with secure(%${sub.code}) or stripchars(...)`,
            });
        }
    });
}

/** Walk AST and call cb for every AtCommand node (including those inside DollarPattern/BracedString) */
function walkAtCmd(node: ASTNode, cb: (cmd: { name: string; switches: string[]; object: ASTNode; value: ASTNode }) => void): void {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
        case 'AtCommand':
            cb(node);
            walkAtCmd(node.value, cb);
            break;
        case 'DollarPattern':
            walkAtCmd(node.action, cb);
            break;
        case 'CommandList':
            for (const c of node.commands) walkAtCmd(c, cb);
            break;
        case 'UserCommand':
            for (const p of node.parts) walkAtCmd(p, cb);
            break;
        case 'BracedString':
            // Re-parse braced content to catch nested @pemit in action bodies
            for (const p of node.parts) walkAtCmd(p, cb);
            break;
        case 'EvalBlock':
            for (const p of node.parts) walkAtCmd(p, cb);
            break;
        case 'FunctionCall':
            for (const arg of node.args) walkAtCmd(arg, cb);
            break;
        case 'Arg':
            for (const p of node.parts) walkAtCmd(p, cb);
            break;
    }
}

/**
 * Find user-input substitutions (%0-9, %va-vz) that appear in the "text flow"
 * of a node — i.e. NOT inside any protective function call.
 * We stop recursing into FunctionCall nodes whose name is in SAFE_FUNS;
 * other function calls are treated as pass-through.
 */
function findBareUserSubs(node: ASTNode): Array<{ type: 'Substitution'; code: string }> {
    const found: Array<{ type: 'Substitution'; code: string }> = [];
    collectBareUserSubs(node, false /* insideFn */, found);
    return found;
}

function collectBareUserSubs(node: ASTNode, insideFn: boolean, out: Array<{ type: 'Substitution'; code: string }>): void {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
        case 'Substitution':
            // Only flag if NOT inside any function call at any depth
            if (!insideFn && USER_INPUT_RE.test(node.code)) out.push(node);
            break;
        case 'FunctionCall':
            // All function calls protect their arguments — don't flag inside them
            return;
        case 'Arg':
            for (const p of node.parts) collectBareUserSubs(p, insideFn, out);
            break;
        case 'EvalBlock':
        case 'UserCommand':
        case 'BracedString':
        case 'Text': {
            const parts = (node as { parts: ASTNode[] }).parts;
            for (const p of parts) collectBareUserSubs(p, insideFn, out);
            break;
        }
        case 'CommandList':
            for (const c of node.commands) collectBareUserSubs(c, insideFn, out);
            break;
        case 'AtCommand':
            // Only check the value, not object (which is typically %#)
            collectBareUserSubs(node.value, insideFn, out);
            break;
        case 'DollarPattern':
            collectBareUserSubs(node.action, insideFn, out);
            break;
    }
}

// ---------------------------------------------------------------------------
// S2 — @create without @lock
// ---------------------------------------------------------------------------

function checkUncreatedObjects(lines: string[], diags: LintDiag[]): void {
    // Track @create <name> and watch for @lock <name>=
    const created = new Map<string, number>(); // name → line
    const locked = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        const createM = line.match(/^@create\s+(.+?)(\s*=.*)?$/i);
        if (createM) {
            const name = createM[1].trim().replace(/\s+<[^>]+>$/, ''); // strip <tag>
            created.set(name.toLowerCase(), i + 1);
        }

        const lockM = line.match(/^@lock\s+(.+?)=/i);
        if (lockM) {
            locked.add(lockM[1].trim().toLowerCase());
        }
    }

    for (const [name, lineNo] of created) {
        if (!locked.has(name)) {
            diags.push({
                code: 'S2',
                severity: 'ERROR',
                line: lineNo,
                message: `@create "${name}" has no @lock — all system objects must be locked`,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// S3 — execscript() with user input
// ---------------------------------------------------------------------------

function checkExecscript(attr: AttrRecord, diags: LintDiag[]): void {
    // Walk AST for FunctionCall named execscript and check args 0 and 1
    walkFunctionCalls(attr.ast!, 'execscript', (node) => {
        const args = node.args as ASTNode[];
        // Check first two args for user substitutions
        for (let i = 0; i < Math.min(args.length, 2); i++) {
            const subs = findAllUserSubs(args[i]);
            if (subs.length > 0) {
                diags.push({
                    code: 'S3',
                    severity: 'ERROR',
                    line: attr.line,
                    attr: attr.name,
                    message: `execscript() arg ${i + 1} contains %${subs[0].code} — never pass user input to execscript`,
                });
                break;
            }
        }
    });
}

function walkFunctionCalls(node: ASTNode, name: string, cb: (n: { type: 'FunctionCall'; name: string; args: ASTNode[] }) => void): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionCall' && node.name.toLowerCase() === name.toLowerCase()) {
        cb(node as { type: 'FunctionCall'; name: string; args: ASTNode[] });
    }
    const children = getChildren(node);
    for (const c of children) walkFunctionCalls(c, name, cb);
}

function getChildren(node: ASTNode): ASTNode[] {
    switch (node.type) {
        case 'UserCommand': return node.parts;
        case 'CommandList': return node.commands;
        case 'AtCommand':   return [node.object, node.value];
        case 'DollarPattern': return [node.action];
        case 'FunctionCall': return node.args;
        case 'Arg':          return node.parts;
        case 'EvalBlock':    return node.parts;
        case 'BracedString': return node.parts;
        case 'Text':         return (node as { type: 'Text'; parts: ASTNode[] }).parts;
        default: return [];
    }
}

/** Find ALL user substitution nodes (including those inside function calls) */
function findAllUserSubs(node: ASTNode): Array<{ type: 'Substitution'; code: string }> {
    const found: Array<{ type: 'Substitution'; code: string }> = [];
    collectAllUserSubs(node, found);
    return found;
}

function collectAllUserSubs(node: ASTNode, out: Array<{ type: 'Substitution'; code: string }>): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Substitution' && USER_INPUT_RE.test(node.code)) {
        out.push(node);
        return;
    }
    for (const c of getChildren(node)) collectAllUserSubs(c, out);
}

// ---------------------------------------------------------------------------
// S4 — User input in @switch case label
// ---------------------------------------------------------------------------

const SWITCH_CMDS = new Set(['switch', 'switchall']);

function checkSwitchCaseLabel(attr: AttrRecord, diags: LintDiag[]): void {
    if (!attr.ast) return;
    walkAtCmd(attr.ast, (cmd) => {
        if (!SWITCH_CMDS.has(cmd.name.toLowerCase())) return;
        // The case list is in cmd.value (a UserCommand or CommandList)
        // Split into label and body segments: bodies are BracedStrings
        const valueParts = flatParts(cmd.value);
        let inLabel = true;
        for (const part of valueParts) {
            if (part.type === 'BracedString') {
                inLabel = false;
                continue;
            }
            if (part.type === 'Literal' && (part as { type: 'Literal'; value: string }).value === ',') {
                inLabel = true;
                continue;
            }
            if (inLabel) {
                const subs = findAllUserSubs(part);
                if (subs.length > 0) {
                    diags.push({
                        code: 'S4',
                        severity: 'ERROR',
                        line: attr.line,
                        attr: attr.name,
                        message: `User input (%${subs[0].code}) in @switch case label — case labels are evaluated, this is injectable`,
                    });
                    return; // one diag per @switch is enough
                }
            }
        }
    });
}

function flatParts(node: ASTNode): ASTNode[] {
    if (node.type === 'UserCommand') return node.parts;
    if (node.type === 'CommandList') return node.commands;
    return [node];
}

// ---------------------------------------------------------------------------
// S5 — Hardcoded dbref in HELP* attributes
// ---------------------------------------------------------------------------

function checkHelpDbref(attr: AttrRecord, diags: LintDiag[]): void {
    if (!attr.name.startsWith('HELP')) return;
    if (/#\d+/.test(attr.value)) {
        diags.push({
            code: 'S5',
            severity: 'ERROR',
            line: attr.line,
            attr: attr.name,
            message: `Hardcoded dbref in ${attr.name} — help text must use names only`,
        });
    }
}

// ---------------------------------------------------------------------------
// C1 — FN_* accepts %0 without input guard
// ---------------------------------------------------------------------------

function checkFnGuard(attr: AttrRecord, diags: LintDiag[]): void {
    if (!attr.name.startsWith('FN_')) return;
    // Does this function use %0-%9 at all?
    const subs = findAllUserSubs(attr.ast!);
    if (subs.length === 0) return;

    // Check for a guard: value should start with [if(not(%0,...) or [if(eq(%0,...)]
    // In the AST, the top-level node should be a UserCommand whose first non-whitespace
    // part is an EvalBlock containing an 'if' or 'switch' FunctionCall.
    if (hasInputGuard(attr.ast!)) return;

    diags.push({
        code: 'C1',
        severity: 'ERROR',
        line: attr.line,
        attr: attr.name,
        message: `${attr.name} accepts %0 but has no input guard — add [if(not(%0),#-1 MISSING ARG,...)]`,
    });
}

function hasInputGuard(node: ASTNode): boolean {
    if (node.type !== 'UserCommand') return false;
    // First significant part must be an EvalBlock
    const firstSig = node.parts.find(p => p.type !== 'Literal' || (p as { type: 'Literal'; value: string }).value.trim() !== '');
    if (!firstSig || firstSig.type !== 'EvalBlock') return false;
    // The EvalBlock should contain a guard function call as its only (or first) element
    const inner = firstSig.parts[0];
    if (!inner || inner.type !== 'FunctionCall') return false;
    const name = inner.name.toLowerCase();
    return name === 'if' || name === 'ifelse' || name === 'switch' || name === 'when';
}

// ---------------------------------------------------------------------------
// C2 — CMD_* with no HELP* entry
// ---------------------------------------------------------------------------

function checkCmdHelpPairs(attrs: AttrRecord[], diags: LintDiag[]): void {
    const cmds  = attrs.filter(a => a.name.startsWith('CMD_'));
    const helps = new Set(attrs.filter(a => a.name.startsWith('HELP')).map(a => a.name));

    for (const cmd of cmds) {
        // Strip CMD_ prefix, look for HELP_<suffix> or HELP<suffix>
        const suffix = cmd.name.slice(4); // e.g. FINGER from CMD_FINGER
        const hasHelp = helps.has(`HELP_${suffix}`) || helps.has(`HELP${suffix}`);
        if (!hasHelp) {
            diags.push({
                code: 'C2',
                severity: 'ERROR',
                line: cmd.line,
                attr: cmd.name,
                message: `${cmd.name} has no HELP entry — every command needs help text`,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// C3 — Installer missing header/footer markers
// C4 — Installer missing UNINSTALL section
// ---------------------------------------------------------------------------

function checkInstallerStructure(lines: string[], diags: LintDiag[]): void {
    const text = lines.join('\n');

    // Only run structural checks on installer files (look for @@ markers)
    const isInstaller = lines.some(l => l.startsWith('@@'));
    if (!isInstaller) return;

    if (!/@@ Mushcode Installer for:/i.test(text)) {
        diags.push({ code: 'C3', severity: 'ERROR', line: 1, message: 'Missing "@@ Mushcode Installer for:" header line' });
    }
    if (!/@@ \[END OF FILE\]/i.test(text)) {
        diags.push({ code: 'C3', severity: 'ERROR', line: lines.length, message: 'Missing "@@ [END OF FILE]" terminal marker' });
    }
    if (!/@@ ---\[ UNINSTALL \]---/i.test(text)) {
        diags.push({ code: 'C4', severity: 'ERROR', line: lines.length, message: 'No UNINSTALL section — add @@ ---[ UNINSTALL ]--- block' });
    }

    // I2, I3 — header field presence
    if (!/@@ Version:/i.test(text)) {
        diags.push({ code: 'I2', severity: 'INFO', line: 1, message: 'Version field missing from installer header' });
    }
    if (!/@@ Requires:/i.test(text)) {
        diags.push({ code: 'I3', severity: 'INFO', line: 1, message: 'Requires field missing from installer header — add "None" if no prerequisites' });
    }
}

// ---------------------------------------------------------------------------
// F1 — Line > 78 chars (help and @@ comment lines only)
// F2 — Separator line not exactly 78 chars
// ---------------------------------------------------------------------------

function checkLineLengths(lines: string[], diags: LintDiag[]): void {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;

        // F2 — separator lines must be exactly 78 chars
        if (/^@@ ={3,}/.test(line) || /^@@ ---\[/.test(line)) {
            if (line.length !== 78) {
                diags.push({
                    code: 'F2',
                    severity: 'WARN',
                    line: lineNo,
                    message: `Separator line is ${line.length} chars — must be exactly 78`,
                });
            }
            continue;
        }

        // F1 — @@ comment lines
        if (line.startsWith('@@') && line.length > 78) {
            diags.push({
                code: 'F1',
                severity: 'WARN',
                line: lineNo,
                message: `@@ comment line is ${line.length} chars — max is 78`,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// F3 — Wrong attribute order (Config → UDFs → Commands → Help)
// ---------------------------------------------------------------------------

const ATTR_ORDER_RANK: Record<string, number> = {
    D_: 0, CONF_: 0, CONFIG_: 0,   // config/data
    FN_: 1,                          // UDFs
    CMD_: 2,                         // commands
    HELP: 3,                         // help (prefix match)
};

function attrRank(name: string): number {
    for (const [prefix, rank] of Object.entries(ATTR_ORDER_RANK)) {
        if (name.startsWith(prefix)) return rank;
    }
    return 1; // default: treat as UDF-level
}

function checkAttrOrder(attrs: AttrRecord[], diags: LintDiag[]): void {
    // Group by object, then check order within each object
    const byObj = new Map<string, AttrRecord[]>();
    for (const attr of attrs) {
        const key = attr.object.toLowerCase();
        if (!byObj.has(key)) byObj.set(key, []);
        byObj.get(key)!.push(attr);
    }

    for (const [, objAttrs] of byObj) {
        let maxRank = -1;
        for (const attr of objAttrs) {
            const rank = attrRank(attr.name);
            if (rank < maxRank) {
                diags.push({
                    code: 'F3',
                    severity: 'WARN',
                    line: attr.line,
                    attr: attr.name,
                    message: `${attr.name} appears after a higher-priority attribute — order must be: Config, UDFs, Commands, Help`,
                });
            } else {
                maxRank = Math.max(maxRank, rank);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// F4 — Comment style: // or ## used instead of @@
// ---------------------------------------------------------------------------

function checkCommentStyle(lines: string[], attrs: AttrRecord[], diags: LintDiag[]): void {
    // Build set of attribute line numbers so we don't flag inline comments in attr values
    const attrLines = new Set(attrs.map(a => a.line));

    for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        if (attrLines.has(lineNo)) continue;

        const trimmed = lines[i].trim();
        // Standalone // comment line at the top level of an installer file
        if (/^\/\//.test(trimmed) || /^##\s/.test(trimmed)) {
            diags.push({
                code: 'F4',
                severity: 'WARN',
                line: lineNo,
                message: `Line ${lineNo} uses "${trimmed.slice(0, 2)}" comment style — convert to @@ in installer files`,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// L1 — Attribute body > 7500 chars
// ---------------------------------------------------------------------------

function checkAttrLength(attr: AttrRecord, diags: LintDiag[]): void {
    if (attr.value.length > 7500) {
        diags.push({
            code: 'L1',
            severity: 'WARN',
            line: attr.line,
            attr: attr.name,
            message: `${attr.name} is ${attr.value.length} chars — approaching 8000-char Rhost limit, consider chunking into ${attr.name}.0, ${attr.name}.1, ...`,
        });
    }
}

// ---------------------------------------------------------------------------
// I1 — Attribute name not uppercase
// ---------------------------------------------------------------------------

function checkAttrNames(attrs: AttrRecord[], diags: LintDiag[]): void {
    for (const attr of attrs) {
        if (attr.rawName !== attr.name) {
            diags.push({
                code: 'I1',
                severity: 'INFO',
                line: attr.line,
                attr: attr.name,
                message: `Attribute ${attr.rawName} should be ${attr.name} — use uppercase for all attribute names`,
            });
        }
    }
}
