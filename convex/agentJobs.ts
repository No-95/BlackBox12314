import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createJob = mutation({
  args: {
    tenantId: v.string(),
    workflowName: v.string(),
    payload: v.any()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentJobs", {
      tenantId: args.tenantId,
      workflowName: args.workflowName,
      payload: args.payload,
      status: "queued",
      createdAt: now,
      updatedAt: now
    });
  }
});

export const updateJobStatus = mutation({
  args: {
    jobId: v.id("agentJobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("done")
    ),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      result: args.result,
      errorMessage: args.errorMessage,
      updatedAt: Date.now()
    });
    return args.jobId;
  }
});

export const listTenantJobs = query({
  args: {
    tenantId: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentJobs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
  }
});
