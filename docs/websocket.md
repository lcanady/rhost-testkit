# WebSocket and stunnel

## When to use WebSocket vs raw TCP

RhostMUSH supports two transport protocols.

| Situation | Use |
|---|---|
| MUD client (Mudlet, Potato, telnet) | Raw TCP — the default |
| Browser client (JavaScript `WebSocket`) | WebSocket — requires `ENABLE_WEBSOCKETS` build flag |
| Browser over HTTPS / mixed-content rules | WebSocket + stunnel for `wss://` |
| Automated tests, CI | Raw TCP — simpler, no extra dependencies |

The WebSocket port is the **same** port as the plain MUSH port (4201 by default). RhostMUSH performs the RFC 6455 upgrade handshake on incoming connections, so a single port serves both plain TCP and WebSocket clients.

---

## Compile-time requirement

WebSocket support is **not** compiled in by default. The server must be built with the `ENABLE_WEBSOCKETS` flag.

You can control this through any of:

- A `rhost.config.json` file (recommended)
- CLI flags to `rhost-server`
- Docker build args directly

Without this flag, WebSocket connections are refused at the TCP level.

---

## Client configuration

`MushConnection` accepts these options when `useWebSocket: true`:

| Option | Type | Default | Description |
|---|---|---|---|
| `useWebSocket` | `boolean` | `false` | Connect via WebSocket instead of raw TCP |
| `websocketPath` | `string` | `'/'` | WebSocket request path |
| `websocketSecure` | `boolean` | `false` | Use `wss://` instead of `ws://` |

```ts
import { MushConnection } from '@rhost/testkit';

const conn = new MushConnection('localhost', 4201, {
    useWebSocket: true,
    websocketPath: '/',
    websocketSecure: false,   // set true when connecting via stunnel
});

await conn.connect();
conn.send('connect Wizard Nyctasia');
```

---

## stunnel for wss://

Browsers block `ws://` connections from pages served over `https://` (mixed-content policy). To expose a secure `wss://` endpoint you need a TLS terminator in front of the MUSH port. The testkit ships built-in support for **stunnel** inside the container.

**When do you need stunnel?**

- Your browser client is served over HTTPS, or
- You want end-to-end encryption between the browser and the MUSH

**When do you not need stunnel?**

- Local development with `localhost` (mixed-content rules are relaxed for localhost in most browsers)
- Server-side Node.js scripts connecting via `ws://`

### How stunnel works inside the container

When stunnel is enabled, `entrypoint.sh` starts a stunnel process that:

1. Listens on the accept port (default 4203) for incoming TLS connections
2. Decrypts the traffic and forwards it to the connect port (default 4201, the plain MUSH socket)

Clients connect to the stunnel port with `wss://`; the MUSH itself never sees TLS.

If no certificate is provided, a self-signed certificate is generated automatically — fine for testing, not for production.

---

## rhost.config.json — full example

```json
{
  "scriptsDir": "./scripts",
  "mushConfig": "./mush.conf",
  "build": {
    "enableWebSockets": true,
    "enableReality": false,
    "extraCflags": ""
  },
  "stunnel": {
    "enable": true,
    "acceptPort": 4203,
    "connectPort": 4201,
    "certFile": "./certs/server.pem",
    "keyFile": "./certs/server.key"
  }
}
```

All paths in `certFile` and `keyFile` are resolved relative to the directory containing `rhost.config.json`. Paths outside the project root are rejected.

| Field | Type | Default | Description |
|---|---|---|---|
| `build.enableWebSockets` | `boolean` | `false` | Compile with RFC 6455 WebSocket support |
| `build.enableReality` | `boolean` | `false` | Compile with REALMS/Reality Levels |
| `build.extraCflags` | `string` | — | Raw CFLAGS passed to the compiler |
| `stunnel.enable` | `boolean` | `false` | Launch stunnel inside the container |
| `stunnel.acceptPort` | `number` | `4203` | Port stunnel listens on (TLS, client-facing) |
| `stunnel.connectPort` | `number` | `4201` | Port stunnel forwards to (plain MUSH) |
| `stunnel.certFile` | `string` | auto-generated | Path to PEM certificate |
| `stunnel.keyFile` | `string` | same as `certFile` | Path to PEM private key |

---

## Full working example

### 1 — Build and start the server with WebSocket + stunnel

```bash
# Using CLI flags (no config file needed)
rhost-server \
  --build-from-source \
  --project-root ./rhostmush-docker \
  --enable-websockets \
  --stunnel \
  --stunnel-port 4203 \
  --stunnel-cert ./certs/server.pem
```

Or with a config file:

```bash
# rhost.config.json is picked up automatically from cwd
rhost-server --build-from-source --project-root ./rhostmush-docker
```

On startup the console prints:

```
  WebSocket: wss://localhost:4203
  TLS port:  4203  (via stunnel)
```

### 2 — Connect a test client over wss://

```ts
import { MushConnection } from '@rhost/testkit';

const conn = new MushConnection('localhost', 4203, {
    useWebSocket: true,
    websocketSecure: true,
    websocketPath: '/',
});

await conn.connect();
conn.send('connect Wizard Nyctasia');

const greeting = await conn.lines.next(5000);
console.log(greeting);

await conn.close();
```

### 3 — Connect a browser client

```js
const ws = new WebSocket('wss://your-server:4203/');

ws.addEventListener('open', () => {
    ws.send('connect Wizard Nyctasia\r\n');
});

ws.addEventListener('message', ({ data }) => {
    console.log(data);
});
```

> **Self-signed certificate warning:** browsers will block connections to self-signed certs unless you explicitly trust the certificate. For production, provide a cert signed by a public CA (e.g. via Let's Encrypt).
