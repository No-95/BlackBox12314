"""
sales.py — Python port of all sales team functions from server.js.

Dependencies (pip install):
    python-dotenv httpx google-auth google-api-python-client resend
"""

import json
import math
import os
import re
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from resend import Resend

# ── Load .env from repo root ─────────────────────────────────────────────────
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# ── Constants ────────────────────────────────────────────────────────────────
CHUNK_SIZE = 100
QUEUE_LIMIT = 5

CONVEX_URL: str = os.getenv("CONVEX_URL", "")
TENANT_ID: str = os.getenv("OUTREACH_TENANT_ID", "default")


# ── String helpers ────────────────────────────────────────────────────────────

def normalize_header(header) -> str:
    return re.sub(r"\s+", "_", str(header or "").strip().lower())


def normalize_text(value) -> str:
    return str(value or "").strip()


def normalize_email(value) -> str:
    tokens = [t.strip().lower() for t in re.split(r"[;,]", normalize_text(value)) if t.strip()]
    return next((t for t in tokens if "@" in t), "")


def parse_stt(value) -> float:
    cleaned = re.sub(r"[^\d.-]", "", str(value or ""))
    try:
        n = float(cleaned)
        return n if math.isfinite(n) and n > 0 else float("inf")
    except ValueError:
        return float("inf")


def extract_sheet_id(value: str) -> str:
    raw = str(value or os.getenv("GOOGLE_SHEET_ID", "")).strip()
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", raw)
    return match.group(1) if match else raw


def extract_gid(value: str) -> str | None:
    match = re.search(r"[?&#]gid=(\d+)", str(value or ""))
    return match.group(1) if match else None


def format_sheet_range(title: str) -> str:
    safe = str(title or "Sheet1").replace("'", "''")
    return f"'{safe}'!A1:Z"


def map_row(headers: list, row: list) -> dict:
    item = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
    return {
        "stt": normalize_text(item.get("stt")) or None,
        "companyName": normalize_text(item.get("company_name") or item.get("company")),
        "address": normalize_text(item.get("address")) or None,
        "phone": normalize_text(item.get("phone")) or None,
        "hotline": normalize_text(item.get("hotline")) or None,
        "sdtHotline": normalize_text(item.get("sdt_hotline")) or None,
        "email": normalize_email(item.get("email", "")) or None,
        "mainProduct": normalize_text(item.get("main_product") or item.get("field")) or None,
        "website": normalize_text(item.get("website")) or None,
        "contactPerson": normalize_text(item.get("contact_person")) or None,
    }


def fallback_draft(company_name: str, main_product: str) -> dict:
    safe_company = company_name or "quý công ty"
    safe_field = main_product or "giải pháp nội thất và thương mại B2B"
    return {
        "emailSubject": f"Lời mời hợp tác dành cho {safe_company}",
        "emailBody": (
            f"{safe_company} đang hoạt động trong lĩnh vực {safe_field}. "
            "Chúng tôi muốn chia sẻ một hướng tiếp cận ngắn gọn để giúp đội ngũ tạo thêm "
            "các cuộc hẹn chất lượng và mở rộng tệp khách hàng phù hợp. "
            "Anh chị có sẵn sàng cho một cuộc trao đổi nhanh trong tuần này không?"
        ),
    }


# ── Google Sheets ─────────────────────────────────────────────────────────────

def get_service_account_credentials():
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise ValueError("Missing GOOGLE_SERVICE_ACCOUNT_JSON")
    file_path = Path(raw)
    data = json.loads(file_path.read_text()) if file_path.exists() else json.loads(raw)
    return service_account.Credentials.from_service_account_info(
        data,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )


def preview_google_sheet(sheet_url: str) -> dict:
    spreadsheet_id = extract_sheet_id(sheet_url)
    if not spreadsheet_id:
        raise ValueError("Paste a valid Google Sheet URL or set GOOGLE_SHEET_ID in .env.")

    creds = get_service_account_credentials()
    service = build("sheets", "v4", credentials=creds)

    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    gid = extract_gid(sheet_url)

    sheet_title = (meta.get("sheets") or [{}])[0].get("properties", {}).get("title", "Sheet1")
    if gid:
        for sheet in meta.get("sheets", []):
            if str(sheet["properties"]["sheetId"]) == gid:
                sheet_title = sheet["properties"]["title"]
                break

    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=format_sheet_range(sheet_title))
        .execute()
    )

    values = result.get("values", [])
    if len(values) < 2:
        return {
            "sheetId": spreadsheet_id,
            "sheetTitle": sheet_title,
            "totalRows": 0,
            "validEmails": 0,
            "rows": [],
        }

    headers = [normalize_header(h) for h in values[0]]
    rows = sorted(
        [
            r
            for r in (map_row(headers, row) for row in values[1:])
            if r.get("stt") or r.get("companyName") or r.get("email")
        ],
        key=lambda r: parse_stt(r.get("stt")),
    )

    return {
        "sheetId": spreadsheet_id,
        "sheetTitle": sheet_title,
        "totalRows": len(rows),
        "validEmails": sum(1 for r in rows if r.get("email")),
        "rows": rows,
    }


# ── Convex HTTP client ────────────────────────────────────────────────────────

def _convex_request(kind: str, path: str, args: dict):
    if not CONVEX_URL:
        raise RuntimeError("CONVEX_URL is not configured. Add it to .env before calling Convex.")
    url = f"{CONVEX_URL.rstrip('/')}/api/{kind}"
    resp = httpx.post(url, json={"path": path, "args": args}, timeout=30)
    resp.raise_for_status()
    return resp.json().get("value")


def convex_query(path: str, args: dict):
    return _convex_request("query", path, args)


def convex_mutation(path: str, args: dict):
    return _convex_request("mutation", path, args)


# ── AI email drafting (ChatAnywhere) ──────────────────────────────────────────

def _get_openai_compat_config() -> dict:
    api_key = normalize_text(os.getenv("OPENAI_API_KEY") or os.getenv("CHATANYWHERE_API_KEY") or "")
    base_url = normalize_text(os.getenv("OPENAI_BASE_URL") or "https://api.chatanywhere.tech/v1").rstrip("/")
    model = normalize_text(os.getenv("AI_DRAFT_MODEL") or os.getenv("OPENAI_DRAFT_MODEL") or "gpt-4o-mini")
    return {"apiKey": api_key, "baseUrl": base_url, "model": model}


def _build_sales_draft_prompt(company_name: str, main_product: str, website: str = "") -> str:
    field = main_product or "giải pháp nội thất và thương mại B2B"
    lines = [
        "Bạn là chuyên gia chiến lược bán hàng B2B cho HDPHoldings.",
        f"Hãy nghiên cứu lĩnh vực hoạt động của công ty này: {field}.",
        f"Tên công ty: {company_name}.",
    ]
    if website:
        lines.append(f"Website: {website}.")
    lines += [
        "Hãy viết một email đề xuất ngắn, mạnh mẽ, chuyên nghiệp bằng tiếng Việt theo phong cách landing page.",
        "Tập trung vào một nỗi đau cụ thể của ngành và mời họ tham gia buổi Business Roadshow meeting.",
        "Giọng văn: chuyên nghiệp, súc tích, thuyết phục. Phần nội dung tối đa 3 câu.",
        'Chỉ trả về JSON hợp lệ với 2 khóa: "email_subject" và "email_body". Giá trị phải là tiếng Việt tự nhiên.',
    ]
    return "\n".join(lines)


def _parse_draft_json(raw_text: str, company_name: str, main_product: str) -> dict:
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        parsed = {}
    return {
        "emailSubject": (parsed.get("email_subject") or f"Đề xuất hợp tác cho {company_name}").strip(),
        "emailBody": (
            (parsed.get("email_body") or "").strip()
            or fallback_draft(company_name, main_product)["emailBody"]
        ),
    }


def generate_proposal(company_name: str, main_product: str, website: str = "") -> dict:
    config = _get_openai_compat_config()
    if not config["apiKey"]:
        return fallback_draft(company_name, main_product)

    prompt = _build_sales_draft_prompt(company_name, main_product, website)
    try:
        resp = httpx.post(
            f"{config['baseUrl']}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config['apiKey']}",
            },
            json={
                "model": config["model"],
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        raw_text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "{}")
        return _parse_draft_json(raw_text, company_name, main_product)
    except Exception:
        return fallback_draft(company_name, main_product)


# ── Convex record operations ──────────────────────────────────────────────────

def import_rows_to_convex(rows: list) -> int:
    imported = 0
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        result = convex_mutation(
            "outreach:upsertOutreachCompanies",
            {
                "tenantId": TENANT_ID,
                "runId": f"dashboard-{int(datetime.now().timestamp() * 1000)}-{i}",
                "rows": chunk,
            },
        )
        if isinstance(result, dict):
            imported += result.get("total", 0)
    return imported


def get_record_bundle(queue_id: str) -> dict:
    data = convex_query("outreach:getOutreachRecord", {"tenantId": TENANT_ID, "queueId": queue_id})
    if not data or not data.get("record"):
        raise ValueError("Record not found.")
    return data


def prepare_record_draft(queue_id: str, design_style: str = None) -> dict:
    bundle = get_record_bundle(queue_id)
    record = bundle["record"]

    subject = record.get("emailSubject")
    body = record.get("emailBody")

    if not subject or not body:
        draft = generate_proposal(
            company_name=record.get("companyName", ""),
            main_product=record.get("mainProduct", ""),
            website=record.get("website", ""),
        )
        subject = draft["emailSubject"]
        body = draft["emailBody"]
        convex_mutation(
            "outreach:saveGeneratedEmail",
            {"queueId": queue_id, "emailSubject": subject, "emailBody": body},
        )

    handshake_url = os.getenv("CALENDLY_LINK") or os.getenv("HANDSHAKE_URL") or "https://calendly.com"
    sender_name = os.getenv("RESEND_FROM_NAME") or "Partnership Team"
    refreshed = get_record_bundle(queue_id)

    email_html = build_handshake_email_html(
        company_name=record.get("companyName", ""),
        value_prop=body,
        handshake_url=handshake_url,
        sender_name=sender_name,
        design_style=design_style,
    )

    return {
        **refreshed,
        "record": {
            **refreshed["record"],
            "emailSubject": subject,
            "emailBody": body,
            "emailHtml": email_html,
        },
    }


def queue_next_five_companies(sheet_url: str) -> dict:
    preview = preview_google_sheet(sheet_url)
    existing = convex_query("outreach:listOutreachRecords", {"tenantId": TENANT_ID, "limit": 500}) or []

    active_keys = {
        normalize_email(r["email"])
        for r in existing
        if r.get("status") in ("drafted", "sent") and r.get("email")
    }

    next_rows = [
        r
        for r in preview["rows"]
        if r.get("companyName") and r.get("email") and normalize_email(r["email"]) not in active_keys
    ][:QUEUE_LIMIT]

    if not next_rows:
        return {
            "ok": True,
            "sheetTitle": preview["sheetTitle"],
            "totalRows": preview["totalRows"],
            "validEmails": preview["validEmails"],
            "queued": 0,
            "prepared": 0,
            "companies": [],
        }

    import_rows_to_convex(next_rows)

    refreshed = convex_query("outreach:listOutreachRecords", {"tenantId": TENANT_ID, "limit": 500}) or []
    lookup = {normalize_email(r["email"]): r for r in refreshed if r.get("email")}

    prepared = 0
    for row in next_rows:
        matched = lookup.get(normalize_email(row.get("email", "")))
        if matched and matched.get("_id"):
            prepare_record_draft(matched["_id"])
            prepared += 1

    return {
        "ok": True,
        "sheetTitle": preview["sheetTitle"],
        "totalRows": preview["totalRows"],
        "validEmails": preview["validEmails"],
        "queued": len(next_rows),
        "prepared": prepared,
        "companies": [
            {"stt": r.get("stt"), "companyName": r.get("companyName"), "email": r.get("email")}
            for r in next_rows
        ],
    }


def send_prepared_email(queue_id: str, override_to: str = None, design_style: str = None) -> dict:
    from_email = os.getenv("RESEND_FROM_EMAIL")
    from_name = os.getenv("RESEND_FROM_NAME") or "Partnership Team"
    resend_api_key = os.getenv("RESEND_API_KEY")
    recipient = normalize_email(override_to or "")

    if not resend_api_key:
        raise ValueError("Missing RESEND_API_KEY")
    if not from_email:
        raise ValueError("Missing RESEND_FROM_EMAIL")

    bundle = prepare_record_draft(queue_id, design_style=design_style)
    record = bundle["record"]
    to = recipient or normalize_email(record.get("email", ""))

    if not to:
        raise ValueError("No valid recipient email was found.")

    resend_client = Resend(resend_api_key)
    send_result = resend_client.emails.send({
        "from": f"{from_name} <{from_email}>",
        "to": [to],
        "subject": record["emailSubject"],
        "html": record["emailHtml"],
        "tags": [
            {"name": "tenant", "value": TENANT_ID},
            {"name": "queueId", "value": str(queue_id)},
        ],
    })

    provider_id = getattr(send_result, "id", None)

    convex_mutation(
        "outreach:markSent",
        {"queueId": queue_id, "providerMessageId": provider_id, "emailHtml": record["emailHtml"]},
    )

    return {"ok": True, "to": to, "providerMessageId": provider_id}


def get_dashboard_metrics() -> dict:
    return convex_query("outreach:getDashboardMetrics", {"tenantId": TENANT_ID}) or {}


def list_records(status: str = None, limit: int = 200) -> list:
    args: dict = {"tenantId": TENANT_ID, "limit": limit}
    if status:
        args["status"] = status
    return convex_query("outreach:listOutreachRecords", args) or []


def mark_replied(queue_id: str, note: str = None) -> dict:
    args: dict = {"tenantId": TENANT_ID, "queueId": queue_id}
    if note:
        args["note"] = note
    convex_mutation("outreach:markReplied", args)
    return {"ok": True}


# ── Email HTML template ───────────────────────────────────────────────────────

def _escape_html(value) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


_PRESETS = {
    "vercel": {
        "label": "Bản chào mời phong cách Vercel",
        "hero": "linear-gradient(135deg,#0a0f1c,#2563eb)",
        "surface": "#f6f9ff",
        "accent": "#2563eb",
        "cta": "Đặt lịch bắt tay hợp tác",
    },
    "landing": {
        "label": "Chiến dịch email kiểu landing page",
        "hero": "linear-gradient(135deg,#0f4c81,#2a8bd9)",
        "surface": "#f5f9ff",
        "accent": "#0f4c81",
        "cta": "Xem lộ trình tăng trưởng",
    },
    "executive": {
        "label": "Bản tóm tắt tối giản cho lãnh đạo",
        "hero": "linear-gradient(135deg,#243447,#425a74)",
        "surface": "#fbfcfe",
        "accent": "#243447",
        "cta": "Đặt lịch trao đổi nhanh",
    },
}


def build_handshake_email_html(
    company_name: str,
    value_prop: str,
    handshake_url: str,
    sender_name: str,
    design_style: str = None,
) -> str:
    safe_company = _escape_html(company_name or "your team")
    safe_value = _escape_html(value_prop or "We can help you unlock faster growth with focused execution.")
    safe_url = _escape_html(handshake_url or "#")
    safe_sender = _escape_html(sender_name or "Partner Team")
    p = _PRESETS.get(design_style) or _PRESETS["vercel"]

    return f"""<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Handshake Proposal</title>
  </head>
  <body style="margin:0;padding:0;background:#eef4fb;font-family:Arial,sans-serif;color:#10233d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#eef4fb;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(16,35,61,0.10);">
            <tr>
              <td style="padding:34px 30px;background:{p['hero']};color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.9;">{p['label']}</p>
                <h1 style="margin:0;font-size:30px;line-height:1.2;">{safe_company}, hãy biến sự quan tâm của khách hàng thành các cuộc hẹn chất lượng.</h1>
                <p style="margin:14px 0 0;font-size:15px;line-height:1.7;opacity:0.95;">Đây là lời mời theo phong cách landing page giúp đội ngũ của bạn khám phá cơ hội tăng trưởng nhanh hơn.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px;">
                  <tr>
                    <td style="padding:0 6px 8px 0;">
                      <div style="background:{p['surface']};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Trọng tâm</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Nguồn khách hàng chất lượng</div>
                      </div>
                    </td>
                    <td style="padding:0 6px 8px 6px;">
                      <div style="background:{p['surface']};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Kết quả</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Lộ trình 30 ngày rõ ràng</div>
                      </div>
                    </td>
                    <td style="padding:0 0 8px 6px;">
                      <div style="background:{p['surface']};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Bước tiếp theo</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Trao đổi 15 phút</div>
                      </div>
                    </td>
                  </tr>
                </table>
                <div style="border:1px solid #d8e2ef;border-radius:12px;padding:16px 18px;background:{p['surface']};">
                  <p style="margin:0;font-size:16px;line-height:1.8;color:#1e2f46;">{safe_value}</p>
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid #d8e2ef;border-radius:12px;background:#f9fbfe;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#10233d;">Bạn sẽ nhận được gì sau một cuộc trao đổi ngắn</p>
                      <p style="margin:0;font-size:14px;line-height:1.7;color:#3b4c63;">Một khung workshop rõ ràng, các cơ hội cải thiện nhanh và lộ trình hành động sát với lĩnh vực kinh doanh của bạn.</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 18px;">
                  <tr>
                    <td style="border-radius:10px;background:{p['accent']};">
                      <a href="{safe_url}" target="_blank" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">{p['cta']}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#4f6079;">Best regards,<br/>{safe_sender}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
