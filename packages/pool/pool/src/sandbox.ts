/**
 * The pooled-sandbox entity: an immutable record plus the guarded state
 * transitions of the pool design's state machine
 * (WARM → BOUND → IDLE → RECLAIMING, plus IDLE → BOUND rebind and
 * BOUND → RECLAIMING orphan reclaim). Invalid transitions throw instead of
 * silently corrupting the ledger.
 * @module @deepseek-ai/dsh-pool/sandbox
 */

import type { BindingKey, EngineId, SandboxId } from './brand.ts'
import type { SandboxRecord, SandboxState } from './types.ts'

/** The sandbox-level guard error for an invalid state transition. */
export class SandboxStateError extends Error {
  /** Stable machine-readable failure code. */
  readonly code = 'SANDBOX_STATE' as const

  /**
   * @param sandboxId - the sandbox that rejected the transition.
   * @param from - the state it was in.
   * @param to - the transition it refused.
   */
  constructor(sandboxId: SandboxId, from: SandboxState, to: string) {
    super(`sandbox ${String(sandboxId)} cannot transition ${from} -> ${to}`)
    this.name = 'SandboxStateError'
  }
}

/** An immutable sandbox entity whose transitions produce new entities. */
export class Sandbox {
  /**
   * @param record - the frozen record this entity represents.
   */
  constructor(readonly record: SandboxRecord) {
    Object.freeze(record)
  }

  /** Create a WARM sandbox that just joined the warm pool. */
  static warm(sandboxId: SandboxId, endpoint: string, now: number): Sandbox {
    return new Sandbox({ sandboxId, state: 'warm', endpoint, lastActiveAt: now, createdAt: now })
  }

  get state(): SandboxState {
    return this.record.state
  }

  get sandboxId(): SandboxId {
    return this.record.sandboxId
  }

  get endpoint(): string {
    return this.record.endpoint
  }

  /**
   * Claim a WARM sandbox for a binding key.
   * @param bindingKey - the abstract key to bind to.
   * @param engineId - the engine replica taking the binding.
   * @param userId - the user whose storage directory will be mounted.
   * @param now - epoch milliseconds of the bind.
   * @returns a BOUND entity.
   */
  bind(bindingKey: BindingKey, engineId: EngineId, userId: string, now: number): Sandbox {
    if (this.state !== 'warm') throw new SandboxStateError(this.sandboxId, this.state, 'bind')
    return new Sandbox({
      sandboxId: this.record.sandboxId,
      state: 'bound',
      bindingKey,
      engineId,
      userId,
      endpoint: this.record.endpoint,
      lastActiveAt: now,
      createdAt: this.record.createdAt,
    })
  }

  /**
   * Mark a BOUND sandbox idle (task finished and no online connection).
   * @param now - epoch milliseconds of the idle mark; starts the reclaim countdown.
   * @returns an IDLE entity that drops the engineId.
   */
  idle(now: number): Sandbox {
    if (this.state !== 'bound') throw new SandboxStateError(this.sandboxId, this.state, 'idle')
    const { bindingKey, userId } = this.record
    if (bindingKey === undefined || userId === undefined) throw new SandboxStateError(this.sandboxId, this.state, 'idle')
    return new Sandbox({
      sandboxId: this.record.sandboxId,
      state: 'idle',
      bindingKey,
      userId,
      endpoint: this.record.endpoint,
      lastActiveAt: now,
      createdAt: this.record.createdAt,
    })
  }

  /**
   * Rebind an IDLE sandbox to a new engine replica (warm hit).
   * @param engineId - the engine replica taking over the binding.
   * @param now - epoch milliseconds of the rebind.
   * @returns a BOUND entity keeping the same binding key and user.
   */
  rebind(engineId: EngineId, now: number): Sandbox {
    if (this.state !== 'idle') throw new SandboxStateError(this.sandboxId, this.state, 'rebind')
    const { bindingKey, userId } = this.record
    if (bindingKey === undefined || userId === undefined) throw new SandboxStateError(this.sandboxId, this.state, 'rebind')
    return new Sandbox({
      sandboxId: this.record.sandboxId,
      state: 'bound',
      bindingKey,
      engineId,
      userId,
      endpoint: this.record.endpoint,
      lastActiveAt: now,
      createdAt: this.record.createdAt,
    })
  }

  /**
   * Reset the activity clock without changing state. Applies to BOUND
   * (heartbeat while working) and IDLE (keep-alive extending the countdown).
   * @param now - epoch milliseconds of the heartbeat.
   * @returns an entity with the updated `lastActiveAt`.
   */
  touch(now: number): Sandbox {
    if (this.state !== 'bound' && this.state !== 'idle') {
      throw new SandboxStateError(this.sandboxId, this.state, 'touch')
    }
    return new Sandbox({ ...this.record, lastActiveAt: now })
  }

  /**
   * Move a BOUND or IDLE sandbox into RECLAIMING, dropping its binding.
   * @param now - epoch milliseconds of the reclaim.
   * @returns a RECLAIMING entity.
   */
  reclaim(now: number): Sandbox {
    if (this.state !== 'bound' && this.state !== 'idle') {
      throw new SandboxStateError(this.sandboxId, this.state, 'reclaim')
    }
    return new Sandbox({
      sandboxId: this.record.sandboxId,
      state: 'reclaiming',
      endpoint: this.record.endpoint,
      lastActiveAt: now,
      createdAt: this.record.createdAt,
    })
  }
}
