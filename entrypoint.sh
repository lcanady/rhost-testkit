#!/bin/bash
# RhostMUSH Docker Entrypoint
set -e

cd /home/rhost/game

# Fix potential line ending issues
find . -maxdepth 1 -type f \( -name "*.config" -o -name "*.conf" -o -name "Startmush" \) \
    | xargs dos2unix 2>/dev/null || true

# Clean up stale PID/socket files from previous runs
rm -f *.pid .socket*

PERSISTENT_ROOT="/persistent"

setup_persistent() {
    local target=$1
    local source="/home/rhost/game/$target"
    local dest="$PERSISTENT_ROOT/$target"

    if [ ! -e "$dest" ]; then
        echo "Initializing persistent $target from image..."
        cp -av "$source" "$dest"
    fi

    rm -rf "$source"
    ln -s "$dest" "$source"
}

if [ -d "$PERSISTENT_ROOT" ]; then
    setup_persistent "data"
    setup_persistent "txt"

    # Initialize netrhost.conf on first run
    if [ ! -f "$PERSISTENT_ROOT/netrhost.conf" ]; then
        echo "Initializing netrhost.conf from minimal_db..."
        if [ -f netrhost.conf ]; then
            cp -f netrhost.conf "$PERSISTENT_ROOT/netrhost.conf"
        else
            cp -f /home/rhost/minimal-DBs/minimal_db/netrhost.conf "$PERSISTENT_ROOT/netrhost.conf"
        fi

        # Apply base overrides (customize via env or volume-mount your own netrhost.conf)
        cat >> "$PERSISTENT_ROOT/netrhost.conf" <<EOF

# Docker overrides
port ${RHOST_PORT:-4201}
mud_name ${RHOST_MUD_NAME:-RhostMUSH}

# HTTP API layer — set RHOST_API_PORT=0 to disable
api_port ${RHOST_API_PORT:-4202}

# execscript — external scripts callable from softcode
execscriptpath /home/rhost/game/scripts
# execscripthome is the home directory for execscript(); must be set for execscript() to work
execscripthome /home/rhost/game/scripts
EOF
    fi

    rm -f netrhost.conf
    ln -s "$PERSISTENT_ROOT/netrhost.conf" netrhost.conf
fi

# First-run DB initialization
if [ ! -f data/netrhost.gdbm.db ]; then
    echo "No database found. Initializing from minimal_db flatfile..."
    ./db_load data/netrhost.gdbm \
        /home/rhost/minimal-DBs/minimal_db/netrhost.db.flat \
        data/netrhost.db
    cp -f /home/rhost/minimal-DBs/minimal_db/netrhost.db.flat data/netrhost.db

    echo "Indexing text files..."
    for f in ./txt/*.txt; do
        [ -f "$f" ] || continue
        base=$(basename "$f" .txt)
        ./mkindx "$f" "./txt/$base.indx"
    done
    echo "Initialization complete."
fi

echo "Starting RhostMUSH..."
./Startmush

# ── First-run feature initialisation ─────────────────────────────────────────
# Runs once in the background after the server is up.
# Grants the EXECSCRIPT power to Wizard and configures the HTTP API.
# Set RHOST_PASS to override the Wizard password (default: Nyctasia).
if [ ! -f "$PERSISTENT_ROOT/.features_initialized" ]; then
    (
        PORT="${RHOST_PORT:-4201}"
        PASS="${RHOST_PASS:-Nyctasia}"
        # Default to localhost-only. Set RHOST_API_ALLOW_IP=*.*.*.* to open
        # broader access (e.g. behind a TLS-terminating reverse proxy).
        API_ALLOW_IP="${RHOST_API_ALLOW_IP:-127.0.0.1}"

        # WARNING: default password in use — change before exposing to any network
        if [ -z "${RHOST_PASS:-}" ]; then
            echo "[WARNING] RHOST_PASS is not set. Using default password 'Nyctasia'." >&2
            echo "[WARNING] Change the default password before exposing this server to any network." >&2
        fi

        echo "[init] Waiting for RhostMUSH to accept connections on :${PORT}..."
        # Pass PORT via environment; read with os.environ.get inside Python so
        # that no shell variable is ever interpolated into Python source code.
        RHOST_PORT="$PORT" python3 - <<'PYEOF'
import os, socket, sys, time
port = int(os.environ.get('RHOST_PORT', '4201'))
for _ in range(60):
    try:
        s = socket.create_connection(('localhost', port), 1)
        s.close()
        sys.exit(0)
    except Exception:
        time.sleep(1)
print('[init] Timed out waiting for MUSH.')
sys.exit(1)
PYEOF
        if [ $? -ne 0 ]; then
            echo "[init] MUSH did not start in time; skipping feature init."
            exit 0
        fi

        # Brief pause to let the server finish internal startup
        sleep 3

        echo "[init] Configuring Wizard powers and HTTP API..."
        # Credentials are read inside Python via os.environ.get — they are never
        # interpolated into Python source code, preventing injection attacks.
        RHOST_PORT="$PORT" RHOST_PASS="$PASS" RHOST_API_ALLOW_IP="$API_ALLOW_IP" python3 - <<'PYEOF'
import os, socket, time

port         = int(os.environ.get('RHOST_PORT', '4201'))
pwd          = os.environ.get('RHOST_PASS', 'Nyctasia')
api_allow_ip = os.environ.get('RHOST_API_ALLOW_IP', '127.0.0.1')

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(10)
s.connect(('localhost', port))
time.sleep(1.5)

def send(cmd):
    s.sendall((cmd + '\r\n').encode())
    time.sleep(0.5)

# Log in as Wizard
send('connect Wizard ' + pwd)
time.sleep(1.0)

# Grant EXECSCRIPT power (Councilor level) so execscript() can be called from softcode
send('@power/councilor me=EXECSCRIPT')
# Grant SIDEFX flag — required by execscript() and other side-effect functions
send('@set me=SIDEFX')

# Enable HTTP API access for Wizard
send('@api/enable me')
send('@api/password me=' + pwd)
send('@api/ip me=' + api_allow_ip)   # default 127.0.0.1; set RHOST_API_ALLOW_IP to widen

# Enable Lua execution through the HTTP API.
# With API_LUA set, requests from this object run the Exec: header as Lua code
# instead of MUSHcode.  rhost.get(), rhost.strfunc(), rhost.parseansi() are
# available inside those Lua scripts.
send('@totem me=API_LUA')

send('QUIT')
try:
    s.close()
except Exception:
    pass
print('[init] Done.')
PYEOF

        touch "$PERSISTENT_ROOT/.features_initialized"
        echo "[init] Feature initialisation complete."
    ) &
fi

# Stay alive and stream logs
if [ -f mush.config ]; then
    . ./mush.config
fi

SYSLOG="${MUSHLOGNAME:-netrhost.log}"
GAMELOG="${GAMENAME:-netrhost}.gamelog"

touch "${SYSLOG}" "${GAMELOG}"
exec tail -F "${SYSLOG}" "${GAMELOG}"
