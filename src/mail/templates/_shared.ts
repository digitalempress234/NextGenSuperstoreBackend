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

export const layout = (
  title: string,
  body: string,
  appName?: string,
): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
</head>
<body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#17202a;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);" role="presentation">
          <tr>
            <td style="padding:24px 28px;background:#111827;color:#fff;font-size:20px;font-weight:700;">
              ${escapeHtml(appName ?? 'Purse')}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="font-size:22px;margin:0 0 18px;">${escapeHtml(title)}</h1>
              ${body}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
