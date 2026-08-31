import { escapeHtml, layout, type RenderedEmail } from './_shared';

export interface OtpEmailTemplateData {
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
  const appName = data.appName || 'Purse';
  const subject = `${purpose} code`;
  const text = [
    `Hello ${recipient},`,
    '',
    `Your ${purpose.toLowerCase()} is ${data.otp}.`,
    `It expires in ${data.expiresInMinutes} minutes.`,
    '',
    'Do not share this code with anyone.',
    '',
    `If you did not request this code, you can safely ignore this email.`,
  ].join('\n');

  const body = `
    <p>Hello ${recipient},</p>
    <p>Your <strong>${purpose.toLowerCase()}</strong> is:</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px 0;">${data.otp}</div>
    <p>This code expires in <strong>${data.expiresInMinutes} minutes</strong>.</p>
    <p>Never share this code with anyone, including support staff.</p>
    <p>If you did not request this code, you can safely ignore this email.</p>`;

  return {
    subject,
    html: layout(title, body, appName),
    text,
  };
}
