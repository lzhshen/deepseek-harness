/**
 * Web tenant switch plugin, node half.
 *
 * Deliberately empty. Multi-tenant identity is a host-side concern (the
 * `@deepseek-ai/dsh-tenant` service and the API gateway's listing isolation);
 * this browser half only renders the current-user switch, so the node half
 * mounts nothing.
 */

/** Host plugin body — no host-side capability lives in this package. */
export function apply(): void {}
