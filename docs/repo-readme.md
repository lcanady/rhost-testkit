# rhostmush-docker

A self-contained Docker image for [RhostMUSH](https://github.com/RhostMUSH/trunk), plus a TypeScript SDK for testing MUSHcode — the closest thing to Jest for softcode development.

```
rhostmush-docker/
├── Dockerfile          Multi-stage build: compile from source → slim runtime
├── docker-compose.yml  One-command startup
├── entrypoint.sh       First-run DB init, persistent volume wiring, server start
├── .env.example        Environment variable template
└── sdk/                TypeScript testing SDK
    └── src/
        ├── expect.ts   RhostExpect — Jest-like assertions for MUSHcode
        ├── world.ts    RhostWorld  — object fixture manager
        ├── runner.ts   RhostRunner — describe/it/skip/only test runner
        ├── client.ts   RhostClient — TCP connection + eval/command primitives
        └── container.ts RhostContainer — testcontainers integration
```

## Documentation

| Topic | File |
|---|---|
| Running the server | [docs/server.md](docs/server.md) |
| SDK quick start | [docs/sdk-quickstart.md](docs/sdk-quickstart.md) |
| Full SDK reference | [docs/sdk-reference.md](docs/sdk-reference.md) |
| Writing tests | [docs/writing-tests.md](docs/writing-tests.md) |

## Thirty-second start

```bash
# Start the server
cp .env.example .env
docker compose up --build -d

# Run the example against it
cd sdk && npm install && npx ts-node examples/basic.ts
```

Default wizard credentials: **Wizard / Nyctasia**
