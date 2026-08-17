/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tenant-residency`.
 * @module @deepseek-ai/dsh-tenant-residency/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tenant-residency'

/** Cordis companion plugin name. */
export const name = 'tenant-residency-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the registry enforces one-session-one-owner by
 * construction (claim redirects instead of double-residing), and its value
 * algebra is pinned by unit tests.
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
