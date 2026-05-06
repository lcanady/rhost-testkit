# Pueblo protocol

## Background

[Pueblo](http://www.legacymud.com/pueblo/pueblo_ext.html) is an HTML-embedding extension for MUD servers, developed in the 1990s. A Pueblo-enabled server can include real HTML tags in its output: clickable links, images, tables, formatted text, and inline audio. Clients that understand Pueblo render the HTML; clients that don't see it as plain text.

RhostMUSH has Pueblo support compiled in unconditionally — there is no build flag to disable it. Any RhostMUSH server will respond to a Pueblo handshake.

---

## Handshake flow

Pueblo negotiation is a two-line exchange that happens immediately after the TCP or WebSocket connection is established, before login.

```
Client → Server:  PUEBLOCLIENT 1.0.1\r\n
Server → Client:  (any line containing "PUEBLOCLIENT" in the greeting)
```

Once the server acknowledges, it begins embedding HTML in its output.

### API

```ts
import {
    generatePuebloHandshake,
    parsePuebloHandshake,
} from '@rhost/testkit';
```

**`generatePuebloHandshake(): string`**

Returns the canonical `PUEBLOCLIENT 1.0.1\r\n` string. Send this as the very first thing after connecting, before any `connect` command.

**`parsePuebloHandshake(line: string): boolean`**

Returns `true` if the given line begins with `PUEBLOCLIENT` (case-insensitive), indicating the server has acknowledged Pueblo mode.

```ts
await conn.connect();

// 1. Declare Pueblo support
conn.send(generatePuebloHandshake().trim());

// 2. Watch for server acknowledgement
let puebloActive = false;
conn.on('line', (line) => {
    if (!puebloActive && parsePuebloHandshake(line)) {
        puebloActive = true;
    }
});

// 3. Log in
conn.send('connect Wizard Nyctasia');
```

---

## convertPueblo() reference

```ts
import { convertPueblo } from '@rhost/testkit';

const safeHtml = convertPueblo(rawMushOutput);
```

`convertPueblo(input: string): string`

Takes the raw mixed stream from a Pueblo-enabled server (HTML tags + plain text + ANSI escape codes) and returns sanitized, safe HTML suitable for injection into a browser DOM.

### What it allows

| Category | Elements |
|---|---|
| Inline text | `<b>`, `<i>`, `<u>`, `<s>`, `<strong>`, `<em>`, `<small>`, `<big>`, `<tt>`, `<code>`, `<pre>` |
| Layout | `<p>`, `<br>`, `<hr>`, `<div>`, `<span>`, `<center>` (→ `<div style="text-align:center">`) |
| Headings | `<h1>` – `<h6>` |
| Lists | `<ul>`, `<ol>`, `<li>`, `<dl>`, `<dt>`, `<dd>` |
| Tables | `<table>`, `<tr>`, `<td>`, `<th>`, `<thead>`, `<tbody>`, `<tfoot>` |
| Media | `<img>`, `<audio>`, `<video>`, `<source>` |
| Links | `<a>` with `href`, `name`, `target`, `title`, `data-xch-cmd` |
| Legacy | `<font>`, `<bgsound>` (→ `<audio controls loop>`) |

### What it blocks

The following tags — and all their children — are stripped entirely:

`<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, `<textarea>`, `<select>`, `<meta>`, `<link>`, `<base>`, `<noscript>`, `<template>`, `<slot>`, `<applet>`

Additionally:

- All `on*` event attributes are removed (`onclick`, `onmouseover`, etc.)
- `javascript:`, `vbscript:`, and `data:` URIs in `href` are blocked
- Only explicitly allowlisted attributes pass through per tag

### xch_cmd behavior

Pueblo uses `<a xch_cmd="look here">` to create clickable links that send commands to the server. `convertPueblo` translates this to a `data-*` attribute safe for browser use:

```
Input:   <a xch_cmd="look here">the door</a>
Output:  <a data-xch-cmd="look here" href="#">the door</a>
```

Your browser client can then attach a click listener and send the command value back over the WebSocket:

```js
document.addEventListener('click', (e) => {
    const cmd = e.target.closest('[data-xch-cmd]')?.dataset.xchCmd;
    if (cmd) ws.send(cmd + '\r\n');
});
```

---

## Building a browser client

### Suggested architecture

```
RhostMUSH (TCP / WebSocket)
    │
    ▼
MushConnection  (src/connection.ts)
    │  raw line events
    ▼
Pueblo handshake detection  (parsePuebloHandshake)
    │
    ▼
convertPueblo()  — sanitize each line
    │
    ▼
DOM injection  — innerHTML or a virtual DOM
```

Keep `convertPueblo` outside your hot path: call it once per line, not once per character.

### Handling ANSI

`convertPueblo` passes ANSI escape sequences through as plain text — they appear as `\x1b[...m` garbage in the browser. If you need ANSI color rendering, strip or convert escape codes before or after calling `convertPueblo`. Libraries like [`ansi-to-html`](https://www.npmjs.com/package/ansi-to-html) can translate them to `<span style="color:...">` elements.

---

## Security notes

RhostMUSH is a multi-user environment where any wizard (or player with the right permissions) can embed HTML in messages. Without sanitization, this is a stored XSS vector — one user crafting a malicious `@desc` could attack every other connected browser client.

`convertPueblo` is designed with this threat model in mind:

- The allowlist is conservative: only tags with clear, bounded semantics are permitted
- Per-tag attribute allowlists prevent attribute injection
- Dangerous URI schemes (`javascript:`, `vbscript:`, `data:`) are blocked on `href`
- Event attributes (`onclick`, etc.) are stripped unconditionally
- Content inside blocked tags is discarded, not rendered as text

Do not bypass `convertPueblo` by setting `innerHTML` on raw MUSH output.

---

## Full example — Node.js client with Pueblo

```ts
import {
    MushConnection,
    generatePuebloHandshake,
    parsePuebloHandshake,
    convertPueblo,
} from '@rhost/testkit';

async function main() {
    // Connect via WebSocket (works with raw TCP too — omit useWebSocket)
    const conn = new MushConnection('localhost', 4201, {
        useWebSocket: true,
    });

    await conn.connect();

    // Send Pueblo handshake before logging in
    conn.send(generatePuebloHandshake().trim());

    let puebloActive = false;

    conn.on('line', (raw: string) => {
        if (!puebloActive && parsePuebloHandshake(raw)) {
            puebloActive = true;
            console.log('[Pueblo active]');
            return;
        }

        // Convert and render
        const html = convertPueblo(raw);
        // In a browser you'd do: outputDiv.innerHTML += html + '<br>';
        console.log(html);
    });

    // Log in
    conn.send('connect Wizard Nyctasia');

    // Run for 10 seconds then disconnect
    await new Promise((r) => setTimeout(r, 10_000));
    await conn.close();
}

main().catch(console.error);
```
