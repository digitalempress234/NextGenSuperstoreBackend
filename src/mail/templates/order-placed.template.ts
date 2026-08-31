import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function orderPlacedEmail(data: EmailTemplateData): RenderedEmail {
  const orderNumber = escapeHtml(data.orderNumber);
  const total = escapeHtml(data.total);
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>Your order <strong>${orderNumber}</strong> has been received.</p>
    <p>Order total: <strong>${total}</strong></p>
    <p>We will notify you when the store confirms your order.</p>
  `;

  return {
    subject: `Order ${data.orderNumber} received`,
    html: layout('Order received', body, data.appName),
    text: `Your order ${data.orderNumber} has been received. Total: ${data.total}.`,
  };
}
