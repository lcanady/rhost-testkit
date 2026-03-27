# RhostMUSH Server

## Overview

The container builds RhostMUSH directly from the [upstream source](https://github.com/RhostMUSH/trunk) using a two-stage Dockerfile:

1. **Builder stage** — Ubuntu 22.04 with full build tools. Clones the repo, fixes line endings, runs `make default && make links`.
2. **Runtime stage** — Minimal Ubuntu 22.04. Copies only the compiled binaries, game directory, and minimal DB templates. Runs as an unprivileged `rhost` user.

On first container start, `entrypoint.sh` bootstraps the database from the bundled `minimal_db` flatfile and indexes the help text. Subsequent starts skip this step and resume directly.

---

## Quick start

```bash
cp .env.example .env          # copy environment template
docker compose up --build     # build image and start (first build takes 5-10 min)
```

Connect with any MUD client:

```
Host: localhost
Port: 4201
```

Log in with the default wizard account:

```
connect Wizard Nyctasia
```

Stop the server:

```bash
docker compose down
```

---

## Environment variables

Set these in `.env` (copy from `.env.example`) or pass via `docker compose run -e`.

| Variable | Default | Description |
|---|---|---|
| `RHOST_PORT` | `4201` | Host port mapped to the container's 4201 |
| `RHOST_MUD_NAME` | `RhostMUSH` | Value written to `mud_name` in `netrhost.conf` on first run |

These variables are only applied during **first-run initialisation**. After `persistent_data/netrhost.conf` exists, edit it directly to change settings.

---

## Persistence

Everything that should survive container restarts lives in `persistent_data/` (a bind mount at `/persistent` inside the container):

```
persistent_data/
├── netrhost.conf     Server configuration (created from minimal_db on first run)
├── data/
│   ├── netrhost.gdbm.db    Live GDBM database
│   ├── netrhost.db         Flatfile backup (written on shutdown/`@dump`)
│   └── netrhost.db.new     In-progress dump
└── txt/
    ├── help.txt             Help entries
    ├── help.indx            Help index (built by mkindx on first run)
    ├── news.txt             News entries
    └── ...
```

The `data/` and `txt/` directories are symlinked from `/home/rhost/game/` into `/persistent/` at startup. If `/persistent` is not mounted, the server still runs but data is lost on container stop.

### Backing up

```bash
# Copy the entire persistent_data directory
cp -r persistent_data persistent_data.bak.$(date +%Y%m%d)

# Or just the flatfile DB (safe to copy while the server runs)
cp persistent_data/data/netrhost.db netrhost.db.bak
```

### Restoring a flatfile backup

```bash
docker compose down
cp my_backup.db persistent_data/data/netrhost.db
# Remove the GDBM files to force a reload from the flatfile on next start
rm persistent_data/data/netrhost.gdbm.*
docker compose up
```

---

## Configuration

`persistent_data/netrhost.conf` is the main server configuration file. Edit it while the server is stopped, or use `@readcf` in-game to reload most settings without a restart.

Key settings you may want to change:

```conf
# Server identity
mud_name        My Game Name
port            4201

# Wizard-only options
access_file     data/netrhost.access
log_network     1

# Timeouts (seconds)
idle_timeout    3600
connect_timeout 60

# Mail / bulletin boards
mailbox_size    1000
```

For the full list of configuration options see the upstream docs or `help @config` in-game.

---

## First-run initialisation

`entrypoint.sh` performs this sequence on every start:

1. **Fix line endings** — runs `dos2unix` on config/startup files (harmless on subsequent runs).
2. **Clean stale locks** — removes `*.pid` and `.socket*` files left by a crashed previous run.
3. **Wire persistence** — creates `persistent_data/data` and `persistent_data/txt` from the image defaults if they don't exist yet, then replaces the game directory entries with symlinks.
4. **Bootstrap config** — copies `minimal_db/netrhost.conf` to `persistent_data/` on first run and appends `RHOST_PORT` and `RHOST_MUD_NAME` overrides.
5. **Bootstrap database** — if `data/netrhost.gdbm.db` doesn't exist, loads the `minimal_db` flatfile with `db_load` and indexes text files.
6. **Start the server** — runs `./Startmush` (the standard RhostMUSH startup script).
7. **Tail logs** — keeps the container foreground process alive by tailing `netrhost.log` and `netrhost.gamelog`.

---

## Logs

Server output is streamed to `docker compose logs`:

```bash
docker compose logs -f
```

Log files are also written to `persistent_data/data/` (symlinked into the game directory):

| File | Contents |
|---|---|
| `netrhost.log` | System/startup log (`MUSHLOGNAME`) |
| `netrhost.gamelog` | In-game log (commands, errors, wizards) |

---

## Upgrading RhostMUSH

The Dockerfile clones from `github.com/RhostMUSH/trunk` at build time with no pinned commit. To upgrade:

```bash
docker compose build --no-cache   # re-clones and recompiles
docker compose up -d
```

Your `persistent_data/` is untouched. If the new version has an incompatible DB format, use `@dbck` and the upstream migration tools before restarting with live data.

---

## Using this image as a base

Other projects can build on top of this image rather than managing their own RhostMUSH installation:

```yaml
# your-game/docker-compose.yml
services:
  mush:
    build:
      context: ./rhostmush-docker
    ports:
      - "4201:4201"
    volumes:
      - ./persistent_data:/persistent
      - ./my-game-scripts:/opt/my-game:ro   # for execscript
    environment:
      - RHOST_MUD_NAME=My Game
    restart: unless-stopped
```

Or reference the pre-built image by tag if you publish it to a registry:

```yaml
services:
  mush:
    image: ghcr.io/yourorg/rhostmush:latest
    ports:
      - "4201:4201"
    volumes:
      - ./persistent_data:/persistent
```

---

## Connecting with a MUD client

Any standard MUD/telnet client works. Recommended options:

- **[Mudlet](https://www.mudlet.org/)** — cross-platform, scriptable
- **[Potato](https://www.potatomushclient.com/)** — Windows, MUSH-focused
- **[Atlantis](http://www.riverdark.net/atlantis/)** — macOS
- **`telnet localhost 4201`** — built-in to most systems (no formatting)

---

## Troubleshooting

**Container exits immediately after start**

Check the logs: `docker compose logs`. Common causes:
- Stale PID file from a previous crash — `entrypoint.sh` should clean these, but if it fails, delete `persistent_data/data/*.pid` manually and restart.
- Port conflict — change `RHOST_PORT` in `.env`.

**`connect Wizard Nyctasia` says "That character does not exist"**

The database was initialised from a custom flatfile that uses different credentials. Check `persistent_data/data/netrhost.db` for the Wizard entry, or nuke `persistent_data/data/` and let the container rebuild from `minimal_db`.

**Can't write to `persistent_data/`**

The container runs as UID 1000 (`rhost`). If `persistent_data/` was created by root, fix permissions:

```bash
sudo chown -R 1000:1000 persistent_data/
```

**RhostMUSH crashed mid-game (soft-core dump)**

Look for a `netrhost.gdbm.db` that is newer than `netrhost.db`. The GDBM file is the live database; the flatfile is written periodically by `@dump`. To recover to the last checkpoint:

```bash
docker compose down
# The GDBM file should still be intact — just restart
docker compose up
```

If the GDBM file is corrupted, restore from the last flatfile backup (see _Restoring a flatfile backup_ above).
