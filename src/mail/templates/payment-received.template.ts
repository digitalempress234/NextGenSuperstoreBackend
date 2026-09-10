import { escapeHtml, formatNaira, infoBox, layout, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

export function paymentReceivedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const amount      = formatNaira(data.amount);
  const reference   = escapeHtml(String(data.reference ?? ''));
  const appName     = String(data.appName ?? 'Superstore');

  const paidAt = data.paidAt
    ? new Date(String(data.paidAt)).toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' })
    : new Date().toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' });

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      We've successfully received your payment. Your order is now confirmed and will be processed immediately.
    </p>

    <!-- Payment highlight -->
    <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1px solid #fed7aa;border-radius:12px;padding:24px 28px;margin:0 0 24px;text-align:center;">
      <div style="font-size:13px;color:#78716c;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Amount Paid</div>
      <div style="font-size:36px;font-weight:800;color:#f97316;letter-spacing:-1px;">${amount}</div>
      <div style="margin-top:8px;">
        <span style="display:inline-block;background:#dcfce7;color:#15803d;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;"> Payment Confirmed</span>
      </div>
    </div>

    <!-- Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Order Number', orderNumber)}
      ${summaryRow('Payment Reference', reference)}
      ${summaryRow('Date & Time', escapeHtml(paidAt))}
      ${summaryRow('Payment Method', escapeHtml(String(data.paymentMethod ?? 'Card')))}
      ${summaryRow('Total Paid', amount, true)}
    </table>

    ${infoBox(`
      <strong> Keep your reference safe</strong><br>
      Your payment reference is <strong style="color:#f97316;">${reference}</strong>.
      Use this to contact support if you have any payment issues.
    `)}

    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#57534e;">
      Thank you for shopping with <strong style="color:#f97316;">${escapeHtml(appName)}</strong>!
      You'll receive another email once your order is ready.
    </p>
  `;

  return {
    subject: `Payment confirmed - ${appName} Order ${data.orderNumber}`,
    html:    layout('Payment Received', body, appName),
    text:    [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your payment has been received successfully.`,
      `Order: ${data.orderNumber}`,
      `Amount: ₦${Number(data.amount ?? 0).toFixed(2)}`,
      `Reference: ${data.reference}`,
      '',
      `Thank you for shopping with ${appName}!`,
    ].join('\n'),
  };
}
