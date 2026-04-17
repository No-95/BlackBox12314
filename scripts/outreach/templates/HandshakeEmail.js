function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHandshakeEmailHtml({
  companyName,
  valueProp,
  handshakeUrl,
  senderName,
  designStyle
}) {
  const safeCompany = escapeHtml(companyName || "your team");
  const safeValue = escapeHtml(valueProp || "We can help you unlock faster growth with focused execution.");
  const safeHandshakeUrl = escapeHtml(handshakeUrl || "#");
  const safeSender = escapeHtml(senderName || "Partner Team");

  const presets = {
    vercel: {
      label: "Bản chào mời phong cách Vercel",
      hero: "linear-gradient(135deg,#0a0f1c,#2563eb)",
      surface: "#f6f9ff",
      accent: "#2563eb",
      cta: "Đặt lịch bắt tay hợp tác"
    },
    landing: {
      label: "Chiến dịch email kiểu landing page",
      hero: "linear-gradient(135deg,#0f4c81,#2a8bd9)",
      surface: "#f5f9ff",
      accent: "#0f4c81",
      cta: "Xem lộ trình tăng trưởng"
    },
    executive: {
      label: "Bản tóm tắt tối giản cho lãnh đạo",
      hero: "linear-gradient(135deg,#243447,#425a74)",
      surface: "#fbfcfe",
      accent: "#243447",
      cta: "Đặt lịch trao đổi nhanh"
    }
  };

  const preset = presets[designStyle] || presets.vercel;

  return `<!doctype html>
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
              <td style="padding:34px 30px;background:${preset.hero};color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.9;">${preset.label}</p>
                <h1 style="margin:0;font-size:30px;line-height:1.2;">${safeCompany}, hãy biến sự quan tâm của khách hàng thành các cuộc hẹn chất lượng.</h1>
                <p style="margin:14px 0 0;font-size:15px;line-height:1.7;opacity:0.95;">Đây là lời mời theo phong cách landing page giúp đội ngũ của bạn khám phá cơ hội tăng trưởng nhanh hơn.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px;">
                  <tr>
                    <td style="padding:0 6px 8px 0;">
                      <div style="background:${preset.surface};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Trọng tâm</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Nguồn khách hàng chất lượng</div>
                      </div>
                    </td>
                    <td style="padding:0 6px 8px 6px;">
                      <div style="background:${preset.surface};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Kết quả</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Lộ trình 30 ngày rõ ràng</div>
                      </div>
                    </td>
                    <td style="padding:0 0 8px 6px;">
                      <div style="background:${preset.surface};border:1px solid #d7e6f6;border-radius:12px;padding:12px;">
                        <div style="font-size:12px;color:#5b6d86;text-transform:uppercase;letter-spacing:0.8px;">Bước tiếp theo</div>
                        <div style="font-size:15px;font-weight:700;color:#10233d;margin-top:4px;">Trao đổi 15 phút</div>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="border:1px solid #d8e2ef;border-radius:12px;padding:16px 18px;background:${preset.surface};">
                  <p style="margin:0;font-size:16px;line-height:1.8;color:#1e2f46;">${safeValue}</p>
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
                    <td style="border-radius:10px;background:${preset.accent};">
                      <a href="${safeHandshakeUrl}" target="_blank" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">${preset.cta}</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:14px;line-height:1.7;color:#4f6079;">Best regards,<br/>${safeSender}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  buildHandshakeEmailHtml
};
