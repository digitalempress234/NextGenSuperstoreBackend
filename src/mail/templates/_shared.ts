export interface EmailTemplateData {
  recipientName?: string;
  otp?: string;
  expiresInMinutes?: number;
  purposeLabel?: string;
  appName?: string;
  firstName?: string;
  [key: string]: unknown;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const formatNaira = (value: unknown): string => {
  const num = Number(value);
  if (isNaN(num)) return '₦0.00';
  return '&#8358;' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export const statusBadge = (label: string, color = '#FF1B25'): string =>
  `<span style="display:inline-block;padding:4px 14px;border-radius:20px;background:${color};color:#fff;font-size:13px;font-weight:700;letter-spacing:.5px;">${escapeHtml(label)}</span>`;

const BRAND_RED = '#FF1B25';
const BRAND_ORANGE = '#FF7414';
const BRAND_GOLD = '#FFB900';
const BRAND_INK = '#171414';
const BG_LIGHT = '#FFF8EE';
const TEXT_MAIN = BRAND_INK;
const TEXT_MUTED = '#6B625F';
const BORDER = '#F2DFCA';
const SUPPORT_EMAIL_SOURCE =
  process.env.RECEIPT_SUPPORT_EMAIL ?? process.env.MAIL_FROM ?? 'support@superstore.com';
const SUPPORT_EMAIL = SUPPORT_EMAIL_SOURCE.match(/<([^>]+)>/)?.[1] ?? SUPPORT_EMAIL_SOURCE;
const BRAND_LOGO_URL =
  process.env.BRAND_LOGO_URL ??
  'https://res.cloudinary.com/di8higqd1/image/upload/ohoo/branding/email-logo.png';

export const layout = (title: string, body: string, appName = 'OhoO!'): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} - ${escapeHtml(appName)}</title>
</head>
<body style="margin:0;padding:0;background:${BG_LIGHT};font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${TEXT_MAIN};-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG_LIGHT};">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(23,20,20,.08);">

          <!-- ── Header ── -->
          <tr>
            <td style="background:${BG_LIGHT};padding:0;border-top:5px solid ${BRAND_RED};">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:28px 36px;">
                    <!-- Logo wordmark -->
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="padding:4px 0;">
                          <img src="${escapeHtml(BRAND_LOGO_URL)}" width="148" alt="${escapeHtml(appName)}" style="display:block;width:148px;max-width:100%;height:auto;border:0;">
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,${BRAND_RED},${BRAND_ORANGE},${BRAND_GOLD});"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <!-- Page title -->
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:${TEXT_MAIN};line-height:1.3;">${escapeHtml(title)}</h1>
              ${body}
            </td>
          </tr>

          <!-- ── Divider ── -->
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background:${BORDER};"></div>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:24px 36px 32px; text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 6px;font-size:13px;color:${TEXT_MUTED};">
                      This email was sent by <strong style="color:${BRAND_RED};">${escapeHtml(appName)}</strong>. If you have questions, contact
                      <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:${BRAND_ORANGE};text-decoration:none;">${escapeHtml(SUPPORT_EMAIL)}</a>
                    </p>
                    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">
                      &copy; ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.
                      <br>
                      You are receiving this because you have an account with us.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

export const infoBox = (content: string): string =>
  `<div style="background:${BG_LIGHT};border-radius:8px;padding:16px 20px;margin:20px 0;font-size:15px;line-height:1.6;">${content}</div>`;

export const summaryRow = (label: string, value: string, bold = false): string =>
  `<tr>
    <td style="padding:10px 0;font-size:14px;color:#78716c;border-bottom:1px solid #fde8d0;width:45%;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;font-size:14px;color:${BRAND_INK};border-bottom:1px solid ${BORDER};text-align:right;${bold ? `font-weight:700;font-size:16px;color:${BRAND_RED};` : ''}">${value}</td>
  </tr>`;

export const ctaButton = (text: string, href: string): string =>
  `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
    <tr>
      <td style="background:linear-gradient(135deg,${BRAND_RED},${BRAND_ORANGE});border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;font-family:'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.3px;">${escapeHtml(text)}</a>
      </td>
    </tr>
  </table>`;
