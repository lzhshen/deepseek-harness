/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-pool-dsh`.
 * @module @deepseek-ai/dsh-pool-dsh/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-pool-dsh'

/** Cordis companion plugin name. */
export const name = 'pool-dsh-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the pool manager owns its mutable ledger and enforces
 * one-key-one-sandbox and guarded transitions by construction (`@deepseek-ai/dsh-pool`
 * pins the value algebra); the `ctx.pool` service is a composition host with no
 * independent event or mutable-data relation to cross-check beyond that ledger.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
