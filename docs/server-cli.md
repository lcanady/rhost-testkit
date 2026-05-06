# rhost-server CLI reference

`rhost-server` starts a RhostMUSH Docker container and keeps it running until you press Ctrl+C. It is also available as `rhost-testkit server`.

```bash
npx rhost-server [options]
# or
npx rhost-testkit server [options]
```

---

## Flags

### Server options

| Flag | Default | Description |
|---|---|---|
| `-p, --port <n>` | `4201` | Host port the MUSH is published on |
| `--image <name>` | `lcanady/rhostmush:latest` | Docker image to pull and run |
| `--build-from-source` | — | Build the image locally instead of pulling; implies `--image` is ignored |
| `--project-root <path>` | — | Path to a local `rhostmush-docker` repo (required with `--build-from-source`) |
| `-c, --config <path>` | auto-detected | Path to `rhost.config.json` or its containing directory |
| `--startup-timeout <ms>` | `120000` | How long to wait for the container to start listening |
| `-h, --help` | — | Print help and exit |

### Compile-time flags

These flags only take effect when `--build-from-source` is used. They are silently ignored when using a pre-built image.

| Flag | Description |
|---|---|
| `--enable-websockets` | Compile with RFC 6455 WebSocket support |
| `--disable-websockets` | Explicitly disable WebSocket support |
| `--enable-reality` | Compile with the REALMS/Reality Levels system |
| `--extra-cflags <flags>` | Raw CFLAGS string passed to the compiler (e.g. `"-DFOO -DBAR"`) |

### stunnel options

| Flag | Default | Description |
|---|---|---|
| `--stunnel` | — | Wrap the MUSH port in TLS via stunnel |
| `--stunnel-port <n>` | `4203` | Port stunnel listens on for incoming TLS connections |
| `--stunnel-connect-port <n>` | `4201` | Internal port stunnel forwards decrypted traffic to |
| `--stunnel-cert <path>` | auto-generated | PEM certificate file |
| `--stunnel-key <path>` | same as cert | PEM private key file |

If `--stunnel-cert` is omitted, a self-signed certificate is generated automatically inside the container on each start. This is suitable for local testing; use a signed certificate for any public-facing deployment.

CLI flags are **merged on top of** any values in `rhost.config.json`. A CLI flag always wins.

---

## rhost.config.json schema

Place `rhost.config.json` in your project root. It is picked up automatically unless you override with `-c`.

```json
{
  "scriptsDir": "./scripts",
  "mushConfig": "./mush.conf",
  "build": {
    "enableWebSockets": true,
    "enableReality": false,
    "extraCflags": "-DSOME_FEATURE"
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

| Field | Type | Default | Description |
|---|---|---|---|
| `scriptsDir` | `string` | — | Directory of execscript files copied to `/home/rhost/game/scripts` inside the container |
| `mushConfig` | `string` | — | Path to a MUSH config file that replaces the container default `mush.config` |
| `build.enableWebSockets` | `boolean` | `false` | Build with WebSocket support (`ENABLE_WEBSOCKETS`) |
| `build.enableReality` | `boolean` | `false` | Build with REALMS/Reality Levels (`ENABLE_REALITY`) |
| `build.extraCflags` | `string` | — | Raw CFLAGS passed directly to the compiler |
| `stunnel.enable` | `boolean` | `false` | Launch stunnel inside the container |
| `stunnel.acceptPort` | `number` | `4203` | Port stunnel listens on for TLS (client-facing) |
| `stunnel.connectPort` | `number` | `4201` | Port stunnel forwards decrypted traffic to (must match MUSH port) |
| `stunnel.certFile` | `string` | auto | PEM certificate file, relative to `rhost.config.json` |
| `stunnel.keyFile` | `string` | same as `certFile` | PEM private key, relative to `rhost.config.json` |

All path fields (`scriptsDir`, `mushConfig`, `certFile`, `keyFile`) are resolved relative to the directory containing `rhost.config.json`. Paths that escape the project root are rejected with an error.

---

## Common recipes

### Zero-config start

Pull the latest pre-built image and start on the default port:

```bash
rhost-server
```

Connect with any MUD client at `localhost:4201` using `connect Wizard Nyctasia`.

---

### Custom port

```bash
rhost-server --port 7000
```

---

### Use a specific Docker image

```bash
rhost-server --image ghcr.io/yourorg/rhostmush:v2.1
```

---

### Load a config file explicitly

```bash
rhost-server --config ./config/rhost.config.json
```

---

### Build from source with WebSocket support

```bash
rhost-server \
  --build-from-source \
  --project-root ./rhostmush-docker \
  --enable-websockets
```

First build pulls dependencies and compiles RhostMUSH — expect 5–10 minutes. Subsequent builds use Docker's layer cache and are much faster.

---

### Full stunnel stack (wss:// for browser clients)

Build with WebSocket support and wrap in TLS via stunnel, using a real certificate:

```bash
rhost-server \
  --build-from-source \
  --project-root ./rhostmush-docker \
  --enable-websockets \
  --stunnel \
  --stunnel-port 4203 \
  --stunnel-cert ./certs/server.pem \
  --stunnel-key ./certs/server.key
```

Or put everything in `rhost.config.json` and just run:

```bash
rhost-server --build-from-source --project-root ./rhostmush-docker
```

The startup output confirms both endpoints:

```
  WebSocket: wss://localhost:4203
  TLS port:  4203  (via stunnel)
```

Browser clients connect to `wss://localhost:4203/`; traditional MUD clients connect to `localhost:4201` over plain TCP.

---

### Inject custom scripts and server config

```json
{
  "scriptsDir": "./my-game/scripts",
  "mushConfig": "./my-game/netrhost.conf"
}
```

```bash
rhost-server
```

Scripts are copied into `/home/rhost/game/scripts` and the config replaces the default `mush.config` before the server starts.
