/**
 * The pool ledger contract: the single place that owns binding relationships
 * and sandbox state. Implementations must enforce two invariants —
 * (1) one binding key maps to at most one BOUND/IDLE sandbox, and
 * (2) state transitions only occur through the guarded {@link Sandbox}
 * entity. The in-memory implementation is the POC backend; a PostgreSQL
 * implementation would keep the same methods and add row-level atomic claims.
 * @module @deepseek-ai/dsh-pool/ledger
 */

import type { BindingKey, EngineId, SandboxId } from './brand.ts'
import type { Sandbox } from './sandbox.ts'
import type { SandboxState } from './types.ts'

/** Per-state water-level counts from one ledger. */
export interface LedgerCounts {
  readonly warm: number
  readonly bound: number
  readonly idle: number
  readonly reclaiming: number
}

/** Contract implemented by the in-memory and future persistent ledgers. */
export interface PoolLedger {
  /** Add a freshly created WARM sandbox to the warm pool. */
  addWarm(sandbox: Sandbox): void

  /**
   * Atomically claim one WARM sandbox and bind it. Fails loud when the
   * binding key is already held.
   * @returns the BOUND sandbox, or undefined when the warm pool is empty.
   */
  claimWarm(bindingKey: BindingKey, engineId: EngineId, userId: string, now: number): Sandbox | undefined

  /**
   * Rebind the binding key's IDLE sandbox to a new engine.
   * @returns the BOUND sandbox, or undefined when the key has no IDLE sandbox.
   */
  rebindIdle(bindingKey: BindingKey, engineId: EngineId, now: number): Sandbox | undefined

  /**
   * Mark the binding key's BOUND sandbox IDLE.
   * @returns the IDLE sandbox, or undefined when the key has no BOUND sandbox.
   */
  markIdle(bindingKey: BindingKey, now: number): Sandbox | undefined

  /**
   * Move a sandbox into RECLAIMING and drop its binding.
   * @returns the RECLAIMING sandbox, or undefined when unknown or not reclaimable.
   */
  markReclaiming(sandboxId: SandboxId, now: number): Sandbox | undefined

  /**
   * Remove a RECLAIMING sandbox after its Pod is destroyed.
   * @returns the removed sandbox, or undefined when unknown.
   */
  remove(sandboxId: SandboxId): Sandbox | undefined

  /**
   * Reset the binding key's activity clock on its BOUND or IDLE sandbox.
   * @returns the touched sandbox, or undefined when the key is not held.
   */
  touch(bindingKey: BindingKey, now: number): Sandbox | undefined

  /** Return the BOUND or IDLE sandbox for a binding key, if any. */
  find(bindingKey: BindingKey): Sandbox | undefined

  /** Count sandboxes in one state. */
  count(state: SandboxState): number

  /** Current water levels across all four states. */
  counts(): LedgerCounts

  /**
   * Move every IDLE sandbox inactive since `cutoff` into RECLAIMING.
   * @returns the newly RECLAIMING sandboxes, in ledger iteration order.
   */
  sweepIdle(cutoff: number, now: number): Sandbox[]

  /**
   * Move every BOUND sandbox whose engine is not in `liveEngineIds` into
   * RECLAIMING (orphan reconciliation).
   * @returns the newly RECLAIMING sandboxes, in ledger iteration order.
   */
  sweepOrphans(liveEngineIds: ReadonlySet<EngineId>, now: number): Sandbox[]
}
