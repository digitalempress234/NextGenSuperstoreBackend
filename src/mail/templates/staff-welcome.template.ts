import {
  ctaButton,
  escapeHtml,
  infoBox,
  layout,
  statusBadge,
  summaryRow,
  type EmailTemplateData,
  type RenderedEmail,
} from './_shared';

export function staffWelcomeEmail(data: EmailTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName || 'Team Member');
  const role        = escapeHtml(String(data.role ?? '').replace(/_/g, ' '));
  const tempPassword = escapeHtml(String(data.temporaryPassword ?? ''));
  const email       = escapeHtml(String(data.staffEmail ?? ''));
  const appName     = String(data.appName ?? 'Purse');
  const loginUrl    = String(data.loginUrl ?? '#');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Welcome to the <strong>${escapeHtml(appName)}</strong> team! Your staff account has been created.
      You have been assigned the following role:
    </p>

    <div style="text-align:center;margin:0 0 24px;">
      ${statusBadge(role, '#7c3aed')}
    </div>

    <!-- Credentials box -->
    ${infoBox(`
      <strong>🔑 Your login credentials</strong><br><br>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
        ${summaryRow('Email', email)}
        ${summaryRow('Temporary Password', `<code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:14px;">${tempPassword}</code>`)}
      </table>
    `)}

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;">
      For security, you will be required to <strong>change your password</strong> the first time you log in.
      Please do not share your credentials with anyone.
    </p>

    ${ctaButton('Log in to Staff Portal', loginUrl)}

    ${infoBox(`
      <strong>⚠️ Security reminder</strong><br>
      This temporary password expires after first use. If you did not request this account,
      contact your system administrator immediately at
      <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>.
    `)}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Questions? Contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `🎉 Welcome to ${appName} — Your staff account is ready`,
    html:    layout('Staff Account Created', body, appName),
    text: [
      `Hi ${data.firstName ?? 'Team Member'},`,
      '',
      `Welcome to the ${appName} team! Your staff account has been created.`,
      `Role: ${data.role}`,
      '',
      'Your login credentials:',
      `  Email: ${data.staffEmail}`,
      `  Temporary Password: ${data.temporaryPassword}`,
      '',
      'You will be required to change your password on first login.',
      '',
      `Login at: ${loginUrl}`,
      '',
      'If you did not request this account, contact support@superstore.com immediately.',
    ].join('\n'),
  };
}
