# Multi-stage Dockerfile for RhostMUSH
#
# Compile-time feature flags (pass via --build-arg):
#   ENABLE_WEBSOCKETS=1   Enable RFC 6455 WebSocket support
#   ENABLE_REALITY=1      Enable REALMS/Reality Levels system
#   EXTRA_CFLAGS          Arbitrary additional -D flags or compiler options
# Note: SSL/TLS is controlled by library linking (-lssl -lcrypto), not a #define.
#       It is detected and linked automatically by the build system.
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    make \
    git \
    zlib1g-dev \
    libssl-dev \
    libc6-dev \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone https://github.com/RhostMUSH/trunk /build

RUN find . -type f -exec dos2unix {} + || true

# Compile-time feature flags
ARG ENABLE_WEBSOCKETS=0
ARG ENABLE_REALITY=0
ARG EXTRA_CFLAGS=""

WORKDIR /build/Server
RUN set -e; \
    FLAGS="$EXTRA_CFLAGS"; \
    [ "$ENABLE_WEBSOCKETS" = "1" ] && FLAGS="$FLAGS -DENABLE_WEBSOCKETS"; \
    [ "$ENABLE_REALITY"    = "1" ] && FLAGS="$FLAGS -DREALITY_LEVELS"; \
    export CFLAGS="$FLAGS"; \
    make default && make links


# Runtime stage
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    zlib1g \
    libssl3 \
    ca-certificates \
    file \
    procps \
    psmisc \
    dos2unix \
    python3 \
    python3-psycopg2 \
    lua5.4 \
    stunnel4 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash rhost
USER rhost
WORKDIR /home/rhost

COPY --from=builder --chown=rhost:rhost /build/Server/game /home/rhost/game
COPY --from=builder --chown=rhost:rhost /build/Server/src  /home/rhost/src
COPY --from=builder --chown=rhost:rhost /build/Server/bin  /home/rhost/bin
COPY --from=builder --chown=rhost:rhost /build/Server/minimal-DBs /home/rhost/minimal-DBs

# execscript home — scripts callable from MUSH softcode via execscript()
COPY --chown=rhost:rhost scripts /home/rhost/game/scripts
RUN chmod +x /home/rhost/game/scripts/*.sh \
              /home/rhost/game/scripts/*.py \
              /home/rhost/game/scripts/*.lua \
    2>/dev/null || true

COPY --chown=rhost:rhost entrypoint.sh /home/rhost/entrypoint.sh
RUN chmod +x /home/rhost/entrypoint.sh

# 4201 = MUSH telnet port  4202 = HTTP API port  4203 = stunnel TLS port (optional)
EXPOSE 4201 4202 4203

ENTRYPOINT ["/home/rhost/entrypoint.sh"]
