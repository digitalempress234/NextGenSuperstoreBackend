import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function welcomeEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Customer');
  const appName   = String(data.appName ?? 'Superstore');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;text-align:center;">
      Hi <strong>${firstName}</strong>,
    </p>

    <!-- Welcome banner -->
    <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
      <div style="font-size:17px;font-weight:800;color:#f97316;margin-bottom:4px;">Welcome to ${escapeHtml(appName)}!</div>
      <div style="font-size:14px;color:#78716c;">Your email has been successfully verified.</div>
    </div>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;text-align:center;">
      We are thrilled to have you with us. You can now start exploring thousands of products from verified stores, enjoy seamless checkout, and track your orders in real time.
    </p>
    
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57534e;text-align:center;">
      To get started, open the <strong>${escapeHtml(appName)}</strong> app and log in using your email and password.
    </p>

    <p style="margin:32px 0 0;font-size:13px;line-height:1.7;color:#78716c;border-top:1px solid #fed7aa;padding-top:20px;text-align:center;">
      If you need any help, our support team is always here for you at
      <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `Welcome to ${appName}!`,
    html:    layout(`Welcome to ${appName}`, body, appName),
    text:    [
      `Hi ${data.firstName ?? 'Customer'},`,
      '',
      `Welcome to ${appName}! Your email has been successfully verified.`,
      '',
      'You can now start exploring thousands of products from verified stores, enjoy seamless checkout, and track your orders in real time.',
      '',
      'To get started, log in using your email and password.',
      '',
      'If you need any help, contact us at support@superstore.com',
    ].join('\n'),
  };
}
