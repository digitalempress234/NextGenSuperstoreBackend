import { escapeHtml, formatNaira, infoBox, layout, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

export function orderPlacedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName  = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const total       = formatNaira(data.total);
  const storeName   = escapeHtml(String(data.storeName ?? 'the store'));
  const appName     = String(data.appName ?? 'Superstore');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Great news! Your order has been successfully placed on <strong>${appName}</strong>.
      We've notified the store and they will begin preparing your items shortly.
    </p>

    ${infoBox(`
      <div style="display:flex;align-items:center;gap:12px;">
        <div>
          <div style="font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Order Number</div>
          <div style="font-size:22px;font-weight:800;color:#f97316;letter-spacing:1px;">${orderNumber}</div>
        </div>
      </div>
    `)}

    <!-- Order summary table -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;border-collapse:collapse;">
      ${summaryRow('Store', storeName)}
      ${summaryRow('Fulfilment', escapeHtml(String(data.fulfillmentType ?? 'Delivery')))}
      ${data.deliveryAddress ? summaryRow('Delivery Address', escapeHtml(String(data.deliveryAddress))) : ''}
      ${summaryRow('Order Total', total, true)}
    </table>

    <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#57534e;">
      You will receive another email as soon as the store confirms your order.
      You can also track your order status anytime from the <strong>${appName}</strong> app.
    </p>

    <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#57534e;">
      Thank you for shopping with <strong style="color:#f97316;">${escapeHtml(appName)}</strong>! 
    </p>
  `;

  return {
    subject: `Order ${data.orderNumber} received - ${appName}`,
    html:    layout('Order Placed Successfully', body, appName),
    text:    [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your order ${data.orderNumber} has been placed successfully.`,
      `Store: ${data.storeName ?? ''}`,
      `Total: ₦${Number(data.total ?? 0).toFixed(2)}`,
      '',
      `Thank you for shopping with ${appName}!`,
    ].join('\n'),
  };
}
