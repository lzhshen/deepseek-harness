/**
 * In-memory {@link PoolLedger} for the POC and tests. Single-threaded by
 * construction (the pool manager's event loop); a persistent backend keeps the
 * same contract and adds row-level atomic claims across replicas.
 * @module @deepseek-ai/dsh-pool/memory-ledger
 */

import type { BindingKey, EngineId, SandboxId } from './brand.ts'
import type { PoolLedger, LedgerCounts } from './ledger.ts'
import type { Sandbox } from './sandbox.ts'
import type { SandboxState } from './types.ts'

function invariant(message: string): never {
  throw new Error(`dsh-pool ledger invariant: ${message}`)
}

/** In-memory ledger enforcing the one-key-one-sandbox invariant. */
export class MemoryLedger implements PoolLedger {
  private readonly byId = new Map<SandboxId, Sandbox>()
  private readonly byBinding = new Map<BindingKey, SandboxId>()
  /** FIFO claim order for the warm pool. */
  private readonly warmOrder: SandboxId[] = []

  addWarm(sandbox: Sandbox): void {
    if (sandbox.state !== 'warm') invariant('addWarm requires a WARM sandbox')
    this.byId.set(sandbox.sandboxId, sandbox)
    this.warmOrder.push(sandbox.sandboxId)
  }

  claimWarm(bindingKey: BindingKey, engineId: EngineId, userId: string, now: number): Sandbox | undefined {
    if (this.byBinding.has(bindingKey)) invariant(`binding key ${String(bindingKey)} is already held`)
    const sandboxId = this.warmOrder.shift()
    if (sandboxId === undefined) return undefined
    const sandbox = this.requireById(sandboxId)
    const bound = sandbox.bind(bindingKey, engineId, userId, now)
    this.byId.set(sandboxId, bound)
    this.byBinding.set(bindingKey, sandboxId)
    return bound
  }

  rebindIdle(bindingKey: BindingKey, engineId: EngineId, now: number): Sandbox | undefined {
    const sandboxId = this.byBinding.get(bindingKey)
    if (sandboxId === undefined) return undefined
    const sandbox = this.requireById(sandboxId)
    if (sandbox.state !== 'idle') return undefined
    const bound = sandbox.rebind(engineId, now)
    this.byId.set(sandboxId, bound)
    return bound
  }

  markIdle(bindingKey: BindingKey, now: number): Sandbox | undefined {
    const sandboxId = this.byBinding.get(bindingKey)
    if (sandboxId === undefined) return undefined
    const sandbox = this.requireById(sandboxId)
    if (sandbox.state !== 'bound') return undefined
    const idle = sandbox.idle(now)
    this.byId.set(sandboxId, idle)
    return idle
  }

  touch(bindingKey: BindingKey, now: number): Sandbox | undefined {
    const sandboxId = this.byBinding.get(bindingKey)
    if (sandboxId === undefined) return undefined
    const sandbox = this.requireById(sandboxId)
    if (sandbox.state !== 'bound' && sandbox.state !== 'idle') return undefined
    const touched = sandbox.touch(now)
    this.byId.set(sandboxId, touched)
    return touched
  }

  find(bindingKey: BindingKey): Sandbox | undefined {
    const sandboxId = this.byBinding.get(bindingKey)
    if (sandboxId === undefined) return undefined
    return this.requireById(sandboxId)
  }

  markReclaiming(sandboxId: SandboxId, now: number): Sandbox | undefined {
    const sandbox = this.byId.get(sandboxId)
    if (sandbox === undefined) return undefined
    if (sandbox.state === 'warm' || sandbox.state === 'reclaiming') return undefined
    const bindingKey = sandbox.record.bindingKey
    const reclaiming = sandbox.reclaim(now)
    this.byId.set(sandboxId, reclaiming)
    if (bindingKey !== undefined) this.byBinding.delete(bindingKey)
    return reclaiming
  }

  remove(sandboxId: SandboxId): Sandbox | undefined {
    const sandbox = this.byId.get(sandboxId)
    if (sandbox === undefined) return undefined
    if (sandbox.state !== 'reclaiming') invariant(`remove requires a RECLAIMING sandbox, got ${sandbox.state}`)
    this.byId.delete(sandboxId)
    return sandbox
  }

  count(state: SandboxState): number {
    let result = 0
    for (const sandbox of this.byId.values()) {
      if (sandbox.state === state) result += 1
    }
    return result
  }

  counts(): LedgerCounts {
    return {
      warm: this.count('warm'),
      bound: this.count('bound'),
      idle: this.count('idle'),
      reclaiming: this.count('reclaiming'),
    }
  }

  sweepIdle(cutoff: number, now: number): Sandbox[] {
    const reclaimed: Sandbox[] = []
    for (const sandbox of this.byId.values()) {
      if (sandbox.state !== 'idle' || sandbox.record.lastActiveAt >= cutoff) continue
      const result = this.markReclaiming(sandbox.sandboxId, now)
      if (result !== undefined) reclaimed.push(result)
    }
    return reclaimed
  }

  sweepOrphans(liveEngineIds: ReadonlySet<EngineId>, now: number): Sandbox[] {
    const reclaimed: Sandbox[] = []
    for (const sandbox of this.byId.values()) {
      if (sandbox.state !== 'bound') continue
      const engineId = sandbox.record.engineId
      if (engineId === undefined || liveEngineIds.has(engineId)) continue
      const result = this.markReclaiming(sandbox.sandboxId, now)
      if (result !== undefined) reclaimed.push(result)
    }
    return reclaimed
  }

  private requireById(sandboxId: SandboxId): Sandbox {
    const sandbox = this.byId.get(sandboxId)
    if (sandbox === undefined) invariant(`sandbox ${String(sandboxId)} missing from ledger`)
    return sandbox
  }
}
