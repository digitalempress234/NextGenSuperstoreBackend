import {
  escapeHtml,
  formatNaira,
  infoBox,
  layout,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

interface PurchaseHistoryPreview {
  orderNumber?: string;
  purchasedAt?: string;
  storeName?: string;
  itemCount?: number;
  total?: unknown;
  paymentStatus?: string;
}

export function purchaseHistoryEmail(data: EmailTemplateData): RenderedEmail {
  const appName = String(data.appName ?? 'OhoO!');
  const firstName = escapeHtml(data.firstName || 'Customer');
  const orderCount = Number(data.orderCount ?? 0);
  const itemCount = Number(data.itemCount ?? 0);
  const fromLabel = escapeHtml(data.fromLabel ?? 'All time');
  const toLabel = escapeHtml(data.toLabel ?? 'Present');
  const orders = Array.isArray(data.orders) ? (data.orders as PurchaseHistoryPreview[]) : [];
  const attachmentDescription = escapeHtml(data.attachmentDescription ?? 'CSV statement');
  const rows = orders
    .map(
      (order) => `<tr>
        <td style="padding:10px 6px;border-bottom:1px solid #F2DFCA;font-size:13px;">
          <strong>${escapeHtml(order.orderNumber)}</strong><br>
          <span style="color:#78716c;">${escapeHtml(order.purchasedAt)}</span>
        </td>
        <td style="padding:10px 6px;border-bottom:1px solid #F2DFCA;font-size:13px;">
          ${escapeHtml(order.storeName)}<br>
          <span style="color:#78716c;">${Number(order.itemCount ?? 0)} item(s)</span>
        </td>
        <td align="right" style="padding:10px 6px;border-bottom:1px solid #F2DFCA;font-size:13px;">
          <strong>${formatNaira(order.total)}</strong><br>
          <span style="color:#78716c;">${escapeHtml(String(order.paymentStatus ?? '').replaceAll('_', ' '))}</span>
        </td>
      </tr>`,
    )
    .join('');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Your requested purchase history is ready. The attached ${attachmentDescription} contains the complete item-level list for the selected period.
    </p>
    ${infoBox(`<strong>Statement period:</strong> ${fromLabel} to ${toLabel}`)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;border-collapse:collapse;">
      ${summaryRow('Orders', String(orderCount))}
      ${summaryRow('Items', String(itemCount))}
      ${summaryRow('Recorded order value', formatNaira(data.totalValue), true)}
    </table>
    ${
      rows
        ? `<h2 style="margin:28px 0 10px;font-size:17px;color:#171414;">Recent purchases</h2>
           <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
             <tr>
               <th align="left" style="padding:8px 6px;background:#FFF8EE;font-size:12px;color:#6B625F;">Order</th>
               <th align="left" style="padding:8px 6px;background:#FFF8EE;font-size:12px;color:#6B625F;">Store</th>
               <th align="right" style="padding:8px 6px;background:#FFF8EE;font-size:12px;color:#6B625F;">Total</th>
             </tr>
             ${rows}
           </table>
           ${orderCount > orders.length ? `<p style="margin:12px 0 0;font-size:13px;color:#6B625F;">The email shows the ${orders.length} most recent orders. The attachment contains the complete list.</p>` : ''}`
        : `<p style="margin:24px 0;font-size:15px;line-height:1.7;color:#57534e;">No paid purchases were found for this period.</p>`
    }
    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6B625F;">
      Fully or partially refunded purchases remain in the statement and are identified by their payment status.
    </p>
  `;

  const textOrders = orders.map(
    (order) =>
      `${order.orderNumber ?? ''} | ${order.purchasedAt ?? ''} | ${order.storeName ?? ''} | ${order.itemCount ?? 0} item(s) | ₦${Number(order.total ?? 0).toFixed(2)} | ${order.paymentStatus ?? ''}`,
  );

  return {
    subject: `Your purchase history - ${appName}`,
    html: layout('Your Purchase History', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Your requested purchase history for ${String(data.fromLabel ?? 'All time')} to ${String(data.toLabel ?? 'Present')} is attached as ${String(data.attachmentDescription ?? 'a CSV statement')}.`,
      `Orders: ${orderCount}`,
      `Items: ${itemCount}`,
      `Recorded order value: ₦${Number(data.totalValue ?? 0).toFixed(2)}`,
      '',
      ...textOrders,
      '',
      'Refunded purchases remain listed with their payment status.',
    ].join('\n'),
  };
}
