// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit init
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const GITHUB_WORKFLOW = `\
name: MUSH Tests

on: [push, pull_request]

jobs:
  mush-tests:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      # ── Optional: integration tests against a real RhostMUSH container ──
      # Uncomment the steps below, set RHOST_PASS in your repo secrets, and
      # ensure your test:integration script exists in package.json.
      #
      # - name: Start RhostMUSH container
      #   run: |
      #     docker run -d --name rhost -p 4201:4201 rhostmush/rhostmush:latest
      #     sleep 10
      #
      # - name: Run integration tests
      #   run: npm run test:integration
      #   env:
      #     RHOST_HOST: localhost
      #     RHOST_PORT: 4201
      #     RHOST_PASS: \${{ secrets.RHOST_PASS }}
      #
      # - name: Stop container
      #   if: always()
      #   run: docker rm -f rhost
`;

const GITLAB_CI = `\
stages:
  - test

mush-tests:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test

# ── Optional: integration tests against a real RhostMUSH container ──
# Uncomment the job below, add RHOST_PASS to your CI/CD variables, and
# ensure your test:integration script exists in package.json.
#
# mush-integration:
#   stage: test
#   image: docker:latest
#   services:
#     - docker:dind
#   variables:
#     DOCKER_TLS_CERTDIR: ""
#   before_script:
#     - docker run -d --name rhost -p 4201:4201 rhostmush/rhostmush:latest
#     - sleep 10
#   script:
#     - apk add --no-cache nodejs npm
#     - npm ci
#     - RHOST_HOST=localhost RHOST_PORT=4201 npm run test:integration
#   after_script:
#     - docker rm -f rhost
`;

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

export function runInitCli(args: string[], cwd: string = process.cwd()): void {
    let ci: string | null = null;
    let force = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--ci') {
            const val = args[++i];
            if (!val || val.startsWith('-')) {
                die("--ci requires a platform argument: 'github' or 'gitlab'");
            }
            ci = val;
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else if (!arg.startsWith('-')) {
            die(`Unexpected argument: ${arg}`);
        } else {
            die(`Unknown option: ${arg}`);
        }
    }

    if (!ci) {
        console.error("rhost-testkit init: --ci <platform> is required\n");
        printHelp();
        process.exit(1);
    }

    const targets: Record<string, { file: string; content: string }> = {
        github: {
            file: path.join(cwd, '.github', 'workflows', 'mush-tests.yml'),
            content: GITHUB_WORKFLOW,
        },
        gitlab: {
            file: path.join(cwd, '.gitlab-ci.yml'),
            content: GITLAB_CI,
        },
    };

    const target = targets[ci];
    if (!target) {
        die(`--ci: unknown platform '${ci}' — use 'github' or 'gitlab'`);
    }

    if (fs.existsSync(target.file) && !force) {
        console.warn(`rhost-testkit init: ${target.file} already exists. Use --force to overwrite.`);
        process.exit(0);
    }

    const dir = path.dirname(target.file);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(target.file, target.content, 'utf8');
    console.log(`rhost-testkit init: wrote ${target.file}`);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
    console.log(`
USAGE
  rhost-testkit init --ci <platform>

PLATFORMS
  github    Generate .github/workflows/mush-tests.yml
  gitlab    Generate .gitlab-ci.yml

OPTIONS
  --force   Overwrite an existing file
  -h, --help  Show this help

EXAMPLES
  rhost-testkit init --ci github
  rhost-testkit init --ci gitlab
  rhost-testkit init --ci github --force
`.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
    console.error(`rhost-testkit init: ${msg}`);
    process.exit(1);
}
