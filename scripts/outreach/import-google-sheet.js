require("dotenv").config();

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { ConvexHttpClient } = require("convex/browser");

const CHUNK_SIZE = 100;

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

function mapRow(headers, row) {
  const item = {};
  headers.forEach((header, idx) => {
    item[header] = row[idx] || "";
  });

  return {
    stt: String(item.stt || "").trim() || undefined,
    companyName: String(item.company_name || item.company || "").trim(),
    address: String(item.address || "").trim() || undefined,
    phone: String(item.phone || "").trim() || undefined,
    hotline: String(item.hotline || "").trim() || undefined,
    sdtHotline: String(item.sdt_hotline || "").trim() || undefined,
    email: String(item.email || "").trim() || undefined,
    mainProduct: String(item.main_product || item.field || "").trim() || undefined,
    website: String(item.website || "").trim() || undefined,
    contactPerson: String(item.contact_person || "").trim() || undefined
  };
}

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetRange = process.env.GOOGLE_SHEET_RANGE || "Sheet1!A1:Z";
  const tenantId = process.env.OUTREACH_TENANT_ID || "default";
  const runId = process.env.OUTREACH_RUN_ID || `import-${Date.now()}`;

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL");
  }
  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  const serviceAccount = getServiceAccount();

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: sheetRange
  });

  const values = result.data.values || [];
  if (values.length < 2) {
    throw new Error("No data rows found in Google Sheet");
  }

  const headers = values[0].map(normalizeHeader);
  const rows = values.slice(1).map((row) => mapRow(headers, row));

  const client = new ConvexHttpClient(convexUrl);

  let imported = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const resultChunk = await client.mutation("outreach:upsertOutreachCompanies", {
      tenantId,
      runId,
      rows: chunk
    });

    imported += resultChunk.total;
    console.log(`Imported chunk ${i / CHUNK_SIZE + 1}:`, resultChunk);
  }

  console.log(`Done. Total processed rows: ${imported}`);
}

main().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
