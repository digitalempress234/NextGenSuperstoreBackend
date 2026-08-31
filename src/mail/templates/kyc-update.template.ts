import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function kycUpdateEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Rider')},</p>
    <p>Your rider verification status is now <strong>${escapeHtml(data.status)}</strong>.</p>
    <p>${escapeHtml(data.message || '')}</p>
  `;

  return {
    subject: `Rider verification: ${data.status}`,
    html: layout('Rider verification update', body, data.appName),
    text: `Your rider verification status is ${data.status}. ${data.message || ''}`,
  };
}
