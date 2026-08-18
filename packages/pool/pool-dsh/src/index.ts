/**
 * dsh-pool-dsh: the pooled sandbox, hosted on DSH. It wraps the pure
 * `@deepseek-ai/dsh-pool` {@link PoolManager} in a Cordis service (`ctx.pool`)
 * and provides the filesystem and subprocess seam providers (`ctx.fs` /
 * `ctx.subprocess`) that route each caller into its own pooled user directory.
 * The POC runs the in-memory ledger and the fake Pod substrate; a K8s
 * `PodFactory` and a persistent ledger swap in without touching the providers.
 * @module @deepseek-ai/dsh-pool-dsh
 */

export { PoolRuntime } from './runtime.ts'
export type { Config as PoolRuntimeConfig, PoolBinding } from './runtime.ts'
export { PoolFileSystem } from './fs.ts'
export type { LocalConfig as PoolFileSystemConfig } from './fs.ts'
export { PoolSubprocess } from './subprocess.ts'
export { PoolTenantProbe } from './probe.ts'
export type { PoolTenantStamp } from './probe.ts'

export { default } from './runtime.ts'
