import { escapeHtml, ctaButton, formatNaira, infoBox, layout, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

export function deliveryCompletedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const appName     = String(data.appName ?? 'Superstore');

  const deliveredAt = data.deliveredAt
    ? new Date(String(data.deliveredAt)).toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' })
    : new Date().toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' });

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Your order has been successfully delivered. We hope you love your purchase! 
    </p>

    <!-- Success banner -->
    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;"></div>
      <div style="font-size:20px;font-weight:800;color:#15803d;">Order Delivered!</div>
      <div style="margin-top:6px;font-size:14px;color:#166534;">${orderNumber}</div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Order Number', orderNumber)}
      ${summaryRow('Delivered On', escapeHtml(deliveredAt))}
      ${data.riderName ? summaryRow('Delivered By', escapeHtml(String(data.riderName))) : ''}
      ${data.total ? summaryRow('Order Total', formatNaira(data.total), true) : ''}
    </table>

    ${infoBox(`
      <strong> How was your experience?</strong><br>
      Your feedback helps us serve you better. Rate your order and leave a review for the store in the <strong>${escapeHtml(appName)}</strong> app.
    `)}

    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#57534e;">
      Thank you for choosing <strong style="color:#f97316;">${escapeHtml(appName)}</strong>!
      We look forward to serving you again soon.
    </p>

    <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Not what you expected? Contact us at
      <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
      within 24 hours for assistance.
    </p>
  `;

  return {
    subject: `Order ${data.orderNumber} delivered - ${appName}`,
    html:    layout('Order Delivered', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your order ${data.orderNumber} has been delivered!`,
      `Delivered on: ${deliveredAt}`,
      '',
      `Thank you for shopping with ${appName}!`,
      '',
      'If there is an issue, contact support@superstore.com within 24 hours.',
    ].join('\n'),
  };
}
