import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function deliveryAssignedEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been assigned to a rider.</p>
    <p>Rider: ${escapeHtml(data.riderName)}</p>
  `;

  return {
    subject: `Rider assigned to order ${data.orderNumber}`,
    html: layout('Delivery assigned', body, data.appName),
    text: `A rider has been assigned to order ${data.orderNumber}. Rider: ${data.riderName}.`,
  };
}
