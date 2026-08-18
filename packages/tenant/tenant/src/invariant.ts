/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tenant`.
 * @module @deepseek-ai/dsh-tenant/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tenant'

/** Cordis companion plugin name. */
export const name = 'tenant-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the service owns a mutable current-user fact and
 * three pure attribution helpers whose contracts (`defaultUserId` in the
 * roster, unknown-user rejection, userId read from the header) are enforced
 * synchronously in the constructor and `selectUser` and proven by the
 * service's spec. Session attribution itself is enforced at the listing
 * boundary (the apiproxy summary path), which emits no event this companion
 * could observe; that boundary's spec asserts the isolation relation.
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
