/**
 * dsh-pool: the shared sandbox pool manager. A pure library with no Cordis
 * service of its own — the engine-side pool-client plugin wraps
 * {@link PoolManager}, while the standalone pool service composes it with a
 * persistent ledger and a K8s {@link PodFactory}. The POC runs the in-memory
 * ledger and the fake Pod factory.
 * @module @deepseek-ai/dsh-pool
 */

export { BindingKey, EngineId, SandboxId } from './brand.ts'
export type { PoolLedger, LedgerCounts } from './ledger.ts'
export { MemoryLedger } from './memory-ledger.ts'
export type { PodFactory, PodSpec } from './pod-factory.ts'
export { FakePodFactory } from './fake-pod-factory.ts'
export type { FakePodEvent, FakePodFactoryConfig } from './fake-pod-factory.ts'
export { Sandbox, SandboxStateError } from './sandbox.ts'
export type { AcquireResult, PoolConfig, PoolStats, SandboxRecord, SandboxState } from './types.ts'
export { PoolExhaustedError, validatePoolConfig } from './types.ts'
export { PoolManager } from './pool-manager.ts'
export type { OrphanOutcome, ReclaimOutcome } from './pool-manager.ts'
