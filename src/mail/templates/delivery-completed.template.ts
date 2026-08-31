import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function deliveryCompletedEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been delivered.</p>
    <p>Thank you for shopping with us.</p>
  `;

  return {
    subject: `Order ${data.orderNumber} delivered`,
    html: layout('Delivery completed', body, data.appName),
    text: `Your order ${data.orderNumber} has been delivered.`,
  };
}
