require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { Resend } = require("resend");
const { ConvexHttpClient } = require("convex/browser");
const { buildHandshakeEmailHtml } = require("../../scripts/outreach/templates/HandshakeEmail");

const CHUNK_SIZE = 100;
const QUEUE_LIMIT = 5;

const app = express();
app.use(express.json({ limit: "2mb" }));

const convexUrl = process.env.CONVEX_URL;
const tenantId = process.env.OUTREACH_TENANT_ID || "default";
const port = Number(process.env.SALES_DASHBOARD_PORT || 5177);
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

function ensureConvex(res) {
  if (!convex) {
    res.status(500).json({
      error: "CONVEX_URL is not configured. Add it to .env before using dashboard APIs."
    });
    return false;
  }
  return true;
}

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const filePath = path.resolve(raw);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  return JSON.parse(raw);
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const tokens = normalizeText(value)
    .split(/[;,]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const valid = tokens.find((token) => token.includes("@"));
  return valid || "";
}

function mapRow(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    item[header] = row[index] || "";
  });

  return {
    stt: normalizeText(item.stt) || undefined,
    companyName: normalizeText(item.company_name || item.company),
    address: normalizeText(item.address) || undefined,
    phone: normalizeText(item.phone) || undefined,
    hotline: normalizeText(item.hotline) || undefined,
    sdtHotline: normalizeText(item.sdt_hotline) || undefined,
    email: normalizeEmail(item.email) || undefined,
    mainProduct: normalizeText(item.main_product || item.field) || undefined,
    website: normalizeText(item.website) || undefined,
    contactPerson: normalizeText(item.contact_person) || undefined
  };
}

function parseStt(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.MAX_SAFE_INTEGER;
}

function extractSheetId(value) {
  const input = String(value || process.env.GOOGLE_SHEET_ID || "").trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input;
}

function extractGid(value) {
  const input = String(value || "").trim();
  const match = input.match(/[?&#]gid=(\d+)/);
  return match ? match[1] : null;
}

function formatSheetRange(title) {
  return `'${String(title || "Sheet1").replace(/'/g, "''")}'!A1:Z`;
}

function fallbackDraft({ companyName, mainProduct }) {
  const safeCompany = companyName || "quý công ty";
  const safeField = mainProduct || "giải pháp nội thất và thương mại B2B";
  return {
    emailSubject: `Lời mời hợp tác dành cho ${safeCompany}`,
    emailBody: `${safeCompany} đang hoạt động trong lĩnh vực ${safeField}. Chúng tôi muốn chia sẻ một hướng tiếp cận ngắn gọn để giúp đội ngũ tạo thêm các cuộc hẹn chất lượng và mở rộng tệp khách hàng phù hợp. Anh chị có sẵn sàng cho một cuộc trao đổi nhanh trong tuần này không?`
  };
}

async function generateProposal({ companyName, mainProduct, website }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackDraft({ companyName, mainProduct });
  }

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

  try {
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
      throw new Error(`Gemini error ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }

    return {
      emailSubject: (parsed.email_subject || `Business opportunity for ${companyName}`).trim(),
      emailBody: (parsed.email_body || rawText || fallbackDraft({ companyName, mainProduct }).emailBody).trim()
    };
  } catch {
    return fallbackDraft({ companyName, mainProduct });
  }
}

async function previewGoogleSheet(sheetUrl) {
  const spreadsheetId = extractSheetId(sheetUrl);
  if (!spreadsheetId) {
    throw new Error("Paste a valid Google Sheet URL or set GOOGLE_SHEET_ID in .env.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccount(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const gid = extractGid(sheetUrl);

  let sheetTitle = sheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
  if (gid) {
    const matched = sheetMeta.data.sheets?.find(
      (sheet) => String(sheet.properties?.sheetId) === gid
    );
    if (matched?.properties?.title) {
      sheetTitle = matched.properties.title;
    }
  }

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: formatSheetRange(sheetTitle)
  });

  const values = result.data.values || [];
  if (values.length < 2) {
    return {
      sheetId: spreadsheetId,
      sheetTitle,
      totalRows: 0,
      validEmails: 0,
      rows: []
    };
  }

  const headers = values[0].map(normalizeHeader);
  const rows = values.slice(1)
    .map((row) => mapRow(headers, row))
    .filter((row) => row.stt || row.companyName || row.email)
    .sort((a, b) => parseStt(a.stt) - parseStt(b.stt));

  return {
    sheetId: spreadsheetId,
    sheetTitle,
    totalRows: rows.length,
    validEmails: rows.filter((row) => Boolean(row.email)).length,
    rows
  };
}

async function importRowsToConvex(rows) {
  let imported = 0;
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const result = await convex.mutation("outreach:upsertOutreachCompanies", {
      tenantId,
      runId: `dashboard-${Date.now()}-${index}`,
      rows: chunk
    });
    imported += result.total;
  }
  return imported;
}

async function getRecordBundle(queueId) {
  const data = await convex.query("outreach:getOutreachRecord", {
    tenantId,
    queueId
  });

  if (!data?.record) {
    throw new Error("Record not found.");
  }

  return data;
}

async function prepareRecordDraft(queueId, options = {}) {
  const { record } = await getRecordBundle(queueId);

  let subject = record.emailSubject;
  let body = record.emailBody;

  if (!subject || !body) {
    const draft = await generateProposal({
      companyName: record.companyName,
      mainProduct: record.mainProduct,
      website: record.website
    });

    subject = draft.emailSubject;
    body = draft.emailBody;

    await convex.mutation("outreach:saveGeneratedEmail", {
      queueId,
      emailSubject: subject,
      emailBody: body
    });
  }

  const handshakeUrl = process.env.CALENDLY_LINK || process.env.HANDSHAKE_URL || "https://calendly.com";
  const senderName = process.env.RESEND_FROM_NAME || "Partnership Team";
  const refreshed = await getRecordBundle(queueId);

  return {
    ...refreshed,
    record: {
      ...refreshed.record,
      emailSubject: subject,
      emailBody: body,
      emailHtml: buildHandshakeEmailHtml({
        companyName: record.companyName,
        valueProp: body,
        handshakeUrl,
        senderName,
        designStyle: options.designStyle
      })
    }
  };
}

async function queueNextFiveCompanies(sheetUrl) {
  const preview = await previewGoogleSheet(sheetUrl);
  const existing = await convex.query("outreach:listOutreachRecords", {
    tenantId,
    limit: 500
  });

  const activeKeys = new Set(
    existing
      .filter((record) => ["drafted", "sent"].includes(record.status))
      .map((record) => normalizeEmail(record.email))
      .filter(Boolean)
  );

  const nextRows = preview.rows
    .filter((row) => row.companyName && row.email)
    .filter((row) => !activeKeys.has(normalizeEmail(row.email)))
    .slice(0, QUEUE_LIMIT);

  if (!nextRows.length) {
    return {
      ok: true,
      sheetTitle: preview.sheetTitle,
      totalRows: preview.totalRows,
      validEmails: preview.validEmails,
      queued: 0,
      prepared: 0,
      companies: []
    };
  }

  await importRowsToConvex(nextRows);

  const refreshed = await convex.query("outreach:listOutreachRecords", {
    tenantId,
    limit: 500
  });

  const lookup = new Map(
    refreshed
      .filter((record) => Boolean(normalizeEmail(record.email)))
      .map((record) => [normalizeEmail(record.email), record])
  );

  let prepared = 0;
  for (const row of nextRows) {
    const matched = lookup.get(normalizeEmail(row.email));
    if (!matched?._id) continue;
    await prepareRecordDraft(matched._id);
    prepared += 1;
  }

  return {
    ok: true,
    sheetTitle: preview.sheetTitle,
    totalRows: preview.totalRows,
    validEmails: preview.validEmails,
    queued: nextRows.length,
    prepared,
    companies: nextRows.map((row) => ({
      stt: row.stt,
      companyName: row.companyName,
      email: row.email
    }))
  };
}

function addDays(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function formatYmd(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function getMarketingDashboard(options = {}) {
  const niche = normalizeText(options.niche) || "Nội thất, vật liệu và giải pháp B2B";
  const audience = normalizeText(options.audience) || "CEO, trưởng phòng kinh doanh, trưởng bộ phận mua hàng";
  const offer = normalizeText(options.offer) || "Business Roadshow và gói tăng trưởng lead chất lượng";
  const channels = String(options.channels || "LinkedIn, Facebook, Email, Website")
    .split(/[;,\n]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 5);

  let salesMetrics = null;
  if (convex) {
    try {
      salesMetrics = await convex.query("outreach:getDashboardMetrics", { tenantId });
    } catch {
      salesMetrics = null;
    }
  }

  const qualifiedConversations = Math.max(
    6,
    Number(salesMetrics?.sent || 0) > 0
      ? Math.round((Number(salesMetrics.sent || 0) * Math.max(Number(salesMetrics.replyRate || 8), 8)) / 100)
      : 6
  );
  const meetingsBooked = Math.max(2, Math.round(qualifiedConversations * 0.35));
  const postsPublished = 12;
  const engagementRate = 4.8;
  const contentLeadConversion = 3.2;
  const today = new Date();
  const campaignId = `MKT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const trends = [
    {
      trend: `Nhu cầu số hoá quy trình mua hàng trong ngành ${niche}`,
      whyNow: "Doanh nghiệp đang siết chi phí và ưu tiên đối tác tạo ra kết quả đo lường được.",
      channel: channels[0] || "LinkedIn",
      confidence: 88,
      hook: "Checklist 5 điểm nghẽn khiến đội bán hàng bỏ lỡ khách chất lượng"
    },
    {
      trend: "Ra quyết định B2B ngày càng cần nội dung ngắn, rõ ROI",
      whyNow: "Người mua cấp quản lý muốn thấy case thực tế, số liệu và lời mời hành động cụ thể.",
      channel: channels[1] || "Facebook",
      confidence: 82,
      hook: "Bài carousel: từ traffic sang cuộc hẹn chất lượng trong 14 ngày"
    },
    {
      trend: `Chủ đề về ${offer} đang phù hợp để mở cuộc trò chuyện đầu phễu`,
      whyNow: "Tỷ lệ phản hồi tăng hơn khi thông điệp gắn với một đề xuất ngắn và thời gian triển khai rõ ràng.",
      channel: channels[2] || "Email",
      confidence: 79,
      hook: "Mẫu email 3 câu dành cho CEO bận rộn"
    }
  ];

  const contentPlan = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    const stages = ["Nhận biết", "Cân nhắc", "Chuyển đổi", "Nuôi dưỡng"];
    const formats = ["Bài insight", "Carousel", "Video ngắn", "Email", "Case study", "Checklist", "Bài chốt CTA"];
    return {
      date: formatYmd(date),
      theme: `${index + 1}. ${trends[index % trends.length].hook}`,
      funnel: stages[index % stages.length],
      format: formats[index % formats.length],
      channel: channels[index % channels.length] || "LinkedIn",
      owner: ["Trend Scout", "Content Strategist", "Copywriter", "Social Media Manager"][index % 4],
      status: index < 2 ? "Sẵn sàng đăng" : index < 5 ? "Đang soạn" : "Chờ duyệt"
    };
  });

  const pipeline = [
    {
      agent: "Trend Scout",
      schedule: "08:00",
      status: "done",
      output: "3 xu hướng B2B ưu tiên",
      note: `Quét ${niche} và gom tín hiệu thị trường mỗi 6 giờ.`
    },
    {
      agent: "Content Strategist",
      schedule: "09:00",
      status: "active",
      output: "Kế hoạch nội dung 7 ngày",
      note: `Bám ICP ${audience}.`
    },
    {
      agent: "Copywriter",
      schedule: "10:00",
      status: "active",
      output: "Bản nháp đa kênh",
      note: "Viết nội dung súc tích, CTA rõ và đúng giọng thương hiệu."
    },
    {
      agent: "Brand + Legal QA",
      schedule: "13:00",
      status: "review",
      output: "Điểm brand và điểm rủi ro",
      note: "Chỉ cho đăng khi brand_score >= 8 và legal_risk <= 3."
    },
    {
      agent: "Social Media Manager",
      schedule: "15:00",
      status: "queued",
      output: "Lịch đăng đa nền tảng",
      note: "Đưa bài đạt chuẩn vào hàng đợi phân phối."
    },
    {
      agent: "Analytics Agent",
      schedule: "18:00",
      status: "queued",
      output: "Báo cáo tối ưu hoá",
      note: "Tóm tắt bài hiệu quả nhất và đề xuất ngày hôm sau."
    }
  ];

  const alerts = [
    "2 nội dung đang chờ rà soát pháp lý trước khi lên lịch.",
    `Kênh ưu tiên tuần này: ${channels.join(", ")}.`,
    `Ưu đãi chính đang chạy: ${offer}.`
  ];

  return {
    summary: {
      campaignId,
      niche,
      audience,
      offer,
      channels
    },
    kpis: {
      trendSignals: 12,
      postsPublished,
      approvedPosts: 9,
      scheduledPosts: 7,
      engagementRate,
      qualifiedConversations,
      meetingsBooked,
      contentLeadConversion
    },
    pipeline,
    trends,
    contentPlan,
    alerts
  };
}

function buildPollinationsImageUrl(prompt, width = 1280, height = 900, seed = Date.now()) {
  const safePrompt = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${safePrompt}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&safe=true`;
}

function getImageProviderMeta(name) {
  const provider = String(name || "gpt-image-1").toLowerCase();
  const catalog = {
    "gpt-image-1": { label: "GPT Image 1", env: "OPENAI_API_KEY" },
    imagen: { label: "Google Imagen", env: "GOOGLE_IMAGEN_API_KEY" },
    recraft: { label: "Recraft", env: "RECRAFT_API_KEY" },
    flux: { label: "Flux Pro", env: "FLUX_API_KEY" }
  };
  return catalog[provider] || catalog["gpt-image-1"];
}

function getVideoProviderMeta(name) {
  const provider = String(name || "kling").toLowerCase();
  const catalog = {
    kling: { label: "Kling", env: "KLING_API_KEY" },
    runway: { label: "Runway", env: "RUNWAY_API_KEY" },
    veo: { label: "Google Veo", env: "VEO_API_KEY" }
  };
  return catalog[provider] || catalog.kling;
}

function hasProviderAccess(meta, allowFallback = false) {
  if (allowFallback) {
    return true;
  }
  return Boolean(meta?.env && process.env[meta.env]);
}

function buildRenderJob({ wantsVideo, wantsImage, imageProviderMeta, videoProviderMeta, videoBuilder, posterUrl }) {
  if (!wantsVideo) {
    return {
      status: "not-required",
      statusText: "Không cần render video cho brief này",
      outputNote: "Brief hiện chỉ yêu cầu ảnh.",
      steps: []
    };
  }

  const videoReady = hasProviderAccess(videoProviderMeta);
  return {
    status: videoReady ? "queued" : "preview-ready",
    statusText: videoReady
      ? `Đã chuyển storyboard sang ${videoProviderMeta.label}`
      : `Đã chuẩn bị pipeline video, đang chờ API key của ${videoProviderMeta.label}`,
    outputNote: videoReady
      ? `Hệ thống đang dựng video bằng ${videoProviderMeta.label}.`
      : `Hiện mới chạy ở chế độ preview. Thêm ${videoProviderMeta.env} để xuất video thật tự động.`,
    posterUrl,
    steps: [
      {
        name: "Brief to storyboard",
        status: "done",
        note: `${videoBuilder?.scenes?.length || 0} cảnh đã được tạo.`
      },
      {
        name: `Image routing via ${imageProviderMeta.label}`,
        status: wantsImage ? "done" : "queued",
        note: wantsImage ? "Ảnh đã được phân tuyến cho từng cảnh." : "Không cần ảnh cho luồng này."
      },
      {
        name: `Video creator handoff to ${videoProviderMeta.label}`,
        status: videoReady ? "active" : "review",
        note: videoReady ? "Render job đã vào hàng đợi." : `Thiếu ${videoProviderMeta.env} để render thật.`
      },
      {
        name: "Voice and final polish",
        status: process.env.ELEVENLABS_API_KEY ? "queued" : "review",
        note: process.env.ELEVENLABS_API_KEY ? "Sẵn sàng thêm voiceover và polish." : "Có thể thêm ELEVENLABS_API_KEY để hoàn tất voiceover."
      }
    ]
  };
}

function buildVideoStructure({ prompt, duration, channels, visualStyle, inputMode, uploadedImages, wantsImage, wantsVideo }) {
  const baseScenes = [
    {
      scene: 1,
      title: "Hook mở đầu",
      objective: "Thu hút sự chú ý trong 3 giây đầu",
      duration: "0-5s",
      visualNeed: "Khung hình hero nổi bật"
    },
    {
      scene: 2,
      title: "Nêu vấn đề",
      objective: "Cho người xem thấy nỗi đau hoặc bối cảnh",
      duration: "5-12s",
      visualNeed: "Ảnh hoặc cảnh minh họa vấn đề"
    },
    {
      scene: 3,
      title: "Giải pháp và lợi ích",
      objective: "Giới thiệu sản phẩm hoặc giá trị chính",
      duration: "12-22s",
      visualNeed: "Ảnh sản phẩm, visual giải pháp, motion text"
    },
    {
      scene: 4,
      title: "CTA kết thúc",
      objective: "Kêu gọi người xem hành động",
      duration: duration || "22-30s",
      visualNeed: "Cảnh chốt thương hiệu và CTA"
    }
  ];

  const useUploads = ["upload", "hybrid"].includes(inputMode);
  const useGenerated = ["generate", "hybrid"].includes(inputMode);

  const scenes = baseScenes.map((item, index) => {
    const uploaded = uploadedImages[index] || null;
    const sourceType = uploaded
      ? "Ảnh đã tải lên"
      : useGenerated && wantsImage
        ? "Ảnh tự tạo"
        : useUploads
          ? "Chờ ảnh tải lên"
          : wantsVideo
            ? "Storyboard video"
            : "Visual tĩnh";

    return {
      ...item,
      sourceType,
      assetSuggestion: uploaded
        ? uploaded.name
        : `${item.title} · ${visualStyle}`,
      direction: `${prompt}. Cảnh ${item.scene} theo phong cách ${visualStyle}, phù hợp cho ${channels.join(", ") || "social media"}.`
    };
  });

  return {
    modeLabel:
      inputMode === "upload"
        ? "Ưu tiên ảnh tải lên"
        : inputMode === "generate"
          ? "Tự tạo toàn bộ ảnh"
          : "Kết hợp ảnh tải lên và ảnh tự tạo",
    scenes,
    assetManifest: scenes.map((scene) => ({
      scene: scene.scene,
      sourceType: scene.sourceType,
      selectedAsset: scene.assetSuggestion,
      status: scene.sourceType === "Chờ ảnh tải lên" ? "Cần bổ sung" : "Sẵn sàng đưa vào video creator"
    }))
  };
}

function getContentCreatorDashboard(options = {}) {
  const prompt = normalizeText(options.prompt) || "Tạo bộ nội dung quảng bá cho sản phẩm nội thất cao cấp";
  const assetType = normalizeText(options.assetType) || "both";
  const visualStyle = normalizeText(options.visualStyle) || "Hiện đại, cao cấp, tối giản";
  const duration = normalizeText(options.duration) || "30-45 giây";
  const inputMode = normalizeText(options.inputMode || "hybrid").toLowerCase();
  const imageProvider = normalizeText(options.imageProvider || "gpt-image-1").toLowerCase();
  const videoProvider = normalizeText(options.videoProvider || "kling").toLowerCase();
  const uploadedImages = Array.isArray(options.uploadedImages)
    ? options.uploadedImages
        .map((item, index) => ({
          name: normalizeText(item?.name) || `Upload ${index + 1}`
        }))
        .slice(0, 6)
    : [];
  const channels = String(options.channels || "Facebook, TikTok, Website")
    .split(/[;,\n]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 5);

  const wantsImage = ["image", "both"].includes(assetType);
  const wantsVideo = ["video", "both"].includes(assetType);
  const imageProviderMeta = getImageProviderMeta(imageProvider);
  const videoProviderMeta = getVideoProviderMeta(videoProvider);
  const imagePrompt = `Tạo ảnh quảng bá theo brief: ${prompt}. Phong cách ${visualStyle}. Ánh sáng studio, bố cục premium, chi tiết sắc nét, phù hợp cho ${channels.join(", ")}.`;
  const videoPrompt = `Tạo video ngắn ${duration} cho brief: ${prompt}. Nhịp dựng nhanh, mở đầu hút mắt trong 3 giây đầu, kết thúc bằng CTA rõ ràng. Phong cách ${visualStyle}.`;

  const assets = [];
  if (wantsImage) {
    assets.push(
      {
        type: "Ảnh hero",
        deliverable: "3 key visual tĩnh cho landing page và bài quảng cáo",
        tool: imageProviderMeta.label,
        format: "1:1, 4:5, 16:9",
        status: "Đang tạo ảnh"
      },
      {
        type: "Ảnh social",
        deliverable: "5 ảnh thumbnail và banner social",
        tool: imageProviderMeta.label,
        format: "4:5",
        status: "Đang tạo ảnh"
      }
    );
  }

  if (wantsVideo) {
    assets.push(
      {
        type: "Video ngắn",
        deliverable: `1 video promo ${duration}`,
        tool: videoProviderMeta.label,
        format: "9:16 / 16:9",
        status: hasProviderAccess(videoProviderMeta) ? `Sẵn sàng gọi ${videoProviderMeta.label}` : "Đang dựng storyboard"
      },
      {
        type: "Voiceover",
        deliverable: "1 bản giọng đọc chuyên nghiệp",
        tool: "ElevenLabs",
        format: "MP3 / WAV",
        status: process.env.ELEVENLABS_API_KEY ? "Sẵn sàng tạo voice" : "Chờ cấu hình ElevenLabs"
      }
    );
  }

  const heroSeed = Math.floor(Date.now() / 1000);
  const squareSeed = heroSeed + 17;
  const posterPrompt = `${prompt}. Poster frame điện ảnh, ánh sáng đẹp, có điểm nhấn thương hiệu. ${visualStyle}`;
  const videoBuilder = buildVideoStructure({
    prompt,
    duration,
    channels,
    visualStyle,
    inputMode,
    uploadedImages,
    wantsImage,
    wantsVideo
  });

  return {
    summary: {
      prompt,
      assetType,
      visualStyle,
      duration,
      inputMode,
      imageProvider,
      videoProvider,
      channels
    },
    kpis: {
      requestedAssets: assets.length,
      imageTasks: wantsImage ? 2 : 0,
      videoTasks: wantsVideo ? 2 : 0,
      uploadedAssets: uploadedImages.length,
      readyToday: Math.max(2, assets.length),
      priority: wantsVideo && wantsImage ? "Cao" : "Trung bình"
    },
    tools: [
      {
        name: imageProviderMeta.label,
        role: "Tạo ảnh sản phẩm, banner và key visual",
        status: wantsImage ? "active" : "queued"
      },
      {
        name: videoProviderMeta.label,
        role: "Tạo video ngắn và motion quảng bá",
        status: wantsVideo ? "active" : "queued"
      },
      {
        name: "ElevenLabs",
        role: "Tạo voiceover và lời dẫn",
        status: wantsVideo ? "review" : "queued"
      },
      {
        name: "CapCut",
        role: "Biên tập cuối, ghép chữ, nhạc và subtitle",
        status: "done"
      }
    ],
    assets,
    prompts: {
      imagePrompt,
      videoPrompt,
      voicePrompt: `Thu voiceover tiếng Việt, giọng chuyên nghiệp và thuyết phục cho nội dung: ${prompt}. Thời lượng khoảng ${duration}.`,
      editPrompt: `Biên tập bản cuối trong CapCut với subtitle rõ, nhịp cắt nhanh, giữ nhận diện thương hiệu và CTA mạnh.`
    },
    providers: {
      image: {
        name: imageProviderMeta.label,
        env: imageProviderMeta.env,
        ready: hasProviderAccess(imageProviderMeta, imageProvider === "flux")
      },
      video: {
        name: videoProviderMeta.label,
        env: videoProviderMeta.env,
        ready: hasProviderAccess(videoProviderMeta)
      }
    },
    videoBuilder,
    renderJob: buildRenderJob({
      wantsVideo,
      wantsImage,
      imageProviderMeta,
      videoProviderMeta,
      videoBuilder,
      posterUrl: buildPollinationsImageUrl(posterPrompt, 1280, 720, heroSeed + 33)
    }),
    previews: {
      images: wantsImage
        ? [
            {
              label: "Hero Visual",
              url: buildPollinationsImageUrl(`${imagePrompt}. Tỉ lệ 16:9`, 1280, 720, heroSeed),
              caption: visualStyle
            },
            {
              label: "Social Banner",
              url: buildPollinationsImageUrl(`${imagePrompt}. Tỉ lệ 4:5`, 1024, 1280, squareSeed),
              caption: channels.join(", ") || "Social"
            }
          ]
        : [],
      video: wantsVideo
        ? {
            enabled: hasProviderAccess(videoProviderMeta),
            posterUrl: buildPollinationsImageUrl(posterPrompt, 1280, 720, heroSeed + 33),
            duration,
            note: hasProviderAccess(videoProviderMeta)
              ? `${videoProviderMeta.label} đã sẵn sàng để nối video thật bằng API key hiện có.`
              : `Hiện đang hiển thị storyboard video. Thêm ${videoProviderMeta.env} để xuất video thật tự động.`,
            scenes: [
              "Hook mạnh trong 3 giây đầu",
              "Nêu điểm khác biệt và lợi ích chính",
              "Kết bằng CTA rõ ràng"
            ]
          }
        : null
    }
  };
}

async function sendPreparedEmail(queueId, overrideTo, options = {}) {
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME || "Partnership Team";
  const resendApiKey = process.env.RESEND_API_KEY;
  const recipient = normalizeEmail(overrideTo);

  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  if (!fromEmail) {
    throw new Error("Missing RESEND_FROM_EMAIL");
  }

  const bundle = await prepareRecordDraft(queueId, options);
  const record = bundle.record;
  const to = recipient || normalizeEmail(record.email);

  if (!to) {
    throw new Error("No valid recipient email was found.");
  }

  const resend = new Resend(resendApiKey);
  const sendResult = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: record.emailSubject,
    html: record.emailHtml,
    tags: [
      { name: "tenant", value: tenantId },
      { name: "queueId", value: String(queueId) }
    ]
  });

  await convex.mutation("outreach:markSent", {
    queueId,
    providerMessageId: sendResult.data?.id,
    emailHtml: record.emailHtml
  });

  return {
    ok: true,
    to,
    providerMessageId: sendResult.data?.id
  };
}

app.get("/api/metrics", async (_req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const data = await convex.query("outreach:getDashboardMetrics", { tenantId });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sheet/preview", async (req, res) => {
  try {
    const data = await previewGoogleSheet(req.body?.sheetUrl);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/sheet/queue", async (req, res) => {
  if (!ensureConvex(res)) return;

  try {
    const result = await queueNextFiveCompanies(req.body?.sheetUrl);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/sheet/import", async (req, res) => {
  if (!ensureConvex(res)) return;

  try {
    const result = await queueNextFiveCompanies(req.body?.sheetUrl);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/records", async (req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const data = await convex.query("outreach:listOutreachRecords", {
      tenantId,
      status,
      limit
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/records/:id", async (req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const data = await getRecordBundle(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/records/:id/prepare", async (req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const data = await prepareRecordDraft(req.params.id, {
      designStyle: req.body?.designStyle
    });
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/records/:id/send", async (req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const data = await sendPreparedEmail(req.params.id, req.body?.to, {
      designStyle: req.body?.designStyle
    });
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/records/:id/replied", async (req, res) => {
  if (!ensureConvex(res)) return;
  try {
    const note = typeof req.body.note === "string" ? req.body.note : undefined;
    await convex.mutation("outreach:markReplied", {
      tenantId,
      queueId: req.params.id,
      note
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/marketing/dashboard", async (_req, res) => {
  try {
    const data = await getMarketingDashboard();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/marketing/plan", async (req, res) => {
  try {
    const data = await getMarketingDashboard(req.body || {});
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/content-creator/dashboard", (_req, res) => {
  try {
    const data = getContentCreatorDashboard();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/content-creator/plan", (req, res) => {
  try {
    const data = getContentCreatorDashboard(req.body || {});
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/content-creator/render", (req, res) => {
  try {
    const data = getContentCreatorDashboard(req.body || {});
    res.json({
      ok: true,
      summary: data.summary,
      previews: data.previews,
      renderJob: data.renderJob
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Sales dashboard is running on http://localhost:${port}`);
});
