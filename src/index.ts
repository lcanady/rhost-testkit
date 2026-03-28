// Core client
export { RhostClient, RhostClientOptions, PreviewOptions, stripAnsi } from './client';

// Connection
export { MushConnection } from './connection';

// Container
export { RhostContainer, ContainerConnectionInfo } from './container';

// Assertions (backward-compat)
export { RhostAssert, RhostAssertionError, AssertionResult, isRhostError } from './assertions';

// New expect API
export { RhostExpect, RhostExpectError } from './expect';

// World fixture manager
export { RhostWorld, WorldSnapshot, WorldDiff, WorldObjectDiff, WorldSideEffectError } from './world';

// Pre-flight assertions
export {
    preflight,
    preflightCheck,
    assertFunctionExists,
    assertFunctionMissing,
    assertConfigEquals,
    PreflightCheck,
    PreflightResult,
    PreflightOptions,
    PreflightError,
} from './preflight';

// Reporter
export { Reporter } from './reporter';

// Runner + types
export {
    RhostRunner,
    RunnerOptions,
    RunResult,
    TestContext,
    TestFn,
    HookFn,
    PersonaTestFn,
    PersonaCredentials,
    SuiteContext,
    ItFn,
    DescribeFn,
    PersonasFn,
} from './runner';

// Offline softcode validator + compat report
export {
    validate,
    validateFile,
    compatibilityReport,
    ValidationResult,
    Diagnostic,
    Severity,
    FunctionSignature,
    BUILTIN_FUNCTIONS,
    Platform,
    CompatibilityReport,
    CompatibilityEntry,
} from './validator';

// Softcode formatter
export { format, FormatOptions, FormatResult } from './validator/formatter';

// Benchmark mode
export { RhostBenchmark, runBench, formatBenchResults, BenchOptions, BenchmarkResult } from './benchmark';

// Deploy pipeline
export {
    deploy,
    parseDeployFile,
    snapshotObjects,
    restoreSnapshot,
    DeployCommand,
    DeploySnapshot,
    DeployOptions,
    DeployResult,
} from './deployer';

// Snapshot manager
export { SnapshotManager, SnapshotStats, SnapshotStatus, SnapshotCheckResult, formatSnapshotDiff } from './snapshots';

// Watch mode
export { RhostWatcher, WatchOptions, discoverTestFiles } from './watcher';
