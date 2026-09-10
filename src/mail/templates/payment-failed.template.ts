import { escapeHtml, ctaButton, infoBox, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function paymentFailedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Customer');
  const appName   = String(data.appName ?? 'Superstore');
  const reference = escapeHtml(String(data.reference ?? data.checkoutId ?? ''));

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Unfortunately, we were unable to confirm your payment. Your order has not been charged and no money has been deducted from your account.
    </p>

    <!-- Error banner -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;"></div>
      <div style="font-size:18px;font-weight:700;color:#dc2626;">Payment Not Confirmed</div>
      ${reference ? `<div style="font-size:13px;color:#78716c;margin-top:6px;">Reference: <strong>${reference}</strong></div>` : ''}
    </div>

    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1c1917;">What might have gone wrong?</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.9;color:#57534e;">
      <li>Insufficient account balance</li>
      <li>Card declined by your bank</li>
      <li>Network or connection issue during checkout</li>
      <li>Card details may be incorrect or expired</li>
    </ul>

    ${infoBox(`
      <strong> What to do next</strong><br>
      Open the ${escapeHtml(appName)} app, go to your orders, and retry the payment.
      If your account was debited, it will be reversed within <strong>3–5 business days</strong>.
    `)}

    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#57534e;">
      Need help? Our support team is available 24/7:
    </p>
    <p style="margin:0;font-size:14px;color:#57534e;">
       <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a><br>
    </p>
  `;

  return {
    subject: `Payment failed - ${appName}`,
    html:    layout('Payment Not Confirmed', body, appName),
    text:    [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `We could not confirm your payment${reference ? ` (ref: ${reference})` : ''}.`,
      '',
      'Please retry the payment from the app.',
      'If you were charged, it will be reversed within 3-5 business days.',
      '',
      `Support: support@superstore.com`,
    ].join('\n'),
  };
}
