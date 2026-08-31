import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function paymentReceivedEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>Your payment for order <strong>${escapeHtml(data.orderNumber)}</strong> was received successfully.</p>
    <p>Amount: <strong>${escapeHtml(data.amount)}</strong></p>
    <p>Reference: ${escapeHtml(data.reference)}</p>
  `;

  return {
    subject: `Payment received for order ${data.orderNumber}`,
    html: layout('Payment received', body, data.appName),
    text: `Payment received for order ${data.orderNumber}. Amount: ${data.amount}. Reference: ${data.reference}.`,
  };
}
