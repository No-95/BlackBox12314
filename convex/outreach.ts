import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type OutreachStatus = "queued" | "drafted" | "sent" | "failed" | "skipped";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeEmail(value?: string | null) {
  const email = normalizeText(value).toLowerCase();
  if (!email || !email.includes("@")) {
    return "";
  }
  return email;
}

export const upsertOutreachCompanies = mutation({
  args: {
    tenantId: v.string(),
    runId: v.optional(v.string()),
    rows: v.array(
      v.object({
        stt: v.optional(v.string()),
        companyName: v.string(),
        address: v.optional(v.string()),
        phone: v.optional(v.string()),
        hotline: v.optional(v.string()),
        sdtHotline: v.optional(v.string()),
        email: v.optional(v.string()),
        mainProduct: v.optional(v.string()),
        website: v.optional(v.string()),
        contactPerson: v.optional(v.string())
      })
    )
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of args.rows) {
      const companyName = normalizeText(row.companyName);
      if (!companyName) {
        skipped += 1;
        continue;
      }

      const email = normalizeEmail(row.email);
      const status: OutreachStatus = email ? "queued" : "skipped";
      let existing = null;

      if (email) {
        existing = await ctx.db
          .query("outreachQueue")
          .withIndex("by_email", (q) =>
            q.eq("tenantId", args.tenantId).eq("email", email)
          )
          .first();
      }

      const payload = {
        tenantId: args.tenantId,
        runId: args.runId,
        stt: row.stt,
        companyName,
        address: normalizeText(row.address) || undefined,
        phone: normalizeText(row.phone) || undefined,
        hotline: normalizeText(row.hotline) || undefined,
        sdtHotline: normalizeText(row.sdtHotline) || undefined,
        email: email || undefined,
        mainProduct: normalizeText(row.mainProduct) || undefined,
        website: normalizeText(row.website) || undefined,
        contactPerson: normalizeText(row.contactPerson) || undefined,
        status,
        updatedAt: now
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("outreachQueue", {
          ...payload,
          attemptCount: 0,
          createdAt: now
        });
        inserted += 1;
      }
    }

    return { inserted, updated, skipped, total: args.rows.length };
  }
});

export const listQueuedOutreach = query({
  args: {
    tenantId: v.string(),
    limit: v.number()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outreachQueue")
      .withIndex("by_status", (q) =>
        q.eq("tenantId", args.tenantId).eq("status", "queued")
      )
      .order("asc")
      .take(args.limit);
  }
});

export const listOutreachRecords = query({
  args: {
    tenantId: v.string(),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("drafted"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("skipped")
      )
    ),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    if (args.status) {
      return await ctx.db
        .query("outreachQueue")
        .withIndex("by_status", (q) =>
          q.eq("tenantId", args.tenantId).eq("status", args.status!)
        )
        .order("desc")
        .take(limit);
    }

    const all = await ctx.db
      .query("outreachQueue")
      .withIndex("by_status", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
});

export const getOutreachRecord = query({
  args: {
    tenantId: v.string(),
    queueId: v.id("outreachQueue")
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.queueId);
    if (!record || record.tenantId !== args.tenantId) {
      return null;
    }

    const events = await ctx.db
      .query("emailEvents")
      .withIndex("by_queue", (q) =>
        q.eq("tenantId", args.tenantId).eq("queueId", args.queueId)
      )
      .collect();

    return {
      record,
      events: events.sort((a, b) => a.eventAt - b.eventAt)
    };
  }
});

export const saveGeneratedEmail = mutation({
  args: {
    queueId: v.id("outreachQueue"),
    emailSubject: v.string(),
    emailBody: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.queueId, {
      emailSubject: args.emailSubject,
      emailBody: args.emailBody,
      status: "drafted",
      updatedAt: now
    });
    return args.queueId;
  }
});

export const markSent = mutation({
  args: {
    queueId: v.id("outreachQueue"),
    providerMessageId: v.optional(v.string()),
    emailHtml: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.queueId, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      emailHtml: args.emailHtml,
      sentAt: now,
      lastAttemptAt: now,
      updatedAt: now,
      errorMessage: undefined
    });

    const record = await ctx.db.get(args.queueId);
    if (record) {
      await ctx.db.insert("emailEvents", {
        tenantId: record.tenantId,
        queueId: args.queueId,
        eventType: "sent",
        eventAt: now,
        createdAt: now
      });
    }

    return args.queueId;
  }
});

export const markFailed = mutation({
  args: {
    queueId: v.id("outreachQueue"),
    errorMessage: v.string(),
    maxAttempts: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const record = await ctx.db.get(args.queueId);
    if (!record) {
      return null;
    }

    const attemptCount = (record.attemptCount ?? 0) + 1;
    const nextStatus: OutreachStatus = attemptCount >= args.maxAttempts ? "failed" : "queued";

    await ctx.db.patch(args.queueId, {
      attemptCount,
      status: nextStatus,
      errorMessage: args.errorMessage,
      lastAttemptAt: now,
      updatedAt: now
    });

    return args.queueId;
  }
});

export const markReplied = mutation({
  args: {
    tenantId: v.string(),
    queueId: v.id("outreachQueue"),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.queueId);
    if (!record || record.tenantId !== args.tenantId) {
      return null;
    }

    const now = Date.now();
    await ctx.db.insert("emailEvents", {
      tenantId: args.tenantId,
      queueId: args.queueId,
      eventType: "replied",
      eventAt: now,
      metadata: args.note ? { note: args.note } : undefined,
      createdAt: now
    });

    return args.queueId;
  }
});

export const createCampaignRun = mutation({
  args: {
    tenantId: v.string(),
    runId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("campaignRuns", {
      tenantId: args.tenantId,
      runId: args.runId,
      status: "running",
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      startedAt: now,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const finishCampaignRun = mutation({
  args: {
    runId: v.id("campaignRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    processedCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      processedCount: args.processedCount,
      sentCount: args.sentCount,
      failedCount: args.failedCount,
      skippedCount: args.skippedCount,
      finishedAt: now,
      updatedAt: now
    });
    return args.runId;
  }
});

export const getDashboardMetrics = query({
  args: {
    tenantId: v.string()
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("outreachQueue")
      .withIndex("by_status", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    const events = await ctx.db
      .query("emailEvents")
      .withIndex("by_type", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    const sent = records.filter((r) => r.status === "sent").length;
    const opened = events.filter((e) => e.eventType === "opened").length;
    const clicked = events.filter((e) => e.eventType === "clicked").length;
    const replied = events.filter((e) => e.eventType === "replied").length;
    const bounced = events.filter((e) => e.eventType === "bounced").length;

    const asRate = (num: number, denom: number) => (denom > 0 ? Number(((num / denom) * 100).toFixed(2)) : 0);

    return {
      total: records.length,
      queued: records.filter((r) => r.status === "queued").length,
      drafted: records.filter((r) => r.status === "drafted").length,
      sent,
      failed: records.filter((r) => r.status === "failed").length,
      skipped: records.filter((r) => r.status === "skipped").length,
      openRate: asRate(opened, sent),
      clickRate: asRate(clicked, sent),
      replyRate: asRate(replied, sent),
      bounceRate: asRate(bounced, sent)
    };
  }
});

export const recordEmailEvent = mutation({
  args: {
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
    eventAt: v.optional(v.number()),
    metadata: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("emailEvents", {
      tenantId: args.tenantId,
      queueId: args.queueId,
      eventType: args.eventType,
      eventAt: args.eventAt ?? now,
      metadata: args.metadata,
      createdAt: now
    });
  }
});


