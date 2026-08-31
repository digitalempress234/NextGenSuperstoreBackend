import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function orderStatusEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> is now <strong>${escapeHtml(data.statusLabel)}</strong>.</p>
    <p>${escapeHtml(data.message || '')}</p>
  `;

  return {
    subject: `Order ${data.orderNumber}: ${data.statusLabel}`,
    html: layout('Order status update', body, data.appName),
    text: `Order ${data.orderNumber} is now ${data.statusLabel}. ${data.message || ''}`,
  };
}
