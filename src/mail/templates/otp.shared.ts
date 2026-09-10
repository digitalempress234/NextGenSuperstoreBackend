import { escapeHtml, infoBox, layout, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

export interface OtpEmailTemplateData extends EmailTemplateData {
  recipientName?: string;
  otp: string;
  expiresInMinutes: number;
  appName?: string;
}

export function renderOtpEmail(
  title: string,
  purpose: string,
  data: OtpEmailTemplateData,
): RenderedEmail {
  const recipient = escapeHtml(data.recipientName || 'Customer');
  const appName   = data.appName || 'Superstore';

  const digits = String(data.otp).split('').map(d =>
    `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;background:#fff7ed;border:2px solid #fed7aa;border-radius:10px;font-size:28px;font-weight:800;color:#f97316;margin:0 4px;">${d}</span>`
  ).join('');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${recipient}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#1c1917;">
      You requested a <strong>${escapeHtml(purpose.toLowerCase())}</strong> for your ${escapeHtml(appName)} account.
      Use the code below to complete the process:
    </p>

    <!-- OTP display -->
    <div style="text-align:center;margin:0 0 24px;padding:28px 20px;background:#fff7ed;border-radius:12px;border:1px dashed #fed7aa;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#78716c;margin-bottom:16px;">Your ${escapeHtml(purpose)} Code</div>
      <div style="display:inline-flex;justify-content:center;gap:0;">${digits}</div>
      <div style="margin-top:16px;font-size:13px;color:#78716c;">
         Expires in <strong style="color:#f97316;">${data.expiresInMinutes} minutes</strong>
      </div>
    </div>

    ${infoBox(`
      <strong> Security Notice</strong><br>
      <strong>Never share this code with anyone</strong> - including ${escapeHtml(appName)} support staff.
      We will never ask for your OTP. If you did not request this code, please
      <a href="mailto:support@superstore.com" style="color:#f97316;">contact us immediately</a>.
    `)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;border-collapse:collapse;">
      ${summaryRow('Requested For', escapeHtml(String(data.recipientName ?? 'Your account')))}
      ${summaryRow('Valid For', `${data.expiresInMinutes} minutes`)}
      ${summaryRow('One-time use', 'This code is single-use only')}
    </table>
  `;

  return {
    subject: `${data.otp} is your ${appName} ${purpose.toLowerCase()} code`,
    html:    layout(title, body, appName),
    text: [
      `Hi ${data.recipientName || 'Customer'},`,
      '',
      `Your ${purpose.toLowerCase()} code is: ${data.otp}`,
      `It expires in ${data.expiresInMinutes} minutes.`,
      '',
      'Never share this code with anyone.',
      '',
      `If you did not request this, contact support@superstore.com immediately.`,
    ].join('\n'),
  };
}
