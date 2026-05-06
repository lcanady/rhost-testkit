# @rhost/server

Zero-config RhostMUSH Docker server. Pull, configure, and start in one command.

```sh
npx @rhost/server init          # scaffold config
npx @rhost/server start         # start the server
```

This is a thin CLI wrapper around [@rhost/testkit](https://www.npmjs.com/package/@rhost/testkit).
All options and documentation live there.

## Quick start

```sh
# Scaffold a new server directory
npx @rhost/server init my-mush

# With WebSocket and stunnel TLS
npx @rhost/server init my-mush --websocket --stunnel

# Start (uses defaults — pulls lcanady/rhostmush:latest)
cd my-mush
npx @rhost/server start

# Start with custom port
npx @rhost/server start --port 7000

# Build from source with WebSocket enabled
npx @rhost/server start --build-from-source --enable-websockets
```

## Commands

| Command | Description |
|---------|-------------|
| `init [dir]` | Scaffold `rhost.config.json`, `.env`, and directory structure |
| `start` | Launch a RhostMUSH Docker container (default when no command given) |

Run `npx @rhost/server <command> --help` for full flag reference.

## Full documentation

See the [@rhost/testkit docs](https://github.com/lcanady/rhost-testkit/tree/main/docs):

- [Server CLI reference](../../docs/server-cli.md)
- [WebSocket & stunnel setup](../../docs/websocket.md)
- [Pueblo protocol](../../docs/pueblo.md)
