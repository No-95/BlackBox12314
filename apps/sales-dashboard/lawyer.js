const fs = require("fs");
const path = require("path");

function normalizeText(value) {
  return String(value || "").trim();
}

function getLawyerChatConfig() {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY || process.env.CHATANYWHERE_API_KEY || "");
  const baseUrl = normalizeText(process.env.OPENAI_BASE_URL || "https://api.chatanywhere.tech/v1").replace(/\/+$/, "");
  const model = normalizeText(process.env.LAWYER_MODEL || process.env.AI_DRAFT_MODEL || "gpt-4o-mini");
  return { apiKey, baseUrl, model };
}

function loadLawyerSystemPrompt() {
  const promptPath = path.resolve(__dirname, "../../prompts/team-phap-che-system-prompt.md");
  try {
    return fs.readFileSync(promptPath, "utf8");
  } catch {
    return [
      "You are Team Phap Che, a legal and compliance AI auditor for business marketing, sales, and contract outputs in Vietnam.",
      "This agent is not a licensed lawyer and must state that final legal approval requires human counsel for high-risk matters.",
      "Respond in Vietnamese unless the user writes in another language."
    ].join("\n");
  }
}

function buildLawyerMessages(systemPrompt, history, message) {
  return [
    { role: "system", content: systemPrompt },
    ...history
      .filter((item) => item && (item.role === "user" || item.role === "assistant"))
      .slice(-20)
      .map((item) => ({
        role: item.role,
        content: normalizeText(item.content)
      })),
    { role: "user", content: message }
  ];
}

async function streamChatAnywhere({ config, messages, res }) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    res.write(`data: ${JSON.stringify({
      error: `ChatAnywhere error ${response.status}: ${errorText.slice(0, 300)}`
    })}\n\n`);
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      if (payload === "[DONE]") {
        res.write("data: [DONE]\n\n");
        continue;
      }

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content || "";
        if (delta) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      } catch {
        // Ignore malformed stream chunks.
      }
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
}

function registerLawyerRoutes(app) {
  const systemPrompt = loadLawyerSystemPrompt();

  app.post("/api/lawyer/chat", async (req, res) => {
    const config = getLawyerChatConfig();
    if (!config.apiKey) {
      return res.status(500).json({
        error: "Chưa cấu hình OPENAI_API_KEY (ChatAnywhere) cho Luật sư."
      });
    }

    const message = normalizeText(req.body?.message);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const wantStream = req.body?.stream === true;

    if (!message) {
      return res.status(400).json({ error: "Tin nhắn không được để trống." });
    }

    const messages = buildLawyerMessages(systemPrompt, history, message);

    try {
      if (wantStream) {
        await streamChatAnywhere({ config, messages, res });
        return;
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(502).json({
          error: `ChatAnywhere error ${response.status}: ${errorText.slice(0, 300)}`
        });
      }

      const data = await response.json();
      const reply = normalizeText(data?.choices?.[0]?.message?.content);
      return res.json({ reply: reply || "Không nhận được phản hồi từ mô hình." });
    } catch (error) {
      if (wantStream && !res.headersSent) {
        res.status(500);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.write(`data: ${JSON.stringify({ error: error.message || "Không thể kết nối ChatAnywhere." })}\n\n`);
        res.end();
        return;
      }

      return res.status(500).json({
        error: error.message || "Không thể kết nối ChatAnywhere."
      });
    }
  });
}

module.exports = { registerLawyerRoutes };
