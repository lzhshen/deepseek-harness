/**
 * dsh-pool's owned branded ids: sandbox identity, the abstract binding key,
 * and the engine replica that holds a binding. The `Branded<B>` primitive
 * lives in `@deepseek-ai/dsh-brand` so each id is nominal at the type level
 * while remaining an ordinary string at runtime.
 * @module @deepseek-ai/dsh-pool/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one pooled sandbox (K8s Pod) across the ledger and the PodFactory. */
export type SandboxId = Branded<'dsh.pool.SandboxId'>

/**
 * Brand a sandbox identifier.
 * @param id - the opaque sandbox identifier.
 * @returns the same string, branded; no validation is performed.
 */
export function SandboxId(id: string): SandboxId {
  return id as SandboxId
}

/**
 * The abstract key a sandbox binds to. The POC fixes it to the user id; the
 * ledger never inspects its contents, so switching to "user + conversation"
 * later needs no ledger change.
 */
export type BindingKey = Branded<'dsh.pool.BindingKey'>

/**
 * Brand a binding key.
 * @param key - the opaque binding key value.
 * @returns the same string, branded; no validation is performed.
 */
export function BindingKey(key: string): BindingKey {
  return key as BindingKey
}

/** Identity of one brain replica (engine process) for orphan reconciliation. */
export type EngineId = Branded<'dsh.pool.EngineId'>

/**
 * Brand an engine identifier.
 * @param id - the opaque engine replica identifier.
 * @returns the same string, branded; no validation is performed.
 */
export function EngineId(id: string): EngineId {
  return id as EngineId
}
