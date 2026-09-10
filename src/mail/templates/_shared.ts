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

// ─── Utilities ────────────────────────────────────────────────────────────────

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/** Format a number as Nigerian Naira, e.g. ₦12,500.00 */
export const formatNaira = (value: unknown): string => {
  const num = Number(value);
  if (isNaN(num)) return '₦0.00';
  return '&#8358;' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** Render a coloured status pill */
export const statusBadge = (label: string, color = '#f97316'): string =>
  `<span style="display:inline-block;padding:4px 14px;border-radius:20px;background:${color};color:#fff;font-size:13px;font-weight:700;letter-spacing:.5px;">${escapeHtml(label)}</span>`;

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const BRAND_ORANGE = '#f97316';
const BRAND_DARK   = '#7c2d12';
const BG_LIGHT     = '#fff7ed';
const TEXT_MAIN    = '#1c1917';
const TEXT_MUTED   = '#78716c';
const BORDER       = '#fed7aa';

// ─── Layout ───────────────────────────────────────────────────────────────────

export const layout = (title: string, body: string, appName = 'Superstore'): string => `
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
               style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(249,115,22,.10);">

          <!-- ── Header ── -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_ORANGE} 0%,${BRAND_DARK} 100%);padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:28px 36px;">
                    <!-- Logo wordmark -->
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="background:#fff;border-radius:8px;padding:6px 14px;">
                          <span style="font-size:20px;font-weight:800;color:${BRAND_ORANGE};letter-spacing:-0.5px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                            ${escapeHtml(appName)}
                          </span>
                        </td>
                        <td style="padding-left:12px;">
                          <span style="font-size:12px;color:rgba(255,255,255,.75);font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                            Official Communication
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Orange accent bar -->
                <tr>
                  <td style="height:4px;background:rgba(255,255,255,.25);"></td>
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
                      This email was sent by <strong style="color:${BRAND_ORANGE};">${escapeHtml(appName)}</strong>. If you have questions, contact
                      <a href="mailto:support@superstore.com" style="color:${BRAND_ORANGE};text-decoration:none;">support@superstore.com</a>
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

// ─── Shared section components ────────────────────────────────────────────────

/** A highlighted info box */
export const infoBox = (content: string): string =>
  `<div style="background:${BG_LIGHT};border-left:4px solid ${BRAND_ORANGE};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;font-size:15px;line-height:1.6;">${content}</div>`;

/** A data row in a summary table */
export const summaryRow = (label: string, value: string, bold = false): string =>
  `<tr>
    <td style="padding:10px 0;font-size:14px;color:#78716c;border-bottom:1px solid #fde8d0;width:45%;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;font-size:14px;color:#1c1917;border-bottom:1px solid #fde8d0;text-align:right;${bold ? 'font-weight:700;font-size:16px;color:#f97316;' : ''}">${value}</td>
  </tr>`;

/** A CTA button */
export const ctaButton = (text: string, href: string): string =>
  `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
    <tr>
      <td style="background:linear-gradient(135deg,#f97316,#7c2d12);border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;font-family:'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.3px;">${escapeHtml(text)}</a>
      </td>
    </tr>
  </table>`;
