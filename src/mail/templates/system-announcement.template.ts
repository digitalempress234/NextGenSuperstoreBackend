import { escapeHtml, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export function systemAnnouncementEmail(data: EmailTemplateData): RenderedEmail {
  const firstName = escapeHtml(data.firstName || 'Customer');
  const title     = String(data.subject || 'Important Update');
  const message   = String(data.message || '');
  const appName   = String(data.appName ?? 'Superstore');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>

    <!-- Announcement banner -->
    <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
      <div style="font-size:24px;margin-bottom:8px;"></div>
      <div style="font-size:17px;font-weight:700;color:#c2410c;margin-bottom:4px;">${escapeHtml(title)}</div>
    </div>

    <div style="font-size:15px;line-height:1.8;color:#57534e;white-space:pre-line;">${escapeHtml(message)}</div>

    <p style="margin:32px 0 0;font-size:13px;line-height:1.7;color:#78716c;border-top:1px solid #fed7aa;padding-top:20px;">
      This is an official communication from <strong style="color:#f97316;">${escapeHtml(appName)}</strong>.
      If you have questions, contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return {
    subject: `${title} - ${appName}`,
    html:    layout(title, body, appName),
    text:    [`Hi ${data.firstName ?? 'Customer'},`, '', title, '', message].join('\n'),
  };
}
