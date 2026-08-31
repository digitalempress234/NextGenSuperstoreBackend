import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function paymentFailedEmail(data: EmailTemplateData): RenderedEmail {
  const body = `
    <p>Hello ${escapeHtml(data.firstName || 'Customer')},</p>
    <p>We could not confirm your payment for checkout <strong>${escapeHtml(data.checkoutId)}</strong>.</p>
    <p>Please retry the payment from your order page.</p>
  `;

  return {
    subject: 'Payment could not be confirmed',
    html: layout('Payment failed', body, data.appName),
    text: `Payment could not be confirmed for checkout ${data.checkoutId}.`,
  };
}
