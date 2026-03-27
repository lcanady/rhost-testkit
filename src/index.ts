// Core client
export { RhostClient, RhostClientOptions, stripAnsi } from './client';

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
