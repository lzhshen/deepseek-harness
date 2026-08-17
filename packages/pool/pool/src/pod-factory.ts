/**
 * The PodFactory contract: the pool manager's only handle on the execution
 * substrate. The POC ships a fake in-process factory; a K8s implementation
 * creates real prewarmed Pods, mounts the user's CFS subPath on bind, and
 * destroys them on reclaim.
 * @module @deepseek-ai/dsh-pool/pod-factory
 */

import type { SandboxId } from './brand.ts'

/** What a freshly created sandbox Pod exposes to the pool. */
export interface PodSpec {
  readonly sandboxId: SandboxId
  readonly endpoint: string
}

/** Lifecycle operations the pool manager needs from the Pod substrate. */
export interface PodFactory {
  /**
   * Create a prewarmed sandbox Pod and return its identity and endpoint.
   * @returns the ready Pod spec.
   */
  create(): Promise<PodSpec>

  /**
   * Mount one user's storage directory into a sandbox before it serves work.
   * @param sandboxId - the sandbox to mount into.
   * @param userId - the user whose directory is mounted (CFS subPath).
   */
  mount(sandboxId: SandboxId, userId: string): Promise<void>

  /**
   * Destroy a sandbox Pod. The pool manager only calls this after the ledger
   * has marked the sandbox RECLAIMING.
   * @param sandboxId - the sandbox to destroy.
   */
  destroy(sandboxId: SandboxId): Promise<void>
}
