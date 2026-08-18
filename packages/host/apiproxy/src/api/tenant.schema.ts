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
