import {
  ctaButton,
  escapeHtml,
  formatNaira,
  infoBox,
  layout,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

export function paymentReceivedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const amount = formatNaira(data.amount);
  const reference = escapeHtml(String(data.reference ?? ''));
  const receiptNumber = escapeHtml(String(data.receiptNumber ?? ''));
  const receiptUrl = data.receiptUrl ? String(data.receiptUrl) : undefined;
  const appName = String(data.appName ?? 'OhoO!');

  const paidAt = data.paidAt
    ? new Date(String(data.paidAt)).toLocaleString('en-NG', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' });

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      We've successfully received your payment. Your order is now confirmed and will be processed immediately.
    </p>

    <!-- Payment highlight -->
    <div style="background:#FFF8EE;border:1px solid #F2DFCA;border-radius:14px;padding:24px 28px;margin:0 0 24px;text-align:center;">
      <div style="font-size:13px;color:#6B625F;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Amount Paid</div>
      <div style="font-size:36px;font-weight:800;color:#FF1B25;letter-spacing:-1px;">${amount}</div>
      <div style="margin-top:8px;">
        <span style="display:inline-block;background:#FFF0B8;color:#171414;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;">Payment Confirmed</span>
      </div>
    </div>

    <!-- Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Order Number', orderNumber)}
      ${summaryRow('Receipt Number', receiptNumber)}
      ${summaryRow('Payment Reference', reference)}
      ${summaryRow('Date & Time', escapeHtml(paidAt))}
      ${summaryRow('Payment Method', escapeHtml(String(data.paymentMethod ?? 'Card')))}
      ${summaryRow('Total Paid', amount, true)}
    </table>

    ${infoBox(`
      <strong> Keep your reference safe</strong><br>
      Your payment reference is <strong style="color:#FF1B25;">${reference}</strong>.
      Use this to contact support if you have any payment issues.
    `)}

    ${receiptUrl ? ctaButton('View your receipt', receiptUrl) : ''}

    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#57534e;">
      Thank you for shopping with <strong style="color:#FF1B25;">${escapeHtml(appName)}</strong>!
      You'll receive another email once your order is ready.
    </p>
  `;

  return {
    subject: `${appName} receipt ${data.receiptNumber}`,
    html: layout('Payment received', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your payment has been received successfully.`,
      `Order: ${data.orderNumber}`,
      `Receipt: ${data.receiptNumber}`,
      `Amount: ₦${Number(data.amount ?? 0).toFixed(2)}`,
      `Reference: ${data.reference}`,
      '',
      `Thank you for shopping with ${appName}!`,
    ].join('\n'),
  };
}
