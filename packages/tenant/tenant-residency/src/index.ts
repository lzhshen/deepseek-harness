/**
 * dsh-tenant-residency: which brain replica holds which session. A pure
 * library with no Cordis service; the tenant plugin wraps
 * {@link ResidencyRegistry} and drives it from resume/evict events.
 * @module @deepseek-ai/dsh-tenant-residency
 */

export { SessionId } from './brand.ts'
export type { ClaimOutcome, Resident, ResidencyConfig, ResidencyStats } from './residency.ts'
export { ResidencyRegistry, validateResidencyConfig } from './residency.ts'
