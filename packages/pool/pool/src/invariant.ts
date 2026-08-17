/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-pool`.
 * @module @deepseek-ai/dsh-pool/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-pool'

/** Cordis companion plugin name. */
export const name = 'pool-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the pool manager owns its mutable ledger, but the
 * ledger enforces the one-key-one-sandbox and guarded-transition invariants by
 * construction (throw on violation); the value algebra is pinned by unit tests.
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
