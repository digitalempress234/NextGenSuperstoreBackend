import { renderOtpEmail } from './otp.shared';
import type { EmailTemplateData, RenderedEmail } from './_shared';

export function passwordResetOtpEmail(data: EmailTemplateData): RenderedEmail {
  return renderOtpEmail(
    'Reset Your Password',
    'Password Reset',
    {
      recipientName:    data.recipientName ?? data.firstName,
      otp:              String(data.otp ?? ''),
      expiresInMinutes: Number(data.expiresInMinutes ?? 10),
      appName:          String(data.appName ?? 'Superstore'),
    },
  );
}
