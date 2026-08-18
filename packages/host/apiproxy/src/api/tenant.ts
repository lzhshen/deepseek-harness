/**
 * tenant domain contract: the current-user switch for the multi-tenant POC.
 * The POC current user is a process-scoped simulated roster (design D7); the
 * host-side tenant service owns the roster and current selection, and the
 * listing isolation reads the same selection. A deployment without the tenant
 * service composed answers `internal` on both methods.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** The simulated roster plus the user that currently owns requests. */
export interface TenantView {
  /** Users available to switch between, in roster order. */
  readonly users: readonly string[]
  /** The user that owns requests until the next select. */
  readonly current: string
}

/** One stamp action's user-visible result (the browser echo). */
export interface TenantStampView {
  /** The user whose sandbox and directory were used. */
  readonly userId: string
  /** The sandbox id the pool bound. */
  readonly sandboxId: string
  /** Whether the acquire hit a warm (idle) sandbox rather than a cold claim. */
  readonly warm: boolean
  /** The stamp file's path under the user's directory, for display. */
  readonly file: string
  /** The file content read back, proving the write went to the user's directory. */
  readonly content: string
}

/**
 * Tenant-domain unary methods (the map keys tenant.* of RpcMethodMap).
 * Selecting a user changes which sessions `session.list` returns — the client
 * re-pulls its list after a successful select. `stamp` drives the pooled
 * sandbox for the current user and echoes the user's sandbox/file (design V2).
 */
export interface TenantApi {
  /** Reads the simulated user roster and the current user. */
  list(request: RpcRequest<{}>): Promise<RpcResponse<TenantView>>
  /** Switches the current user to one member of the roster. */
  select(request: RpcRequest<{ userId: string }>): Promise<RpcResponse<{ current: string }>>
  /** Binds the current user's sandbox, writes a stamp file under their directory, and echoes it. */
  stamp(request: RpcRequest<{}>): Promise<RpcResponse<TenantStampView>>
}
