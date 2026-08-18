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

/**
 * Tenant-domain unary methods (the map keys tenant.* of RpcMethodMap).
 * Selecting a user changes which sessions `session.list` returns — the client
 * re-pulls its list after a successful select.
 */
export interface TenantApi {
  /** Reads the simulated user roster and the current user. */
  list(request: RpcRequest<{}>): Promise<RpcResponse<TenantView>>
  /** Switches the current user to one member of the roster. */
  select(request: RpcRequest<{ userId: string }>): Promise<RpcResponse<{ current: string }>>
}
