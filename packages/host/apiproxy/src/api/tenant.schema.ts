/**
 * tenant domain zod schemas (names derived from map keys:
 * tenantListRequestSchema / tenantListValueSchema /
 * tenantSelectRequestSchema / tenantSelectValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** tenant.list request payload. */
export const tenantListRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.list'>>>

/** tenant.list response value. */
export const tenantListViewSchema = z.object({
  users: z.array(z.string().min(1)),
  current: z.string().min(1),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.list'>>>

/** tenant.select request payload. */
export const tenantSelectRequestSchema = z.object({
  userId: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.select'>>>

/** tenant.select response value. */
export const tenantSelectValueSchema = z.object({
  current: z.string().min(1),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.select'>>>

/** tenant.stamp request payload. */
export const tenantStampRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.stamp'>>>

/** tenant.stamp response value. */
export const tenantStampValueSchema = z.object({
  userId: z.string().min(1),
  sandboxId: z.string(),
  warm: z.boolean(),
  file: z.string(),
  content: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.stamp'>>>

/** tenant.poolStats request payload. */
export const tenantPoolStatsRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.poolStats'>>>

/** tenant.poolStats response value. */
export const tenantPoolStatsValueSchema = z.object({
  warm: z.number().int().nonnegative(),
  bound: z.number().int().nonnegative(),
  idle: z.number().int().nonnegative(),
  reclaiming: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  reclaimTotal: z.number().int().nonnegative(),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.poolStats'>>>

/** tenant.release request payload. */
export const tenantReleaseRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.release'>>>

/** tenant.release response value. */
export const tenantReleaseValueSchema = z.object({
  released: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.release'>>>

/** tenant.reclaim request payload. */
export const tenantReclaimRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'tenant.reclaim'>>>

/** tenant.reclaim response value. */
export const tenantReclaimValueSchema = z.object({
  reclaimed: z.number().int().nonnegative(),
}) satisfies z.ZodType<Wire<ResponseValue<'tenant.reclaim'>>>
