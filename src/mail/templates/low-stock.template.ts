import {
  escapeHtml,
  formatNaira,
  infoBox,
  layout,
  statusBadge,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

export function lowStockEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Vendor');
  const productName = escapeHtml(String(data.productName ?? 'Unknown product'));
  const storeName   = escapeHtml(String(data.storeName ?? 'your store'));
  const remaining   = Number(data.remaining ?? 0);
  const appName     = String(data.appName ?? 'Purse');

  const isOutOfStock = remaining === 0;
  const statusLabel  = isOutOfStock ? 'OUT OF STOCK' : 'LOW STOCK';
  const statusColor  = isOutOfStock ? '#ef4444' : '#f59e0b';
  const icon         = isOutOfStock ? '🚫' : '⚠️';

  const headline = isOutOfStock
    ? `${productName} is now out of stock`
    : `${productName} is running low`;

  const detail = isOutOfStock
    ? `This product has been automatically hidden from customers until you restock it.`
    : `Only <strong>${remaining}</strong> unit${remaining === 1 ? '' : 's'} remaining. Consider restocking soon to avoid losing sales.`;

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Here's a stock alert for your store <strong>${storeName}</strong> on <strong>${escapeHtml(appName)}</strong>:
    </p>

    <!-- Status card -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">${icon}</div>
      <div style="margin-bottom:10px;">${statusBadge(statusLabel, statusColor)}</div>
      <div style="font-size:17px;font-weight:700;color:#1c1917;margin-top:12px;">${headline}</div>
    </div>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;">${detail}</p>

    <!-- Product summary -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Product', productName)}
      ${summaryRow('Store', storeName)}
      ${summaryRow('Units remaining', String(remaining), true)}
      ${data.sku ? summaryRow('SKU', escapeHtml(String(data.sku))) : ''}
    </table>

    ${isOutOfStock ? infoBox(`
      <strong>🔄 How to restock</strong><br>
      Open the <strong>${escapeHtml(appName)}</strong> vendor app, go to your product listings, update the
      stock quantity, and the product will automatically become visible to customers again.
    `) : infoBox(`
      <strong>💡 Tip</strong><br>
      You can update stock quantities anytime from your product management page in the
      <strong>${escapeHtml(appName)}</strong> vendor app.
    `)}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `${icon} Stock alert: ${isOutOfStock ? 'Out of stock' : 'Low stock'} — ${productName}`,
    html:    layout('Stock Alert', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Vendor'},`,
      '',
      `Stock alert for: ${data.productName ?? 'Unknown product'}`,
      `Store: ${data.storeName ?? ''}`,
      `Units remaining: ${remaining}`,
      isOutOfStock
        ? 'This product has been automatically hidden from customers.'
        : `Only ${remaining} unit(s) left. Please restock soon.`,
      '',
      `Contact support@superstore.com for help.`,
    ].filter(Boolean).join('\n'),
  };
}
