import { escapeHtml, infoBox, layout, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

export function deliveryAssignedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const riderName   = escapeHtml(String(data.riderName ?? 'Your rider'));
  const riderPhone  = escapeHtml(String(data.riderPhone ?? ''));
  const appName     = String(data.appName ?? 'Superstore');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Exciting news! A rider has been assigned to deliver your order.
      They are on their way to pick it up from the store right now.
    </p>

    <!-- Rider card -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;"></div>
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#78716c;margin-bottom:6px;">Your Rider</div>
      <div style="font-size:22px;font-weight:800;color:#1c1917;">${riderName}</div>
      ${riderPhone ? `<div style="margin-top:6px;font-size:14px;color:#f97316;font-weight:600;">${riderPhone}</div>` : ''}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Order Number', orderNumber)}
      ${summaryRow('Status', ' Rider Assigned')}
      ${data.estimatedTime ? summaryRow('Estimated Delivery', escapeHtml(String(data.estimatedTime))) : ''}
      ${data.deliveryAddress ? summaryRow('Delivery Address', escapeHtml(String(data.deliveryAddress))) : ''}
    </table>

    ${infoBox(`
      <strong> Track Your Delivery</strong><br>
      Open the <strong>${escapeHtml(appName)}</strong> app to track your rider's location in real-time.
      You'll receive a delivery code email shortly - keep it handy for when the rider arrives.
    `)}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Contact us at <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `Rider assigned to order ${data.orderNumber} - ${appName}`,
    html:    layout('Rider Assigned to Your Order', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `A rider has been assigned to your order ${data.orderNumber}.`,
      `Rider: ${data.riderName}`,
      data.riderPhone ? `Rider Phone: ${data.riderPhone}` : '',
      '',
      `Track your delivery in the ${appName} app.`,
    ].filter(Boolean).join('\n'),
  };
}
