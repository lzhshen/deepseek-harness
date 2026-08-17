/**
 * dsh-tenant-residency's owned branded id: the session identifier a residency
 * claim keys on. Engine identity is borrowed from `@deepseek-ai/dsh-pool`
 * (the orphan-sweep owner), so a brain replica is one value across both.
 * @module @deepseek-ai/dsh-tenant-residency/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one resident session across the residency registry. */
export type SessionId = Branded<'dsh.tenant-residency.SessionId'>

/**
 * Brand a session identifier.
 * @param id - the opaque session identifier.
 * @returns the same string, branded; no validation is performed.
 */
export function SessionId(id: string): SessionId {
  return id as SessionId
}
