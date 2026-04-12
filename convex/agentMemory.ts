import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertMemory = mutation({
  args: {
    tenantId: v.string(),
    agentName: v.string(),
    memoryKey: v.string(),
    memoryValue: v.any()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_memory_key", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("agentName", args.agentName)
          .eq("memoryKey", args.memoryKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        memoryValue: args.memoryValue,
        updatedAt: now
      });
      return existing._id;
    }

    return await ctx.db.insert("agentMemory", {
      ...args,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const getMemory = query({
  args: {
    tenantId: v.string(),
    agentName: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMemory")
      .withIndex("by_tenant_agent", (q) =>
        q.eq("tenantId", args.tenantId).eq("agentName", args.agentName)
      )
      .collect();
  }
});
