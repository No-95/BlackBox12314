import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentJobs: defineTable({
    tenantId: v.string(),
    workflowName: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("done")
    ),
    payload: v.any(),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_tenant", ["tenantId"]),

  agentMemory: defineTable({
    tenantId: v.string(),
    agentName: v.string(),
    memoryKey: v.string(),
    memoryValue: v.any(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_tenant_agent", ["tenantId", "agentName"])
    .index("by_memory_key", ["tenantId", "agentName", "memoryKey"]),

  outreachQueue: defineTable({
    tenantId: v.string(),
    runId: v.optional(v.string()),
    stt: v.optional(v.string()),
    companyName: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    hotline: v.optional(v.string()),
    sdtHotline: v.optional(v.string()),
    email: v.optional(v.string()),
    mainProduct: v.optional(v.string()),
    website: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("drafted"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
    emailHtml: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attemptCount: v.number(),
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_status", ["tenantId", "status", "updatedAt"])
    .index("by_email", ["tenantId", "email"])
    .index("by_run", ["tenantId", "runId"]),

  emailEvents: defineTable({
    tenantId: v.string(),
    queueId: v.id("outreachQueue"),
    eventType: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("replied"),
      v.literal("complained")
    ),
    eventAt: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number()
  })
    .index("by_queue", ["tenantId", "queueId", "eventAt"])
    .index("by_type", ["tenantId", "eventType", "eventAt"]),

  campaignRuns: defineTable({
    tenantId: v.string(),
    runId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    processedCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_tenant_started", ["tenantId", "startedAt"])
});
