// ---------------------------------------------------------------------------
// CLI handler: rhost-testkit init
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Scaffold templates
// ---------------------------------------------------------------------------

const EXAMPLE_MUSH = `\
@@ ============================================================================
@@ Mushcode Installer for: Example
@@ Version: 1.0.0
@@ Requires: None
@@ ============================================================================

&CMD_HELLO me=$+hello:@pemit %#=Hello, [name(%#)]!
&HELP_HELLO me=Usage: +hello — greet yourself

@@ ---[ UNINSTALL ]-----------------------------------------------------------
&CMD_HELLO me=
&HELP_HELLO me=
@@ [END OF FILE]
`;

const EXAMPLE_TEST = `\
import { RhostRunner } from '@rhost/testkit';

const runner = new RhostRunner();

runner.describe('Example', ({ it }) => {
  it('add works', async ({ expect }) => {
    await expect('add(2,3)').toBe('5');
  });
});

runner.run({
  host: process.env.RHOST_HOST ?? 'localhost',
  port: Number(process.env.RHOST_PORT ?? 4201),
  username: process.env.RHOST_USER ?? '#1',
  password: process.env.RHOST_PASS ?? 'potrzebie',
});
`;

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
    let dir: string | null = null;
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
            if (dir !== null) {
                die(`Unexpected argument: ${arg}`);
            }
            dir = arg;
        } else {
            die(`Unknown option: ${arg}`);
        }
    }

    const targetDir = path.resolve(cwd, dir ?? '.');

    // Create the target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`rhost-testkit init: created ${targetDir}`);
    }

    // Scaffold project structure
    scaffoldProject(targetDir, force);

    // Optionally write CI workflow
    if (ci) {
        scaffoldCi(targetDir, ci, force);
    }
}

// ---------------------------------------------------------------------------
// Scaffold helpers
// ---------------------------------------------------------------------------

function scaffoldProject(targetDir: string, force: boolean): void {
    const dirs = [
        path.join(targetDir, 'softcode'),
        path.join(targetDir, 'src', '__tests__'),
        path.join(targetDir, 'dist'),
    ];

    for (const d of dirs) {
        if (!fs.existsSync(d)) {
            fs.mkdirSync(d, { recursive: true });
            console.log(`rhost-testkit init: created ${d}`);
        }
    }

    const files: Array<{ file: string; content: string }> = [
        {
            file: path.join(targetDir, 'softcode', 'example.mush'),
            content: EXAMPLE_MUSH,
        },
        {
            file: path.join(targetDir, 'src', '__tests__', 'example.test.ts'),
            content: EXAMPLE_TEST,
        },
    ];

    for (const { file, content } of files) {
        if (fs.existsSync(file) && !force) {
            console.log(`rhost-testkit init: ${file} already exists (use --force to overwrite)`);
            continue;
        }
        fs.writeFileSync(file, content, 'utf8');
        console.log(`rhost-testkit init: wrote ${file}`);
    }
}

function scaffoldCi(targetDir: string, ci: string, force: boolean): void {
    const targets: Record<string, { file: string; content: string }> = {
        github: {
            file: path.join(targetDir, '.github', 'workflows', 'mush-tests.yml'),
            content: GITHUB_WORKFLOW,
        },
        gitlab: {
            file: path.join(targetDir, '.gitlab-ci.yml'),
            content: GITLAB_CI,
        },
    };

    const target = targets[ci];
    if (!target) {
        die(`--ci: unknown platform '${ci}' — use 'github' or 'gitlab'`);
    }

    if (fs.existsSync(target.file) && !force) {
        console.log(`rhost-testkit init: ${target.file} already exists (use --force to overwrite)`);
        return;
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
  rhost-testkit init [dir] [--ci <platform>] [--force]

ARGUMENTS
  dir       Directory to initialise (default: current directory)
            Created automatically if it does not exist.

OPTIONS
  --ci <platform>  Also generate a CI/CD workflow file
                   Platforms: github, gitlab
  --force          Overwrite existing files
  -h, --help       Show this help

SCAFFOLD
  softcode/example.mush           Starter installer file
  src/__tests__/example.test.ts   Starter RhostRunner test
  dist/                           Output directory (empty)

EXAMPLES
  rhost-testkit init
  rhost-testkit init my-project
  rhost-testkit init . --ci github
  rhost-testkit init my-project --ci gitlab --force
`.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
    console.error(`rhost-testkit init: ${msg}`);
    process.exit(1);
}
