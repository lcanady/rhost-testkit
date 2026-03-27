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
export { RhostWorld } from './world';

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
    SuiteContext,
    ItFn,
    DescribeFn,
} from './runner';

// Offline softcode validator
export {
    validate,
    validateFile,
    ValidationResult,
    Diagnostic,
    Severity,
    FunctionSignature,
    BUILTIN_FUNCTIONS,
} from './validator';

// Snapshot manager
export { SnapshotManager, SnapshotStats, SnapshotStatus, SnapshotCheckResult, formatSnapshotDiff } from './snapshots';

// Watch mode
export { RhostWatcher, WatchOptions, discoverTestFiles } from './watcher';
