import {
  escapeHtml,
  infoBox,
  layout,
  statusBadge,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

export function riderApplicationDecisionEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Rider');
  const appName = escapeHtml(data.appName || 'Purse');
  const approved = String(data.status).toUpperCase() === 'APPROVED';
  const reason = data.reason ? escapeHtml(data.reason) : null;
  const status = approved ? 'APPROVED' : 'REJECTED';
  const headline = approved
    ? 'Your rider application has been approved'
    : 'Your rider application was not approved';
  const detail = approved
    ? `Your rider account is active. You can now open the ${appName} rider app and start accepting available delivery requests.`
    : `Your rider application needs attention before you can start accepting deliveries.`;

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      ${headline}.
    </p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      ${statusBadge(status, approved ? '#10b981' : '#ef4444')}
      <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#57534e;">${detail}</p>
    </div>
    ${reason ? infoBox(`<strong>Review note</strong><br>${reason}`) : ''}
    ${
      approved
        ? infoBox(
            `<strong>Next step</strong><br>Go online in the ${appName} rider app when you are ready to receive delivery offers. Add a verified primary bank account before requesting your first withdrawal.`,
          )
        : infoBox(
            `<strong>What to do next</strong><br>Open the ${appName} rider app to review your application status and correct the requested information before resubmitting.`,
          )
    }
  `;

  return {
    subject: approved
      ? `Your ${appName} rider application is approved`
      : `Update on your ${appName} rider application`,
    html: layout('Rider Application Decision', body, String(data.appName || 'Purse')),
    text: [
      `Hi ${data.firstName ?? 'Rider'},`,
      '',
      `${headline}.`,
      detail,
      reason ? `Review note: ${String(data.reason)}` : '',
      '',
      approved
        ? 'Open the rider app to start accepting delivery requests.'
        : 'Open the rider app to review and correct your application.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
