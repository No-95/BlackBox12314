require("dotenv").config();

const { ConvexHttpClient } = require("convex/browser");
const { Resend } = require("resend");
const { buildHandshakeEmailHtml } = require("./templates/HandshakeEmail");

async function generateProposal({ companyName, mainProduct, website }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const field = mainProduct || "giải pháp nội thất và thương mại B2B";

  const prompt = [
    "Bạn là chuyên gia chiến lược bán hàng B2B cho HDPHoldings.",
    `Hãy nghiên cứu lĩnh vực hoạt động của công ty này: ${field}.`,
    `Tên công ty: ${companyName}.`,
    website ? `Website: ${website}.` : "",
    "Hãy viết một email đề xuất ngắn, mạnh mẽ, chuyên nghiệp bằng tiếng Việt theo phong cách landing page.",
    "Tập trung vào một nỗi đau cụ thể của ngành và mời họ tham gia buổi Business Roadshow meeting.",
    "Giọng văn: chuyên nghiệp, súc tích, thuyết phục. Phần nội dung tối đa 3 câu.",
    'Chỉ trả về JSON hợp lệ với 2 khóa: "email_subject" và "email_body". Giá trị phải là tiếng Việt tự nhiên.'
  ].filter(Boolean).join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }

  return {
    emailSubject: (parsed.email_subject || `Business Opportunity for ${companyName}`).trim(),
    emailBody: (parsed.email_body || rawText).trim()
  };
}

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const tenantId = process.env.OUTREACH_TENANT_ID || "default";
  const batchSize = Number(process.env.OUTREACH_BATCH_SIZE || 50);
  const maxAttempts = Number(process.env.OUTREACH_MAX_ATTEMPTS || 3);
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME || "Partnership Team";
  const handshakeUrl = process.env.CALENDLY_LINK || process.env.HANDSHAKE_URL || "https://calendly.com";

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL");
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }
  if (!fromEmail) {
    throw new Error("Missing RESEND_FROM_EMAIL");
  }

  const convex = new ConvexHttpClient(convexUrl);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const runRef = `run-${Date.now()}`;

  const runId = await convex.mutation("outreach:createCampaignRun", {
    tenantId,
    runId: runRef
  });

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  try {
    const queued = await convex.query("outreach:listQueuedOutreach", {
      tenantId,
      limit: batchSize
    });

    for (const item of queued) {
      processedCount += 1;

      if (!item.email) {
        skippedCount += 1;
        await convex.mutation("outreach:markFailed", {
          queueId: item._id,
          errorMessage: "Missing recipient email",
          maxAttempts: 1
        });
        continue;
      }

      try {
        let subject = item.emailSubject;
        let body = item.emailBody;

        if (!subject || !body) {
          const draft = await generateProposal({
            companyName: item.companyName,
            mainProduct: item.mainProduct,
            website: item.website
          });
          subject = draft.emailSubject;
          body = draft.emailBody;

          await convex.mutation("outreach:saveGeneratedEmail", {
            queueId: item._id,
            emailSubject: subject,
            emailBody: body
          });
        }

        const html = buildHandshakeEmailHtml({
          companyName: item.companyName,
          valueProp: body,
          handshakeUrl,
          senderName: fromName
        });

        const sendResult = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: [item.email],
          subject,
          html,
          tags: [
            { name: "tenant", value: tenantId },
            { name: "queueId", value: String(item._id) }
          ]
        });

        await convex.mutation("outreach:markSent", {
          queueId: item._id,
          providerMessageId: sendResult.data?.id,
          emailHtml: html
        });

        sentCount += 1;
      } catch (error) {
        await convex.mutation("outreach:markFailed", {
          queueId: item._id,
          errorMessage: String(error.message || error),
          maxAttempts
        });
        failedCount += 1;
      }
    }

    await convex.mutation("outreach:finishCampaignRun", {
      runId,
      status: "completed",
      processedCount,
      sentCount,
      failedCount,
      skippedCount
    });

    console.log({ processedCount, sentCount, failedCount, skippedCount });
  } catch (error) {
    await convex.mutation("outreach:finishCampaignRun", {
      runId,
      status: "failed",
      processedCount,
      sentCount,
      failedCount,
      skippedCount
    });
    throw error;
  }
}

main().catch((error) => {
  console.error("Hourly batch failed:", error.message);
  process.exit(1);
});
