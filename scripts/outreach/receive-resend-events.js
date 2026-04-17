require("dotenv").config();

const express = require("express");
const { ConvexHttpClient } = require("convex/browser");

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = Number(process.env.RESEND_WEBHOOK_PORT || 8090);
const tenantId = process.env.OUTREACH_TENANT_ID || "default";
const convexUrl = process.env.CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing CONVEX_URL");
}

const convex = new ConvexHttpClient(convexUrl);

function mapEventType(rawType) {
  const value = String(rawType || "").toLowerCase();
  if (value.includes("open")) return "opened";
  if (value.includes("click")) return "clicked";
  if (value.includes("bounce")) return "bounced";
  if (value.includes("complain")) return "complained";
  if (value.includes("deliver")) return "delivered";
  return "sent";
}

app.post("/webhooks/resend", async (req, res) => {
  try {
    const payload = req.body || {};
    const tags = payload.data?.tags || [];
    const queueTag = tags.find((t) => String(t.name).toLowerCase() === "queueid");
    const queueId = queueTag?.value;

    if (!queueId) {
      return res.status(200).json({ ok: true, ignored: "missing queueId tag" });
    }

    await convex.mutation("outreach:recordEmailEvent", {
      tenantId,
      queueId,
      eventType: mapEventType(payload.type),
      eventAt: payload.created_at ? new Date(payload.created_at).getTime() : Date.now(),
      metadata: payload
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "resend-events-receiver" });
});

app.listen(PORT, () => {
  console.log(`Resend webhook receiver running on :${PORT}`);
});
