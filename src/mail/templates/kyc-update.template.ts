import { escapeHtml, infoBox, layout, statusBadge, summaryRow, type EmailTemplateData, type RenderedEmail } from './_shared';

const KYC_STATUS_CONFIG: Record<string, { color: string; icon: string; headline: string; detail: string }> = {
  APPROVED: {
    color:    '#10b981',
    icon:     '',
    headline: 'Your verification has been approved!',
    detail:   'You are now fully verified and can start accepting delivery jobs on the platform.',
  },
  REJECTED: {
    color:    '#ef4444',
    icon:     '',
    headline: 'Your verification was not successful.',
    detail:   'Please review the reason below and re-submit the required documents.',
  },
  UNDER_REVIEW: {
    color:    '#f59e0b',
    icon:     '',
    headline: 'Your documents are under review.',
    detail:   'Our team is reviewing your submission. This usually takes 1–2 business days.',
  },
  PENDING: {
    color:    '#6366f1',
    icon:     '',
    headline: 'We received your documents.',
    detail:   'Your submission is queued for review. You will be notified once processing begins.',
  },
};

export function kycUpdateEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Rider');
  const rawStatus = String(data.status ?? '').toUpperCase();
  const appName   = String(data.appName ?? 'Superstore');

  const config = KYC_STATUS_CONFIG[rawStatus] ?? {
    color:    '#f97316',
    icon:     '',
    headline: `Status updated to ${escapeHtml(rawStatus)}`,
    detail:   escapeHtml(String(data.message ?? 'Your KYC status has been updated.')),
  };

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      There's an update on your rider verification (KYC) status:
    </p>

    <!-- Status card -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">${config.icon}</div>
      <div style="margin-bottom:10px;">${statusBadge(rawStatus, config.color)}</div>
      <div style="font-size:17px;font-weight:700;color:#1c1917;margin-top:12px;">${config.headline}</div>
    </div>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;">${config.detail}</p>

    ${data.message ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border-collapse:collapse;">
      ${summaryRow('Note from reviewer', escapeHtml(String(data.message)))}
    </table>` : ''}

    ${rawStatus === 'REJECTED' ? infoBox(`
      <strong> What to do next</strong><br>
      Open the <strong>${escapeHtml(appName)}</strong> app, go to your profile, and re-upload the required documents.
      Ensure all documents are clear, valid, and unexpired.
    `) : ''}

    ${rawStatus === 'APPROVED' ? infoBox(`
      <strong> You're good to go!</strong><br>
      Your account is now active. Log in to the <strong>${escapeHtml(appName)}</strong> rider app to start accepting delivery requests.
    `) : ''}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `${config.icon} KYC verification ${rawStatus.toLowerCase()} - ${appName}`,
    html:    layout('Rider Verification Update', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Rider'},`,
      '',
      `Your KYC verification status is: ${rawStatus}`,
      config.detail,
      data.message ? `Reviewer note: ${data.message}` : '',
      '',
      `Contact support@superstore.com for help.`,
    ].filter(Boolean).join('\n'),
  };
}
