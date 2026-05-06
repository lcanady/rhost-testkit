/**
 * Pueblo markup → semantic HTML converter
 *
 * Converts the mixed stream that RhostMUSH emits after a PUEBLOCLIENT
 * handshake (raw HTML tags + plain text + ANSI) into clean, safe,
 * semantic HTML.  Pure TypeScript — no DOMParser, works in Node.js.
 *
 * Reference: http://www.legacymud.com/pueblo/pueblo_ext.html
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for `convertPueblo` (reserved for future extension). */
export interface PuebloConvertOptions {
    [key: string]: unknown;
}

/**
 * Parsed representation of a Pueblo client handshake.
 * @deprecated parsePuebloHandshake now returns boolean — kept for compat.
 */
export interface PuebloHandshake {
    version: string;
    supportsXchCmd: boolean;
    extra: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUEBLOCLIENT_HANDSHAKE = 'PUEBLOCLIENT 1.0.1\r\n';

/** Tags whose entire subtree (open + content + close) must be stripped. */
const BLOCKED_TAGS = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form',
    'input', 'button', 'textarea', 'select', 'meta', 'link',
    'base', 'noscript', 'template', 'slot', 'applet',
]);

/** Tags that are allowed through (after attribute sanitization). */
const ALLOWED_TAGS = new Set([
    'a', 'b', 'i', 'u', 's', 'strong', 'em', 'small', 'big',
    'font', 'span', 'div', 'p', 'br', 'hr', 'pre', 'code', 'tt',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
    'img', 'audio', 'video', 'source',
    // Pueblo-specific / legacy
    'center', 'bgsound',
]);

/** Per-tag attribute allowlist (tag → set of allowed attribute names). */
const TAG_ATTRS: Record<string, Set<string>> = {
    a:      new Set(['href', 'name', 'target', 'title', 'data-xch-cmd']),
    img:    new Set(['src', 'alt', 'width', 'height', 'title']),
    audio:  new Set(['src', 'controls', 'loop', 'autoplay', 'preload']),
    video:  new Set(['src', 'controls', 'loop', 'width', 'height', 'poster']),
    source: new Set(['src', 'type']),
    font:   new Set(['color', 'size', 'face']),
    table:  new Set(['border', 'cellpadding', 'cellspacing', 'width']),
    td:     new Set(['colspan', 'rowspan', 'align', 'valign', 'width']),
    th:     new Set(['colspan', 'rowspan', 'align', 'valign', 'width']),
    div:    new Set(['style', 'class', 'id']),
    span:   new Set(['style', 'class', 'id']),
    p:      new Set(['align']),
    hr:     new Set(['width', 'size', 'noshade']),
    b:      new Set(), i: new Set(), u: new Set(), s: new Set(),
    strong: new Set(), em: new Set(), small: new Set(), big: new Set(),
    pre:    new Set(), code: new Set(), tt: new Set(),
    br:     new Set(),
    ul: new Set(), ol: new Set(), li: new Set(),
    h1: new Set(), h2: new Set(), h3: new Set(),
    h4: new Set(), h5: new Set(), h6: new Set(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttrValue(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isDangerousHref(value: string): boolean {
    const v = value.trim().toLowerCase().replace(/[\t\n\r ]/g, '');
    return v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:');
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface OpenToken  { type: 'open';  tag: string; attrs: Map<string, string>; selfClose: boolean }
interface CloseToken { type: 'close'; tag: string }
interface TextToken  { type: 'text';  value: string }
type Token = OpenToken | CloseToken | TextToken;

function parseAttrs(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
        const name = m[1].toLowerCase();
        const value = m[2] ?? m[3] ?? m[4] ?? '';
        map.set(name, value);
    }
    return map;
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        if (input[i] !== '<') {
            const end = input.indexOf('<', i);
            const text = end === -1 ? input.slice(i) : input.slice(i, end);
            tokens.push({ type: 'text', value: text });
            i = end === -1 ? input.length : end;
            continue;
        }

        const closeAngle = input.indexOf('>', i);
        if (closeAngle === -1) {
            tokens.push({ type: 'text', value: input.slice(i) });
            break;
        }

        const tagContent = input.slice(i + 1, closeAngle);

        if (tagContent.startsWith('/')) {
            const tagName = tagContent.slice(1).trim().toLowerCase().split(/[\s/]/)[0];
            // Only treat as close tag if it looks like a real tag name
            if (/^[a-z][a-z0-9]*$/.test(tagName)) {
                tokens.push({ type: 'close', tag: tagName });
                i = closeAngle + 1;
                continue;
            }
            // Not a real close tag — emit as text
            tokens.push({ type: 'text', value: input.slice(i, closeAngle + 1) });
            i = closeAngle + 1;
            continue;
        }

        if (tagContent.startsWith('!') || tagContent.startsWith('?')) {
            i = closeAngle + 1;
            continue;
        }

        const selfClose = tagContent.endsWith('/');
        const inner = selfClose ? tagContent.slice(0, -1) : tagContent;
        const spaceIdx = inner.search(/\s/);
        const tag = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).toLowerCase();

        // Not a valid tag name — emit entire bracket-to-bracket span as text
        if (!/^[a-z][a-z0-9]*$/.test(tag)) {
            tokens.push({ type: 'text', value: input.slice(i, closeAngle + 1) });
            i = closeAngle + 1;
            continue;
        }
        const attrRaw = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);
        const attrs = parseAttrs(attrRaw);

        tokens.push({ type: 'open', tag, attrs, selfClose });
        i = closeAngle + 1;
    }

    return tokens;
}

// ---------------------------------------------------------------------------
// Sanitizer helpers
// ---------------------------------------------------------------------------

function sanitizeOpenTag(tag: string, attrs: Map<string, string>, selfClose: boolean): string {
    const allowedAttrs = TAG_ATTRS[tag] ?? new Set<string>();
    const parts: string[] = [tag];

    for (const [name, value] of attrs) {
        if (/^on/i.test(name)) continue;
        if (!allowedAttrs.has(name)) continue;
        if (name === 'href' && isDangerousHref(value)) continue;

        // Boolean attributes (controls, loop, etc.)
        if (value === '') {
            parts.push(name);
        } else {
            parts.push(`${name}="${escapeAttrValue(value)}"`);
        }
    }

    const close = selfClose ? ' />' : '>';
    return '<' + parts.join(' ') + close;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

/**
 * Convert a Pueblo-enhanced mixed stream into clean, safe semantic HTML.
 *
 * @param input Raw string received from a Pueblo-enabled RhostMUSH server.
 * @returns     Sanitized HTML string.
 */
export function convertPueblo(input: string): string {
    const tokens = tokenize(input);
    const out: string[] = [];

    // Track depth inside blocked subtrees (e.g. <script>...</script>)
    const blockedStack: string[] = [];

    for (const token of tokens) {
        if (token.type === 'text') {
            if (blockedStack.length > 0) continue;
            out.push(escapeHtml(token.value));
            continue;
        }

        if (token.type === 'close') {
            const { tag } = token;

            if (blockedStack.length > 0) {
                if (blockedStack[blockedStack.length - 1] === tag) blockedStack.pop();
                continue;
            }

            if (tag === 'center') { out.push('</div>'); continue; }
            if (tag === 'bgsound') continue;
            if (ALLOWED_TAGS.has(tag)) out.push(`</${tag}>`);
            continue;
        }

        // token.type === 'open'
        const { tag, attrs, selfClose } = token;

        if (BLOCKED_TAGS.has(tag)) {
            if (!selfClose) blockedStack.push(tag);
            continue;
        }

        if (!ALLOWED_TAGS.has(tag)) continue;

        // ---- Special transformations ----

        // <center> → <div style="text-align:center">
        if (tag === 'center') {
            out.push('<div style="text-align:center">');
            continue;
        }

        // <bgsound src="..."> → <audio src="..." controls loop>
        if (tag === 'bgsound') {
            const src = attrs.get('src') ?? '';
            out.push(`<audio src="${escapeAttrValue(src)}" controls loop>`);
            continue;
        }

        // <audio ...> — ensure controls is present
        if (tag === 'audio') {
            if (!attrs.has('controls')) attrs.set('controls', '');
            out.push(sanitizeOpenTag(tag, attrs, selfClose));
            continue;
        }

        // <a xch_cmd="..."> — move xch_cmd to data-xch-cmd; set href="#" if none
        if (tag === 'a') {
            const xchCmd = attrs.get('xch_cmd');
            if (xchCmd !== undefined) {
                attrs.delete('xch_cmd');
                attrs.set('data-xch-cmd', xchCmd);
                if (!attrs.has('href')) attrs.set('href', '#');
            }
            out.push(sanitizeOpenTag(tag, attrs, selfClose));
            continue;
        }

        out.push(sanitizeOpenTag(tag, attrs, selfClose));
    }

    return out.join('');
}

// ---------------------------------------------------------------------------
// Handshake helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the input line begins with the PUEBLOCLIENT keyword,
 * indicating this is a Pueblo client handshake.
 */
export function parsePuebloHandshake(input: string): boolean {
    return input.trimStart().toUpperCase().startsWith('PUEBLOCLIENT');
}

/**
 * Returns the canonical Pueblo client handshake string that should be sent
 * to a Pueblo-enabled RhostMUSH server immediately after connecting.
 */
export function generatePuebloHandshake(): string {
    return PUEBLOCLIENT_HANDSHAKE;
}
