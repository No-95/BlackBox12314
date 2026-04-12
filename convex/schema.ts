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
    .index("by_memory_key", ["tenantId", "agentName", "memoryKey"])
});
