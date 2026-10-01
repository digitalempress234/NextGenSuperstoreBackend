import {
  escapeHtml,
  formatNaira,
  infoBox,
  layout,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

export function orderPlacedEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const total = formatNaira(data.total);
  const storeName = escapeHtml(String(data.storeName ?? 'the store'));
  const appName = String(data.appName ?? 'Superstore');
  const orderId = escapeHtml(String(data.orderId ?? ''));
  const paymentMethod = escapeHtml(String(data.paymentMethod ?? 'CARD').replaceAll('_', ' '));
  const fulfillmentType = String(data.fulfillmentType ?? 'DELIVERY');
  const items = Array.isArray(data.items)
    ? (data.items as Array<{ name?: string; quantity?: number; total?: unknown }>)
    : [];
  const itemRows = items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #fed7aa;color:#57534e;">${escapeHtml(item.name)} &times; ${Number(item.quantity ?? 0)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #fed7aa;font-weight:600;">${formatNaira(item.total)}</td></tr>`,
    )
    .join('');
  const nextStep =
    fulfillmentType === 'PICKUP'
      ? 'Your order is being prepared for pickup.'
      : 'Your order is being prepared for delivery.';

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Your order has been successfully placed on <strong>${escapeHtml(appName)}</strong>.
      ${nextStep}
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
      ${summaryRow('Order ID', orderId)}
      ${summaryRow('Payment', paymentMethod)}
      ${summaryRow('Fulfilment', escapeHtml(fulfillmentType))}
      ${data.deliveryAddress ? summaryRow('Delivery Address', escapeHtml(String(data.deliveryAddress))) : ''}
      ${summaryRow('Subtotal', formatNaira(data.subtotal))}
      ${summaryRow('Delivery Fee', formatNaira(data.shippingFee))}
      ${summaryRow('Order Total', total, true)}
    </table>

    ${itemRows ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">${itemRows}</table>` : ''}

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
    html: layout('Order Placed Successfully', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your order ${data.orderNumber} has been placed successfully.`,
      nextStep,
      `Order ID: ${data.orderId ?? ''}`,
      `Store: ${data.storeName ?? ''}`,
      `Payment: ${data.paymentMethod ?? 'CARD'}`,
      ...items.map(
        (item) =>
          `${item.name ?? 'Item'} x ${item.quantity ?? 0}: ₦${Number(item.total ?? 0).toFixed(2)}`,
      ),
      `Total: ₦${Number(data.total ?? 0).toFixed(2)}`,
      '',
      `Thank you for shopping with ${appName}!`,
    ].join('\n'),
  };
}
