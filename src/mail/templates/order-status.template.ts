import { escapeHtml, formatNaira, infoBox, layout, statusBadge, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; message: string }> = {
  ORDER_RECEIVED:    { label: 'Order Received',      color: '#6366f1', icon: '📦', message: 'Your order has been received and is awaiting store confirmation.' },
  CONFIRMED:         { label: 'Confirmed',            color: '#0ea5e9', icon: '', message: 'The store has confirmed your order and will start preparing it soon.' },
  PREPARING:         { label: 'Being Prepared',       color: '#f97316', icon: '', message: 'The store is currently preparing your items.' },
  READY_FOR_PICKUP:  { label: 'Ready for Pickup',     color: '#10b981', icon: '', message: 'Your order is ready. You can pick it up from the store.' },
  RIDER_ASSIGNED:    { label: 'Rider Assigned',       color: '#8b5cf6', icon: '', message: 'A rider has been assigned and will pick up your order shortly.' },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery',     color: '#f59e0b', icon: '', message: 'Your order is on its way! The rider is heading to your address.' },
  PICKED_UP:         { label: 'Picked Up',            color: '#0ea5e9', icon: '', message: 'The rider has picked up your order.' },
  DELIVERED:         { label: 'Delivered',            color: '#10b981', icon: '', message: 'Your order has been delivered. Enjoy your purchase!' },
  COMPLETED:         { label: 'Completed',            color: '#10b981', icon: '', message: 'Your order is complete. We hope you loved your purchase!' },
  CANCELLED:         { label: 'Cancelled',            color: '#ef4444', icon: '', message: 'Your order has been cancelled. If this was unexpected, please contact support.' },
};

export function orderStatusEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Customer');
  const orderNumber = escapeHtml(String(data.orderNumber ?? ''));
  const rawStatus   = String(data.status ?? data.statusLabel ?? '');
  const appName     = String(data.appName ?? 'Superstore');

  const config = STATUS_CONFIG[rawStatus] ?? {
    label:   escapeHtml(String(data.statusLabel ?? rawStatus)),
    color:   '#f97316',
    icon:    '',
    message: escapeHtml(String(data.message ?? 'Your order status has been updated.')),
  };

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Here's an update on your order:
    </p>

    ${infoBox(`
      <div style="margin-bottom:10px;">${statusBadge(`${config.icon} ${config.label}`, config.color)}</div>
      <div style="font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Order Number</div>
      <div style="font-size:20px;font-weight:800;color:#f97316;">${orderNumber}</div>
    `)}

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;">
      ${escapeHtml(config.message)}
      ${data.message ? `<br><br>${escapeHtml(String(data.message))}` : ''}
    </p>

    ${data.total ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Order Total', formatNaira(data.total), true)}
    </table>` : ''}

    <p style="margin:0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Reply to this email or contact us at
      <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `${config.icon} Order ${data.orderNumber}: ${config.label} - ${appName}`,
    html:    layout('Order Status Update', body, appName),
    text:    [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Order ${data.orderNumber} is now: ${config.label}`,
      config.message,
      data.message ? String(data.message) : '',
    ].filter(Boolean).join('\n'),
  };
}
