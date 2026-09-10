import {
  escapeHtml,
  infoBox,
  layout,
  statusBadge,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

const STATUS_CONFIG: Record<string, { color: string; icon: string; headline: string; detail: string }> = {
  APPROVED: {
    color:    '#10b981',
    icon:     '🎉',
    headline: 'Your vendor account has been approved!',
    detail:   'You are now a verified vendor on the platform. You can start setting up your store and listing products.',
  },
  REJECTED: {
    color:    '#ef4444',
    icon:     '❌',
    headline: 'Your vendor application was not successful.',
    detail:   'Unfortunately your application did not meet our requirements at this time. Please review the reason below.',
  },
};

export function vendorApprovalEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Vendor');
  const rawStatus = String(data.status ?? '').toUpperCase();
  const appName   = String(data.appName ?? 'Purse');

  const config = STATUS_CONFIG[rawStatus] ?? {
    color:    '#f59e0b',
    icon:     'ℹ️',
    headline: `Your vendor application status: ${escapeHtml(rawStatus)}`,
    detail:   escapeHtml(String(data.message ?? 'Your vendor application status has been updated.')),
  };

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      There's an update on your vendor application with <strong>${escapeHtml(appName)}</strong>:
    </p>

    <!-- Status card -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">${config.icon}</div>
      <div style="margin-bottom:10px;">${statusBadge(rawStatus, config.color)}</div>
      <div style="font-size:17px;font-weight:700;color:#1c1917;margin-top:12px;">${config.headline}</div>
    </div>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;">${config.detail}</p>

    ${data.reason ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Reason from reviewer', escapeHtml(String(data.reason)))}
    </table>` : ''}

    ${rawStatus === 'APPROVED' ? infoBox(`
      <strong>🚀 Next steps</strong><br>
      Log in to <strong>${escapeHtml(appName)}</strong>, complete your store setup, and start adding your products.
      Your customers are waiting!
    `) : ''}

    ${rawStatus === 'REJECTED' ? infoBox(`
      <strong>What to do next</strong><br>
      Review the reason above, make the necessary corrections, and re-submit your vendor application
      through the <strong>${escapeHtml(appName)}</strong> app.
    `) : ''}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `${config.icon} Vendor application ${rawStatus.toLowerCase()} — ${appName}`,
    html:    layout('Vendor Application Update', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Vendor'},`,
      '',
      `Your vendor application status: ${rawStatus}`,
      config.detail,
      data.reason ? `Reviewer reason: ${data.reason}` : '',
      '',
      `Contact support@superstore.com for help.`,
    ].filter(Boolean).join('\n'),
  };
}
