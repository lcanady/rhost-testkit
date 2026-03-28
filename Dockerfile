# Multi-stage Dockerfile for RhostMUSH
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

WORKDIR /build/Server
RUN make default && make links


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

# 4201 = MUSH telnet port  4202 = HTTP API port
EXPOSE 4201 4202

ENTRYPOINT ["/home/rhost/entrypoint.sh"]
