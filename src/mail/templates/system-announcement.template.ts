import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function systemAnnouncementEmail(data: EmailTemplateData): RenderedEmail {
  const title = String(data.subject || 'Purse notification');
  const message = String(data.message || '');
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>${escapeHtml(message)}</p>
  `;

  return {
    subject: title,
    html: layout(title, body, data.appName),
    text: message,
  };
}
